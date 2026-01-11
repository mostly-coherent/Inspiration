"""
Topic Filter — Pre-generation topic check (IMP-17/H-6)

Checks if conversation topics are already covered in the Library before generation.
For covered topics: Skip generation but expand date ranges (keeps coverage accurate).
For uncovered topics: Include in generation.

This reduces LLM generation costs while maintaining truthful coverage %.
"""

import sys
from dataclasses import dataclass
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from .semantic_search import batch_get_embeddings, is_openai_configured
from .vector_db import get_supabase_client


@dataclass
class TopicFilterResult:
    """Result of pre-filtering conversations for covered topics."""
    conversations_to_generate: list[dict]
    covered_count: int
    uncovered_count: int
    items_updated: int
    conversations_skipped: list[dict]  # For debugging/logging


# Similarity threshold for considering a topic "covered"
# Lower than dedup threshold (0.85) to catch more conceptual overlaps
COVERAGE_THRESHOLD = 0.75


def filter_covered_topics(
    conversations: list[dict],
    item_type: str,
    source_start_date: Optional[str] = None,
    source_end_date: Optional[str] = None,
    threshold: float = COVERAGE_THRESHOLD,
    max_workers: int = 5,
    verbose: bool = False,
) -> TopicFilterResult:
    """
    Filter out conversations whose topics are already covered in the Library.
    
    For each conversation:
    1. Generate embedding of conversation content
    2. Search Library for similar items
    3. If similar item exists: Skip conversation, expand item's date range
    4. If no similar item: Include conversation for generation
    
    Args:
        conversations: List of conversation dicts from cursor_db
        item_type: Type of items to check against ("idea", "insight")
        source_start_date: Start date for coverage tracking (YYYY-MM-DD)
        source_end_date: End date for coverage tracking (YYYY-MM-DD)
        threshold: Similarity threshold for considering topic "covered"
        max_workers: Number of parallel workers for similarity search
        verbose: Print debug info
    
    Returns:
        TopicFilterResult with filtered conversations and stats
    """
    if not conversations:
        return TopicFilterResult(
            conversations_to_generate=[],
            covered_count=0,
            uncovered_count=0,
            items_updated=0,
            conversations_skipped=[],
        )
    
    if not is_openai_configured():
        # Can't do similarity check without embeddings
        if verbose:
            print("   ⚠️  OpenAI not configured - skipping topic filter", file=sys.stderr)
        return TopicFilterResult(
            conversations_to_generate=conversations,
            covered_count=0,
            uncovered_count=len(conversations),
            items_updated=0,
            conversations_skipped=[],
        )
    
    print(f"   🔍 Pre-filtering {len(conversations)} conversations for covered topics...", file=sys.stderr)
    
    # Step 1: Extract text and generate embeddings for all conversations
    conversation_texts = []
    for conv in conversations:
        # Combine all messages into one text for embedding
        messages = conv.get("messages", [])
        text_parts = []
        for msg in messages:
            text_parts.append(msg.get("text", ""))
        
        # Truncate to ~2000 chars for embedding (enough to capture topic)
        full_text = " ".join(text_parts)
        truncated = full_text[:2000] if len(full_text) > 2000 else full_text
        conversation_texts.append(truncated)
    
    # Batch generate embeddings (single API call)
    print(f"   ⚡ Generating {len(conversation_texts)} conversation embeddings...", file=sys.stderr)
    embeddings = batch_get_embeddings(conversation_texts)
    
    # Step 2: Check library for similar items (parallel)
    client = get_supabase_client()
    if not client:
        if verbose:
            print("   ⚠️  Supabase not configured - skipping topic filter", file=sys.stderr)
        return TopicFilterResult(
            conversations_to_generate=conversations,
            covered_count=0,
            uncovered_count=len(conversations),
            items_updated=0,
            conversations_skipped=[],
        )
    
    print(f"   🔎 Checking library for covered topics (workers={max_workers})...", file=sys.stderr)
    
    # Search for similar items in parallel
    matches = _batch_find_similar_items(
        client=client,
        embeddings=embeddings,
        item_type=item_type,
        threshold=threshold,
        max_workers=max_workers,
    )
    
    # Step 3: Separate covered vs uncovered conversations
    conversations_to_generate = []
    conversations_skipped = []
    items_to_update = []  # (item_id, start_date, end_date)
    
    for i, conv in enumerate(conversations):
        match_id = matches[i]
        if match_id:
            # Topic is covered - skip generation but track for date expansion
            conversations_skipped.append(conv)
            items_to_update.append((match_id, source_start_date, source_end_date))
        else:
            # Topic not covered - include for generation
            conversations_to_generate.append(conv)
    
    # Step 4: Expand date ranges for covered topics (parallel)
    items_updated = 0
    if items_to_update and (source_start_date or source_end_date):
        print(f"   📅 Expanding date ranges for {len(items_to_update)} covered topics...", file=sys.stderr)
        items_updated = _batch_expand_date_ranges(
            client=client,
            updates=items_to_update,
            max_workers=max_workers,
        )
    
    # Log results
    covered = len(conversations_skipped)
    uncovered = len(conversations_to_generate)
    if covered > 0:
        print(f"   ✅ Topic filter: {uncovered} to generate, {covered} already covered (date ranges expanded)", file=sys.stderr)
    else:
        print(f"   ℹ️  Topic filter: All {uncovered} conversations have new topics", file=sys.stderr)
    
    return TopicFilterResult(
        conversations_to_generate=conversations_to_generate,
        covered_count=covered,
        uncovered_count=uncovered,
        items_updated=items_updated,
        conversations_skipped=conversations_skipped,
    )


def _batch_find_similar_items(
    client,
    embeddings: list[list[float]],
    item_type: str,
    threshold: float,
    max_workers: int,
) -> list[Optional[str]]:
    """
    Find similar library items for multiple embeddings in parallel.
    
    Returns:
        List of item IDs (or None) for each embedding.
    """
    results = [None] * len(embeddings)
    
    def search_one(idx: int, embedding: list[float]) -> tuple[int, Optional[str]]:
        """Search for similar item for one embedding."""
        if not embedding or all(v == 0.0 for v in embedding[:10]):
            return (idx, None)
        
        try:
            result = client.rpc(
                "search_similar_library_items",
                {
                    "query_embedding": embedding,
                    "match_threshold": threshold,
                    "match_count": 1,
                    "filter_item_type": item_type,
                }
            ).execute()
            
            if result.data and len(result.data) > 0:
                return (idx, result.data[0]["id"])
        except Exception as e:
            # RPC not available - skip filtering
            if "function search_similar_library_items" not in str(e):
                print(f"   ⚠️  Library search error: {e}", file=sys.stderr)
        
        return (idx, None)
    
    # Run searches in parallel
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(search_one, i, emb)
            for i, emb in enumerate(embeddings)
        ]
        
        for future in as_completed(futures):
            idx, match_id = future.result()
            results[idx] = match_id
    
    return results


def _batch_expand_date_ranges(
    client,
    updates: list[tuple[str, Optional[str], Optional[str]]],
    max_workers: int,
) -> int:
    """
    Expand date ranges for multiple items in parallel.
    
    CRITICAL: Also increments occurrence and updates last_seen to preserve
    the occurrence signal for Theme Explorer. When a topic is "skipped" because
    it's already covered, the matching item should still count the occurrence.
    
    Args:
        updates: List of (item_id, source_start_date, source_end_date) tuples
    
    Returns:
        Number of items successfully updated.
    """
    from datetime import datetime
    
    updated_count = 0
    
    def update_one(item_id: str, start_date: Optional[str], end_date: Optional[str]) -> bool:
        """Update date range, occurrence, and last_seen for one item."""
        try:
            # Fetch current item
            result = client.table("library_items").select(
                "source_start_date, source_end_date, occurrence"
            ).eq("id", item_id).single().execute()
            
            if not result.data:
                return False
            
            current = result.data
            update_data = {
                # ALWAYS increment occurrence (this is a topic match, counts as validation)
                "occurrence": (current.get("occurrence") or 0) + 1,
                # ALWAYS update last_seen (topic was seen again)
                "last_seen": datetime.now().strftime("%Y-%m"),
                "last_seen_date": datetime.now().strftime("%Y-%m-%d"),  # Day-level precision
            }
            
            # Expand start date if new is earlier
            if start_date:
                existing_start = current.get("source_start_date")
                if not existing_start or start_date < existing_start:
                    update_data["source_start_date"] = start_date
            
            # Expand end date if new is later
            if end_date:
                existing_end = current.get("source_end_date")
                if not existing_end or end_date > existing_end:
                    update_data["source_end_date"] = end_date
            
            client.table("library_items").update(update_data).eq("id", item_id).execute()
            
            # Record in occurrence history table (if it exists)
            try:
                client.table("library_occurrence_history").insert({
                    "item_id": item_id,
                    "occurred_at": datetime.now().strftime("%Y-%m-%d"),
                    "source_type": "topic_filter",
                    "source_context": f"{start_date} to {end_date} run" if start_date else None,
                }).execute()
            except Exception:
                pass  # Table might not exist yet
            
            return True
        except Exception:
            return False
    
    # Run updates in parallel
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(update_one, item_id, start_date, end_date)
            for item_id, start_date, end_date in updates
        ]
        
        for future in as_completed(futures):
            if future.result():
                updated_count += 1
    
    return updated_count
