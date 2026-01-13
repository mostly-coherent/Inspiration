#!/usr/bin/env python3
"""
Incremental sync service to keep vector database updated with messages from all sources.

Supports:
- Cursor (macOS, Windows)
- Claude Code (macOS, Windows, Linux)

Run this periodically (e.g., daily via cron) to sync new messages.

Usage:
    python3 sync_messages.py [--days DAYS] [--dry-run]
"""

import argparse
import sys
import json
from datetime import datetime, timedelta, date
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.cursor_db import get_conversations_for_range, _get_conversations_for_date_sqlite, get_cursor_db_path
from common.claude_code_db import get_claude_code_conversations
from common.source_detector import detect_sources, print_detection_report
from common.vector_db import (
    get_supabase_client,
    get_last_sync_timestamp,
    get_sync_state_path,
    save_sync_state,
    index_message,
    index_messages_batch,
    get_existing_message_ids,
)
from common.semantic_search import batch_get_embeddings
from common.prompt_compression import compress_single_message
from common.db_health_check import detect_schema_version, save_diagnostic_report
from common.config import load_config


# Optimization constants
MAX_TEXT_LENGTH = 6000  # Compress messages longer than this (preserves more info)
MIN_TEXT_LENGTH = 10   # Skip messages shorter than this (not useful for search)
BATCH_SIZE = 200        # Increased from 100 for faster processing (OpenAI allows up to 2048)


# Per-source sync state management
def load_sync_state() -> dict:
    """Load sync state from file, migrating old format if needed."""
    state_path = get_sync_state_path()
    if not state_path.exists():
        return {"sources": {}}

    try:
        with open(state_path) as f:
            state = json.load(f)

        # Migrate old format: {last_sync_timestamp: X} → {sources: {cursor: {last_sync_timestamp: X}}}
        if "last_sync_timestamp" in state and "sources" not in state:
            old_ts = state["last_sync_timestamp"]
            state = {
                "sources": {
                    "cursor": {
                        "last_sync_timestamp": old_ts,
                        "messages_indexed": 0,
                    }
                }
            }
            # Save migrated state
            with open(state_path, 'w') as f:
                json.dump(state, f, indent=2)

        return state
    except (json.JSONDecodeError, KeyError):
        return {"sources": {}}


def get_source_last_sync_timestamp(source: str) -> int:
    """Get last sync timestamp for a specific source."""
    state = load_sync_state()
    return state.get("sources", {}).get(source, {}).get("last_sync_timestamp", 0)


def update_sync_state(source: str, timestamp: int, count: int) -> None:
    """Update sync state for a specific source."""
    state = load_sync_state()

    if "sources" not in state:
        state["sources"] = {}

    state["sources"][source] = {
        "last_sync_timestamp": timestamp,
        "messages_indexed": count,
    }

    with open(get_sync_state_path(), 'w') as f:
        json.dump(state, f, indent=2)


def truncate_text_for_embedding(text: str, max_chars: int = MAX_TEXT_LENGTH) -> str:
    """
    Truncate text to fit within embedding API limits.
    Used as fallback when compression fails after retries.
    """
    if len(text) <= max_chars:
        return text
    
    # Truncate and add indicator
    truncated = text[:max_chars]
    # Try to cut at a sentence boundary
    last_period = truncated.rfind('.')
    last_newline = truncated.rfind('\n')
    cut_point = max(last_period, last_newline)
    
    if cut_point > max_chars * 0.8:  # If we found a good break point
        return truncated[:cut_point + 1] + "\n\n[Message truncated due to length]"
    else:
        return truncated + "\n\n[Message truncated due to length]"


def generate_message_id(workspace: str, chat_id: str, timestamp: int, text: str, source: str = "cursor") -> str:
    """Generate unique message ID with source prefix."""
    import hashlib
    key = f"{workspace}:{chat_id}:{timestamp}:{text[:50]}"
    hash_id = hashlib.sha256(key.encode()).hexdigest()[:16]
    return f"{source}:{hash_id}" if source != "cursor" else hash_id  # Backward compat: cursor has no prefix


def sync_cursor_messages(
    days_back: int,
    dry_run: bool,
    client,
) -> dict:
    """Sync Cursor messages to Vector DB. Returns stats dict."""

    print(f"\n🔄 Syncing Cursor")

    # Health check: Validate database schema before attempting sync
    try:
        db_path = get_cursor_db_path()
        health = detect_schema_version(db_path)

        if not health.is_healthy:
            print(f"❌ Database schema incompatible: {health.schema_version}", flush=True)
            print("", flush=True)
            for issue in health.issues:
                print(f"  {issue}", flush=True)
            print("", flush=True)

            # Save diagnostic report
            report_path = save_diagnostic_report(health, db_path)
            print(f"📄 Diagnostic report saved: {report_path}", flush=True)
            print("", flush=True)
            print("⚠️  Please report this issue at:", flush=True)
            print("   https://github.com/mostly-coherent/Inspiration/issues", flush=True)
            return {"indexed": 0, "skipped": 0, "failed": 0}
        else:
            print(f"✅ Database schema check passed: {health.schema_version}", flush=True)
    except Exception as e:
        print(f"⚠️  Warning: Health check failed: {e}", flush=True)
        print("   Continuing with sync attempt...", flush=True)

    last_sync_ts = get_source_last_sync_timestamp("cursor")

    if last_sync_ts == 0:
        # Check if sync state file exists but is corrupted (vs. never synced)
        state_path = get_sync_state_path()
        if state_path.exists():
            print("⚠️  Sync state file exists but is corrupted or invalid.")
            print("   The sync script attempted to recover by checking Vector DB.")
            print("   If recovery failed, you may need to run index_all_messages.py for initial indexing.")
        else:
            print("⚠️  No previous sync found. Run index_all_messages.py first for initial indexing.")
        return {"indexed": 0, "skipped": 0, "failed": 0}

    last_sync_date = datetime.fromtimestamp(last_sync_ts / 1000).date()
    end_date = datetime.now().date()
    start_date = max(last_sync_date, end_date - timedelta(days=days_back))

    print(f"   Last sync: {last_sync_date}")
    print(f"   Date range: {start_date} to {end_date}")
    
    # Get conversations from LOCAL SQLite database (not Vector DB)
    # We need to read from local DB to find new messages
    print("📚 Loading conversations from LOCAL database...")
    conversations = []
    current_date = start_date
    while current_date <= end_date:
        day_conversations = _get_conversations_for_date_sqlite(current_date, workspace_paths=None, use_cache=False)
        conversations.extend(day_conversations)
        current_date += timedelta(days=1)
    
    # Deduplicate conversations by chat_id + workspace
    seen = set()
    unique_conversations = []
    for conv in conversations:
        key = (conv.get("chat_id"), conv.get("workspace"))
        if key not in seen:
            seen.add(key)
            unique_conversations.append(conv)
    conversations = unique_conversations
    
    # Filter to only new messages (timestamp > last_sync_ts)
    candidate_messages = []
    for convo in conversations:
        workspace = convo.get("workspace", "Unknown")
        chat_id = convo.get("chat_id", "unknown")
        chat_type = convo.get("chat_type", "unknown")
        
        for msg in convo.get("messages", []):
            msg_ts = msg.get("timestamp", 0)
            if msg_ts <= last_sync_ts:
                continue  # Skip messages before last sync
            
            msg_text = msg.get("text", "").strip()
            if not msg_text:
                continue
            
            # OPTIMIZATION: Skip very short messages (not useful for search)
            if len(msg_text) < MIN_TEXT_LENGTH:
                continue
            
            # OPTIMIZATION: Compress long messages to preserve information
            if len(msg_text) > MAX_TEXT_LENGTH:
                # Compress messages longer than MAX_TEXT_LENGTH to preserve critical info
                # This adds cost (~$0.001) but preserves technical decisions, code patterns, insights
                # Retry logic is built into compress_single_message (3 attempts with exponential backoff)
                compressed_text = compress_single_message(msg_text, max_chars=MAX_TEXT_LENGTH, max_retries=3)
                if compressed_text is None:
                    # Compression failed after all retries - fallback to truncation
                    print(f"  ⚠️  Compression failed after retries, using truncation fallback", flush=True)
                    msg_text = truncate_text_for_embedding(msg_text)
                else:
                    msg_text = compressed_text
            
            message_id = generate_message_id(
                workspace,
                chat_id,
                msg_ts,
                msg_text,
            )
            
            candidate_messages.append({
                "message_id": message_id,
                "text": msg_text,
                "timestamp": msg_ts,
                "workspace": workspace,
                "chat_id": chat_id,
                "chat_type": chat_type,
                "message_type": msg.get("type", "user"),
            })
    
    print(f"📝 Found {len(candidate_messages)} messages since last sync")
    
    # Check which ones already exist in Vector DB (deduplication)
    print("🔍 Checking for duplicates in Vector DB...")
    all_message_ids = [msg["message_id"] for msg in candidate_messages]
    existing_ids = get_existing_message_ids(all_message_ids, client)
    
    # Filter to only truly new messages
    new_messages = [msg for msg in candidate_messages if msg["message_id"] not in existing_ids]
    skipped_count = len(candidate_messages) - len(new_messages)
    
    if skipped_count > 0:
        print(f"   ✅ Already indexed: {skipped_count} messages (skipping)")
    
    # Deduplicate messages within batch (same message_id can occur if same text appears multiple times)
    seen_ids = set()
    deduped_messages = []
    for msg in new_messages:
        if msg["message_id"] not in seen_ids:
            seen_ids.add(msg["message_id"])
            deduped_messages.append(msg)
    
    batch_dupes = len(new_messages) - len(deduped_messages)
    if batch_dupes > 0:
        print(f"   🔄 Removed {batch_dupes} duplicate(s) within batch")
    new_messages = deduped_messages
    
    print(f"   🆕 New messages to index: {len(new_messages)}")
    
    if dry_run:
        print("🔍 DRY RUN: Would index messages above")
        return
    
    if not new_messages:
        print("✅ No new messages to sync")
        return
    
    # Process in batches (optimized batch size for faster processing)
    indexed_count = 0
    failed_count = 0
    max_timestamp = last_sync_ts
    compressed_count = sum(1 for msg in new_messages if "[Message compressed" in msg["text"])
    
    if compressed_count > 0:
        print(f"   📦 {compressed_count} messages compressed (preserved critical info)")
    
    for i in range(0, len(new_messages), BATCH_SIZE):
        batch = new_messages[i:i + BATCH_SIZE]
        batch_texts = [msg["text"] for msg in batch]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(new_messages) + BATCH_SIZE - 1) // BATCH_SIZE
        
        print(f"  Processing batch {batch_num}/{total_batches} ({len(batch)} messages)...", flush=True)
        
        # Get embeddings in batch
        try:
            print(f"    → Fetching embeddings from OpenAI...", flush=True)
            embeddings = batch_get_embeddings(batch_texts, use_cache=True)
            print(f"    ✓ Got {len(embeddings)} embeddings", flush=True)
        except Exception as e:
            print(f"  ⚠️  Failed to get embeddings: {e}", flush=True)
            failed_count += len(batch)
            continue
        
        # Prepare batch data with embeddings
        batch_data = []
        for msg, embedding in zip(batch, embeddings):
            batch_data.append({
                "message_id": msg["message_id"],
                "text": msg["text"],
                "timestamp": msg["timestamp"],
                "workspace": msg["workspace"],
                "chat_id": msg["chat_id"],
                "chat_type": msg["chat_type"],
                "message_type": msg["message_type"],
                "embedding": embedding,
            })
        
        # Index messages in batch (much faster than individual inserts)
        print(f"    → Indexing {len(batch_data)} messages to Supabase (batch insert)...", flush=True)
        try:
            batch_successful, batch_failed = index_messages_batch(client, batch_data)
            indexed_count += batch_successful
            failed_count += batch_failed
            
            # Update max timestamp
            for msg in batch:
                max_timestamp = max(max_timestamp, msg["timestamp"])
        except Exception as e:
            print(f"  ⚠️  Batch insert failed, falling back to individual inserts: {e}", flush=True)
            # Fallback to individual inserts if batch fails
            for j, (msg, embedding) in enumerate(zip(batch, embeddings)):
                try:
                    success = index_message(
                        client,
                        msg["message_id"],
                        msg["text"],
                        msg["timestamp"],
                        msg["workspace"],
                        msg["chat_id"],
                        msg["chat_type"],
                        msg["message_type"],
                        embedding=embedding,
                    )
                    
                    if success:
                        indexed_count += 1
                        max_timestamp = max(max_timestamp, msg["timestamp"])
                    else:
                        failed_count += 1
                except Exception as e2:
                    print(f"  ⚠️  Failed to index message {j+1}/{len(batch)}: {e2}", flush=True)
                    failed_count += 1
        
        print(f"  ✓ Batch {batch_num}/{total_batches} complete ({indexed_count} indexed, {failed_count} failed)", flush=True)

    # Update sync state for Cursor
    if not dry_run:
        update_sync_state("cursor", max_timestamp, indexed_count)

    print(f"✅ Cursor sync complete: {indexed_count} indexed, {skipped_count} skipped, {failed_count} failed")

    return {
        "indexed": indexed_count,
        "skipped": skipped_count,
        "failed": failed_count,
    }


def sync_claude_code_messages(
    days_back: int,
    dry_run: bool,
    client,
) -> dict:
    """Sync Claude Code messages to Vector DB. Returns stats dict."""

    print(f"\n🔄 Syncing Claude Code")

    last_sync_ts = get_source_last_sync_timestamp("claude_code")

    # Claude Code might not have been synced before
    if last_sync_ts == 0:
        print(f"   First-time sync (no previous sync found)")
        last_sync_date = datetime.now().date() - timedelta(days=days_back)
    else:
        last_sync_date = datetime.fromtimestamp(last_sync_ts / 1000).date()

    end_date = datetime.now().date()
    start_date = max(last_sync_date, end_date - timedelta(days=days_back))

    print(f"   Last sync: {last_sync_date if last_sync_ts > 0 else 'Never'}")
    print(f"   Date range: {start_date} to {end_date}")

    # Get workspaces from config
    config = load_config()
    workspace_paths = config.get("workspaces", [])

    if not workspace_paths:
        print("⚠️  No workspaces configured, skipping")
        return {"indexed": 0, "skipped": 0, "failed": 0}

    # Get Claude Code conversations
    print("📚 Loading conversations from Claude Code...")
    conversations = get_claude_code_conversations(start_date, end_date, workspace_paths)

    # Filter to only new messages (timestamp > last_sync_ts)
    candidate_messages = []
    for convo in conversations:
        workspace = convo.get("workspace", "Unknown")
        chat_id = convo.get("chat_id", "unknown")
        chat_type = convo.get("chat_type", "unknown")

        for msg in convo.get("messages", []):
            msg_ts = msg.get("timestamp", 0)
            if msg_ts <= last_sync_ts:
                continue  # Skip messages before last sync

            msg_text = msg.get("text", "").strip()
            if not msg_text:
                continue

            # OPTIMIZATION: Skip very short messages
            if len(msg_text) < MIN_TEXT_LENGTH:
                continue

            # OPTIMIZATION: Compress long messages
            if len(msg_text) > MAX_TEXT_LENGTH:
                compressed_text = compress_single_message(msg_text, max_chars=MAX_TEXT_LENGTH, max_retries=3)
                if compressed_text is None:
                    print(f"  ⚠️  Compression failed after retries, using truncation fallback", flush=True)
                    msg_text = truncate_text_for_embedding(msg_text)
                else:
                    msg_text = compressed_text

            message_id = generate_message_id(
                workspace,
                chat_id,
                msg_ts,
                msg_text,
                source="claude_code",
            )

            candidate_messages.append({
                "message_id": message_id,
                "text": msg_text,
                "timestamp": msg_ts,
                "workspace": workspace,
                "chat_id": chat_id,
                "chat_type": chat_type,
                "message_type": msg.get("type", "user"),
                "source_detail": msg.get("metadata", {}),
            })

    print(f"📝 Found {len(candidate_messages)} messages since last sync")

    # Check which ones already exist in Vector DB (deduplication)
    print("🔍 Checking for duplicates in Vector DB...")
    all_message_ids = [msg["message_id"] for msg in candidate_messages]
    existing_ids = get_existing_message_ids(all_message_ids, client)

    # Filter to only truly new messages
    new_messages = [msg for msg in candidate_messages if msg["message_id"] not in existing_ids]
    skipped_count = len(candidate_messages) - len(new_messages)

    if skipped_count > 0:
        print(f"   ✅ Already indexed: {skipped_count} messages (skipping)")

    # Deduplicate within batch
    seen_ids = set()
    deduped_messages = []
    for msg in new_messages:
        if msg["message_id"] not in seen_ids:
            seen_ids.add(msg["message_id"])
            deduped_messages.append(msg)

    batch_dupes = len(new_messages) - len(deduped_messages)
    if batch_dupes > 0:
        print(f"   🔄 Removed {batch_dupes} duplicate(s) within batch")
    new_messages = deduped_messages

    print(f"   🆕 New messages to index: {len(new_messages)}")

    if dry_run:
        print("🔍 DRY RUN: Would index messages above")
        return {"indexed": 0, "skipped": skipped_count, "failed": 0}

    if not new_messages:
        print("✅ No new messages to sync")
        return {"indexed": 0, "skipped": skipped_count, "failed": 0}

    # Process in batches
    indexed_count = 0
    failed_count = 0
    max_timestamp = last_sync_ts
    compressed_count = sum(1 for msg in new_messages if "[Message compressed" in msg["text"])

    if compressed_count > 0:
        print(f"   📦 {compressed_count} messages compressed (preserved critical info)")

    for i in range(0, len(new_messages), BATCH_SIZE):
        batch = new_messages[i:i + BATCH_SIZE]
        batch_texts = [msg["text"] for msg in batch]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(new_messages) + BATCH_SIZE - 1) // BATCH_SIZE

        print(f"  Processing batch {batch_num}/{total_batches} ({len(batch)} messages)...", flush=True)

        # Get embeddings in batch
        try:
            print(f"    → Fetching embeddings from OpenAI...", flush=True)
            embeddings = batch_get_embeddings(batch_texts, use_cache=True)
            print(f"    ✓ Got {len(embeddings)} embeddings", flush=True)
        except Exception as e:
            print(f"  ⚠️  Failed to get embeddings: {e}", flush=True)
            failed_count += len(batch)
            continue

        # Prepare batch data with embeddings and source info
        batch_data = []
        for msg, embedding in zip(batch, embeddings):
            batch_data.append({
                "message_id": msg["message_id"],
                "text": msg["text"],
                "timestamp": msg["timestamp"],
                "workspace": msg["workspace"],
                "chat_id": msg["chat_id"],
                "chat_type": msg["chat_type"],
                "message_type": msg["message_type"],
                "embedding": embedding,
                "source": "claude_code",
                "source_detail": msg["source_detail"],
            })

        # Index messages in batch
        print(f"    → Indexing {len(batch_data)} messages to Supabase (batch insert)...", flush=True)
        try:
            batch_successful, batch_failed = index_messages_batch(client, batch_data)
            indexed_count += batch_successful
            failed_count += batch_failed

            # Update max timestamp
            for msg in batch:
                max_timestamp = max(max_timestamp, msg["timestamp"])
        except Exception as e:
            print(f"  ⚠️  Batch insert failed, falling back to individual inserts: {e}", flush=True)
            # Fallback to individual inserts
            for j, (msg, embedding) in enumerate(zip(batch, embeddings)):
                try:
                    success = index_message(
                        client,
                        msg["message_id"],
                        msg["text"],
                        msg["timestamp"],
                        msg["workspace"],
                        msg["chat_id"],
                        msg["chat_type"],
                        msg["message_type"],
                        embedding=embedding,
                        source="claude_code",
                        source_detail=msg["source_detail"],
                    )

                    if success:
                        indexed_count += 1
                        max_timestamp = max(max_timestamp, msg["timestamp"])
                    else:
                        failed_count += 1
                except Exception as e2:
                    print(f"  ⚠️  Failed to index message {j+1}/{len(batch)}: {e2}", flush=True)
                    failed_count += 1

        print(f"  ✓ Batch {batch_num}/{total_batches} complete ({indexed_count} indexed, {failed_count} failed)", flush=True)

    # Update sync state for Claude Code
    if not dry_run:
        update_sync_state("claude_code", max_timestamp, indexed_count)

    print(f"✅ Claude Code sync complete: {indexed_count} indexed, {skipped_count} skipped, {failed_count} failed")

    return {
        "indexed": indexed_count,
        "skipped": skipped_count,
        "failed": failed_count,
    }


def sync_new_messages(
    days_back: int = 7,
    dry_run: bool = False,
) -> None:
    """Sync new messages from all detected sources."""

    # Detect available sources
    print("=" * 60)
    detected_sources = detect_sources()
    print_detection_report(detected_sources)
    print("=" * 60)

    if not detected_sources:
        print("❌ No chat history sources found")
        print("   Make sure you have Cursor or Claude Code installed with conversation history")
        return

    # Get Supabase client
    client = get_supabase_client()
    if not client:
        print("❌ Supabase client not available. Check SUPABASE_URL and SUPABASE_ANON_KEY in .env")
        return

    # Sync each detected source
    stats = {}
    for source in detected_sources:
        if source.name == "cursor":
            try:
                stats["cursor"] = sync_cursor_messages(days_back, dry_run, client)
            except Exception as e:
                print(f"⚠️  Cursor sync failed: {e}")
                stats["cursor"] = {"indexed": 0, "skipped": 0, "failed": 0}
        elif source.name == "claude_code":
            try:
                stats["claude_code"] = sync_claude_code_messages(days_back, dry_run, client)
            except Exception as e:
                print(f"⚠️  Claude Code sync failed: {e}")
                stats["claude_code"] = {"indexed": 0, "skipped": 0, "failed": 0}

    # Print summary
    print()
    print("=" * 60)
    print("📊 SYNC SUMMARY")
    print("=" * 60)

    for source_name, source_stats in stats.items():
        display_name = source_name.replace("_", " ").title()
        print(f"{display_name}: {source_stats['indexed']} indexed, {source_stats['skipped']} skipped, {source_stats['failed']} failed")

    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Sync new messages from all sources (Cursor, Claude Code, etc.) into vector DB")
    parser.add_argument("--days", type=int, default=7, help="Days back to check for new messages (default: 7)")
    parser.add_argument("--dry-run", action="store_true", help="Dry run mode - detect sources and show what would be synced without actually syncing")
    args = parser.parse_args()

    sync_new_messages(days_back=args.days, dry_run=args.dry_run)


if __name__ == "__main__":
    main()

