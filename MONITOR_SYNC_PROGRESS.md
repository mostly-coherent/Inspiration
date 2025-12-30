# How to Monitor Vector DB Sync Progress

## Real-Time Monitoring

### Option 1: Watch the Log File (Recommended)
```bash
tail -f /tmp/sync_progress.log
```

This will show live updates as the script runs. Press `Ctrl+C` to stop watching.

### Option 2: Check Current Status
```bash
# See last 30 lines
tail -30 /tmp/sync_progress.log

# See only important progress messages
tail -100 /tmp/sync_progress.log | grep -E "(🚀|📅|📚|📊|🔍|Already|Need to|Processing batch|Indexed|✅|complete)"
```

### Option 3: Check if Script is Running
```bash
ps aux | grep index_all_messages.py | grep -v grep
```

If you see output, the script is still running. If no output, it has completed.

## Progress Indicators

### Loading Phase
```
📚 Loading conversations from LOCAL Cursor database (SQLite)...
📊 Found X conversations with Y messages
```
This phase scans your local database day by day (July 2025 to now).

### Deduplication Phase
```
🔍 Checking which messages already exist in Vector DB...
   ✅ Already indexed: X,XXX messages (skipping)
   🆕 Need to index: X,XXX messages
```
This checks which messages are already in Vector DB to avoid duplicates.

### Indexing Phase
```
📝 Processing X new messages...
  Processing batch 1/X...
  Processing batch 2/X...
  ✅ Indexed Y/X messages...
```
This generates embeddings and indexes new messages.

### Completion
```
✅ Indexing complete!
   Already indexed (skipped): X,XXX
   Newly indexed: X,XXX
   Failed: X
   Total processed: X,XXX
```

## Check Vector DB Size

You can also check your Vector DB size to see it growing:

```bash
cd Inspiration/engine
python3 scripts/get_brain_stats.py
```

Or check directly in Supabase:
```sql
SELECT pg_size_pretty(pg_total_relation_size('cursor_messages')) AS total_size;
```

## Estimated Time

- **Loading**: 5-15 minutes (depends on database size)
- **Deduplication check**: 1-2 minutes
- **Indexing**: 30-60 minutes (depends on new message count)

Total: ~45-75 minutes for full sync

## Troubleshooting

If the script seems stuck:
1. Check if it's still running: `ps aux | grep index_all_messages.py`
2. Check CPU usage: `top -pid $(pgrep -f index_all_messages.py)`
3. Check the log for errors: `grep -i error /tmp/sync_progress.log`

If you need to stop and restart:
```bash
# Stop the script
pkill -f index_all_messages.py

# Restart (it will skip already-indexed messages)
cd Inspiration/engine
python3 scripts/index_all_messages.py
```

