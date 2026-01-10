#!/usr/bin/env python3
"""
Backfill Library Embeddings

One-time script to generate embeddings for existing library items.
After this, new items will automatically get embeddings on creation.

Usage:
    python3 engine/scripts/backfill_library_embeddings.py [--batch-size 10] [--dry-run]
"""

import argparse
import sys
import time
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.vector_db import get_supabase_client
from engine.common.semantic_search import get_embedding


def backfill_embeddings(batch_size: int = 10, dry_run: bool = False) -> dict:
    """
    Backfill embeddings for library items that don't have them.
    
    Args:
        batch_size: Number of items to process before pausing (rate limiting)
        dry_run: If True, only show what would be done without making changes
    
    Returns:
        Stats dict with counts
    """
    client = get_supabase_client()
    
    # Get items without embeddings
    result = client.table("library_items").select(
        "id, title, description"
    ).is_("embedding", "null").neq("status", "archived").execute()
    
    items = result.data if result.data else []
    total = len(items)
    
    print(f"\n📊 Found {total} items without embeddings")
    
    if total == 0:
        print("✅ All items already have embeddings!")
        return {"total": 0, "processed": 0, "failed": 0}
    
    if dry_run:
        print(f"🔍 DRY RUN: Would process {total} items")
        for item in items[:5]:
            print(f"   - {item['id']}: {item['title'][:50]}...")
        if total > 5:
            print(f"   ... and {total - 5} more")
        return {"total": total, "processed": 0, "failed": 0, "dry_run": True}
    
    # Process in batches
    processed = 0
    failed = 0
    
    print(f"\n🚀 Processing {total} items in batches of {batch_size}...")
    print("   (Rate limiting to avoid API throttling)\n")
    
    for i, item in enumerate(items):
        try:
            # Generate embedding
            query_text = f"{item['title']} {item.get('description', '')}"
            embedding = get_embedding(query_text)
            
            # Update item with embedding
            update_result = client.table("library_items").update({
                "embedding": embedding
            }).eq("id", item["id"]).execute()
            
            if update_result.data:
                processed += 1
                print(f"   ✓ [{i+1}/{total}] {item['title'][:50]}...")
            else:
                failed += 1
                print(f"   ✗ [{i+1}/{total}] Failed to update: {item['id']}")
                
        except Exception as e:
            failed += 1
            print(f"   ✗ [{i+1}/{total}] Error: {e}")
        
        # Rate limiting: pause between batches
        if (i + 1) % batch_size == 0 and i < total - 1:
            print(f"\n   ⏳ Batch complete. Pausing 2s for rate limiting...")
            time.sleep(2)
            print()
    
    print(f"\n{'='*50}")
    print(f"✅ Backfill complete!")
    print(f"   Processed: {processed}/{total}")
    print(f"   Failed: {failed}")
    print(f"{'='*50}\n")
    
    return {
        "total": total,
        "processed": processed,
        "failed": failed,
    }


def verify_embeddings():
    """Verify embedding backfill status."""
    client = get_supabase_client()
    
    # Get counts
    total_result = client.table("library_items").select(
        "id", count="exact"
    ).neq("status", "archived").execute()
    
    with_embedding_result = client.table("library_items").select(
        "id", count="exact"
    ).not_.is_("embedding", "null").neq("status", "archived").execute()
    
    total = total_result.count if hasattr(total_result, "count") else len(total_result.data or [])
    with_embedding = with_embedding_result.count if hasattr(with_embedding_result, "count") else len(with_embedding_result.data or [])
    
    without_embedding = total - with_embedding
    coverage = (with_embedding / total * 100) if total > 0 else 0
    
    print(f"\n📊 Embedding Coverage Status")
    print(f"{'='*40}")
    print(f"   Total items: {total}")
    print(f"   With embeddings: {with_embedding}")
    print(f"   Without embeddings: {without_embedding}")
    print(f"   Coverage: {coverage:.1f}%")
    print(f"{'='*40}\n")
    
    return {
        "total": total,
        "with_embedding": with_embedding,
        "without_embedding": without_embedding,
        "coverage_pct": coverage,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill library item embeddings")
    parser.add_argument("--batch-size", type=int, default=10, help="Batch size for rate limiting")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without making changes")
    parser.add_argument("--verify", action="store_true", help="Only verify current embedding status")
    
    args = parser.parse_args()
    
    if args.verify:
        verify_embeddings()
    else:
        # Show current status first
        verify_embeddings()
        
        # Run backfill
        backfill_embeddings(batch_size=args.batch_size, dry_run=args.dry_run)
        
        # Verify after
        if not args.dry_run:
            verify_embeddings()
