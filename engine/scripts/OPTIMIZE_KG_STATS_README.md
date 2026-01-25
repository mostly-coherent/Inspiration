# KG Stats API Optimization

## Overview

Optimized the `/api/kg/stats` endpoint to reduce loading time from multiple seconds to milliseconds through:
1. **Server-side RPC function** - Single database call instead of multiple client-side queries
2. **In-memory caching** - 30-second cache to avoid repeated database hits
3. **Optimized SQL queries** - Efficient counting with proper indexes

## Performance Improvements

**Before:**
- Multiple sequential database queries (entities, mentions, relations, byType)
- Pagination loops for large datasets
- Fallback strategies adding extra queries
- **Estimated time: 2-5 seconds** for expert source type

**After:**
- Single RPC function call (all data in one query)
- 30-second cache (subsequent requests instant)
- Optimized SQL with proper joins
- **Estimated time: 50-200ms** (first call), **<10ms** (cached)

## Changes Made

### 1. New RPC Function (`optimize_kg_stats_rpc.sql`)

Created `get_kg_stats_by_source_type(p_source_type TEXT)` that:
- Accepts `'all'`, `'user'`, `'expert'`, or `'both'` as parameter
- Returns all stats in a single JSON response
- Uses efficient SQL with proper WHERE clauses
- Handles "both" source type with JOINs (no pagination needed)

**To deploy:**
```sql
-- Run in Supabase SQL Editor
\i engine/scripts/optimize_kg_stats_rpc.sql
```

Or copy/paste the SQL from `optimize_kg_stats_rpc.sql` into Supabase SQL Editor.

### 2. API Route Updates (`src/app/api/kg/stats/route.ts`)

**Added:**
- In-memory cache with 30-second TTL
- Cache key based on `sourceType` parameter
- Automatic cache cleanup (max 100 entries)
- Fallback to original RPC if new RPC doesn't exist
- Fallback to manual queries if RPCs don't exist

**Cache behavior:**
- First request: Hits database, caches result
- Subsequent requests (within 30s): Returns cached data instantly
- Cache expires after 30 seconds
- Cache cleared on serverless function restart (expected behavior)

### 3. Backward Compatibility

The API maintains full backward compatibility:
1. Tries new optimized RPC first (`get_kg_stats_by_source_type`)
2. Falls back to original RPC (`get_kg_stats`) for "all" source type
3. Falls back to manual queries if RPCs don't exist

## Deployment Steps

1. **Deploy SQL function:**
   ```bash
   # Copy SQL from optimize_kg_stats_rpc.sql
   # Paste into Supabase SQL Editor → Run
   ```

2. **Deploy API changes:**
   ```bash
   # Already updated in route.ts
   # Deploy to Vercel (or your hosting platform)
   ```

3. **Verify:**
   ```bash
   # Test the API endpoint
   curl "http://localhost:3000/api/kg/stats?sourceType=expert"
   
   # Should return JSON with all stats
   # Second call should be instant (cached)
   ```

## Testing

**Test RPC function directly:**
```sql
-- In Supabase SQL Editor
SELECT get_kg_stats_by_source_type('all');
SELECT get_kg_stats_by_source_type('user');
SELECT get_kg_stats_by_source_type('expert');
SELECT get_kg_stats_by_source_type('both');
```

**Test API endpoint:**
```bash
# First call (hits database)
time curl "http://localhost:3000/api/kg/stats?sourceType=expert"

# Second call (uses cache)
time curl "http://localhost:3000/api/kg/stats?sourceType=expert"
```

## Production Considerations

**Current implementation (in-memory cache):**
- ✅ Works for serverless (Vercel, etc.)
- ✅ Simple, no external dependencies
- ❌ Cache lost on function restart
- ❌ Not shared across instances

**For production scale (optional future improvements):**
- Use Vercel KV or Redis for shared cache
- Increase cache TTL to 5 minutes
- Add cache invalidation on KG updates
- Consider stale-while-revalidate pattern

## Monitoring

Watch for:
- RPC function errors (should fall back gracefully)
- Cache hit rate (check logs for cache misses)
- Response times (should see dramatic improvement)

## Rollback

If issues occur:
1. The API automatically falls back to manual queries
2. To remove RPC function:
   ```sql
   DROP FUNCTION IF EXISTS get_kg_stats_by_source_type(TEXT);
   ```
3. API will continue working with fallback queries
