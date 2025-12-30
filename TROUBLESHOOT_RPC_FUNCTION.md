# Troubleshooting RPC Function

## If RPC Function Not Found

The function might need permissions or the schema cache needs refreshing. Try these steps:

### Step 1: Verify Function Exists

Run this in Supabase SQL Editor:

```sql
SELECT 
    proname as function_name,
    pg_get_function_arguments(oid) as arguments
FROM pg_proc 
WHERE proname = 'get_table_size';
```

If you see results, the function exists. If not, create it.

### Step 2: Create/Recreate Function

Run this in Supabase SQL Editor:

```sql
-- Drop if exists (to recreate)
DROP FUNCTION IF EXISTS get_table_size(text);

-- Create RPC function
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
```

### Step 3: Grant Permissions

```sql
GRANT EXECUTE ON FUNCTION get_table_size(text) TO anon;
GRANT EXECUTE ON FUNCTION get_table_size(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_size(text) TO service_role;
```

### Step 4: Test Function Directly

```sql
SELECT get_table_size('cursor_messages');
```

You should see JSON output with the table size.

### Step 5: Refresh Schema Cache

Sometimes Supabase needs to refresh its schema cache. Try:

1. Wait 1-2 minutes after creating the function
2. Or restart your Supabase project (if you have access)
3. Or the cache will refresh automatically after a few minutes

### Step 6: Verify from App

After waiting a minute, test again:

```bash
cd Inspiration/engine
python3 scripts/test_rpc_function.py
```

## Alternative: Use Direct SQL Query

If the RPC function still doesn't work, we can modify the script to use a direct SQL query instead. Let me know if you'd like me to do that!

