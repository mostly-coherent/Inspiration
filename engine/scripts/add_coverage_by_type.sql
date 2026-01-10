-- Coverage Analysis by Item Type
-- Run this in Supabase SQL Editor to add type-specific coverage functions

-- RPC Function: Get Library coverage by week AND item type
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
    SELECT
        TO_CHAR(DATE_TRUNC('week', li.source_start_date), 'IYYY-"W"IW') AS week_label,
        DATE_TRUNC('week', li.source_start_date)::DATE AS week_start,
        li.item_type::TEXT AS item_type,
        COUNT(*) AS item_count
    FROM library_items li
    WHERE li.source_start_date IS NOT NULL
      AND li.status != 'archived'
    GROUP BY DATE_TRUNC('week', li.source_start_date), li.item_type
    ORDER BY week_start, li.item_type;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_library_coverage_by_week_and_type() TO anon;
GRANT EXECUTE ON FUNCTION get_library_coverage_by_week_and_type() TO authenticated;
