#!/usr/bin/env python3
"""
Migrate Library from JSON to Supabase

Moves items and categories from items_bank.json to Supabase tables.
Creates a backup before migration and verifies data integrity.
"""

import json
import sys
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common import load_env_file
from common.config import get_data_dir
from common.vector_db import get_supabase_client

# Load environment on import
load_env_file()


def backup_json_file(json_path: Path) -> Path:
    """Create a timestamped backup of the JSON file."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = json_path.parent / f"{json_path.stem}_backup_{timestamp}.json"
    
    print(f"📦 Creating backup: {backup_path.name}")
    backup_path.write_text(json_path.read_text())
    print(f"   ✅ Backup created")
    
    return backup_path


def load_items_bank(json_path: Path) -> dict:
    """Load items bank from JSON file."""
    print(f"📖 Loading items bank from {json_path.name}")
    
    if not json_path.exists():
        print(f"   ❌ File not found: {json_path}")
        sys.exit(1)
    
    try:
        with open(json_path, "r") as f:
            bank = json.load(f)
        
        items_count = len(bank.get("items", []))
        categories_count = len(bank.get("categories", []))
        
        print(f"   ✅ Loaded {items_count} items and {categories_count} categories")
        return bank
    
    except json.JSONDecodeError as e:
        print(f"   ❌ Invalid JSON: {e}")
        sys.exit(1)


def migrate_items_to_supabase(items: list, client):
    """Migrate items to Supabase."""
    print(f"\n📝 Migrating {len(items)} items to Supabase...")
    
    if not items:
        print("   ⏭️  No items to migrate")
        return
    
    # Transform items to match Supabase schema
    supabase_items = []
    for item in items:
        supabase_item = {
            "id": item["id"],
            "item_type": item.get("itemType", item.get("mode", "idea")),
            "title": item.get("title", item.get("name", "")),
            "description": item.get("description", ""),
            "tags": item.get("tags", []),
            "status": item.get("status", "active"),
            "quality": item.get("quality"),
            "source_conversations": item.get("sourceConversations", item.get("occurrence", 1)),
            "occurrence": item.get("occurrence", 1),
            "first_seen": item.get("firstSeen", datetime.now().strftime("%Y-%m")),
            "last_seen": item.get("lastSeen", datetime.now().strftime("%Y-%m")),
            "category_id": item.get("categoryId"),
            # Legacy fields
            "mode": item.get("mode"),
            "theme": item.get("theme"),
            "name": item.get("name"),
            "content": item.get("content"),
            "implemented": item.get("implemented"),
        }
        supabase_items.append(supabase_item)
    
    # Batch insert (Supabase has a limit of ~1000 rows per insert)
    batch_size = 500
    total_inserted = 0
    failed = 0
    
    for i in range(0, len(supabase_items), batch_size):
        batch = supabase_items[i:i + batch_size]
        print(f"   📤 Inserting batch {i//batch_size + 1} ({len(batch)} items)...")
        
        try:
            result = client.table("library_items").upsert(batch).execute()
            inserted_count = len(result.data) if result.data else len(batch)
            total_inserted += inserted_count
            print(f"      ✅ Inserted {inserted_count} items")
        
        except Exception as e:
            print(f"      ❌ Batch failed: {e}")
            failed += len(batch)
    
    print(f"\n   ✅ Migration complete: {total_inserted} items inserted, {failed} failed")
    return total_inserted, failed


def migrate_categories_to_supabase(categories: list, client):
    """Migrate categories to Supabase."""
    print(f"\n📝 Migrating {len(categories)} categories to Supabase...")
    
    if not categories:
        print("   ⏭️  No categories to migrate")
        return
    
    # Transform categories to match Supabase schema
    supabase_categories = []
    for category in categories:
        supabase_category = {
            "id": category["id"],
            "name": category["name"],
            "theme": category.get("theme", "generation"),
            "mode": category.get("mode", "idea"),
            "item_ids": category.get("itemIds", []),
            "similarity_threshold": category.get("similarityThreshold", 0.75),
            "created_date": category.get("createdDate", datetime.now().isoformat()),
        }
        supabase_categories.append(supabase_category)
    
    # Batch insert
    batch_size = 500
    total_inserted = 0
    failed = 0
    
    for i in range(0, len(supabase_categories), batch_size):
        batch = supabase_categories[i:i + batch_size]
        print(f"   📤 Inserting batch {i//batch_size + 1} ({len(batch)} categories)...")
        
        try:
            result = client.table("library_categories").upsert(batch).execute()
            inserted_count = len(result.data) if result.data else len(batch)
            total_inserted += inserted_count
            print(f"      ✅ Inserted {inserted_count} categories")
        
        except Exception as e:
            print(f"      ❌ Batch failed: {e}")
            failed += len(batch)
    
    print(f"\n   ✅ Migration complete: {total_inserted} categories inserted, {failed} failed")
    return total_inserted, failed


def verify_migration(bank: dict, client):
    """Verify that all data was migrated correctly."""
    print(f"\n🔍 Verifying migration...")
    
    # Count items in Supabase
    result = client.table("library_items").select("id", count="exact").execute()
    supabase_items_count = result.count if hasattr(result, "count") else 0
    json_items_count = len(bank.get("items", []))
    
    # Count categories in Supabase
    result = client.table("library_categories").select("id", count="exact").execute()
    supabase_categories_count = result.count if hasattr(result, "count") else 0
    json_categories_count = len(bank.get("categories", []))
    
    print(f"\n   Items: JSON={json_items_count}, Supabase={supabase_items_count}")
    print(f"   Categories: JSON={json_categories_count}, Supabase={supabase_categories_count}")
    
    items_match = supabase_items_count == json_items_count
    categories_match = supabase_categories_count == json_categories_count
    
    if items_match and categories_match:
        print(f"\n   ✅ Verification passed! All data migrated successfully.")
        return True
    else:
        print(f"\n   ⚠️  Verification warning: Count mismatch detected.")
        if not items_match:
            print(f"      Items: Expected {json_items_count}, got {supabase_items_count}")
        if not categories_match:
            print(f"      Categories: Expected {json_categories_count}, got {supabase_categories_count}")
        return False


def main():
    print("=" * 80)
    print("Inspiration Library Migration: JSON → Supabase")
    print("=" * 80)
    
    # Get data directory
    data_dir = get_data_dir()
    json_path = data_dir / "items_bank.json"
    
    # Create backup
    backup_path = backup_json_file(json_path)
    
    # Load items bank
    bank = load_items_bank(json_path)
    
    # Get Supabase client
    print(f"\n🔌 Connecting to Supabase...")
    try:
        client = get_supabase_client()
        print(f"   ✅ Connected")
    except Exception as e:
        print(f"   ❌ Connection failed: {e}")
        print(f"\n💡 Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set in .env")
        sys.exit(1)
    
    # Migrate items
    items_inserted, items_failed = migrate_items_to_supabase(bank.get("items", []), client)
    
    # Migrate categories
    categories_inserted, categories_failed = migrate_categories_to_supabase(bank.get("categories", []), client)
    
    # Verify migration
    success = verify_migration(bank, client)
    
    # Summary
    print("\n" + "=" * 80)
    print("Migration Summary")
    print("=" * 80)
    print(f"  Items: {items_inserted} inserted, {items_failed} failed")
    print(f"  Categories: {categories_inserted} inserted, {categories_failed} failed")
    print(f"  Backup: {backup_path.name}")
    print(f"  Verification: {'✅ PASSED' if success else '⚠️  CHECK MANUALLY'}")
    print("=" * 80)
    
    if success and items_failed == 0 and categories_failed == 0:
        print("\n✅ Migration completed successfully!")
        print(f"\n💡 Next steps:")
        print(f"   1. Test the app to ensure Library loads correctly")
        print(f"   2. If all works, you can keep {json_path.name} as backup or remove it")
        print(f"   3. Update API routes to read from Supabase")
    else:
        print("\n⚠️  Migration completed with warnings or errors.")
        print(f"   Review the logs above and check Supabase dashboard.")
        print(f"   Your backup is safe at: {backup_path}")


if __name__ == "__main__":
    main()
