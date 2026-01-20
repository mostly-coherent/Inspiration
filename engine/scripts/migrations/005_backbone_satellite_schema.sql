-- Migration: Backbone & Satellite Architecture Schema
-- Purpose: Enable Episode → Conversation linking for dual-layered graph visualization
-- Date: 2026-01-19
-- Part of: Backbone & Satellite Architecture (v2.0+)
--
-- IMPORTANT: This migration must be run in THREE STEPS due to PostgreSQL enum limitations:
-- Step 1: Run this FIRST (in a separate query/transaction):
--   ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'episode';
-- Step 2: Run this SECOND (in a separate query/transaction):
--   ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'REFERENCES_EPISODE';
-- Step 3: Then run the rest of this migration script below (from line 23 onwards)
--
-- If you get errors about enum values, you need to run Steps 1 and 2 first.

-- ============================================================================
-- 1. Create Episode Entities (Convert metadata to entities)
-- ============================================================================

-- Add episode entity type to enum (if not exists)
-- NOTE: This line may fail if run in the same transaction as the INSERT below.
-- If it fails, run "ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'episode';" separately first,
-- wait for it to complete, then run the rest of this script.
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'episode';

-- Create episode entities from metadata (one-time migration)
-- Episodes become stable "backbone" nodes
INSERT INTO kg_entities (id, canonical_name, entity_type, description, source_type, mention_count, confidence)
SELECT 
    'episode-' || episode_slug as id,
    COALESCE(episode_title, guest_name || ' Episode') as canonical_name,
    'episode'::entity_type as entity_type,
    COALESCE(description, 'Episode with ' || guest_name) as description,
    'expert' as source_type,
    0 as mention_count,  -- Will be updated by mention counting
    1.0 as confidence
FROM kg_episode_metadata
WHERE NOT EXISTS (
    SELECT 1 FROM kg_entities WHERE id = 'episode-' || episode_slug
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. Create Conversation Entities Table (if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_conversations (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL UNIQUE,  -- Original chat_id from Cursor/Claude Code
    source_type TEXT NOT NULL DEFAULT 'user',  -- 'user' or 'expert'
    
    -- Temporal data (month/day granularity)
    date_month DATE NOT NULL,  -- First day of month (YYYY-MM-01)
    date_day DATE,  -- Actual day (YYYY-MM-DD), NULL if only month known
    
    -- Summary data
    message_count INTEGER DEFAULT 0,
    entity_count INTEGER DEFAULT 0,
    relation_count INTEGER DEFAULT 0,
    
    -- Synthesis (for summarization nodes)
    synthesis_text TEXT,  -- LLM-generated summary of conversation intent
    synthesis_embedding extensions.vector(1536),  -- Embedding of synthesis
    
    -- Timestamps
    first_message_timestamp BIGINT NOT NULL,
    last_message_timestamp BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for kg_conversations
CREATE INDEX IF NOT EXISTS idx_kg_conversations_date_month ON kg_conversations(date_month DESC);
CREATE INDEX IF NOT EXISTS idx_kg_conversations_date_day ON kg_conversations(date_day DESC);
CREATE INDEX IF NOT EXISTS idx_kg_conversations_source ON kg_conversations(source_type);
CREATE INDEX IF NOT EXISTS idx_kg_conversations_timestamp ON kg_conversations(first_message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_kg_conversations_embedding ON kg_conversations 
USING hnsw (synthesis_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
WHERE synthesis_embedding IS NOT NULL;

-- ============================================================================
-- 3. Add Episode → Conversation Relation Type
-- ============================================================================

-- IMPORTANT: Add REFERENCES_EPISODE to relation_type enum FIRST (in a separate query):
--   ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'REFERENCES_EPISODE';
-- Then run the rest of this section.

-- Add new relation types for Backbone & Satellite architecture
-- These will be used in kg_relations.relation_type
-- Note: relation_type is an ENUM, so we must add new values before using them

-- Add REFERENCES_EPISODE to relation_type enum (if not exists)
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'REFERENCES_EPISODE';

-- Common relation types (for future use):
-- - "REFERENCES_EPISODE" - Conversation mentions/discusses an episode (added above)
-- - "DISCUSSES_CONCEPT" - Conversation discusses a concept from an episode (future)
-- - "SEMANTIC_MATCH" - Semantic similarity between user conversation and episode concept (future)

-- ============================================================================
-- 4. Helper Function: Extract Date from Timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION extract_date_from_timestamp(ts BIGINT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Convert Unix milliseconds to DATE (month granularity)
    RETURN DATE_TRUNC('month', TO_TIMESTAMP(ts / 1000))::DATE;
END;
$$;

CREATE OR REPLACE FUNCTION extract_day_from_timestamp(ts BIGINT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Convert Unix milliseconds to DATE (day granularity)
    RETURN TO_TIMESTAMP(ts / 1000)::DATE;
END;
$$;

-- ============================================================================
-- 5. Populate Conversation Entities from Existing Mentions
-- ============================================================================

-- Create conversation entities from kg_entity_mentions
-- Groups mentions by message_id (conversation_id) and extracts date info
INSERT INTO kg_conversations (
    id,
    conversation_id,
    source_type,
    date_month,
    date_day,
    first_message_timestamp,
    last_message_timestamp,
    message_count
)
SELECT 
    'conv-' || message_id as id,
    message_id as conversation_id,
    CASE 
        WHEN message_id LIKE 'lenny-%' THEN 'expert'
        ELSE 'user'
    END as source_type,
    extract_date_from_timestamp(MIN(message_timestamp)) as date_month,
    extract_day_from_timestamp(MIN(message_timestamp)) as date_day,
    MIN(message_timestamp) as first_message_timestamp,
    MAX(message_timestamp) as last_message_timestamp,
    COUNT(DISTINCT id) as message_count  -- Approximate message count
FROM kg_entity_mentions
WHERE NOT EXISTS (
    SELECT 1 FROM kg_conversations WHERE conversation_id = kg_entity_mentions.message_id
)
GROUP BY message_id
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. Create Conversation Entities in kg_entities
-- ============================================================================

-- Create conversation entities in kg_entities table (required for foreign key constraints)
-- Conversations are stored as 'project' type entities (matching existing pattern)
INSERT INTO kg_entities (id, canonical_name, entity_type, description, source_type, mention_count, confidence)
SELECT 
    'conv-' || message_id as id,
    'Conversation: ' || message_id as canonical_name,
    'project'::entity_type as entity_type,  -- Use 'project' type for conversations
    'AI conversation' as description,
    CASE 
        WHEN message_id LIKE 'lenny-%' THEN 'expert'
        ELSE 'user'
    END as source_type,
    0 as mention_count,
    1.0 as confidence
FROM kg_entity_mentions
WHERE NOT EXISTS (
    SELECT 1 FROM kg_entities WHERE id = 'conv-' || message_id
)
GROUP BY message_id
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 7. Create Episode → Conversation Relations
-- ============================================================================

-- Link conversations to episodes they reference
-- For Lenny conversations: message_id pattern "lenny-{episode_slug}-{number}"
-- Extract episode_slug and create relation
INSERT INTO kg_relations (
    id,
    source_entity_id,
    target_entity_id,
    relation_type,
    evidence_snippet,
    source_message_id,
    occurrence_count
)
SELECT 
    gen_random_uuid()::TEXT as id,
    'episode-' || substring(m.message_id from 'lenny-(.+?)-\d+$') as source_entity_id,
    'conv-' || m.message_id as target_entity_id,
    'REFERENCES_EPISODE' as relation_type,
    'Conversation from episode' as evidence_snippet,
    m.message_id as source_message_id,
    1 as occurrence_count
FROM kg_entity_mentions m
WHERE m.message_id LIKE 'lenny-%'
    AND substring(m.message_id from 'lenny-(.+?)-\d+$') IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM kg_entities 
        WHERE id = 'episode-' || substring(m.message_id from 'lenny-(.+?)-\d+$')
    )
    AND EXISTS (
        SELECT 1 FROM kg_entities 
        WHERE id = 'conv-' || m.message_id
    )
    AND NOT EXISTS (
        SELECT 1 FROM kg_relations 
        WHERE source_entity_id = 'episode-' || substring(m.message_id from 'lenny-(.+?)-\d+$')
        AND target_entity_id = 'conv-' || m.message_id
        AND relation_type = 'REFERENCES_EPISODE'
    )
GROUP BY m.message_id, substring(m.message_id from 'lenny-(.+?)-\d+$')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7. RPC Function: Get Conversations by Date Range
-- ============================================================================

CREATE OR REPLACE FUNCTION get_conversations_by_date_range(
    p_start_date DATE,
    p_end_date DATE,
    p_source_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id TEXT,
    conversation_id TEXT,
    source_type TEXT,
    date_month DATE,
    date_day DATE,
    message_count INTEGER,
    entity_count INTEGER,
    relation_count INTEGER,
    synthesis_text TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.conversation_id,
        c.source_type,
        c.date_month,
        c.date_day,
        c.message_count,
        c.entity_count,
        c.relation_count,
        c.synthesis_text
    FROM kg_conversations c
    WHERE 
        (c.date_day BETWEEN p_start_date AND p_end_date 
         OR (c.date_day IS NULL AND c.date_month BETWEEN p_start_date AND p_end_date))
        AND (p_source_type IS NULL OR c.source_type = p_source_type)
    ORDER BY c.first_message_timestamp DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_conversations_by_date_range(DATE, DATE, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_conversations_by_date_range(DATE, DATE, TEXT) TO authenticated;

-- ============================================================================
-- 8. RPC Function: Get Episodes Referenced by Conversation
-- ============================================================================

CREATE OR REPLACE FUNCTION get_episodes_for_conversation(p_conversation_id TEXT)
RETURNS TABLE (
    episode_id TEXT,
    episode_title TEXT,
    guest_name TEXT,
    youtube_url TEXT,
    relation_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id as episode_id,
        em.episode_title,
        em.guest_name,
        em.youtube_url,
        r.relation_type
    FROM kg_relations r
    JOIN kg_entities e ON e.id = r.source_entity_id
    JOIN kg_episode_metadata em ON em.episode_slug = substring(e.id from 'episode-(.+)$')
    WHERE r.target_entity_id = 'conv-' || p_conversation_id
        AND r.relation_type = 'REFERENCES_EPISODE'
        AND e.entity_type = 'episode';
END;
$$;

GRANT EXECUTE ON FUNCTION get_episodes_for_conversation(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_episodes_for_conversation(TEXT) TO authenticated;

-- ============================================================================
-- 9. Row Level Security (RLS)
-- ============================================================================

ALTER TABLE kg_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read kg_conversations"
    ON kg_conversations FOR SELECT TO anon USING (true);

CREATE POLICY "Allow authenticated read kg_conversations"
    ON kg_conversations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow anon insert kg_conversations"
    ON kg_conversations FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow authenticated insert kg_conversations"
    ON kg_conversations FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- 10. Trigger for updated_at
-- ============================================================================

CREATE TRIGGER update_kg_conversations_updated_at
    BEFORE UPDATE ON kg_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- After running this migration, verify with:
-- 
-- 1. Check episode entities created:
--    SELECT COUNT(*) FROM kg_entities WHERE entity_type = 'episode';
--
-- 2. Check conversation entities created:
--    SELECT COUNT(*) FROM kg_conversations;
--
-- 3. Check episode → conversation relations:
--    SELECT COUNT(*) FROM kg_relations WHERE relation_type = 'REFERENCES_EPISODE';
--
-- 4. Test date range function:
--    SELECT * FROM get_conversations_by_date_range('2025-01-01', '2025-12-31', 'user');
--
-- 5. Test episode lookup:
--    SELECT * FROM get_episodes_for_conversation('lenny-ada-chen-rekhi-142');

-- ============================================================================
-- Rollback (if needed)
-- ============================================================================

-- To rollback this migration:
-- 
-- DROP FUNCTION IF EXISTS get_episodes_for_conversation(TEXT);
-- DROP FUNCTION IF EXISTS get_conversations_by_date_range(DATE, DATE, TEXT);
-- DROP FUNCTION IF EXISTS extract_day_from_timestamp(BIGINT);
-- DROP FUNCTION IF EXISTS extract_date_from_timestamp(BIGINT);
-- DROP TRIGGER IF EXISTS update_kg_conversations_updated_at ON kg_conversations;
-- DROP TABLE IF EXISTS kg_conversations CASCADE;
-- DELETE FROM kg_entities WHERE entity_type = 'episode';
-- (Note: Cannot remove 'episode' from enum, but can delete entities)
