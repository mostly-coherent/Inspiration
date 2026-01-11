-- Fix v2: Handle first_seen format (YYYY-MM) properly
-- Run this in Supabase SQL Editor

-- ============================================================================
-- RPC Function: Get Library coverage by week (FIXED v2)
-- Handles first_seen being YYYY-MM format, not a full date
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
        SELECT 
            li.id,
            generate_series(
                DATE_TRUNC('week', COALESCE(
                    li.source_start_date,
                    -- first_seen is YYYY-MM format, convert to first day of month
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
-- RPC Function: Get Library coverage by week AND type (FIXED v2)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_library_coverage_by_week_and_type()
RETURNS TABLE (
    week_label TEXT,
    week_start DATE,
    item_type TEXT,
    item_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH item_weeks AS (
        SELECT 
            li.id,
            li.item_type,
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
        iw.item_type AS item_type,
        COUNT(DISTINCT iw.id) AS item_count
    FROM item_weeks iw
    GROUP BY iw.covered_week, iw.item_type
    ORDER BY iw.covered_week, iw.item_type;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_library_coverage_by_week_and_type() TO anon;
GRANT EXECUTE ON FUNCTION get_library_coverage_by_week_and_type() TO authenticated;

-- Test
-- SELECT * FROM get_library_coverage_by_week() LIMIT 10;
