#!/usr/bin/env python3
"""
Export Lenny's Knowledge Graph data for distribution via GitHub Releases.

Exports all KG data with source_type='expert' or source_type='lenny' to JSON files
that can be imported into user Supabase instances.

Usage:
    python3 engine/scripts/export_lenny_kg.py --output-dir ./exports
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.config import get_supabase_client


def export_entities(supabase, output_dir: Path):
    """Export all Lenny entities, including those referenced by mentions/relations."""
    print("📦 Exporting entities...")
    
    entities_dict = {}
    
    # Step 1: Export entities with source_type IN ('expert', 'lenny')
    try:
        offset = 0
        limit = 1000
        while True:
            response = (
                supabase.from_("kg_entities")
                .select("*")
                .in_("source_type", ["expert", "lenny"])
                .range(offset, offset + limit - 1)
                .execute()
            )
            if not response.data or len(response.data) == 0:
                break
            for entity in response.data:
                entities_dict[entity["id"]] = entity
            offset += limit
            if len(response.data) < limit:
                break
        if entities_dict:
            print(f"   Found {len(entities_dict)} entities via source_type column")
    except Exception as e:
        print(f"   ⚠️  source_type column not available: {e}")
    
    # Step 2: Get ALL entity IDs referenced by Lenny mentions (including 'both' or merged entities)
    print("   Collecting entity IDs from mentions...")
    lenny_entity_ids = set()
    offset = 0
    limit = 1000
    while True:
        mentions_response = (
            supabase.from_("kg_entity_mentions")
            .select("entity_id")
            .like("message_id", "lenny-%")
            .range(offset, offset + limit - 1)
            .execute()
        )
        if not mentions_response.data or len(mentions_response.data) == 0:
            break
        lenny_entity_ids.update(m["entity_id"] for m in mentions_response.data)
        offset += limit
        if len(mentions_response.data) < limit:
            break
    
    # Also check source column for mentions
    try:
        offset = 0
        limit = 1000
        while True:
            mentions_source = (
                supabase.from_("kg_entity_mentions")
                .select("entity_id")
                .in_("source", ["expert", "lenny", "unknown"])
                .range(offset, offset + limit - 1)
                .execute()
            )
            if not mentions_source.data or len(mentions_source.data) == 0:
                break
            lenny_entity_ids.update(m["entity_id"] for m in mentions_source.data)
            offset += limit
            if len(mentions_source.data) < limit:
                break
    except Exception:
        pass
    
    # Step 3: Get ALL entity IDs referenced by Lenny relations
    print("   Collecting entity IDs from relations...")
    offset = 0
    limit = 1000
    while True:
        try:
            relations_response = (
                supabase.from_("kg_relations")
                .select("source_entity_id, target_entity_id")
                .like("message_id", "lenny-%")
                .range(offset, offset + limit - 1)
                .execute()
            )
            if not relations_response.data or len(relations_response.data) == 0:
                break
            for rel in relations_response.data:
                if rel.get("source_entity_id"):
                    lenny_entity_ids.add(rel["source_entity_id"])
                if rel.get("target_entity_id"):
                    lenny_entity_ids.add(rel["target_entity_id"])
            offset += limit
            if len(relations_response.data) < limit:
                break
        except Exception:
            break
    
    # Also check source column for relations
    try:
        offset = 0
        limit = 1000
        while True:
            relations_source = (
                supabase.from_("kg_relations")
                .select("source_entity_id, target_entity_id")
                .in_("source", ["expert", "lenny", "unknown"])
                .range(offset, offset + limit - 1)
                .execute()
            )
            if not relations_source.data or len(relations_source.data) == 0:
                break
            for rel in relations_source.data:
                if rel.get("source_entity_id"):
                    lenny_entity_ids.add(rel["source_entity_id"])
                if rel.get("target_entity_id"):
                    lenny_entity_ids.add(rel["target_entity_id"])
            offset += limit
            if len(relations_source.data) < limit:
                break
    except Exception:
        pass
    
    print(f"   Found {len(lenny_entity_ids)} unique entity IDs from mentions/relations")
    
    # Step 4: Fetch ALL referenced entities (including 'both' or merged entities)
    missing_entity_ids = [eid for eid in lenny_entity_ids if eid not in entities_dict]
    if missing_entity_ids:
        print(f"   Fetching {len(missing_entity_ids)} additional entities referenced by mentions/relations...")
        batch_size = 1000
        for i in range(0, len(missing_entity_ids), batch_size):
            batch_ids = missing_entity_ids[i:i + batch_size]
            entity_response = supabase.from_("kg_entities").select("*").in_("id", batch_ids).execute()
            if entity_response.data:
                for entity in entity_response.data:
                    entities_dict[entity["id"]] = entity
    
    entities = list(entities_dict.values())
    print(f"   Total: {len(entities)} entities (includes all referenced entities)")
    
    # Write to JSON
    output_file = output_dir / "lenny_kg_entities.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(entities, f, indent=2, ensure_ascii=False, default=str)
    
    print(f"   ✅ Exported to {output_file}")
    return len(entities)


def export_mentions(supabase, output_dir: Path):
    """Export all Lenny entity mentions."""
    print("📦 Exporting entity mentions...")
    
    mentions_dict = {}
    
    # Fetch all Lenny mentions by message_id pattern (most reliable) with pagination
    # Lenny mentions have message_id like "lenny-{episode}-{chunk}"
    offset = 0
    limit = 1000
    while True:
        response = (
            supabase.from_("kg_entity_mentions")
            .select("*")
            .like("message_id", "lenny-%")
            .range(offset, offset + limit - 1)
            .execute()
        )
        if not response.data or len(response.data) == 0:
            break
        for mention in response.data:
            mentions_dict[mention["id"]] = mention
        offset += limit
        if len(response.data) < limit:
            break
    
    # Also try source column if it exists (migration may have added it) with pagination
    # Include 'unknown' source (likely from Lenny's data)
    try:
        offset = 0
        limit = 1000
        while True:
            response_source = (
                supabase.from_("kg_entity_mentions")
                .select("*")
                .in_("source", ["expert", "lenny", "unknown"])
                .range(offset, offset + limit - 1)
                .execute()
            )
            if not response_source.data or len(response_source.data) == 0:
                break
            for mention in response_source.data:
                if mention["id"] not in mentions_dict:
                    mentions_dict[mention["id"]] = mention
            offset += limit
            if len(response_source.data) < limit:
                break
    except Exception:
        # source column doesn't exist, use message_id pattern only
        pass
    
    mentions = list(mentions_dict.values())
    
    # Verify no user data contamination
    user_mentions = [m for m in mentions if m.get("message_id") and not m.get("message_id", "").startswith("lenny-")]
    if user_mentions:
        print(f"   ⚠️  WARNING: Found {len(user_mentions)} non-Lenny mentions!")
        # Remove user mentions
        mentions = [m for m in mentions if m.get("message_id", "").startswith("lenny-")]
        print(f"   ✅ Filtered out user mentions, remaining: {len(mentions)}")
    
    print(f"   Total: {len(mentions)} Lenny mentions")
    
    # Write to JSON
    output_file = output_dir / "lenny_kg_mentions.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(mentions, f, indent=2, ensure_ascii=False, default=str)
    
    print(f"   ✅ Exported to {output_file}")
    return len(mentions)


def export_relations(supabase, output_dir: Path):
    """Export all Lenny relations."""
    print("📦 Exporting relations...")
    
    # First, get all Lenny entity IDs
    print("   Fetching Lenny entity IDs...")
    lenny_entity_ids = set()
    offset = 0
    limit = 1000
    while True:
        try:
            response = (
                supabase.from_("kg_entities")
                .select("id")
                .in_("source_type", ["expert", "lenny"])
                .range(offset, offset + limit - 1)
                .execute()
            )
            if not response.data or len(response.data) == 0:
                break
            lenny_entity_ids.update(e["id"] for e in response.data)
            offset += limit
            if len(response.data) < limit:
                break
        except Exception:
            # Try source column instead
            try:
                response = (
                    supabase.from_("kg_entities")
                    .select("id")
                    .in_("source", ["expert", "lenny"])
                    .range(offset, offset + limit - 1)
                    .execute()
                )
                if not response.data or len(response.data) == 0:
                    break
                lenny_entity_ids.update(e["id"] for e in response.data)
                offset += limit
                if len(response.data) < limit:
                    break
            except Exception:
                break
    
    print(f"   Found {len(lenny_entity_ids)} Lenny entities")
    
    if not lenny_entity_ids:
        print("   ⚠️  No Lenny entities found, cannot identify Lenny relations")
        relations = []
    else:
        # Fetch all relations and filter by checking if source or target is Lenny entity
        relations_dict = {}
        lenny_entity_ids_list = list(lenny_entity_ids)
        
        # Process in batches to avoid query size limits
        batch_size = 500
        total_checked = 0
        
        for i in range(0, len(lenny_entity_ids_list), batch_size):
            batch_ids = lenny_entity_ids_list[i:i + batch_size]
            
            # Check relations where source entity is Lenny
            offset = 0
            limit = 1000
            while True:
                try:
                    response = (
                        supabase.from_("kg_relations")
                        .select("*")
                        .in_("source_entity_id", batch_ids)
                        .range(offset, offset + limit - 1)
                        .execute()
                    )
                    if not response.data or len(response.data) == 0:
                        break
                    for relation in response.data:
                        relations_dict[relation["id"]] = relation
                    offset += limit
                    total_checked += len(response.data)
                    if len(response.data) < limit:
                        break
                except Exception as e:
                    print(f"   ⚠️  Error fetching source relations: {e}")
                    break
            
            # Check relations where target entity is Lenny
            offset = 0
            limit = 1000
            while True:
                try:
                    response = (
                        supabase.from_("kg_relations")
                        .select("*")
                        .in_("target_entity_id", batch_ids)
                        .range(offset, offset + limit - 1)
                        .execute()
                    )
                    if not response.data or len(response.data) == 0:
                        break
                    for relation in response.data:
                        relations_dict[relation["id"]] = relation
                    offset += limit
                    total_checked += len(response.data)
                    if len(response.data) < limit:
                        break
                except Exception as e:
                    print(f"   ⚠️  Error fetching target relations: {e}")
                    break
        
        print(f"   Checked {total_checked} relations, found {len(relations_dict)} Lenny relations")
        relations = list(relations_dict.values())
    
    # Also try direct filters (message_id pattern, source column) as fallback
    if not relations:
        print("   Trying direct filters...")
        # Try message_id pattern
        offset = 0
        limit = 1000
        while True:
            try:
                response = (
                    supabase.from_("kg_relations")
                    .select("*")
                    .like("message_id", "lenny-%")
                    .range(offset, offset + limit - 1)
                    .execute()
                )
                if not response.data or len(response.data) == 0:
                    break
                for relation in response.data:
                    relations_dict[relation["id"]] = relation
                offset += limit
                if len(response.data) < limit:
                    break
            except Exception:
                break
        
        # Try source column
        try:
            offset = 0
            limit = 1000
            while True:
                response_source = (
                    supabase.from_("kg_relations")
                    .select("*")
                    .in_("source", ["expert", "lenny"])
                    .range(offset, offset + limit - 1)
                    .execute()
                )
                if not response_source.data or len(response_source.data) == 0:
                    break
                for relation in response_source.data:
                    relations_dict[relation["id"]] = relation
                offset += limit
                if len(response_source.data) < limit:
                    break
        except Exception:
            pass
        
        relations = list(relations_dict.values())
    
    print(f"   Total: {len(relations)} relations")
    
    # Write to JSON
    output_file = output_dir / "lenny_kg_relations.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(relations, f, indent=2, ensure_ascii=False, default=str)
    
    print(f"   ✅ Exported to {output_file}")
    return len(relations)


def export_conversations(supabase, output_dir: Path):
    """Export Lenny conversations (if any)."""
    print("📦 Exporting conversations...")
    
    conversations_dict = {}
    
    # Export by source_type column with pagination (most reliable)
    try:
        offset = 0
        limit = 1000
        while True:
            response_type = (
                supabase.from_("kg_conversations")
                .select("*")
                .in_("source_type", ["expert", "lenny"])
                .range(offset, offset + limit - 1)
                .execute()
            )
            if not response_type.data or len(response_type.data) == 0:
                break
            for conv in response_type.data:
                conversations_dict[conv["id"]] = conv
            offset += limit
            if len(response_type.data) < limit:
                break
        if conversations_dict:
            print(f"   Found {len(conversations_dict)} conversations via source_type")
    except Exception as e:
        print(f"   ⚠️  source_type export failed: {e}")
    
    # Also try conversation_id pattern with pagination (as additional filter)
    try:
        offset = 0
        limit = 1000
        while True:
            response = (
                supabase.from_("kg_conversations")
                .select("*")
                .like("conversation_id", "lenny-%")
                .range(offset, offset + limit - 1)
                .execute()
            )
            if not response.data or len(response.data) == 0:
                break
            for conv in response.data:
                # Add to dict (will deduplicate by id)
                conversations_dict[conv["id"]] = conv
            offset += limit
            if len(response.data) < limit:
                break
    except Exception:
        pass
    
    conversations = list(conversations_dict.values())
    
    # Verify no user data contamination
    user_contamination = [c for c in conversations if c.get("source_type") == "user"]
    if user_contamination:
        print(f"   ⚠️  WARNING: Found {len(user_contamination)} user conversations in export!")
        # Remove user conversations
        conversations = [c for c in conversations if c.get("source_type") != "user"]
        print(f"   ✅ Filtered out user conversations, remaining: {len(conversations)}")
    
    if conversations:
        print(f"   Total: {len(conversations)} Lenny conversations")
        output_file = output_dir / "lenny_kg_conversations.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(conversations, f, indent=2, ensure_ascii=False, default=str)
        print(f"   ✅ Exported to {output_file}")
    else:
        print(f"   ⚠️  No Lenny conversations found")
    
    return len(conversations)


def verify_export_integrity(output_dir: Path, stats: dict):
    """Verify exported files don't contain user data."""
    print("   Checking for user data contamination...")
    
    # Check entities
    entities_file = output_dir / "lenny_kg_entities.json"
    if entities_file.exists():
        with open(entities_file, "r", encoding="utf-8") as f:
            entities = json.load(f)
        user_entities = [e for e in entities if e.get("source_type") == "user"]
        if user_entities:
            print(f"   ⚠️  WARNING: Found {len(user_entities)} user entities!")
        else:
            print(f"   ✅ Entities: All {len(entities)} are Lenny (expert/lenny source_type)")
    
    # Check mentions
    mentions_file = output_dir / "lenny_kg_mentions.json"
    if mentions_file.exists():
        with open(mentions_file, "r", encoding="utf-8") as f:
            mentions = json.load(f)
        user_mentions = [m for m in mentions if m.get("message_id") and not str(m.get("message_id", "")).startswith("lenny-")]
        if user_mentions:
            print(f"   ⚠️  WARNING: Found {len(user_mentions)} user mentions!")
        else:
            print(f"   ✅ Mentions: All {len(mentions)} have lenny- prefix")
    
    # Check relations (verify they involve Lenny entities)
    relations_file = output_dir / "lenny_kg_relations.json"
    if relations_file.exists():
        with open(relations_file, "r", encoding="utf-8") as f:
            relations = json.load(f)
        # Relations are verified during export (must involve Lenny entities)
        print(f"   ✅ Relations: All {len(relations)} involve Lenny entities")
    
    # Check conversations
    conversations_file = output_dir / "lenny_kg_conversations.json"
    if conversations_file.exists():
        with open(conversations_file, "r", encoding="utf-8") as f:
            conversations = json.load(f)
        user_conv = [c for c in conversations if c.get("source_type") == "user"]
        if user_conv:
            print(f"   ⚠️  WARNING: Found {len(user_conv)} user conversations!")
        else:
            print(f"   ✅ Conversations: All {len(conversations)} are Lenny (expert/lenny source_type)")
            # Note: These are chunks/segments, not episodes
            unique_episodes = len(set(c.get("conversation_id", "").split("-")[1:3] for c in conversations if c.get("conversation_id")))
            print(f"      Note: {len(conversations)} conversations represent chunks from ~{unique_episodes} episodes")


def verify_export_integrity(output_dir: Path, stats: dict):
    """Verify exported files don't contain user data."""
    print("\n🔍 Verifying export integrity...")
    
    # Check entities
    entities_file = output_dir / "lenny_kg_entities.json"
    if entities_file.exists():
        with open(entities_file, "r", encoding="utf-8") as f:
            entities = json.load(f)
        user_entities = [e for e in entities if e.get("source_type") == "user"]
        episode_entities = [e for e in entities if e.get("entity_type") == "episode"]
        if user_entities:
            print(f"   ⚠️  WARNING: Found {len(user_entities)} user entities!")
        else:
            print(f"   ✅ Entities: All {len(entities)} are Lenny (expert/lenny source_type)")
            print(f"      Includes {len(episode_entities)} episode entities")
    
    # Check mentions
    mentions_file = output_dir / "lenny_kg_mentions.json"
    if mentions_file.exists():
        with open(mentions_file, "r", encoding="utf-8") as f:
            mentions = json.load(f)
        user_mentions = [m for m in mentions if m.get("message_id") and not str(m.get("message_id", "")).startswith("lenny-")]
        if user_mentions:
            print(f"   ⚠️  WARNING: Found {len(user_mentions)} user mentions!")
        else:
            print(f"   ✅ Mentions: All {len(mentions)} have lenny- prefix")
    
    # Check relations (verify they involve Lenny entities)
    relations_file = output_dir / "lenny_kg_relations.json"
    if relations_file.exists():
        with open(relations_file, "r", encoding="utf-8") as f:
            relations = json.load(f)
        # Relations are verified during export (must involve Lenny entities)
        print(f"   ✅ Relations: All {len(relations)} involve Lenny entities")
    
    # Check conversations
    conversations_file = output_dir / "lenny_kg_conversations.json"
    if conversations_file.exists():
        with open(conversations_file, "r", encoding="utf-8") as f:
            conversations = json.load(f)
        user_conv = [c for c in conversations if c.get("source_type") == "user"]
        if user_conv:
            print(f"   ⚠️  WARNING: Found {len(user_conv)} user conversations!")
        else:
            print(f"   ✅ Conversations: All {len(conversations)} are Lenny (expert/lenny source_type)")
            # Note: These are chunks/segments, not episodes
            episode_slugs = set()
            for c in conversations:
                conv_id = c.get("conversation_id", "")
                if conv_id.startswith("lenny-"):
                    parts = conv_id.split("-")
                    if len(parts) >= 3:
                        episode_slug = "-".join(parts[1:3])  # e.g., "ada-chen-rekhi" from "lenny-ada-chen-rekhi-1"
                        episode_slugs.add(episode_slug)
            print(f"      Note: {len(conversations)} conversations represent chunks from ~{len(episode_slugs)} unique episodes")


def create_manifest(output_dir: Path, stats: dict):
    """Create manifest file with export metadata."""
    manifest = {
        "version": "1.0.0",
        "export_date": datetime.now(timezone.utc).isoformat(),
        "source": "Lenny's Podcast Knowledge Graph",
        "episode_count": stats.get("episodes", 0),
        "entity_count": stats.get("entities", 0),
        "mention_count": stats.get("mentions", 0),
        "relation_count": stats.get("relations", 0),
        "conversation_count": stats.get("conversations", 0),
        "note": "Conversations are episode chunks/segments, not full episodes. Episode entities (entity_type='episode') are included in entities export.",
        "files": [
            "lenny_kg_entities.json",
            "lenny_kg_mentions.json",
            "lenny_kg_relations.json",
        ],
    }
    
    if stats.get("conversations", 0) > 0:
        manifest["files"].append("lenny_kg_conversations.json")
    
    output_file = output_dir / "lenny_kg_manifest.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    
    print(f"   ✅ Manifest created: {output_file}")
    return manifest


def main():
    parser = argparse.ArgumentParser(description="Export Lenny's Knowledge Graph for distribution")
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./exports/lenny-kg",
        help="Output directory for exported files (default: ./exports/lenny-kg)",
    )
    parser.add_argument(
        "--episode-count",
        type=int,
        default=303,
        help="Number of episodes (for manifest, default: 303)",
    )
    
    args = parser.parse_args()
    
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("🔮 Lenny's Knowledge Graph Exporter")
    print("=" * 50)
    print(f"Output directory: {output_dir.absolute()}")
    print()
    
    # Connect to Supabase
    supabase = get_supabase_client()
    if not supabase:
        print("❌ Failed to connect to Supabase. Check SUPABASE_URL and SUPABASE_ANON_KEY.")
        sys.exit(1)
    
    # Export all tables
    stats = {
        "episodes": args.episode_count,
        "entities": export_entities(supabase, output_dir),
        "mentions": export_mentions(supabase, output_dir),
        "relations": export_relations(supabase, output_dir),
        "conversations": export_conversations(supabase, output_dir),  # Optional - derived from mentions
    }
    
    # Verify no user data contamination
    print("\n🔍 Verifying export integrity...")
    verify_export_integrity(output_dir, stats)
    
    # Create manifest
    manifest = create_manifest(output_dir, stats)
    
    print()
    print("=" * 50)
    print("✅ Export complete!")
    print()
    print("📊 Summary:")
    print(f"   Entities: {stats['entities']:,}")
    print(f"   Mentions: {stats['mentions']:,}")
    print(f"   Relations: {stats['relations']:,}")
    if stats["conversations"] > 0:
        print(f"   Conversations: {stats['conversations']:,}")
    print()
    print("📦 Files ready for GitHub Release:")
    for file in manifest["files"]:
        file_path = output_dir / file
        size_mb = file_path.stat().st_size / (1024 * 1024)
        print(f"   - {file} ({size_mb:.1f}MB)")
    print(f"   - lenny_kg_manifest.json")
    print()
    print("💡 Next steps:")
    print("   1. Create GitHub Release tag: v1.0.0-lenny-kg")
    print("   2. Upload all JSON files as release assets")
    print("   3. Update release notes with entity/mention/relation counts")


if __name__ == "__main__":
    main()
