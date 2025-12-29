#!/usr/bin/env python3
"""
Reverse Match — Find chat history evidence for user-provided insights/ideas.

Usage:
    python reverse_match.py "Your insight or idea here"
    python reverse_match.py --query "Your insight" --top-k 20 --min-similarity 0.7
"""

import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add engine directory to path
sys.path.insert(0, str(Path(__file__).parent))

from common.cursor_db import (
    get_conversations_for_range,
    get_workspace_mapping,
)
from common.semantic_search import search_messages
from common.config import load_config, load_env_file, get_workspaces


def format_timestamp(ts: int) -> str:
    """Format timestamp to readable date/time."""
    try:
        dt = datetime.fromtimestamp(ts / 1000)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, OSError):
        return str(ts)


def format_match(match: dict, match_idx: int) -> str:
    """Format a single match for display."""
    msg = match["message"]
    similarity = match["similarity"]
    context = match.get("context", {})
    
    lines = []
    lines.append(f"\n{'='*80}")
    lines.append(f"Match #{match_idx + 1} (Similarity: {similarity:.3f})")
    lines.append(f"{'='*80}\n")
    
    # Context before
    if context.get("before"):
        lines.append("--- Previous Messages ---")
        for prev_msg in context["before"]:
            role = "USER" if prev_msg.get("type") == "user" else "ASSISTANT"
            timestamp = format_timestamp(prev_msg.get("timestamp", 0))
            text = prev_msg.get("text", "")[:200]  # Truncate long messages
            if len(prev_msg.get("text", "")) > 200:
                text += "..."
            lines.append(f"[{role}] ({timestamp})")
            lines.append(text)
            lines.append("")
    
    # Matched message
    role = "USER" if msg.get("type") == "user" else "ASSISTANT"
    timestamp = format_timestamp(msg.get("timestamp", 0))
    text = msg.get("text", "")
    lines.append(f"--- MATCHED MESSAGE ({role}) ---")
    lines.append(f"Timestamp: {timestamp}")
    lines.append(f"Similarity: {similarity:.3f}")
    lines.append("")
    lines.append(text)
    lines.append("")
    
    # Context after
    if context.get("after"):
        lines.append("--- Following Messages ---")
        for next_msg in context["after"]:
            role = "USER" if next_msg.get("type") == "user" else "ASSISTANT"
            timestamp = format_timestamp(next_msg.get("timestamp", 0))
            text = next_msg.get("text", "")[:200]
            if len(next_msg.get("text", "")) > 200:
                text += "..."
            lines.append(f"[{role}] ({timestamp})")
            lines.append(text)
            lines.append("")
    
    return "\n".join(lines)


def reverse_match(
    query: str,
    days_back: int = 90,
    top_k: int = 10,
    min_similarity: float = 0.0,
    workspace_paths: list[str] | None = None,
) -> dict:
    """
    Find chat history matches for a user query.
    
    Args:
        query: User's insight/idea to search for
        days_back: How many days of history to search
        top_k: Maximum number of matches to return
        min_similarity: Minimum similarity threshold (0-1)
        workspace_paths: Optional list of workspace paths to filter by
    
    Returns:
        Dict with matches and metadata:
        {
            "query": "...",
            "matches": [...],
            "stats": {
                "totalMessages": 1234,
                "matchesFound": 10,
                "daysSearched": 90,
            },
        }
    """
    load_env_file()
    config = load_config()
    
    # MVP: Search ALL workspaces regardless of config (non-negotiable)
    # Always pass None to search all workspaces
    workspace_paths = None
    
    # Date range
    try:
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days_back)
    except Exception as e:
        error_msg = f"Failed to calculate date range: {e}"
        print(f"❌ Error: {error_msg}", file=sys.stderr)
        return {
            "query": query,
            "matches": [],
            "stats": {
                "totalMessages": 0,
                "matchesFound": 0,
                "daysSearched": days_back,
                "startDate": "",
                "endDate": "",
                "conversationsExamined": 0,
            },
            "error": error_msg,
        }
    
    # Calculate timestamp range for vector DB
    # Convert date objects to datetime for timestamp calculation
    start_datetime = datetime.combine(start_date, datetime.min.time()) if start_date else None
    end_datetime = datetime.combine(end_date + timedelta(days=1), datetime.min.time()) if end_date else None
    start_ts = int(start_datetime.timestamp() * 1000) if start_datetime else None
    end_ts = int(end_datetime.timestamp() * 1000) if end_datetime else None
    
    # Check if we should use vector DB (fast path)
    from common.vector_db import get_supabase_client
    use_vector_db_fast = get_supabase_client() is not None
    matches = []  # Initialize matches
    conversations = []  # Initialize conversations (only loaded if needed)
    
    if use_vector_db_fast:
        # Fast path: Skip SQLite entirely, use vector DB directly
        print(f"🚀 Using fast vector DB search (skipping SQLite load)...", file=sys.stderr)
        print(f"📅 Searching {days_back} days back: {start_date} to {end_date}", file=sys.stderr)
        print(f"🔍 Searching for matches (min similarity: {min_similarity})...", file=sys.stderr)
        # Fast path: Use vector DB directly without loading all messages
        print(f"🚀 Using fast vector DB search (skipping SQLite load)...", file=sys.stderr)
        print(f"🔍 Searching for matches (min similarity: {min_similarity})...", file=sys.stderr)
        
        try:
            from common.vector_db import search_messages_vector_db
            
            matches = search_messages_vector_db(
                query=query,
                start_timestamp=start_ts,
                end_timestamp=end_ts,
                workspace_paths=workspace_paths,
                top_k=top_k,
                min_similarity=min_similarity,
            )
            
            # Vector DB results already have workspace/chat info, just add empty context
            for match in matches:
                match["context"] = {"before": [], "after": []}
            
            print(f"✅ Found {len(matches)} matches via vector DB", file=sys.stderr)
            use_vector_db_fast = True  # Success
            
        except Exception as e:
            print(f"⚠️  Vector DB search failed: {e}", file=sys.stderr)
            print(f"   Falling back to SQLite search...", file=sys.stderr)
            use_vector_db_fast = False
            matches = []  # Reset matches
    
    if not use_vector_db_fast:
        # Slow path: Load all messages from SQLite (fallback)
        print(f"📚 Loading conversations from {start_date} to {end_date}...", file=sys.stderr)
        print(f"📅 Today is: {datetime.now().date()}", file=sys.stderr)
        print(f"📅 Searching {days_back} days back: {start_date} to {end_date}", file=sys.stderr)
        print(f"🔍 Searching ALL workspaces (MVP requirement)", file=sys.stderr)
        
        # MVP: Always search ALL workspaces (non-negotiable)
        conversations = get_conversations_for_range(
            start_date,
            end_date,
            workspace_paths=None,  # Always None to search all workspaces
        )
        
        print(f"📊 Found {len(conversations)} conversations in date range", file=sys.stderr)
        print(f"📝 Loading messages from SQLite...", file=sys.stderr)
        
        # Flatten all messages with conversation context
        all_messages = []
        for convo in conversations:
            workspace = convo.get("workspace", "Unknown")
            chat_id = convo.get("chat_id", "unknown")
            chat_type = convo.get("chat_type", "unknown")
            messages = convo.get("messages", [])
            print(f"  • {workspace} [{chat_type}] - {len(messages)} messages", file=sys.stderr)
            for msg in messages:
                # Add conversation context to message
                msg_with_context = msg.copy()
                msg_with_context["workspace"] = workspace
                msg_with_context["chat_id"] = chat_id
                msg_with_context["chat_type"] = chat_type
                all_messages.append(msg_with_context)
        
        print(f"📝 Found {len(all_messages)} total messages to search...", file=sys.stderr)
        
        if not all_messages:
            return {
                "query": query,
                "matches": [],
                "stats": {
                    "totalMessages": 0,
                    "matchesFound": 0,
                    "daysSearched": days_back,
                    "startDate": start_date.isoformat(),
                    "endDate": end_date.isoformat(),
                    "conversationsExamined": len(conversations),
                },
            }
        
        # Search for matches
        print(f"🔍 Searching for matches (min similarity: {min_similarity})...", file=sys.stderr)
        try:
            matches = search_messages(
                query,
                all_messages,
                top_k=top_k,
                min_similarity=min_similarity,
                context_messages=2,
                use_vector_db=False,  # Already tried vector DB, use fallback
                start_timestamp=start_ts,
                end_timestamp=end_ts,
                workspace_paths=workspace_paths,
            )
        except Exception as e:
            # Handle errors
            error_msg = str(e)
            import traceback
            print(f"❌ Error: {error_msg}", file=sys.stderr)
            print(f"   Traceback: {traceback.format_exc()}", file=sys.stderr)
            return {
                "query": query,
                "matches": [],
                "stats": {
                    "totalMessages": len(all_messages) if 'all_messages' in locals() else 0,
                    "matchesFound": 0,
                    "daysSearched": days_back,
                    "startDate": start_date.isoformat(),
                    "endDate": end_date.isoformat(),
                    "conversationsExamined": len(conversations),
                },
                "error": error_msg,
            }
    
    # Calculate total messages count for stats
    if use_vector_db_fast:
        # For vector DB, we don't have exact count without querying
        # Use a placeholder or query count from vector DB if needed
        # For now, use 0 or estimate - the important thing is matchesFound
        total_messages = 0  # Vector DB doesn't require loading all messages for count
    else:
        total_messages = len(all_messages) if 'all_messages' in locals() else 0
    
    print(f"✅ Found {len(matches)} matches", file=sys.stderr)
    
    return {
        "query": query,
        "matches": matches,
        "stats": {
            "totalMessages": total_messages,
            "matchesFound": len(matches),
            "daysSearched": days_back,
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "conversationsExamined": len(conversations) if conversations else 0,
        },
    }


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Find chat history evidence for user-provided insights/ideas"
    )
    parser.add_argument(
        "query",
        nargs="?",
        help="Your insight or idea to search for",
    )
    parser.add_argument(
        "--query",
        dest="query_flag",
        help="Your insight or idea to search for (alternative to positional arg)",
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
        help="Maximum number of matches to return (default: 10)",
    )
    parser.add_argument(
        "--min-similarity",
        type=float,
        default=0.0,
        help="Minimum similarity score threshold 0-1 (default: 0.0)",
    )
    parser.add_argument(
        "--workspace",
        action="append",
        help="Workspace path to search (can be specified multiple times)",
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
    
    # Run search
    result = reverse_match(
        query=query,
        days_back=args.days,
        top_k=args.top_k,
        min_similarity=args.min_similarity,
        workspace_paths=args.workspace,
    )
    
    # Output
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"\n🔍 Reverse Match Results")
        print(f"Query: {result['query']}")
        print(f"Stats: {result['stats']['matchesFound']} matches from {result['stats']['totalMessages']} messages")
        print(f"Days searched: {result['stats']['daysSearched']}")
        
        if not result["matches"]:
            print("\n❌ No matches found. Try:")
            print("  - Lowering --min-similarity threshold")
            print("  - Increasing --days to search more history")
            print("  - Rewording your query")
        else:
            for i, match in enumerate(result["matches"]):
                print(format_match(match, i))
        
        print(f"\n{'='*80}\n")


if __name__ == "__main__":
    main()

