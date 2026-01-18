-- Knowledge Graph Schema for Inspiration
-- Run this in Supabase SQL Editor AFTER init_vector_db.sql
-- 
-- Tables:
--   kg_entities - Extracted entities (tools, patterns, problems, concepts, etc.)
--   kg_entity_mentions - Links entities to source messages
--   kg_entity_items - Links entities to Library items
--   kg_user_corrections - User feedback for improving extraction

-- ============================================================================
-- Create Entity Type Enum
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE entity_type AS ENUM (
        'tool',       -- Technologies, frameworks, libraries (React, Supabase, Prisma)
        'pattern',    -- Design patterns, architectural patterns (caching, retry logic)
        'problem',    -- Issues, bugs, challenges (auth timeout, race condition)
        'concept',    -- Abstract ideas, principles (DRY, composition over inheritance)
        'person',     -- People mentioned (Lenny, Dan Abramov, team members)
        'project',    -- Projects, codebases, repos (Inspiration, dad-aura)
        'workflow'    -- Processes, methodologies (TDD, code review, pair programming)
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- kg_entities Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_entities (
    id TEXT PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    entity_type entity_type NOT NULL,
    aliases TEXT[] DEFAULT ARRAY[]::TEXT[],
    description TEXT,
    embedding extensions.vector(1536),
    
    -- Frequency & temporal data
    mention_count INTEGER NOT NULL DEFAULT 0,
    first_seen TIMESTAMP WITH TIME ZONE,
    last_seen TIMESTAMP WITH TIME ZONE,
    
    -- Confidence & provenance
    confidence FLOAT NOT NULL DEFAULT 1.0,
    source TEXT NOT NULL DEFAULT 'llm',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for kg_entities
CREATE INDEX IF NOT EXISTS idx_kg_entities_type ON kg_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_kg_entities_mention_count ON kg_entities(mention_count DESC);
CREATE INDEX IF NOT EXISTS idx_kg_entities_last_seen ON kg_entities(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_kg_entities_canonical_name ON kg_entities(LOWER(canonical_name));
CREATE INDEX IF NOT EXISTS idx_kg_entities_embedding ON kg_entities 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Trigger for updated_at
CREATE TRIGGER update_kg_entities_updated_at
    BEFORE UPDATE ON kg_entities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- kg_entity_mentions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_entity_mentions (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    
    -- Context
    context_snippet TEXT NOT NULL,
    mention_start INTEGER,
    mention_end INTEGER,
    
    -- Timestamps
    message_timestamp BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for kg_entity_mentions
CREATE INDEX IF NOT EXISTS idx_kg_mentions_entity ON kg_entity_mentions(entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_mentions_message ON kg_entity_mentions(message_id);
CREATE INDEX IF NOT EXISTS idx_kg_mentions_timestamp ON kg_entity_mentions(message_timestamp DESC);

-- ============================================================================
-- kg_entity_items Table (Links entities to Library items)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_entity_items (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    relevance_score FLOAT NOT NULL DEFAULT 1.0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate links
    UNIQUE(entity_id, item_id)
);

-- Indexes for kg_entity_items
CREATE INDEX IF NOT EXISTS idx_kg_entity_items_entity ON kg_entity_items(entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_entity_items_item ON kg_entity_items(item_id);

-- ============================================================================
-- kg_user_corrections Table (Learning from user feedback)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_user_corrections (
    id TEXT PRIMARY KEY,
    correction_type TEXT NOT NULL,
    target_entity_id TEXT,
    
    -- Correction data
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for kg_user_corrections
CREATE INDEX IF NOT EXISTS idx_kg_corrections_entity ON kg_user_corrections(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_corrections_type ON kg_user_corrections(correction_type);

-- ============================================================================
-- Enable Row Level Security (RLS)
-- ============================================================================

-- kg_entities RLS
ALTER TABLE kg_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read kg_entities"
ON kg_entities FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert kg_entities"
ON kg_entities FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update kg_entities"
ON kg_entities FOR UPDATE TO anon WITH CHECK (true);

CREATE POLICY "Allow anon delete kg_entities"
ON kg_entities FOR DELETE TO anon USING (true);

CREATE POLICY "Allow authenticated read kg_entities"
ON kg_entities FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert kg_entities"
ON kg_entities FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update kg_entities"
ON kg_entities FOR UPDATE TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated delete kg_entities"
ON kg_entities FOR DELETE TO authenticated USING (true);

-- kg_entity_mentions RLS
ALTER TABLE kg_entity_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read kg_entity_mentions"
ON kg_entity_mentions FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert kg_entity_mentions"
ON kg_entity_mentions FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon delete kg_entity_mentions"
ON kg_entity_mentions FOR DELETE TO anon USING (true);

CREATE POLICY "Allow authenticated read kg_entity_mentions"
ON kg_entity_mentions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert kg_entity_mentions"
ON kg_entity_mentions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated delete kg_entity_mentions"
ON kg_entity_mentions FOR DELETE TO authenticated USING (true);

-- kg_entity_items RLS
ALTER TABLE kg_entity_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read kg_entity_items"
ON kg_entity_items FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert kg_entity_items"
ON kg_entity_items FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon delete kg_entity_items"
ON kg_entity_items FOR DELETE TO anon USING (true);

CREATE POLICY "Allow authenticated read kg_entity_items"
ON kg_entity_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert kg_entity_items"
ON kg_entity_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated delete kg_entity_items"
ON kg_entity_items FOR DELETE TO authenticated USING (true);

-- kg_user_corrections RLS
ALTER TABLE kg_user_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read kg_user_corrections"
ON kg_user_corrections FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert kg_user_corrections"
ON kg_user_corrections FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow authenticated read kg_user_corrections"
ON kg_user_corrections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert kg_user_corrections"
ON kg_user_corrections FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function: Get Knowledge Graph stats
CREATE OR REPLACE FUNCTION get_kg_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'totalEntities', (SELECT COUNT(*) FROM kg_entities),
        'totalMentions', (SELECT COUNT(*) FROM kg_entity_mentions),
        'byType', (
            SELECT COALESCE(json_object_agg(entity_type::text, count), '{}'::json)
            FROM (
                SELECT entity_type, COUNT(*)::int as count
                FROM kg_entities
                GROUP BY entity_type
            ) sub
        ),
        'indexed', (SELECT COUNT(*) > 0 FROM kg_entities)
    ) INTO result;
    
    RETURN result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_kg_stats() TO anon;
GRANT EXECUTE ON FUNCTION get_kg_stats() TO authenticated;

-- Function: Search entities by embedding similarity
CREATE OR REPLACE FUNCTION search_kg_entities(
    query_embedding extensions.vector(1536),
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 10,
    type_filter entity_type DEFAULT NULL
)
RETURNS TABLE (
    id text,
    canonical_name text,
    entity_type entity_type,
    aliases text[],
    mention_count int,
    similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.canonical_name,
        e.entity_type,
        e.aliases,
        e.mention_count,
        1 - (e.embedding <=> query_embedding) as similarity
    FROM kg_entities e
    WHERE
        (type_filter IS NULL OR e.entity_type = type_filter)
        AND e.embedding IS NOT NULL
        AND (1 - (e.embedding <=> query_embedding)) >= match_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION search_kg_entities(extensions.vector, float, int, entity_type) TO anon;
GRANT EXECUTE ON FUNCTION search_kg_entities(extensions.vector, float, int, entity_type) TO authenticated;

-- ============================================================================
-- Verification Query (run after setup)
-- ============================================================================

-- SELECT get_kg_stats();
-- Should return: {"totalEntities": 0, "totalMentions": 0, "byType": {}, "indexed": false}
