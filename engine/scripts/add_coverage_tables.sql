-- Coverage Intelligence: Schema additions for tracking Library coverage over Memory terrain
-- Run this in Supabase SQL Editor to add coverage tracking tables and functions

-- ============================================================================
-- Add source date columns to library_items
-- ============================================================================

-- Track which date range an item was generated from
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS source_start_date DATE;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS source_end_date DATE;

-- Create index for source date queries
CREATE INDEX IF NOT EXISTS idx_library_items_source_dates 
ON library_items(source_start_date, source_end_date);

-- ============================================================================
-- Create coverage_runs table for run queue management
-- ============================================================================

CREATE TABLE IF NOT EXISTS coverage_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Status tracking
    status TEXT NOT NULL CHECK (status IN ('suggested', 'queued', 'processing', 'completed', 'failed', 'cancelled')) DEFAULT 'suggested',
    priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
    -- Target date range
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    week_label TEXT NOT NULL, -- e.g., "2025-W28" for display
    -- Memory stats for this period
    conversation_count INTEGER NOT NULL DEFAULT 0,
    message_count INTEGER NOT NULL DEFAULT 0,
    -- Generation configuration
    item_type TEXT NOT NULL CHECK (item_type IN ('idea', 'insight', 'use_case')) DEFAULT 'idea',
    expected_items INTEGER NOT NULL DEFAULT 5,
    actual_items INTEGER DEFAULT 0,
    -- Cost estimation
    estimated_cost DECIMAL(10, 4) DEFAULT 0.00,
    actual_cost DECIMAL(10, 4) DEFAULT 0.00,
    -- Reason for suggestion
    reason TEXT,
    existing_items INTEGER DEFAULT 0, -- How many items already cover this period
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    -- Error tracking
    error TEXT,
    -- Progress tracking (0-100)
    progress INTEGER DEFAULT 0
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_coverage_runs_status ON coverage_runs(status);
CREATE INDEX IF NOT EXISTS idx_coverage_runs_priority ON coverage_runs(priority);
CREATE INDEX IF NOT EXISTS idx_coverage_runs_dates ON coverage_runs(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_coverage_runs_created ON coverage_runs(created_at DESC);

-- ============================================================================
-- RPC Function: Get Memory density by week
-- ============================================================================

CREATE OR REPLACE FUNCTION get_memory_density_by_week()
RETURNS TABLE (
    week_label TEXT,
    week_start DATE,
    week_end DATE,
    conversation_count BIGINT,
    message_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        TO_CHAR(DATE_TRUNC('week', TO_TIMESTAMP(cm.timestamp / 1000.0)), 'IYYY-"W"IW') AS week_label,
        DATE_TRUNC('week', TO_TIMESTAMP(cm.timestamp / 1000.0))::DATE AS week_start,
        (DATE_TRUNC('week', TO_TIMESTAMP(cm.timestamp / 1000.0)) + INTERVAL '6 days')::DATE AS week_end,
        COUNT(DISTINCT cm.chat_id) AS conversation_count,
        COUNT(*) AS message_count
    FROM cursor_messages cm
    GROUP BY DATE_TRUNC('week', TO_TIMESTAMP(cm.timestamp / 1000.0))
    ORDER BY week_start;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_memory_density_by_week() TO anon;
GRANT EXECUTE ON FUNCTION get_memory_density_by_week() TO authenticated;

-- ============================================================================
-- RPC Function: Get Library coverage by week
-- FIXED v2: Counts items for ALL weeks they span, handles first_seen YYYY-MM format
-- ============================================================================

CREATE OR REPLACE FUNCTION get_library_coverage_by_week()
RETURNS TABLE (
    week_label TEXT,
    week_start DATE,
    item_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH item_weeks AS (
        -- Generate all weeks each item covers (between start and end dates)
        -- first_seen is YYYY-MM format, so append '-01' to make it a valid date
        SELECT 
            li.id,
            generate_series(
                DATE_TRUNC('week', COALESCE(
                    li.source_start_date,
                    (li.first_seen || '-01')::date
                )),
                DATE_TRUNC('week', COALESCE(
                    li.source_end_date,
                    li.source_start_date,
                    (li.first_seen || '-01')::date
                )),
                '1 week'::interval
            )::DATE AS covered_week
        FROM library_items li
        WHERE li.status != 'archived'
          AND (li.source_start_date IS NOT NULL OR li.first_seen IS NOT NULL)
    )
    SELECT
        TO_CHAR(iw.covered_week, 'IYYY-"W"IW') AS week_label,
        iw.covered_week AS week_start,
        COUNT(DISTINCT iw.id) AS item_count
    FROM item_weeks iw
    GROUP BY iw.covered_week
    ORDER BY iw.covered_week;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_library_coverage_by_week() TO anon;
GRANT EXECUTE ON FUNCTION get_library_coverage_by_week() TO authenticated;

-- ============================================================================
-- RPC Function: Get full coverage analysis
-- ============================================================================

CREATE OR REPLACE FUNCTION get_coverage_analysis()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    memory_data JSON;
    library_data JSON;
    result JSON;
BEGIN
    -- Get memory density
    SELECT json_agg(
        json_build_object(
            'weekLabel', week_label,
            'weekStart', week_start,
            'weekEnd', week_end,
            'conversationCount', conversation_count,
            'messageCount', message_count
        ) ORDER BY week_start
    ) INTO memory_data
    FROM get_memory_density_by_week();
    
    -- Get library coverage
    SELECT json_agg(
        json_build_object(
            'weekLabel', week_label,
            'weekStart', week_start,
            'itemCount', item_count
        ) ORDER BY week_start
    ) INTO library_data
    FROM get_library_coverage_by_week();
    
    -- Build result
    SELECT json_build_object(
        'memory', json_build_object(
            'weeks', COALESCE(memory_data, '[]'::json),
            'totalConversations', (SELECT COUNT(DISTINCT chat_id) FROM cursor_messages),
            'totalMessages', (SELECT COUNT(*) FROM cursor_messages),
            'earliestDate', (SELECT MIN(TO_TIMESTAMP(timestamp / 1000.0))::DATE FROM cursor_messages),
            'latestDate', (SELECT MAX(TO_TIMESTAMP(timestamp / 1000.0))::DATE FROM cursor_messages)
        ),
        'library', json_build_object(
            'weeks', COALESCE(library_data, '[]'::json),
            'totalItems', (SELECT COUNT(*) FROM library_items WHERE status != 'archived'),
            'itemsWithSourceDates', (SELECT COUNT(*) FROM library_items WHERE source_start_date IS NOT NULL AND status != 'archived')
        ),
        'analyzedAt', NOW()
    ) INTO result;
    
    RETURN result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_coverage_analysis() TO anon;
GRANT EXECUTE ON FUNCTION get_coverage_analysis() TO authenticated;

-- ============================================================================
-- Enable RLS on coverage_runs table
-- ============================================================================

ALTER TABLE coverage_runs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anon users full access to coverage_runs
CREATE POLICY "Allow anon read coverage_runs" ON coverage_runs FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert coverage_runs" ON coverage_runs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update coverage_runs" ON coverage_runs FOR UPDATE TO anon WITH CHECK (true);
CREATE POLICY "Allow anon delete coverage_runs" ON coverage_runs FOR DELETE TO anon USING (true);

-- Policy: Allow authenticated users full access to coverage_runs
CREATE POLICY "Allow authenticated read coverage_runs" ON coverage_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert coverage_runs" ON coverage_runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update coverage_runs" ON coverage_runs FOR UPDATE TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated delete coverage_runs" ON coverage_runs FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- Usage Notes
-- ============================================================================

-- After running this SQL:
-- 
-- 1. Test the functions:
--    SELECT * FROM get_memory_density_by_week();
--    SELECT * FROM get_library_coverage_by_week();
--    SELECT get_coverage_analysis();
--
-- 2. Existing library items won't have source dates.
--    Future generations will populate source_start_date and source_end_date.
--
-- 3. The coverage_runs table tracks:
--    - Suggested runs (gaps detected)
--    - Queued runs (user approved)
--    - Processing runs (in progress)
--    - Completed runs (done)
--    - Failed runs (error occurred)
