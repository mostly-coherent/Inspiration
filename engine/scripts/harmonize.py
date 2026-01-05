#!/usr/bin/env python3
"""
Standalone Harmonization Script — Resume harmonization of output files.

Use this when harmonization crashes midway and you have .md files left in
data/insights_output/ or data/ideas_output/ that need to be processed.

Usage:
    python3 scripts/harmonize.py --mode insights    # Harmonize insight files
    python3 scripts/harmonize.py --mode ideas       # Harmonize idea files
    python3 scripts/harmonize.py --mode insights --dry-run  # Preview without changes
"""

import argparse
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import load_env_file, get_llm_config
from common.llm import create_llm

# Load environment on import
load_env_file()


def main():
    parser = argparse.ArgumentParser(
        description="Resume harmonization of output files into Items Bank"
    )
    parser.add_argument(
        "--mode",
        choices=["insights", "ideas"],
        required=True,
        help="Which mode to harmonize (insights or ideas)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be harmonized without making changes"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=5,
        help="Number of files to process per batch (default: 5)"
    )
    args = parser.parse_args()
    
    # Import here to avoid circular imports
    from generate import harmonize_all_outputs, MODE_CONFIG
    
    # Check for pending files
    config = MODE_CONFIG[args.mode]
    output_dir = config["output_dir"]
    
    if not output_dir.exists():
        print(f"📁 Output directory doesn't exist: {output_dir}")
        return 0
    
    pending_files = list(output_dir.glob("*.md"))
    
    if not pending_files:
        print(f"✅ No pending files in {output_dir}")
        print("   All files have been harmonized.")
        return 0
    
    print(f"📋 Found {len(pending_files)} pending file(s) in {output_dir}:")
    for f in pending_files[:10]:
        print(f"   - {f.name}")
    if len(pending_files) > 10:
        print(f"   ... and {len(pending_files) - 10} more")
    print()
    
    if args.dry_run:
        print("🔍 DRY RUN - No changes will be made")
        print("   Run without --dry-run to actually harmonize")
        return 0
    
    # Create LLM (needed for some operations)
    llm_config = get_llm_config()
    llm = create_llm(llm_config)
    
    print(f"🔄 Harmonizing {args.mode} files...")
    print()
    
    try:
        processed = harmonize_all_outputs(args.mode, llm, batch_size=args.batch_size)
        print()
        print(f"✅ Harmonization complete! Processed {processed} file(s)")
        return 0
    except Exception as e:
        print(f"❌ Harmonization failed: {e}")
        print()
        print("💡 Tip: Files that were successfully processed have been deleted.")
        print("   Remaining files can be retried by running this script again.")
        return 1


if __name__ == "__main__":
    exit(main())

