-- ============================================================================
-- Migration 006: Semantic Match Schema (Phase 4)
-- ============================================================================
-- Purpose: Add SEMANTIC_MATCH relation type for embedding-based concept matching
--          between user conversations and episode concepts
--
-- Prerequisites:
--   1. Migration 005 (backbone_satellite_schema) must be complete
--   2. kg_conversations table must exist with synthesis_embedding column
--
-- Usage:
--   Run this migration in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. Add SEMANTIC_MATCH to relation_type enum
-- ============================================================================

-- IMPORTANT: Add SEMANTIC_MATCH to relation_type enum FIRST (in a separate query):
--   ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'SEMANTIC_MATCH';
-- Then run the rest of this migration script below

-- Add SEMANTIC_MATCH to relation_type enum (if not exists)
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'SEMANTIC_MATCH';

-- ============================================================================
-- 2. Create RPC function to find semantic matches
-- ============================================================================

-- Function to find conversations semantically similar to episodes
-- Uses cosine similarity on synthesis_embedding
CREATE OR REPLACE FUNCTION find_semantic_matches(
    p_conversation_id TEXT,
    p_similarity_threshold FLOAT DEFAULT 0.75,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    episode_id TEXT,
    episode_name TEXT,
    similarity FLOAT,
    conversation_id TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id AS episode_id,
        e.canonical_name AS episode_name,
        1 - (c.synthesis_embedding <=> e.embedding) AS similarity,
        c.conversation_id
    FROM kg_conversations c
    CROSS JOIN kg_entities e
    WHERE
        c.conversation_id = p_conversation_id
        AND c.synthesis_embedding IS NOT NULL
        AND e.entity_type = 'episode'
        AND e.embedding IS NOT NULL
        AND (1 - (c.synthesis_embedding <=> e.embedding)) >= p_similarity_threshold
    ORDER BY similarity DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION find_semantic_matches(TEXT, FLOAT, INT) TO authenticated, anon;

-- ============================================================================
-- 3. Create RPC function to batch-create semantic matches
-- ============================================================================

-- Function to create SEMANTIC_MATCH relations for all conversations above threshold
CREATE OR REPLACE FUNCTION create_semantic_matches(
    p_similarity_threshold FLOAT DEFAULT 0.75,
    p_limit_per_conversation INT DEFAULT 5
)
RETURNS TABLE (
    conversation_id TEXT,
    matches_created INT
) AS $$
DECLARE
    conv_record RECORD;
    match_record RECORD;
    matches_count INT;
BEGIN
    -- Loop through all conversations with synthesis embeddings
    FOR conv_record IN
        SELECT id, conversation_id, synthesis_embedding
        FROM kg_conversations
        WHERE synthesis_embedding IS NOT NULL
          AND source_type = 'user'  -- Only match user conversations to episodes
    LOOP
        matches_count := 0;
        
        -- Find semantic matches for this conversation
        FOR match_record IN
            SELECT
                e.id AS episode_id,
                1 - (conv_record.synthesis_embedding <=> e.embedding) AS similarity
            FROM kg_entities e
            WHERE
                e.entity_type = 'episode'
                AND e.embedding IS NOT NULL
                AND (1 - (conv_record.synthesis_embedding <=> e.embedding)) >= p_similarity_threshold
            ORDER BY similarity DESC
            LIMIT p_limit_per_conversation
        LOOP
            -- Create SEMANTIC_MATCH relation if it doesn't exist
            INSERT INTO kg_relations (
                source_entity_id,
                target_entity_id,
                relation_type,
                evidence_snippet,
                occurrence_count,
                confidence
            )
            VALUES (
                conv_record.id,  -- Conversation entity ID
                match_record.episode_id,  -- Episode entity ID
                'SEMANTIC_MATCH',
                'Semantic similarity: ' || ROUND(match_record.similarity::numeric, 3)::text,
                1,
                match_record.similarity  -- Use similarity as confidence
            )
            ON CONFLICT (source_entity_id, target_entity_id, relation_type) DO UPDATE
            SET
                confidence = GREATEST(kg_relations.confidence, match_record.similarity),
                updated_at = NOW();
            
            matches_count := matches_count + 1;
        END LOOP;
        
        -- Return result for this conversation
        RETURN QUERY SELECT conv_record.conversation_id, matches_count;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_semantic_matches(FLOAT, INT) TO authenticated, anon;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- 1. Check SEMANTIC_MATCH relations:
--    SELECT COUNT(*) FROM kg_relations WHERE relation_type = 'SEMANTIC_MATCH';

-- 2. Check semantic matches for a specific conversation:
--    SELECT * FROM find_semantic_matches('your-conversation-id', 0.75, 10);

-- 3. Create semantic matches for all conversations:
--    SELECT * FROM create_semantic_matches(0.75, 5);
