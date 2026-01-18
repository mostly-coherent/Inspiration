# Fix SQL Functions - Quick Reference

## Problem
Error: "structure of query does not match function result type"

This happens because the SQL functions in Supabase still have the old signatures (UUID types) while the code expects TEXT types.

## Solution

### Step 1: Drop Old Functions
Run this in Supabase SQL Editor to clean up broken functions:

```sql
-- Drop Evolution functions
DROP FUNCTION IF EXISTS get_entity_evolution(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS get_entities_evolution(UUID[], TEXT, INT);
DROP FUNCTION IF EXISTS get_trending_entities(TEXT, INT, INT, INT);
DROP FUNCTION IF EXISTS get_kg_activity_timeline(TEXT, INT);

-- Drop Intelligence functions
DROP FUNCTION IF EXISTS detect_problem_solution_patterns(INT, INT);
DROP FUNCTION IF EXISTS detect_missing_links(INT, INT);
DROP FUNCTION IF EXISTS find_entity_path(UUID, UUID, INT);
DROP FUNCTION IF EXISTS find_entity_clusters(INT, INT);
```

### Step 2: Run Corrected SQL Scripts

1. **Evolution Schema**: Copy entire contents of `engine/scripts/add_evolution_schema.sql` → Paste in Supabase SQL Editor → Run
2. **Intelligence Schema**: Copy entire contents of `engine/scripts/add_intelligence_schema.sql` → Paste in Supabase SQL Editor → Run

## What Was Fixed

1. ✅ **UUID → TEXT**: Changed all entity ID parameters and return types from `UUID` to `TEXT`
2. ✅ **Timestamp Conversion**: Fixed `message_timestamp` (BIGINT milliseconds) → TIMESTAMPTZ conversion using `to_timestamp(m.message_timestamp / 1000)`
3. ✅ **Enum Casting**: Added explicit `::TEXT` casts for `entity_type` enum columns

## Verification

After running the SQL scripts, test the API:

```bash
# Test Intelligence API
curl "http://localhost:3000/api/kg/intelligence?type=patterns&limit=5"

# Test Evolution API
curl "http://localhost:3000/api/kg/evolution?mode=trending&limit=5"
```

Both should return JSON data, not errors.
