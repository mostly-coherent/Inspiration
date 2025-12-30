#!/usr/bin/env python3
"""
Migration script: Convert idea_bank.json and insight_bank.json to unified items_bank.json

This script:
1. Loads existing idea_bank.json and insight_bank.json
2. Converts entries to unified Item format
3. Generates embeddings for category grouping
4. Creates initial categories
5. Saves items_bank.json
6. Backs up original banks
"""

import json
import sys
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.items_bank import ItemsBank
from engine.common.config import get_data_dir


def migrate_idea_entry(entry: dict) -> dict:
    """Convert idea bank entry to unified item content format."""
    return {
        "title": entry.get("title", ""),
        "problem": entry.get("problem", ""),
        "solution": entry.get("solution", ""),
        "audience": entry.get("audience", []),
        "nuances": entry.get("nuances", []),
        "source_runs": entry.get("source_runs", []),
        "solved_score": entry.get("solved_score", "unsolved"),
        "solved_by": entry.get("solved_by"),
        "solved_reason": entry.get("solved_reason"),
        # Preserve original structure
        "_original": entry,
    }


def migrate_insight_entry(entry: dict) -> dict:
    """Convert insight bank entry to unified item content format."""
    return {
        "title": entry.get("title", ""),
        "hook": entry.get("hook", ""),
        "insight": entry.get("insight", ""),
        "examples": entry.get("examples", []),
        "post_draft": entry.get("post_draft", ""),
        "nuances": entry.get("nuances", []),
        "source_runs": entry.get("source_runs", []),
        "shared_score": entry.get("shared_score", "unshared"),
        "shared_by": entry.get("shared_by"),
        # Preserve original structure
        "_original": entry,
    }


def main():
    """Run migration."""
    data_dir = get_data_dir()
    idea_bank_path = data_dir / "idea_bank.json"
    insight_bank_path = data_dir / "insight_bank.json"
    items_bank_path = data_dir / "items_bank.json"
    
    print("🔄 Starting bank migration to v1 unified format...")
    
    # Check if migration already done
    if items_bank_path.exists():
        response = input(f"⚠️  items_bank.json already exists. Overwrite? (y/N): ")
        if response.lower() != "y":
            print("❌ Migration cancelled.")
            return
    
    # Initialize unified bank
    bank = ItemsBank(data_dir)
    
    # Migrate ideas
    ideas_migrated = 0
    if idea_bank_path.exists():
        print(f"📦 Loading {idea_bank_path}...")
        try:
            with open(idea_bank_path) as f:
                idea_data = json.load(f)
                entries = idea_data.get("ideas", []) or idea_data.get("entries", [])
                
                print(f"   Found {len(entries)} ideas")
                for entry in entries:
                    content = migrate_idea_entry(entry)
                    item_id = bank.add_item(
                        mode="idea",
                        theme="generation",
                        content=content,
                        name=entry.get("title"),
                    )
                    ideas_migrated += 1
                    if ideas_migrated % 10 == 0:
                        print(f"   Migrated {ideas_migrated} ideas...")
                
                print(f"✅ Migrated {ideas_migrated} ideas")
        except Exception as e:
            print(f"⚠️  Error migrating ideas: {e}")
    else:
        print("ℹ️  No idea_bank.json found, skipping")
    
    # Migrate insights
    insights_migrated = 0
    if insight_bank_path.exists():
        print(f"📦 Loading {insight_bank_path}...")
        try:
            with open(insight_bank_path) as f:
                insight_data = json.load(f)
                entries = insight_data.get("insights", []) or insight_data.get("entries", [])
                
                print(f"   Found {len(entries)} insights")
                for entry in entries:
                    content = migrate_insight_entry(entry)
                    item_id = bank.add_item(
                        mode="insight",
                        theme="generation",
                        content=content,
                        name=entry.get("title"),
                    )
                    insights_migrated += 1
                    if insights_migrated % 10 == 0:
                        print(f"   Migrated {insights_migrated} insights...")
                
                print(f"✅ Migrated {insights_migrated} insights")
        except Exception as e:
            print(f"⚠️  Error migrating insights: {e}")
    else:
        print("ℹ️  No insight_bank.json found, skipping")
    
    # Generate categories
    print("\n🔗 Generating categories...")
    categories_idea = bank.generate_categories(mode="idea", similarity_threshold=0.75)
    categories_insight = bank.generate_categories(mode="insight", similarity_threshold=0.75)
    print(f"✅ Created {len(categories_idea)} idea categories")
    print(f"✅ Created {len(categories_insight)} insight categories")
    
    # Save unified bank
    print(f"\n💾 Saving {items_bank_path}...")
    if bank.save():
        print("✅ Migration complete!")
        
        # Backup original banks
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if idea_bank_path.exists():
            backup_path = data_dir / f"idea_bank.json.backup_{timestamp}"
            import shutil
            shutil.copy2(idea_bank_path, backup_path)
            print(f"📦 Backed up idea_bank.json to {backup_path.name}")
        
        if insight_bank_path.exists():
            backup_path = data_dir / f"insight_bank.json.backup_{timestamp}"
            import shutil
            shutil.copy2(insight_bank_path, backup_path)
            print(f"📦 Backed up insight_bank.json to {backup_path.name}")
        
        # Print stats
        stats = bank.get_stats()
        print(f"\n📊 Migration Statistics:")
        print(f"   Total items: {stats['totalItems']}")
        print(f"   Total categories: {stats['totalCategories']}")
        print(f"   By mode: {stats['byMode']}")
        print(f"   By theme: {stats['byTheme']}")
        print(f"   Implemented: {stats['implemented']}")
    else:
        print("❌ Failed to save items_bank.json")
        sys.exit(1)


if __name__ == "__main__":
    main()

