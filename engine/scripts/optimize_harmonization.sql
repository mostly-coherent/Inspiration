-- Optimize Harmonization: Add vector column for fast similarity search
-- Run this in Supabase SQL Editor
-- 
-- PROBLEM: Current harmonization regenerates embeddings for every existing item
-- SOLUTION: Store embeddings once, use for all future comparisons

-- ============================================================================
-- Step 1: Enable pgvector extension (if not already enabled)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Step 2: Add vector column for embeddings
-- ============================================================================

-- Drop old JSONB column if exists (we're replacing with proper vector type)
ALTER TABLE library_items DROP COLUMN IF EXISTS embedding;

-- Add vector column (1536 dimensions for OpenAI text-embedding-3-small)
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for fast similarity search (IVFFlat is good for ~1000-100k items)
-- Using cosine distance for semantic similarity
CREATE INDEX IF NOT EXISTS idx_library_items_embedding 
ON library_items USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================================================
-- Step 3: Create RPC function for similarity search
-- ============================================================================

-- Function to find similar items using vector similarity
CREATE OR REPLACE FUNCTION search_similar_library_items(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.85,
    match_count int DEFAULT 10,
    filter_item_type text DEFAULT NULL
)
RETURNS TABLE (
    id text,
    title text,
    description text,
    item_type text,
    occurrence int,
    similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT
        li.id::text,
        li.title::text,
        li.description::text,
        li.item_type::text,
        li.occurrence::int,
        (1 - (li.embedding <=> query_embedding))::float as similarity
    FROM library_items li
    WHERE li.embedding IS NOT NULL
      AND li.status != 'archived'
      AND (filter_item_type IS NULL OR li.item_type = filter_item_type)
      AND (1 - (li.embedding <=> query_embedding)) >= match_threshold
    ORDER BY li.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION search_similar_library_items(vector(1536), float, int, text) TO anon;
GRANT EXECUTE ON FUNCTION search_similar_library_items(vector(1536), float, int, text) TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================

-- Check vector column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'library_items' AND column_name = 'embedding';

-- Check how many items have embeddings (initially 0)
SELECT 
    COUNT(*) as total_items,
    COUNT(embedding) as items_with_embeddings,
    COUNT(*) - COUNT(embedding) as items_needing_backfill
FROM library_items
WHERE status != 'archived';

-- ============================================================================
-- Next Steps
-- ============================================================================
-- After running this SQL:
-- 1. Run: python3 engine/scripts/backfill_library_embeddings.py
-- 2. This backfills embeddings for existing items (one-time operation)
-- 3. New items will automatically get embeddings on creation
