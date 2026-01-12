#!/usr/bin/env python3
"""
Seek (Use Case Mode) — Find and synthesize real-world examples from chat history.

Refactored to use unified synthesis pipeline (same as Generate):
1. Semantic search → Find relevant conversations
2. Fetch conversations → Get full context
3. LLM synthesis → Generate structured use cases
4. Save to file → Store output
5. Harmonize → Add to ItemsBank
6. Categories → Auto-group similar use cases
"""

import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal

# Add engine directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Progress markers for frontend streaming
from common.progress_markers import (
    start_run,
    end_run,
    emit_phase,
    emit_stat,
    emit_info,
    emit_error,
    emit_warning,
    emit_progress,
    emit_tokens,
)

from common.cursor_db import format_conversations_for_prompt
from common.semantic_search import search_messages
from common.config import (
    load_config,
    load_env_file,
    get_llm_config,
    get_compression_date_threshold,
)
from common.llm import create_llm, LLMProvider
from common.vector_db import get_supabase_client, get_conversations_by_chat_ids
from common.items_bank_supabase import ItemsBankSupabase as ItemsBank
from common.prompt_compression import estimate_tokens, compress_single_conversation
from generate import (
    load_synthesize_prompt,
    generate_content,
    save_output,
    harmonize_all_outputs,
    _parse_output,
    OUTPUT_DIRS,
)
import generate  # For module-level access if needed
from concurrent.futures import ThreadPoolExecutor, as_completed


def _get_relevant_conversations_for_query(
    query: str,
    days_back: int,
    top_k: int = 50,
    workspace_paths: list[str] | None = None,
) -> list[dict]:
    """
    Use semantic search to find conversations relevant to user's query.
    Similar to generate.py's _get_relevant_conversations - uses predefined queries + user query.
    """
    try:
        from common.vector_db import get_supabase_client, get_conversations_by_chat_ids
        from common.mode_settings import get_mode_setting
        
        # Calculate date range
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days_back)
        
        start_datetime = datetime.combine(start_date, datetime.min.time())
        end_datetime = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
        start_ts = int(start_datetime.timestamp() * 1000)
        end_ts = int(end_datetime.timestamp() * 1000)
        
        # Load predefined queries from mode settings (like Generate)
        theme_id = "seek"
        mode_id = "use_case"
        search_queries = get_mode_setting(theme_id, mode_id, "semanticSearchQueries", None)
        
        if not search_queries:
            # Fallback to defaults if not configured
            search_queries = [
                f"Examples of {query}",
                f"Similar projects to {query}",
                f"Related use cases for {query}",
            ]
        else:
            # Combine predefined queries with user query
            # Prepend user query to each predefined query for context
            search_queries = [f"{q} related to: {query}" for q in search_queries]
        
        # Also add user's query directly as first search
        all_queries = [query] + search_queries
        
        print(f"🔍 Searching for conversations related to: '{query}'", file=sys.stderr)
        print(f"📅 Date range: {start_date} to {end_date}", file=sys.stderr)
        print(f"🔍 Using {len(all_queries)} search queries (1 user query + {len(search_queries)} predefined)", file=sys.stderr)
        
        # Collect unique chat_ids from all searches (PARALLELIZED like Generate)
        relevant_chat_ids: set[tuple[str, str, str]] = set()
        
        def search_query(search_query_text: str) -> list[dict]:
            """Helper to run a single search query."""
            return search_messages(
                search_query_text,
                messages=[],
                top_k=top_k,  # Use full top_k per query
                min_similarity=0.3,  # Lower threshold to cast wider net
                context_messages=0,
                use_vector_db=True,
                start_timestamp=start_ts,
                end_timestamp=end_ts,
                workspace_paths=workspace_paths,
            )
        
        # Run searches in parallel (much faster!)
        print(f"🔍 Running {len(all_queries)} semantic searches in parallel...", file=sys.stderr)
        with ThreadPoolExecutor(max_workers=min(len(all_queries), 5)) as executor:
            futures = {executor.submit(search_query, q): q for q in all_queries}
            for future in as_completed(futures):
                matches = future.result()
                # Collect chat_ids from matches
                for match in matches:
                    chat_id = match.get("chat_id", "unknown")
                    workspace = match.get("workspace", "Unknown")
                    chat_type = match.get("chat_type", "unknown")
                    relevant_chat_ids.add((workspace, chat_id, chat_type))
        
        if not relevant_chat_ids:
            print(f"⚠️  No conversations found matching queries", file=sys.stderr)
            return []
        
        if relevant_chat_ids:
            print(f"🔍 Found {len(relevant_chat_ids)} relevant conversations via semantic search", file=sys.stderr)
            print(f"📥 Fetching conversations by chat_ids...", file=sys.stderr)
            
            # Fetch full conversations
            conversations = get_conversations_by_chat_ids(
                list(relevant_chat_ids),
                start_date,
                end_date,
            )
            
            if conversations:
                print(f"✅ Using {len(conversations)} relevant conversations", file=sys.stderr)
                return conversations
        
        return []
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"⚠️  Semantic search failed: {e}", file=sys.stderr)
        print(f"   Full traceback:\n{error_details}", file=sys.stderr)
        raise RuntimeError(
            f"Failed to retrieve conversations: {e}\n"
            f"Traceback:\n{error_details}"
        ) from e


def seek_use_case(
    query: str,
    days_back: int = 90,
    top_k: int = 10,
    min_similarity: float = 0.0,
    workspace_paths: list[str] | None = None,
    llm: LLMProvider | None = None,
    temperature: float = 0.2,
    dry_run: bool = False,
) -> dict:
    """
    Find and synthesize use cases from chat history using unified synthesis pipeline.
    
    Args:
        query: User's query (what they want to build/find)
        days_back: How many days of history to search
        top_k: Maximum number of conversations to fetch
        min_similarity: Minimum similarity threshold (for filtering)
        workspace_paths: Optional workspace filter (None = all workspaces)
        llm: LLM provider (if None, creates from config)
        temperature: Sampling temperature
        dry_run: If True, don't generate or save
    
    Returns:
        Dict with synthesized use cases and metadata
    """
    load_env_file()
    
    # Start performance tracking
    start_run(mode="seek", item_count=top_k, days=days_back)
    
    try:
        # Emit request confirmation
        emit_phase("confirming", "Request parameters confirmed")
        emit_stat("query", query[:50] + "..." if len(query) > 50 else query)
        emit_stat("daysBack", days_back)
        emit_stat("topK", top_k)
        emit_stat("minSimilarity", min_similarity)
        
        # Always search all workspaces (MVP requirement)
        workspace_paths = None
        
        # Get LLM if not provided
        if llm is None:
            llm_config = get_llm_config()
            llm = create_llm(llm_config)
        
        print(f"🤖 LLM: {llm.provider} ({llm.model})", file=sys.stderr)
        
        # Step 1: Semantic search to find relevant conversations
        emit_phase("searching", f"Searching for conversations matching: {query[:30]}...")
        
        conversations = _get_relevant_conversations_for_query(
            query=query,
            days_back=days_back,
            top_k=top_k * 2,  # Fetch more conversations for better context
            workspace_paths=workspace_paths,
        )
        
        emit_stat("conversationsFound", len(conversations))
        emit_stat("daysSearched", days_back)
        
        if not conversations:
            emit_error("no_conversations", f"No relevant conversations found for query")
            end_run(success=False, error="No conversations found")
            return {
                "query": query,
                "content": None,
                "items": [],
                "stats": {
                    "conversationsAnalyzed": 0,
                    "daysSearched": days_back,
                    "useCasesFound": 0,
                },
                "error": f"No relevant conversations found for '{query}' in the last {days_back} days. The app uses semantic search to find chat sessions related to your query, but none matched. Try: (1) different keywords, (2) broader phrasing, or (3) a longer date range.",
            }
    
        # Step 2: Compress conversations if needed (same as generate.py)
        # OPTIMIZATION: Skip compression for small date ranges (configurable threshold)
        # Small date ranges typically have small prompts; compression adds cost/time without much benefit
        emit_phase("compressing", "Preparing conversations...")
        
        compressed_conversations = []
        compression_date_threshold = get_compression_date_threshold()
        skip_compression = days_back < compression_date_threshold
        
        if skip_compression:
            print(f"⏭️  Skipping compression (date range: {days_back} days < {compression_date_threshold} days threshold)", file=sys.stderr)
            emit_info(f"Skipping compression (date range < {compression_date_threshold} days)")
            compressed_conversations = conversations
        else:
            conversations_to_compress = []
            conversations_to_keep = []
            
            # First pass: estimate tokens and separate conversations
            for conv in conversations:
                conv_text = format_conversations_for_prompt([conv])
                conv_tokens = estimate_tokens(conv_text)
                if conv_tokens > 800:  # Threshold for compression
                    conversations_to_compress.append((conv, conv_tokens))
                else:
                    conversations_to_keep.append((conv, conv_tokens))
            
            if conversations_to_compress:
                print(f"📦 Compressing {len(conversations_to_compress)} large conversations...", file=sys.stderr)
                emit_info(f"Compressing {len(conversations_to_compress)} large conversations")
                emit_stat("conversationsToCompress", len(conversations_to_compress))
                
                compressed_count = 0
                with ThreadPoolExecutor(max_workers=min(len(conversations_to_compress), 5)) as executor:
                    futures = {
                        executor.submit(compress_single_conversation, conv_data[0], llm=llm, max_tokens=500): conv_data
                        for conv_data in conversations_to_compress
                    }
                    for future in as_completed(futures):
                        compressed_conv = future.result()
                        compressed_conversations.append(compressed_conv)
                        compressed_count += 1
                        emit_progress(compressed_count, len(conversations_to_compress), "compressed")
            
            # Add conversations that didn't need compression
            for conv, _ in conversations_to_keep:
                compressed_conversations.append(conv)
    
        conversations_text = format_conversations_for_prompt(compressed_conversations)
        
        if dry_run:
            end_run(success=True)
            return {
                "query": query,
                "content": None,
                "items": [],
                "stats": {
                    "conversationsAnalyzed": len(conversations),
                    "daysSearched": days_back,
                    "useCasesFound": 0,
                },
            }
        
        # Step 3: Generate use cases using LLM synthesis
        emit_phase("generating", f"Synthesizing use cases from {len(conversations)} conversations...")
        print(f"🧠 Synthesizing use cases from {len(conversations)} conversations...", file=sys.stderr)
        
        # Generate content using unified pipeline
        mode = "use_case"  # Special mode for use cases
        
        # Build user prompt with query (prepend to conversations)
        user_query_section = f"User Query: {query}\n\n"
        conversations_with_query = user_query_section + conversations_text
        
        # Estimate input tokens for cost tracking
        from common.llm import estimate_tokens as estimate_llm_tokens
        input_tokens = estimate_llm_tokens(conversations_with_query)
        
        # Generate content using unified pipeline
        content = generate_content(
            conversations_with_query,
            mode,
            llm=llm,
            temperature=temperature,
        )
        
        # Track token usage
        if content:
            output_tokens = estimate_llm_tokens(content)
            emit_tokens(
                tokens_in=input_tokens,
                tokens_out=output_tokens,
                model=llm.model,
                operation="seek_synthesis"
            )
    
        # Step 4: Parse items from content
        emit_phase("parsing", "Extracting use cases from synthesis...")
        
        items = []
        if content:
            # Parse use cases from content - matches prompt output format:
            # ## Item N: Title
            # **Job-to-be-Done:** ...
            # **How It Was Done:** ...
            # **Takeaway:** ...
            # **Tags:** ...
            import re
            
            # Match both "## Item N:" and legacy "## Use Case N:" formats
            item_pattern = r'^## (?:Item|Use Case) \d+:\s*(.+?)(?=^## (?:Item|Use Case) \d+:|\Z|^---\s*$)'
            
            for match in re.finditer(item_pattern, content, re.MULTILINE | re.DOTALL):
                item = {}
                item["title"] = match.group(1).strip().split('\n')[0]
                
                item_content = match.group(0)
                
                # Match prompt output fields (Job-to-be-Done, How It Was Done, Takeaway)
                # Also support legacy fields (What, How, Context, Key Takeaways)
                patterns = {
                    "what": r'\*\*(?:Job-to-be-Done|What):?\*\*[:\s]*(.+?)(?=\*\*|$)',
                    "how": r'\*\*(?:How It Was Done|How):?\*\*[:\s]*(.+?)(?=\*\*|$)',
                    "takeaways": r'\*\*(?:Takeaway|Key Takeaways?):?\*\*[:\s]*(.+?)(?=\*\*|$)',
                    "context": r'\*\*Context:?\*\*[:\s]*(.+?)(?=\*\*|$)',
                    "similarity": r'\*\*Similarity:?\*\*[:\s]*(.+?)(?=\*\*|$)',
                }
                
                for key, pattern in patterns.items():
                    pattern_match = re.search(pattern, item_content, re.DOTALL | re.IGNORECASE)
                    if pattern_match:
                        item[key] = pattern_match.group(1).strip()
                
                # Extract tags if present
                tags_match = re.search(r'\*\*Tags:?\*\*[:\s]*(.+?)(?=\n\n|$)', item_content, re.IGNORECASE)
                if tags_match:
                    tag_text = tags_match.group(1).strip()
                    item["tags"] = [t.strip().strip(',').strip('[').strip(']') for t in tag_text.split(',') if t.strip()]
                
                if item.get("title"):
                    items.append(item)
    
        emit_stat("useCasesParsed", len(items))
        
        # Step 5: Save to file (using generate.py's save_output function)
        emit_phase("saving", "Saving results...")
        
        output_file = None
        if content:
            # Create a simple date for save_output (use today)
            today = datetime.now().date()
            output_file = save_output(
                content,
                today,
                mode,  # Will need to handle use_case in save_output
            )
            print(f"📄 Saved to: {output_file}", file=sys.stderr)
        
        # Step 6: Harmonize into ItemsBank (using batch operations for performance)
        emit_phase("integrating", "Adding use cases to Library...")
        
        items_added = 0
        items_merged = 0
        
        # Calculate source date range from conversations (Issue #25: Coverage tracking)
        source_start_date = None
        source_end_date = None
        if conversations:
            conversation_dates = []
            for conv in conversations:
                if conv.get("messages"):
                    for msg in conv["messages"]:
                        ts = msg.get("timestamp", 0)
                        if ts:
                            msg_date = datetime.fromtimestamp(ts / 1000).date()
                            conversation_dates.append(msg_date)
            
            if conversation_dates:
                source_start_date = str(min(conversation_dates))
                source_end_date = str(max(conversation_dates))
                print(f"📅 Source date range: {source_start_date} to {source_end_date}", file=sys.stderr)
        
        # Issue #27: Wrap harmonization in try/finally to ensure complete marker is always emitted
        try:
            if content and items:
                print(f"\n📦 Harmonizing use cases into ItemsBank...", file=sys.stderr)
                bank = ItemsBank()
                
                # Issue #24: Refactor to use batch_add_items for 5-10x performance boost
                # Prepare items for batch operation
                from common.semantic_search import batch_get_embeddings
                
                prepared_items = []
                for item in items:
                    title = item.get("title", "")
                    
                    # Build description from available fields (unified structure)
                    description_parts = []
                    if item.get("what"):
                        description_parts.append(f"**Job-to-be-Done:** {item['what']}")
                    if item.get("how"):
                        description_parts.append(f"**How:** {item['how']}")
                    if item.get("takeaways"):
                        description_parts.append(f"**Takeaway:** {item['takeaways']}")
                    if item.get("context"):
                        description_parts.append(f"**Context:** {item['context']}")
                    
                    description = "\n\n".join(description_parts) if description_parts else title
                    tags = item.get("tags", [])
                    
                    # Date format: use today's date for first_seen_date
                    first_seen_date = datetime.now().strftime("%Y-%m-%d")
                    
                    prepared_items.append({
                        "title": title,
                        "description": description,
                        "tags": tags,
                        "first_seen_date": first_seen_date,
                        # embedding will be generated by batch_add_items
                    })
                
                if prepared_items:
                    # Batch generate embeddings (10x faster than individual calls)
                    print(f"   ⚡ Batch generating {len(prepared_items)} embeddings...", file=sys.stderr)
                    texts = [f"{p['title']} {p['description']}" for p in prepared_items]
                    embeddings = batch_get_embeddings(texts)
                    
                    # Add embeddings to prepared items
                    for i, item in enumerate(prepared_items):
                        item["embedding"] = embeddings[i]
                    
                    # Batch add items with parallel deduplication
                    print(f"   ⚡ Batch adding {len(prepared_items)} items with parallel deduplication...", file=sys.stderr)
                    result = bank.batch_add_items(
                        items=prepared_items,
                        item_type="use_case",
                        source_start_date=source_start_date,
                        source_end_date=source_end_date,
                        threshold=0.85,  # Default deduplication threshold
                        max_workers=5,
                    )
                    
                    items_added = result.get("added", 0)
                    items_merged = result.get("updated", 0)  # Duplicates
                    
                    print(f"📊 Harmonized {items_added} new use case(s) + {items_merged} duplicate(s) into Library", file=sys.stderr)
                else:
                    print(f"⚠️  No items to harmonize", file=sys.stderr)
                
                # NOTE: Category grouping removed - redundant with Theme Explorer and tags
                # Theme Explorer provides dynamic similarity-based grouping
                # Tags provide user-managed organization
        except Exception as e:
            # Issue #27: Catch harmonization errors to prevent frontend hang
            print(f"⚠️  Harmonization failed: {e}", file=sys.stderr)
            emit_error("harmonization_failed", f"Failed to add use cases: {str(e)[:200]}")
            items_added = 0
            items_merged = 0
        finally:
            # Issue #27: Always emit completion marker (critical for frontend)
            emit_phase("complete", "Seek complete!")
            emit_stat("useCasesAdded", items_added)
            emit_stat("useCasesMerged", items_merged)
        
        # End performance tracking
        perf_summary = end_run(success=True)
        if perf_summary:
            print(f"\n⏱️  Performance: {perf_summary.get('total_elapsed_seconds', 0):.1f}s total, ${perf_summary.get('total_cost_usd', 0):.4f} cost", file=sys.stderr)
        
        return {
            "query": query,
            "content": content,
            "items": items,
            "stats": {
                "conversationsAnalyzed": len(conversations),
                "daysSearched": days_back,
                "useCasesFound": len(items),
            },
            "outputFile": str(output_file) if output_file else None,
        }
    
    except Exception as e:
        # End performance tracking (error path)
        error_msg = str(e)
        emit_error("seek_error", f"Seek failed: {error_msg}")
        end_run(success=False, error=error_msg)
        print(f"\n❌ Error: {error_msg}", file=sys.stderr)
        raise  # Re-raise to let caller handle


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Find and synthesize use cases from chat history"
    )
    parser.add_argument(
        "query",
        nargs="?",
        help="Your query (what you want to build or find)",
    )
    parser.add_argument(
        "--query",
        dest="query_flag",
        help="Your query (alternative to positional arg)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=90,
        help="How many days of history to search (default: 90)",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=10,
        help="Maximum number of use cases to return (default: 10)",
    )
    parser.add_argument(
        "--min-similarity",
        type=float,
        default=0.0,
        help="Minimum similarity threshold 0-1 (default: 0.0)",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.2,
        help="LLM temperature (default: 0.2)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Find conversations but don't generate",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output JSON instead of formatted text",
    )
    
    args = parser.parse_args()
    
    # Get query from positional arg or flag
    query = args.query or args.query_flag
    if not query:
        parser.error("Query is required. Provide as positional argument or --query")
    
    # Run seek
    result = seek_use_case(
        query=query,
        days_back=args.days,
        top_k=args.top_k,
        min_similarity=args.min_similarity,
        temperature=args.temperature,
        dry_run=args.dry_run,
    )
    
    # Output
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if result.get("error"):
            print(f"\n❌ Error: {result['error']}")
        elif result.get("content"):
            print(f"\n✅ Found {result['stats']['useCasesFound']} use case(s)")
            print(f"\n{result['content']}")
        else:
            print(f"\n⚠️  No use cases found")
            print(f"   Conversations analyzed: {result['stats']['conversationsAnalyzed']}")
            print(f"   Days searched: {result['stats']['daysSearched']}")


if __name__ == "__main__":
    main()
