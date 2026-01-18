#!/usr/bin/env python3
"""
Unified Knowledge Graph Indexing Script

Indexes ANY content source (user chat history, Lenny's podcast, future sources)
with quality filtering, parallel processing, and comprehensive monitoring.

Features:
- Quality pre-filtering (only index high-signal chunks)
- Post-extraction validation (filter low-quality entities)
- Parallel processing (4 workers)
- Resumable (tracks indexed chunks)
- Retry logic with exponential backoff
- Cost estimation upfront
- Quality metrics reporting

Usage:
    # Index user's chat history
    python3 index_kg_unified.py --source user --with-relations --workers 4
    
    # Index Lenny's podcast
    python3 index_kg_unified.py --source lenny --with-relations --workers 4
    
    # Dry run with cost estimate
    python3 index_kg_unified.py --source user --dry-run --estimate-only
"""

import argparse
import multiprocessing as mp
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import List, Set

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.cursor_db import get_cursor_db_path, get_high_signal_conversations_sqlite_fast
from common.entity_deduplicator import create_deduplicator
from common.entity_extractor import extract_entities
from common.kg_quality_filter import (
    score_chunk_quality,
    validate_entity,
    estimate_indexing_cost,
    analyze_quality_metrics
)
from common.lenny_parser import parse_all_episodes
from common.relation_extractor import extract_relations
from common.vector_db import get_supabase_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
LLM_MODEL = "claude-haiku-4-5"
LLM_PROVIDER = "anthropic"
MAX_RETRIES = 3
INITIAL_RETRY_DELAY = 2  # seconds
MAX_RETRY_DELAY = 60  # seconds


@dataclass
class ChunkToProcess:
    """A chunk of content to be indexed."""
    chunk_id: str
    chunk_text: str
    chunk_index: int
    source_name: str  # Episode name or conversation title
    source_type: str  # "user" or "expert"
    timestamp: int = 0
    quality_score: float = 0.0


def get_indexed_chunk_ids(supabase, source_type: str) -> Set[str]:
    """Get set of chunk IDs that already have entity mentions."""
    all_chunk_ids = set()
    page_size = 1000
    offset = 0
    
    # Filter pattern based on source type
    pattern = "lenny-%" if source_type == "expert" else "%"
    # But exclude lenny- for user source
    exclude_pattern = "lenny-%" if source_type == "user" else None
    
    while True:
        try:
            query = supabase.table("kg_entity_mentions").select("message_id")
            
            if source_type == "expert":
                query = query.like("message_id", pattern)
            elif source_type == "user":
                # Get all that DON'T start with lenny-
                query = query.not_.like("message_id", "lenny-%")
            
            result = query.range(offset, offset + page_size - 1).execute()
            
            if not result.data:
                break
                
            for row in result.data:
                all_chunk_ids.add(row["message_id"])
            
            if len(result.data) < page_size:
                break
                
            offset += page_size
        except Exception as e:
            print(f"⚠️ Error fetching indexed chunks at offset {offset}: {e}")
            break
    
    return all_chunk_ids


def load_user_chat_chunks(min_quality_score: float = 0.35) -> List[ChunkToProcess]:
    """Load chunks from user's Cursor chat history."""
    print("📚 Loading user chat history...")
    
    db_path = get_cursor_db_path()
    if not db_path:
        print("❌ Could not find Cursor database")
        return []
    
    # Get all conversations (no date filter - index everything)
    # Use large days_back value to get all conversations
    conversations = get_high_signal_conversations_sqlite_fast(
        days_back=10000,  # Large value to get all history
        max_conversations=100000,  # No limit
        db_path=db_path
    )
    print(f"   Found {len(conversations)} conversations")
    
    chunks = []
    filtered_out = 0
    
    for conv in conversations:
        # Each conversation message is a "chunk"
        for i, message in enumerate(conv.get("messages", [])):
            content = message.get("text", "")
            if not content or len(content.strip()) < 50:
                continue
            
            # Quality filter
            quality = score_chunk_quality(content, content_type="chat")
            
            if quality.should_index:
                chunk_id = f"user-chat-{conv['chat_id']}-{i}"
                chunks.append(ChunkToProcess(
                    chunk_id=chunk_id,
                    chunk_text=content,
                    chunk_index=i,
                    source_name=f"{conv.get('workspace', 'unknown')} - {conv.get('chat_type', 'chat')}",
                    source_type="user",
                    timestamp=message.get("timestamp", 0),
                    quality_score=quality.score
                ))
            else:
                filtered_out += 1
    
    print(f"   ✅ {len(chunks)} high-quality chunks")
    print(f"   ⏭️  {filtered_out} filtered out (low signal)")
    print(f"   📊 Pass rate: {len(chunks) / (len(chunks) + filtered_out) * 100:.1f}%")
    
    return chunks


def load_lenny_chunks(archive_path: Path, min_quality_score: float = 0.35) -> List[ChunkToProcess]:
    """Load chunks from Lenny's podcast transcripts."""
    print("📚 Loading Lenny's podcast transcripts...")
    
    if not archive_path.exists():
        print(f"❌ Archive path not found: {archive_path}")
        return []
    
    episodes = parse_all_episodes(archive_path)
    print(f"   Found {len(episodes)} episodes")
    
    chunks = []
    filtered_out = 0
    
    for episode in episodes:
        for i, chunk in enumerate(episode.chunks):
            # Quality filter
            quality = score_chunk_quality(chunk.content, content_type="podcast")
            
            if quality.should_index:
                chunk_id = f"lenny-{episode.filename}-{i}"
                chunks.append(ChunkToProcess(
                    chunk_id=chunk_id,
                    chunk_text=chunk.content,
                    chunk_index=i,
                    source_name=episode.guest_name,
                    source_type="expert",
                    timestamp=0,  # Lenny chunks don't have timestamps
                    quality_score=quality.score
                ))
            else:
                filtered_out += 1
    
    print(f"   ✅ {len(chunks)} high-quality chunks")
    print(f"   ⏭️  {filtered_out} filtered out (low signal)")
    print(f"   📊 Pass rate: {len(chunks) / (len(chunks) + filtered_out) * 100:.1f}%")
    
    return chunks


def retry_with_backoff(func, *args, max_retries=MAX_RETRIES, operation_name="operation", **kwargs):
    """Execute function with exponential backoff retry logic."""
    delay = INITIAL_RETRY_DELAY
    
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            error_msg = str(e).lower()
            
            # Rate limit or timeout - retry
            if "rate" in error_msg or "429" in error_msg or "timeout" in error_msg:
                if attempt < max_retries - 1:
                    wait_time = min(delay * (2 ** attempt), MAX_RETRY_DELAY)
                    print(f"   ⏳ Rate limit/timeout on {operation_name}, retrying in {wait_time}s...")
                    time.sleep(wait_time)
                    continue
            
            # Other error - log and re-raise
            print(f"   ❌ Error in {operation_name}: {e}")
            raise
    
    raise Exception(f"Max retries ({max_retries}) exceeded for {operation_name}")


def save_entity_mention(supabase, entity_id: str, message_id: str, context: str, timestamp: int):
    """Save entity mention to database."""
    supabase.table("kg_entity_mentions").insert({
        "entity_id": entity_id,
        "message_id": message_id,
        "context_snippet": context[:500],  # Limit to 500 chars
        "message_timestamp": timestamp,
        "mention_start": 0,
        "mention_end": 0
    }).execute()


def save_relation(supabase, source_id: str, target_id: str, relation_type: str,
                 evidence: str, message_id: str, timestamp: int, confidence: float):
    """Save relation to database."""
    supabase.table("kg_relations").insert({
        "source_entity_id": source_id,
        "target_entity_id": target_id,
        "relation_type": relation_type,
        "evidence_snippet": evidence[:1000],
        "message_id": message_id,
        "message_timestamp": timestamp,
        "confidence": confidence,
        "occurrence_count": 1
    }).execute()


def process_chunk(chunk: ChunkToProcess, with_relations: bool, worker_id: int) -> dict:
    """
    Process a single chunk: extract entities and optionally relations.
    
    Returns stats dict with counts.
    """
    from common.entity_deduplicator import create_deduplicator
    from common.entity_extractor import extract_entities
    from common.relation_extractor import extract_relations
    from common.vector_db import get_supabase_client
    
    stats = {
        "chunk_id": chunk.chunk_id,
        "entities_created": 0,
        "entities_deduplicated": 0,
        "entities_filtered": 0,
        "relations_created": 0,
        "skipped": False,
        "error": None
    }
    
    try:
        supabase = get_supabase_client()
        deduplicator = create_deduplicator()
        
        # Extract entities with retry
        entities = retry_with_backoff(
            extract_entities,
            chunk.chunk_text,
            model=LLM_MODEL,
            provider=LLM_PROVIDER,
            operation_name=f"entity extraction ({chunk.chunk_id})"
        )
        
        if not entities:
            stats["skipped"] = True
            return stats
        
        entity_map = {}  # name -> id mapping for relations
        
        for entity in entities:
            # Validate entity quality
            is_valid, rejection_reason = validate_entity(
                entity.name,
                entity.type,
                chunk.chunk_text
            )
            
            if not is_valid:
                stats["entities_filtered"] += 1
                continue
            
            # Find or create entity with deduplication
            result = retry_with_backoff(
                deduplicator.find_or_create_entity,
                name=entity.name,
                entity_type=entity.type,
                source_type=chunk.source_type,
                operation_name=f"entity dedup ({entity.name})"
            )
            
            entity_id = result["entity_id"]
            was_created = result["was_created"]
            
            if was_created:
                stats["entities_created"] += 1
            else:
                stats["entities_deduplicated"] += 1
            
            # Save mention
            retry_with_backoff(
                save_entity_mention,
                supabase,
                entity_id,
                chunk.chunk_id,
                chunk.chunk_text,
                chunk.timestamp,
                operation_name=f"save mention ({entity.name})"
            )
            
            entity_map[entity.name.lower()] = entity_id
        
        # Extract relations if requested
        if with_relations and len(entity_map) >= 2:
            entity_list = [{"name": name, "type": ""} for name in entity_map.keys()]
            
            relations = retry_with_backoff(
                extract_relations,
                chunk.chunk_text,
                entity_list,
                model=LLM_MODEL,
                provider=LLM_PROVIDER,
                operation_name=f"relation extraction ({chunk.chunk_id})"
            )
            
            for rel in relations:
                source_id = entity_map.get(rel.source_name.lower())
                target_id = entity_map.get(rel.target_name.lower())
                
                if source_id and target_id:
                    retry_with_backoff(
                        save_relation,
                        supabase,
                        source_id,
                        target_id,
                        rel.relation_type,
                        rel.evidence_snippet,
                        chunk.chunk_id,
                        chunk.timestamp,
                        rel.confidence,
                        operation_name=f"save relation ({rel.source_name}->{rel.target_name})"
                    )
                    stats["relations_created"] += 1
    
    except Exception as e:
        stats["error"] = str(e)
        print(f"❌ Worker {worker_id}: Error processing {chunk.chunk_id}: {e}")
    
    return stats


def main():
    parser = argparse.ArgumentParser(description="Unified KG indexing with quality filtering")
    parser.add_argument("--source", choices=["user", "lenny"], required=True,
                       help="Content source to index")
    parser.add_argument("--dry-run", action="store_true",
                       help="Simulate without writing to DB")
    parser.add_argument("--estimate-only", action="store_true",
                       help="Show cost estimate and exit")
    parser.add_argument("--workers", type=int, default=4,
                       help="Number of parallel workers")
    parser.add_argument("--with-relations", action="store_true",
                       help="Extract relations in addition to entities")
    parser.add_argument("--archive-path", type=str, default="data/lenny-transcripts",
                       help="Path to Lenny transcripts (for source=lenny)")
    parser.add_argument("--min-quality", type=float, default=0.35,
                       help="Minimum quality score (0-1) for chunk to be indexed")
    parser.add_argument("--max-chunks", type=int, help="Limit chunks for testing")
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("🚀 Quality-Driven Knowledge Graph Indexing")
    print("=" * 60)
    print()
    print(f"Source: {args.source}")
    print(f"Workers: {args.workers}")
    print(f"Relations: {'✅ Enabled' if args.with_relations else '❌ Disabled'}")
    print(f"Quality threshold: {args.min_quality}")
    print(f"Mode: {'🧪 DRY RUN' if args.dry_run else '💾 LIVE'}")
    if args.estimate_only:
        print(f"Mode: 📊 ESTIMATE ONLY")
    print()
    
    # Load chunks based on source
    if args.source == "user":
        chunks = load_user_chat_chunks(min_quality_score=args.min_quality)
    else:  # lenny
        archive_path = Path(args.archive_path)
        chunks = load_lenny_chunks(archive_path, min_quality_score=args.min_quality)
    
    if not chunks:
        print("❌ No chunks to process")
        return
    
    # Get already indexed chunks
    if not args.dry_run:
        supabase = get_supabase_client()
        indexed_chunks = get_indexed_chunk_ids(supabase, args.source)
        
        # Filter out already indexed
        chunks_to_process = [c for c in chunks if c.chunk_id not in indexed_chunks]
        
        print(f"📦 Chunk Status:")
        print(f"   Total high-quality: {len(chunks):,}")
        print(f"   Already indexed: {len(indexed_chunks):,}")
        print(f"   To process: {len(chunks_to_process):,}")
        print()
    else:
        chunks_to_process = chunks
    
    # Apply max_chunks limit if specified
    if args.max_chunks and len(chunks_to_process) > args.max_chunks:
        chunks_to_process = chunks_to_process[:args.max_chunks]
        print(f"   ⚠️  Limited to {args.max_chunks} chunks for testing")
        print()
    
    if not chunks_to_process:
        print("✅ All high-quality chunks already indexed!")
        return
    
    # Cost estimation
    cost_estimate = estimate_indexing_cost(
        total_chunks=len(chunks_to_process),
        model=LLM_MODEL,
        with_relations=args.with_relations
    )
    
    print("💰 Cost Estimate:")
    print(f"   Model: {cost_estimate['model']}")
    print(f"   Chunks to process: {cost_estimate['total_chunks']:,}")
    print(f"   Estimated cost: ${cost_estimate['total_cost_usd']:.2f}")
    print(f"   Cost per chunk: ${cost_estimate['cost_per_chunk']:.4f}")
    print(f"   Estimated time: {cost_estimate['estimated_time_hours']:.1f} hours ({cost_estimate['estimated_time_minutes']:.0f} min)")
    print()
    
    if args.estimate_only:
        print("📊 Estimate complete. Exiting.")
        return
    
    if not args.dry_run:
        response = input(f"💰 This will cost ~${cost_estimate['total_cost_usd']:.2f}. Continue? [y/N]: ")
        if response.lower() != 'y':
            print("❌ Cancelled by user")
            return
        print()
    
    if args.dry_run:
        print("🧪 DRY RUN - Would process first 5 chunks:")
        for chunk in chunks_to_process[:5]:
            print(f"   - {chunk.chunk_id} (quality: {chunk.quality_score:.2f})")
        return
    
    # Process chunks in parallel
    print(f"🚀 Starting {args.workers} workers...")
    print()
    
    start_time = time.time()
    processed_count = 0
    stats_aggregate = {
        "entities_created": 0,
        "entities_deduplicated": 0,
        "entities_filtered": 0,
        "relations_created": 0,
        "errors": 0
    }
    
    # Progress tracking
    progress_interval = max(10, len(chunks_to_process) // 20)  # Update every 5%
    
    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(process_chunk, chunk, args.with_relations, i % args.workers): chunk
            for i, chunk in enumerate(chunks_to_process)
        }
        
        for future in as_completed(futures):
            processed_count += 1
            stats = future.result()
            
            # Aggregate stats
            stats_aggregate["entities_created"] += stats["entities_created"]
            stats_aggregate["entities_deduplicated"] += stats["entities_deduplicated"]
            stats_aggregate["entities_filtered"] += stats["entities_filtered"]
            stats_aggregate["relations_created"] += stats["relations_created"]
            if stats["error"]:
                stats_aggregate["errors"] += 1
            
            # Progress update
            if processed_count % progress_interval == 0 or processed_count == len(chunks_to_process):
                elapsed = time.time() - start_time
                rate = processed_count / (elapsed / 60) if elapsed > 0 else 0
                eta_min = (len(chunks_to_process) - processed_count) / rate if rate > 0 else 0
                pct = (processed_count / len(chunks_to_process)) * 100
                
                print(f"📊 Progress: {processed_count}/{len(chunks_to_process)} ({pct:.1f}%)")
                print(f"   Rate: {rate:.1f} chunks/min | ETA: {eta_min:.0f}m")
                print(f"   ✅ Entities: {stats_aggregate['entities_created']} new, {stats_aggregate['entities_deduplicated']} deduplicated")
                if args.with_relations:
                    print(f"   🔗 Relations: {stats_aggregate['relations_created']}")
                if stats_aggregate['entities_filtered'] > 0:
                    print(f"   ⏭️  Filtered: {stats_aggregate['entities_filtered']} low-quality entities")
                if stats_aggregate['errors'] > 0:
                    print(f"   ⚠️  Errors: {stats_aggregate['errors']}")
                print()
    
    # Final summary
    elapsed = time.time() - start_time
    
    print("=" * 60)
    print("✅ INDEXING COMPLETE")
    print("=" * 60)
    print(f"Chunks processed: {processed_count:,}")
    print(f"Entities created: {stats_aggregate['entities_created']:,}")
    print(f"Entities deduplicated: {stats_aggregate['entities_deduplicated']:,}")
    print(f"Entities filtered (low quality): {stats_aggregate['entities_filtered']:,}")
    if args.with_relations:
        print(f"Relations created: {stats_aggregate['relations_created']:,}")
    print(f"Errors: {stats_aggregate['errors']}")
    print(f"Time: {elapsed / 60:.1f} minutes")
    print(f"Rate: {processed_count / (elapsed / 60):.1f} chunks/min")
    print()
    
    # Quality metrics
    total_entities = stats_aggregate['entities_created'] + stats_aggregate['entities_deduplicated']
    if total_entities > 0:
        filter_rate = stats_aggregate['entities_filtered'] / (total_entities + stats_aggregate['entities_filtered']) * 100
        dedup_rate = stats_aggregate['entities_deduplicated'] / total_entities * 100
        
        print("📊 Quality Metrics:")
        print(f"   Hit rate: {(processed_count - stats.get('skipped', 0)) / processed_count * 100:.1f}% chunks yielded entities")
        print(f"   Filter rate: {filter_rate:.1f}% entities filtered as low-quality")
        print(f"   Dedup rate: {dedup_rate:.1f}% entities deduplicated")
        print()


if __name__ == "__main__":
    # Multiprocessing safety
    mp.set_start_method('spawn', force=True)
    main()
