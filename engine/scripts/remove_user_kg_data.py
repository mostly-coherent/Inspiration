#!/usr/bin/env python3
"""
Remove all user Knowledge Graph data from Supabase.

This script will:
1. Delete all entities with source_type='user'
2. Delete all mentions with message_id NOT starting with 'lenny-'
3. Delete all relations involving user entities
4. Delete all user conversations
5. Update 'both' entities to 'expert' or 'lenny' (if they have Lenny mentions)

WARNING: This is destructive and cannot be undone!
"""

import sys
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.config import get_supabase_client

def confirm_destructive_action():
    """Require explicit confirmation."""
    print("⚠️  WARNING: This will PERMANENTLY DELETE all user KG data!")
    print("   This includes:")
    print("   - All entities with source_type='user'")
    print("   - All mentions from user conversations")
    print("   - All relations involving user entities")
    print("   - All user conversations")
    print()
    response = input("Type 'DELETE USER DATA' to confirm: ")
    if response != "DELETE USER DATA":
        print("❌ Confirmation failed. Aborting.")
        sys.exit(1)

def get_user_entity_ids(supabase):
    """Get all user entity IDs."""
    print("📦 Identifying user entities...")
    user_entity_ids = set()
    offset = 0
    limit = 1000
    
    while True:
        response = (
            supabase.from_("kg_entities")
            .select("id")
            .eq("source_type", "user")
            .range(offset, offset + limit - 1)
            .execute()
        )
        if not response.data or len(response.data) == 0:
            break
        user_entity_ids.update(e["id"] for e in response.data)
        offset += limit
        if len(response.data) < limit:
            break
    
    print(f"   Found {len(user_entity_ids):,} user entities")
    return user_entity_ids

def delete_user_entities(supabase, user_entity_ids, dry_run=False):
    """Delete user entities."""
    print("\n🗑️  Deleting user entities...")
    
    if dry_run:
        print(f"   [DRY RUN] Would delete {len(user_entity_ids):,} entities")
        return len(user_entity_ids)
    
    # Delete in batches (smaller batches to avoid Supabase limits)
    deleted = 0
    user_entity_ids_list = list(user_entity_ids)
    batch_size = 100  # Reduced from 1000 to avoid API limits
    
    for i in range(0, len(user_entity_ids_list), batch_size):
        batch_ids = user_entity_ids_list[i:i + batch_size]
        try:
            # Delete by ID batch
            response = (
                supabase.from_("kg_entities")
                .delete()
                .in_("id", batch_ids)
                .execute()
            )
            deleted += len(batch_ids)
            print(f"   Deleted batch {i//batch_size + 1}: {len(batch_ids)} entities")
        except Exception as e:
            print(f"   ⚠️  Error deleting batch {i//batch_size + 1}: {e}")
            # Try deleting one by one as fallback
            for entity_id in batch_ids:
                try:
                    supabase.from_("kg_entities").delete().eq("id", entity_id).execute()
                    deleted += 1
                except Exception as e2:
                    print(f"      Failed to delete entity {entity_id}: {e2}")
    
    print(f"   ✅ Deleted {deleted:,} user entities")
    return deleted

def delete_user_mentions(supabase, dry_run=False):
    """Delete user mentions (those NOT starting with 'lenny-')."""
    print("\n🗑️  Deleting user mentions...")
    
    # Count first
    total_mentions = supabase.from_("kg_entity_mentions").select("id", count="exact").execute()
    lenny_mentions = supabase.from_("kg_entity_mentions").select("id", count="exact").like("message_id", "lenny-%").execute()
    user_mention_count = (total_mentions.count or 0) - (lenny_mentions.count or 0)
    
    print(f"   Found {user_mention_count:,} user mentions to delete")
    
    if dry_run:
        print(f"   [DRY RUN] Would delete {user_mention_count:,} mentions")
        return user_mention_count
    
    # Delete user mentions (NOT like 'lenny-%')
    # Fetch and delete in batches
    deleted = 0
    offset = 0
    limit = 500  # Smaller batches
    
    while True:
        # Get all mentions
        response = (
            supabase.from_("kg_entity_mentions")
            .select("id,message_id")
            .range(offset, offset + limit - 1)
            .execute()
        )
        
        if not response.data or len(response.data) == 0:
            break
        
        # Filter to user mentions
        user_mention_ids = [
            m["id"] for m in response.data
            if not m.get("message_id", "").startswith("lenny-")
        ]
        
        if user_mention_ids:
            # Delete in smaller batches
            batch_size = 100
            for i in range(0, len(user_mention_ids), batch_size):
                batch = user_mention_ids[i:i + batch_size]
                try:
                    supabase.from_("kg_entity_mentions").delete().in_("id", batch).execute()
                    deleted += len(batch)
                except Exception as e:
                    print(f"   ⚠️  Error deleting batch: {e}")
                    # Try one by one
                    for mention_id in batch:
                        try:
                            supabase.from_("kg_entity_mentions").delete().eq("id", mention_id).execute()
                            deleted += 1
                        except Exception:
                            pass
        
        offset += limit
        if len(response.data) < limit:
            break
    
    print(f"   ✅ Deleted {deleted:,} user mentions")
    return deleted

def delete_user_relations(supabase, user_entity_ids, dry_run=False):
    """Delete relations involving user entities."""
    print("\n🗑️  Deleting user relations...")
    
    if not user_entity_ids:
        print("   No user entities, skipping relations deletion")
        return 0
    
    # Count relations involving user entities
    user_entity_ids_list = list(user_entity_ids)
    batch_size = 500
    
    total_to_delete = 0
    for i in range(0, len(user_entity_ids_list), batch_size):
        batch_ids = user_entity_ids_list[i:i + batch_size]
        
        # Count where source is user entity
        source_count = supabase.from_("kg_relations").select("id", count="exact").in_("source_entity_id", batch_ids).execute()
        # Count where target is user entity
        target_count = supabase.from_("kg_relations").select("id", count="exact").in_("target_entity_id", batch_ids).execute()
        
        total_to_delete += (source_count.count or 0) + (target_count.count or 0)
    
    print(f"   Found ~{total_to_delete:,} relations involving user entities")
    
    if dry_run:
        print(f"   [DRY RUN] Would delete ~{total_to_delete:,} relations")
        return total_to_delete
    
    # Delete relations where source OR target is user entity
    deleted = 0
    for i in range(0, len(user_entity_ids_list), batch_size):
        batch_ids = user_entity_ids_list[i:i + batch_size]
        
        # Delete where source is user
        supabase.from_("kg_relations").delete().in_("source_entity_id", batch_ids).execute()
        # Delete where target is user
        supabase.from_("kg_relations").delete().in_("target_entity_id", batch_ids).execute()
        
        deleted += len(batch_ids) * 2  # Approximate
    
    print(f"   ✅ Deleted relations involving user entities")
    return deleted

def delete_user_conversations(supabase, dry_run=False):
    """Delete user conversations."""
    print("\n🗑️  Deleting user conversations...")
    
    user_conv_count = supabase.from_("kg_conversations").select("id", count="exact").eq("source_type", "user").execute()
    count = user_conv_count.count or 0
    
    print(f"   Found {count:,} user conversations to delete")
    
    if dry_run:
        print(f"   [DRY RUN] Would delete {count:,} conversations")
        return count
    
    # Delete user conversations in batches
    deleted = 0
    batch_size = 100
    
    while True:
        # Check remaining count
        remaining = supabase.from_("kg_conversations").select("id", count="exact").eq("source_type", "user").execute()
        remaining_count = remaining.count or 0
        
        if remaining_count == 0:
            break
        
        # Get a batch of IDs to delete
        batch_response = (
            supabase.from_("kg_conversations")
            .select("id")
            .eq("source_type", "user")
            .limit(batch_size)
            .execute()
        )
        
        if not batch_response.data or len(batch_response.data) == 0:
            break
        
        batch_ids = [c["id"] for c in batch_response.data]
        
        # Delete the batch
        try:
            supabase.from_("kg_conversations").delete().in_("id", batch_ids).execute()
            deleted += len(batch_ids)
            print(f"   Deleted batch: {len(batch_ids)} conversations")
        except Exception as e:
            print(f"   ⚠️  Error deleting batch: {e}")
            # Try one by one
            for conv_id in batch_ids:
                try:
                    supabase.from_("kg_conversations").delete().eq("id", conv_id).execute()
                    deleted += 1
                except Exception:
                    pass
    
    print(f"   ✅ Deleted {deleted:,} user conversations")
    return deleted

def update_both_entities(supabase, dry_run=False):
    """Update 'both' entities to 'expert' or 'lenny' if they have Lenny mentions."""
    print("\n🔄 Updating 'both' entities...")
    
    # Get all 'both' entities
    both_entities = []
    offset = 0
    limit = 1000
    
    while True:
        response = (
            supabase.from_("kg_entities")
            .select("id")
            .eq("source_type", "both")
            .range(offset, offset + limit - 1)
            .execute()
        )
        if not response.data or len(response.data) == 0:
            break
        both_entities.extend(e["id"] for e in response.data)
        offset += limit
        if len(response.data) < limit:
            break
    
    print(f"   Found {len(both_entities):,} 'both' entities")
    
    if dry_run:
        print(f"   [DRY RUN] Would check and update 'both' entities")
        return 0
    
    # For each 'both' entity, check if it has Lenny mentions
    # If yes, change to 'expert' or 'lenny'
    # If no, delete it (it's user-only now)
    updated = 0
    deleted = 0
    
    for entity_id in both_entities:
        # Check if has Lenny mentions
        lenny_mentions = supabase.from_("kg_entity_mentions").select("id", count="exact").eq("entity_id", entity_id).like("message_id", "lenny-%").execute()
        
        if (lenny_mentions.count or 0) > 0:
            # Has Lenny mentions, update to 'expert'
            supabase.from_("kg_entities").update({"source_type": "expert"}).eq("id", entity_id).execute()
            updated += 1
        else:
            # No Lenny mentions, delete (user-only)
            supabase.from_("kg_entities").delete().eq("id", entity_id).execute()
            deleted += 1
    
    print(f"   ✅ Updated {updated:,} to 'expert'")
    print(f"   ✅ Deleted {deleted:,} user-only entities")
    
    return updated + deleted

def main():
    parser = argparse.ArgumentParser(description="Remove all user KG data from Supabase")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Dry run mode (don't actually delete)",
    )
    parser.add_argument(
        "--skip-confirmation",
        action="store_true",
        help="Skip confirmation prompt (dangerous!)",
    )
    
    args = parser.parse_args()
    
    print("🗑️  User KG Data Removal Script")
    print("=" * 60)
    
    if not args.skip_confirmation and not args.dry_run:
        confirm_destructive_action()
    
    supabase = get_supabase_client()
    if not supabase:
        print("❌ Failed to connect to Supabase")
        sys.exit(1)
    
    if args.dry_run:
        print("\n⚠️  DRY RUN MODE - No changes will be made\n")
    
    # Step 1: Get user entity IDs
    user_entity_ids = get_user_entity_ids(supabase)
    
    # Step 2: Delete user entities (cascades to mentions/relations)
    deleted_entities = delete_user_entities(supabase, user_entity_ids, args.dry_run)
    
    # Step 3: Delete remaining user mentions (safety check)
    deleted_mentions = delete_user_mentions(supabase, args.dry_run)
    
    # Step 4: Delete user relations (safety check)
    deleted_relations = delete_user_relations(supabase, user_entity_ids, args.dry_run)
    
    # Step 5: Delete user conversations
    deleted_conv = delete_user_conversations(supabase, args.dry_run)
    
    # Step 6: Update 'both' entities
    updated_both = update_both_entities(supabase, args.dry_run)
    
    # Summary
    print("\n" + "=" * 60)
    print("📋 Removal Summary:")
    print(f"   Entities deleted: {deleted_entities:,}")
    print(f"   Mentions deleted: {deleted_mentions:,}")
    print(f"   Relations deleted: ~{deleted_relations:,}")
    print(f"   Conversations deleted: {deleted_conv:,}")
    print(f"   'Both' entities updated/deleted: {updated_both:,}")
    print()
    
    if args.dry_run:
        print("⚠️  This was a dry run. No data was actually deleted.")
        print("   Run without --dry-run to perform actual deletion.")
    else:
        print("✅ User KG data removal complete!")
        print("   You can now re-index your chat history to create a fresh KG.")

if __name__ == "__main__":
    main()
