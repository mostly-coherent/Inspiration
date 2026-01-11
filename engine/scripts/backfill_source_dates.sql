-- Backfill source_start_date and source_end_date for existing items
-- that only have first_seen (YYYY-MM format)
-- 
-- Run this in Supabase SQL Editor ONCE to fix coverage tracking for existing items

-- First, let's see how many items need backfilling
SELECT 
    COUNT(*) as total_items,
    COUNT(*) FILTER (WHERE source_start_date IS NOT NULL) as has_source_start,
    COUNT(*) FILTER (WHERE source_end_date IS NOT NULL) as has_source_end,
    COUNT(*) FILTER (WHERE first_seen IS NOT NULL AND source_start_date IS NULL) as needs_backfill
FROM library_items;

-- Backfill: Set source dates based on first_seen month
-- source_start_date = first day of first_seen month
-- source_end_date = last day of first_seen month
UPDATE library_items
SET 
    source_start_date = (first_seen || '-01')::date,
    source_end_date = ((first_seen || '-01')::date + interval '1 month' - interval '1 day')::date
WHERE 
    first_seen IS NOT NULL 
    AND source_start_date IS NULL;

-- Verify the backfill worked
SELECT 
    COUNT(*) as total_items,
    COUNT(*) FILTER (WHERE source_start_date IS NOT NULL) as has_source_start,
    COUNT(*) FILTER (WHERE source_end_date IS NOT NULL) as has_source_end,
    COUNT(*) FILTER (WHERE first_seen IS NOT NULL AND source_start_date IS NULL) as still_needs_backfill
FROM library_items;
