# Create RPC Function to Get Actual Table Size (223MB)

## Quick Steps

1. **Go to Supabase Dashboard**: https://supabase.com/dashboard
2. **Select your project**
3. **Click "SQL Editor"** in the left sidebar
4. **Click "New query"**
5. **Copy and paste this SQL**:

```sql
-- Create RPC function to get table size (for API access)
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

6. **Click "Run"** (or press Cmd/Ctrl + Enter)

You should see: `Success. No rows returned`

7. **Grant permissions** (run this in a new query):

```sql
GRANT EXECUTE ON FUNCTION get_table_size(text) TO anon;
GRANT EXECUTE ON FUNCTION get_table_size(text) TO authenticated;
```

8. **Test it** (run this in a new query):

```sql
SELECT get_table_size('cursor_messages');
```

You should see JSON output with your 223MB size.

## After Creating the Function

Once created, your Inspiration app will automatically use the actual table size instead of estimating!

Run this to verify:
```bash
cd Inspiration/engine
python3 scripts/test_rpc_function.py
```

You should see: `✅ RPC function exists and works!`

