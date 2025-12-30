# Supabase Setup: Get Actual Table Size

## Step-by-Step Instructions

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Select your project
3. Click on **"SQL Editor"** in the left sidebar
4. Click **"New query"**

### Step 2: Run the Table Size Query

Copy and paste this SQL into the editor:

```sql
-- Get actual table size for cursor_messages table
SELECT 
    pg_size_pretty(pg_total_relation_size('cursor_messages')) AS total_size,
    pg_total_relation_size('cursor_messages') AS total_size_bytes,
    pg_size_pretty(pg_relation_size('cursor_messages')) AS table_size,
    pg_relation_size('cursor_messages') AS table_size_bytes,
    pg_size_pretty(pg_indexes_size('cursor_messages')) AS indexes_size,
    pg_indexes_size('cursor_messages') AS indexes_size_bytes;
```

Click **"Run"** (or press Cmd/Ctrl + Enter)

You should see output like:
```
total_size: 223 MB
total_size_bytes: 233832448
table_size: 180 MB
table_size_bytes: 188743680
indexes_size: 43 MB
indexes_size_bytes: 45088768
```

### Step 3: Create the RPC Function (for API access)

Copy and paste this SQL into a **new query**:

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

Click **"Run"**

You should see: `Success. No rows returned`

### Step 4: Verify the Function Works

Run this test query:

```sql
SELECT get_table_size('cursor_messages');
```

You should see JSON output with the table size information.

### Step 5: Grant Permissions (if needed)

If you get permission errors, run:

```sql
GRANT EXECUTE ON FUNCTION get_table_size(text) TO anon;
GRANT EXECUTE ON FUNCTION get_table_size(text) TO authenticated;
```

## What This Does

- **Step 2**: Shows you the actual table size right now (223MB)
- **Step 3**: Creates an RPC function that your app can call to get the size dynamically
- **Step 4**: Verifies the function works
- **Step 5**: Ensures your app can call the function

After completing these steps, your Inspiration app will automatically use the actual table size instead of estimating!

