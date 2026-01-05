#!/usr/bin/env python3
"""
Migration Script: name → title field for legacy items.

This script migrates legacy items that use 'name' field to the new 'title' field.
It's idempotent (safe to run multiple times) and creates a backup before migrating.

Usage:
    python3 scripts/migrate_name_to_title.py          # Dry run (show what would change)
    python3 scripts/migrate_name_to_title.py --apply  # Apply the migration
"""

import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path
import sys

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import get_data_dir


def migrate_items_bank(dry_run: bool = True) -> dict:
    """
    Migrate items from legacy 'name' field to 'title' field.
    
    Returns:
        Migration stats dict
    """
    data_dir = get_data_dir()
    bank_path = data_dir / "items_bank.json"
    
    if not bank_path.exists():
        print("❌ items_bank.json not found")
        return {"error": "File not found"}
    
    # Load bank
    with open(bank_path) as f:
        bank = json.load(f)
    
    items = bank.get("items", [])
    
    # Find items that need migration
    needs_migration = []
    already_migrated = []
    new_format = []
    
    for item in items:
        has_name = "name" in item
        has_title = "title" in item
        
        if has_name and not has_title:
            needs_migration.append(item)
        elif has_name and has_title:
            already_migrated.append(item)
        else:
            new_format.append(item)
    
    stats = {
        "total_items": len(items),
        "needs_migration": len(needs_migration),
        "already_migrated": len(already_migrated),
        "new_format": len(new_format),
        "migrated": 0,
        "cleaned_up": 0,
    }
    
    print(f"\n📊 Items Bank Analysis")
    print(f"   Total items: {stats['total_items']}")
    print(f"   Needs migration (name only): {stats['needs_migration']}")
    print(f"   Already has both (cleanup needed): {stats['already_migrated']}")
    print(f"   New format (title only): {stats['new_format']}")
    
    if stats["needs_migration"] == 0 and stats["already_migrated"] == 0:
        print(f"\n✅ No migration needed - all items are in new format")
        return stats
    
    if dry_run:
        print(f"\n🔍 DRY RUN - Changes that would be made:")
        
        for item in needs_migration[:5]:  # Show first 5
            name = item.get("name", "")[:50]
            print(f"   📝 {item['id']}: 'name' → 'title': \"{name}...\"")
        if len(needs_migration) > 5:
            print(f"   ... and {len(needs_migration) - 5} more")
        
        for item in already_migrated[:5]:
            print(f"   🧹 {item['id']}: Remove redundant 'name' field")
        if len(already_migrated) > 5:
            print(f"   ... and {len(already_migrated) - 5} more")
        
        print(f"\n⚠️  Run with --apply to apply these changes")
        return stats
    
    # Create backup
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = data_dir / f"items_bank.pre_migration_{timestamp}.json"
    shutil.copy(bank_path, backup_path)
    print(f"\n💾 Created backup: {backup_path.name}")
    
    # Apply migration
    for item in needs_migration:
        item["title"] = item.pop("name")
        stats["migrated"] += 1
    
    # Cleanup items that have both (remove 'name')
    for item in already_migrated:
        del item["name"]
        stats["cleaned_up"] += 1
    
    # Save
    bank["last_updated"] = datetime.now().isoformat()
    with open(bank_path, "w") as f:
        json.dump(bank, f, indent=2)
    
    print(f"\n✅ Migration complete!")
    print(f"   Migrated: {stats['migrated']} items")
    print(f"   Cleaned up: {stats['cleaned_up']} items")
    print(f"   Backup saved to: {backup_path.name}")
    
    return stats


def main():
    parser = argparse.ArgumentParser(
        description="Migrate legacy 'name' field to 'title' in items_bank.json"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply the migration (default is dry run)"
    )
    args = parser.parse_args()
    
    print("🔄 Items Bank Migration: name → title")
    print("=" * 50)
    
    stats = migrate_items_bank(dry_run=not args.apply)
    
    return 0 if "error" not in stats else 1


if __name__ == "__main__":
    exit(main())

