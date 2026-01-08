#!/usr/bin/env python3
"""
Bulk Date Correction Script

Fixes firstSeen dates for existing items in items_bank.json by querying
the Vector DB for the earliest matching message.

This is a cheap, fast alternative to re-running full historical sync.
- No LLM calls (just database queries)
- Only updates dates (no content changes)
- Takes ~2-5 minutes vs 30-60 minutes for full sync
"""

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import get_data_dir
from common.vector_db import get_supabase_client
from common.semantic_search import cosine_similarity


def find_earliest_message_date(item: dict, client) -> Optional[str]:
    """
    Find the earliest message date for an item by querying Vector DB.
    
    Args:
        item: Item dict with 'embedding' field
        client: Supabase client
        
    Returns:
        Date string (YYYY-MM) or None if not found
    """
    if not item.get("embedding"):
        return None
    
    try:
        # Search for similar messages (top 10 most similar)
        result = client.rpc(
            "search_cursor_messages",
            {
                "query_embedding": item["embedding"],
                "match_threshold": 0.75,  # Lower threshold to catch more matches
                "match_count": 10,
            }
        ).execute()
        
        if not result.data:
            return None
        
        # Find the earliest timestamp among similar messages
        earliest_timestamp = None
        for msg in result.data:
            timestamp = msg.get("timestamp")
            if timestamp:
                if earliest_timestamp is None or timestamp < earliest_timestamp:
                    earliest_timestamp = timestamp
        
        if earliest_timestamp:
            # Convert Unix timestamp (milliseconds) to YYYY-MM
            # Cursor stores timestamps in milliseconds, not seconds
            # Using month-year only (no day) for simpler date tracking
            dt = datetime.fromtimestamp(earliest_timestamp / 1000)
            return dt.strftime("%Y-%m")
        
        return None
        
    except Exception as e:
        print(f"   ⚠️  Error searching for item {item.get('id', 'unknown')}: {e}", file=sys.stderr)
        return None


def bulk_correct_dates(dry_run: bool = False) -> dict:
    """
    Correct firstSeen dates for all items in the bank.
    
    Args:
        dry_run: If True, don't save changes (just report what would change)
        
    Returns:
        Stats dict with counts
    """
    data_dir = get_data_dir()
    bank_path = data_dir / "items_bank.json"
    
    if not bank_path.exists():
        print(f"❌ Items bank not found at {bank_path}")
        return {"error": "Bank not found"}
    
    # Load bank
    print(f"📚 Loading items bank from {bank_path}...")
    with open(bank_path) as f:
        bank = json.load(f)
    
    items = bank.get("items", [])
    total_items = len(items)
    print(f"   Found {total_items} items")
    
    # Get Supabase client
    print("🔌 Connecting to Vector DB...")
    client = get_supabase_client()
    if not client:
        print("❌ Failed to connect to Vector DB. Check SUPABASE_URL and SUPABASE_ANON_KEY in .env.local")
        return {"error": "Vector DB connection failed"}
    
    print("✅ Connected to Vector DB")
    
    # Process each item
    print(f"\n🔍 Searching for earliest message dates...")
    print(f"   {'Dry run mode - no changes will be saved' if dry_run else 'Live mode - changes will be saved'}")
    print()
    
    updated_count = 0
    no_change_count = 0
    not_found_count = 0
    error_count = 0
    
    for i, item in enumerate(items, 1):
        item_id = item.get("id", "unknown")
        current_first_seen = item.get("firstSeen", "")
        
        # Progress indicator
        if i % 10 == 0 or i == total_items:
            print(f"   Progress: {i}/{total_items} ({int(i/total_items*100)}%)", end="\r", file=sys.stderr)
        
        # Find earliest message date
        earliest_date = find_earliest_message_date(item, client)
        
        if earliest_date is None:
            not_found_count += 1
            continue
        
        # Compare with current firstSeen
        if not current_first_seen:
            # No existing date, set it
            item["firstSeen"] = earliest_date
            updated_count += 1
            print(f"   ✅ {item_id}: Set date to {earliest_date} (was empty)")
        elif earliest_date < current_first_seen:
            # Found earlier date, update it
            print(f"   ✅ {item_id}: {current_first_seen} → {earliest_date} (earlier)")
            item["firstSeen"] = earliest_date
            updated_count += 1
        else:
            # Current date is already earliest
            no_change_count += 1
    
    print()  # Clear progress line
    
    # Save changes
    if not dry_run and updated_count > 0:
        print(f"\n💾 Saving changes to {bank_path}...")
        with open(bank_path, "w") as f:
            json.dump(bank, f, indent=2)
        print("✅ Saved")
    elif dry_run and updated_count > 0:
        print(f"\n⚠️  Dry run mode - changes NOT saved")
    
    # Summary
    stats = {
        "total_items": total_items,
        "updated": updated_count,
        "no_change": no_change_count,
        "not_found": not_found_count,
        "errors": error_count,
    }
    
    print(f"\n📊 Summary:")
    print(f"   Total items: {total_items}")
    print(f"   Updated: {updated_count}")
    print(f"   No change needed: {no_change_count}")
    print(f"   Not found in Vector DB: {not_found_count}")
    if error_count > 0:
        print(f"   Errors: {error_count}")
    
    return stats


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Bulk correct firstSeen dates for items")
    parser.add_argument("--dry-run", action="store_true", help="Don't save changes, just report what would change")
    args = parser.parse_args()
    
    print("🔧 Bulk Date Correction Script")
    print("=" * 60)
    print()
    
    stats = bulk_correct_dates(dry_run=args.dry_run)
    
    if "error" in stats:
        sys.exit(1)
    
    print()
    print("✅ Done!")
    
    if args.dry_run:
        print()
        print("💡 To apply changes, run without --dry-run:")
        print("   python3 engine/scripts/bulk_date_correction.py")
