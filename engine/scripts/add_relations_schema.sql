-- Knowledge Graph Relations Schema
-- Run this in Supabase SQL Editor AFTER init_knowledge_graph.sql
--
-- Adds: kg_relations table for entity relationships

-- ============================================================================
-- Create Relation Type Enum
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE relation_type AS ENUM (
        'SOLVES',         -- tool/pattern SOLVES problem
        'CAUSES',         -- problem CAUSES problem (cascade)
        'ENABLES',        -- pattern/tool ENABLES capability
        'PART_OF',        -- entity is component of larger entity
        'USED_WITH',      -- entities commonly used together
        'ALTERNATIVE_TO', -- entities serve similar purpose
        'REQUIRES',       -- entity depends on another
        'IMPLEMENTS',     -- pattern/tool IMPLEMENTS concept
        'MENTIONED_BY'    -- entity mentioned by person
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- kg_relations Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_relations (
    id TEXT PRIMARY KEY,
    source_entity_id TEXT NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    target_entity_id TEXT NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    relation_type relation_type NOT NULL,
    
    -- Evidence & confidence
    evidence_snippet TEXT,
    message_id TEXT,
    message_timestamp BIGINT,
    confidence FLOAT NOT NULL DEFAULT 1.0,
    
    -- Frequency
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    
    -- Timestamps
    first_seen TIMESTAMP WITH TIME ZONE,
    last_seen TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate relations per message
    UNIQUE(source_entity_id, target_entity_id, relation_type, message_id)
);

-- Indexes for kg_relations
CREATE INDEX IF NOT EXISTS idx_kg_relations_source ON kg_relations(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_relations_target ON kg_relations(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_relations_type ON kg_relations(relation_type);
CREATE INDEX IF NOT EXISTS idx_kg_relations_timestamp ON kg_relations(message_timestamp DESC);

-- Trigger for updated_at
CREATE TRIGGER update_kg_relations_updated_at
    BEFORE UPDATE ON kg_relations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Enable Row Level Security (RLS)
-- ============================================================================

ALTER TABLE kg_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read kg_relations"
ON kg_relations FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert kg_relations"
ON kg_relations FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update kg_relations"
ON kg_relations FOR UPDATE TO anon WITH CHECK (true);

CREATE POLICY "Allow anon delete kg_relations"
ON kg_relations FOR DELETE TO anon USING (true);

CREATE POLICY "Allow authenticated read kg_relations"
ON kg_relations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert kg_relations"
ON kg_relations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update kg_relations"
ON kg_relations FOR UPDATE TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated delete kg_relations"
ON kg_relations FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- RPC Functions for Relations
-- ============================================================================

-- Get relations stats
CREATE OR REPLACE FUNCTION get_kg_relations_stats()
RETURNS json AS $$
DECLARE
    result json;
BEGIN
    SELECT json_build_object(
        'total_relations', (SELECT COUNT(*) FROM kg_relations),
        'by_type', (
            SELECT json_object_agg(relation_type::text, cnt)
            FROM (
                SELECT relation_type, COUNT(*) as cnt
                FROM kg_relations
                GROUP BY relation_type
            ) sub
        )
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Get relations for an entity (both incoming and outgoing)
CREATE OR REPLACE FUNCTION get_entity_relations(p_entity_id TEXT)
RETURNS json AS $$
DECLARE
    result json;
BEGIN
    SELECT json_build_object(
        'outgoing', (
            SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
            FROM (
                SELECT 
                    rel.id,
                    rel.target_entity_id,
                    e.canonical_name as target_name,
                    e.entity_type as target_type,
                    rel.relation_type,
                    rel.evidence_snippet,
                    rel.confidence,
                    rel.occurrence_count
                FROM kg_relations rel
                JOIN kg_entities e ON rel.target_entity_id = e.id
                WHERE rel.source_entity_id = p_entity_id
                ORDER BY rel.occurrence_count DESC
                LIMIT 20
            ) r
        ),
        'incoming', (
            SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
            FROM (
                SELECT 
                    rel.id,
                    rel.source_entity_id,
                    e.canonical_name as source_name,
                    e.entity_type as source_type,
                    rel.relation_type,
                    rel.evidence_snippet,
                    rel.confidence,
                    rel.occurrence_count
                FROM kg_relations rel
                JOIN kg_entities e ON rel.source_entity_id = e.id
                WHERE rel.target_entity_id = p_entity_id
                ORDER BY rel.occurrence_count DESC
                LIMIT 20
            ) r
        )
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_kg_relations_stats() TO anon;
GRANT EXECUTE ON FUNCTION get_kg_relations_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_entity_relations(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_entity_relations(TEXT) TO authenticated;

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Knowledge Graph Relations schema created successfully!';
    RAISE NOTICE 'Tables: kg_relations';
    RAISE NOTICE 'Functions: get_kg_relations_stats(), get_entity_relations(entity_id)';
END $$;
