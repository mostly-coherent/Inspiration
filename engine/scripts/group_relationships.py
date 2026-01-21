#!/usr/bin/env python3
"""
Group Relationships — Script to canonicalize relationship predicates.

Part of Relationship Grouping (P3): Groups similar relationship predicates
("talked about", "discussed" → "MENTIONED") into canonical forms.

Usage:
    python3 group_relationships.py [--similarity-threshold FLOAT] [--output FILE] [--dry-run]
"""

import argparse
import json
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.relationship_canonicalizer import RelationshipCanonicalizer
from engine.common.config import get_supabase_client


def main():
    parser = argparse.ArgumentParser(
        description="Group similar relationship predicates into canonical forms"
    )
    parser.add_argument(
        "--similarity-threshold",
        type=float,
        default=0.7,
        help="Minimum confidence for grouping (0.0-1.0, default: 0.7)"
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output file for groupings (JSON). If not specified, prints to stdout"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Dry run - don't merge relations, just analyze"
    )
    
    args = parser.parse_args()
    
    # Initialize
    supabase = get_supabase_client()
    canonicalizer = RelationshipCanonicalizer(supabase)
    
    print("=" * 60)
    print("Relationship Grouping (Dynamic Ontology)")
    print("=" * 60)
    print(f"Similarity threshold: {args.similarity_threshold}")
    print()
    
    # Canonicalize relations
    groups, ontology = canonicalizer.canonicalize_relations(
        similarity_threshold=args.similarity_threshold
    )
    
    if not groups:
        print("No relationship groups created.")
        return
    
    # Format output
    output_data = {
        "groups": [
            {
                "canonical_type": g.canonical_type,
                "predicates": g.predicates,
                "confidence": g.confidence,
                "rationale": g.rationale
            }
            for g in groups
        ],
        "ontology": [
            {
                "canonical_type": o.canonical_type,
                "description": o.description,
                "grouped_predicates": o.grouped_predicates,
                "example_count": o.example_count
            }
            for o in ontology
        ]
    }
    
    # Output
    if args.output:
        output_path = Path(args.output)
        with open(output_path, "w") as f:
            json.dump(output_data, f, indent=2)
        print(f"\nGroupings saved to: {output_path}")
    else:
        print("\n" + "=" * 60)
        print("Relationship Groups:")
        print("=" * 60)
        print(json.dumps(output_data, indent=2))
    
    print(f"\nCreated {len(groups)} canonical groups")
    print("Next steps:")
    print("1. Review groupings in UI or output file")
    print("2. Validate and approve canonical types")
    print("3. Run merge script to update kg_relations table")


if __name__ == "__main__":
    main()
