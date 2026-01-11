-- Fix Vector Search Path for search_similar_library_items
-- This fixes: operator does not exist: extensions.vector <=> extensions.vector
-- Run this in Supabase SQL Editor

-- ============================================================================
-- The Issue
-- ============================================================================
-- When pgvector is installed in the 'extensions' schema, functions that use
-- the <=> operator need to include 'extensions' in their search_path.

-- ============================================================================
-- Fix search_similar_library_items function
-- ============================================================================

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

-- Test the function with a dummy embedding (should return empty, not error)
SELECT * FROM search_similar_library_items(
    ARRAY_FILL(0.0::real, ARRAY[1536])::vector(1536),
    0.85,
    1,
    'use_case'
);
