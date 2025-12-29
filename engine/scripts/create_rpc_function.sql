-- Create RPC function for vector similarity search
-- Run this in Supabase SQL Editor to enable fast vector search

CREATE OR REPLACE FUNCTION search_cursor_messages(
    query_embedding vector(1536),
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

-- Grant execute permission to authenticated users (adjust as needed)
GRANT EXECUTE ON FUNCTION search_cursor_messages TO anon;
GRANT EXECUTE ON FUNCTION search_cursor_messages TO authenticated;

