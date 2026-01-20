#!/usr/bin/env python3
"""
Cleanup script to delete existing Lenny's KG data before restarting indexing.

This script deletes:
1. All entity mentions where message_id LIKE 'lenny-%'
2. All relations where source_message_id LIKE 'lenny-%'
3. Entities that only have expert mentions (if they have user mentions, keep them)

Usage:
    python3 engine/scripts/cleanup_lenny_kg.py
    python3 engine/scripts/cleanup_lenny_kg.py --dry-run  # Preview what will be deleted
"""

import argparse
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv()

from engine.common.vector_db import get_supabase_client


def cleanup_lenny_kg(dry_run: bool = False):
    """Delete all Lenny's KG data (expert source)."""
    supabase = get_supabase_client()
    
    print("🧹 Cleaning up Lenny's KG data...")
    print("=" * 60)
    
    if dry_run:
        print("🔍 DRY RUN MODE - No data will be deleted")
        print()
    
    # Step 1: Count and delete Lenny's entity mentions
    print("1️⃣ Counting Lenny's entity mentions...")
    mentions_result = supabase.table("kg_entity_mentions")\
        .select("id", count="exact")\
        .like("message_id", "lenny-%")\
        .execute()
    
    mention_count = mentions_result.count if hasattr(mentions_result, 'count') else len(mentions_result.data)
    print(f"   Found {mention_count} mentions with message_id LIKE 'lenny-%'")
    
    if not dry_run and mention_count > 0:
        # Delete mentions in batches to avoid timeout
        print(f"   Deleting in batches of 1000...")
        batch_size = 1000
        total_deleted = 0
        
        while True:
            # Get a batch of IDs to delete
            batch = supabase.table("kg_entity_mentions")\
                .select("id")\
                .like("message_id", "lenny-%")\
                .limit(batch_size)\
                .execute()
            
            if not batch.data or len(batch.data) == 0:
                break
            
            batch_ids = [m["id"] for m in batch.data]
            deleted = supabase.table("kg_entity_mentions")\
                .delete()\
                .in_("id", batch_ids)\
                .execute()
            
            total_deleted += len(batch_ids)
            print(f"   Deleted {total_deleted} / {mention_count} mentions...", end="\r")
        
        print(f"\n   ✅ Deleted {total_deleted} mentions")
    else:
        print(f"   {'Would delete' if dry_run else 'No mentions to delete'}")
    
    # Step 2: Count and delete Lenny's relations
    print("\n2️⃣ Counting Lenny's relations...")
    relations_result = supabase.table("kg_relations")\
        .select("id", count="exact")\
        .like("source_message_id", "lenny-%")\
        .execute()
    
    relation_count = relations_result.count if hasattr(relations_result, 'count') else len(relations_result.data)
    print(f"   Found {relation_count} relations with source_message_id LIKE 'lenny-%'")
    
    if not dry_run and relation_count > 0:
        # Delete relations in batches
        print(f"   Deleting in batches of 1000...")
        batch_size = 1000
        total_deleted = 0
        
        while True:
            batch = supabase.table("kg_relations")\
                .select("id")\
                .like("source_message_id", "lenny-%")\
                .limit(batch_size)\
                .execute()
            
            if not batch.data or len(batch.data) == 0:
                break
            
            batch_ids = [r["id"] for r in batch.data]
            deleted = supabase.table("kg_relations")\
                .delete()\
                .in_("id", batch_ids)\
                .execute()
            
            total_deleted += len(batch_ids)
            print(f"   Deleted {total_deleted} / {relation_count} relations...", end="\r")
        
        print(f"\n   ✅ Deleted {total_deleted} relations")
    else:
        print(f"   {'Would delete' if dry_run else 'No relations to delete'}")
    
    # Step 3: Find and optionally delete entities that only have expert mentions
    print("\n3️⃣ Checking entities...")
    
    # Get all entities with expert mentions (from source_breakdown)
    # Note: We'll keep entities that have user mentions, only delete pure expert entities
    entities_result = supabase.table("kg_entities")\
        .select("id, canonical_name, mention_count, source_breakdown")\
        .execute()
    
    expert_only_entities = []
    for entity in entities_result.data:
        source_breakdown = entity.get("source_breakdown") or {}
        user_count = source_breakdown.get("user", 0)
        lenny_count = source_breakdown.get("lenny", 0)
        
        # If entity only has Lenny mentions (no user mentions), mark for deletion
        if lenny_count > 0 and user_count == 0:
            expert_only_entities.append(entity)
    
    print(f"   Found {len(expert_only_entities)} entities with only expert mentions")
    
    if not dry_run and len(expert_only_entities) > 0:
        # Delete entities that only have expert mentions
        entity_ids = [e["id"] for e in expert_only_entities]
        deleted_entities = supabase.table("kg_entities")\
            .delete()\
            .in_("id", entity_ids)\
            .execute()
        print(f"   ✅ Deleted {len(deleted_entities.data) if deleted_entities.data else len(expert_only_entities)} entities")
    else:
        print(f"   {'Would delete' if dry_run else 'No entities to delete'}")
    
    # Step 4: Summary
    print("\n" + "=" * 60)
    if dry_run:
        print("🔍 DRY RUN SUMMARY:")
        print(f"   Would delete: {mention_count} mentions, {relation_count} relations, {len(expert_only_entities)} entities")
        print("\n   Run without --dry-run to actually delete")
    else:
        print("✅ CLEANUP COMPLETE")
        print(f"   Deleted: {mention_count} mentions, {relation_count} relations, {len(expert_only_entities)} entities")
        print("\n   Ready to restart Lenny's indexing with triple-based foundation!")


def main():
    parser = argparse.ArgumentParser(description="Cleanup Lenny's KG data before restarting indexing")
    parser.add_argument("--dry-run", action="store_true", help="Preview what will be deleted without actually deleting")
    args = parser.parse_args()
    
    cleanup_lenny_kg(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
