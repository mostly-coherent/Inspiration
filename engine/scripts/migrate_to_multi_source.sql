-- Migration: Add Multi-Source Support to Inspiration Vector DB
-- Date: 2026-01-12
-- Purpose: Enable tracking of message sources (Cursor, Claude Code, etc.)

-- Add source tracking columns
ALTER TABLE cursor_messages ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'cursor';
ALTER TABLE cursor_messages ADD COLUMN IF NOT EXISTS source_detail JSONB DEFAULT NULL;

-- Create indexes for efficient source filtering
CREATE INDEX IF NOT EXISTS idx_messages_source ON cursor_messages(source);
CREATE INDEX IF NOT EXISTS idx_messages_workspace_source ON cursor_messages(workspace, source);

-- Update search RPC function to support source filtering
CREATE OR REPLACE FUNCTION search_cursor_messages(
    query_embedding extensions.vector(1536),
    match_threshold float DEFAULT 0.0,
    match_count int DEFAULT 10,
    start_ts bigint DEFAULT NULL,
    end_ts bigint DEFAULT NULL,
    workspace_filter text[] DEFAULT NULL,
    source_filter text[] DEFAULT NULL  -- NEW PARAMETER: Filter by source(s)
)
RETURNS TABLE (
    message_id text,
    "text" text,
    "timestamp" bigint,
    workspace text,
    chat_id text,
    chat_type text,
    message_type text,
    source text,  -- NEW FIELD: Source attribution
    similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cm.message_id,
        cm.text,
        cm.timestamp,
        cm.workspace,
        cm.chat_id,
        cm.chat_type,
        cm.message_type,
        cm.source,
        1 - (cm.embedding <=> query_embedding) as similarity
    FROM cursor_messages cm
    WHERE
        (start_ts IS NULL OR cm.timestamp >= start_ts)
        AND (end_ts IS NULL OR cm.timestamp < end_ts)
        AND (workspace_filter IS NULL OR cm.workspace = ANY(workspace_filter))
        AND (source_filter IS NULL OR cm.source = ANY(source_filter))  -- NEW: Source filtering
        AND (1 - (cm.embedding <=> query_embedding)) >= match_threshold
    ORDER BY cm.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Verification query (uncomment to check migration status)
-- SELECT source, COUNT(*) as count FROM cursor_messages GROUP BY source;

-- Migration notes:
-- 1. Idempotent: Safe to run multiple times (uses IF NOT EXISTS)
-- 2. Existing messages get source='cursor' via DEFAULT value
-- 3. No data loss: All existing data preserved
-- 4. Backward compatible: Existing queries still work (source_filter is optional)
-- 5. Performance: Indexes added for efficient source-based queries
