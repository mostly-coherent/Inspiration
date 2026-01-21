#!/usr/bin/env python3
"""
Create Semantic Matches Between Conversations and Episodes

Uses embedding similarity to match user conversations to episode concepts,
creating SEMANTIC_MATCH relations. This is Phase 4: Semantic Concept Overlay.

Usage:
    python3 engine/scripts/create_semantic_matches.py
    
    # Dry run (show what would be created):
    python3 engine/scripts/create_semantic_matches.py --dry-run
    
    # Custom similarity threshold:
    python3 engine/scripts/create_semantic_matches.py --threshold 0.8
    
    # Limit matches per conversation:
    python3 engine/scripts/create_semantic_matches.py --limit-per-conv 3
"""

import argparse
import sys
from pathlib import Path

# Add engine to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import load_env_file
from common.vector_db import get_supabase_client

# Load environment variables
load_env_file()


def create_semantic_matches(
    dry_run: bool = False,
    similarity_threshold: float = 0.75,
    limit_per_conversation: int = 5
):
    """
    Create SEMANTIC_MATCH relations between conversations and episodes.
    
    Args:
        dry_run: If True, only show what would be created
        similarity_threshold: Minimum cosine similarity (0.0-1.0)
        limit_per_conversation: Maximum matches per conversation
    """
    client = get_supabase_client()
    
    if dry_run:
        print(f"🔍 DRY RUN - Would create semantic matches with:")
        print(f"   Similarity threshold: {similarity_threshold}")
        print(f"   Max matches per conversation: {limit_per_conversation}")
        print()
        
        # Count conversations with synthesis embeddings
        result = client.table("kg_conversations").select("id", count="exact").not_.is_("synthesis_embedding", "null").eq("source_type", "user").execute()
        conv_count = result.count or 0
        print(f"📊 Found {conv_count} user conversations with synthesis embeddings")
        
        # Count episodes with embeddings (episodes are stored as entities in kg_entities)
        result = client.table("kg_entities").select("id", count="exact").eq("entity_type", "episode").not_.is_("embedding", "null").execute()
        episode_count = result.count or 0
        print(f"📊 Found {episode_count} episode entities with embeddings")
        print()
        print("💡 Run without --dry-run to create matches")
        return
    
    print(f"🚀 Creating semantic matches...")
    print(f"   Similarity threshold: {similarity_threshold}")
    print(f"   Max matches per conversation: {limit_per_conversation}")
    print()
    
    # Call the RPC function
    result = client.rpc(
        "create_semantic_matches",
        {
            "p_similarity_threshold": similarity_threshold,
            "p_limit_per_conversation": limit_per_conversation
        }
    ).execute()
    
    if result.data:
        total_matches = sum(row.get("matches_created", 0) for row in result.data)
        conversations_processed = len(result.data)
        
        print(f"✅ Complete:")
        print(f"   Conversations processed: {conversations_processed}")
        print(f"   Total matches created: {total_matches}")
        
        # Show sample matches
        if result.data:
            print("\n📋 Sample matches:")
            for row in result.data[:5]:
                if row.get("matches_created", 0) > 0:
                    print(f"   {row['conversation_id']}: {row['matches_created']} matches")
    else:
        print("⚠️  No matches created (check if conversations have synthesis embeddings)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create semantic matches between conversations and episodes")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be created without making changes")
    parser.add_argument("--threshold", type=float, default=0.75, help="Similarity threshold (0.0-1.0, default: 0.75)")
    parser.add_argument("--limit-per-conv", type=int, default=5, help="Maximum matches per conversation (default: 5)")
    
    args = parser.parse_args()
    
    create_semantic_matches(
        dry_run=args.dry_run,
        similarity_threshold=args.threshold,
        limit_per_conversation=args.limit_per_conv
    )
