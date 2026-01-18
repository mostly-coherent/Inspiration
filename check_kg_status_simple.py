#!/usr/bin/env python3
"""Simple, reliable KG progress check."""
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from engine.common.vector_db import get_supabase_client

client = get_supabase_client()

print(f"🔍 KG Status - {datetime.now().strftime('%H:%M:%S')}")
print("=" * 60)

# Direct table queries (most reliable)
entities_result = client.table('kg_entities').select('*', count='exact').eq('source_type', 'expert').execute()
print(f"✅ Expert entities:  {entities_result.count:,}")

mentions_result = client.table('kg_entity_mentions').select('*', count='exact').like('message_id', 'lenny-%').execute()
print(f"✅ Total mentions:   {mentions_result.count:,}")

# Count unique chunks with pagination
all_chunk_ids = set()
page_size = 1000
offset = 0

while True:
    result = client.table('kg_entity_mentions').select('message_id').like('message_id', 'lenny-%').range(offset, offset + page_size - 1).execute()
    
    if not result.data:
        break
    
    for row in result.data:
        all_chunk_ids.add(row['message_id'])
    
    if len(result.data) < page_size:
        break
    
    offset += page_size

print(f"✅ Chunks indexed:   {len(all_chunk_ids):,}")

# Calculate rough progress (assuming ~44K total chunks)
TOTAL_CHUNKS = 44371
progress_pct = (len(all_chunk_ids) / TOTAL_CHUNKS) * 100
print(f"📊 Progress:         {progress_pct:.1f}% ({len(all_chunk_ids):,} / {TOTAL_CHUNKS:,})")

# Estimate remaining
remaining_chunks = TOTAL_CHUNKS - len(all_chunk_ids)
print(f"⏳ Remaining:        {remaining_chunks:,} chunks")

print()
print("💡 Note: These are REAL counts from the database")
print("   (not estimates or cached values)")
