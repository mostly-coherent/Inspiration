-- Migration: Add "unknown" entity type to enum
-- Purpose: Support Phase 3 schema evolution (cluster "unknown" entities to discover new types)
-- Date: 2026-01-18

-- Add "unknown" to entity_type enum
-- Note: PostgreSQL doesn't support ALTER TYPE ... ADD VALUE in a transaction,
-- so we need to use DO block with exception handling

DO $$ 
BEGIN
    -- Try to add "unknown" value to enum
    ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'unknown';
EXCEPTION
    WHEN duplicate_object THEN
        -- Value already exists, ignore
        NULL;
    WHEN OTHERS THEN
        -- If enum doesn't exist or other error, create it with all values
        -- This handles edge case where enum might not exist yet
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_type') THEN
            CREATE TYPE entity_type AS ENUM (
                'tool',
                'pattern',
                'problem',
                'concept',
                'person',
                'project',
                'workflow',
                'unknown'
            );
        END IF;
END $$;

-- Verify the enum was updated
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'entity_type')
ORDER BY enumsortorder;
