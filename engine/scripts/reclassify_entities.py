#!/usr/bin/env python3
"""
Re-classify Entities — Script to re-classify "other" entities to new types.

Part of Schema Evolution (P2): After approving new entity types, re-classify
entities from "other" category to the new types.

Usage:
    python3 reclassify_entities.py --type TYPE_NAME --entity-ids ID1 ID2 ID3 ...
    python3 reclassify_entities.py --type TYPE_NAME --cluster-id CLUSTER_ID
    python3 reclassify_entities.py --type TYPE_NAME --all-from-proposal PROPOSAL_FILE
"""

import argparse
import json
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.config import get_supabase_client


def main():
    parser = argparse.ArgumentParser(
        description="Re-classify entities from 'other' to new types"
    )
    parser.add_argument(
        "--type",
        type=str,
        required=True,
        help="New entity type to assign"
    )
    parser.add_argument(
        "--entity-ids",
        nargs="+",
        default=[],
        help="Specific entity IDs to re-classify"
    )
    parser.add_argument(
        "--cluster-id",
        type=int,
        default=None,
        help="Re-classify all entities from a specific cluster ID"
    )
    parser.add_argument(
        "--all-from-proposal",
        type=str,
        default=None,
        help="Re-classify all entities from a type proposal JSON file"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Dry run - don't update database, just show what would change"
    )
    
    args = parser.parse_args()
    
    # Initialize
    supabase = get_supabase_client()
    if not supabase:
        print("❌ Supabase client not available")
        return
    
    entity_ids_to_update = []
    
    # Determine which entities to update
    if args.entity_ids:
        entity_ids_to_update = args.entity_ids
    elif args.cluster_id is not None:
        # Fetch entities from cluster (would need cluster tracking table)
        print(f"⚠️  Cluster-based re-classification not yet implemented")
        print(f"   Use --entity-ids instead")
        return
    elif args.all_from_proposal:
        # Load proposal file and extract entity IDs
        proposal_path = Path(args.all_from_proposal)
        if not proposal_path.exists():
            print(f"❌ Proposal file not found: {proposal_path}")
            return
        
        with open(proposal_path) as f:
            proposal_data = json.load(f)
        
        # Extract entity IDs from proposal (would need proposal format)
        print(f"⚠️  Proposal-based re-classification not yet implemented")
        print(f"   Use --entity-ids instead")
        return
    else:
        print("❌ Must specify --entity-ids, --cluster-id, or --all-from-proposal")
        return
    
    if not entity_ids_to_update:
        print("❌ No entities to update")
        return
    
    print("=" * 60)
    print("Entity Re-classification")
    print("=" * 60)
    print(f"New type: {args.type}")
    print(f"Entities to update: {len(entity_ids_to_update)}")
    print()
    
    if args.dry_run:
        print("🔍 DRY RUN - No changes will be made")
        print()
        
        # Fetch current entity types
        result = supabase.table("kg_entities").select(
            "id, canonical_name, entity_type"
        ).in_("id", entity_ids_to_update).execute()
        
        if result.data:
            print("Entities that would be updated:")
            for entity in result.data:
                print(
                    f"  - {entity['canonical_name']} ({entity['id']}): "
                    f"{entity['entity_type']} → {args.type}"
                )
        else:
            print("⚠️  No entities found with specified IDs")
        
        return
    
    # Update entity types
    print("Updating entity types...")
    result = supabase.table("kg_entities").update(
        {"entity_type": args.type}
    ).in_("id", entity_ids_to_update).execute()
    
    if result.error:
        print(f"❌ Error updating entities: {result.error}")
        return
    
    print(f"✅ Successfully re-classified {len(entity_ids_to_update)} entities to {args.type}")
    print()
    print("Next steps:")
    print("1. Verify entities in UI")
    print("2. Check entity counts by type")


if __name__ == "__main__":
    main()
