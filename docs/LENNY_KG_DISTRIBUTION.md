# Lenny's Knowledge Graph Distribution

> **Purpose:** Enable zero-setup Knowledge Graph by distributing pre-computed Lenny KG data via GitHub Releases, similar to embeddings distribution.

---

## Overview

Just like Lenny's embeddings are distributed via [GitHub Releases](https://github.com/mostly-coherent/Inspiration/releases/tag/v1.0.0-lenny), Lenny's Knowledge Graph (entities, mentions, relations) can be exported and distributed so users don't need to re-index transcripts.

**Benefits:**
- ✅ **Zero-setup KG** — Users get 13,878+ entities instantly without indexing
- ✅ **Incremental updates** — New episodes can be added without full re-index
- ✅ **Consistent data** — Everyone gets the same canonical entity names and relations
- ✅ **Fast onboarding** — Import takes ~2-5 minutes vs ~2-3 hours of indexing

---

## Architecture

### Export Flow (Developer)

```bash
# 1. Export Lenny KG from your Supabase instance
python3 engine/scripts/export_lenny_kg.py --output-dir ./exports/lenny-kg

# 2. Creates JSON files:
#    - lenny_kg_manifest.json (metadata)
#    - lenny_kg_entities.json (~20MB)
#    - lenny_kg_mentions.json (~30MB)
#    - lenny_kg_relations.json (~10MB)
#    - lenny_kg_conversations.json (optional)

# 3. Create GitHub Release tag: v1.0.0-lenny-kg
# 4. Upload all JSON files as release assets
```

### Import Flow (User)

```bash
# Option 1: Via UI (Recommended)
# Click "Import Lenny's KG" button in app → Downloads + imports automatically

# Option 2: Via CLI
# 1. Download files
bash scripts/download-lenny-kg.sh

# 2. Import into Supabase
python3 engine/scripts/import_lenny_kg.py --data-dir ./data/lenny-kg
```

---

## Files

| File | Size | Description |
|------|------|-------------|
| `lenny_kg_manifest.json` | ~1KB | Export metadata (version, date, counts) |
| `lenny_kg_entities.json` | ~20MB | All entities with `source_type='expert'` or `'lenny'` |
| `lenny_kg_mentions.json` | ~30MB | All entity mentions from Lenny episodes |
| `lenny_kg_relations.json` | ~10MB | All relations between Lenny entities |
| `lenny_kg_conversations.json` | ~5MB | Episode-level conversations (optional) |

**Total:** ~65MB (compressed: ~15-20MB)

---

## Export Script

**Location:** `engine/scripts/export_lenny_kg.py`

**Usage:**
```bash
python3 engine/scripts/export_lenny_kg.py \
  --output-dir ./exports/lenny-kg \
  --episode-count 303
```

**What it does:**
1. Connects to Supabase (uses `SUPABASE_URL` and `SUPABASE_ANON_KEY`)
2. Exports all entities with `source_type IN ('expert', 'lenny')`
3. Exports all mentions with `message_id LIKE 'lenny-%'` or `source_type IN ('expert', 'lenny')`
4. Exports all relations with matching source filters
5. Creates manifest file with export metadata

**Output:**
- JSON files ready for GitHub Release
- Manifest with entity/mention/relation counts

---

## Import Script

**Location:** `engine/scripts/import_lenny_kg.py`

**Usage:**
```bash
python3 engine/scripts/import_lenny_kg.py \
  --data-dir ./data/lenny-kg \
  [--dry-run]
```

**What it does:**
1. Loads JSON files from `data-dir`
2. Imports entities (with deduplication by `canonical_name`)
3. Imports mentions (ensures `entity_id` exists)
4. Imports relations (ensures `source_entity_id` and `target_entity_id` exist)
5. Imports conversations (optional, with deduplication)

**Deduplication:**
- **Entities:** Skip if `canonical_name` + `entity_type` already exists
- **Mentions:** Skip if `message_id` + `entity_id` already exists
- **Relations:** Skip if `source_entity_id` + `target_entity_id` + `relation_type` already exists

**Idempotent:** Safe to run multiple times (skips duplicates)

---

## API Endpoint

**Location:** `src/app/api/lenny-kg-import/route.ts`

**Endpoint:** `POST /api/lenny-kg-import`

**What it does:**
1. Downloads KG files from GitHub Releases (`v1.0.0-lenny-kg`)
2. Saves to `/tmp/lenny-kg` (cloud) or `./data/lenny-kg` (local)
3. Runs `import_lenny_kg.py` script
4. Returns import stats (entities, mentions, relations imported)

**Response:**
```json
{
  "success": true,
  "message": "Lenny's Knowledge Graph imported successfully",
  "stats": {
    "entities": 13878,
    "mentions": 50815,
    "relations": 1234,
    "conversations": 0
  }
}
```

---

## UI Integration

**Location:** `src/components/ScoreboardHeader.tsx`

**Button:** "Import Lenny's KG" (similar to embeddings download button)

**States:**
- **Idle:** "Import Lenny's KG" button visible
- **Downloading:** "Downloading KG files..." message
- **Importing:** "Importing into Supabase..." message
- **Success:** "✓ KG imported: 13,878 entities, 50,815 mentions"
- **Error:** Error message displayed

**When to show:**
- Show when Supabase is configured
- Hide when Lenny KG is already imported (check `kg_entities` with `source_type='expert'`)

---

## GitHub Release Workflow

### Creating a Release

1. **Export KG data:**
   ```bash
   python3 engine/scripts/export_lenny_kg.py --output-dir ./exports/lenny-kg
   ```

2. **Create GitHub Release:**
   - Tag: `v1.0.0-lenny-kg` (or `v1.1.0-lenny-kg` for updates)
   - Title: "Lenny's Knowledge Graph v1.0.0"
   - Description: Include entity/mention/relation counts

3. **Upload assets:**
   - `lenny_kg_manifest.json`
   - `lenny_kg_entities.json`
   - `lenny_kg_mentions.json`
   - `lenny_kg_relations.json`
   - `lenny_kg_conversations.json` (if available)

4. **Update release notes:**
   ```
   Pre-computed Knowledge Graph for Lenny's Podcast integration.
   
   **Latest Update:** 2026-01-20
   - ✅ 303 expert episodes
   - ✅ 13,878 entities
   - ✅ 50,815 mentions
   - ✅ 1,234 relations
   ```

### Incremental Updates

When new episodes are added:
1. Re-run indexing for new episodes only
2. Export updated KG (includes new + existing data)
3. Create new release tag (`v1.1.0-lenny-kg`)
4. Users can re-import (script handles deduplication)

---

## Security & Privacy

**✅ Safe to distribute:**
- All data is from open-sourced Lenny transcripts
- No user data included (only `source_type='expert'` or `'lenny'`)
- Public domain content

**✅ User data protected:**
- Import script only adds Lenny data
- User's existing KG data (`source_type='user'`) is never touched
- Deduplication preserves user's entity names if they match

---

## Troubleshooting

### Import fails with "entity_id not found"
**Cause:** Mentions reference entities that don't exist  
**Fix:** Import entities first, then mentions (script handles this automatically)

### Import is slow
**Cause:** Large dataset (~50MB JSON files)  
**Fix:** Normal for first import. Subsequent imports are faster (deduplication skips existing data)

### "Supabase not configured" error
**Cause:** Missing `SUPABASE_URL` or `SUPABASE_ANON_KEY`  
**Fix:** Configure Supabase in `.env.local` or app settings

### GitHub download fails
**Cause:** Network issue or release not found  
**Fix:** Check release tag exists, verify internet connection, try again

---

## Future Enhancements

- **Compression:** Compress JSON files (gzip) to reduce download size
- **Incremental updates:** Only download/import changed entities
- **Progress tracking:** Show import progress in UI
- **Validation:** Verify imported data matches manifest counts
- **Rollback:** Ability to remove imported Lenny KG if needed

---

**Last Updated:** 2026-01-20  
**Status:** ✅ Ready for implementation
