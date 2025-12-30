#!/usr/bin/env python3
"""
Migration script: Convert customVoice to userProfile

This script:
1. Loads existing config.json
2. Migrates customVoice fields to userProfile
3. Moves goldenExamplesDir to mode-specific settings (future work)
4. Saves updated config.json
5. Creates backup of original config
"""

import json
import sys
import shutil
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.config import get_config_path, get_data_dir


def migrate_voice_profile(config: dict) -> dict:
    """
    Migrate customVoice to userProfile.
    
    Mapping:
    - customVoice.authorName → userProfile.name
    - customVoice.authorContext → userProfile.jobContext
    - customVoice.voiceGuideFile → userProfile.styleguide
    - customVoice.goldenExamplesDir → (stays in customVoice for now, will move to mode-specific later)
    """
    migrated_config = config.copy()
    
    # Check if customVoice exists
    custom_voice = config.get("features", {}).get("customVoice", {})
    if not custom_voice:
        print("ℹ️  No customVoice found, nothing to migrate")
        return migrated_config
    
    # Create userProfile if it doesn't exist
    if "userProfile" not in migrated_config:
        migrated_config["userProfile"] = {}
    
    user_profile = migrated_config["userProfile"]
    
    # Migrate fields
    if custom_voice.get("authorName"):
        user_profile["name"] = custom_voice["authorName"]
        print(f"   Migrated authorName → userProfile.name: {custom_voice['authorName']}")
    
    if custom_voice.get("authorContext"):
        user_profile["jobContext"] = custom_voice["authorContext"]
        print(f"   Migrated authorContext → userProfile.jobContext: {custom_voice['authorContext']}")
    
    if custom_voice.get("voiceGuideFile"):
        user_profile["styleguide"] = custom_voice["voiceGuideFile"]
        print(f"   Migrated voiceGuideFile → userProfile.styleguide: {custom_voice['voiceGuideFile']}")
    
    # Note: goldenExamplesDir stays in customVoice for now
    # It will be moved to mode-specific settings in Phase 4
    if custom_voice.get("goldenExamplesDir"):
        print(f"   Note: goldenExamplesDir kept in customVoice (will move to mode-specific settings later)")
    
    # Keep customVoice.enabled flag for backward compatibility during transition
    # But mark it as migrated
    if "features" not in migrated_config:
        migrated_config["features"] = {}
    
    if "customVoice" not in migrated_config["features"]:
        migrated_config["features"]["customVoice"] = {}
    
    migrated_config["features"]["customVoice"]["_migrated"] = True
    
    return migrated_config


def main():
    """Run migration."""
    config_path = get_config_path()
    data_dir = get_data_dir()
    
    print("🔄 Starting voice profile migration...")
    
    if not config_path.exists():
        print(f"❌ Config file not found at {config_path}")
        sys.exit(1)
    
    # Load config
    print(f"📦 Loading {config_path}...")
    try:
        with open(config_path) as f:
            config = json.load(f)
    except Exception as e:
        print(f"❌ Failed to load config: {e}")
        sys.exit(1)
    
    # Check if already migrated
    if config.get("userProfile") and config.get("userProfile").get("name"):
        response = input("⚠️  userProfile already exists. Re-migrate? (y/N): ")
        if response.lower() != "y":
            print("❌ Migration cancelled.")
            return
    
    # Backup original config
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = data_dir / f"config.json.backup_{timestamp}"
    shutil.copy2(config_path, backup_path)
    print(f"📦 Backed up config to {backup_path.name}")
    
    # Migrate
    print("\n🔄 Migrating customVoice → userProfile...")
    migrated_config = migrate_voice_profile(config)
    
    # Save migrated config
    print(f"\n💾 Saving migrated config...")
    try:
        with open(config_path, "w") as f:
            json.dump(migrated_config, f, indent=2)
        print("✅ Migration complete!")
        print(f"\n📊 Migration Summary:")
        print(f"   userProfile.name: {migrated_config.get('userProfile', {}).get('name', 'Not set')}")
        print(f"   userProfile.jobContext: {migrated_config.get('userProfile', {}).get('jobContext', 'Not set')}")
        print(f"   userProfile.styleguide: {migrated_config.get('userProfile', {}).get('styleguide', 'Not set')}")
    except Exception as e:
        print(f"❌ Failed to save config: {e}")
        print(f"   Restore from backup: {backup_path}")
        sys.exit(1)


if __name__ == "__main__":
    main()

