#!/usr/bin/env python3
"""
Batch Entity Canonicalization Script

Phase 0: Triple-Based Foundation — CRITICAL STEP

Canonicalizes existing entities in the database by merging semantically identical ones.
This prevents graph fragmentation and improves query accuracy.

Usage:
    # Dry run (show what would be merged)
    python3 engine/scripts/canonicalize_entities.py --dry-run
    
    # Actually merge entities
    python3 engine/scripts/canonicalize_entities.py
    
    # Only merge entities of specific type
    python3 engine/scripts/canonicalize_entities.py --entity-type tool
"""

import argparse
import sys
from pathlib import Path
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv()

from engine.common.entity_canonicalizer import EntityCanonicalizer
from engine.common.entity_deduplicator import create_deduplicator
from engine.common.knowledge_graph import EntityType
from engine.common.semantic_search import get_embedding, cosine_similarity
from engine.common.vector_db import get_supabase_client


def find_similar_entities(supabase, entity_type: Optional[EntityType] = None, threshold: float = 0.85):
    """
    Find pairs of entities that are semantically similar and should be merged.
    
    Args:
        supabase: Supabase client
        entity_type: Optional entity type filter
        threshold: Embedding similarity threshold (default 0.85)
        
    Returns:
        List of (entity1_id, entity1_name, entity2_id, entity2_name, similarity) tuples
    """
    # Fetch all entities with embeddings
    query = supabase.table("kg_entities")\
        .select("id, canonical_name, entity_type, embedding")\
        .not_.is_("embedding", "null")
    
    if entity_type:
        query = query.eq("entity_type", entity_type.value)
    
    result = query.execute()
    
    if not result.data:
        print("No entities with embeddings found")
        return []
    
    entities = result.data
    print(f"Found {len(entities)} entities with embeddings")
    
    # Compare all pairs
    similar_pairs = []
    for i, entity1 in enumerate(entities):
        if not entity1.get("embedding"):
            continue
        
        embedding1 = entity1["embedding"]
        
        for j, entity2 in enumerate(entities[i+1:], start=i+1):
            if not entity2.get("embedding"):
                continue
            
            embedding2 = entity2["embedding"]
            
            # Skip if different entity types
            if entity1["entity_type"] != entity2["entity_type"]:
                continue
            
            # Convert embeddings to lists if they're strings (PostgreSQL array format)
            if isinstance(embedding1, str):
                import json
                try:
                    embedding1 = json.loads(embedding1)
                except:
                    continue
            if isinstance(embedding2, str):
                import json
                try:
                    embedding2 = json.loads(embedding2)
                except:
                    continue
            
            # Skip if embeddings are not valid lists
            if not isinstance(embedding1, list) or not isinstance(embedding2, list):
                continue
            
            # Calculate similarity
            similarity = cosine_similarity(embedding1, embedding2)
            
            if similarity >= threshold:
                similar_pairs.append((
                    entity1["id"],
                    entity1["canonical_name"],
                    entity2["id"],
                    entity2["canonical_name"],
                    similarity,
                ))
    
    # Sort by similarity (highest first)
    similar_pairs.sort(key=lambda x: x[4], reverse=True)
    
    return similar_pairs


def main():
    parser = argparse.ArgumentParser(description="Canonicalize entities in knowledge graph")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be merged without actually merging")
    parser.add_argument("--entity-type", type=str, help="Only process entities of this type")
    parser.add_argument("--threshold", type=float, default=0.85, help="Similarity threshold (default: 0.85)")
    parser.add_argument("--limit", type=int, help="Limit number of merges to perform")
    
    args = parser.parse_args()
    
    # Initialize Supabase client
    supabase = get_supabase_client()
    if not supabase:
        print("❌ Failed to initialize Supabase client")
        sys.exit(1)
    
    # Create canonicalizer
    deduplicator = create_deduplicator()
    canonicalizer = EntityCanonicalizer(deduplicator)
    
    # Parse entity type if provided
    entity_type = None
    if args.entity_type:
        try:
            entity_type = EntityType.from_string(args.entity_type)
        except ValueError as e:
            print(f"❌ Invalid entity type: {e}")
            sys.exit(1)
    
    # Find similar entities
    print(f"🔍 Finding similar entities (threshold: {args.threshold})...")
    similar_pairs = find_similar_entities(supabase, entity_type, args.threshold)
    
    if not similar_pairs:
        print("✅ No similar entities found")
        return
    
    print(f"\nFound {len(similar_pairs)} pairs of similar entities:")
    print("-" * 80)
    
    # Show what would be merged
    for i, (id1, name1, id2, name2, similarity) in enumerate(similar_pairs[:args.limit or len(similar_pairs)], 1):
        print(f"{i}. {name1} ↔ {name2} (similarity: {similarity:.3f})")
        print(f"   IDs: {id1} ↔ {id2}")
    
    if args.dry_run:
        print("\n🔍 DRY RUN: No entities were merged")
        return
    
    # Confirm before merging
    print(f"\n⚠️  This will merge {len(similar_pairs)} pairs of entities")
    response = input("Continue? (yes/no): ")
    if response.lower() != "yes":
        print("Cancelled")
        return
    
    # Perform merges
    print("\n🔄 Merging entities...")
    merged_count = 0
    failed_count = 0
    
    for id1, name1, id2, name2, similarity in similar_pairs[:args.limit or len(similar_pairs)]:
        # Merge into entity with more mentions (or first one if equal)
        # Get mention counts
        result1 = supabase.table("kg_entities")\
            .select("mention_count")\
            .eq("id", id1)\
            .single()\
            .execute()
        
        result2 = supabase.table("kg_entities")\
            .select("mention_count")\
            .single()\
            .eq("id", id2)\
            .execute()
        
        count1 = result1.data.get("mention_count", 0) if result1.data else 0
        count2 = result2.data.get("mention_count", 0) if result2.data else 0
        
        # Merge into entity with more mentions (or first one if equal)
        if count2 > count1:
            source_id, source_name = id1, name1
            target_id, target_name = id2, name2
        else:
            source_id, source_name = id2, name2
            target_id, target_name = id1, name1
        
        if canonicalizer.merge_entities(source_id, target_id, f"Similarity: {similarity:.3f}"):
            merged_count += 1
        else:
            failed_count += 1
    
    print(f"\n✅ Merged {merged_count} pairs")
    if failed_count > 0:
        print(f"❌ Failed to merge {failed_count} pairs")


if __name__ == "__main__":
    main()
