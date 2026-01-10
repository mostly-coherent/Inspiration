#!/usr/bin/env python3
"""
Backfill Embeddings for Library Items

Generates embeddings for all items in library_items table that don't have embeddings yet.
Uses OpenAI text-embedding-3-small model.

Usage:
    python3 engine/scripts/backfill_embeddings.py
    
    # Dry run (show what would be updated):
    python3 engine/scripts/backfill_embeddings.py --dry-run
    
    # Limit to N items:
    python3 engine/scripts/backfill_embeddings.py --limit 50
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

# Add engine to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import load_env_file
from common.vector_db import get_supabase_client
from common.semantic_search import get_embedding

# Load environment variables from .env files
load_env_file()


def get_items_without_embeddings(client, limit: int = None):
    """Fetch items that don't have embeddings yet."""
    query = client.table("library_items").select("id, title, description").is_("embedding", "null")
    
    if limit:
        query = query.limit(limit)
    
    result = query.execute()
    return result.data or []


def backfill_embeddings(dry_run: bool = False, limit: int = None, batch_size: int = 20):
    """
    Generate and store embeddings for items missing them.
    
    Args:
        dry_run: If True, don't actually update the database
        limit: Maximum number of items to process
        batch_size: Number of items to process before saving
    """
    print("🚀 Backfill Embeddings for Library Items")
    print("=" * 50)
    
    # Check for OpenAI API key
    if not os.environ.get("OPENAI_API_KEY"):
        print("❌ OPENAI_API_KEY not set in environment")
        print("   Set it in your .env file (workspace root) or export it:")
        print("   export OPENAI_API_KEY=your-key-here")
        return 1
    
    # Connect to Supabase
    try:
        client = get_supabase_client()
        print("✅ Connected to Supabase")
    except Exception as e:
        print(f"❌ Failed to connect to Supabase: {e}")
        return 1
    
    # Get items without embeddings
    items = get_items_without_embeddings(client, limit)
    total = len(items)
    
    if total == 0:
        print("✅ All items already have embeddings!")
        return 0
    
    print(f"📊 Found {total} items without embeddings")
    
    if dry_run:
        print("\n🔍 DRY RUN - Would process these items:")
        for i, item in enumerate(items[:10], 1):
            print(f"   {i}. {item['title'][:60]}...")
        if total > 10:
            print(f"   ... and {total - 10} more")
        return 0
    
    # Process items
    print(f"\n🔄 Processing {total} items...")
    processed = 0
    failed = 0
    
    for i, item in enumerate(items, 1):
        item_id = item["id"]
        title = item["title"]
        description = item.get("description", "")
        
        # Generate embedding text (title + description)
        text = f"{title} {description}".strip()
        
        try:
            # Generate embedding
            embedding = get_embedding(text)
            
            if embedding and len(embedding) > 0:
                # Store embedding in Supabase
                try:
                    result = client.table("library_items").update({
                        "embedding": embedding  # Stored as JSONB array
                    }).eq("id", item_id).execute()
                    
                    if result.data:
                        processed += 1
                        # Progress indicator
                        if processed % 10 == 0 or processed == total:
                            print(f"   ✅ {processed}/{total} items processed")
                    else:
                        failed += 1
                        if failed <= 3:  # Only show first 3 errors
                            print(f"   ⚠️ Failed to update item {item_id}: No data returned")
                except Exception as update_error:
                    failed += 1
                    if failed <= 3:  # Only show first 3 errors with details
                        print(f"   ❌ Error updating {item_id}: {update_error}")
            else:
                failed += 1
                print(f"   ⚠️ Empty embedding for item {item_id}")
                
        except Exception as e:
            failed += 1
            print(f"   ❌ Error processing {item_id}: {e}")
        
        # Rate limiting - OpenAI has rate limits
        if i % batch_size == 0 and i < total:
            time.sleep(0.5)  # Small delay between batches
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Backfill Complete")
    print(f"   ✅ Processed: {processed}")
    print(f"   ❌ Failed: {failed}")
    print(f"   📈 Total: {total}")
    
    # Verify
    remaining = get_items_without_embeddings(client)
    if len(remaining) == 0:
        print("\n🎉 All items now have embeddings!")
    else:
        print(f"\n⚠️ {len(remaining)} items still missing embeddings")
    
    return 0 if failed == 0 else 1


def main():
    parser = argparse.ArgumentParser(
        description="Backfill embeddings for library items"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be updated without making changes"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of items to process"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=20,
        help="Number of items to process between rate limit pauses"
    )
    
    args = parser.parse_args()
    
    return backfill_embeddings(
        dry_run=args.dry_run,
        limit=args.limit,
        batch_size=args.batch_size
    )


if __name__ == "__main__":
    exit(main())
