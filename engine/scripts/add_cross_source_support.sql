-- Cross-Source Knowledge Graph Support (XKG-5)
-- Adds columns to distinguish user entities vs expert (Lenny) entities
-- Run this in Supabase SQL Editor AFTER init_knowledge_graph.sql
--
-- Purpose:
--   - source_type: Distinguishes 'user' | 'expert' | 'both' (merged entities)
--   - source_breakdown: Tracks mention counts per source (e.g., {"user": 5, "lenny": 12})
--
-- Usage:
--   1. Run this migration in Supabase SQL Editor
--   2. Update index_lenny_kg.py to set source_type='expert' 
--   3. Update index_entities.py to set source_type='user'
--   4. Existing entities will default to source_type='user'

-- ============================================================================
-- Add source_type column
-- ============================================================================

-- Add column if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'kg_entities' AND column_name = 'source_type'
    ) THEN
        ALTER TABLE kg_entities ADD COLUMN source_type TEXT NOT NULL DEFAULT 'user';
        
        -- Add check constraint
        ALTER TABLE kg_entities ADD CONSTRAINT kg_entities_source_type_check 
        CHECK (source_type IN ('user', 'expert', 'both'));
        
        RAISE NOTICE 'Added source_type column to kg_entities';
    ELSE
        RAISE NOTICE 'source_type column already exists';
    END IF;
END $$;

-- Create index for source_type (used for filtering)
CREATE INDEX IF NOT EXISTS idx_kg_entities_source_type ON kg_entities(source_type);

-- ============================================================================
-- Add source_breakdown column
-- ============================================================================

-- Add column if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'kg_entities' AND column_name = 'source_breakdown'
    ) THEN
        ALTER TABLE kg_entities ADD COLUMN source_breakdown JSONB DEFAULT '{"user": 0, "lenny": 0}'::JSONB;
        
        RAISE NOTICE 'Added source_breakdown column to kg_entities';
    ELSE
        RAISE NOTICE 'source_breakdown column already exists';
    END IF;
END $$;

-- Create GIN index for source_breakdown (used for JSONB queries)
CREATE INDEX IF NOT EXISTS idx_kg_entities_source_breakdown ON kg_entities USING gin(source_breakdown);

-- ============================================================================
-- Update existing entities
-- ============================================================================

-- Set source_breakdown for existing entities (user only)
UPDATE kg_entities 
SET source_breakdown = jsonb_build_object('user', mention_count, 'lenny', 0)
WHERE source_breakdown = '{"user": 0, "lenny": 0}'::JSONB;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to update source_breakdown when merging entities across sources
CREATE OR REPLACE FUNCTION update_entity_source_breakdown(
    p_entity_id TEXT,
    p_source TEXT,
    p_increment INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
    UPDATE kg_entities
    SET 
        source_breakdown = jsonb_set(
            COALESCE(source_breakdown, '{}'::jsonb),
            ARRAY[p_source],
            to_jsonb(COALESCE((source_breakdown->p_source)::integer, 0) + p_increment)
        ),
        source_type = CASE
            WHEN (source_breakdown->>'user')::integer > 0 AND (source_breakdown->>'lenny')::integer > 0 THEN 'both'
            WHEN (source_breakdown->>'lenny')::integer > 0 THEN 'expert'
            ELSE 'user'
        END
    WHERE id = p_entity_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get entities by source
CREATE OR REPLACE FUNCTION get_entities_by_source(
    p_source_type TEXT DEFAULT NULL,
    p_min_mentions INTEGER DEFAULT 1,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id TEXT,
    canonical_name TEXT,
    entity_type entity_type,
    source_type TEXT,
    mention_count INTEGER,
    user_mentions INTEGER,
    lenny_mentions INTEGER,
    first_seen TIMESTAMP WITH TIME ZONE,
    last_seen TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.canonical_name,
        e.entity_type,
        e.source_type,
        e.mention_count,
        COALESCE((e.source_breakdown->>'user')::integer, 0) AS user_mentions,
        COALESCE((e.source_breakdown->>'lenny')::integer, 0) AS lenny_mentions,
        e.first_seen,
        e.last_seen
    FROM kg_entities e
    WHERE 
        (p_source_type IS NULL OR e.source_type = p_source_type)
        AND e.mention_count >= p_min_mentions
    ORDER BY e.mention_count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Count entities by source type
DO $$ 
DECLARE
    user_count INTEGER;
    expert_count INTEGER;
    both_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM kg_entities WHERE source_type = 'user';
    SELECT COUNT(*) INTO expert_count FROM kg_entities WHERE source_type = 'expert';
    SELECT COUNT(*) INTO both_count FROM kg_entities WHERE source_type = 'both';
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Cross-Source Support Migration Complete';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Entities by source:';
    RAISE NOTICE '  User:   %', user_count;
    RAISE NOTICE '  Expert: %', expert_count;
    RAISE NOTICE '  Both:   %', both_count;
    RAISE NOTICE '  Total:  %', user_count + expert_count + both_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Update index_lenny_kg.py to set source_type="expert"';
    RAISE NOTICE '  2. Update index_entities.py to set source_type="user"';
    RAISE NOTICE '  3. Run indexing scripts to populate data';
    RAISE NOTICE '========================================';
END $$;
