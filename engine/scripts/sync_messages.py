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

from common.cursor_db import get_conversations_for_range
from common.vector_db import (
    get_supabase_client,
    get_last_sync_timestamp,
    save_sync_state,
    index_message,
)
from common.semantic_search import batch_get_embeddings


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
    
    # Get conversations in date range
    print("📚 Loading conversations...")
    conversations = get_conversations_for_range(start_date, end_date, workspace_paths=None)
    
    # Filter to only new messages (timestamp > last_sync_ts)
    new_messages = []
    for convo in conversations:
        workspace = convo.get("workspace", "Unknown")
        chat_id = convo.get("chat_id", "unknown")
        chat_type = convo.get("chat_type", "unknown")
        
        for msg in convo.get("messages", []):
            msg_ts = msg.get("timestamp", 0)
            if msg_ts <= last_sync_ts:
                continue  # Skip already indexed messages
            
            msg_text = msg.get("text", "").strip()
            if not msg_text:
                continue
            
            message_id = generate_message_id(
                workspace,
                chat_id,
                msg_ts,
                msg_text,
            )
            
            new_messages.append({
                "message_id": message_id,
                "text": msg_text,
                "timestamp": msg_ts,
                "workspace": workspace,
                "chat_id": chat_id,
                "chat_type": chat_type,
                "message_type": msg.get("type", "user"),
            })
    
    print(f"📝 Found {len(new_messages)} new messages to index")
    
    if dry_run:
        print("🔍 DRY RUN: Would index messages above")
        return
    
    if not new_messages:
        print("✅ No new messages to sync")
        return
    
    # Process in batches
    batch_size = 100
    indexed_count = 0
    failed_count = 0
    max_timestamp = last_sync_ts
    
    for i in range(0, len(new_messages), batch_size):
        batch = new_messages[i:i + batch_size]
        batch_texts = [msg["text"] for msg in batch]
        batch_num = i // batch_size + 1
        total_batches = (len(new_messages) + batch_size - 1) // batch_size
        
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

