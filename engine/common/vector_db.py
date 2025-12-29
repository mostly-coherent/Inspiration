"""
Vector Database — Supabase pgvector integration for efficient semantic search.

Pre-indexes all Cursor chat messages with embeddings for fast similarity search.
"""

import os
import json
from datetime import datetime, timedelta
from typing import Any, Optional
from pathlib import Path

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    Client = None

from .config import get_data_dir, load_env_file
from .semantic_search import get_embedding, EMBEDDING_DIM, get_openai_client


def get_supabase_client() -> Optional[Client]:
    """Get Supabase client, initializing if needed."""
    if not SUPABASE_AVAILABLE:
        return None
    
    load_env_file()
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_key:
        return None
    
    return create_client(supabase_url, supabase_key)


def get_sync_state_path() -> Path:
    """Get path to sync state file."""
    return get_data_dir() / "vector_db_sync_state.json"


def get_last_sync_timestamp() -> int:
    """Get last sync timestamp from state file."""
    state_path = get_sync_state_path()
    if not state_path.exists():
        return 0
    
    try:
        with open(state_path) as f:
            state = json.load(f)
            return state.get("last_sync_timestamp", 0)
    except (json.JSONDecodeError, IOError):
        return 0


def save_sync_state(last_timestamp: int, messages_indexed: int) -> None:
    """Save sync state to file."""
    state_path = get_sync_state_path()
    state = {
        "last_sync_timestamp": last_timestamp,
        "messages_indexed": messages_indexed,
        "last_sync_at": datetime.now().isoformat(),
    }
    
    state_path.parent.mkdir(parents=True, exist_ok=True)
    with open(state_path, "w") as f:
        json.dump(state, f, indent=2)


def create_vector_table_if_not_exists(client: Client) -> bool:
    """
    Create the cursor_messages table with pgvector extension if it doesn't exist.
    
    Returns:
        True if table exists or was created successfully
    """
    # Note: This requires running SQL directly via Supabase SQL editor or migration script
    # For now, we'll assume the table exists and return True
    # The actual table creation should be done via Supabase dashboard or migration script
    return True


def index_message(
    client: Client,
    message_id: str,
    text: str,
    timestamp: int,
    workspace: str,
    chat_id: str,
    chat_type: str,
    message_type: str,
    embedding: Optional[list[float]] = None,
) -> bool:
    """
    Index a single message in the vector database.
    
    Args:
        client: Supabase client
        message_id: Unique message identifier
        text: Message text
        timestamp: Message timestamp (milliseconds)
        workspace: Workspace path
        chat_id: Chat/conversation ID
        chat_type: Type of chat (composer/chat)
        message_type: Type of message (user/assistant)
        embedding: Pre-computed embedding (optional, will generate if not provided)
    
    Returns:
        True if indexed successfully
    """
    if not text.strip():
        return False
    
    # Generate embedding if not provided
    if embedding is None:
        try:
            embedding = get_embedding(text)
        except Exception:
            return False
    
    try:
        # Insert or update message in vector DB
        result = client.table("cursor_messages").upsert({
            "message_id": message_id,
            "text": text,
            "embedding": embedding,
            "timestamp": timestamp,
            "workspace": workspace,
            "chat_id": chat_id,
            "chat_type": chat_type,
            "message_type": message_type,
            "indexed_at": datetime.now().isoformat(),
        }).execute()
        
        return len(result.data) > 0
    except Exception:
        return False


def search_messages_vector_db(
    query: str,
    start_timestamp: Optional[int] = None,
    end_timestamp: Optional[int] = None,
    workspace_paths: Optional[list[str]] = None,
    top_k: int = 10,
    min_similarity: float = 0.0,
) -> list[dict]:
    """
    Search messages using vector similarity in Supabase.
    
    Args:
        query: Search query text
        start_timestamp: Start timestamp filter (milliseconds)
        end_timestamp: End timestamp filter (milliseconds)
        workspace_paths: Optional workspace filter
        top_k: Maximum number of results
        min_similarity: Minimum similarity threshold
    
    Returns:
        List of matching messages with similarity scores
    """
    client = get_supabase_client()
    if not client:
        return []
    
    # Get query embedding
    try:
        query_embedding = get_embedding(query)
    except Exception:
        return []
    
    # Use pgvector RPC function for optimized similarity search
    # This uses the HNSW index and runs on the database server (much faster)
    try:
        # Prepare parameters for RPC call
        rpc_params = {
            "query_embedding": query_embedding,
            "match_threshold": min_similarity,
            "match_count": top_k,
        }
        
        # Add optional filters
        if start_timestamp is not None:
            rpc_params["start_ts"] = start_timestamp
        if end_timestamp is not None:
            rpc_params["end_ts"] = end_timestamp
        if workspace_paths:
            rpc_params["workspace_filter"] = workspace_paths
        
        # Call RPC function
        result = client.rpc("search_cursor_messages", rpc_params).execute()
        
        # Transform results to match expected format
        matches = []
        for row in result.data:
            matches.append({
                "message": {
                    "text": row.get("text", ""),
                    "timestamp": row.get("timestamp", 0),
                    "type": row.get("message_type", "user"),
                },
                "similarity": float(row.get("similarity", 0.0)),
                "workspace": row.get("workspace", "Unknown"),
                "chat_id": row.get("chat_id", "unknown"),
                "chat_type": row.get("chat_type", "unknown"),
            })
        
        return matches
        
    except Exception as e:
        # Fallback to client-side search if RPC fails (for debugging)
        import sys
        error_msg = str(e)
        print(f"⚠️  RPC search failed, falling back to client-side search", file=sys.stderr)
        print(f"   Error: {error_msg}", file=sys.stderr)
        
        # Check if it's a missing function error
        if "function" in error_msg.lower() and ("does not exist" in error_msg.lower() or "PGRST202" in error_msg):
            print(f"\n💡 RPC function 'search_cursor_messages' doesn't exist!", file=sys.stderr)
            print(f"   To fix: Run the SQL from engine/scripts/init_vector_db.sql in Supabase SQL Editor", file=sys.stderr)
            print(f"   This will enable fast vector search (100x faster)", file=sys.stderr)
        
        # Build query for fallback
        query_builder = client.table("cursor_messages").select("*")
        
        # Apply timestamp filters
        if start_timestamp:
            query_builder = query_builder.gte("timestamp", start_timestamp)
        if end_timestamp:
            query_builder = query_builder.lt("timestamp", end_timestamp)
        
        # Apply workspace filter
        if workspace_paths:
            query_builder = query_builder.in_("workspace", workspace_paths)
        
        # Fetch messages (limited for fallback)
        result = query_builder.limit(1000).execute()
        messages = result.data if result.data else []
        
        # Compute similarity client-side (fallback only)
        matches = []
        for msg in messages:
            msg_embedding = msg.get("embedding", [])
            if not msg_embedding:
                continue
            
            # Calculate cosine similarity
            from .semantic_search import cosine_similarity
            similarity = cosine_similarity(query_embedding, msg_embedding)
            
            if similarity >= min_similarity:
                matches.append({
                    "message": {
                        "text": msg.get("text", ""),
                        "timestamp": msg.get("timestamp", 0),
                        "type": msg.get("message_type", "user"),
                    },
                    "similarity": similarity,
                    "workspace": msg.get("workspace", "Unknown"),
                    "chat_id": msg.get("chat_id", "unknown"),
                    "chat_type": msg.get("chat_type", "unknown"),
                })
        
        # Sort by similarity and return top_k
        matches.sort(key=lambda x: x["similarity"], reverse=True)
        return matches[:top_k]


def get_message_count(client: Optional[Client] = None) -> int:
    """Get total number of indexed messages."""
    if client is None:
        client = get_supabase_client()
    
    if not client:
        return 0
    
    try:
        result = client.table("cursor_messages").select("message_id", count="exact").execute()
        return result.count if hasattr(result, "count") else 0
    except Exception:
        return 0

