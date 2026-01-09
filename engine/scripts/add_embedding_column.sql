-- Add embedding column to library_items table
-- Run this in Supabase SQL Editor

-- ============================================================================
-- Step 1: Add embedding column
-- ============================================================================

-- Add vector column for storing OpenAI embeddings (1536 dimensions for text-embedding-3-small)
-- Using JSONB for flexibility (pgvector extension optional for advanced similarity search)
ALTER TABLE library_items 
ADD COLUMN IF NOT EXISTS embedding JSONB;

-- Add index for faster embedding lookups (optional, for large datasets)
-- CREATE INDEX IF NOT EXISTS idx_library_items_embedding ON library_items USING GIN(embedding);

-- ============================================================================
-- Verification
-- ============================================================================

-- Check the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'library_items' AND column_name = 'embedding';

-- Check sample of items (should show NULL for embedding initially)
SELECT id, title, 
       CASE WHEN embedding IS NULL THEN 'missing' ELSE 'present' END as embedding_status
FROM library_items 
LIMIT 5;

-- ============================================================================
-- Next Steps
-- ============================================================================
-- After running this SQL:
-- 1. Run the backfill script: python3 engine/scripts/backfill_embeddings.py
-- 2. This will generate embeddings for all existing items using OpenAI
-- 3. Theme Explorer will then use embeddings for dynamic grouping
