-- Upgrade Date Granularity for Analytics Evolution
-- Run this in Supabase SQL Editor
-- 
-- Purpose: Enable day-level analytics by upgrading month-only fields to full dates
-- and tracking occurrence history for trend analysis

-- ============================================================================
-- Step 1: Add new DATE columns (keeps old TEXT columns for safety)
-- ============================================================================

-- Add day-precision date columns
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS first_seen_date DATE;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS last_seen_date DATE;

-- ============================================================================
-- Step 2: Migrate existing data (YYYY-MM → YYYY-MM-01)
-- ============================================================================

-- Backfill first_seen_date from first_seen (TEXT)
UPDATE library_items 
SET first_seen_date = (first_seen || '-01')::date
WHERE first_seen IS NOT NULL AND first_seen_date IS NULL;

-- Backfill last_seen_date from last_seen (TEXT)
UPDATE library_items 
SET last_seen_date = (last_seen || '-01')::date
WHERE last_seen IS NOT NULL AND last_seen_date IS NULL;

-- ============================================================================
-- Step 3: Create occurrence history table
-- ============================================================================

CREATE TABLE IF NOT EXISTS library_occurrence_history (
    id SERIAL PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
    occurred_at DATE NOT NULL DEFAULT CURRENT_DATE,
    source_type TEXT, -- 'generation', 'deduplication', 'topic_filter'
    source_context TEXT, -- e.g., "2026-01-01 to 2026-01-07 run"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_occurrence_history_item_id 
ON library_occurrence_history(item_id);

CREATE INDEX IF NOT EXISTS idx_occurrence_history_occurred_at 
ON library_occurrence_history(occurred_at);

CREATE INDEX IF NOT EXISTS idx_occurrence_history_source_type 
ON library_occurrence_history(source_type);

-- ============================================================================
-- Step 4: Backfill occurrence history from existing items
-- Creates one entry per item representing initial creation
-- ============================================================================

INSERT INTO library_occurrence_history (item_id, occurred_at, source_type, source_context)
SELECT 
    id,
    COALESCE(first_seen_date, (first_seen || '-01')::date, created_at::date),
    'generation',
    'Initial creation (backfilled from first_seen)'
FROM library_items
WHERE id NOT IN (SELECT DISTINCT item_id FROM library_occurrence_history);

-- ============================================================================
-- Step 5: Enable RLS on occurrence history
-- ============================================================================

ALTER TABLE library_occurrence_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read occurrence_history" 
ON library_occurrence_history FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert occurrence_history" 
ON library_occurrence_history FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow authenticated read occurrence_history" 
ON library_occurrence_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert occurrence_history" 
ON library_occurrence_history FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- Step 6: Create analytics helper functions
-- ============================================================================

-- Function: Get occurrence trend by week
CREATE OR REPLACE FUNCTION get_occurrence_trend_by_week()
RETURNS TABLE (
    week_label TEXT,
    week_start DATE,
    new_items BIGINT,
    recurring_items BIGINT,
    total_occurrences BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        TO_CHAR(DATE_TRUNC('week', oh.occurred_at), 'IYYY-"W"IW') AS week_label,
        DATE_TRUNC('week', oh.occurred_at)::DATE AS week_start,
        COUNT(*) FILTER (WHERE oh.source_type = 'generation') AS new_items,
        COUNT(*) FILTER (WHERE oh.source_type IN ('deduplication', 'topic_filter')) AS recurring_items,
        COUNT(*) AS total_occurrences
    FROM library_occurrence_history oh
    GROUP BY DATE_TRUNC('week', oh.occurred_at)
    ORDER BY week_start;
END;
$$;

GRANT EXECUTE ON FUNCTION get_occurrence_trend_by_week() TO anon;
GRANT EXECUTE ON FUNCTION get_occurrence_trend_by_week() TO authenticated;

-- Function: Get Library size in bytes (for distillation visualization)
CREATE OR REPLACE FUNCTION get_library_size()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_size_bytes', pg_total_relation_size('library_items'),
        'table_size_bytes', pg_relation_size('library_items'),
        'indexes_size_bytes', pg_indexes_size('library_items'),
        'total_size', pg_size_pretty(pg_total_relation_size('library_items')),
        'table_size', pg_size_pretty(pg_relation_size('library_items')),
        'indexes_size', pg_size_pretty(pg_indexes_size('library_items')),
        'item_count', (SELECT COUNT(*) FROM library_items WHERE status != 'archived'),
        'occurrence_history_size', pg_size_pretty(pg_total_relation_size('library_occurrence_history'))
    ) INTO result;
    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_library_size() TO anon;
GRANT EXECUTE ON FUNCTION get_library_size() TO authenticated;

-- ============================================================================
-- Verification queries (run after migration)
-- ============================================================================

-- Check migration success:
-- SELECT COUNT(*) as total, 
--        COUNT(first_seen_date) as with_first_seen_date,
--        COUNT(last_seen_date) as with_last_seen_date
-- FROM library_items;

-- Check occurrence history:
-- SELECT COUNT(*) as history_entries FROM library_occurrence_history;

-- Test analytics function:
-- SELECT * FROM get_occurrence_trend_by_week() LIMIT 10;

-- Test size function:
-- SELECT get_library_size();
