-- Simplify Library Schema
-- Removes deprecated fields: name, content, source_conversations, implemented
-- Run this AFTER verifying the app works without these fields
-- Date: 2026-01-10

-- ============================================================================
-- Pre-Flight Check
-- ============================================================================

-- Verify these columns exist before dropping
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'library_items' 
  AND column_name IN ('name', 'content', 'source_conversations', 'implemented');

-- Check data in these columns (should be empty/default)
SELECT
    COUNT(*) as total_items,
    COUNT(name) as items_with_name,
    COUNT(content) as items_with_content,
    SUM(CASE WHEN implemented = true THEN 1 ELSE 0 END) as items_implemented
FROM library_items;

-- ============================================================================
-- Phase 1: Drop columns with no data (SAFE)
-- ============================================================================

-- Drop 'name' column (confirmed 0 items with data)
ALTER TABLE library_items DROP COLUMN IF EXISTS name;

-- Drop 'content' column (confirmed 0 items with data)
ALTER TABLE library_items DROP COLUMN IF EXISTS content;

-- ============================================================================
-- Phase 2: Drop deprecated but populated columns
-- ============================================================================

-- Drop 'source_conversations' (replaced by 'occurrence')
-- Note: occurrence is the primary metric now
ALTER TABLE library_items DROP COLUMN IF EXISTS source_conversations;

-- Drop 'implemented' (not used in current UI)
ALTER TABLE library_items DROP COLUMN IF EXISTS implemented;

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
-- Remaining Schema (after cleanup)
-- ============================================================================
-- 
-- Core fields:
--   id, item_type, title, description, tags, status
-- 
-- Metadata:
--   occurrence, first_seen, last_seen, first_seen_date, last_seen_date
--   quality, category_id
-- 
-- Coverage tracking:
--   source_start_date, source_end_date, source_dates, source_workspaces
-- 
-- Theme/Mode:
--   mode, theme
-- 
-- Search:
--   embedding
-- 
-- Timestamps:
--   created_at, updated_at
