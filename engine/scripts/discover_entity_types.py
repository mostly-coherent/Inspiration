#!/usr/bin/env python3
"""
Discover Entity Types — Script to discover new entity types from "other" category.

Part of Schema Evolution (P2): Analyzes "other" entities, clusters them by similarity,
and uses LLM to propose new entity types.

Usage:
    python3 discover_entity_types.py [--limit N] [--min-cluster-size N] [--eps FLOAT] [--max-proposals N] [--output FILE]
"""

import argparse
import json
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.type_discovery import TypeDiscovery
from engine.common.config import get_supabase_client


def main():
    parser = argparse.ArgumentParser(
        description="Discover new entity types from 'other' category entities"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of 'other' entities to analyze (default: all)"
    )
    parser.add_argument(
        "--min-cluster-size",
        type=int,
        default=5,
        help="Minimum entities per cluster (default: 5)"
    )
    parser.add_argument(
        "--eps",
        type=float,
        default=0.3,
        help="DBSCAN eps parameter - clustering threshold 0.0-1.0 (default: 0.3)"
    )
    parser.add_argument(
        "--max-proposals",
        type=int,
        default=10,
        help="Maximum type proposals to generate (default: 10)"
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output file for proposals (JSON). If not specified, prints to stdout"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Dry run - don't save proposals, just analyze"
    )
    
    args = parser.parse_args()
    
    # Initialize
    supabase = get_supabase_client()
    type_discovery = TypeDiscovery(supabase)
    
    print("=" * 60)
    print("Entity Type Discovery (Schema Evolution)")
    print("=" * 60)
    print(f"Parameters:")
    print(f"  Limit: {args.limit or 'all'}")
    print(f"  Min cluster size: {args.min_cluster_size}")
    print(f"  Eps (clustering threshold): {args.eps}")
    print(f"  Max proposals: {args.max_proposals}")
    print()
    
    # Discover types
    proposals = type_discovery.discover_types(
        limit=args.limit,
        min_cluster_size=args.min_cluster_size,
        eps=args.eps,
        max_proposals=args.max_proposals
    )
    
    if not proposals:
        print("No type proposals generated.")
        return
    
    # Format proposals for output
    proposals_data = [
        {
            "proposed_type": p.proposed_type,
            "description": p.description,
            "example_entities": p.example_entities,
            "cluster_size": p.cluster_size,
            "confidence": p.confidence,
            "rationale": p.rationale
        }
        for p in proposals
    ]
    
    # Output
    if args.output:
        output_path = Path(args.output)
        with open(output_path, "w") as f:
            json.dump(proposals_data, f, indent=2)
        print(f"\nProposals saved to: {output_path}")
    else:
        print("\n" + "=" * 60)
        print("Type Proposals:")
        print("=" * 60)
        print(json.dumps(proposals_data, indent=2))
    
    print(f"\nGenerated {len(proposals)} type proposals")
    print("Next steps:")
    print("1. Review proposals in UI or output file")
    print("2. Validate and approve new types")
    print("3. Run re-classification script to update entities")


if __name__ == "__main__":
    main()
