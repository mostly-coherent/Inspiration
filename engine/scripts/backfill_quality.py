#!/usr/bin/env python3
"""
Backfill Quality Scores

Uses LLM to score existing items that don't have quality ratings.
Scores on: Novelty, Intellectual Interest, Actionability
Maps to: A (13-15), B (9-12), C (5-8)
"""

import json
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common import load_env_file
from common.config import get_data_dir, get_llm_config
from common.llm import create_llm, LLMProvider

# Load environment on import
load_env_file()

QUALITY_SCORING_PROMPT = """Rate this {item_type} on three dimensions from 1-5:

1. **Novelty** (1-5): Is this a fresh perspective? Does it offer something new?
   - 1: Very common/obvious idea
   - 3: Somewhat original, seen variations before
   - 5: Highly novel, unique perspective

2. **Intellectual Interest** (1-5): Would someone want to explore this further?
   - 1: Mundane, no curiosity spark
   - 3: Interesting to some audiences
   - 5: Fascinating, broadly compelling

3. **Actionability** (1-5): Can this be built/shared/applied?
   - 1: Abstract, no clear next steps
   - 3: Some actionable elements
   - 5: Clear, specific, ready to act on

**Title:** {title}
**Content:** {content}

Respond with ONLY a JSON object:
{{"novelty": N, "interest": N, "actionability": N}}

No explanation, just the JSON."""


def score_item(item: dict, llm: LLMProvider) -> str | None:
    """Score a single item and return A/B/C tier."""
    import re
    
    try:
        prompt = QUALITY_SCORING_PROMPT.format(
            item_type=item.get("itemType", "item"),
            title=item.get("title", ""),
            content=item.get("description", "")[:500],
        )
        
        response = llm.generate(prompt, temperature=0.1)
        
        # Parse JSON response
        json_match = re.search(r'\{[^}]+\}', response)
        if not json_match:
            return None
        
        scores = json.loads(json_match.group())
        total = scores.get("novelty", 0) + scores.get("interest", 0) + scores.get("actionability", 0)
        
        if total >= 13:
            return "A"
        elif total >= 9:
            return "B"
        elif total >= 5:
            return "C"
        else:
            return None
            
    except Exception as e:
        print(f"   ⚠️  Error scoring item {item.get('id', 'unknown')}: {e}", file=sys.stderr)
        return None


def backfill_quality(dry_run: bool = False, limit: int | None = None) -> dict:
    """
    Backfill quality scores for items that don't have them.
    
    Args:
        dry_run: If True, don't save changes
        limit: Max number of items to process (None = all)
        
    Returns:
        Stats dict
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
    
    # Filter to items without quality
    unrated_items = [i for i in items if not i.get("quality")]
    print(f"   Found {len(unrated_items)} items without quality ratings")
    
    if not unrated_items:
        print("✅ All items already have quality ratings")
        return {"total": len(items), "unrated": 0, "scored": 0}
    
    # Apply limit if specified
    if limit:
        unrated_items = unrated_items[:limit]
        print(f"   Processing first {limit} items")
    
    # Get LLM
    print("🤖 Initializing LLM for quality scoring...")
    llm_config = get_llm_config()
    llm = create_llm(llm_config)
    
    # Score items in parallel
    print(f"\n🎯 Scoring {len(unrated_items)} items...")
    if dry_run:
        print("   (Dry run mode - no changes will be saved)")
    
    scored_count = 0
    a_count = b_count = c_count = 0
    
    # Create item ID to quality mapping
    quality_map = {}
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(score_item, item, llm): item["id"]
            for item in unrated_items
        }
        
        for i, future in enumerate(as_completed(futures), 1):
            item_id = futures[future]
            try:
                quality = future.result()
                if quality:
                    quality_map[item_id] = quality
                    scored_count += 1
                    if quality == "A":
                        a_count += 1
                    elif quality == "B":
                        b_count += 1
                    elif quality == "C":
                        c_count += 1
                    print(f"   ✅ {item_id}: {quality}-tier")
                else:
                    print(f"   ⚠️  {item_id}: Could not score")
                    
                # Progress
                if i % 10 == 0:
                    print(f"   Progress: {i}/{len(unrated_items)}", file=sys.stderr)
                    
            except Exception as e:
                print(f"   ❌ {item_id}: Error - {e}")
    
    # Apply quality scores to items
    if not dry_run and quality_map:
        print(f"\n💾 Applying {len(quality_map)} quality scores...")
        for item in items:
            if item["id"] in quality_map:
                item["quality"] = quality_map[item["id"]]
        
        # Save
        with open(bank_path, "w") as f:
            json.dump(bank, f, indent=2)
        print("✅ Saved")
    elif dry_run:
        print("\n⚠️  Dry run mode - changes NOT saved")
    
    # Summary
    stats = {
        "total_items": len(items),
        "unrated_before": len([i for i in items if not i.get("quality")] if dry_run else []),
        "scored": scored_count,
        "a_tier": a_count,
        "b_tier": b_count,
        "c_tier": c_count,
    }
    
    print(f"\n📊 Summary:")
    print(f"   Total items: {len(items)}")
    print(f"   Scored: {scored_count}")
    print(f"   A-tier: {a_count}")
    print(f"   B-tier: {b_count}")
    print(f"   C-tier: {c_count}")
    
    return stats


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Backfill quality scores for items")
    parser.add_argument("--dry-run", action="store_true", help="Don't save changes")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of items to process")
    args = parser.parse_args()
    
    print("🎯 Quality Backfill Script")
    print("=" * 60)
    print()
    
    stats = backfill_quality(dry_run=args.dry_run, limit=args.limit)
    
    if "error" in stats:
        sys.exit(1)
    
    print()
    print("✅ Done!")
    
    if args.dry_run:
        print()
        print("💡 To apply changes, run without --dry-run:")
        print("   python3 engine/scripts/backfill_quality.py")
