#!/usr/bin/env python3
"""
Import Lenny's Knowledge Graph data from exported JSON files.

Imports KG data into user's Supabase instance, handling deduplication
and preserving user's existing data.

Usage:
    python3 engine/scripts/import_lenny_kg.py --data-dir ./exports/lenny-kg
"""

import argparse
import json
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.config import get_supabase_client


def load_json_file(data_dir: Path, filename: str):
    """Load JSON file from data directory."""
    file_path = data_dir / filename
    if not file_path.exists():
        print(f"⚠️  File not found: {filename}")
        return None
    
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def import_entities(supabase, entities: list, dry_run: bool = False):
    """Import entities with deduplication."""
    print(f"📦 Importing {len(entities)} entities...")
    
    if dry_run:
        print("   [DRY RUN] Would import entities")
        return len(entities)
    
    imported = 0
    skipped = 0
    
    for entity in entities:
        # Check if entity already exists (by canonical_name)
        existing = (
            supabase.from_("kg_entities")
            .select("id")
            .eq("canonical_name", entity["canonical_name"])
            .eq("entity_type", entity.get("entity_type", "other"))
            .execute()
        )
        
        if existing.data:
            skipped += 1
            continue
        
        # Insert new entity
        try:
            supabase.from_("kg_entities").insert(entity).execute()
            imported += 1
        except Exception as e:
            print(f"   ⚠️  Failed to import entity {entity.get('canonical_name')}: {e}")
    
    print(f"   ✅ Imported: {imported}, Skipped (duplicates): {skipped}")
    return imported


def import_mentions(supabase, mentions: list, dry_run: bool = False):
    """Import mentions, ensuring entity_id exists."""
    print(f"📦 Importing {len(mentions)} mentions...")
    
    if dry_run:
        print("   [DRY RUN] Would import mentions")
        return len(mentions)
    
    imported = 0
    skipped = 0
    
    for mention in mentions:
        # Check if entity exists
        entity_check = (
            supabase.from_("kg_entities")
            .select("id")
            .eq("id", mention["entity_id"])
            .execute()
        )
        
        if not entity_check.data:
            skipped += 1
            continue
        
        # Check if mention already exists (by message_id + entity_id)
        existing = (
            supabase.from_("kg_entity_mentions")
            .select("id")
            .eq("message_id", mention.get("message_id", ""))
            .eq("entity_id", mention["entity_id"])
            .execute()
        )
        
        if existing.data:
            skipped += 1
            continue
        
        # Insert new mention
        try:
            supabase.from_("kg_entity_mentions").insert(mention).execute()
            imported += 1
        except Exception as e:
            print(f"   ⚠️  Failed to import mention: {e}")
    
    print(f"   ✅ Imported: {imported}, Skipped: {skipped}")
    return imported


def import_relations(supabase, relations: list, dry_run: bool = False):
    """Import relations, ensuring source/target entities exist."""
    print(f"📦 Importing {len(relations)} relations...")
    
    if dry_run:
        print("   [DRY RUN] Would import relations")
        return len(relations)
    
    imported = 0
    skipped = 0
    
    for relation in relations:
        # Check if source and target entities exist
        source_check = (
            supabase.from_("kg_entities")
            .select("id")
            .eq("id", relation["source_entity_id"])
            .execute()
        )
        
        target_check = (
            supabase.from_("kg_entities")
            .select("id")
            .eq("id", relation["target_entity_id"])
            .execute()
        )
        
        if not source_check.data or not target_check.data:
            skipped += 1
            continue
        
        # Check if relation already exists
        existing = (
            supabase.from_("kg_relations")
            .select("id")
            .eq("source_entity_id", relation["source_entity_id"])
            .eq("target_entity_id", relation["target_entity_id"])
            .eq("relation_type", relation.get("relation_type", ""))
            .execute()
        )
        
        if existing.data:
            skipped += 1
            continue
        
        # Insert new relation
        try:
            supabase.from_("kg_relations").insert(relation).execute()
            imported += 1
        except Exception as e:
            print(f"   ⚠️  Failed to import relation: {e}")
    
    print(f"   ✅ Imported: {imported}, Skipped: {skipped}")
    return imported


def import_conversations(supabase, conversations: list, dry_run: bool = False):
    """Import conversations (if any)."""
    if not conversations:
        return 0
    
    print(f"📦 Importing {len(conversations)} conversations...")
    
    if dry_run:
        print("   [DRY RUN] Would import conversations")
        return len(conversations)
    
    imported = 0
    skipped = 0
    
    for conv in conversations:
        # Check if conversation already exists
        existing = (
            supabase.from_("kg_conversations")
            .select("id")
            .eq("conversation_id", conv.get("conversation_id", ""))
            .execute()
        )
        
        if existing.data:
            skipped += 1
            continue
        
        # Insert new conversation
        try:
            supabase.from_("kg_conversations").insert(conv).execute()
            imported += 1
        except Exception as e:
            print(f"   ⚠️  Failed to import conversation: {e}")
    
    print(f"   ✅ Imported: {imported}, Skipped: {skipped}")
    return imported


def main():
    parser = argparse.ArgumentParser(description="Import Lenny's Knowledge Graph from exported files")
    parser.add_argument(
        "--data-dir",
        type=str,
        required=True,
        help="Directory containing exported JSON files",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Dry run mode (don't actually import)",
    )
    
    args = parser.parse_args()
    
    data_dir = Path(args.data_dir)
    
    if not data_dir.exists():
        print(f"❌ Data directory not found: {data_dir}")
        sys.exit(1)
    
    print("🔮 Lenny's Knowledge Graph Importer")
    print("=" * 50)
    print(f"Data directory: {data_dir.absolute()}")
    if args.dry_run:
        print("⚠️  DRY RUN MODE - No changes will be made")
    print()
    
    # Connect to Supabase
    supabase = get_supabase_client()
    if not supabase:
        print("❌ Failed to connect to Supabase. Check SUPABASE_URL and SUPABASE_ANON_KEY.")
        sys.exit(1)
    
    # Load manifest
    manifest = load_json_file(data_dir, "lenny_kg_manifest.json")
    if manifest:
        print("📋 Manifest:")
        print(f"   Version: {manifest.get('version')}")
        print(f"   Export date: {manifest.get('export_date')}")
        print(f"   Entities: {manifest.get('entity_count', 0):,}")
        print(f"   Mentions: {manifest.get('mention_count', 0):,}")
        print(f"   Relations: {manifest.get('relation_count', 0):,}")
        print()
    
    # Load and import data
    entities = load_json_file(data_dir, "lenny_kg_entities.json") or []
    mentions = load_json_file(data_dir, "lenny_kg_mentions.json") or []
    relations = load_json_file(data_dir, "lenny_kg_relations.json") or []
    conversations = load_json_file(data_dir, "lenny_kg_conversations.json") or []
    
    # Import in order: entities → mentions → relations → conversations
    stats = {
        "entities": import_entities(supabase, entities, args.dry_run),
        "mentions": import_mentions(supabase, mentions, args.dry_run),
        "relations": import_relations(supabase, relations, args.dry_run),
        "conversations": import_conversations(supabase, conversations, args.dry_run),
    }
    
    print()
    print("=" * 50)
    if args.dry_run:
        print("✅ Dry run complete (no changes made)")
    else:
        print("✅ Import complete!")
    print()
    print("📊 Summary:")
    print(f"   Entities: {stats['entities']:,}")
    print(f"   Mentions: {stats['mentions']:,}")
    print(f"   Relations: {stats['relations']:,}")
    if stats["conversations"] > 0:
        print(f"   Conversations: {stats['conversations']:,}")


if __name__ == "__main__":
    main()
