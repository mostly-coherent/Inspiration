-- Migration: Add Source Tracking for Multi-KG Views
-- Purpose: Distinguish between User KG and Lenny's Podcast KG
-- Date: 2026-01-19
-- Part of: KG Quality Filter + Multi-Source Views

-- ============================================================================
-- Add source column to kg_entities
-- ============================================================================

-- Add source column if it doesn't exist
ALTER TABLE kg_entities ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'unknown';

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_kg_entities_source ON kg_entities(source);

-- ============================================================================
-- Add source column to kg_entity_mentions
-- ============================================================================

-- Add source column if it doesn't exist
ALTER TABLE kg_entity_mentions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'unknown';

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_kg_mentions_source ON kg_entity_mentions(source);

-- ============================================================================
-- Update existing data based on message_id patterns
-- ============================================================================

-- Lenny's podcast mentions have message_id like "lenny-brian-chesky-42"
UPDATE kg_entity_mentions
SET source = 'lenny'
WHERE source = 'unknown'
  AND message_id LIKE 'lenny-%';

-- User chat mentions have message_id like UUID or other formats
UPDATE kg_entity_mentions
SET source = 'user'
WHERE source = 'unknown'
  AND message_id NOT LIKE 'lenny-%';

-- ============================================================================
-- Update entities based on their mentions
-- ============================================================================

-- Entities with ONLY lenny mentions → source = 'lenny'
UPDATE kg_entities e
SET source = 'lenny'
WHERE e.source = 'unknown'
  AND EXISTS (
    SELECT 1 FROM kg_entity_mentions m
    WHERE m.entity_id = e.id AND m.source = 'lenny'
  )
  AND NOT EXISTS (
    SELECT 1 FROM kg_entity_mentions m
    WHERE m.entity_id = e.id AND m.source = 'user'
  );

-- Entities with ONLY user mentions → source = 'user'
UPDATE kg_entities e
SET source = 'user'
WHERE e.source = 'unknown'
  AND EXISTS (
    SELECT 1 FROM kg_entity_mentions m
    WHERE m.entity_id = e.id AND m.source = 'user'
  )
  AND NOT EXISTS (
    SELECT 1 FROM kg_entity_mentions m
    WHERE m.entity_id = e.id AND m.source = 'lenny'
  );

-- Entities with BOTH lenny AND user mentions → source = 'both'
UPDATE kg_entities e
SET source = 'both'
WHERE e.source = 'unknown'
  AND EXISTS (
    SELECT 1 FROM kg_entity_mentions m
    WHERE m.entity_id = e.id AND m.source = 'lenny'
  )
  AND EXISTS (
    SELECT 1 FROM kg_entity_mentions m
    WHERE m.entity_id = e.id AND m.source = 'user'
  );

-- ============================================================================
-- Add source to kg_relations as well
-- ============================================================================

ALTER TABLE kg_relations ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'unknown';
CREATE INDEX IF NOT EXISTS idx_kg_relations_source ON kg_relations(source);

-- Update relations based on message_id
UPDATE kg_relations
SET source = 'lenny'
WHERE source = 'unknown'
  AND message_id LIKE 'lenny-%';

UPDATE kg_relations
SET source = 'user'
WHERE source = 'unknown'
  AND message_id NOT LIKE 'lenny-%'
  AND message_id IS NOT NULL;

-- ============================================================================
-- Helper function to get entity stats by source
-- ============================================================================

CREATE OR REPLACE FUNCTION get_kg_stats_by_source()
RETURNS TABLE (
  source TEXT,
  entity_count BIGINT,
  mention_count BIGINT,
  relation_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(e.source, 'unknown') as source,
    COUNT(DISTINCT e.id)::BIGINT as entity_count,
    (SELECT COUNT(*) FROM kg_entity_mentions m WHERE m.source = e.source)::BIGINT as mention_count,
    (SELECT COUNT(*) FROM kg_relations r WHERE r.source = e.source)::BIGINT as relation_count
  FROM kg_entities e
  GROUP BY e.source;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_kg_stats_by_source() TO anon;
GRANT EXECUTE ON FUNCTION get_kg_stats_by_source() TO authenticated;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- After running this migration, verify with:
--
-- 1. Check source distribution for entities:
--    SELECT source, COUNT(*) FROM kg_entities GROUP BY source;
--
-- 2. Check source distribution for mentions:
--    SELECT source, COUNT(*) FROM kg_entity_mentions GROUP BY source;
--
-- 3. Test the stats function:
--    SELECT * FROM get_kg_stats_by_source();

-- ============================================================================
-- Rollback (if needed)
-- ============================================================================

-- To rollback this migration:
--
-- DROP FUNCTION IF EXISTS get_kg_stats_by_source();
-- DROP INDEX IF EXISTS idx_kg_entities_source;
-- DROP INDEX IF EXISTS idx_kg_mentions_source;
-- DROP INDEX IF EXISTS idx_kg_relations_source;
-- ALTER TABLE kg_entities DROP COLUMN IF EXISTS source;
-- ALTER TABLE kg_entity_mentions DROP COLUMN IF EXISTS source;
-- ALTER TABLE kg_relations DROP COLUMN IF EXISTS source;
