#!/usr/bin/env python3
"""
Export Lenny's Knowledge Graph baseline for GitHub Release.

Exports:
1. Entities (with embeddings, aliases, confidence, source breakdown)
2. Relations (with evidence snippets, confidence)
3. Mentions (provenance: chunk IDs, context snippets, timestamps)
4. Episode metadata (YouTube URLs, titles, guest names)

Output formats:
- JSON (human-readable, easy to parse)
- SQL (direct Supabase import)

Usage:
    python3 engine/scripts/export_lenny_kg_baseline.py --format json
    python3 engine/scripts/export_lenny_kg_baseline.py --format sql
    python3 engine/scripts/export_lenny_kg_baseline.py --format both
"""

import sys
import json
from pathlib import Path
from datetime import datetime
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.vector_db import get_supabase_client


def export_entities(client) -> list[dict]:
    """Export all expert entities (source_type = 'expert' or 'both')."""
    result = client.table('kg_entities')\
        .select('*')\
        .in_('source_type', ['expert', 'both'])\
        .execute()
    
    return result.data


def export_relations(client) -> list[dict]:
    """Export all relations between expert entities."""
    # Get expert entity IDs
    expert_entities = client.table('kg_entities')\
        .select('id')\
        .in_('source_type', ['expert', 'both'])\
        .execute()
    
    expert_ids = {e['id'] for e in expert_entities.data}
    
    # Get relations where both source and target are expert entities
    all_relations = client.table('kg_relations')\
        .select('*')\
        .execute()
    
    # Filter to expert-only relations
    expert_relations = [
        r for r in all_relations.data
        if r['source_entity_id'] in expert_ids and r['target_entity_id'] in expert_ids
    ]
    
    return expert_relations


def export_mentions(client) -> list[dict]:
    """Export all mentions of expert entities (from Lenny's podcast)."""
    # Get expert entity IDs
    expert_entities = client.table('kg_entities')\
        .select('id')\
        .in_('source_type', ['expert', 'both'])\
        .execute()
    
    expert_ids = {e['id'] for e in expert_entities.data}
    
    # Get mentions for expert entities (filter by message_id starting with 'lenny-')
    all_mentions = client.table('kg_entity_mentions')\
        .select('*')\
        .like('message_id', 'lenny-%')\
        .execute()
    
    # Filter to expert entities only
    expert_mentions = [
        m for m in all_mentions.data
        if m['entity_id'] in expert_ids
    ]
    
    return expert_mentions


def export_episode_metadata(client) -> list[dict]:
    """Export episode metadata (YouTube URLs, titles, etc.)."""
    try:
        result = client.table('kg_episode_metadata')\
            .select('*')\
            .execute()
        return result.data
    except Exception:
        # Table might not exist yet (Phase 2 incomplete)
        return []


def export_json(output_path: Path, client):
    """Export KG baseline as JSON."""
    print("📦 Exporting Lenny's KG baseline to JSON...")
    print()
    
    print("   Fetching entities...")
    entities = export_entities(client)
    print(f"   ✅ {len(entities):,} entities")
    
    print("   Fetching relations...")
    relations = export_relations(client)
    print(f"   ✅ {len(relations):,} relations")
    
    print("   Fetching mentions...")
    mentions = export_mentions(client)
    print(f"   ✅ {len(mentions):,} mentions")
    
    print("   Fetching episode metadata...")
    episodes = export_episode_metadata(client)
    print(f"   ✅ {len(episodes):,} episodes")
    
    # Build export structure
    export_data = {
        "version": "1.0",
        "exported_at": datetime.now().isoformat(),
        "source": "Lenny's Podcast (303 episodes)",
        "stats": {
            "total_entities": len(entities),
            "total_relations": len(relations),
            "total_mentions": len(mentions),
            "total_episodes": len(episodes),
        },
        "entities": entities,
        "relations": relations,
        "mentions": mentions,
        "episode_metadata": episodes,
    }
    
    # Write JSON
    with open(output_path, 'w') as f:
        json.dump(export_data, f, indent=2, default=str)
    
    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    print()
    print(f"✅ Exported to: {output_path}")
    print(f"   Size: {file_size_mb:.1f} MB")
    print(f"   Format: JSON")
    print()
    print("📋 Contents:")
    print(f"   - {len(entities):,} entities")
    print(f"   - {len(relations):,} relations")
    print(f"   - {len(mentions):,} mentions")
    print(f"   - {len(episodes):,} episode metadata entries")


def export_sql(output_path: Path, client):
    """Export KG baseline as SQL INSERT statements."""
    print("📦 Exporting Lenny's KG baseline to SQL...")
    print()
    
    entities = export_entities(client)
    relations = export_relations(client)
    mentions = export_mentions(client)
    episodes = export_episode_metadata(client)
    
    with open(output_path, 'w') as f:
        f.write("-- Lenny's Knowledge Graph Baseline Export\n")
        f.write(f"-- Exported: {datetime.now().isoformat()}\n")
        f.write(f"-- Source: Lenny's Podcast (303 episodes)\n")
        f.write(f"-- Stats: {len(entities)} entities, {len(relations)} relations, {len(mentions)} mentions\n")
        f.write("\n")
        f.write("BEGIN;\n\n")
        
        # Export entities
        f.write("-- Entities\n")
        for entity in entities:
            # Escape single quotes
            canonical_name = entity['canonical_name'].replace("'", "''")
            aliases_str = "ARRAY[" + ", ".join(f"'{a.replace("'", "''")}'" for a in (entity.get('aliases') or [])) + "]"
            
            f.write(f"INSERT INTO kg_entities (id, canonical_name, entity_type, mention_count, source_type, source_breakdown, confidence, aliases, embedding, first_seen, last_seen, created_at, updated_at)\n")
            f.write(f"VALUES ('{entity['id']}', '{canonical_name}', '{entity['entity_type']}', {entity.get('mention_count', 0)}, '{entity.get('source_type', 'expert')}', '{json.dumps(entity.get('source_breakdown', {}))}', {entity.get('confidence', 0.5)}, {aliases_str}, NULL, '{entity.get('first_seen', '')}', '{entity.get('last_seen', '')}', NOW(), NOW())\n")
            f.write(f"ON CONFLICT (id) DO UPDATE SET\n")
            f.write(f"  mention_count = EXCLUDED.mention_count,\n")
            f.write(f"  confidence = EXCLUDED.confidence,\n")
            f.write(f"  aliases = EXCLUDED.aliases,\n")
            f.write(f"  updated_at = NOW();\n\n")
        
        # Export relations
        f.write("-- Relations\n")
        for rel in relations:
            evidence = (rel.get('evidence_snippet') or '').replace("'", "''")
            f.write(f"INSERT INTO kg_relations (id, source_entity_id, target_entity_id, relation_type, evidence_snippet, source_message_id, confidence, occurrence_count, created_at, updated_at)\n")
            f.write(f"VALUES ('{rel['id']}', '{rel['source_entity_id']}', '{rel['target_entity_id']}', '{rel['relation_type']}', '{evidence}', '{rel.get('source_message_id', '')}', {rel.get('confidence', 1.0)}, {rel.get('occurrence_count', 1)}, NOW(), NOW())\n")
            f.write(f"ON CONFLICT (source_entity_id, target_entity_id, relation_type, source_message_id) DO UPDATE SET\n")
            f.write(f"  occurrence_count = kg_relations.occurrence_count + 1,\n")
            f.write(f"  updated_at = NOW();\n\n")
        
        # Export mentions
        f.write("-- Mentions\n")
        for mention in mentions:
            context = (mention.get('context_snippet') or '').replace("'", "''")
            f.write(f"INSERT INTO kg_entity_mentions (id, entity_id, message_id, context_snippet, message_timestamp, created_at)\n")
            f.write(f"VALUES ('{mention['id']}', '{mention['entity_id']}', '{mention['message_id']}', '{context}', {mention.get('message_timestamp', 0)}, NOW())\n")
            f.write(f"ON CONFLICT (id) DO NOTHING;\n\n")
        
        # Export episode metadata (if exists)
        if episodes:
            f.write("-- Episode Metadata\n")
            for episode in episodes:
                guest = episode.get('guest_name', '').replace("'", "''")
                title = (episode.get('episode_title') or '').replace("'", "''")
                youtube = episode.get('youtube_url', '')
                f.write(f"INSERT INTO kg_episode_metadata (episode_slug, guest_name, episode_title, youtube_url, video_id, duration_seconds, duration_human, published_date, created_at, updated_at)\n")
                f.write(f"VALUES ('{episode['episode_slug']}', '{guest}', '{title}', '{youtube}', '{episode.get('video_id', '')}', {episode.get('duration_seconds') or 'NULL'}, '{episode.get('duration_human', '')}', '{episode.get('published_date', '')}', NOW(), NOW())\n")
                f.write(f"ON CONFLICT (episode_slug) DO UPDATE SET\n")
                f.write(f"  youtube_url = EXCLUDED.youtube_url,\n")
                f.write(f"  updated_at = NOW();\n\n")
        
        f.write("COMMIT;\n")
    
    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"✅ Exported to: {output_path}")
    print(f"   Size: {file_size_mb:.1f} MB")
    print(f"   Format: SQL")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Export Lenny KG baseline')
    parser.add_argument('--format', choices=['json', 'sql', 'both'], default='both',
                       help='Export format: json, sql, or both')
    parser.add_argument('--output-dir', type=Path, default=Path('data/exports'),
                       help='Output directory (default: data/exports)')
    args = parser.parse_args()
    
    # Create output directory
    args.output_dir.mkdir(parents=True, exist_ok=True)
    
    # Get Supabase client
    client = get_supabase_client()
    
    timestamp = datetime.now().strftime('%Y%m%d')
    
    if args.format in ['json', 'both']:
        json_path = args.output_dir / f'lenny_kg_baseline_{timestamp}.json'
        export_json(json_path, client)
    
    if args.format in ['sql', 'both']:
        sql_path = args.output_dir / f'lenny_kg_baseline_{timestamp}.sql'
        export_sql(sql_path, client)
    
    print()
    print("=" * 70)
    print("✅ Export Complete!")
    print("=" * 70)
    print()
    print("📦 Next steps:")
    print("   1. Review exported files")
    print("   2. Create GitHub Release")
    print("   3. Upload files to release")
    print("   4. Update README with download instructions")


if __name__ == '__main__':
    main()
