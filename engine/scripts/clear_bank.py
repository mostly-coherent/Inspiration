#!/usr/bin/env python3
"""
Clear Items Bank - Remove all items and categories from the bank.
"""

import sys
from pathlib import Path

# Add engine to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.items_bank_supabase import ItemsBankSupabase as ItemsBank


def main():
    """Clear the items bank."""
    bank = ItemsBank()
    
    # Get stats before clearing
    stats = bank.get_stats()
    total_items = stats["totalItems"]
    total_categories = stats["totalCategories"]
    
    if total_items == 0 and total_categories == 0:
        print("✅ Bank is already empty")
        return 0
    
    print(f"📊 Current bank stats:")
    print(f"   Items: {total_items}")
    print(f"   Categories: {total_categories}")
    print()
    
    # Clear the bank
    if bank.clear():
        print(f"✅ Cleared bank: {total_items} items and {total_categories} categories removed")
        return 0
    else:
        print("❌ Failed to clear bank")
        return 1


if __name__ == "__main__":
    exit(main())

