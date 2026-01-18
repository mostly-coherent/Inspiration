#!/usr/bin/env python3
"""Quick progress check for KG indexing."""
import sys
import time
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from engine.common.vector_db import get_supabase_client

# Store baseline (updated 2026-01-16 13:30)
BASELINE_EXPERT = 1791  # Current count at start of full indexing
BASELINE_MENTIONS = 7165
START_TIME = 1737063544  # Unix timestamp when indexing started (2026-01-16 13:19)

client = get_supabase_client()

# Get current stats
stats = client.rpc('get_kg_stats').execute()
result = client.rpc('get_entities_by_source', {'p_source_type': None, 'p_limit': 5000}).execute()

by_source = {}
for e in result.data:
    by_source[e['source_type']] = by_source.get(e['source_type'], 0) + 1

# Calculate
current_expert = by_source.get('expert', 0)
current_mentions = stats.data['totalMentions']
delta_expert = current_expert - BASELINE_EXPERT
delta_mentions = current_mentions - BASELINE_MENTIONS

elapsed_min = (time.time() - START_TIME) / 60
rate = delta_expert / elapsed_min if elapsed_min > 0 else 0

print(f"🔍 KG Indexing Progress - {datetime.now().strftime('%H:%M:%S')}")
print("=" * 60)
print(f"Expert entities:  {current_expert:,} (+{delta_expert:,} since start)")
print(f"Total mentions:   {current_mentions:,} (+{delta_mentions:,})")
print(f"Cross-source:     {by_source.get('both', 0)}")
print(f"Rate:             {rate:.1f} expert entities/min")
print(f"Runtime:          {elapsed_min:.0f} minutes")
if rate > 0:
    remaining = 3000 - current_expert
    eta_hours = remaining / (rate * 60)
    print(f"ETA (~3000 target): {eta_hours:.1f} hours")
