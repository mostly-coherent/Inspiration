-- Simplify Library Schema v2
-- Removes: mode (redundant), quality (unused), tags (low value)
-- Run this AFTER the first simplification
-- Date: 2026-01-10

-- ============================================================================
-- Pre-Flight Check
-- ============================================================================

-- Verify mode == item_type for all items (should be 0 mismatches)
SELECT COUNT(*) as mismatches
FROM library_items
WHERE mode != item_type;

-- Check data before dropping
SELECT
    COUNT(*) as total_items,
    COUNT(CASE WHEN mode IS NOT NULL THEN 1 END) as has_mode,
    COUNT(CASE WHEN quality IS NOT NULL THEN 1 END) as has_quality,
    COUNT(CASE WHEN tags IS NOT NULL AND array_length(tags, 1) > 0 THEN 1 END) as has_tags
FROM library_items;

-- ============================================================================
-- Phase 1: Drop redundant/unused columns
-- ============================================================================

-- Drop 'mode' (100% redundant with item_type)
ALTER TABLE library_items DROP COLUMN IF EXISTS mode;

-- Drop 'quality' (written but never displayed in UI)
ALTER TABLE library_items DROP COLUMN IF EXISTS quality;

-- Drop 'tags' (minimal value - search works on title/description)
ALTER TABLE library_items DROP COLUMN IF EXISTS tags;

-- ============================================================================
-- Also clean up unused date fields (consolidate to day-level only)
-- ============================================================================

-- Keep first_seen and last_seen for backward compatibility
-- (some code may still reference them)
-- Future: migrate to first_seen_date/last_seen_date only

-- ============================================================================
-- Verification
-- ============================================================================

-- Confirm columns are dropped
SELECT 
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'library_items'
ORDER BY ordinal_position;

-- ============================================================================
-- Final Schema (after v2 cleanup)
-- ============================================================================
-- 
-- Core fields:
--   id, item_type, title, description, status
-- 
-- Metadata:
--   occurrence, first_seen, last_seen, first_seen_date, last_seen_date
--   category_id
-- 
-- Coverage tracking:
--   source_start_date, source_end_date
-- 
-- Theme tracking:
--   theme ("generation" | "seek")
-- 
-- Search:
--   embedding
-- 
-- Timestamps:
--   created_at, updated_at
--
-- Total: 15 fields (down from 24 originally)
