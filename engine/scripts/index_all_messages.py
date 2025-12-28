#!/usr/bin/env python3
"""
One-time script to index all Cursor chat messages into Supabase vector database.

Usage:
    python3 index_all_messages.py [--batch-size BATCH_SIZE] [--dry-run]
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.cursor_db import get_conversations_for_range
from common.vector_db import get_supabase_client, index_message, save_sync_state
from common.semantic_search import batch_get_embeddings
from datetime import timedelta


def generate_message_id(workspace: str, chat_id: str, timestamp: int, text: str) -> str:
    """Generate unique message ID."""
    import hashlib
    key = f"{workspace}:{chat_id}:{timestamp}:{text[:50]}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def index_all_messages(
    batch_size: int = 100,
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
    
    # Get date range (last 90 days, or all if you want)
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=90)
    
    print(f"📅 Date range: {start_date} to {end_date}")
    
    # Get all conversations
    print("📚 Loading conversations from Cursor database...")
    conversations = get_conversations_for_range(start_date, end_date, workspace_paths=None)
    
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
    
    print(f"📝 Processing {len(all_messages)} messages...")
    
    # Process in batches
    indexed_count = 0
    failed_count = 0
    max_timestamp = 0
    
    for i in range(0, len(all_messages), batch_size):
        batch = all_messages[i:i + batch_size]
        batch_texts = [msg["text"] for msg in batch]
        
        print(f"  Processing batch {i // batch_size + 1}/{(len(all_messages) + batch_size - 1) // batch_size}...")
        
        # Get embeddings in batch
        try:
            embeddings = batch_get_embeddings(batch_texts, use_cache=True)
        except Exception as e:
            print(f"  ⚠️  Failed to get embeddings: {e}")
            failed_count += len(batch)
            continue
        
        # Index each message
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
            except Exception as e:
                print(f"  ⚠️  Failed to index message: {e}")
                failed_count += 1
        
        # Progress update
        if (i + batch_size) % (batch_size * 10) == 0:
            print(f"  ✅ Indexed {indexed_count}/{len(all_messages)} messages...")
    
    # Save sync state
    save_sync_state(max_timestamp, indexed_count)
    
    print(f"\n✅ Indexing complete!")
    print(f"   Indexed: {indexed_count}")
    print(f"   Failed: {failed_count}")
    print(f"   Last timestamp: {max_timestamp}")


def main():
    parser = argparse.ArgumentParser(description="Index all Cursor messages into vector DB")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size for processing")
    parser.add_argument("--dry-run", action="store_true", help="Dry run (don't actually index)")
    args = parser.parse_args()
    
    index_all_messages(batch_size=args.batch_size, dry_run=args.dry_run)


if __name__ == "__main__":
    main()

