#!/usr/bin/env python3
"""
One-time script to index all Cursor chat messages into Supabase vector database.

Usage:
    python3 index_all_messages.py [--batch-size BATCH_SIZE] [--dry-run]
"""

import argparse
import sys
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import Optional

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.cursor_db import get_conversations_for_range, _get_conversations_for_date_sqlite, get_cursor_db_path
from common.vector_db import get_supabase_client, index_message, index_messages_batch, save_sync_state, get_existing_message_ids
from common.semantic_search import batch_get_embeddings
from common.prompt_compression import compress_single_message
from common.db_health_check import detect_schema_version, save_diagnostic_report

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
    batch_size: int = 200,
    dry_run: bool = False,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    max_size_mb: Optional[float] = None,
) -> dict:
    """
    Index all messages from Cursor database into vector DB.
    
    Returns indexing stats for UI feedback:
    {
        "messages_indexed": int,
        "messages_skipped": int,
        "messages_failed": int,
        "date_coverage": str,
        "cost_estimate": float,
        "last_timestamp": int
    }
    """
    client = get_supabase_client()
    if not client:
        print("❌ Supabase client not available. Check SUPABASE_URL and SUPABASE_ANON_KEY in .env")
        return {
            "messages_indexed": 0,
            "messages_skipped": 0,
            "messages_failed": 0,
            "date_coverage": "",
            "cost_estimate": 0.0,
            "last_timestamp": 0,
            "error": "Supabase client not available"
        }
    
    print("🚀 Starting full message indexing...", flush=True)
    print(f"📦 Batch size: {batch_size}", flush=True)
    print(f"🔍 Dry run: {dry_run}", flush=True)
    
    # Health check: Validate database schema before attempting indexing
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
            return {
                "messages_indexed": 0,
                "messages_skipped": 0,
                "messages_failed": 0,
                "date_coverage": "",
                "cost_estimate": 0.0,
                "last_timestamp": 0,
                "error": f"Database schema incompatible: {health.schema_version}"
            }
        else:
            print(f"✅ Database schema check passed: {health.schema_version}", flush=True)
    except Exception as e:
        print(f"⚠️  Warning: Health check failed: {e}", flush=True)
        print("   Continuing with indexing attempt...", flush=True)
    
    # Default date range if not provided
    if end_date is None:
        end_date = date.today()
    if start_date is None:
        start_date = date(2025, 7, 1)
    
    print(f"📅 Date range: {start_date} to {end_date}", flush=True)
    if max_size_mb:
        print(f"💾 Max size limit: {max_size_mb} MB", flush=True)
    
    print("📚 Loading conversations from LOCAL Cursor database (SQLite)...", flush=True)
    
    conversations = []
    current_date = start_date
    total_size_bytes = 0
    max_size_bytes = max_size_mb * 1024 * 1024 if max_size_mb else float('inf')
    
    # Iterate over dates to fetch from SQLite
    # Fetch newest first if we have a size limit, to prioritize recent history
    # But for indexing, we usually want oldest to newest?
    # The requirement for "Quick Start" is "Recent 500MB".
    # So if max_size_mb is set, we should fetch REVERSE chronological.
    
    date_list = []
    temp_date = start_date
    while temp_date <= end_date:
        date_list.append(temp_date)
        temp_date += timedelta(days=1)
        
    if max_size_mb:
        date_list.reverse() # Newest first
        
    for target_date in date_list:
        if total_size_bytes >= max_size_bytes:
            print(f"⚠️  Reached size limit of {max_size_mb}MB. Stopping fetch.", flush=True)
            break
            
        print(f"   Fetching {target_date}...", end="\r", flush=True)
        try:
            day_convos = _get_conversations_for_date_sqlite(target_date, use_cache=False)
        except Exception as e:
            print(f"⚠️  Error fetching {target_date}: {e}", file=sys.stderr, flush=True)
            continue
        
        for conv in day_convos:
            # Calculate size contribution
            conv_size = sum(len(m.get("text", "")) for m in conv.get("messages", []))
            
            if total_size_bytes + conv_size > max_size_bytes:
                # If this conversation pushes us over, stop here
                print(f"⚠️  Reached size limit of {max_size_mb}MB. Stopping fetch.", flush=True)
                break
            
            conversations.append(conv)
            total_size_bytes += conv_size
        else:
            # If inner loop didn't break, continue to next date
            continue
        # If inner loop broke (size limit reached), break outer loop too
        break
            
    print(f"   ✅ Database read complete! Loaded {len(conversations)} conversations.", flush=True)
    
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
    print(f"📊 Found {len(conversations)} conversations with {total_messages} messages", flush=True)
    
    if dry_run:
        print("🔍 DRY RUN: Would index all messages above")
        return {
            "messages_indexed": 0,
            "messages_skipped": 0,
            "messages_failed": 0,
            "date_coverage": f"{start_date} to {end_date}",
            "cost_estimate": 0.0,
            "last_timestamp": 0,
            "dry_run": True
        }
    
    # Flatten all messages and attach conversation metrics
    all_messages = []
    for convo in conversations:
        workspace = convo.get("workspace", "Unknown")
        chat_id = convo.get("chat_id", "unknown")
        chat_type = convo.get("chat_type", "unknown")
        messages = convo.get("messages", [])
        
        # Calculate conversation metrics
        has_code = any("```" in m.get("text", "") for m in messages)
        message_count = len(messages)
        
        # User effort score (simple heuristic)
        user_chars = sum(len(m.get("text", "")) for m in messages if m.get("type") == "user")
        user_effort_score = min(100, int(user_chars / 100)) # Cap at 100
        
        # Prepare source_detail
        source_detail = {
            "has_code": has_code,
            "message_count": message_count,
            "user_effort_score": user_effort_score,
            "conversation_start_ts": messages[0].get("timestamp", 0) if messages else 0
        }
        
        for msg in messages:
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
                "source_detail": source_detail # Attach metrics
            })
    
    print(f"📝 Found {len(all_messages)} messages in local database")
    
    # Check which messages already exist in Vector DB to avoid duplicates
    print("🔍 Checking which messages already exist in Vector DB...", flush=True)
    all_message_ids = [msg["message_id"] for msg in all_messages]
    existing_ids = get_existing_message_ids(all_message_ids, client)
    
    # Filter out messages that already exist
    new_messages = [msg for msg in all_messages if msg["message_id"] not in existing_ids]
    skipped_count = len(all_messages) - len(new_messages)
    
    print(f"   ✅ Already indexed: {skipped_count:,} messages (skipping)", flush=True)
    print(f"   🆕 Need to index: {len(new_messages):,} messages", flush=True)
    
    if not new_messages:
        print("\n✅ All messages already indexed! Nothing to do.", flush=True)
        return {
            "messages_indexed": 0,
            "messages_skipped": skipped_count,
            "messages_failed": 0,
            "date_coverage": f"{start_date} to {end_date}",
            "cost_estimate": 0.0,
            "last_timestamp": 0
        }
    
    print(f"\n📝 Processing {len(new_messages)} new messages...", flush=True)
    
    # Process in batches (optimized batch size)
    indexed_count = 0
    failed_count = 0
    max_timestamp = 0
    compressed_count = sum(1 for msg in new_messages if "[Message compressed" in msg["text"])
    
    if compressed_count > 0:
        print(f"   📦 {compressed_count} messages compressed (preserved critical info)", flush=True)
    
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
                "source_detail": msg.get("source_detail"),  # Include metadata
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
                        source_detail=msg.get("source_detail"),  # Pass metadata
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
    
    # Save sync state
    save_sync_state(max_timestamp, indexed_count)
    
    # Calculate cost estimate (rough: ~$0.00002 per 1K tokens, ~200 tokens per message)
    avg_tokens_per_message = 200
    total_tokens = indexed_count * avg_tokens_per_message
    cost_per_1k_tokens = 0.00002
    cost_estimate = (total_tokens / 1000) * cost_per_1k_tokens
    
    print(f"\n✅ Indexing complete!", flush=True)
    print(f"   Already indexed (skipped): {skipped_count:,}", flush=True)
    print(f"   Newly indexed: {indexed_count:,}", flush=True)
    print(f"   Failed: {failed_count}", flush=True)
    print(f"   Total processed: {skipped_count + indexed_count:,}", flush=True)
    print(f"   Last timestamp: {max_timestamp}", flush=True)
    print(f"   Estimated cost: ${cost_estimate:.4f}", flush=True)
    
    return {
        "messages_indexed": indexed_count,
        "messages_skipped": skipped_count,
        "messages_failed": failed_count,
        "date_coverage": f"{start_date} to {end_date}",
        "cost_estimate": round(cost_estimate, 4),
        "last_timestamp": max_timestamp
    }


def main():
    parser = argparse.ArgumentParser(description="Index all Cursor messages into vector DB")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size for processing")
    parser.add_argument("--dry-run", action="store_true", help="Dry run (don't actually index)")
    parser.add_argument("--start-date", type=str, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", type=str, help="End date (YYYY-MM-DD)")
    parser.add_argument("--max-size-mb", type=float, help="Max size to index in MB")
    args = parser.parse_args()
    
    start_date = datetime.strptime(args.start_date, "%Y-%m-%d").date() if args.start_date else None
    end_date = datetime.strptime(args.end_date, "%Y-%m-%d").date() if args.end_date else None
    
    index_all_messages(
        batch_size=args.batch_size, 
        dry_run=args.dry_run,
        start_date=start_date,
        end_date=end_date,
        max_size_mb=args.max_size_mb
    )


if __name__ == "__main__":
    main()

