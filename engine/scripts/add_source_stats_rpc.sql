-- Migration: Add RPC Function for Source Statistics
-- Date: 2026-01-27
-- Purpose: Efficiently count distinct conversations and total messages by source
--          Replaces pagination-based approach with single SQL query

-- Create RPC function to get source breakdown (conversations + messages)
CREATE OR REPLACE FUNCTION get_source_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cursor_conversations INTEGER;
    cursor_messages INTEGER;
    claude_code_conversations INTEGER;
    claude_code_messages INTEGER;
    result JSON;
BEGIN
    -- Count Cursor conversations (distinct chat_id) and messages
    SELECT 
        COUNT(DISTINCT chat_id)::INTEGER,
        COUNT(*)::INTEGER
    INTO cursor_conversations, cursor_messages
    FROM cursor_messages
    WHERE source = 'cursor';

    -- Count Claude Code conversations (distinct chat_id) and messages
    SELECT 
        COUNT(DISTINCT chat_id)::INTEGER,
        COUNT(*)::INTEGER
    INTO claude_code_conversations, claude_code_messages
    FROM cursor_messages
    WHERE source = 'claude_code';

    -- Build JSON response
    result := json_build_object(
        'cursor', json_build_object(
            'conversations', COALESCE(cursor_conversations, 0),
            'messages', COALESCE(cursor_messages, 0)
        ),
        'claudeCode', json_build_object(
            'conversations', COALESCE(claude_code_conversations, 0),
            'messages', COALESCE(claude_code_messages, 0)
        )
    );

    RETURN result;
END;
$$;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION get_source_stats() TO anon;
GRANT EXECUTE ON FUNCTION get_source_stats() TO authenticated;

-- Verification query (uncomment to test)
-- SELECT get_source_stats();

-- Migration notes:
-- 1. Idempotent: Safe to run multiple times (CREATE OR REPLACE)
-- 2. Performance: Single query per source (much faster than pagination)
-- 3. Uses existing indexes: idx_messages_source for efficient filtering
-- 4. Returns JSON matching API response format
