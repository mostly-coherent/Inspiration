#!/usr/bin/env python3
"""
One-time script to index all Cursor chat messages into Supabase vector database.

Usage:
    python3 index_all_messages.py [--batch-size BATCH_SIZE] [--dry-run]
"""

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.cursor_db import get_conversations_for_range, _get_conversations_for_date_sqlite
from common.vector_db import get_supabase_client, index_message, index_messages_batch, save_sync_state, get_existing_message_ids
from common.semantic_search import batch_get_embeddings
from common.prompt_compression import compress_single_message

# Optimization constants (matching sync_messages.py)
MAX_TEXT_LENGTH = 6000  # Compress messages longer than this (preserves more info)
MIN_TEXT_LENGTH = 10   # Skip messages shorter than this (not useful for search)


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


def index_all_messages(
    batch_size: int = 200,  # Increased default for faster processing
    dry_run: bool = False,
) -> None:
    """Index all messages from Cursor database into vector DB."""
    client = get_supabase_client()
    if not client:
        print("❌ Supabase client not available. Check SUPABASE_URL and SUPABASE_ANON_KEY in .env")
        return
    
    print("🚀 Starting full message indexing...")
    print(f"📦 Batch size: {batch_size}")
    print(f"🔍 Dry run: {dry_run}")
    
    # Get date range - go back far enough to include July 2025
    end_date = datetime.now().date()
    start_date = datetime(2025, 7, 1).date()  # Start from July 2025 when user started using Cursor
    
    print(f"📅 Date range: {start_date} to {end_date}")
    
    # Get all conversations from LOCAL SQLite database (not Vector DB)
    # We need to read from local DB to index into Vector DB
    print("📚 Loading conversations from LOCAL Cursor database (SQLite)...")
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
    
    total_messages = sum(len(c.get("messages", [])) for c in conversations)
    print(f"📊 Found {len(conversations)} conversations with {total_messages} messages")
    
    if dry_run:
        print("🔍 DRY RUN: Would index all messages above")
        return
    
    # Flatten all messages
    all_messages = []
    for convo in conversations:
        workspace = convo.get("workspace", "Unknown")
        chat_id = convo.get("chat_id", "unknown")
        chat_type = convo.get("chat_type", "unknown")
        
        for msg in convo.get("messages", []):
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
                    print(f"  ⚠️  Compression failed after retries, using truncation fallback")
                    msg_text = truncate_text_for_embedding(msg_text)
                else:
                    msg_text = compressed_text
            
            message_id = generate_message_id(
                workspace,
                chat_id,
                msg.get("timestamp", 0),
                msg_text,
            )
            
            all_messages.append({
                "message_id": message_id,
                "text": msg_text,
                "timestamp": msg.get("timestamp", 0),
                "workspace": workspace,
                "chat_id": chat_id,
                "chat_type": chat_type,
                "message_type": msg.get("type", "user"),
            })
    
    print(f"📝 Found {len(all_messages)} messages in local database")
    
    # Check which messages already exist in Vector DB to avoid duplicates
    print("🔍 Checking which messages already exist in Vector DB...")
    all_message_ids = [msg["message_id"] for msg in all_messages]
    existing_ids = get_existing_message_ids(all_message_ids, client)
    
    # Filter out messages that already exist
    new_messages = [msg for msg in all_messages if msg["message_id"] not in existing_ids]
    skipped_count = len(all_messages) - len(new_messages)
    
    print(f"   ✅ Already indexed: {skipped_count:,} messages (skipping)")
    print(f"   🆕 Need to index: {len(new_messages):,} messages")
    
    if not new_messages:
        print("\n✅ All messages already indexed! Nothing to do.")
        return
    
    print(f"\n📝 Processing {len(new_messages)} new messages...")
    
    # Process in batches (optimized batch size)
    indexed_count = 0
    failed_count = 0
    max_timestamp = 0
    
    for i in range(0, len(new_messages), batch_size):
        batch = new_messages[i:i + batch_size]
        batch_texts = [msg["text"] for msg in batch]
        
        print(f"  Processing batch {i // batch_size + 1}/{(len(new_messages) + batch_size - 1) // batch_size}...")
        
        # Get embeddings in batch
        try:
            embeddings = batch_get_embeddings(batch_texts, use_cache=True)
        except Exception as e:
            print(f"  ⚠️  Failed to get embeddings: {e}")
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
        try:
            batch_successful, batch_failed = index_messages_batch(client, batch_data)
            indexed_count += batch_successful
            failed_count += batch_failed
            
            # Update max timestamp
            for msg in batch:
                max_timestamp = max(max_timestamp, msg["timestamp"])
        except Exception as e:
            print(f"  ⚠️  Batch insert failed, falling back to individual inserts: {e}")
            # Fallback to individual inserts if batch fails
            for msg, embedding in zip(batch, embeddings):
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
                    print(f"  ⚠️  Failed to index message: {e2}")
                    failed_count += 1
        
        # Progress update
        if (i + batch_size) % (batch_size * 10) == 0:
            print(f"  ✅ Indexed {indexed_count}/{len(new_messages)} messages...")
    
    # Save sync state
    save_sync_state(max_timestamp, indexed_count)
    
    print(f"\n✅ Indexing complete!")
    print(f"   Already indexed (skipped): {skipped_count:,}")
    print(f"   Newly indexed: {indexed_count:,}")
    print(f"   Failed: {failed_count}")
    print(f"   Total processed: {skipped_count + indexed_count:,}")
    print(f"   Last timestamp: {max_timestamp}")


def main():
    parser = argparse.ArgumentParser(description="Index all Cursor messages into vector DB")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size for processing")
    parser.add_argument("--dry-run", action="store_true", help="Dry run (don't actually index)")
    args = parser.parse_args()
    
    index_all_messages(batch_size=args.batch_size, dry_run=args.dry_run)


if __name__ == "__main__":
    main()

