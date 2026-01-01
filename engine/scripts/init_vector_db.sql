-- Supabase pgvector Setup for Cursor Chat History
-- Run this in Supabase SQL Editor to create the vector database table

-- Create extensions schema for security best practices
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;

-- Enable pgvector extension in extensions schema (security best practice)
CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;

-- Create cursor_messages table
CREATE TABLE IF NOT EXISTS cursor_messages (
    id BIGSERIAL PRIMARY KEY,
    message_id TEXT UNIQUE NOT NULL,
    text TEXT NOT NULL,
    embedding extensions.vector(1536), -- OpenAI text-embedding-3-small dimension
    timestamp BIGINT NOT NULL,
    workspace TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    chat_type TEXT NOT NULL,
    message_type TEXT NOT NULL,
    indexed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_cursor_messages_timestamp ON cursor_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_cursor_messages_workspace ON cursor_messages(workspace);
CREATE INDEX IF NOT EXISTS idx_cursor_messages_chat_id ON cursor_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_cursor_messages_indexed_at ON cursor_messages(indexed_at);

-- Create vector similarity index (HNSW for fast approximate search)
CREATE INDEX IF NOT EXISTS idx_cursor_messages_embedding ON cursor_messages 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create RPC function for vector similarity search
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

-- Add updated_at trigger function
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
$$ LANGUAGE plpgsql;

-- Trigger for cursor_messages
CREATE TRIGGER update_cursor_messages_updated_at
    BEFORE UPDATE ON cursor_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create app_config table for persisting user settings (Vercel support)
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger for app_config
CREATE TRIGGER update_app_config_updated_at
    BEFORE UPDATE ON app_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Enable Row Level Security (RLS) on public tables
-- ============================================================================

-- Enable RLS on cursor_messages table
ALTER TABLE cursor_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anon users to read cursor_messages
CREATE POLICY "Allow anon read cursor_messages"
ON cursor_messages
FOR SELECT
TO anon
USING (true);

-- Policy: Allow anon users to insert cursor_messages
CREATE POLICY "Allow anon insert cursor_messages"
ON cursor_messages
FOR INSERT
TO anon
WITH CHECK (true);

-- Policy: Allow anon users to update cursor_messages
CREATE POLICY "Allow anon update cursor_messages"
ON cursor_messages
FOR UPDATE
TO anon
WITH CHECK (true);

-- Policy: Allow authenticated users to read cursor_messages
CREATE POLICY "Allow authenticated read cursor_messages"
ON cursor_messages
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow authenticated users to insert cursor_messages
CREATE POLICY "Allow authenticated insert cursor_messages"
ON cursor_messages
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to update cursor_messages
CREATE POLICY "Allow authenticated update cursor_messages"
ON cursor_messages
FOR UPDATE
TO authenticated
WITH CHECK (true);

-- Enable RLS on app_config table
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anon users to read app_config
CREATE POLICY "Allow anon read app_config"
ON app_config
FOR SELECT
TO anon
USING (true);

-- Policy: Allow anon users to insert app_config
CREATE POLICY "Allow anon insert app_config"
ON app_config
FOR INSERT
TO anon
WITH CHECK (true);

-- Policy: Allow anon users to update app_config
CREATE POLICY "Allow anon update app_config"
ON app_config
FOR UPDATE
TO anon
WITH CHECK (true);

-- Policy: Allow authenticated users to read app_config
CREATE POLICY "Allow authenticated read app_config"
ON app_config
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow authenticated users to insert app_config
CREATE POLICY "Allow authenticated insert app_config"
ON app_config
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to update app_config
CREATE POLICY "Allow authenticated update app_config"
ON app_config
FOR UPDATE
TO authenticated
WITH CHECK (true);

-- Note: Service role key automatically bypasses RLS, so no policy needed
