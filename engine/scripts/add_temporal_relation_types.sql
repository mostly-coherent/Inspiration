-- Migration: Add temporal chain relation types to relation_type enum
-- Purpose: Phase 1b - Support temporal chain tracking (FOLLOWED_BY, REFERENCED_BY, OBSOLETES)
-- Date: 2026-01-18

-- Add temporal chain relation types to relation_type enum
-- Note: PostgreSQL doesn't support ALTER TYPE ... ADD VALUE in a transaction,
-- so we need to use DO block with exception handling

DO $$ 
BEGIN
    -- Try to add each value to enum
    ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'FOLLOWED_BY';
EXCEPTION
    WHEN duplicate_object THEN
        -- Value already exists, ignore
        NULL;
END $$;

DO $$ 
BEGIN
    ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'REFERENCED_BY';
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

DO $$ 
BEGIN
    ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'OBSOLETES';
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- Verify the enum was updated
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'relation_type')
ORDER BY enumsortorder;
