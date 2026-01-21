#!/usr/bin/env python3
"""Quick script to check Lenny relations in database."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.config import get_supabase_client

supabase = get_supabase_client()

# Check total relations
print("Checking relations...")
total = supabase.from_("kg_relations").select("id", count="exact").execute()
print(f"Total relations: {total.count}")

# Check by message_id pattern
lenny_by_message = supabase.from_("kg_relations").select("id", count="exact").like("message_id", "lenny-%").execute()
print(f"Lenny relations (by message_id pattern): {lenny_by_message.count}")

# Check by source column
try:
    lenny_by_source = supabase.from_("kg_relations").select("id", count="exact").in_("source", ["expert", "lenny"]).execute()
    print(f"Lenny relations (by source column): {lenny_by_source.count}")
except Exception as e:
    print(f"Source column check failed: {e}")

# Check relations where source OR target entity has Lenny mentions
print("\nChecking relations via entity source...")
# Get all Lenny entity IDs
lenny_entities_response = supabase.from_("kg_entities").select("id").in_("source_type", ["expert", "lenny"]).limit(10000).execute()
lenny_entity_ids = [e["id"] for e in (lenny_entities_response.data or [])]
print(f"Found {len(lenny_entity_ids)} Lenny entities")

if lenny_entity_ids:
    # Check relations where source entity is Lenny
    lenny_source_relations = supabase.from_("kg_relations").select("id", count="exact").in_("source_entity_id", lenny_entity_ids[:1000]).execute()
    print(f"Relations with Lenny source entity: {lenny_source_relations.count}")
    
    # Check relations where target entity is Lenny
    lenny_target_relations = supabase.from_("kg_relations").select("id", count="exact").in_("target_entity_id", lenny_entity_ids[:1000]).execute()
    print(f"Relations with Lenny target entity: {lenny_target_relations.count}")

# Get sample relations
print("\nSample relations:")
sample = supabase.from_("kg_relations").select("*").limit(5).execute()
if sample.data:
    for rel in sample.data:
        print(f"  - ID: {rel.get('id')}, message_id: {rel.get('message_id')}, source: {rel.get('source')}")

# Check if any relations have message_id matching Lenny pattern
print("\nChecking for relations with Lenny message_ids...")
# Try to find relations that might be Lenny by checking if they reference Lenny entities
if lenny_entity_ids:
    sample_lenny_rel = supabase.from_("kg_relations").select("*").in_("source_entity_id", lenny_entity_ids[:100]).limit(5).execute()
    if sample_lenny_rel.data:
        print("Sample relations involving Lenny entities:")
        for rel in sample_lenny_rel.data:
            print(f"  - source: {rel.get('source_entity_id')}, target: {rel.get('target_entity_id')}, message_id: {rel.get('message_id')}, source_col: {rel.get('source')}")
