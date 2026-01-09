-- Supabase Library Storage: Items and Categories
-- Run this in Supabase SQL Editor to add Library tables
-- This enables cloud storage for items and categories (replacing items_bank.json)

-- ============================================================================
-- Create library_items table
-- ============================================================================

CREATE TABLE IF NOT EXISTS library_items (
    id TEXT PRIMARY KEY,
    -- Core fields
    item_type TEXT NOT NULL CHECK (item_type IN ('idea', 'insight', 'use_case')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    status TEXT NOT NULL CHECK (status IN ('active', 'implemented', 'archived')) DEFAULT 'active',
    quality TEXT CHECK (quality IN ('A', 'B', 'C', NULL)),
    source_conversations INTEGER NOT NULL DEFAULT 1,
    -- Metadata
    occurrence INTEGER NOT NULL DEFAULT 1,
    first_seen TEXT NOT NULL, -- YYYY-MM format
    last_seen TEXT NOT NULL, -- YYYY-MM format
    category_id TEXT,
    -- Legacy fields (for backward compatibility)
    mode TEXT,
    theme TEXT,
    name TEXT,
    content JSONB,
    implemented BOOLEAN,
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_library_items_item_type ON library_items(item_type);
CREATE INDEX IF NOT EXISTS idx_library_items_status ON library_items(status);
CREATE INDEX IF NOT EXISTS idx_library_items_quality ON library_items(quality);
CREATE INDEX IF NOT EXISTS idx_library_items_category_id ON library_items(category_id);
CREATE INDEX IF NOT EXISTS idx_library_items_first_seen ON library_items(first_seen);
CREATE INDEX IF NOT EXISTS idx_library_items_last_seen ON library_items(last_seen);
CREATE INDEX IF NOT EXISTS idx_library_items_occurrence ON library_items(occurrence DESC);
CREATE INDEX IF NOT EXISTS idx_library_items_tags ON library_items USING GIN(tags);

-- ============================================================================
-- Create library_categories table
-- ============================================================================

CREATE TABLE IF NOT EXISTS library_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    theme TEXT NOT NULL,
    mode TEXT NOT NULL,
    item_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
    similarity_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    created_date TEXT NOT NULL, -- ISO date string
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_library_categories_theme ON library_categories(theme);
CREATE INDEX IF NOT EXISTS idx_library_categories_mode ON library_categories(mode);
CREATE INDEX IF NOT EXISTS idx_library_categories_created_date ON library_categories(created_date);

-- ============================================================================
-- Add updated_at triggers
-- ============================================================================

-- Trigger for library_items
CREATE TRIGGER update_library_items_updated_at
    BEFORE UPDATE ON library_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for library_categories
CREATE TRIGGER update_library_categories_updated_at
    BEFORE UPDATE ON library_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Enable Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on library_items table
ALTER TABLE library_items ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anon users to read library_items
CREATE POLICY "Allow anon read library_items"
ON library_items
FOR SELECT
TO anon
USING (true);

-- Policy: Allow anon users to insert library_items
CREATE POLICY "Allow anon insert library_items"
ON library_items
FOR INSERT
TO anon
WITH CHECK (true);

-- Policy: Allow anon users to update library_items
CREATE POLICY "Allow anon update library_items"
ON library_items
FOR UPDATE
TO anon
WITH CHECK (true);

-- Policy: Allow anon users to delete library_items
CREATE POLICY "Allow anon delete library_items"
ON library_items
FOR DELETE
TO anon
USING (true);

-- Policy: Allow authenticated users to read library_items
CREATE POLICY "Allow authenticated read library_items"
ON library_items
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow authenticated users to insert library_items
CREATE POLICY "Allow authenticated insert library_items"
ON library_items
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to update library_items
CREATE POLICY "Allow authenticated update library_items"
ON library_items
FOR UPDATE
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to delete library_items
CREATE POLICY "Allow authenticated delete library_items"
ON library_items
FOR DELETE
TO authenticated
USING (true);

-- Enable RLS on library_categories table
ALTER TABLE library_categories ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anon users to read library_categories
CREATE POLICY "Allow anon read library_categories"
ON library_categories
FOR SELECT
TO anon
USING (true);

-- Policy: Allow anon users to insert library_categories
CREATE POLICY "Allow anon insert library_categories"
ON library_categories
FOR INSERT
TO anon
WITH CHECK (true);

-- Policy: Allow anon users to update library_categories
CREATE POLICY "Allow anon update library_categories"
ON library_categories
FOR UPDATE
TO anon
WITH CHECK (true);

-- Policy: Allow anon users to delete library_categories
CREATE POLICY "Allow anon delete library_categories"
ON library_categories
FOR DELETE
TO anon
USING (true);

-- Policy: Allow authenticated users to read library_categories
CREATE POLICY "Allow authenticated read library_categories"
ON library_categories
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow authenticated users to insert library_categories
CREATE POLICY "Allow authenticated insert library_categories"
ON library_categories
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to update library_categories
CREATE POLICY "Allow authenticated update library_categories"
ON library_categories
FOR UPDATE
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to delete library_categories
CREATE POLICY "Allow authenticated delete library_categories"
ON library_categories
FOR DELETE
TO authenticated
USING (true);

-- Note: Service role key automatically bypasses RLS, so no policy needed

-- ============================================================================
-- Create helper functions for common queries
-- ============================================================================

-- Function: Get library stats
CREATE OR REPLACE FUNCTION get_library_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'totalItems', COUNT(*),
        'totalCategories', (SELECT COUNT(*) FROM library_categories),
        'implemented', COUNT(*) FILTER (WHERE status = 'implemented'),
        'byItemType', (
            SELECT json_object_agg(item_type, count)
            FROM (
                SELECT item_type, COUNT(*)::int as count
                FROM library_items
                GROUP BY item_type
            ) sub
        ),
        'byStatus', (
            SELECT json_object_agg(status, count)
            FROM (
                SELECT status, COUNT(*)::int as count
                FROM library_items
                GROUP BY status
            ) sub
        ),
        'byQuality', (
            SELECT json_object_agg(quality, count)
            FROM (
                SELECT COALESCE(quality, 'unrated') as quality, COUNT(*)::int as count
                FROM library_items
                GROUP BY quality
            ) sub
        )
    ) INTO result
    FROM library_items;
    
    RETURN result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_library_stats() TO anon;
GRANT EXECUTE ON FUNCTION get_library_stats() TO authenticated;

-- ============================================================================
-- Migration notes
-- ============================================================================

-- After running this SQL:
-- 1. Run the migration script to move data from JSON to Supabase:
--    python3 engine/scripts/migrate_library_to_supabase.py
--
-- 2. Update API routes to read from Supabase instead of JSON
--
-- 3. Update Python engine to write to Supabase instead of JSON
--
-- 4. Test thoroughly before removing items_bank.json backup
