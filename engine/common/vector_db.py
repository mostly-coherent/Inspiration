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
    """Get last sync timestamp from state file.
    
    Returns:
        Last sync timestamp in milliseconds, or 0 if not found/corrupted.
        
    Side effects:
        - Logs warnings if sync state is corrupted or invalid
        - Attempts auto-recovery by checking Vector DB for latest timestamp
        - Auto-fixes corrupted sync state file if recovery succeeds
    """
    import sys
    
    state_path = get_sync_state_path()
    if not state_path.exists():
        return 0
    
    try:
        with open(state_path) as f:
            content = f.read()
            state = json.loads(content)
            timestamp = state.get("last_sync_timestamp", 0)
            
            # Validate timestamp is reasonable (not 0, not future, not too old)
            if timestamp > 0:
                sync_date = datetime.fromtimestamp(timestamp / 1000)
                now = datetime.now()
                
                # Warn if sync state is corrupted (timestamp exists but seems invalid)
                if sync_date > now:
                    print(f"⚠️  Warning: Sync state timestamp is in the future: {sync_date}", file=sys.stderr)
                elif (now - sync_date).days > 365:
                    print(f"⚠️  Warning: Sync state is very old ({sync_date.date()}), consider re-indexing", file=sys.stderr)
            
            return timestamp
    except json.JSONDecodeError as e:
        # Log the error so users can see what went wrong
        print(f"❌ ERROR: Sync state file is corrupted (invalid JSON): {state_path}", file=sys.stderr)
        print(f"   Error: {e}", file=sys.stderr)
        print(f"   Attempting to recover by checking Vector DB for latest timestamp...", file=sys.stderr)
        
        # Try to recover by checking Vector DB for latest timestamp
        try:
            client = get_supabase_client()
            if client:
                result = client.table("cursor_messages").select("timestamp").order("timestamp", desc=True).limit(1).execute()
                if result.data and len(result.data) > 0:
                    recovered_ts = result.data[0]["timestamp"]
                    recovered_date = datetime.fromtimestamp(recovered_ts / 1000).date()
                    print(f"   ✓ Recovered: Using latest Vector DB timestamp ({recovered_date})", file=sys.stderr)
                    # Optionally auto-fix the file
                    try:
                        save_sync_state(recovered_ts, 0)  # Reset with recovered timestamp
                        print(f"   ✓ Auto-fixed sync state file", file=sys.stderr)
                    except Exception:
                        pass  # Don't fail if we can't write
                    return recovered_ts
        except Exception:
            pass  # If recovery fails, fall through to return 0
        
        print(f"   ⚠️  Could not recover. Sync will treat this as first-time sync.", file=sys.stderr)
        return 0
    except IOError as e:
        print(f"⚠️  Warning: Could not read sync state file: {e}", file=sys.stderr)
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
    source: str = "cursor",
    source_detail: Optional[dict] = None,
) -> bool:
    """
    Index a single message in the vector database.

    Args:
        client: Supabase client
        message_id: Unique message identifier (hash of workspace:chat_id:timestamp:text[:50])
        text: Message text
        timestamp: Message timestamp in milliseconds (when the chat actually occurred)
        workspace: Workspace path
        chat_id: Chat/conversation ID
        chat_type: Type of chat (composer/chat)
        message_type: Type of message (user/assistant)
        embedding: Pre-computed embedding (optional, will generate if not provided)
        source: Message source ("cursor" or "claude_code")
        source_detail: Optional source-specific metadata (JSONB)

    Returns:
        True if indexed successfully

    Note:
        - `timestamp`: When the chat message actually occurred (from source DB)
        - `indexed_at`: When this message was indexed into the Vector DB (set here)
        - `created_at`: When the DB row was created (auto-set by PostgreSQL)
        - `updated_at`: When the DB row was last updated (auto-set by trigger)
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
        # timestamp = chat message timestamp (when chat occurred)
        # indexed_at = when we indexed it (now)
        result = client.table("cursor_messages").upsert({
            "message_id": message_id,
            "text": text,
            "embedding": embedding,
            "timestamp": timestamp,  # Chat timestamp (when message was sent/received)
            "workspace": workspace,
            "chat_id": chat_id,
            "chat_type": chat_type,
            "message_type": message_type,
            "source": source,
            "source_detail": source_detail,
            "indexed_at": datetime.now().isoformat(),  # DB entry timestamp (when indexed)
        }).execute()

        return len(result.data) > 0
    except Exception:
        return False


def index_messages_batch(
    client: Client,
    messages: list[dict],
) -> tuple[int, int]:
    """
    Index multiple messages in a single batch operation (much faster than individual inserts).

    Args:
        client: Supabase client
        messages: List of message dicts, each containing:
            - message_id: str
            - text: str
            - timestamp: int (chat timestamp)
            - workspace: str
            - chat_id: str
            - chat_type: str
            - message_type: str
            - embedding: list[float]
            - source: str (optional, defaults to "cursor")
            - source_detail: dict (optional, source-specific metadata)

    Returns:
        Tuple of (successful_count, failed_count)

    Note:
        - Uses bulk upsert for better performance (10-50x faster than individual inserts)
        - `timestamp`: When the chat message actually occurred (from source DB)
        - `indexed_at`: When messages were indexed (set to now for all)
    """
    if not messages:
        return 0, 0
    
    indexed_at = datetime.now().isoformat()
    
    # Prepare batch data, deduplicating by message_id (PostgreSQL batch upsert can't handle duplicates within batch)
    batch_data = []
    seen_ids = set()
    for msg in messages:
        if not msg.get("text", "").strip():
            continue
        
        msg_id = msg["message_id"]
        if msg_id in seen_ids:
            continue  # Skip duplicate message_id within batch
        seen_ids.add(msg_id)
        
        batch_data.append({
            "message_id": msg_id,
            "text": msg["text"],
            "embedding": msg.get("embedding"),
            "timestamp": msg["timestamp"],  # Chat timestamp (when message occurred)
            "workspace": msg["workspace"],
            "chat_id": msg["chat_id"],
            "chat_type": msg["chat_type"],
            "message_type": msg["message_type"],
            "source": msg.get("source", "cursor"),
            "source_detail": msg.get("source_detail"),
            "indexed_at": indexed_at,  # DB entry timestamp (when indexed)
        })
    
    if not batch_data:
        return 0, 0
    
    try:
        # Bulk upsert (Supabase handles this efficiently)
        result = client.table("cursor_messages").upsert(batch_data).execute()
        successful = len(result.data) if result.data else 0
        failed = len(batch_data) - successful
        return successful, failed
    except Exception as e:
        import sys
        print(f"⚠️  Batch insert failed: {e}", file=sys.stderr)
        return 0, len(batch_data)


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
        
        # Build count query first (separate from data query)
        count_query = client.table("cursor_messages").select("id", count="exact")
        if start_timestamp:
            count_query = count_query.gte("timestamp", start_timestamp)
        if end_timestamp:
            count_query = count_query.lt("timestamp", end_timestamp)
        if workspace_paths:
            count_query = count_query.in_("workspace", workspace_paths)
        
        count_result = count_query.execute()
        total_messages = count_result.count if hasattr(count_result, 'count') else 0
        print(f"⚠️  Fallback: Found {total_messages} messages in date range", file=sys.stderr)
        
        # Build data query (separate builder)
        data_query = client.table("cursor_messages").select("*")
        if start_timestamp:
            data_query = data_query.gte("timestamp", start_timestamp)
        if end_timestamp:
            data_query = data_query.lt("timestamp", end_timestamp)
        if workspace_paths:
            data_query = data_query.in_("workspace", workspace_paths)
        
        # Fetch messages (limit for fallback performance)
        result = data_query.limit(5000).execute()
        messages = result.data if result.data else []
        
        # Check how many have embeddings
        msgs_with_emb = [m for m in messages if m.get("embedding")]
        print(f"⚠️  Fallback: {len(msgs_with_emb)} of {len(messages)} messages have embeddings", file=sys.stderr)
        
        if total_messages > 5000:
            print(f"⚠️  Warning: Only checking first 5000 of {total_messages} messages (fallback limit)", file=sys.stderr)
            print(f"   Consider fixing RPC function for better performance", file=sys.stderr)
        
        # Compute similarity client-side (fallback only)
        matches = []
        messages_with_embeddings = 0
        import json
        for msg in messages:
            msg_embedding = msg.get("embedding", [])
            if not msg_embedding:
                continue
            
            # Parse embedding if it's a string (pgvector returns JSON string)
            if isinstance(msg_embedding, str):
                try:
                    msg_embedding = json.loads(msg_embedding)
                except json.JSONDecodeError:
                    continue
            
            messages_with_embeddings += 1
            
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
        result_matches = matches[:top_k]
        
        if result_matches:
            print(f"⚠️  Fallback: Found {len(result_matches)} matches (top similarity: {result_matches[0]['similarity']:.3f})", file=sys.stderr)
        else:
            print(f"⚠️  Fallback: No matches found (checked {messages_with_embeddings} messages with embeddings)", file=sys.stderr)
            if messages_with_embeddings == 0:
                print(f"   ⚠️  No embeddings found! You may need to sync your brain to create embeddings.", file=sys.stderr)
            elif min_similarity > 0:
                print(f"   💡 Try lowering min_similarity threshold (currently {min_similarity})", file=sys.stderr)
        
        return result_matches


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


def get_existing_message_ids(message_ids: list[str], client: Optional[Client] = None) -> set[str]:
    """
    Check which message IDs already exist in the vector database.
    
    Args:
        message_ids: List of message IDs to check
        client: Optional Supabase client (will create if not provided)
    
    Returns:
        Set of message IDs that already exist
    """
    if client is None:
        client = get_supabase_client()
    
    if not client or not message_ids:
        return set()
    
    try:
        # Query in chunks to avoid URL length limits (Supabase has limits on query size)
        existing_ids = set()
        chunk_size = 1000  # Process in chunks of 1000
        
        for i in range(0, len(message_ids), chunk_size):
            chunk = message_ids[i:i + chunk_size]
            result = client.table("cursor_messages")\
                .select("message_id")\
                .in_("message_id", chunk)\
                .execute()
            
            if result.data:
                existing_ids.update(msg.get("message_id") for msg in result.data if msg.get("message_id"))
        
        return existing_ids
    except Exception as e:
        # If check fails, return empty set (will process all messages)
        import sys
        print(f"⚠️  Warning: Could not check existing messages: {e}", file=sys.stderr)
        return set()


def get_conversations_from_vector_db(
    start_date: datetime.date,
    end_date: datetime.date,
    workspace_paths: Optional[list[str]] = None,
) -> list[dict]:
    """
    Retrieve conversations from Vector DB by date range.
    
    Groups messages by chat_id to reconstruct conversations.
    
    Args:
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
        workspace_paths: Optional list of workspace paths to filter by
    
    Returns:
        List of conversation dicts in the same format as get_conversations_for_date:
        [
            {
                "chat_id": "...",
                "chat_type": "composer" | "chat",
                "workspace": "...",
                "messages": [
                    {"type": "user" | "assistant", "text": "...", "timestamp": ...},
                    ...
                ]
            },
            ...
        ]
    """
    client = get_supabase_client()
    if not client:
        return []
    
    # Calculate timestamp range
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
    start_ts = int(start_datetime.timestamp() * 1000)
    end_ts = int(end_datetime.timestamp() * 1000)
    
    try:
        # Query messages in date range
        query_builder = client.table("cursor_messages").select("*")
        
        # Apply timestamp filters
        query_builder = query_builder.gte("timestamp", start_ts)
        query_builder = query_builder.lt("timestamp", end_ts)
        
        # Apply workspace filter if provided
        if workspace_paths:
            query_builder = query_builder.in_("workspace", workspace_paths)
        
        # Fetch all messages (no limit - we want all conversations)
        result = query_builder.execute()
        messages = result.data if result.data else []
        
        # Group messages by chat_id and workspace
        conversations_dict: dict[str, dict] = {}
        
        for msg in messages:
            chat_id = msg.get("chat_id", "unknown")
            workspace = msg.get("workspace", "Unknown")
            chat_type = msg.get("chat_type", "unknown")
            
            # Create unique key for conversation
            conv_key = f"{workspace}:{chat_id}"
            
            if conv_key not in conversations_dict:
                conversations_dict[conv_key] = {
                    "chat_id": chat_id,
                    "chat_type": chat_type,
                    "workspace": workspace,
                    "messages": [],
                }
            
            # Add message to conversation
            conversations_dict[conv_key]["messages"].append({
                "type": msg.get("message_type", "user"),
                "text": msg.get("text", ""),
                "timestamp": msg.get("timestamp", 0),
            })
        
        # Sort messages within each conversation by timestamp
        conversations = list(conversations_dict.values())
        for conv in conversations:
            conv["messages"].sort(key=lambda m: m.get("timestamp", 0))
        
        return conversations
        
    except Exception as e:
        import sys
        import traceback
        error_details = traceback.format_exc()
        print(f"⚠️  Failed to retrieve conversations from Vector DB: {e}", file=sys.stderr)
        print(f"   Full traceback:\n{error_details}", file=sys.stderr)
        # Re-raise to let caller handle (they can catch and provide better context)
        raise RuntimeError(
            f"Failed to retrieve conversations from Vector DB for {start_date} to {end_date}: {e}\n"
            f"Traceback:\n{error_details}"
        ) from e


def get_conversations_by_chat_ids(
    chat_ids: list[tuple[str, str, str]],
    start_date: datetime.date,
    end_date: datetime.date,
) -> list[dict]:
    """
    Retrieve conversations by specific chat_ids (more efficient than fetching all then filtering).
    
    Args:
        chat_ids: List of (workspace, chat_id, chat_type) tuples
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
    
    Returns:
        List of conversation dicts matching the chat_ids
    """
    client = get_supabase_client()
    if not client:
        return []
    
    if not chat_ids:
        return []
    
    # Calculate timestamp range
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
    start_ts = int(start_datetime.timestamp() * 1000)
    end_ts = int(end_datetime.timestamp() * 1000)
    
    try:
        # Build workspace and chat_id filters
        workspace_to_chat_ids: dict[str, list[str]] = {}
        for workspace, chat_id, _ in chat_ids:
            if workspace not in workspace_to_chat_ids:
                workspace_to_chat_ids[workspace] = []
            workspace_to_chat_ids[workspace].append(chat_id)
        
        # Fetch messages for each workspace/chat_id combination
        all_messages = []
        for workspace, chat_id_list in workspace_to_chat_ids.items():
            # Query messages matching workspace and chat_ids
            query_builder = client.table("cursor_messages").select("*")
            query_builder = query_builder.eq("workspace", workspace)
            query_builder = query_builder.in_("chat_id", chat_id_list)
            query_builder = query_builder.gte("timestamp", start_ts)
            query_builder = query_builder.lt("timestamp", end_ts)
            
            result = query_builder.execute()
            if result.data:
                all_messages.extend(result.data)
        
        # Group messages by chat_id and workspace
        conversations_dict: dict[str, dict] = {}
        chat_id_set = {(w, c, t) for w, c, t in chat_ids}
        
        for msg in all_messages:
            chat_id = msg.get("chat_id", "unknown")
            workspace = msg.get("workspace", "Unknown")
            chat_type = msg.get("chat_type", "unknown")
            
            # Only include if in our target set
            if (workspace, chat_id, chat_type) not in chat_id_set:
                continue
            
            # Create unique key for conversation
            conv_key = f"{workspace}:{chat_id}"
            
            if conv_key not in conversations_dict:
                conversations_dict[conv_key] = {
                    "chat_id": chat_id,
                    "chat_type": chat_type,
                    "workspace": workspace,
                    "messages": [],
                }
            
            # Add message to conversation
            conversations_dict[conv_key]["messages"].append({
                "type": msg.get("message_type", "user"),
                "text": msg.get("text", ""),
                "timestamp": msg.get("timestamp", 0),
            })
        
        # Sort messages within each conversation by timestamp
        conversations = list(conversations_dict.values())
        for conv in conversations:
            conv["messages"].sort(key=lambda m: m.get("timestamp", 0))
        
        return conversations
        
    except Exception as e:
        import sys
        import traceback
        error_details = traceback.format_exc()
        print(f"⚠️  Failed to retrieve conversations by chat_ids from Vector DB: {e}", file=sys.stderr)
        print(f"   Full traceback:\n{error_details}", file=sys.stderr)
        raise RuntimeError(
            f"Failed to retrieve conversations by chat_ids from Vector DB: {e}\n"
            f"Traceback:\n{error_details}"
        ) from e


def get_high_signal_conversations_vector_db(
    days_back: int = 14,
    max_conversations: int = 80,
) -> list[dict]:
    """
    Extract high-signal conversations from Vector DB using server-side sampling.
    
    Uses the 'sample_high_signal_conversations' RPC function to filter and score
    conversations on the database server, minimizing data transfer.
    
    Args:
        days_back: Number of days to look back
        max_conversations: Maximum number of conversations to return
        
    Returns:
        List of conversation dicts (simplified format for Theme Map)
    """
    client = get_supabase_client()
    if not client:
        return []
        
    try:
        # Call RPC function
        result = client.rpc("sample_high_signal_conversations", {
            "days_back": days_back,
            "max_conversations": max_conversations
        }).execute()
        
        if not result.data:
            return []
            
        # Transform results into conversation objects
        # Note: The RPC returns summary data, not full message history.
        # For Theme Map, we might need full text.
        # If the RPC returns first_msg only, we might need to fetch full text for selected chats.
        # Wait, Theme Map needs full text to generate themes?
        # Yes, usually.
        # But 'sample_high_signal_conversations' returns summary.
        
        # Strategy: Get IDs from RPC, then fetch full messages for those IDs.
        sampled_chats = result.data
        chat_ids = [(c["workspace"], c["chat_id"], c["chat_type"]) for c in sampled_chats]
        
        # Fetch full conversations for these IDs
        # We reuse get_conversations_by_chat_ids but we need to construct it carefully
        # get_conversations_by_chat_ids takes (workspace, chat_id, chat_type) tuples
        
        # Calculate date range for fetching
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days_back + 1) # Add buffer
        
        full_conversations = get_conversations_by_chat_ids(chat_ids, start_date, end_date)
        
        return full_conversations
        
    except Exception as e:
        import sys
        print(f"⚠️  Failed to get high signal conversations from Vector DB: {e}", file=sys.stderr)
        return []

