#!/usr/bin/env python3
"""
Incremental sync service to keep vector database updated with new Cursor messages.

Run this periodically (e.g., daily via cron) to sync new messages.

Usage:
    python3 sync_messages.py [--days DAYS] [--dry-run]
"""

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.cursor_db import get_conversations_for_range, _get_conversations_for_date_sqlite
from common.vector_db import (
    get_supabase_client,
    get_last_sync_timestamp,
    save_sync_state,
    index_message,
    get_existing_message_ids,
)
from common.semantic_search import batch_get_embeddings
from common.prompt_compression import compress_single_message


# Optimization constants
MAX_TEXT_LENGTH = 6000  # Compress messages longer than this (preserves more info)
MIN_TEXT_LENGTH = 10   # Skip messages shorter than this (not useful for search)
BATCH_SIZE = 200        # Increased from 100 for faster processing (OpenAI allows up to 2048)


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


def generate_message_id(workspace: str, chat_id: str, timestamp: int, text: str) -> str:
    """Generate unique message ID."""
    import hashlib
    key = f"{workspace}:{chat_id}:{timestamp}:{text[:50]}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def sync_new_messages(
    days_back: int = 7,
    dry_run: bool = False,
) -> None:
    """Sync new messages since last sync."""
    client = get_supabase_client()
    if not client:
        print("❌ Supabase client not available. Check SUPABASE_URL and SUPABASE_ANON_KEY in .env")
        return
    
    last_sync_ts = get_last_sync_timestamp()
    
    if last_sync_ts == 0:
        print("⚠️  No previous sync found. Run index_all_messages.py first for initial indexing.")
        return
    
    last_sync_date = datetime.fromtimestamp(last_sync_ts / 1000).date()
    end_date = datetime.now().date()
    start_date = max(last_sync_date, end_date - timedelta(days=days_back))
    
    print(f"🔄 Incremental sync")
    print(f"   Last sync: {last_sync_date}")
    print(f"   Date range: {start_date} to {end_date}")
    print(f"   Dry run: {dry_run}")
    
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
        
        # Index each message
        print(f"    → Indexing messages to Supabase...", flush=True)
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
            except Exception as e:
                print(f"  ⚠️  Failed to index message {j+1}/{len(batch)}: {e}", flush=True)
                failed_count += 1
        
        print(f"  ✓ Batch {batch_num}/{total_batches} complete ({indexed_count} indexed, {failed_count} failed)", flush=True)
    
    # Save sync state
    save_sync_state(max_timestamp, indexed_count)
    
    print(f"\n✅ Sync complete!")
    print(f"   Indexed: {indexed_count}")
    print(f"   Failed: {failed_count}")
    print(f"   Last timestamp: {max_timestamp}")


def main():
    parser = argparse.ArgumentParser(description="Sync new Cursor messages into vector DB")
    parser.add_argument("--days", type=int, default=7, help="Days back to check for new messages")
    parser.add_argument("--dry-run", action="store_true", help="Dry run (don't actually sync)")
    args = parser.parse_args()
    
    sync_new_messages(days_back=args.days, dry_run=args.dry_run)


if __name__ == "__main__":
    main()

