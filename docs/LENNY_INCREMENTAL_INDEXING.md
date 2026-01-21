# Incremental Lenny Episode Indexing

## Overview

The `index_lenny_kg_parallel.py` script is designed for **incremental indexing** - it automatically skips episodes/chunks that are already indexed, making it perfect for enriching Lenny's KG as new episodes are released.

## How It Works

The script checks for already-indexed chunks by querying `kg_entity_mentions` for chunks with `message_id` starting with `lenny-`. If a chunk is already indexed, it's automatically skipped.

**Key Features:**
- ✅ **Automatic skip**: Already-indexed chunks are detected and skipped
- ✅ **Resume capability**: Can stop and resume indexing without re-processing
- ✅ **Parallel processing**: 4 workers by default (configurable)
- ✅ **Quality filtering**: Only indexes high-quality chunks (score >= 0.35)
- ✅ **Error handling**: Retry logic with exponential backoff

## Usage

### Basic Incremental Indexing

```bash
# Index all new episodes (skips already-indexed chunks)
cd /path/to/Inspiration
python3 engine/scripts/index_lenny_kg_parallel.py --with-relations
```

### Dry Run (Preview What Will Be Indexed)

```bash
# See what would be indexed without actually doing it
python3 engine/scripts/index_lenny_kg_parallel.py --dry-run --limit 10
```

### Custom Worker Count

```bash
# Use more workers for faster indexing (if you have API rate limits)
python3 engine/scripts/index_lenny_kg_parallel.py --with-relations --workers 6
```

### Limit Number of Episodes

```bash
# Index only first 5 episodes (useful for testing)
python3 engine/scripts/index_lenny_kg_parallel.py --with-relations --limit 5
```

## Workflow for New Episodes

### Step 1: Download New Transcripts

1. Clone/update Lenny's podcast transcripts repository:
   ```bash
   cd data/lenny-transcripts
   git pull origin main  # or however you sync transcripts
   ```

2. Or download individual episode transcripts manually to `data/lenny-transcripts/`

### Step 2: Run Incremental Indexing

```bash
cd /path/to/Inspiration
python3 engine/scripts/index_lenny_kg_parallel.py --with-relations
```

The script will:
- ✅ Detect new episodes automatically
- ✅ Skip already-indexed chunks
- ✅ Process only new chunks
- ✅ Extract entities and relations
- ✅ Store in Supabase KG tables

### Step 3: Verify Indexing

```bash
# Check indexing status
python3 engine/scripts/verify_lenny_index.py
```

## Script Options

| Option | Description | Default |
|--------|-------------|---------|
| `--with-relations` | Extract relations between entities | False |
| `--workers N` | Number of parallel workers | 4 |
| `--limit N` | Limit number of episodes to process | None (all) |
| `--dry-run` | Preview without indexing | False |

## How Skip Detection Works

The script uses this logic to detect already-indexed chunks:

```python
# 1. Fetch all existing chunk IDs from kg_entity_mentions
indexed_chunks = get_indexed_chunk_ids(supabase)  # Returns set of message_ids

# 2. For each chunk, check if already indexed
existing = supabase.table("kg_entity_mentions")
    .select("id")
    .eq("message_id", chunk_id)
    .limit(1)
    .execute()

if existing.data:
    # Skip this chunk - already indexed
    stats["skip_reason"] = "already_indexed"
    return stats
```

**Chunk ID Format:** `lenny-{episode_name}-{chunk_index}`

Example: `lenny-ada-chen-rekhi-1`, `lenny-ada-chen-rekhi-2`, etc.

## Performance

- **Sequential version** (`index_lenny_kg.py`): ~1-2 chunks/second
- **Parallel version** (`index_lenny_kg_parallel.py`): ~4-8 chunks/second (with 4 workers)

**Typical indexing time:**
- Single episode (~50-100 chunks): 1-2 minutes
- 10 episodes: 10-20 minutes
- Full archive (300+ episodes): 2-4 hours

## Troubleshooting

### Script Re-indexes Already-Indexed Chunks

**Cause:** Database connection issue or RLS policy blocking reads

**Solution:**
1. Check Supabase connection: `python3 -c "from engine.common.config import get_supabase_client; print(get_supabase_client())"`
2. Verify RLS policies allow reads on `kg_entity_mentions`
3. Check if `message_id` column exists and is indexed

### Some Episodes Not Indexed

**Cause:** Quality filter rejecting low-quality chunks

**Solution:**
- Check quality scores in output logs
- Review `QUALITY_THRESHOLD` in script (default: 0.35)
- Low-quality chunks are logged but skipped

### API Rate Limits

**Cause:** Too many parallel workers hitting API limits

**Solution:**
- Reduce worker count: `--workers 2`
- Script has built-in retry logic with exponential backoff
- Consider using `--limit` to process in batches

## Related Scripts

- **`index_lenny_kg.py`**: Sequential version (slower, simpler)
- **`verify_lenny_index.py`**: Verify indexing completeness
- **`export_lenny_kg.py`**: Export indexed KG for distribution
- **`cleanup_lenny_kg.py`**: Clean up before re-indexing (use with caution!)

## Example Output

```
🎙️  Parallel Lenny KG Indexer
============================================================
   Episodes found: 303
   Chunks to process: 16,791
   Already indexed: 16,791
   New chunks: 0
   
✅ All chunks already indexed!
```

Or for new episodes:

```
🎙️  Parallel Lenny KG Indexer
============================================================
   Episodes found: 305
   Chunks to process: 17,050
   Already indexed: 16,791
   New chunks: 259
   
📊 Processing 259 new chunks with 4 workers...
   ✅ Processed: 259 chunks
   ⏭️  Skipped: 0
   ❌ Errors: 0
   
✅ Indexing complete!
```

## Next Steps After Indexing

1. **Export updated KG** (if distributing):
   ```bash
   python3 engine/scripts/export_lenny_kg.py --output-dir ./exports/lenny-kg
   ```

2. **Create GitHub Release** with updated JSON files

3. **Update users** via app UI or CLI import
