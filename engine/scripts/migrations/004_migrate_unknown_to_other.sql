-- Migration: Migrate existing 'unknown' entities to 'other' type
-- Run this in Supabase SQL Editor AFTER running 003_add_other_entity_type.sql
--
-- Purpose: Update all existing entities typed as 'unknown' to use 'other' instead
-- This aligns with the updated LLM extraction prompt that now uses 'other'

-- ============================================================================
-- Update existing entities from 'unknown' to 'other'
-- ============================================================================

-- First, check how many entities will be affected
-- SELECT COUNT(*) as unknown_count FROM kg_entities WHERE entity_type = 'unknown';

-- Perform the migration
UPDATE kg_entities
SET entity_type = 'other',
    updated_at = NOW()
WHERE entity_type = 'unknown';

-- ============================================================================
-- Verify the migration
-- ============================================================================

-- Check that no 'unknown' entities remain:
-- SELECT entity_type, COUNT(*) as count FROM kg_entities GROUP BY entity_type ORDER BY count DESC;

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
DECLARE
    migrated_count INTEGER;
BEGIN
    -- Get count of migrated entities
    SELECT COUNT(*) INTO migrated_count FROM kg_entities WHERE entity_type = 'other';

    RAISE NOTICE 'Migration complete!';
    RAISE NOTICE 'Total entities now typed as "other": %', migrated_count;
    RAISE NOTICE 'All "unknown" entities have been migrated to "other"';
END $$;
