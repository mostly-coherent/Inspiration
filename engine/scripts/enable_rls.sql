-- Enable Row Level Security (RLS) on public tables
-- This fixes Supabase security linter errors for cursor_messages and app_config tables
-- Run this in Supabase SQL Editor

-- ============================================================================
-- Enable RLS on cursor_messages table
-- ============================================================================

ALTER TABLE cursor_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anon users to read cursor_messages
-- Used by: Next.js API routes and Python scripts using anon key
CREATE POLICY "Allow anon read cursor_messages"
ON cursor_messages
FOR SELECT
TO anon
USING (true);

-- Policy: Allow anon users to insert cursor_messages
-- Used by: Python sync scripts using anon key
CREATE POLICY "Allow anon insert cursor_messages"
ON cursor_messages
FOR INSERT
TO anon
WITH CHECK (true);

-- Policy: Allow anon users to update cursor_messages
-- Used by: Python sync scripts using anon key
CREATE POLICY "Allow anon update cursor_messages"
ON cursor_messages
FOR UPDATE
TO anon
WITH CHECK (true);

-- Policy: Allow authenticated users to read cursor_messages
-- For future use if Supabase auth is added
CREATE POLICY "Allow authenticated read cursor_messages"
ON cursor_messages
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow authenticated users to insert cursor_messages
-- For future use if Supabase auth is added
CREATE POLICY "Allow authenticated insert cursor_messages"
ON cursor_messages
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to update cursor_messages
-- For future use if Supabase auth is added
CREATE POLICY "Allow authenticated update cursor_messages"
ON cursor_messages
FOR UPDATE
TO authenticated
WITH CHECK (true);

-- Note: Service role key automatically bypasses RLS, so no policy needed

-- ============================================================================
-- Enable RLS on app_config table
-- ============================================================================

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anon users to read app_config
-- Used by: Next.js API routes and Python scripts using anon key
CREATE POLICY "Allow anon read app_config"
ON app_config
FOR SELECT
TO anon
USING (true);

-- Policy: Allow anon users to insert app_config
-- Used by: Next.js API routes and Python scripts using anon key
CREATE POLICY "Allow anon insert app_config"
ON app_config
FOR INSERT
TO anon
WITH CHECK (true);

-- Policy: Allow anon users to update app_config
-- Used by: Next.js API routes and Python scripts using anon key
CREATE POLICY "Allow anon update app_config"
ON app_config
FOR UPDATE
TO anon
WITH CHECK (true);

-- Policy: Allow authenticated users to read app_config
-- For future use if Supabase auth is added
CREATE POLICY "Allow authenticated read app_config"
ON app_config
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow authenticated users to insert app_config
-- For future use if Supabase auth is added
CREATE POLICY "Allow authenticated insert app_config"
ON app_config
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to update app_config
-- For future use if Supabase auth is added
CREATE POLICY "Allow authenticated update app_config"
ON app_config
FOR UPDATE
TO authenticated
WITH CHECK (true);

-- Note: Service role key automatically bypasses RLS, so no policy needed

