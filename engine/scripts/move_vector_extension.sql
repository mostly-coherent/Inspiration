-- Move vector extension from public schema to extensions schema
-- This fixes Supabase security linter warning for extension_in_public
-- Run this in Supabase SQL Editor

-- ============================================================================
-- Step 1: Create extensions schema
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage on extensions schema to anon and authenticated roles
GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;

-- ============================================================================
-- Step 2: Move vector extension to extensions schema
-- ============================================================================

-- Move the vector extension to the extensions schema
-- This will automatically update all type references
ALTER EXTENSION vector SET SCHEMA extensions;

-- ============================================================================
-- Step 3: Verify table column type (PostgreSQL handles this automatically)
-- ============================================================================

-- Note: When ALTER EXTENSION SET SCHEMA is executed, PostgreSQL automatically
-- updates all type references, including table column types. The cursor_messages
-- table embedding column will automatically reference extensions.vector(1536).
-- No explicit ALTER TABLE is needed.

-- ============================================================================
-- Step 4: Update function search_path to include extensions schema
-- ============================================================================

-- Update search_cursor_messages function to include extensions in search_path
CREATE OR REPLACE FUNCTION search_cursor_messages(
    query_embedding extensions.vector(1536),
    match_threshold float DEFAULT 0.0,
    match_count int DEFAULT 10,
    start_ts bigint DEFAULT NULL,
    end_ts bigint DEFAULT NULL,
    workspace_filter text[] DEFAULT NULL
)
RETURNS TABLE (
    message_id text,
    "text" text,
    "timestamp" bigint,
    workspace text,
    chat_id text,
    chat_type text,
    message_type text,
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
        1 - (cm.embedding <=> query_embedding) as similarity
    FROM cursor_messages cm
    WHERE
        (start_ts IS NULL OR cm.timestamp >= start_ts)
        AND (end_ts IS NULL OR cm.timestamp < end_ts)
        AND (workspace_filter IS NULL OR cm.workspace = ANY(workspace_filter))
        AND (1 - (cm.embedding <=> query_embedding)) >= match_threshold
    ORDER BY cm.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Note: The cursor_messages table column type will automatically reference
-- extensions.vector after the extension is moved. The table definition doesn't
-- need to be changed explicitly - PostgreSQL handles this automatically.

