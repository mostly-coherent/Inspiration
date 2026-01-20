-- Fix Embedding Index and Statement Timeout
-- Run this in Supabase SQL Editor to fix embedding-based query timeouts
--
-- Problem: Embedding similarity searches timeout with 14,894+ entities
-- Root cause: HNSW index may not be built or needs rebuilding
--
-- Date: 2026-01-18

-- ============================================================================
-- Step 1: Check current index status
-- ============================================================================

-- First, let's see what indexes exist on kg_entities
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'kg_entities';

-- Check if HNSW index exists (with correct column reference)
SELECT
    i.indexname,
    pg_size_pretty(pg_relation_size(c.oid)) as index_size
FROM pg_indexes i
JOIN pg_class c ON c.relname = i.indexname
WHERE i.tablename = 'kg_entities'
AND i.indexdef LIKE '%hnsw%';

-- ============================================================================
-- Step 2: Rebuild the HNSW index (if it exists but isn't working)
-- ============================================================================

-- Drop the existing HNSW index
DROP INDEX IF EXISTS idx_kg_entities_embedding;

-- Recreate with better parameters for 15k+ entities
-- m = 32 (more connections, better recall)
-- ef_construction = 128 (better quality index)
CREATE INDEX idx_kg_entities_embedding ON kg_entities
USING hnsw (embedding vector_cosine_ops)
WITH (m = 32, ef_construction = 128);

-- ============================================================================
-- Step 3: Verify the index was created
-- ============================================================================

SELECT
    i.indexname,
    pg_size_pretty(pg_relation_size(c.oid)) as index_size
FROM pg_indexes i
JOIN pg_class c ON c.relname = i.indexname
WHERE i.tablename = 'kg_entities'
AND i.indexdef LIKE '%hnsw%';

-- ============================================================================
-- Step 4: Test the embedding search
-- ============================================================================

-- This should now work without timeout
-- (You'll need to pass an actual embedding vector)
--
-- SELECT * FROM search_kg_entities(
--     '[0.1, 0.2, ...]'::vector(1536),
--     0.7,
--     5
-- );

-- ============================================================================
-- Step 5: Increase statement timeout for this session (optional)
-- ============================================================================

-- Increase statement timeout to 30 seconds for complex queries
-- Note: This only affects the current session
-- SET statement_timeout = '30s';

-- To make it permanent for a role, use:
-- ALTER ROLE authenticator SET statement_timeout = '30s';

-- ============================================================================
-- Step 6: Add index on kg_relations for faster joins (if missing)
-- ============================================================================

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_kg_relations_source_type
ON kg_relations(source_entity_id, relation_type);

CREATE INDEX IF NOT EXISTS idx_kg_relations_target_type
ON kg_relations(target_entity_id, relation_type);

-- ============================================================================
-- Success message
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Embedding index rebuilt successfully!';
    RAISE NOTICE 'Run a test query to verify: SELECT * FROM search_kg_entities(...)';
END $$;
