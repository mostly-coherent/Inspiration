#!/usr/bin/env python3
"""
Index Lenny's Podcast transcripts into Knowledge Graph.

Extracts entities and relations from Lenny's podcast transcripts and stores them
in the Knowledge Graph tables, enabling visualization and exploration.

Usage:
    # Dry run on first episode
    python3 engine/scripts/index_lenny_kg.py --dry-run --limit 1
    
    # Index all episodes with relations
    python3 engine/scripts/index_lenny_kg.py --with-relations
    
    # Index specific number of episodes
    python3 engine/scripts/index_lenny_kg.py --limit 10
"""

import argparse
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.entity_extractor import extract_entities
from engine.common.entity_deduplicator import create_deduplicator
from engine.common.knowledge_graph import EntityMention
from engine.common.semantic_search import get_embedding
from engine.common.vector_db import get_supabase_client
from engine.common.lenny_parser import parse_all_episodes, find_transcript_files

# Lazy import for relation extractor
_relation_extractor = None

# Known problematic chunks to skip (oversized, exceed token limits)
# These chunks have 2000+ words in a single speaker turn
# Format: global chunk index from original embedding indexing
# We'll identify by episode filename + chunk index instead
SKIP_EPISODES_CHUNKS = {
    # Episode filename (or folder name): set of chunk indices to skip
    "Ryan Hoover": {850},  # Chunk 37850 in global index
    "Upasna Gautam": {869},  # Chunk 42869
    "Vijay": {385},  # Chunk 43385
}

# Retry configuration
MAX_RETRIES = 3
INITIAL_RETRY_DELAY = 2  # seconds
MAX_RETRY_DELAY = 60  # seconds


def get_relation_extractor():
    """Lazy load relation extractor to avoid import errors if not needed."""
    global _relation_extractor
    if _relation_extractor is None:
        from engine.common.relation_extractor import extract_relations
        _relation_extractor = extract_relations
    return _relation_extractor


def get_indexed_chunk_ids(supabase) -> set[str]:
    """Get set of chunk IDs that already have entity mentions."""
    try:
        result = supabase.table("kg_entity_mentions").select("message_id").execute()
        # Filter for Lenny chunks (format: lenny-{episode}-{chunk_index})
        return {row["message_id"] for row in result.data if row["message_id"].startswith("lenny-")}
    except Exception as e:
        print(f"⚠️ Could not fetch indexed chunk IDs: {e}")
        return set()


def save_entity_mention(
    supabase,
    entity_id: str,
    chunk_id: str,
    context_snippet: str,
    message_timestamp: int,
) -> None:
    """Save entity mention to database."""
    mention_data = {
        "id": str(uuid.uuid4()),
        "entity_id": entity_id,
        "message_id": chunk_id,
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
    chunk_id: str,
    message_timestamp: int,
    confidence: float = 0.8,
) -> bool:
    """
    Save relation to database (skip if duplicate).
    
    Returns:
        True if new relation created, False if updated existing
    """
    # Check if relation already exists
    existing = (
        supabase.table("kg_relations")
        .select("id, occurrence_count")
        .eq("source_entity_id", source_entity_id)
        .eq("target_entity_id", target_entity_id)
        .eq("relation_type", relation_type)
        .eq("message_id", chunk_id)
        .execute()
    )
    
    if existing.data:
        # Update occurrence count
        relation_id = existing.data[0]["id"]
        current_count = existing.data[0].get("occurrence_count", 1)
        supabase.table("kg_relations").update({
            "occurrence_count": current_count + 1,
        }).eq("id", relation_id).execute()
        return False
    
    # Create new relation
    relation_data = {
        "id": str(uuid.uuid4()),
        "source_entity_id": source_entity_id,
        "target_entity_id": target_entity_id,
        "relation_type": relation_type,
        "evidence_snippet": evidence_snippet[:500] if evidence_snippet else None,
        "message_id": chunk_id,
        "message_timestamp": message_timestamp,
        "confidence": confidence,
        "occurrence_count": 1,
    }
    supabase.table("kg_relations").insert(relation_data).execute()
    return True


def timestamp_from_episode_chunk(episode_filename: str, chunk_timestamp: str) -> int:
    """
    Convert episode filename + chunk timestamp to milliseconds timestamp.
    
    Uses a base timestamp for Lenny episodes (2020-01-01) and adds chunk timestamp offset.
    This ensures chronological ordering while keeping episodes distinct.
    """
    # Parse timestamp (HH:MM:SS)
    parts = chunk_timestamp.split(":")
    if len(parts) != 3:
        return 0
    
    hours, minutes, seconds = int(parts[0]), int(parts[1]), int(parts[2])
    offset_seconds = hours * 3600 + minutes * 60 + seconds
    
    # Base timestamp: 2020-01-01 00:00:00 UTC (Lenny podcast started ~2020)
    base_ts = datetime(2020, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    
    # Use episode filename hash to create unique base per episode
    # This ensures episodes don't overlap in time
    episode_hash = hash(episode_filename) % (365 * 24 * 3600)  # Within one year
    episode_base = base_ts.timestamp() + episode_hash
    
    # Add chunk offset
    final_ts = episode_base + offset_seconds
    
    return int(final_ts * 1000)  # Convert to milliseconds


def should_skip_chunk(episode_name: str, chunk_index: int) -> bool:
    """Check if chunk should be skipped (known oversized/problematic)."""
    return episode_name in SKIP_EPISODES_CHUNKS and chunk_index in SKIP_EPISODES_CHUNKS[episode_name]


def retry_with_backoff(func, *args, max_retries=MAX_RETRIES, operation_name="operation", **kwargs):
    """
    Execute function with exponential backoff retry logic.
    
    Args:
        func: Function to execute
        *args: Positional arguments for func
        max_retries: Maximum number of retry attempts
        operation_name: Human-readable name for logging
        **kwargs: Keyword arguments for func
        
    Returns:
        Result of func() or None if all retries exhausted
        
    Raises:
        Exception: Re-raises last exception if not a retriable error
    """
    delay = INITIAL_RETRY_DELAY
    
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            error_str = str(e).lower()
            
            # Check if error is retriable
            is_rate_limit = "rate limit" in error_str or "429" in error_str
            is_timeout = "timeout" in error_str or "timed out" in error_str
            is_connection = "connection" in error_str or "network" in error_str
            
            is_retriable = is_rate_limit or is_timeout or is_connection
            
            if not is_retriable or attempt == max_retries - 1:
                # Non-retriable error or last attempt
                raise
            
            # Log retry
            wait_time = min(delay * (2 ** attempt), MAX_RETRY_DELAY)
            print(f"   ⚠️ {operation_name} failed (attempt {attempt + 1}/{max_retries}): {e}")
            print(f"   ⏳ Retrying in {wait_time:.1f}s...")
            time.sleep(wait_time)
    
    return None


def print_progress_estimate(current: int, total: int, start_time: float, label: str = "Progress"):
    """Print progress with time estimate."""
    if current == 0:
        return
    
    elapsed = time.time() - start_time
    rate = current / elapsed
    remaining = total - current
    eta_seconds = remaining / rate if rate > 0 else 0
    
    # Format ETA
    if eta_seconds < 60:
        eta_str = f"{eta_seconds:.0f}s"
    elif eta_seconds < 3600:
        eta_str = f"{eta_seconds / 60:.0f}m"
    else:
        eta_str = f"{eta_seconds / 3600:.1f}h"
    
    print(f"   📊 {label}: {current}/{total} ({current/total*100:.1f}%) | ETA: {eta_str}")


def estimate_cost(num_episodes: int, with_relations: bool = False) -> dict:
    """
    Estimate API cost for indexing.
    
    Args:
        num_episodes: Number of episodes to index
        with_relations: Whether relation extraction is enabled
        
    Returns:
        Dict with cost breakdown
    """
    # Average chunks per episode (from data/lenny_metadata.json analysis)
    avg_chunks_per_episode = 157  # ~44K chunks / 300+ episodes (updated weekly from ChatPRD GitHub)
    
    # Tokens per chunk (estimated)
    avg_tokens_per_chunk = 500
    
    # GPT-4o-mini pricing (as of 2026-01)
    gpt4o_mini_input_per_1m = 0.15  # $0.15 per 1M input tokens
    gpt4o_mini_output_per_1m = 0.60  # $0.60 per 1M output tokens
    
    # Entity extraction: ~200 output tokens per chunk (structured JSON)
    # Relation extraction: ~150 output tokens per chunk
    
    total_chunks = num_episodes * avg_chunks_per_episode
    
    # Entity extraction cost
    entity_input_tokens = total_chunks * avg_tokens_per_chunk
    entity_output_tokens = total_chunks * 200
    entity_cost = (entity_input_tokens / 1_000_000 * gpt4o_mini_input_per_1m +
                   entity_output_tokens / 1_000_000 * gpt4o_mini_output_per_1m)
    
    # Relation extraction cost (if enabled)
    relation_cost = 0
    if with_relations:
        relation_input_tokens = total_chunks * avg_tokens_per_chunk
        relation_output_tokens = total_chunks * 150
        relation_cost = (relation_input_tokens / 1_000_000 * gpt4o_mini_input_per_1m +
                        relation_output_tokens / 1_000_000 * gpt4o_mini_output_per_1m)
    
    # Embedding cost (for entity names)
    # text-embedding-3-small: $0.02 per 1M tokens
    # Assume ~5 entities per chunk, avg 3 tokens per entity name
    embedding_tokens = total_chunks * 5 * 3
    embedding_cost = embedding_tokens / 1_000_000 * 0.02
    
    total_cost = entity_cost + relation_cost + embedding_cost
    
    return {
        "total_cost": total_cost,
        "entity_cost": entity_cost,
        "relation_cost": relation_cost,
        "embedding_cost": embedding_cost,
        "total_chunks": total_chunks,
        "avg_time_hours": total_chunks / 10 / 60,  # ~10 chunks/min estimate
    }


def main():
    parser = argparse.ArgumentParser(description="Index Lenny's Podcast transcripts into Knowledge Graph")
    parser.add_argument("--dry-run", action="store_true", help="Don't save to database")
    parser.add_argument("--limit", type=int, help="Limit number of episodes to process")
    parser.add_argument("--with-relations", action="store_true", help="Also extract relations")
    parser.add_argument("--force", action="store_true", help="Re-index already processed chunks")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--archive-path", type=str, default="data/lenny-transcripts", 
                       help="Path to Lenny transcripts archive")
    
    args = parser.parse_args()
    
    # Initialize
    archive_path = Path(args.archive_path)
    if not archive_path.exists():
        print(f"❌ Archive path not found: {archive_path}")
        print(f"   Run: git clone https://github.com/ChatPRD/lennys-podcast-transcripts.git {archive_path}")
        sys.exit(1)
    
    supabase = get_supabase_client()
    if not supabase:
        print("❌ Supabase not configured. Please run setup first.")
        sys.exit(1)
    
    deduplicator = create_deduplicator()
    
    # Parse episodes
    print(f"📂 Parsing Lenny transcripts from: {archive_path}")
    transcript_files = find_transcript_files(archive_path)
    
    if not transcript_files:
        print(f"❌ No transcript files found in {archive_path}")
        sys.exit(1)
    
    # Limit episodes if specified
    if args.limit:
        transcript_files = transcript_files[:args.limit]
    
    print(f"📋 Found {len(transcript_files)} episode(s) to process")
    
    # Show cost estimate (unless dry-run)
    if not args.dry_run:
        cost_est = estimate_cost(len(transcript_files), args.with_relations)
        print(f"\n💰 Estimated Cost:")
        print(f"   Entity extraction: ${cost_est['entity_cost']:.2f}")
        if args.with_relations:
            print(f"   Relation extraction: ${cost_est['relation_cost']:.2f}")
        print(f"   Embeddings: ${cost_est['embedding_cost']:.2f}")
        print(f"   Total: ${cost_est['total_cost']:.2f}")
        print(f"   Estimated time: {cost_est['avg_time_hours']:.1f} hours")
        print(f"   (Based on ~{cost_est['total_chunks']} chunks, ~10 chunks/min)\n")
    
    # Get already-indexed chunks
    indexed_chunk_ids = set()
    if not args.force:
        indexed_chunk_ids = get_indexed_chunk_ids(supabase)
        print(f"📊 Already indexed: {len(indexed_chunk_ids)} chunks")
        if indexed_chunk_ids:
            print(f"   ✅ Will skip already-indexed chunks (incremental mode)")
    
    # Stats
    stats = {
        "episodes_processed": 0,
        "chunks_processed": 0,
        "chunks_skipped": 0,
        "chunks_oversized": 0,
        "entities_found": 0,
        "entities_created": 0,
        "relations_found": 0,
        "relations_created": 0,
        "errors": 0,
        "errors_rate_limit": 0,
        "errors_timeout": 0,
        "errors_other": 0,
    }
    
    # Track progress timing
    start_time = time.time()
    last_progress_time = start_time
    
    # Process each episode
    for episode_file in transcript_files:
        episode_name = episode_file.parent.name if episode_file.parent.name != "episodes" else episode_file.stem
        
        try:
            # Parse episode
            from engine.common.lenny_parser import parse_episode_file
            episode = parse_episode_file(episode_file)
            
            print(f"\n📝 Episode: {episode.guest_name} ({len(episode.chunks)} chunks)")
            
            # Process each chunk
            for chunk in episode.chunks:
                # Create unique chunk ID
                chunk_id = f"lenny-{episode_name}-{chunk.chunk_index}"
                
                # Skip if already indexed
                if not args.force and chunk_id in indexed_chunk_ids:
                    stats["chunks_skipped"] += 1
                    continue
                
                # Skip if known problematic (oversized)
                if should_skip_chunk(episode_name, chunk.chunk_index):
                    stats["chunks_oversized"] += 1
                    if args.verbose:
                        print(f"   ⏭️ Skipping chunk {chunk.chunk_index} (known oversized)")
                    continue
                
                stats["chunks_processed"] += 1
                
                # Convert timestamp
                message_timestamp = timestamp_from_episode_chunk(episode.filename, chunk.timestamp)
                
                # Extract entities (with retry logic)
                try:
                    extracted = retry_with_backoff(
                        extract_entities,
                        chunk.content,
                        operation_name=f"Entity extraction for chunk {chunk.chunk_index}"
                    )
                    
                    if not extracted:
                        continue
                    
                    stats["entities_found"] += len(extracted)
                    
                    if args.dry_run and args.verbose:
                        print(f"\n   Chunk {chunk.chunk_index} ({chunk.speaker}) → {len(extracted)} entities:")
                        for e in extracted:
                            print(f"      - {e.name} ({e.entity_type.value})")
                    
                    if args.dry_run:
                        continue
                    
                    # Process each extracted entity
                    message_entity_ids = []
                    message_entity_names = []
                    
                    for entity in extracted:
                        try:
                            # Generate embedding (with retry)
                            embedding = retry_with_backoff(
                                get_embedding,
                                entity.name,
                                operation_name=f"Embedding for {entity.name}"
                            )
                            
                            # Find or create entity (mark as expert source)
                            entity_id, is_new = deduplicator.find_or_create_entity(
                                name=entity.name,
                                entity_type=entity.entity_type,
                                embedding=embedding,
                                message_timestamp=message_timestamp,
                                source_type="expert",
                            )
                            
                            if is_new:
                                stats["entities_created"] += 1
                            
                            # Save mention
                            save_entity_mention(
                                supabase,
                                entity_id=entity_id,
                                chunk_id=chunk_id,
                                context_snippet=chunk.content[:500],
                                message_timestamp=message_timestamp,
                            )
                            
                            message_entity_ids.append(entity_id)
                            message_entity_names.append(entity.name)
                            
                        except Exception as e:
                            # Categorize error
                            error_str = str(e).lower()
                            if "rate limit" in error_str or "429" in error_str:
                                stats["errors_rate_limit"] += 1
                            elif "timeout" in error_str or "timed out" in error_str:
                                stats["errors_timeout"] += 1
                            else:
                                stats["errors_other"] += 1
                            
                            if args.verbose:
                                print(f"   ⚠️ Error processing entity '{entity.name}': {e}")
                            stats["errors"] += 1
                    
                    # Extract relations if requested
                    if args.with_relations and len(message_entity_ids) >= 2:
                        try:
                            extract_relations_fn = get_relation_extractor()
                            relations = retry_with_backoff(
                                extract_relations_fn,
                                chunk.content,
                                known_entities=message_entity_names,
                                operation_name=f"Relation extraction for chunk {chunk.chunk_index}"
                            )
                            
                            if relations:
                                stats["relations_found"] += len(relations)
                                
                                # Map entity names to IDs
                                name_to_id = dict(zip(message_entity_names, message_entity_ids))
                                
                                for rel in relations:
                                    source_id = name_to_id.get(rel.source_name)
                                    target_id = name_to_id.get(rel.target_name)
                                    
                                    if source_id and target_id:
                                        is_new = save_relation(
                                            supabase,
                                            source_entity_id=source_id,
                                            target_entity_id=target_id,
                                            relation_type=rel.relation_type.value,
                                            evidence_snippet=rel.evidence_snippet,
                                            chunk_id=chunk_id,
                                            message_timestamp=message_timestamp,
                                            confidence=rel.confidence,
                                        )
                                        if is_new:
                                            stats["relations_created"] += 1
                                            
                        except Exception as e:
                            # Categorize error
                            error_str = str(e).lower()
                            if "rate limit" in error_str or "429" in error_str:
                                stats["errors_rate_limit"] += 1
                            elif "timeout" in error_str or "timed out" in error_str:
                                stats["errors_timeout"] += 1
                            else:
                                stats["errors_other"] += 1
                            
                            if args.verbose:
                                print(f"   ⚠️ Error extracting relations: {e}")
                            stats["errors"] += 1
                
                except Exception as e:
                    # Categorize error
                    error_str = str(e).lower()
                    if "rate limit" in error_str or "429" in error_str:
                        stats["errors_rate_limit"] += 1
                    elif "timeout" in error_str or "timed out" in error_str:
                        stats["errors_timeout"] += 1
                    else:
                        stats["errors_other"] += 1
                    
                    stats["errors"] += 1
                    if args.verbose:
                        print(f"\n   ⚠️ Error processing chunk {chunk.chunk_index}: {e}")
            
            stats["episodes_processed"] += 1
            
            # Show progress estimate every episode
            if stats["episodes_processed"] % 1 == 0:  # Every episode
                print_progress_estimate(
                    stats["episodes_processed"],
                    len(transcript_files),
                    start_time,
                    label="Episodes"
                )
            
        except Exception as e:
            stats["errors"] += 1
            print(f"\n❌ Error processing episode {episode_file.name}: {e}")
            if args.verbose:
                import traceback
                traceback.print_exc()
    
    # Final stats
    total_time = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"📊 Indexing Summary:")
    print(f"   Episodes processed: {stats['episodes_processed']}/{len(transcript_files)}")
    print(f"   Chunks processed: {stats['chunks_processed']}")
    if stats['chunks_skipped'] > 0:
        print(f"   Chunks skipped (already indexed): {stats['chunks_skipped']}")
    if stats['chunks_oversized'] > 0:
        print(f"   Chunks skipped (oversized): {stats['chunks_oversized']}")
    print(f"   Entities found: {stats['entities_found']}")
    print(f"   Entities created: {stats['entities_created']}")
    if args.with_relations:
        print(f"   Relations found: {stats['relations_found']}")
        print(f"   Relations created: {stats['relations_created']}")
    if stats['errors'] > 0:
        print(f"   Errors: {stats['errors']}")
        if stats['errors_rate_limit'] > 0:
            print(f"      Rate limit errors: {stats['errors_rate_limit']}")
        if stats['errors_timeout'] > 0:
            print(f"      Timeout errors: {stats['errors_timeout']}")
        if stats['errors_other'] > 0:
            print(f"      Other errors: {stats['errors_other']}")
    print(f"   Total time: {total_time/60:.1f} minutes")
    if stats['chunks_processed'] > 0:
        print(f"   Rate: {stats['chunks_processed']/(total_time/60):.1f} chunks/min")
    print(f"{'='*60}")
    
    if args.dry_run:
        print("\n✅ Dry run complete - no data saved")
    else:
        print("\n✅ Indexing complete!")
        print("\n📍 Next steps:")
        print("   1. Verify entities: python3 -c \"from engine.common.vector_db import get_supabase_client; client = get_supabase_client(); result = client.rpc('get_entities_by_source').execute(); print(result.data[:5])\"")
        print("   2. Check source breakdown: python3 -c \"from engine.common.vector_db import get_supabase_client; client = get_supabase_client(); result = client.rpc('get_kg_stats').execute(); print('KG Stats:', result.data)\"")
        print("   3. View in Entity Explorer: http://localhost:3000/entities")


if __name__ == "__main__":
    main()
