#!/usr/bin/env python3
"""
Reprocess messages that failed during indexing due to token limits.
These messages are too long for the embedding API, so we'll truncate or chunk them.
"""

import sys
from pathlib import Path
from datetime import datetime, timedelta

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.cursor_db import get_conversations_for_range, _get_conversations_for_date_sqlite
from common.vector_db import get_supabase_client, index_message, get_existing_message_ids
from common.semantic_search import get_embedding
import hashlib


def generate_message_id(workspace: str, chat_id: str, timestamp: int, text: str) -> str:
    """Generate unique message ID."""
    key = f"{workspace}:{chat_id}:{timestamp}:{text[:50]}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def truncate_text_for_embedding(text: str, max_chars: int = 6000) -> str:
    """
    Truncate text to fit within embedding API limits.
    OpenAI text-embedding-3-small has a limit of 8192 tokens.
    Roughly 1 token = 4 characters, so ~6000 chars should be safe.
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


def find_failed_messages():
    """Find messages from local DB that are likely too long or failed to index."""
    print("🔍 Finding messages that may have failed...")
    
    client = get_supabase_client()
    if not client:
        print("❌ Supabase client not available")
        return []
    
    # Get all messages from local DB
    start_date = datetime(2025, 7, 1).date()
    end_date = datetime.now().date()
    
    print(f"📅 Scanning {start_date} to {end_date}...")
    
    all_messages = []
    current_date = start_date
    
    while current_date <= end_date:
        conversations = _get_conversations_for_date_sqlite(current_date, workspace_paths=None, use_cache=False)
        for conv in conversations:
            workspace = conv.get("workspace", "Unknown")
            chat_id = conv.get("chat_id", "unknown")
            chat_type = conv.get("chat_type", "unknown")
            
            for msg in conv.get("messages", []):
                msg_text = msg.get("text", "").strip()
                if not msg_text:
                    continue
                
                # Check if message is very long (likely to fail)
                if len(msg_text) > 6000:  # Roughly 1500 tokens, close to limit
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
                        "length": len(msg_text),
                    })
        
        current_date += timedelta(days=1)
    
    print(f"   Found {len(all_messages)} potentially long messages")
    
    # Check which ones are NOT in Vector DB
    print("🔍 Checking which ones are missing from Vector DB...")
    all_message_ids = [msg["message_id"] for msg in all_messages]
    existing_ids = get_existing_message_ids(all_message_ids, client)
    
    failed_messages = [msg for msg in all_messages if msg["message_id"] not in existing_ids]
    
    print(f"   ✅ Found {len(failed_messages)} long messages not in Vector DB")
    
    return failed_messages


def reprocess_messages(messages, batch_size: int = 50):
    """Reprocess failed messages with truncation."""
    client = get_supabase_client()
    if not client:
        print("❌ Supabase client not available")
        return
    
    print(f"\n📝 Reprocessing {len(messages)} messages...")
    print(f"   Strategy: Truncate to ~6000 characters to fit embedding API limits\n")
    
    indexed_count = 0
    failed_count = 0
    
    for i, msg in enumerate(messages, 1):
        if i % 10 == 0:
            print(f"   Processing {i}/{len(messages)}...")
        
        # Truncate text
        original_length = len(msg["text"])
        truncated_text = truncate_text_for_embedding(msg["text"])
        
        if original_length != len(truncated_text):
            print(f"   ⚠️  Truncating message {i} from {original_length} to {len(truncated_text)} chars")
        
        try:
            # Generate embedding for truncated text
            embedding = get_embedding(truncated_text)
            
            # Index with truncated text
            success = index_message(
                client,
                msg["message_id"],
                truncated_text,  # Use truncated version
                msg["timestamp"],
                msg["workspace"],
                msg["chat_id"],
                msg["chat_type"],
                msg["message_type"],
                embedding=embedding,
            )
            
            if success:
                indexed_count += 1
            else:
                failed_count += 1
                print(f"   ❌ Failed to index message {i}")
        
        except Exception as e:
            failed_count += 1
            print(f"   ❌ Error processing message {i}: {e}")
    
    print(f"\n✅ Reprocessing complete!")
    print(f"   Successfully indexed: {indexed_count}")
    print(f"   Failed: {failed_count}")


def main():
    """Main function."""
    print("🔄 Reprocessing Failed Messages\n")
    print("=" * 60)
    
    # Find failed messages
    failed_messages = find_failed_messages()
    
    if not failed_messages:
        print("\n✅ No failed messages found! All messages are indexed.")
        return
    
    # Show summary
    print(f"\n📊 Failed Messages Summary:")
    print(f"   Total: {len(failed_messages)}")
    
    # Group by length
    very_long = [m for m in failed_messages if m["length"] > 10000]
    long = [m for m in failed_messages if 6000 < m["length"] <= 10000]
    
    print(f"   Very long (>10K chars): {len(very_long)}")
    print(f"   Long (6K-10K chars): {len(long)}")
    
    # Reprocess
    reprocess_messages(failed_messages)


if __name__ == "__main__":
    main()

