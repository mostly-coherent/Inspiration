-- Get actual table size for cursor_messages table
-- Run this in Supabase SQL Editor to get the exact size

SELECT 
    pg_size_pretty(pg_total_relation_size('cursor_messages')) AS total_size,
    pg_total_relation_size('cursor_messages') AS total_size_bytes,
    pg_size_pretty(pg_relation_size('cursor_messages')) AS table_size,
    pg_relation_size('cursor_messages') AS table_size_bytes,
    pg_size_pretty(pg_indexes_size('cursor_messages')) AS indexes_size,
    pg_indexes_size('cursor_messages') AS indexes_size_bytes;

-- Create RPC function to get table size (optional - for API access)
CREATE OR REPLACE FUNCTION get_table_size(table_name text)
RETURNS json AS $$
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
$$ LANGUAGE plpgsql;

