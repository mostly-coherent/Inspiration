#!/usr/bin/env python3
"""
Generate Synthesis Embeddings for Conversations

Generates synthesis text and embeddings for conversations in kg_conversations table.
This is a prerequisite for Phase 4: Semantic Concept Overlay.

Usage:
    python3 engine/scripts/generate_conversation_synthesis.py
    
    # Dry run (show what would be updated):
    python3 engine/scripts/generate_conversation_synthesis.py --dry-run
    
    # Limit to N conversations:
    python3 engine/scripts/generate_conversation_synthesis.py --limit 50
    
    # Regenerate all (even if synthesis exists):
    python3 engine/scripts/generate_conversation_synthesis.py --regenerate
"""

import argparse
import sys
import time
from pathlib import Path

# Add engine to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import load_env_file
from common.vector_db import get_supabase_client
from common.semantic_search import get_embedding

# Load environment variables
load_env_file()


def generate_synthesis_text_from_mentions(
    mentions: list[dict], 
    relations: list[dict] = None,
    entity_names: dict[str, str] = None
) -> str:
    """
    Generate synthesis text summarizing conversation intent from entity mentions and relations.
    
    Uses a simple approach:
    1. Collect unique context snippets from mentions
    2. Extract key entities mentioned (with their names)
    3. Build a summary from entities and their relationships
    
    This doesn't require full message content - works with what's already extracted.
    """
    if not mentions:
        return ""
    
    # Collect unique context snippets (avoid duplicates)
    snippets = []
    seen_snippets = set()
    for mention in mentions:
        snippet = mention.get("context_snippet", "").strip()
        if snippet and snippet not in seen_snippets:
            # Limit snippet length
            if len(snippet) > 300:
                snippet = snippet[:300] + "..."
            snippets.append(snippet)
            seen_snippets.add(snippet)
    
    # Get unique entity IDs and names
    entity_ids = set(mention.get("entity_id", "") for mention in mentions if mention.get("entity_id"))
    entity_names_list = []
    if entity_names:
        for entity_id in list(entity_ids)[:10]:  # Limit to top 10 entities
            name = entity_names.get(entity_id, "")
            if name:
                entity_names_list.append(name)
    
    # Build synthesis from snippets
    synthesis_parts = []
    
    # Add context snippets (up to 5 most relevant)
    synthesis_parts.extend(snippets[:5])
    
    # Add entity names if available
    if entity_names_list:
        synthesis_parts.append("Entities: " + ", ".join(entity_names_list[:10]))
    
    # Add relation types if we have relations
    if relations:
        relation_types = set()
        for rel in relations[:10]:  # Limit to 10 relations
            rel_type = rel.get("relation_type", "")
            if rel_type:
                relation_types.add(rel_type)
        
        if relation_types:
            synthesis_parts.append("Relations: " + ", ".join(list(relation_types)[:5]))
    
    synthesis = " ".join(synthesis_parts)
    
    # Limit to reasonable length (for embedding generation)
    if len(synthesis) > 2000:
        synthesis = synthesis[:2000]
    
    return synthesis.strip()


def get_conversations_without_synthesis(client, limit: int = None, regenerate: bool = False):
    """Fetch conversations that don't have synthesis embeddings yet."""
    query = client.table("kg_conversations").select("id, conversation_id, source_type")
    
    if not regenerate:
        query = query.or_("synthesis_text.is.null,synthesis_embedding.is.null")
    
    if limit:
        query = query.limit(limit)
    
    result = query.execute()
    return result.data or []


def get_conversation_data(client, conversation_id: str) -> tuple[list[dict], list[dict], dict[str, str]]:
    """
    Fetch conversation data from kg_entity_mentions and kg_relations.
    
    Returns:
        (mentions, relations, entity_names) - Lists of mentions and relations, plus entity ID -> name mapping
    """
    # Get mentions for this conversation
    mentions_result = client.table("kg_entity_mentions").select(
        "context_snippet, entity_id, message_timestamp"
    ).eq("message_id", conversation_id).execute()
    
    mentions = mentions_result.data or []
    
    # Get unique entity IDs
    entity_ids = list(set(mention.get("entity_id", "") for mention in mentions if mention.get("entity_id")))
    
    # Fetch entity names
    entity_names = {}
    if entity_ids:
        entities_result = client.table("kg_entities").select("id, canonical_name").in_("id", entity_ids).execute()
        if entities_result.data:
            entity_names = {e["id"]: e["canonical_name"] for e in entities_result.data}
    
    # Get relations where source or target is a conversation entity
    # Conversation entities have ID format: "conv-{conversation_id}"
    conv_entity_id = f"conv-{conversation_id}"
    
    relations_result = client.table("kg_relations").select(
        "source_entity_id, target_entity_id, relation_type, evidence_snippet"
    ).or_(f"source_entity_id.eq.{conv_entity_id},target_entity_id.eq.{conv_entity_id}").execute()
    
    relations = relations_result.data or []
    
    return mentions, relations, entity_names


def generate_synthesis_embeddings(dry_run: bool = False, limit: int = None, regenerate: bool = False, batch_size: int = 10):
    """
    Generate synthesis text and embeddings for conversations.
    
    Args:
        dry_run: If True, only show what would be updated
        limit: Maximum number of conversations to process
        regenerate: If True, regenerate even if synthesis exists
        batch_size: Number of conversations to process in parallel
    """
    client = get_supabase_client()
    
    conversations = get_conversations_without_synthesis(client, limit=limit, regenerate=regenerate)
    
    if not conversations:
        print("✅ All conversations already have synthesis embeddings.")
        return
    
    print(f"📊 Found {len(conversations)} conversations to process")
    
    if dry_run:
        print("\n🔍 DRY RUN - Would process:")
        for conv in conversations[:10]:
            print(f"  - {conv['conversation_id']} ({conv['source_type']})")
        if len(conversations) > 10:
            print(f"  ... and {len(conversations) - 10} more")
        return
    
    processed = 0
    errors = 0
    
    for i, conv in enumerate(conversations, 1):
        try:
            # Get conversation data (mentions, relations, and entity names)
            mentions, relations, entity_names = get_conversation_data(client, conv["conversation_id"])
            
            if not mentions:
                print(f"⚠️  Skipping {conv['conversation_id']}: No mentions found")
                continue
            
            # Generate synthesis text from mentions, relations, and entity names
            synthesis_text = generate_synthesis_text_from_mentions(mentions, relations, entity_names)
            
            if not synthesis_text:
                print(f"⚠️  Skipping {conv['conversation_id']}: Empty synthesis")
                continue
            
            # Generate embedding
            try:
                embedding = get_embedding(synthesis_text, use_cache=True, allow_fallback=False)
            except Exception as embed_error:
                print(f"⚠️  Failed to generate embedding for {conv['conversation_id']}: {embed_error}")
                continue
            
            # Update conversation with synthesis and embedding
            update_data = {
                "synthesis_text": synthesis_text,
                "synthesis_embedding": embedding,
            }
            
            try:
                result = client.table("kg_conversations").update(update_data).eq("id", conv["id"]).execute()
                if not result.data:
                    print(f"⚠️  Update returned no data for {conv['conversation_id']}")
                    continue
            except Exception as update_error:
                print(f"❌ Failed to update {conv['conversation_id']}: {update_error}")
                errors += 1
                continue
            
            processed += 1
            
            if i % 10 == 0:
                print(f"✅ Processed {i}/{len(conversations)} conversations...")
            elif i <= 3:
                print(f"✅ Processed {conv['conversation_id']}: {len(synthesis_text)} chars, embedding generated")
            
            # Rate limiting: small delay to avoid API limits
            time.sleep(0.1)
            
        except Exception as e:
            errors += 1
            print(f"❌ Error processing {conv['conversation_id']}: {e}")
            continue
    
    print(f"\n✅ Complete: {processed} processed, {errors} errors")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthesis embeddings for conversations")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be updated without making changes")
    parser.add_argument("--limit", type=int, help="Limit number of conversations to process")
    parser.add_argument("--regenerate", action="store_true", help="Regenerate even if synthesis exists")
    
    args = parser.parse_args()
    
    generate_synthesis_embeddings(
        dry_run=args.dry_run,
        limit=args.limit,
        regenerate=args.regenerate
    )
