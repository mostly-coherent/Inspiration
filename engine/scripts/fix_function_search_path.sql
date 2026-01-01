-- Fix Function Search Path Security Warnings
-- This fixes Supabase security linter warnings for mutable search_path
-- Run this in Supabase SQL Editor

-- ============================================================================
-- Fix search_cursor_messages function
-- ============================================================================

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

-- ============================================================================
-- Fix get_table_size function
-- ============================================================================

CREATE OR REPLACE FUNCTION get_table_size(table_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result json;
BEGIN
    SELECT json_build_object(
        'total_size_bytes', pg_total_relation_size(table_name::regclass),
        'table_size_bytes', pg_relation_size(table_name::regclass),
        'indexes_size_bytes', pg_indexes_size(table_name::regclass),
        'total_size', pg_size_pretty(pg_total_relation_size(table_name::regclass)),
        'table_size', pg_size_pretty(pg_relation_size(table_name::regclass)),
        'indexes_size', pg_size_pretty(pg_indexes_size(table_name::regclass))
    ) INTO result;
    RETURN result;
END;
$$;

-- ============================================================================
-- Fix update_updated_at_column function
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Note: The vector extension warning is informational. The pgvector extension
-- is commonly installed in the public schema and moving it requires complex
-- migration. For a personal app, this warning can be safely ignored.
-- If you need to fix it, you would need to:
-- 1. Create a new schema (e.g., 'extensions')
-- 2. Move the extension: ALTER EXTENSION vector SET SCHEMA extensions;
-- 3. Update all references to vector type in your tables/functions

