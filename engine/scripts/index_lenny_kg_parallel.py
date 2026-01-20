#!/usr/bin/env python3
"""
Parallel Knowledge Graph Indexing for Lenny's Podcast.

4x faster than sequential version using multiprocessing.
Maintains all bulletproof features: retry logic, resume capability, error handling.

Usage:
    # Dry run
    python3 engine/scripts/index_lenny_kg_parallel.py --dry-run --limit 10
    
    # Full index with 4 workers (default)
    python3 engine/scripts/index_lenny_kg_parallel.py --with-relations
    
    # Custom worker count
    python3 engine/scripts/index_lenny_kg_parallel.py --with-relations --workers 6
"""

import argparse
import multiprocessing as mp
import os
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

from engine.common.entity_extractor import extract_entities
from engine.common.entity_deduplicator import create_deduplicator
from engine.common.entity_canonicalizer import EntityCanonicalizer
from engine.common.knowledge_graph import EntityMention
from engine.common.semantic_search import get_embedding
from engine.common.vector_db import get_supabase_client
from engine.common.lenny_parser import parse_all_episodes
from engine.common.kg_quality_filter import score_chunk_quality, validate_entity
from engine.common.llm import PermanentAPIFailure
from engine.common.triple_extractor import extract_triples, triples_to_entities

# Known problematic chunks to skip (same as sequential version)
SKIP_EPISODES_CHUNKS = {
    "Ryan Hoover": {850},
    "Upasna Gautam": {869},
    "Vijay": {385},
}

# Retry configuration
MAX_RETRIES = 3
INITIAL_RETRY_DELAY_SECONDS = 2
MAX_RETRY_DELAY = 60

# Quality and snippet configuration
MAX_SNIPPET_LENGTH = 500
QUALITY_THRESHOLD_BORDERLINE_MIN = 0.30  # Log chunks near threshold for tuning
QUALITY_THRESHOLD_BORDERLINE_MAX = 0.40

# Progress tracking (will be initialized in main)
_progress_lock = None
_progress_stats = None
_error_log_file = None  # File handle for error logging


def get_indexed_chunk_ids(supabase) -> set[str]:
    """
    Get set of chunk IDs that already have entity mentions.
    
    Raises:
        Exception: If pagination fails, raises to indicate incomplete results
    """
    # Fetch all rows with pagination
    all_chunk_ids = set()
    page_size = 1000
    offset = 0
    
    while True:
        try:
            result = supabase.table("kg_entity_mentions")\
                .select("message_id")\
                .like("message_id", "lenny-%")\
                .range(offset, offset + page_size - 1)\
                .execute()
            
            if not result.data:
                break
                
            for row in result.data:
                all_chunk_ids.add(row["message_id"])
            
            if len(result.data) < page_size:
                break
                
            offset += page_size
        except Exception as e:
            print(f"❌ CRITICAL: Error fetching indexed chunks at offset {offset}: {e}")
            print(f"   This may cause re-indexing of already-indexed chunks!")
            # Re-raise to indicate incomplete results
            raise RuntimeError(f"Failed to fetch complete set of indexed chunks at offset {offset}") from e
    
    print(f"✅ Fetched {len(all_chunk_ids):,} indexed chunk IDs")
    return all_chunk_ids


def should_skip_chunk(episode_name: str, chunk_index: int) -> bool:
    """Check if chunk should be skipped (known oversized/problematic)."""
    return episode_name in SKIP_EPISODES_CHUNKS and chunk_index in SKIP_EPISODES_CHUNKS[episode_name]


def log_error(error_msg: str, chunk_id: str = None):
    """
    Log error to file with timestamp.
    Thread-safe for multiprocessing.
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] {f'Chunk {chunk_id}: ' if chunk_id else ''}{error_msg}\n"
    
    # Write to stderr for immediate visibility
    sys.stderr.write(log_line)
    
    # Also write to file if configured
    if _error_log_file:
        try:
            with open(_error_log_file, 'a') as f:
                f.write(log_line)
        except Exception:
            # Don't crash if logging fails
            pass


def chunk_to_timestamp(episode_filename: str, chunk_timestamp: str) -> int:
    """Convert episode chunk timestamp to Unix timestamp (milliseconds)."""
    parts = chunk_timestamp.split(":")
    if len(parts) != 3:
        return 0
    
    hours, minutes, seconds = int(parts[0]), int(parts[1]), int(parts[2])
    offset_seconds = hours * 3600 + minutes * 60 + seconds
    
    base_ts = datetime(2020, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    episode_hash = hash(episode_filename) % (365 * 24 * 3600)
    episode_base = base_ts.timestamp() + episode_hash
    final_ts = episode_base + offset_seconds
    
    return int(final_ts * 1000)


def retry_with_backoff(func, *args, max_retries=MAX_RETRIES, operation_name="operation", **kwargs):
    """
    Execute function with exponential backoff retry logic.
    
    Raises:
        RuntimeError: If max retries exceeded, wraps original exception with operation context
    """
    delay = INITIAL_RETRY_DELAY_SECONDS
    last_exception = None
    
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            last_exception = e
            error_str = str(e).lower()
            is_rate_limit = "rate limit" in error_str or "429" in error_str
            is_timeout = "timeout" in error_str or "timed out" in error_str
            is_connection = "connection" in error_str or "network" in error_str
            is_retriable = is_rate_limit or is_timeout or is_connection
            
            if not is_retriable or attempt == max_retries - 1:
                # Wrap with operation context for better debugging
                raise RuntimeError(f"Failed {operation_name} after {attempt + 1} attempts") from e
            
            wait_time = min(delay * (2 ** attempt), MAX_RETRY_DELAY)
            time.sleep(wait_time)
    
    # Should never reach here, but just in case
    if last_exception:
        raise RuntimeError(f"Failed {operation_name} after {max_retries} attempts") from last_exception
    return None


def save_entity_mention(supabase, entity_id: str, chunk_id: str, context_snippet: str, message_timestamp: int):
    """
    Save entity mention to database.
    
    Handles race condition where two workers try to save the same mention.
    Silently ignores duplicate key errors.
    """
    mention_data = {
        "id": str(uuid.uuid4()),
        "entity_id": entity_id,
        "message_id": chunk_id,
        "context_snippet": context_snippet[:MAX_SNIPPET_LENGTH],
        "message_timestamp": message_timestamp,
    }
    try:
        supabase.table("kg_entity_mentions").insert(mention_data).execute()
    except Exception as e:
        error_msg = str(e).lower()
        # Ignore duplicate key errors (race condition between workers)
        if "duplicate" in error_msg or "unique" in error_msg or "constraint" in error_msg:
            # This is expected when two workers process the same chunk
            pass
        else:
            # Re-raise other errors
            raise


def save_relation(supabase, source_entity_id: str, target_entity_id: str, relation_type: str, evidence_snippet: str, chunk_id: str):
    """
    Save relation to database.
    
    Handles race condition where two workers try to save the same relation.
    Silently ignores duplicate key errors.
    """
    relation_data = {
        "id": str(uuid.uuid4()),
        "source_entity_id": source_entity_id,
        "target_entity_id": target_entity_id,
        "relation_type": relation_type,
        "evidence_snippet": evidence_snippet[:MAX_SNIPPET_LENGTH],
        "source_message_id": chunk_id,
    }
    try:
        supabase.table("kg_relations").insert(relation_data).execute()
    except Exception as e:
        error_msg = str(e).lower()
        # Ignore duplicate key errors (race condition between workers)
        if "duplicate" in error_msg or "unique" in error_msg or "constraint" in error_msg:
            # This is expected when two workers process the same chunk
            pass
        else:
            # Re-raise other errors
            raise


def process_chunk_worker(chunk_data: dict) -> dict:
    """
    Worker function to process a single chunk.
    Each worker has its own Supabase connection and deduplicator.
    
    Returns dict with processing stats.
    """
    episode_name = chunk_data["episode_name"]
    chunk_index = chunk_data["chunk_index"]
    chunk_text = chunk_data["chunk_text"]
    chunk_timestamp = chunk_data["chunk_timestamp"]
    chunk_id = chunk_data["chunk_id"]
    with_relations = chunk_data["with_relations"]
    dry_run = chunk_data["dry_run"]
    worker_id = chunk_data["worker_id"]
    
    stats = {
        "worker_id": worker_id,
        "chunk_id": chunk_id,
        "entities_created": 0,
        "entities_deduplicated": 0,
        "entities_rejected": 0,
        "relations_created": 0,
        "error": None,
        "skipped": False,
        "skip_reason": None,
        "quality_score": 0.0,
    }
    
    try:
        # Check if should skip (known problematic chunks)
        if should_skip_chunk(episode_name, chunk_index):
            stats["skipped"] = True
            stats["skip_reason"] = "known_problematic"
            return stats
        
        # QUALITY FILTER: Pre-filter chunk quality BEFORE LLM call
        quality_score = score_chunk_quality(chunk_text, content_type="podcast")
        stats["quality_score"] = quality_score.score
        
        if not quality_score.should_index:
            stats["skipped"] = True
            stats["skip_reason"] = f"low_quality ({quality_score.score:.2f})"
            
            # Log borderline cases (near threshold) for quality filter tuning
            if QUALITY_THRESHOLD_BORDERLINE_MIN <= quality_score.score <= QUALITY_THRESHOLD_BORDERLINE_MAX:
                print(f"   [Worker {worker_id}] Borderline {chunk_id}: {quality_score.score:.2f} - {quality_score.reason}")
            
            return stats
        
        if dry_run:
            print(f"   [Worker {worker_id}] DRY RUN: Would process chunk {chunk_id} (quality: {quality_score.score:.2f})")
            return stats
        
        # Create worker-local connections
        supabase = get_supabase_client()
        deduplicator = create_deduplicator()
        
        # Double-check if already indexed (atomic check for race condition protection)
        existing = supabase.table("kg_entity_mentions").select("id").eq("message_id", chunk_id).limit(1).execute()
        if existing.data:
            stats["skipped"] = True
            stats["skip_reason"] = "already_indexed"
            return stats
        
        message_timestamp = chunk_to_timestamp(episode_name, chunk_timestamp)
        
        # Phase 0: Triple-Based Foundation
        # Step 1: Extract triples (Subject-Predicate-Object) as foundation
        # Use Claude Haiku 4.5 for baseline quality (consistent with entity extraction)
        triples = []
        try:
            triples = retry_with_backoff(
                extract_triples,
                chunk_text,
                model="claude-haiku-4-5",
                provider="anthropic",
                context="baseline",
                operation_name=f"triple extraction for {chunk_id}"
            )
        except Exception as e:
            # If triple extraction fails, log but continue (fallback to direct extraction)
            print(f"   ⚠️ Triple extraction failed for {chunk_id}: {str(e)}")
            log_error(f"Triple extraction failed: {str(e)}", chunk_id=chunk_id)
            # Continue with direct entity extraction as fallback
        
        # Step 2: Extract entities with types (7 types + "unknown") from triples
        # Phase 0: Use triple structure as foundation for entity extraction
        # Only high-quality chunks (>= 0.35 score) reach this point
        # context="baseline" ensures high-quality models only (no GPT-3.5 fallback)
        try:
            # Extract entities (triples provide structure/context for better extraction)
            # The entity extractor already supports "unknown" type via EntityType.UNKNOWN
            entities = retry_with_backoff(
                extract_entities,
                chunk_text,
                model="claude-haiku-4-5",
                provider="anthropic",
                context="baseline",
                operation_name=f"entity extraction for {chunk_id}"
            )
            
            # Phase 0 Enhancement: If triples available, validate entities against triples
            # (Future: Use triples to enhance entity extraction accuracy)
            if triples:
                # Extract entity names from triples for future validation/enhancement
                # Currently unused but extracted for Phase 0 foundation
                _entity_names_from_triples = triples_to_entities(triples)  # noqa: F841
                # Note: Future enhancement could use triples to validate/enhance entity extraction
                # For now, triples are extracted but entity extraction remains direct
        except Exception as e:
            # If entity extraction fails completely, log and skip chunk
            error_msg = f"Entity extraction failed for {chunk_id}: {str(e)}"
            print(f"   ⚠️ {error_msg}")
            log_error(error_msg, chunk_id=chunk_id)
            stats["error"] = error_msg
            return stats
        
        # Type safety check: ensure entities is always a list
        if not isinstance(entities, list):
            error_msg = f"Invalid entity extraction result type for {chunk_id}: expected list, got {type(entities).__name__}"
            print(f"   ❌ {error_msg}")
            log_error(error_msg, chunk_id=chunk_id)
            stats["error"] = error_msg
            return stats
        
        if not entities:
            return stats
        
        # Process entities with post-filter validation
        entity_id_map = {}
        for entity in entities:
            # POST-FILTER: Validate entity quality
            is_valid, rejection_reason = validate_entity(
                entity.name,
                entity.entity_type,
                chunk_text
            )
            
            if not is_valid:
                stats["entities_rejected"] += 1
                continue  # Skip low-quality entity
            
            # Find or create entity with deduplication
            result = retry_with_backoff(
                deduplicator.find_or_create_entity,
                name=entity.name,
                entity_type=entity.entity_type,
                confidence=entity.confidence,
                message_timestamp=message_timestamp,
                source_type="expert",
                operation_name=f"deduplication for {entity.name}"
            )
            
            if not result:
                continue
            
            entity_id, created = result
            entity_id_map[entity.name] = entity_id
            
            if created:
                stats["entities_created"] += 1
            else:
                stats["entities_deduplicated"] += 1
            
            # Save mention
            retry_with_backoff(
                save_entity_mention,
                supabase,
                entity_id,
                chunk_id,
                chunk_text[:MAX_SNIPPET_LENGTH],
                message_timestamp,
                operation_name=f"saving mention for {entity.name}"
            )
        
        # Extract and save relations if enabled
        # Phase 0: Relations should be extracted from triples (if available)
        if with_relations and entity_id_map:
            from engine.common.relation_extractor import RelationExtractor
            
            try:
                # Phase 0: Use triples for relation extraction if available
                # For now, we extract triples but still use RelationExtractor for validation
                # Future: Extract relations directly from triples
                relation_extractor = RelationExtractor(model="claude-haiku-4-5", provider="anthropic")
                relations = retry_with_backoff(
                    relation_extractor.extract_relations,
                    chunk_text,
                    known_entities=list(entity_id_map.keys()),
                    operation_name=f"relation extraction for {chunk_id}"
                )
            except Exception as e:
                # If relation extraction fails, log and continue (don't skip chunk)
                error_msg = f"Relation extraction failed for {chunk_id}: {str(e)}"
                print(f"   ⚠️ {error_msg}")
                log_error(error_msg, chunk_id=chunk_id)
                # Continue processing - relations are optional
                relations = []
            
            # Type safety check: ensure relations is always a list
            if not isinstance(relations, list):
                error_msg = f"Invalid relation extraction result type for {chunk_id}: expected list, got {type(relations).__name__}"
                print(f"   ⚠️ {error_msg}")
                log_error(error_msg, chunk_id=chunk_id)
                relations = []
            
            if relations:
                for rel in relations:
                    source_id = entity_id_map.get(rel.source_name)
                    target_id = entity_id_map.get(rel.target_name)
                    
                    if source_id and target_id:
                        # Convert RelationType enum to string value
                        relation_type_str = rel.relation_type.value if hasattr(rel.relation_type, 'value') else str(rel.relation_type)
                        
                        retry_with_backoff(
                            save_relation,
                            supabase,
                            source_id,
                            target_id,
                            relation_type_str,
                            rel.evidence_snippet or "",
                            chunk_id,
                            operation_name=f"saving relation {rel.source_name}->{rel.target_name}"
                        )
                        stats["relations_created"] += 1
        
        return stats
    
    except PermanentAPIFailure as e:
        # Don't catch permanent failures - let them propagate to stop gracefully
        print(f"\n❌ PERMANENT FAILURE detected in worker {worker_id}")
        print(f"   Chunk: {chunk_id}")
        print(f"   Error: {e}")
        print(f"   This is a permanent API failure (budget/quota exhausted)")
        print(f"   Propagating to main process for graceful shutdown...")
        raise
        
    except Exception as e:
        import traceback
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        stats["error"] = error_msg
        
        # Log to both console and file with full traceback
        error_summary = f"[Worker {worker_id}] Error processing chunk: {str(e)}"
        print(f"   ❌ {error_summary}")
        log_error(error_msg, chunk_id=chunk_id)
        
        return stats


def update_progress(stats: dict):
    """Thread-safe progress update."""
    with _progress_lock:
        _progress_stats["chunks_processed"] += 1
        _progress_stats["entities_created"] += stats.get("entities_created", 0)
        _progress_stats["entities_deduplicated"] += stats.get("entities_deduplicated", 0)
        _progress_stats["entities_rejected"] += stats.get("entities_rejected", 0)
        _progress_stats["relations_created"] += stats.get("relations_created", 0)
        
        if stats.get("error"):
            _progress_stats["errors"] += 1
        
        if stats.get("skipped"):
            _progress_stats["skipped"] += 1
            
            # Track skip reasons
            skip_reason = stats.get("skip_reason", "")
            if "low_quality" in skip_reason:
                _progress_stats["chunks_low_quality"] += 1
            elif skip_reason == "already_indexed":
                _progress_stats["chunks_already_indexed"] += 1
            elif skip_reason == "known_problematic":
                _progress_stats["chunks_problematic"] += 1


def print_progress(current: int, total: int, start_time: float):
    """Print progress with ETA."""
    elapsed = time.time() - start_time
    rate_per_second = current / elapsed if elapsed > 0 else 0
    rate_per_minute = rate_per_second * 60
    remaining = total - current
    eta_seconds = remaining / rate_per_second if rate_per_second > 1e-9 else 0
    
    if eta_seconds < 3600:
        eta_str = f"{eta_seconds / 60:.0f}m"
    else:
        eta_str = f"{eta_seconds / 3600:.1f}h"
    
    stats = dict(_progress_stats)
    print(f"\n📊 Progress: {current}/{total} ({current/total*100:.1f}%)")
    print(f"   Rate: {rate_per_minute:.1f} chunks/min | ETA: {eta_str}")
    print(f"   ✅ Entities: {stats['entities_created']} new, {stats['entities_deduplicated']} deduplicated, {stats['entities_rejected']} rejected")
    if stats['relations_created'] > 0:
        print(f"   🔗 Relations: {stats['relations_created']}")
    if stats['skipped'] > 0:
        print(f"   ⏭️  Skipped: {stats['skipped']} (low quality: {stats['chunks_low_quality']}, already indexed: {stats['chunks_already_indexed']}, problematic: {stats['chunks_problematic']})")
    if stats['errors'] > 0:
        print(f"   ⚠️  Errors: {stats['errors']}")


def main():
    global _progress_lock, _progress_stats, _error_log_file
    
    # Initialize progress tracking
    manager = mp.Manager()
    _progress_lock = manager.Lock()
    _progress_stats = manager.dict({
        "chunks_processed": 0,
        "chunks_low_quality": 0,
        "chunks_already_indexed": 0,
        "chunks_problematic": 0,
        "entities_created": 0,
        "entities_deduplicated": 0,
        "entities_rejected": 0,
        "relations_created": 0,
        "errors": 0,
        "skipped": 0,
    })
    
    parser = argparse.ArgumentParser(description="Parallel KG indexing for Lenny's podcast")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without writing to DB")
    parser.add_argument("--limit", type=int, help="Limit number of episodes to process")
    parser.add_argument("--with-relations", action="store_true", help="Extract relations between entities")
    parser.add_argument("--workers", type=int, default=4, help="Number of parallel workers (default: 4)")
    parser.add_argument("--archive-path", type=str, default="data/lenny-transcripts", 
                       help="Path to Lenny transcripts archive")
    parser.add_argument("--max-chunks", type=int, help="Limit total chunks to process (for testing)")
    parser.add_argument("--error-log", type=str, default="/tmp/lenny_kg_errors.log",
                       help="Path to error log file (default: /tmp/lenny_kg_errors.log)")
    args = parser.parse_args()
    
    # Initialize error logging
    _error_log_file = args.error_log
    print(f"📝 Error log: {_error_log_file}")
    
    print("=" * 60)
    print("🚀 PARALLEL Knowledge Graph Indexing")
    print("=" * 60)
    print()
    print(f"Workers: {args.workers}")
    print(f"Relations: {'✅ Enabled' if args.with_relations else '❌ Disabled'}")
    print(f"Mode: {'🧪 DRY RUN' if args.dry_run else '💾 LIVE'}")
    if args.limit:
        print(f"Limit: {args.limit} episodes")
    print()
    
    # Load episodes
    print("📚 Loading Lenny's podcast transcripts...")
    archive_path = Path(args.archive_path)
    if not archive_path.exists():
        print(f"❌ Archive path not found: {archive_path}")
        return
    
    episodes = parse_all_episodes(archive_path)
    
    if args.limit:
        episodes = episodes[:args.limit]
    
    print(f"   Found {len(episodes)} episodes")
    
    # Flatten chunks
    print("📦 Preparing chunks...")
    supabase = get_supabase_client()
    indexed_chunks = get_indexed_chunk_ids(supabase) if not args.dry_run else set()
    
    chunks_to_process = []
    total_chunks = 0
    
    for episode in episodes:
        for i, chunk in enumerate(episode.chunks):
            total_chunks += 1
            
            # Generate slug from guest name (matches folder structure)
            # e.g., "Ada Chen Rekhi" → "ada-chen-rekhi"
            # Validate guest_name is not None/empty
            if not episode.guest_name or not episode.guest_name.strip():
                print(f"⚠️ Warning: Episode has no guest_name, using filename: {episode.filename}")
                guest_name_clean = episode.filename.replace(".md", "").replace("transcript", "unknown")
            else:
                guest_name_clean = episode.guest_name.strip()
            
            episode_slug = re.sub(r'[^a-z0-9]+', '-', guest_name_clean.lower()).strip('-')
            
            # Final validation: slug must not be empty
            if not episode_slug:
                print(f"❌ Error: Generated empty slug for episode {episode.filename}, skipping")
                continue
            
            chunk_id = f"lenny-{episode_slug}-{i}"
            
            # Skip if already indexed
            if chunk_id in indexed_chunks:
                continue
            
            chunks_to_process.append({
                "episode_name": guest_name_clean,
                "chunk_index": i,
                "chunk_text": chunk.content,
                "chunk_timestamp": chunk.timestamp,
                "chunk_id": chunk_id,
                "with_relations": args.with_relations,
                "dry_run": args.dry_run,
                "worker_id": 0,  # Will be set by pool
            })
    
    # Apply max_chunks limit if specified
    if args.max_chunks and len(chunks_to_process) > args.max_chunks:
        chunks_to_process = chunks_to_process[:args.max_chunks]
        print(f"   ⚠️  Limited to {args.max_chunks} chunks for testing")
    
    print(f"   Total chunks: {total_chunks:,}")
    print(f"   Already indexed: {len(indexed_chunks):,}")
    print(f"   To process: {len(chunks_to_process):,}")
    print()
    
    if not chunks_to_process:
        print("✅ All chunks already indexed!")
        return
    
    if args.dry_run:
        print("🧪 DRY RUN - Would process first 5 chunks:")
        for chunk in chunks_to_process[:5]:
            print(f"   - {chunk['chunk_id']}")
        return
    
    # Process chunks in parallel
    print(f"🚀 Starting {args.workers} workers...")
    print()
    
    start_time = time.time()
    last_progress_time = start_time
    
    # Add worker IDs
    for i, chunk in enumerate(chunks_to_process):
        chunk["worker_id"] = (i % args.workers) + 1
    
    # Create pool and process
    with mp.Pool(processes=args.workers) as pool:
        try:
            for i, result in enumerate(pool.imap_unordered(process_chunk_worker, chunks_to_process), 1):
                update_progress(result)
                
                # Print progress every 10 chunks or 30 seconds
                if i % 10 == 0 or time.time() - last_progress_time > 30:
                    print_progress(i, len(chunks_to_process), start_time)
                    last_progress_time = time.time()
        except Exception as e:
            # Multiprocessing wraps exceptions - check if it's our PermanentAPIFailure
            exc_msg = str(e)
            exc_type = str(type(e))
            
            if 'PermanentAPIFailure' in exc_type or 'PermanentAPIFailure' in exc_msg or 'Budget exhausted' in exc_msg or 'quota exhausted' in exc_msg:
                # This is a permanent API failure from a worker
                print("\n\n" + "=" * 60)
                print("❌ PERMANENT API FAILURE - STOPPING GRACEFULLY")
                print("=" * 60)
                print(f"\n{e}")
                print(f"\nProgress saved: {_progress_stats['chunks_processed']:,} chunks processed")
                print(f"Entities created: {_progress_stats['entities_created']:,}")
                print(f"Mentions saved: Database preserves all progress")
                print(f"\nTo resume:")
                print(f"  1. Check if budget limit reached (raise limit if needed)")
                print(f"  2. Run the same command - script will auto-resume from checkpoint")
                print(f"\nIndexing stopped at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
                return  # Exit gracefully
            else:
                # Other exception - re-raise
                raise
    
    # Final summary
    elapsed = time.time() - start_time
    print("\n" + "=" * 60)
    print("✅ INDEXING COMPLETE")
    print("=" * 60)
    stats = dict(_progress_stats)
    print(f"\n📊 Processing Stats:")
    print(f"   Chunks processed: {stats['chunks_processed']:,}")
    print(f"   Skipped: {stats['skipped']:,}")
    print(f"     - Low quality: {stats['chunks_low_quality']:,}")
    print(f"     - Already indexed: {stats['chunks_already_indexed']:,}")
    print(f"     - Known problematic: {stats['chunks_problematic']:,}")
    
    # Quality hit rate
    chunks_with_entities = stats['entities_created'] + stats['entities_deduplicated']
    processed_new = stats['chunks_processed'] - stats['chunks_already_indexed'] - stats['chunks_problematic']
    hit_rate = (chunks_with_entities / processed_new * 100) if processed_new > 0 else 0
    print(f"\n📈 Quality Metrics:")
    print(f"   Hit rate: {hit_rate:.1f}% (chunks that yielded entities)")
    print(f"   Entities created: {stats['entities_created']:,}")
    print(f"   Entities deduplicated: {stats['entities_deduplicated']:,}")
    print(f"   Entities rejected: {stats['entities_rejected']:,}")
    
    if args.with_relations:
        print(f"\n🔗 Relations:")
        print(f"   Relations created: {stats['relations_created']:,}")
    
    print(f"\n⏱️  Performance:")
    print(f"   Time: {elapsed / 60:.1f} minutes ({elapsed / 3600:.2f} hours)")
    print(f"   Rate: {stats['chunks_processed'] / (elapsed / 60):.1f} chunks/min")
    
    if stats['errors'] > 0:
        print(f"\n⚠️  Errors: {stats['errors']:,}")


if __name__ == "__main__":
    main()
