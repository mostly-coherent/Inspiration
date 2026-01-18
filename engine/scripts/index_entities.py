#!/usr/bin/env python3
"""
Entity Indexing Script — Extract entities from chat history and store in Knowledge Graph.

Usage:
    # Dry run on 10 messages
    python3 engine/scripts/index_entities.py --dry-run --limit 10
    
    # Index all messages (incremental - skips already processed)
    python3 engine/scripts/index_entities.py
    
    # Index with relation extraction
    python3 engine/scripts/index_entities.py --with-relations
    
    # Force reindex all messages
    python3 engine/scripts/index_entities.py --force
    
    # Index specific date range
    python3 engine/scripts/index_entities.py --days 7
"""

import argparse
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.entity_extractor import extract_entities
from engine.common.entity_deduplicator import create_deduplicator
from engine.common.knowledge_graph import EntityMention
from engine.common.semantic_search import get_embedding
from engine.common.vector_db import get_supabase_client

# Lazy import for relation extractor (may not be needed)
_relation_extractor = None


def get_relation_extractor():
    """Lazy load relation extractor to avoid import errors if not needed."""
    global _relation_extractor
    if _relation_extractor is None:
        from engine.common.relation_extractor import extract_relations
        _relation_extractor = extract_relations
    return _relation_extractor


def get_messages_to_index(
    supabase,
    limit: int = None,
    days: int = None,
    force: bool = False,
) -> list[dict]:
    """
    Fetch messages that need entity extraction.
    
    Args:
        supabase: Supabase client
        limit: Maximum messages to fetch
        days: Only fetch messages from last N days
        force: If True, ignore already-indexed messages
        
    Returns:
        List of message dictionaries
    """
    query = supabase.table("cursor_messages").select("message_id, text, timestamp, workspace, chat_id")
    
    # Filter by date if specified
    if days:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        cutoff_ts = int(cutoff.timestamp() * 1000)
        query = query.gte("timestamp", cutoff_ts)
    
    # Order by timestamp descending (most recent first)
    query = query.order("timestamp", desc=True)
    
    # Limit if specified
    if limit:
        query = query.limit(limit)
    
    result = query.execute()
    messages = result.data
    
    if not force:
        # Filter out already-indexed messages
        indexed_message_ids = get_indexed_message_ids(supabase)
        messages = [m for m in messages if m["message_id"] not in indexed_message_ids]
    
    return messages


def get_indexed_message_ids(supabase) -> set[str]:
    """Get set of message IDs that already have entity mentions."""
    try:
        result = supabase.table("kg_entity_mentions").select("message_id").execute()
        return {row["message_id"] for row in result.data}
    except Exception as e:
        print(f"⚠️ Could not fetch indexed message IDs: {e}")
        return set()


def save_entity_mention(
    supabase,
    entity_id: str,
    message_id: str,
    context_snippet: str,
    message_timestamp: int,
) -> None:
    """Save entity mention to database."""
    mention_data = {
        "id": str(uuid.uuid4()),
        "entity_id": entity_id,
        "message_id": message_id,
        "context_snippet": context_snippet[:500],  # Truncate long snippets
        "message_timestamp": message_timestamp,
    }
    
    supabase.table("kg_entity_mentions").insert(mention_data).execute()


def save_relation(
    supabase,
    source_entity_id: str,
    target_entity_id: str,
    relation_type: str,
    evidence_snippet: str,
    message_id: str,
    message_timestamp: int,
    confidence: float = 0.8,
) -> bool:
    """
    Save relation to database, updating if already exists.
    
    Returns:
        True if new relation created, False if updated existing
    """
    relation_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Check if relation already exists (for this source/target/type/message)
    existing = (
        supabase.table("kg_relations")
        .select("id, occurrence_count")
        .eq("source_entity_id", source_entity_id)
        .eq("target_entity_id", target_entity_id)
        .eq("relation_type", relation_type)
        .eq("message_id", message_id)
        .execute()
    )
    
    if existing.data:
        # Update occurrence count
        supabase.table("kg_relations").update({
            "occurrence_count": existing.data[0]["occurrence_count"] + 1,
            "last_seen": now,
        }).eq("id", existing.data[0]["id"]).execute()
        return False
    
    # Create new relation
    relation_data = {
        "id": relation_id,
        "source_entity_id": source_entity_id,
        "target_entity_id": target_entity_id,
        "relation_type": relation_type,
        "evidence_snippet": evidence_snippet[:500] if evidence_snippet else None,
        "message_id": message_id,
        "message_timestamp": message_timestamp,
        "confidence": confidence,
        "occurrence_count": 1,
        "first_seen": now,
        "last_seen": now,
    }
    
    try:
        supabase.table("kg_relations").insert(relation_data).execute()
        return True
    except Exception as e:
        # Handle unique constraint violation (race condition)
        if "duplicate" in str(e).lower():
            return False
        raise


def index_entities(
    dry_run: bool = False,
    limit: int = None,
    days: int = None,
    force: bool = False,
    verbose: bool = False,
    with_relations: bool = False,
) -> dict:
    """
    Main indexing function.
    
    Args:
        dry_run: If True, don't save to database
        limit: Maximum messages to process
        days: Only process messages from last N days
        force: If True, reprocess already-indexed messages
        verbose: If True, print detailed progress
        with_relations: If True, also extract relations between entities
        
    Returns:
        Stats dictionary with counts
    """
    print("🔮 Knowledge Graph Entity Indexer")
    if with_relations:
        print("   (with relation extraction)")
    print("=" * 50)
    
    # Initialize clients
    supabase = get_supabase_client()
    if not supabase:
        print("❌ Supabase not configured. Please run setup first.")
        return {"error": "Supabase not configured"}
    
    if not dry_run:
        deduplicator = create_deduplicator()
    
    # Fetch messages
    print(f"\n📥 Fetching messages to index...")
    if days:
        print(f"   (last {days} days)")
    if limit:
        print(f"   (limit: {limit})")
    if force:
        print(f"   (force reindex: ignoring already-indexed)")
    
    messages = get_messages_to_index(supabase, limit=limit, days=days, force=force)
    total_messages = len(messages)
    
    if total_messages == 0:
        print("\n✅ No new messages to index.")
        return {"messages_processed": 0, "entities_found": 0, "entities_created": 0}
    
    print(f"   Found {total_messages} messages to process")
    
    # Stats
    stats = {
        "messages_processed": 0,
        "entities_found": 0,
        "entities_created": 0,
        "mentions_created": 0,
        "relations_found": 0,
        "relations_created": 0,
        "errors": 0,
    }
    
    # Entity name to ID mapping (for relation linking)
    entity_name_to_id: dict[str, str] = {}
    
    # Process messages
    print(f"\n🔍 Extracting entities...")
    
    for i, msg in enumerate(messages):
        message_id = msg["message_id"]
        text = msg["text"]
        timestamp = msg["timestamp"]
        
        # Progress
        if (i + 1) % 10 == 0 or i == 0:
            pct = ((i + 1) / total_messages) * 100
            print(f"   [{i + 1}/{total_messages}] {pct:.1f}%", end="\r")
        
        # Skip very short messages
        if not text or len(text.strip()) < 50:
            continue
        
        try:
            # Extract entities from message
            extracted = extract_entities(text)
            
            if not extracted:
                continue
            
            stats["entities_found"] += len(extracted)
            
            if dry_run:
                if verbose:
                    print(f"\n   Message {message_id[:8]}... → {len(extracted)} entities:")
                    for e in extracted:
                        print(f"      - {e.name} ({e.entity_type.value})")
                continue
            
            # Process each extracted entity
            message_entity_ids = []  # Track entity IDs in this message for relation linking
            message_entity_names = []  # Track entity names for relation extraction hint
            
            for entity in extracted:
                try:
                    # Generate embedding for entity name
                    embedding = get_embedding(entity.name)
                    
                    # Find or create entity (with deduplication, mark as user source)
                    entity_id, is_new = deduplicator.find_or_create_entity(
                        name=entity.name,
                        entity_type=entity.entity_type,
                        embedding=embedding,
                        source_type="user",
                        confidence=entity.confidence,
                        message_timestamp=timestamp,
                    )
                    
                    if is_new:
                        stats["entities_created"] += 1
                    
                    # Track for relation linking
                    entity_name_to_id[entity.name.lower()] = entity_id
                    message_entity_ids.append(entity_id)
                    message_entity_names.append(entity.name)
                    
                    # Create mention link
                    context_snippet = _extract_context(text, entity.name)
                    save_entity_mention(
                        supabase,
                        entity_id=entity_id,
                        message_id=message_id,
                        context_snippet=context_snippet,
                        message_timestamp=timestamp,
                    )
                    stats["mentions_created"] += 1
                    
                except Exception as e:
                    stats["errors"] += 1
                    if verbose:
                        print(f"\n   ⚠️ Error processing entity '{entity.name}': {e}")
            
            # Extract relations if enabled and we have at least 2 entities
            if with_relations and len(message_entity_names) >= 2:
                try:
                    extract_relations_fn = get_relation_extractor()
                    relations = extract_relations_fn(text, known_entities=message_entity_names)
                    
                    stats["relations_found"] += len(relations)
                    
                    for rel in relations:
                        try:
                            # Find entity IDs for source and target
                            source_id = entity_name_to_id.get(rel.source_name.lower())
                            target_id = entity_name_to_id.get(rel.target_name.lower())
                            
                            if source_id and target_id and source_id != target_id:
                                is_new = save_relation(
                                    supabase,
                                    source_entity_id=source_id,
                                    target_entity_id=target_id,
                                    relation_type=rel.relation_type.value,
                                    evidence_snippet=rel.evidence_snippet,
                                    message_id=message_id,
                                    message_timestamp=timestamp,
                                    confidence=rel.confidence,
                                )
                                if is_new:
                                    stats["relations_created"] += 1
                        except Exception as rel_err:
                            stats["errors"] += 1
                            if verbose:
                                print(f"\n   ⚠️ Error saving relation '{rel.source_name} -> {rel.target_name}': {rel_err}")
                                
                except Exception as e:
                    stats["errors"] += 1
                    if verbose:
                        print(f"\n   ⚠️ Error extracting relations: {e}")
            
            stats["messages_processed"] += 1
            
        except Exception as e:
            stats["errors"] += 1
            if verbose:
                print(f"\n   ⚠️ Error processing message {message_id[:8]}...: {e}")
    
    # Final stats
    print(f"\n\n{'=' * 50}")
    print("📊 Indexing Complete!")
    print(f"   Messages processed: {stats['messages_processed']}")
    print(f"   Entities found: {stats['entities_found']}")
    if not dry_run:
        print(f"   New entities created: {stats['entities_created']}")
        print(f"   Mentions created: {stats['mentions_created']}")
    if with_relations:
        print(f"   Relations found: {stats['relations_found']}")
        if not dry_run:
            print(f"   Relations created: {stats['relations_created']}")
    if stats["errors"] > 0:
        print(f"   ⚠️ Errors: {stats['errors']}")
    
    if dry_run:
        print("\n   ℹ️ Dry run - no data was saved")
    
    return stats


def _extract_context(text: str, entity_name: str, context_chars: int = 100) -> str:
    """Extract context snippet around entity mention."""
    # Find entity in text (case-insensitive)
    text_lower = text.lower()
    entity_lower = entity_name.lower()
    
    pos = text_lower.find(entity_lower)
    if pos == -1:
        # Entity not found literally, return start of text
        return text[:context_chars * 2]
    
    # Extract context around the mention
    start = max(0, pos - context_chars)
    end = min(len(text), pos + len(entity_name) + context_chars)
    
    snippet = text[start:end]
    
    # Add ellipsis if truncated
    if start > 0:
        snippet = "..." + snippet
    if end < len(text):
        snippet = snippet + "..."
    
    return snippet


def main():
    parser = argparse.ArgumentParser(
        description="Extract entities from chat history and store in Knowledge Graph"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Don't save to database, just show what would be extracted"
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Maximum number of messages to process"
    )
    parser.add_argument(
        "--days",
        type=int,
        help="Only process messages from last N days"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reprocess already-indexed messages"
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Print detailed progress"
    )
    parser.add_argument(
        "--with-relations",
        action="store_true",
        help="Also extract relations between entities"
    )
    
    args = parser.parse_args()
    
    stats = index_entities(
        dry_run=args.dry_run,
        limit=args.limit,
        days=args.days,
        force=args.force,
        verbose=args.verbose,
        with_relations=args.with_relations,
    )
    
    # Exit with error code if there were issues
    if stats.get("error") or stats.get("errors", 0) > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
