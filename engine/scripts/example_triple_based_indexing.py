#!/usr/bin/env python3
"""
Example: Triple-Based Indexing Integration

Phase 0: Triple-Based Foundation — Integration Example

This script demonstrates how to integrate triple extraction into the indexing pipeline.
It shows the pattern for Phase 0 integration without modifying the existing indexing script.

Usage:
    python3 engine/scripts/example_triple_based_indexing.py
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv()

from engine.common.triple_extractor import extract_triples, triples_to_entities, triples_to_relations
from engine.common.entity_extractor import extract_entities
from engine.common.entity_canonicalizer import EntityCanonicalizer
from engine.common.entity_deduplicator import create_deduplicator
from engine.common.knowledge_graph import EntityType
from engine.common.vector_db import get_supabase_client


def _infer_entity_type(entity_name: str) -> EntityType:
    """Simple heuristic to infer entity type from name (for demo purposes)."""
    name_lower = entity_name.lower()
    
    # Tool names (common patterns)
    if any(x in name_lower for x in ["react", "next", "supabase", "prisma", "javascript", "typescript"]):
        return EntityType.TOOL
    
    # Pattern names
    if "pattern" in name_lower or "breaker" in name_lower:
        return EntityType.PATTERN
    
    # Problem names
    if "failure" in name_lower or "error" in name_lower:
        return EntityType.PROBLEM
    
    # Default to concept
    return EntityType.CONCEPT


def process_chunk_with_triples(chunk_text: str, chunk_id: str, source_type: str = "expert"):
    """
    Example: Process a chunk using triple-based extraction.
    
    This demonstrates the Phase 0 pattern:
    1. Extract triples (Subject-Predicate-Object)
    2. Extract entities from triples
    3. Extract relations from triples
    4. Canonicalize entities
    5. Save to database
    
    Args:
        chunk_text: Text chunk to process
        chunk_id: Unique chunk identifier
        source_type: Source type ('user' | 'expert')
    """
    print(f"\n📝 Processing chunk: {chunk_id}")
    print(f"Text length: {len(chunk_text)} chars")
    
    # Step 1: Extract triples (Subject-Predicate-Object)
    print("\n1️⃣ Extracting triples...")
    triples = extract_triples(chunk_text, context="baseline" if source_type == "expert" else "user")
    print(f"   Found {len(triples)} triples")
    
    for triple in triples[:3]:  # Show first 3
        print(f"   - {triple}")
    
    # Step 2: Extract entities from triples (subjects and objects)
    print("\n2️⃣ Extracting entities from triples...")
    entity_names = triples_to_entities(triples)
    print(f"   Found {len(entity_names)} unique entity names")
    
    # Step 3: Extract relations from triples
    print("\n3️⃣ Extracting relations from triples...")
    relations = triples_to_relations(triples)
    print(f"   Found {len(relations)} relations")
    
    # Step 4: Canonicalize entities
    print("\n4️⃣ Canonicalizing entities...")
    deduplicator = create_deduplicator()
    canonicalizer = EntityCanonicalizer(deduplicator)
    
    canonicalized = {}
    for entity_name in entity_names:
        # For this example, we'll use a default entity type
        # In production, you'd extract entity types from triples or use LLM
        # Try to infer type from name (simple heuristic for demo)
        entity_type = _infer_entity_type(entity_name)
        
        entity_id, is_new, canonical_name = canonicalizer.canonicalize_entity(
            name=entity_name,
            entity_type=entity_type,
            source_type=source_type,
        )
        canonicalized[entity_name] = (entity_id, canonical_name)
        if is_new:
            print(f"   ✅ Created: {entity_name} → {canonical_name}")
        else:
            print(f"   🔗 Merged: {entity_name} → {canonical_name}")
    
    print(f"\n✅ Processed {len(triples)} triples, {len(entity_names)} entities, {len(relations)} relations")
    
    return {
        "triples": triples,
        "entities": canonicalized,
        "relations": relations,
    }


def main():
    """Example usage of triple-based indexing."""
    
    # Example text chunk
    example_text = """
    We use React for building user interfaces. React is a JavaScript library created by Facebook.
    Next.js is built on top of React and provides server-side rendering capabilities.
    Supabase provides authentication and database services. We use Prisma as our ORM.
    The Circuit Breaker pattern helps us handle API failures gracefully.
    """
    
    print("🚀 Triple-Based Indexing Example")
    print("=" * 60)
    
    result = process_chunk_with_triples(
        chunk_text=example_text,
        chunk_id="example-chunk-001",
        source_type="expert",
    )
    
    print("\n" + "=" * 60)
    print("📊 Summary:")
    print(f"   Triples: {len(result['triples'])}")
    print(f"   Entities: {len(result['entities'])}")
    print(f"   Relations: {len(result['relations'])}")


if __name__ == "__main__":
    main()
