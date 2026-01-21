#!/usr/bin/env python3
"""Verify Lenny KG export doesn't contain user data."""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.config import get_supabase_client

supabase = get_supabase_client()

print("🔍 Verifying Lenny KG Export")
print("=" * 50)

# Check total counts
print("\n📊 Database Totals:")
total_entities = supabase.from_("kg_entities").select("id", count="exact").execute()
print(f"  Total entities: {total_entities.count:,}")

total_mentions = supabase.from_("kg_entity_mentions").select("id", count="exact").execute()
print(f"  Total mentions: {total_mentions.count:,}")

total_relations = supabase.from_("kg_relations").select("id", count="exact").execute()
print(f"  Total relations: {total_relations.count:,}")

# Check Lenny vs User breakdown
print("\n🔍 Source Breakdown:")

# Entities
lenny_entities = supabase.from_("kg_entities").select("id", count="exact").in_("source_type", ["expert", "lenny"]).execute()
user_entities = supabase.from_("kg_entities").select("id", count="exact").eq("source_type", "user").execute()
both_entities = supabase.from_("kg_entities").select("id", count="exact").eq("source_type", "both").execute()
print(f"  Entities - Lenny: {lenny_entities.count:,}, User: {user_entities.count:,}, Both: {both_entities.count:,}")

# Mentions
lenny_mentions = supabase.from_("kg_entity_mentions").select("id", count="exact").like("message_id", "lenny-%").execute()
print(f"  Mentions - Lenny (by message_id): {lenny_mentions.count:,}")

# Check conversations
print("\n📋 Conversations Analysis:")
try:
    total_conv = supabase.from_("kg_conversations").select("id", count="exact").execute()
    print(f"  Total conversations: {total_conv.count:,}")
    
    # Check by source_type
    lenny_conv_type = supabase.from_("kg_conversations").select("id", count="exact").in_("source_type", ["expert", "lenny"]).execute()
    print(f"  Lenny conversations (source_type): {lenny_conv_type.count:,}")
    
    # Check by conversation_id pattern
    lenny_conv_id = supabase.from_("kg_conversations").select("id", count="exact").like("conversation_id", "lenny-%").execute()
    print(f"  Lenny conversations (conversation_id pattern): {lenny_conv_id.count:,}")
    
    # Check by source column
    try:
        lenny_conv_source = supabase.from_("kg_conversations").select("id", count="exact").in_("source", ["expert", "lenny"]).execute()
        print(f"  Lenny conversations (source column): {lenny_conv_source.count:,}")
    except Exception as e:
        print(f"  Source column check failed: {e}")
    
    # Sample conversations
    print("\n  Sample conversations:")
    sample = supabase.from_("kg_conversations").select("*").limit(10).execute()
    if sample.data:
        for conv in sample.data[:5]:
            print(f"    - ID: {conv.get('id')}, conversation_id: {conv.get('conversation_id')}, source_type: {conv.get('source_type')}, source: {conv.get('source')}")
    
    # Count unique conversation_ids
    all_conv = supabase.from_("kg_conversations").select("conversation_id").execute()
    if all_conv.data:
        unique_conv_ids = set(c.get("conversation_id") for c in all_conv.data if c.get("conversation_id"))
        lenny_conv_ids = [c for c in unique_conv_ids if c and (c.startswith("lenny-") or "lenny" in c.lower())]
        print(f"\n  Unique conversation_ids: {len(unique_conv_ids):,}")
        print(f"  Lenny conversation_ids (by pattern): {len(lenny_conv_ids):,}")
        
except Exception as e:
    print(f"  Error checking conversations: {e}")

# Verify exported files
print("\n📦 Checking Exported Files:")
export_dir = Path(__file__).parent.parent.parent.parent / "exports" / "lenny-kg"

if export_dir.exists():
    entities_file = export_dir / "lenny_kg_entities.json"
    if entities_file.exists():
        with open(entities_file, "r") as f:
            entities = json.load(f)
        print(f"  Exported entities: {len(entities):,}")
        
        # Check for user data contamination
        user_contamination = [e for e in entities if e.get("source_type") == "user"]
        if user_contamination:
            print(f"  ⚠️  WARNING: Found {len(user_contamination)} user entities in export!")
        else:
            print(f"  ✅ No user entities found in export")
        
        # Check source_type distribution
        source_types = {}
        for e in entities:
            st = e.get("source_type", "unknown")
            source_types[st] = source_types.get(st, 0) + 1
        print(f"  Source type breakdown: {source_types}")
    
    mentions_file = export_dir / "lenny_kg_mentions.json"
    if mentions_file.exists():
        with open(mentions_file, "r") as f:
            mentions = json.load(f)
        print(f"  Exported mentions: {len(mentions):,}")
        
        # Check for user mentions
        user_mentions = [m for m in mentions if m.get("message_id") and not m.get("message_id", "").startswith("lenny-")]
        if user_mentions:
            print(f"  ⚠️  WARNING: Found {len(user_mentions)} non-Lenny mentions!")
            print(f"      Sample message_ids: {[m.get('message_id') for m in user_mentions[:5]]}")
        else:
            print(f"  ✅ All mentions have lenny- prefix")
    
    relations_file = export_dir / "lenny_kg_relations.json"
    if relations_file.exists():
        with open(relations_file, "r") as f:
            relations = json.load(f)
        print(f"  Exported relations: {len(relations):,}")
    
    conversations_file = export_dir / "lenny_kg_conversations.json"
    if conversations_file.exists():
        with open(conversations_file, "r") as f:
            conversations = json.load(f)
        print(f"  Exported conversations: {len(conversations):,}")
        
        # Check conversation_id patterns
        conv_ids = [c.get("conversation_id") for c in conversations if c.get("conversation_id")]
        lenny_conv_ids = [c for c in conv_ids if c and c.startswith("lenny-")]
        print(f"  Conversations with lenny- prefix: {len(lenny_conv_ids):,}")
        print(f"  Unique conversation_ids: {len(set(conv_ids)):,}")
        
        if len(set(conv_ids)) != len(lenny_conv_ids):
            print(f"  ⚠️  WARNING: Some conversations don't have lenny- prefix!")
            non_lenny = [c for c in set(conv_ids) if c and not c.startswith("lenny-")]
            print(f"      Non-Lenny conversation_ids: {non_lenny[:10]}")
else:
    print("  ⚠️  Export directory not found")

print("\n" + "=" * 50)
