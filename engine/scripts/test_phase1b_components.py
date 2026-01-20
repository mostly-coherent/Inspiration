#!/usr/bin/env python3
"""
Test Phase 1b components: Triple extraction, entity extraction, decision extraction.

This script tests the core components independently to verify they work correctly.
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv()

from engine.common.triple_extractor import extract_triples, triples_to_entities
from engine.common.entity_extractor import extract_entities
from engine.common.decision_extractor import extract_decisions
from engine.common.temporal_tracker import build_temporal_chains

# Sample conversation text
SAMPLE_TEXT = """
We're building a knowledge graph system for Inspiration v2.0. 
We decided to use Supabase for the database because it has pgvector support for embeddings.
We're using GPT-4o-mini for entity extraction to keep costs low.
The Circuit Breaker pattern will help us handle API failures gracefully.
We considered using MongoDB but Postgres is better for our use case.
"""

print("🧪 Testing Phase 1b Components")
print("=" * 60)

# Test 1: Triple Extraction
print("\n1️⃣ Testing Triple Extraction...")
try:
    triples = extract_triples(SAMPLE_TEXT, context="user")
    print(f"   ✅ Extracted {len(triples)} triples")
    for i, triple in enumerate(triples[:3], 1):
        print(f"   {i}. ({triple.subject}, {triple.predicate}, {triple.object})")
except Exception as e:
    print(f"   ❌ Failed: {e}")

# Test 2: Entity Extraction
print("\n2️⃣ Testing Entity Extraction...")
try:
    entities = extract_entities(SAMPLE_TEXT, context="user")
    print(f"   ✅ Extracted {len(entities)} entities")
    for i, entity in enumerate(entities[:5], 1):
        print(f"   {i}. {entity.name} ({entity.entity_type.value}) - confidence: {entity.confidence:.2f}")
except Exception as e:
    print(f"   ❌ Failed: {e}")

# Test 3: Decision Extraction
print("\n3️⃣ Testing Decision Extraction...")
try:
    decisions = extract_decisions(SAMPLE_TEXT)
    print(f"   ✅ Extracted {len(decisions)} decisions")
    for i, decision in enumerate(decisions[:3], 1):
        print(f"   {i}. {decision.decision_text} ({decision.decision_type})")
        if decision.alternatives_considered:
            print(f"      Alternatives: {', '.join(decision.alternatives_considered)}")
except Exception as e:
    print(f"   ❌ Failed: {e}")

# Test 4: Temporal Chain Building
print("\n4️⃣ Testing Temporal Chain Building...")
try:
    conversations = [
        {
            "chat_id": "chat-1",
            "timestamp": 1000000,
            "combined_text": "First conversation about React.",
        },
        {
            "chat_id": "chat-2",
            "timestamp": 2000000,
            "combined_text": "Following up on previous discussion about Next.js.",
        },
        {
            "chat_id": "chat-3",
            "timestamp": 3000000,
            "combined_text": "New topic about Supabase.",
        },
    ]
    chains = build_temporal_chains(conversations)
    print(f"   ✅ Built {len(chains)} temporal chains")
    for i, chain in enumerate(chains[:2], 1):
        print(f"   {i}. {chain.source_chat_id} → {chain.relationship_type} → {chain.target_chat_id}")
except Exception as e:
    print(f"   ❌ Failed: {e}")

print("\n" + "=" * 60)
print("✅ Component testing complete!")
