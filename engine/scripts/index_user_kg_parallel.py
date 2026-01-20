#!/usr/bin/env python3
"""
Parallel Knowledge Graph Indexing for User Chat History.

Phase 1b: User's Chat KG — Indexes user's Cursor + Claude Code chat history
with temporal/decision tracking.

Usage:
    # Dry run
    python3 engine/scripts/index_user_kg_parallel.py --dry-run --limit 10
    
    # Full index with 4 workers (default)
    python3 engine/scripts/index_user_kg_parallel.py --with-relations --with-decisions
    
    # Custom worker count
    python3 engine/scripts/index_user_kg_parallel.py --with-relations --workers 6
"""

import argparse
import multiprocessing as mp
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone, date
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
from engine.common.cursor_db import get_high_signal_conversations_sqlite_fast, get_cursor_db_path
from engine.common.claude_code_db import get_claude_code_conversations, get_claude_code_projects_path
from datetime import date
from engine.common.kg_quality_filter import score_chunk_quality, validate_entity
from engine.common.llm import PermanentAPIFailure
from engine.common.triple_extractor import extract_triples, triples_to_entities
from engine.common.temporal_tracker import build_temporal_chains, TemporalChain
from engine.common.decision_extractor import extract_decisions, extract_trace_ids
from engine.common.relation_extractor import RelationExtractor

# Retry configuration
MAX_RETRIES = 3
INITIAL_RETRY_DELAY_SECONDS = 2
MAX_RETRY_DELAY = 60

# Quality and snippet configuration
MAX_SNIPPET_LENGTH = 500
QUALITY_THRESHOLD = 0.35

# Progress tracking (will be initialized in main)
_progress_lock = None
_progress_stats = None
_error_log_file = None


def retry_with_backoff(func, *args, operation_name="operation", **kwargs):
    """Retry function with exponential backoff."""
    import random
    
    for attempt in range(MAX_RETRIES):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                raise
            
            delay = min(
                INITIAL_RETRY_DELAY_SECONDS * (2 ** attempt) + random.uniform(0, 1),
                MAX_RETRY_DELAY
            )
            print(f"   ⚠️ {operation_name} failed (attempt {attempt + 1}/{MAX_RETRIES}), retrying in {delay:.1f}s...")
            time.sleep(delay)
    
    raise RuntimeError(f"{operation_name} failed after {MAX_RETRIES} attempts")


def log_error(error_msg: str, chat_id: str = ""):
    """Log error to file."""
    if _error_log_file:
        timestamp = datetime.now().isoformat()
        _error_log_file.write(f"[{timestamp}] {chat_id}: {error_msg}\n")
        _error_log_file.flush()


def save_entity_mention(supabase, entity_id: str, chat_id: str, context_snippet: str, message_timestamp: int):
    """Save entity mention to database."""
    mention_data = {
        "id": str(uuid.uuid4()),
        "entity_id": entity_id,
        "message_id": chat_id,
        "context_snippet": context_snippet[:MAX_SNIPPET_LENGTH],
        "message_timestamp": message_timestamp,
    }
    
    try:
        supabase.table("kg_entity_mentions").insert(mention_data).execute()
    except Exception as e:
        error_msg = str(e).lower()
        if "duplicate" in error_msg or "unique" in error_msg or "constraint" in error_msg:
            pass  # Expected race condition
        else:
            raise


def save_relation(supabase, source_entity_id: str, target_entity_id: str, relation_type: str, evidence_snippet: str, chat_id: str):
    """Save relation to database."""
    relation_data = {
        "id": str(uuid.uuid4()),
        "source_entity_id": source_entity_id,
        "target_entity_id": target_entity_id,
        "relation_type": relation_type,
        "evidence_snippet": evidence_snippet[:MAX_SNIPPET_LENGTH],
        "source_message_id": chat_id,
    }
    supabase.table("kg_relations").insert(relation_data).execute()


def get_or_create_conversation_entity(supabase, deduplicator, chat_id: str, timestamp: int) -> str:
    """
    Get or create a conversation entity for temporal chain tracking.
    
    Args:
        supabase: Supabase client
        deduplicator: EntityDeduplicator instance
        chat_id: Chat/conversation ID
        timestamp: Message timestamp (Unix milliseconds)
        
    Returns:
        Entity ID for the conversation
        
    Raises:
        Exception: If entity creation fails
    """
    from engine.common.knowledge_graph import EntityType
    
    if not chat_id or not timestamp:
        raise ValueError(f"Invalid chat_id or timestamp: chat_id={chat_id}, timestamp={timestamp}")
    
    # Use chat_id as the entity name (e.g., "user-8e7d8fd0-...")
    # Type: "project" (represents a conversation/project context)
    try:
        entity_id, is_new = deduplicator.find_or_create_entity(
            name=chat_id,
            entity_type=EntityType.PROJECT,
            confidence=1.0,
            message_timestamp=timestamp,
            source_type="user",
        )
        return entity_id
    except Exception as e:
        raise RuntimeError(f"Failed to get/create conversation entity for {chat_id}: {e}") from e


def save_temporal_chain(supabase, deduplicator, chain, source_timestamp: int, target_timestamp: int):
    """
    Save temporal chain as a relation between conversation entities.
    
    Args:
        supabase: Supabase client
        deduplicator: EntityDeduplicator instance
        chain: TemporalChain object
        source_timestamp: Timestamp of source chat
        target_timestamp: Timestamp of target chat
        
    Raises:
        Exception: If saving fails (duplicate constraints are handled silently)
    """
    if not chain or not chain.source_chat_id or not chain.target_chat_id:
        raise ValueError(f"Invalid temporal chain: {chain}")
    
    # Get or create conversation entities
    source_entity_id = get_or_create_conversation_entity(
        supabase, deduplicator, chain.source_chat_id, source_timestamp
    )
    target_entity_id = get_or_create_conversation_entity(
        supabase, deduplicator, chain.target_chat_id, target_timestamp
    )
    
    if not source_entity_id or not target_entity_id:
        raise ValueError(f"Failed to get entity IDs: source={source_entity_id}, target={target_entity_id}")
    
    # Save as relation
    relation_data = {
        "id": str(uuid.uuid4()),
        "source_entity_id": source_entity_id,
        "target_entity_id": target_entity_id,
        "relation_type": chain.relationship_type,
        "evidence_snippet": (chain.evidence_snippet or "")[:MAX_SNIPPET_LENGTH],
        "source_message_id": chain.target_chat_id,  # Use target chat as source message
        "confidence": chain.confidence,
    }
    
    try:
        supabase.table("kg_relations").insert(relation_data).execute()
    except Exception as e:
        # Handle duplicate constraint (relation already exists)
        error_str = str(e).lower()
        if "duplicate" in error_str or "unique" in error_str or "violates unique constraint" in error_str:
            pass  # Already exists, skip silently
        else:
            raise RuntimeError(f"Failed to save temporal chain: {e}") from e


def save_decision(supabase, decision, chat_id: str, timestamp: int, trace_ids: list[str]):
    """
    Save decision point to database.
    
    Args:
        supabase: Supabase client
        decision: Decision object
        chat_id: Source chat ID
        timestamp: Message timestamp (Unix milliseconds)
        trace_ids: List of trace IDs extracted from code comments
        
    Raises:
        Exception: If saving fails
    """
    from engine.common.decision_extractor import Decision
    
    if not decision or not decision.decision_text:
        raise ValueError(f"Invalid decision: {decision}")
    
    if not chat_id or not timestamp:
        raise ValueError(f"Invalid chat_id or timestamp: chat_id={chat_id}, timestamp={timestamp}")
    
    decision_data = {
        "id": str(uuid.uuid4()),
        "decision_text": decision.decision_text[:1000],  # Limit length
        "decision_type": decision.decision_type,
        "confidence": decision.confidence,
        "context_snippet": (decision.context_snippet or "")[:MAX_SNIPPET_LENGTH],
        "alternatives_considered": decision.alternatives_considered or [],
        "rationale": (decision.rationale or "")[:1000],  # Limit length
        "source_chat_id": chat_id,
        "message_timestamp": timestamp,
        "trace_ids": trace_ids or [],
    }
    
    try:
        supabase.table("kg_decisions").insert(decision_data).execute()
    except Exception as e:
        raise RuntimeError(f"Failed to save decision '{decision.decision_text[:50]}...': {e}") from e


def process_conversation_worker(conv_data: dict) -> dict:
    """
    Worker function to process a single conversation.
    
    Returns dict with processing stats.
    """
    chat_id = conv_data["chat_id"]
    combined_text = conv_data["combined_text"]
    timestamp = conv_data["timestamp"]
    with_relations = conv_data["with_relations"]
    with_decisions = conv_data["with_decisions"]
    dry_run = conv_data["dry_run"]
    worker_id = conv_data["worker_id"]
    
    stats = {
        "worker_id": worker_id,
        "chat_id": chat_id,
        "entities_created": 0,
        "entities_deduplicated": 0,
        "entities_rejected": 0,
        "relations_created": 0,
        "decisions_extracted": 0,
        "error": None,
        "skipped": False,
        "skip_reason": None,
        "quality_score": 0.0,
    }
    
    try:
        # Quality filter
        quality_score = score_chunk_quality(combined_text, content_type="chat")
        stats["quality_score"] = quality_score.score
        
        if not quality_score.should_index:
            stats["skipped"] = True
            stats["skip_reason"] = f"low_quality ({quality_score.score:.2f})"
            print(f"   [Worker {worker_id}] Skipped {chat_id}: {stats['skip_reason']}")
            return stats
        
        if dry_run:
            print(f"   [Worker {worker_id}] DRY RUN: Would process chat {chat_id} (quality: {quality_score.score:.2f})")
            return stats
        
        # Create worker-local connections
        supabase = get_supabase_client()
        deduplicator = create_deduplicator()
        canonicalizer = EntityCanonicalizer(deduplicator)
        
        # Check if already indexed
        existing = supabase.table("kg_entity_mentions").select("id").eq("message_id", chat_id).limit(1).execute()
        if existing.data:
            stats["skipped"] = True
            stats["skip_reason"] = "already_indexed"
            print(f"   [Worker {worker_id}] Skipped {chat_id}: already_indexed")
            return stats
        
        # Extract triples (Phase 0: Triple-Based Foundation)
        # Use Claude Haiku 4.5 for consistent quality (same as Lenny's indexing)
        try:
            triples = retry_with_backoff(
                extract_triples,
                combined_text,
                model="claude-haiku-4-5",
                provider="anthropic",
                context="user",
                operation_name=f"triple extraction for {chat_id}"
            )
        except Exception as e:
            print(f"   ⚠️ Triple extraction failed for {chat_id}: {str(e)}")
            triples = []
        
        # Extract entities (from triples if available, otherwise direct extraction)
        if triples:
            # Extract entity names from triples
            entity_names_from_triples = triples_to_entities(triples)
            # Use direct extraction for now (can enhance later to use triple-based entity extraction)
            entities = retry_with_backoff(
                extract_entities,
                combined_text,
                model="claude-haiku-4-5",
                provider="anthropic",
                context="user",
                operation_name=f"entity extraction for {chat_id}"
            )
        else:
            entities = retry_with_backoff(
                extract_entities,
                combined_text,
                model="claude-haiku-4-5",
                provider="anthropic",
                context="user",
                operation_name=f"entity extraction for {chat_id}"
            )
        
        if not isinstance(entities, list):
            error_msg = f"Invalid entity extraction result type for {chat_id}: expected list, got {type(entities).__name__}"
            stats["error"] = error_msg
            return stats
        
        if not entities:
            print(f"   [Worker {worker_id}] No entities extracted from {chat_id}")
            return stats
        
        # Process entities with canonicalization
        entity_id_map = {}
        for entity in entities:
            # Post-filter validation
            is_valid, rejection_reason = validate_entity(
                entity.name,
                entity.entity_type,
                combined_text
            )
            
            if not is_valid:
                stats["entities_rejected"] += 1
                continue
            
            # Canonicalize entity (Phase 0: CRITICAL STEP)
            try:
                entity_id, is_new, canonical_name = canonicalizer.canonicalize_entity(
                    name=entity.name,
                    entity_type=entity.entity_type,
                    confidence=entity.confidence,
                    message_timestamp=timestamp,
                    source_type="user",
                )
            except Exception as e:
                print(f"   ⚠️ Canonicalization failed for {entity.name}: {str(e)}")
                continue
            
            entity_id_map[entity.name] = entity_id
            
            if is_new:
                stats["entities_created"] += 1
            else:
                stats["entities_deduplicated"] += 1
            
            # Save mention
            retry_with_backoff(
                save_entity_mention,
                supabase,
                entity_id,
                chat_id,
                combined_text[:MAX_SNIPPET_LENGTH],
                timestamp,
                operation_name=f"saving mention for {entity.name}"
            )
        
        # Extract and save relations if enabled
        if with_relations and entity_id_map:
            try:
                # Use Claude Haiku 4.5 for consistent quality (same as Lenny's indexing)
                relation_extractor = RelationExtractor(model="claude-haiku-4-5", provider="anthropic")
                relations = relation_extractor.extract_relations(combined_text, known_entities=list(entity_id_map.keys()))
                
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
                            chat_id,
                            operation_name=f"saving relation {rel.source_name}->{rel.target_name}"
                        )
                        stats["relations_created"] += 1
            except Exception as e:
                print(f"   ⚠️ Relation extraction failed for {chat_id}: {str(e)}")
        
        # Extract decisions if enabled
        if with_decisions:
            try:
                decisions = retry_with_backoff(
                    extract_decisions,
                    combined_text,
                    operation_name=f"decision extraction for {chat_id}"
                )
                stats["decisions_extracted"] = len(decisions)
                
                # Extract trace IDs from code comments
                trace_ids = extract_trace_ids(combined_text)
                
                # Save each decision to database
                for decision in decisions:
                    if not decision or not decision.decision_text:
                        continue  # Skip invalid decisions
                    
                    try:
                        retry_with_backoff(
                            save_decision,
                            supabase,
                            decision,
                            chat_id,
                            timestamp,
                            trace_ids,
                            operation_name=f"saving decision for {chat_id}"
                        )
                    except Exception as e:
                        decision_preview = decision.decision_text[:50] if decision and decision.decision_text else "unknown"
                        print(f"   ⚠️ Failed to save decision '{decision_preview}...': {str(e)}")
            except Exception as e:
                print(f"   ⚠️ Decision extraction failed for {chat_id}: {str(e)}")
        
        return stats
    
    except PermanentAPIFailure as e:
        print(f"\n❌ PERMANENT FAILURE detected in worker {worker_id}")
        print(f"   Chat: {chat_id}")
        print(f"   Error: {e}")
        raise
    
    except Exception as e:
        import traceback
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        stats["error"] = error_msg
        log_error(error_msg, chat_id=chat_id)
        return stats


def update_progress(stats: dict):
    """Thread-safe progress update."""
    with _progress_lock:
        _progress_stats["chats_processed"] += 1
        _progress_stats["entities_created"] += stats.get("entities_created", 0)
        _progress_stats["entities_deduplicated"] += stats.get("entities_deduplicated", 0)
        _progress_stats["entities_rejected"] += stats.get("entities_rejected", 0)
        _progress_stats["relations_created"] += stats.get("relations_created", 0)
        _progress_stats["decisions_extracted"] += stats.get("decisions_extracted", 0)
        
        if stats.get("error"):
            _progress_stats["errors"] += 1
        
        if stats.get("skipped"):
            _progress_stats["skipped"] += 1
        
        # Emit structured progress markers for API parsing
        total = _progress_stats.get("total_conversations", 0)
        if total > 0:
            current = _progress_stats["chats_processed"]
            print(f"[PROGRESS:current={current},total={total}]")
            print(f"[STAT:key=entitiesCreated,value={_progress_stats['entities_created']}]")
            print(f"[STAT:key=entitiesDeduplicated,value={_progress_stats['entities_deduplicated']}]")
            print(f"[STAT:key=relationsCreated,value={_progress_stats['relations_created']}]")
            print(f"[STAT:key=decisionsExtracted,value={_progress_stats['decisions_extracted']}]")
            print(f"[STAT:key=errors,value={_progress_stats['errors']}]")
            print(f"[STAT:key=skipped,value={_progress_stats['skipped']}]")


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
    print(f"   Rate: {rate_per_minute:.1f} chats/min | ETA: {eta_str}")
    print(f"   ✅ Entities: {stats['entities_created']} new, {stats['entities_deduplicated']} deduplicated, {stats['entities_rejected']} rejected")
    if stats['relations_created'] > 0:
        print(f"   🔗 Relations: {stats['relations_created']}")
    if stats['decisions_extracted'] > 0:
        print(f"   💡 Decisions: {stats['decisions_extracted']}")
    if stats['skipped'] > 0:
        print(f"   ⏭️  Skipped: {stats['skipped']}")


def main():
    global _progress_lock, _progress_stats, _error_log_file
    
    parser = argparse.ArgumentParser(description="Index user chat history into Knowledge Graph")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be indexed without actually indexing")
    parser.add_argument("--limit", type=int, help="Limit number of conversations to process")
    parser.add_argument("--workers", type=int, default=4, help="Number of parallel workers (default: 4)")
    parser.add_argument("--with-relations", action="store_true", help="Extract relations between entities")
    parser.add_argument("--with-decisions", action="store_true", help="Extract decision points")
    parser.add_argument("--days-back", type=int, default=90, help="Number of days to look back (default: 90)")
    
    args = parser.parse_args()
    
    # Initialize progress tracking
    manager = mp.Manager()
    _progress_lock = manager.Lock()
    _progress_stats = manager.dict({
        "chats_processed": 0,
        "entities_created": 0,
        "entities_deduplicated": 0,
        "entities_rejected": 0,
        "relations_created": 0,
        "decisions_extracted": 0,
        "skipped": 0,
        "errors": 0,
    })
    
    # Open error log file
    error_log_path = f"/tmp/user_kg_errors_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    _error_log_file = open(error_log_path, "w")
    
    print("🚀 User Chat KG Indexing")
    print("=" * 60)
    print(f"Workers: {args.workers}")
    print(f"Days back: {args.days_back}")
    print(f"Extract relations: {args.with_relations}")
    print(f"Extract decisions: {args.with_decisions}")
    print(f"Dry run: {args.dry_run}")
    print("=" * 60)
    
    # Load conversations from both sources (local storage)
    conversations = []
    
    # 1. Load Cursor conversations from local SQLite DB
    print("\n📚 Loading Cursor conversations from local database...")
    try:
        cursor_convs = get_high_signal_conversations_sqlite_fast(
            days_back=args.days_back if args.days_back < 3650 else 3650,  # Cap at 10 years max
            max_conversations=args.limit or 10000,  # Increased default limit
        )
        # Mark source
        for conv in cursor_convs:
            conv["source"] = "cursor"
        conversations.extend(cursor_convs)
        print(f"✅ Loaded {len(cursor_convs)} Cursor conversations")
    except Exception as e:
        print(f"⚠️  Failed to load Cursor conversations: {e}")
    
    # 2. Load Claude Code conversations from local JSONL files
    print("\n📚 Loading Claude Code conversations from local storage...")
    try:
        claude_path = get_claude_code_projects_path()
        if claude_path and claude_path.exists():
            # Calculate date range (same as Cursor)
            end_date = date.today()
            start_date = end_date - timedelta(days=args.days_back if args.days_back < 3650 else 3650)
            
            # Get all Claude Code conversations (no workspace filter for now)
            claude_convs = get_claude_code_conversations(
                start_date=start_date,
                end_date=end_date,
                workspace_paths=[]  # Empty list = all workspaces
            )
            
            # Apply limit if specified
            if args.limit:
                claude_convs = claude_convs[:args.limit]
            
            # Mark source and convert chat_id format
            for conv in claude_convs:
                conv["source"] = "claude_code"
                # Ensure chat_id format matches (add prefix if needed)
                if not conv.get("chat_id", "").startswith("user-"):
                    conv["chat_id"] = f"claude-code-{conv.get('chat_id', '')}"
            
            conversations.extend(claude_convs)
            print(f"✅ Loaded {len(claude_convs)} Claude Code conversations")
        else:
            print("ℹ️  Claude Code local storage not found, skipping")
    except Exception as e:
        print(f"⚠️  Failed to load Claude Code conversations: {e}")
    
    if not conversations:
        print("❌ No conversations found from any source")
        sys.exit(1)
    
    print(f"\n✅ Total conversations loaded: {len(conversations)}")
    print(f"   - Cursor: {sum(1 for c in conversations if c.get('source') == 'cursor')}")
    print(f"   - Claude Code: {sum(1 for c in conversations if c.get('source') == 'claude_code')}")
    
    # Prepare conversation data for workers
    conv_data_list = []
    for i, conv in enumerate(conversations):
        # Combine all messages into single text
        messages = conv.get("messages", [])
        if not messages:
            continue  # Skip conversations with no messages
        
        combined_text = "\n".join([msg.get("text", "") for msg in messages])
        if not combined_text or len(combined_text.strip()) < 20:
            continue  # Skip conversations with no meaningful text
        
        # Get timestamp (use first message timestamp or conversation timestamp)
        timestamp = messages[0].get("timestamp", 0) if messages else 0
        if not timestamp:
            timestamp = int(datetime.now().timestamp() * 1000)
        
        conv_data_list.append({
            "chat_id": f"user-{conv.get('chat_id', str(uuid.uuid4()))}",
            "combined_text": combined_text,
            "timestamp": timestamp,
            "with_relations": args.with_relations,
            "with_decisions": args.with_decisions,
            "dry_run": args.dry_run,
            "worker_id": i % args.workers,
        })
    
    if args.dry_run:
        print(f"\n🔍 DRY RUN: Would process {len(conv_data_list)} conversations")
        for conv_data in conv_data_list[:10]:
            print(f"   - {conv_data['chat_id']}: {len(conv_data['combined_text'])} chars")
        return
    
    # Set total conversations for progress tracking
    with _progress_lock:
        _progress_stats["total_conversations"] = len(conv_data_list)
    
    # Process conversations in parallel
    print(f"\n🔄 Processing {len(conv_data_list)} conversations with {args.workers} workers...")
    print(f"[PHASE:name=indexing,message=Indexing conversations with {args.workers} workers]")
    start_time = time.time()
    
    try:
        with mp.Pool(processes=args.workers) as pool:
            results = pool.map(process_conversation_worker, conv_data_list)
        
        # Print final stats
        print("\n" + "=" * 60)
        print("✅ Indexing Complete!")
        print("=" * 60)
        print_progress(len(conv_data_list), len(conv_data_list), start_time)
        
        # Build and save temporal chains
        print("\n🔗 Building temporal chains...")
        print("[PHASE:name=temporal_chains,message=Building temporal relationships between conversations]")
        # Use conv_data_list which already has the right structure
        temporal_conv_data = [
            {
                "chat_id": conv_data["chat_id"],
                "timestamp": conv_data["timestamp"],
                "combined_text": conv_data["combined_text"],
            }
            for conv_data in conv_data_list
        ]
        
        temporal_chains = build_temporal_chains(temporal_conv_data)
        print(f"   Found {len(temporal_chains)} temporal chains")
        
        # Save temporal chains to database as relations
        if temporal_chains:
            print(f"   Saving {len(temporal_chains)} temporal chains to database...")
            supabase = get_supabase_client()
            deduplicator = create_deduplicator()
            
            # Build timestamp map for quick lookup
            timestamp_map = {conv["chat_id"]: conv["timestamp"] for conv in temporal_conv_data}
            
            saved_count = 0
            for chain in temporal_chains:
                if not chain or not chain.source_chat_id or not chain.target_chat_id:
                    continue  # Skip invalid chains
                
                try:
                    source_ts = timestamp_map.get(chain.source_chat_id, 0)
                    target_ts = timestamp_map.get(chain.target_chat_id, 0)
                    
                    if not source_ts or not target_ts:
                        print(f"   ⚠️ Missing timestamp for chain {chain.source_chat_id} → {chain.target_chat_id}")
                        continue
                    
                    save_temporal_chain(supabase, deduplicator, chain, source_ts, target_ts)
                    saved_count += 1
                except Exception as e:
                    print(f"   ⚠️ Failed to save temporal chain {chain.source_chat_id} → {chain.target_chat_id}: {str(e)}")
            
            print(f"   ✅ Saved {saved_count} temporal chains")
        
    except KeyboardInterrupt:
        print("\n\n⚠️ Interrupted by user")
        sys.exit(1)
    except PermanentAPIFailure as e:
        print(f"\n\n❌ PERMANENT FAILURE: {e}")
        print("   Budget/quota exhausted. Stopping gracefully.")
        sys.exit(1)
    finally:
        if _error_log_file:
            _error_log_file.close()
            print(f"\n📝 Error log: {error_log_path}")


if __name__ == "__main__":
    main()
