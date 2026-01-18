-- Migration: Add source_message_id column to kg_relations
-- Purpose: Match code expectation (index_lenny_kg_parallel.py uses source_message_id)
-- Date: 2026-01-16
-- Part of: KG Hardening - Schema Fix

-- ============================================================================
-- Add source_message_id column
-- ============================================================================

-- Add column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'kg_relations' 
        AND column_name = 'source_message_id'
    ) THEN
        ALTER TABLE kg_relations 
        ADD COLUMN source_message_id TEXT;
        
        -- Populate from existing message_id if it exists
        UPDATE kg_relations 
        SET source_message_id = message_id 
        WHERE message_id IS NOT NULL AND source_message_id IS NULL;
        
        RAISE NOTICE 'Added source_message_id column to kg_relations';
    ELSE
        RAISE NOTICE 'Column source_message_id already exists';
    END IF;
END $$;

-- ============================================================================
-- Update unique constraint to include source_message_id
-- ============================================================================

-- Drop old constraint if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'kg_relations_source_target_type_message_key'
    ) THEN
        ALTER TABLE kg_relations 
        DROP CONSTRAINT kg_relations_source_target_type_message_key;
    END IF;
END $$;

-- Add new constraint with source_message_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'kg_relations_source_target_type_source_message_key'
    ) THEN
        ALTER TABLE kg_relations 
        ADD CONSTRAINT kg_relations_source_target_type_source_message_key 
        UNIQUE(source_entity_id, target_entity_id, relation_type, source_message_id);
        
        RAISE NOTICE 'Updated unique constraint to use source_message_id';
    END IF;
END $$;

-- ============================================================================
-- Add index for source_message_id lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_kg_relations_source_message_id 
    ON kg_relations(source_message_id);

-- ============================================================================
-- Verification
-- ============================================================================

-- Verify column exists
DO $$
DECLARE
    col_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'kg_relations' 
        AND column_name = 'source_message_id'
    ) INTO col_exists;
    
    IF col_exists THEN
        RAISE NOTICE '✅ Migration complete: source_message_id column added';
    ELSE
        RAISE EXCEPTION '❌ Migration failed: source_message_id column not found';
    END IF;
END $$;
