"""
Cursor Database Extraction — Cross-platform support for extracting chat history.

Supports: macOS, Windows (Linux support removed in v1)
"""

import hashlib
import json
import os
import platform
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import unquote


def get_cursor_db_path() -> Path:
    """
    Auto-detect Cursor database path based on operating system.
    
    Supports: macOS, Windows (Linux support removed in v1)
    
    Returns:
        Path to state.vscdb file
        
    Raises:
        FileNotFoundError: If Cursor database not found
        RuntimeError: If OS not supported (only Mac/Windows supported)
    """
    system = platform.system()
    
    if system == "Darwin":  # macOS
        db_path = Path.home() / "Library/Application Support/Cursor/User/globalStorage/state.vscdb"
    elif system == "Windows":
        appdata = os.environ.get("APPDATA", "")
        if not appdata:
            raise RuntimeError("APPDATA environment variable not set. Windows requires APPDATA to locate Cursor database.")
        db_path = Path(appdata) / "Cursor/User/globalStorage/state.vscdb"
    else:
        raise RuntimeError(
            f"Unsupported operating system: {system}. "
            "Inspiration v1 supports macOS and Windows only. "
            "Linux support has been removed."
        )
    
    if not db_path.exists():
        raise FileNotFoundError(
            f"Cursor database not found at {db_path}. "
            "Make sure Cursor is installed and has been used at least once."
        )
    
    return db_path


def get_workspace_storage_path() -> Path:
    """
    Get the workspace storage directory path.
    
    Supports: macOS, Windows (Linux support removed in v1)
    """
    system = platform.system()
    
    if system == "Darwin":
        return Path.home() / "Library/Application Support/Cursor/User/workspaceStorage"
    elif system == "Windows":
        appdata = os.environ.get("APPDATA", "")
        if not appdata:
            raise RuntimeError("APPDATA environment variable not set. Windows requires APPDATA to locate workspace storage.")
        return Path(appdata) / "Cursor/User/workspaceStorage"
    else:
        raise RuntimeError(
            f"Unsupported operating system: {system}. "
            "Inspiration v1 supports macOS and Windows only."
        )


def get_workspace_mapping() -> dict[str, str]:
    """
    Build a mapping of workspace hash -> folder path.
    
    Returns:
        Dict like {"13da40fa8f...": "/Users/me/Projects", ...}
    """
    mapping = {}
    storage_path = get_workspace_storage_path()
    
    if not storage_path.exists():
        return mapping
    
    for workspace_dir in storage_path.iterdir():
        if not workspace_dir.is_dir():
            continue
        workspace_json = workspace_dir / "workspace.json"
        if workspace_json.exists():
            try:
                with open(workspace_json) as f:
                    data = json.load(f)
                    folder = data.get("folder", "")
                    # Decode URL encoding if present
                    if folder.startswith("file://"):
                        folder = unquote(folder[7:])
                    mapping[workspace_dir.name] = folder
            except (json.JSONDecodeError, IOError):
                pass
    
    return mapping


def extract_text_from_richtext(richtext_json: str) -> str:
    """
    Extract plain text from Cursor's richText JSON format.
    """
    try:
        data = json.loads(richtext_json)
        
        def walk(node):
            texts = []
            if isinstance(node, dict):
                if "text" in node:
                    texts.append(node["text"])
                for child in node.get("children", []):
                    texts.extend(walk(child))
            elif isinstance(node, list):
                for item in node:
                    texts.extend(walk(item))
            return texts
        
        return " ".join(walk(data.get("root", {})))
    except (json.JSONDecodeError, TypeError):
        return ""


def extract_messages_from_chat_data(
    data: dict,
    start_ts: int,
    end_ts: int,
    composer_id: str | None = None,
    db_path: Path | None = None,
) -> list[dict]:
    """
    Extract messages from chat data (supports both Composer and regular chat formats).
    
    Args:
        data: Parsed JSON data from database
        start_ts: Start timestamp (milliseconds)
        end_ts: End timestamp (milliseconds)
        composer_id: Optional composer ID for bubble-based extraction
        db_path: Optional database path for bubble lookups
    
    Returns:
        List of message dicts with type, text, timestamp
    """
    messages = []
    messages_raw = []
    
    # PRIORITY 1: Check conversationMap first (contains full conversation history)
    # This is where the actual messages with timestamps are stored
    conversation_map = data.get("conversationMap", {})
    if isinstance(conversation_map, dict) and len(conversation_map) > 0:
        # Flatten all messages from all conversations in the map
        for conv_id, conv_data in conversation_map.items():
            if isinstance(conv_data, dict):
                conv_messages = conv_data.get("messages", [])
                if conv_messages:
                    messages_raw.extend(conv_messages)
    
    # PRIORITY 2: Check conversation.messages (Composer format)
    if not messages_raw:
        conversation = data.get("conversation", {})
        conv_messages = conversation.get("messages", [])
        if conv_messages:
            messages_raw.extend(conv_messages)
    
    # PRIORITY 3: Check fullConversationHeadersOnly with bubble-based extraction
    # New Cursor format: headers contain bubbleId references, need to look up bubbles
    if not messages_raw:
        full_headers = data.get("fullConversationHeadersOnly", [])
        if isinstance(full_headers, list) and len(full_headers) > 0:
            # Get composer metadata for timestamp estimation
            composer_created_at = data.get("createdAt", 0)
            composer_last_updated = data.get("lastUpdatedAt", composer_created_at)
            
            # Try bubble-based extraction if we have composer_id and db_path
            if composer_id and db_path and db_path.exists():
                try:
                    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
                    cursor = conn.cursor()
                    
                    # Extract messages from bubbles
                    for i, header in enumerate(full_headers):
                        if not isinstance(header, dict):
                            continue
                        
                        bubble_id = header.get("bubbleId")
                        if not bubble_id:
                            continue
                        
                        # Determine message type from header
                        msg_type_num = header.get("type", 1)  # 1=user, 2=assistant
                        msg_type = "user" if msg_type_num == 1 else "assistant"
                        
                        # Look up bubble
                        bubble_key = f"bubbleId:{composer_id}:{bubble_id}"
                        cursor.execute("SELECT value FROM cursorDiskKV WHERE key = ?", (bubble_key,))
                        bubble_row = cursor.fetchone()
                        
                        if bubble_row:
                            try:
                                bubble_value = bubble_row[0]
                                if isinstance(bubble_value, bytes):
                                    bubble_value_str = bubble_value.decode('utf-8')
                                else:
                                    bubble_value_str = bubble_value
                                bubble_data = json.loads(bubble_value_str)
                                
                                # Extract text from bubble
                                text = ""
                                if "text" in bubble_data:
                                    text = bubble_data["text"]
                                elif "richText" in bubble_data:
                                    text = extract_text_from_richtext(json.dumps(bubble_data["richText"]))
                                
                                if text and text.strip():
                                    # Estimate timestamp: distribute messages evenly between created and last updated
                                    # Or use bubble's own timestamp if available
                                    ts = bubble_data.get("timestamp", 0)
                                    if not ts or ts == 0:
                                        # Estimate based on message order
                                        if len(full_headers) > 1:
                                            # Distribute timestamps evenly across the time span
                                            time_span = composer_last_updated - composer_created_at
                                            if time_span > 0:
                                                ts = composer_created_at + int((time_span * i) / (len(full_headers) - 1))
                                            else:
                                                ts = composer_created_at
                                        else:
                                            ts = composer_created_at
                                    
                                    # Convert to int if string
                                    if isinstance(ts, str):
                                        try:
                                            ts = int(ts)
                                        except ValueError:
                                            ts = 0
                                    
                                    if ts > 0:
                                        messages_raw.append({
                                            "text": text.strip(),
                                            "timestamp": ts,
                                            "type": msg_type_num,
                                        })
                            except (json.JSONDecodeError, UnicodeDecodeError, KeyError):
                                continue
                    
                    conn.close()
                except sqlite3.Error:
                    pass
            
            # Fallback: Check if headers have richText/text directly (old format)
            if not messages_raw:
                for header in full_headers:
                    if isinstance(header, dict):
                        # Headers might have richText or text directly
                        if "richText" in header:
                            text = extract_text_from_richtext(json.dumps(header["richText"]))
                            if text.strip():
                                ts = header.get("timestamp", 0)
                                if isinstance(ts, str):
                                    try:
                                        ts = int(ts)
                                    except ValueError:
                                        ts = 0
                                if ts > 0:  # Only add if we have a valid timestamp
                                    messages_raw.append({
                                        "text": text,
                                        "timestamp": ts,
                                        "type": 2 if header.get("role") == "assistant" else 1,
                                    })
                        elif "text" in header:
                            text = header["text"]
                            if text.strip():
                                ts = header.get("timestamp", 0)
                                if isinstance(ts, str):
                                    try:
                                        ts = int(ts)
                                    except ValueError:
                                        ts = 0
                                if ts > 0:  # Only add if we have a valid timestamp
                                    messages_raw.append({
                                        "text": text,
                                        "timestamp": ts,
                                        "type": 2 if header.get("role") == "assistant" else 1,
                                    })
    
    # PRIORITY 4: Check top-level text/richText (current draft - only if no other messages found)
    # These are usually just the current message being composed, not full history
    if not messages_raw:
        if "text" in data and data.get("text", "").strip():
            # Top-level text field might be a single message
            text = data.get("text", "").strip()
            if text:
                # Try to get timestamp from context or use current time as fallback
                ts = data.get("context", {}).get("timestamp", 0) if isinstance(data.get("context"), dict) else 0
                if not ts:
                    ts = int(datetime.now().timestamp() * 1000)  # Fallback to current time
                messages_raw.append({
                    "text": text,
                    "timestamp": ts,
                    "type": 1,  # Assume user message
                })
        
        if "richText" in data and data.get("richText"):
            # Top-level richText might contain formatted message
            rich_text = data.get("richText")
            if rich_text:
                try:
                    # extract_text_from_richtext expects a JSON string
                    if isinstance(rich_text, (dict, list)):
                        text = extract_text_from_richtext(json.dumps(rich_text))
                    else:
                        # If it's already a string, try parsing it first
                        text = extract_text_from_richtext(rich_text)
                    if text.strip():
                        ts = data.get("context", {}).get("timestamp", 0) if isinstance(data.get("context"), dict) else 0
                        if not ts:
                            ts = int(datetime.now().timestamp() * 1000)
                        messages_raw.append({
                            "text": text,
                            "timestamp": ts,
                            "type": 1,
                        })
                except (json.JSONDecodeError, AttributeError, TypeError):
                    # Skip if richText can't be parsed
                    pass
    
    # PRIORITY 5: Check regular chat format: data.messages
    if not messages_raw:
        messages_raw = data.get("messages", [])
    
    # PRIORITY 6: Check nested format: data.chat.messages
    if not messages_raw:
        chat = data.get("chat", {})
        messages_raw = chat.get("messages", [])
    
    for msg in messages_raw:
        # Check timestamp
        ts = msg.get("timestamp", 0)
        if isinstance(ts, str):
            try:
                ts = int(ts)
            except ValueError:
                ts = 0
        
        # Filter by timestamp if provided
        # For single-day queries (get_conversations_for_date), filter here
        # For range queries (get_conversations_for_range), we filter at the range level after merging
        # But we still need to respect the day's range when extracting to avoid processing too many messages
        if start_ts and end_ts and ts > 0:
            # Filter messages to the specified timestamp range
            if not (start_ts <= ts < end_ts):
                continue
        
        # Extract text
        text = ""
        if "text" in msg:
            text = msg["text"]
        elif "richText" in msg:
            text = extract_text_from_richtext(json.dumps(msg["richText"]))
        elif "content" in msg:
            # Some formats use "content" instead of "text"
            content = msg["content"]
            if isinstance(content, str):
                text = content
            elif isinstance(content, list):
                # Content might be array of text parts
                text = " ".join(str(c.get("text", c)) for c in content if isinstance(c, dict))
        
        if text.strip():
            # Determine message type
            # Composer: type 1 = user, type 2 = assistant
            # Regular chat: role "user" or "assistant"
            msg_type = "user"
            if msg.get("type") == 2 or msg.get("role") == "assistant":
                msg_type = "assistant"
            elif msg.get("type") == 1 or msg.get("role") == "user":
                msg_type = "user"
            
            messages.append({
                "type": msg_type,
                "text": text.strip(),
                "timestamp": ts,
            })
    
    return messages


def get_conversation_cache_path() -> Path:
    """Get path to conversation cache file."""
    from .config import get_data_dir
    return get_data_dir() / "conversation_cache.json"


def get_conversation_cache_key(
    target_date: datetime.date,
    workspace_paths: list[str] | None = None,
) -> str:
    """Generate cache key for conversation query."""
    date_str = target_date.isoformat()
    workspaces_str = ",".join(sorted(workspace_paths or []))
    key_str = f"{date_str}:{workspaces_str}"
    return hashlib.sha256(key_str.encode()).hexdigest()


def get_conversations_for_date(
    target_date: datetime.date,
    workspace_paths: list[str] | None = None,
    use_cache: bool = True,
) -> list[dict]:
    """
    Get conversations for a single date from Vector DB.
    
    Requires Vector DB to be set up and synced.
    """
    from .vector_db import get_supabase_client, get_conversations_from_vector_db
    
    client = get_supabase_client()
    if not client:
        raise RuntimeError(
            "Vector DB not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.\n"
            "See engine/scripts/init_vector_db.sql for setup instructions."
        )
    
    # Use Vector DB exclusively
    conversations = get_conversations_from_vector_db(
        target_date,
        target_date,
        workspace_paths=workspace_paths,
    )
    
    return conversations


def _get_conversations_for_date_sqlite(
    target_date: datetime.date,
    workspace_paths: list[str] | None = None,
    use_cache: bool = True,
) -> list[dict]:
    """
    Extract all conversations from the target date.
    Searches both Composer chats and regular chat conversations.
    
    Args:
        target_date: Date to extract conversations for
        workspace_paths: Optional list of workspace paths to filter by.
                        If None, returns all workspaces.
        use_cache: Whether to use cached results if available
    
    Returns:
        List of conversation dicts:
        [
            {
                "chat_id": "...",
                "chat_type": "composer" | "chat",
                "workspace": "/Users/me/Projects",
                "messages": [
                    {"type": "user", "text": "...", "timestamp": "..."},
                    {"type": "assistant", "text": "...", "timestamp": "..."},
                ]
            },
            ...
        ]
    """
    # Check cache first
    if use_cache:
        cache_key = get_conversation_cache_key(target_date, workspace_paths)
        cache_path = get_conversation_cache_path()
        
        if cache_path.exists():
            try:
                with open(cache_path) as f:
                    cache = json.load(f)
                    if cache_key in cache:
                        cached_data = cache[cache_key]
                        # Verify cache entry is for correct date
                        if cached_data.get("date") == target_date.isoformat():
                            return cached_data.get("conversations", [])
            except (json.JSONDecodeError, IOError, KeyError):
                # Cache corrupted or missing key, continue to fetch
                pass
    
    workspace_mapping = get_workspace_mapping()
    
    print(f"🗺️  [DEBUG] Workspace mapping has {len(workspace_mapping)} entries:", file=sys.stderr)
    for hash_val, path in list(workspace_mapping.items())[:5]:  # Show first 5
        print(f"    {hash_val[:20]}... -> {path}", file=sys.stderr)
    
    # Normalize workspace paths for comparison
    if workspace_paths:
        normalized_workspaces = {os.path.normpath(p) for p in workspace_paths}
        print(f"🔍 [DEBUG] Filtering by workspaces: {normalized_workspaces}", file=sys.stderr)
        print(f"🔍 [DEBUG] Available workspace paths in mapping: {set(workspace_mapping.values())}", file=sys.stderr)
    else:
        normalized_workspaces = None
        print(f"🔍 [DEBUG] No workspace filter - searching all workspaces", file=sys.stderr)
    
    # Date range for filtering (full day in local time)
    start_of_day = datetime.combine(target_date, datetime.min.time())
    end_of_day = datetime.combine(target_date + timedelta(days=1), datetime.min.time())
    
    # Convert to millisecond timestamps
    start_ts = int(start_of_day.timestamp() * 1000)
    end_ts = int(end_of_day.timestamp() * 1000)
    
    conversations = []
    
    # Chat data can be stored in multiple places:
    # 1. globalStorage cursorDiskKV (current format): composerData:{uuid}, chatData:{uuid}
    # 2. globalStorage ItemTable (legacy format): composer.composerData.{workspace_hash}.{id}
    # 3. workspaceStorage ItemTable (per-workspace): composer.composerData (metadata)
    
    db_path = get_cursor_db_path()
    
    if not db_path.exists():
        print(f"⚠️  [DEBUG] Database not found at {db_path}", file=sys.stderr)
        return conversations
    
    print(f"🔍 [DEBUG] Searching globalStorage cursorDiskKV AND ItemTable for BOTH Composer and regular chats", file=sys.stderr)
    
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()
        
        all_rows = []
        
        # Try cursorDiskKV first (current format)
        cursor.execute("""
            SELECT key, value FROM cursorDiskKV 
            WHERE key LIKE 'composerData:%'
               OR key LIKE 'chatData:%'
        """)
        diskkv_rows = cursor.fetchall()
        print(f"📊 [DEBUG] Found {len(diskkv_rows)} entries in globalStorage cursorDiskKV", file=sys.stderr)
        all_rows.extend(diskkv_rows)
        
        # Also try ItemTable (legacy format - in case Cursor still uses it)
        try:
            cursor.execute("""
                SELECT key, value FROM ItemTable 
                WHERE key LIKE 'composer.composerData%'
                   OR key LIKE 'workbench.panel.aichat.view.aichat.chatdata%'
            """)
            itemtable_rows = cursor.fetchall()
            print(f"📊 [DEBUG] Found {len(itemtable_rows)} entries in globalStorage ItemTable", file=sys.stderr)
            all_rows.extend(itemtable_rows)
        except sqlite3.OperationalError:
            # ItemTable might not exist or have different schema
            pass
        
        print(f"📊 [DEBUG] Total entries to process: {len(all_rows)}", file=sys.stderr)
        
        for key, value in all_rows:
            if not value:
                continue
            
            try:
                # Handle both cursorDiskKV (BLOB) and ItemTable (text) formats
                if isinstance(value, bytes):
                    value_str = value.decode('utf-8')
                else:
                    value_str = value
                data = json.loads(value_str)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            
            # Determine chat type and extract ID based on key format
            chat_type = "composer"
            chat_id = "unknown"
            workspace_path = "Unknown"
            workspace_hash: str | None = None
            
            # Handle different key formats
            if key.startswith("composerData:") or key.startswith("chatData:"):
                # cursorDiskKV format: composerData:{uuid} or chatData:{uuid}
                chat_type = "composer" if key.startswith("composerData:") else "chat"
                chat_id = key.split(":", 1)[1] if ":" in key else "unknown"
                
                # Extract workspace from conversation data
                if isinstance(data, dict):
                    workspace_hash = (
                        data.get("workspaceHash") or 
                        data.get("workspace") or 
                        data.get("workspaceId")
                    )
                    if not workspace_hash and "context" in data:
                        context = data["context"]
                        if isinstance(context, dict):
                            workspace_hash = context.get("workspaceHash") or context.get("workspace")
                    if workspace_hash and workspace_hash in workspace_mapping:
                        workspace_path = workspace_mapping[workspace_hash]
            elif key.startswith("composer.composerData") or key.startswith("workbench.panel.aichat.view.aichat.chatdata"):
                # ItemTable format: composer.composerData.{workspace_hash}.{id} or workbench.panel.aichat.view.aichat.chatdata.{workspace_hash}.{id}
                chat_type = "composer" if key.startswith("composer.composerData") else "chat"
                parts = key.split(".")
                if chat_type == "composer" and len(parts) >= 3:
                    workspace_hash = parts[2]
                    workspace_path = workspace_mapping.get(workspace_hash, "Unknown")
                    chat_id = parts[-1] if len(parts) >= 4 else "unknown"
                elif chat_type == "chat" and len(parts) >= 6:
                    workspace_hash = parts[5]
                    workspace_path = workspace_mapping.get(workspace_hash, "Unknown")
                    chat_id = parts[-1] if len(parts) >= 7 else "unknown"
            
            # MVP: Search ALL workspaces regardless of filter (non-negotiable)
            # Only filter if workspace_paths is explicitly provided AND we have a valid workspace_hash
            if normalized_workspaces and workspace_hash:
                norm_workspace = os.path.normpath(workspace_path)
                if norm_workspace not in normalized_workspaces:
                    continue
            
            # Extract messages using unified function
            # Pass composer_id and db_path for bubble-based extraction
            composer_id_for_extraction = None
            if key.startswith("composerData:"):
                composer_id_for_extraction = key.split(":", 1)[1] if ":" in key else None
            
            messages = extract_messages_from_chat_data(
                data, 
                start_ts, 
                end_ts,
                composer_id=composer_id_for_extraction,
                db_path=db_path
            )
            
            # Check if any messages are in the date range (with valid timestamps)
            has_messages_in_range = any(
                msg.get("timestamp", 0) > 0  # Must have valid timestamp
                and start_ts <= msg["timestamp"] < end_ts  # Must be within date range
                for msg in messages
            )
            
            if has_messages_in_range and messages:
                # Filter messages to ONLY those within the date range
                filtered_messages = [
                    msg for msg in messages
                    if msg.get("timestamp", 0) > 0  # Valid timestamp
                    and start_ts <= msg["timestamp"] < end_ts  # Within range
                ]
                if filtered_messages:
                    conversations.append({
                        "chat_id": chat_id,
                        "chat_type": chat_type,
                        "workspace": workspace_path,
                        "messages": filtered_messages,  # Only include filtered messages
                    })
        
        conn.close()
    
    except sqlite3.Error as e:
        print(f"⚠️  [DEBUG] Error reading database: {e}", file=sys.stderr)
    
    # Save to cache
    if use_cache:
        try:
            cache_key = get_conversation_cache_key(target_date, workspace_paths)
            cache_path = get_conversation_cache_path()
            
            cache = {}
            if cache_path.exists():
                try:
                    with open(cache_path) as f:
                        cache = json.load(f)
                except (json.JSONDecodeError, IOError):
                    cache = {}
            
            cache[cache_key] = {
                "date": target_date.isoformat(),
                "workspace_paths": workspace_paths,
                "conversations": conversations,
                "cached_at": datetime.now().isoformat(),
            }
            
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_path, "w") as f:
                json.dump(cache, f, indent=2)
        except (IOError, OSError):
            # Cache write failed, but conversations are still valid
            pass
    
    return conversations


def get_conversations_for_range(
    start_date: datetime.date,
    end_date: datetime.date,
    workspace_paths: list[str] | None = None,
) -> list[dict]:
    """
    Extract all conversations for a date range from Vector DB.
    
    Requires Vector DB to be set up and synced.
    
    Args:
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
        workspace_paths: Optional list of workspace paths to filter by
    
    Returns:
        Combined list of conversations from all dates.
        Note: Conversations are deduplicated by chat_id+workspace, and messages
        from all days in the range are included (not filtered to specific days).
    """
    from .vector_db import get_supabase_client, get_conversations_from_vector_db
    
    client = get_supabase_client()
    if not client:
        raise RuntimeError(
            "Vector DB not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.\n"
            "See engine/scripts/init_vector_db.sql for setup instructions."
        )
    
    # Use Vector DB exclusively
    conversations = get_conversations_from_vector_db(
        start_date,
        end_date,
        workspace_paths=workspace_paths,
    )
    
    print(f"🚀 [DEBUG] Using Vector DB: {len(conversations)} conversations", file=sys.stderr)
    return conversations


# =============================================================================
# FAST START: Local-only functions (no Vector DB required)
# =============================================================================

def _open_db_safe(db_path: Path) -> sqlite3.Connection:
    """
    Open SQLite database with file lock handling (Windows compatibility).
    
    If the database is locked (e.g., Cursor is open), copies to a temp file first.
    
    Args:
        db_path: Path to the SQLite database
        
    Returns:
        sqlite3.Connection object
        
    Raises:
        sqlite3.Error: If database cannot be opened
    """
    import shutil
    import tempfile
    
    try:
        # Try read-only mode first
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        # Test the connection
        conn.execute("SELECT 1")
        return conn
    except sqlite3.OperationalError as e:
        if "database is locked" in str(e).lower() or "unable to open" in str(e).lower():
            # File is locked - copy to temp and read from there
            print(f"⚠️  Database locked, using copy...", file=sys.stderr)
            temp_dir = tempfile.mkdtemp()
            temp_path = Path(temp_dir) / "state_copy.vscdb"
            shutil.copy2(db_path, temp_path)
            conn = sqlite3.connect(f"file:{temp_path}?mode=ro", uri=True)
            # Store temp path for cleanup (caller should handle)
            conn._temp_path = temp_path  # type: ignore
            conn._temp_dir = temp_dir  # type: ignore
            return conn
        raise


def _close_db_safe(conn: sqlite3.Connection) -> None:
    """Close database connection and clean up temp files if any."""
    import shutil
    
    conn.close()
    
    # Clean up temp files if we used the copy fallback
    if hasattr(conn, '_temp_dir'):
        try:
            shutil.rmtree(conn._temp_dir)  # type: ignore
        except (OSError, IOError):
            pass


def estimate_history_metrics(db_path: Path | None = None) -> dict:
    """
    Estimate chat history metrics without full scan.

    Returns:
        {
            "total_size_mb": float,
            "total_messages": int,
            "date_range": {
                "start": str, # ISO format
                "end": str    # ISO format
            },
            "recent_500mb": {
                "size_mb": float,
                "estimated_days": int,
                "estimated_messages": int,
                "coverage": str # "YYYY-MM-DD to YYYY-MM-DD"
            }
        }
    """
    if db_path is None:
        try:
            db_path = get_cursor_db_path()
        except (FileNotFoundError, RuntimeError):
            return {
                "total_size_mb": 0,
                "total_messages": 0,
                "date_range": {"start": "", "end": ""},
                "recent_500mb": {
                    "size_mb": 0,
                    "estimated_days": 0,
                    "estimated_messages": 0,
                    "coverage": ""
                }
            }

    import re
    
    total_size_bytes = 0
    total_count = 0
    timestamps = [] # List of (timestamp, size_bytes)
    
    try:
        conn = _open_db_safe(db_path)
        cursor = conn.cursor()
        
        # Stream all keys and values
        # We need values to get timestamps and sizes
        cursor.execute("""
            SELECT key, value FROM cursorDiskKV 
            WHERE key LIKE 'composerData:%' OR key LIKE 'chatData:%'
        """)
        
        # Extract timestamps - try regex first (faster), fall back to json.loads if needed
        # Matches "lastUpdatedAt": 1234567890123 or "createdAt": 1234567890123
        ts_pattern = re.compile(r'"(?:lastUpdatedAt|createdAt|timestamp)":\s*(\d{10,13})')
        
        while True:
            rows = cursor.fetchmany(1000) # Fetch in batches
            if not rows:
                break
                
            for key, value in rows:
                if not value:
                    continue
                
                # Calculate size
                size = len(value)
                total_size_bytes += size
                total_count += 1
                
                # Extract timestamp
                # Value can be str or bytes
                val_str = value
                if isinstance(value, bytes):
                    val_str = value.decode('utf-8', errors='ignore')
                
                ts = None
                # Try regex first (faster)
                match = ts_pattern.search(val_str)
                if match:
                    try:
                        ts = int(match.group(1))
                        # Normalize to milliseconds if in seconds
                        if ts < 10000000000: # < 1973 (seconds) vs > 2001 (ms)
                             ts *= 1000
                    except ValueError:
                        pass
                
                # Fall back to json.loads if regex didn't match (more thorough)
                if ts is None:
                    try:
                        data = json.loads(val_str)
                        # Try multiple timestamp fields
                        ts = (
                            data.get("lastUpdatedAt") or 
                            data.get("createdAt") or 
                            data.get("timestamp") or
                            (data.get("context", {}) if isinstance(data.get("context"), dict) else {}).get("timestamp") or
                            0
                        )
                        if ts > 0:
                            # Normalize to milliseconds if in seconds
                            if ts < 10000000000:
                                ts *= 1000
                    except (json.JSONDecodeError, TypeError, AttributeError):
                        pass
                
                # Only add to timestamps if we found a valid timestamp
                # This ensures we can properly sort and accumulate
                if ts and ts > 0:
                    timestamps.append((ts, size))
                else:
                    # If no timestamp found, we can't include it in accumulation
                    # This is a limitation - messages without timestamps won't be counted
                    # But they're still in total_size_bytes, which is why we use proportional estimate
                    pass
        
        _close_db_safe(conn)
        
    except sqlite3.Error as e:
        print(f"Database error: {e}", file=sys.stderr)
        return {
            "total_size_mb": 0,
            "total_messages": 0,
            "date_range": {"start": "", "end": ""},
            "recent_500mb": {
                "size_mb": 0,
                "estimated_days": 0,
                "estimated_messages": 0,
                "coverage": ""
            }
        }

    # Calculate metrics
    total_size_mb = total_size_bytes / (1024 * 1024)
    
    if not timestamps:
        return {
            "total_size_mb": round(total_size_mb, 1),
            "total_messages": total_count,
            "date_range": {"start": "", "end": ""},
            "recent_500mb": {
                "size_mb": round(total_size_mb, 1),
                "estimated_days": 0,
                "estimated_messages": total_count,
                "coverage": "All history"
            }
        }
        
    timestamps.sort(key=lambda x: x[0], reverse=True) # Newest first
    
    min_ts = timestamps[-1][0]
    max_ts = timestamps[0][0]
    
    start_date_str = datetime.fromtimestamp(min_ts / 1000).strftime('%Y-%m-%d')
    end_date_str = datetime.fromtimestamp(max_ts / 1000).strftime('%Y-%m-%d')
    
    # Calculate 500MB cutoff
    accumulated_size = 0
    cutoff_idx = 0
    target_size_bytes = 500 * 1024 * 1024
    
    for i, (ts, size) in enumerate(timestamps):
        accumulated_size += size
        cutoff_idx = i
        if accumulated_size >= target_size_bytes:
            break
            
    recent_size_mb = accumulated_size / (1024 * 1024)
    recent_count = cutoff_idx + 1
    
    cutoff_ts = timestamps[cutoff_idx][0]
    cutoff_date = datetime.fromtimestamp(cutoff_ts / 1000)
    # Use the most recent message date (max_ts), not datetime.now()
    # This ensures we calculate based on actual chat history, not current time
    most_recent_date = datetime.fromtimestamp(max_ts / 1000)
    
    estimated_days = (most_recent_date - cutoff_date).days
    estimated_days = max(1, estimated_days)
    
    coverage_str = f"{cutoff_date.strftime('%Y-%m-%d')} to {most_recent_date.strftime('%Y-%m-%d')}"
    
    return {
        "total_size_mb": round(total_size_mb, 1),
        "total_messages": total_count,
        "date_range": {
            "start": start_date_str,
            "end": end_date_str
        },
        "recent_500mb": {
            "size_mb": round(recent_size_mb, 1),
            "estimated_days": estimated_days,
            "estimated_messages": recent_count,
            "coverage": coverage_str
        }
    }



def _load_claude_code_conversations_for_size_limit() -> list[dict]:
    """
    Load all Claude Code conversations with their file sizes.
    Used for size-based analysis (most recent ~500MB).
    
    Returns:
        List of conversation dicts with _size_bytes field (file size).
    """
    try:
        from .source_detector import get_claude_code_path
        from .claude_code_db import parse_jsonl_session, parse_subagent_sessions, decode_workspace_name
        
        claude_path = get_claude_code_path()
        if not claude_path or not claude_path.exists():
            return []
        
        conversations = []
        
        # Iterate through workspace directories
        for workspace_dir in claude_path.iterdir():
            if not workspace_dir.is_dir():
                continue
            
            # Find all session JSONL files
            session_files = [f for f in workspace_dir.glob("*.jsonl") if f.is_file()]
            
            for session_file in session_files:
                session_id = session_file.stem
                
                # Get file size (this is what we'll use for size limit)
                file_size_bytes = session_file.stat().st_size
                
                # Parse main session
                messages = parse_jsonl_session(session_file)
                
                # Parse subagents
                subagent_messages = parse_subagent_sessions(workspace_dir, session_id)
                messages.extend(subagent_messages)
                
                # Skip if no messages
                if not messages:
                    continue
                
                # Extract workspace from message metadata
                actual_workspace = messages[0]["metadata"].get("cwd")
                if not actual_workspace:
                    try:
                        actual_workspace = decode_workspace_name(workspace_dir.name)
                    except Exception:
                        continue
                
                # Get timestamp from most recent message
                last_updated = max(msg.get("timestamp", 0) for msg in messages) if messages else 0
                
                conversations.append({
                    "chat_id": session_id,
                    "chat_type": "claude_code_session",
                    "workspace": actual_workspace,
                    "messages": messages,
                    "signal_score": 0.0,  # Will be calculated later
                    "_size_bytes": file_size_bytes,
                    "_last_updated": last_updated,  # For sorting
                })
        
        return conversations
    except Exception as e:
        print(f"⚠️  Failed to load Claude Code conversations: {e}", file=sys.stderr)
        return []


def get_high_signal_conversations_sqlite_fast(
    days_back: int = 14,
    max_conversations: int = 80,
    max_size_mb: int | None = None,
    db_path: Path | None = None,
) -> list[dict]:
    """
    Fast extraction of high-signal conversations directly from SQLite.
    
    NO Vector DB required. Uses heuristics to select the most valuable
    conversations for Theme Map generation.
    
    Heuristics for "high signal":
    - Message count (more back-and-forth = richer context)
    - Contains code blocks or error traces
    - Recent activity within the time window
    - Alternating user/assistant messages (actual conversation, not monologue)
    
    Args:
        days_back: Number of days to look back (default 14, ignored if max_size_mb is set)
        max_conversations: Maximum conversations to return (default 80, ignored if max_size_mb is set)
        max_size_mb: Maximum size in MB to include (takes precedence over days/conversations)
        db_path: Optional path to database (auto-detects if not provided)
        
    Returns:
        List of conversation dicts matching existing format:
        [
            {
                "chat_id": str,
                "chat_type": "composer" | "chat",
                "workspace": str,
                "messages": [{"type": str, "text": str, "timestamp": int}, ...],
                "signal_score": float,  # Added for debugging
                "_size_bytes": int,  # Internal: size of this conversation in bytes
            },
            ...
        ]
    """
    if db_path is None:
        db_path = get_cursor_db_path()
    
    # Calculate time window
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)
    start_ts = int(start_date.timestamp() * 1000)
    end_ts = int(end_date.timestamp() * 1000)
    
    workspace_mapping = get_workspace_mapping()
    
    conversations = []
    total_size_bytes = 0
    max_size_bytes = max_size_mb * 1024 * 1024 if max_size_mb else None
    
    # If size-based, load Claude Code conversations too
    claude_code_conversations = []
    if max_size_mb:
        claude_code_conversations = _load_claude_code_conversations_for_size_limit()
        print(f"📚 Loaded {len(claude_code_conversations)} Claude Code conversations", file=sys.stderr)
    
    try:
        conn = _open_db_safe(db_path)
        cursor = conn.cursor()
        
        # Get all composer and chat entries
        # If max_size_mb is set, we'll process all and sort by timestamp after parsing
        cursor.execute("""
            SELECT key, value FROM cursorDiskKV 
            WHERE key LIKE 'composerData:%' OR key LIKE 'chatData:%'
        """)
        rows = cursor.fetchall()
        
        # Build Cursor conversations list
        cursor_conversations = []
        
        for key, value in rows:
            if not value:
                continue
            
            # Calculate actual database blob size (matches estimate_db_metrics calculation)
            # This is the size as stored in the database, not the extracted dict size
            blob_size_bytes = len(value) if isinstance(value, bytes) else len(value.encode('utf-8'))
            
            try:
                # Keep original value for size calculation, decode for parsing
                value_str = value.decode('utf-8') if isinstance(value, bytes) else value
                data = json.loads(value_str)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            
            # Get timestamp for sorting
            last_updated = data.get("lastUpdatedAt") or data.get("createdAt") or 0
            
            # Check if conversation is within time window (only if max_size_mb not set)
            if not max_size_mb:
                if last_updated < start_ts:
                    continue  # Too old
            
            # Determine chat type and ID
            chat_type = "composer" if key.startswith("composerData:") else "chat"
            chat_id = key.split(":", 1)[1] if ":" in key else "unknown"
            
            # Get workspace
            workspace_hash = (
                data.get("workspaceHash") or 
                data.get("workspace") or 
                data.get("workspaceId")
            )
            if not workspace_hash and isinstance(data.get("context"), dict):
                workspace_hash = data["context"].get("workspaceHash") or data["context"].get("workspace")
            
            workspace_path = workspace_mapping.get(workspace_hash, "Unknown") if workspace_hash else "Unknown"
            
            # Extract messages
            composer_id = chat_id if chat_type == "composer" else None
            messages = extract_messages_from_chat_data(
                data, 
                start_ts if not max_size_mb else 0,  # No time filter if size-based
                end_ts if not max_size_mb else int(datetime.now().timestamp() * 1000),  # Current time if size-based
                composer_id=composer_id,
                db_path=db_path
            )
            
            if not messages:
                continue
            
            # Calculate signal score
            signal_score = _calculate_signal_score(messages)
            
            # Use actual database blob size (not extracted dict size)
            # This matches how estimate_db_metrics calculates size
            convo_dict = {
                "chat_id": chat_id,
                "chat_type": chat_type,
                "workspace": workspace_path,
                "messages": messages,
                "signal_score": signal_score,
                "_size_bytes": blob_size_bytes,  # Store actual database blob size
                "_last_updated": last_updated,  # For sorting
            }
            
            cursor_conversations.append(convo_dict)
        
        _close_db_safe(conn)
        
    except sqlite3.Error as e:
        print(f"⚠️  Database error: {e}", file=sys.stderr)
        return []
    
    # If size-based, combine Cursor + Claude Code and sort by timestamp
    if max_size_mb:
        # Combine all conversations
        all_conversations = cursor_conversations + claude_code_conversations
        
        # Sort by timestamp (most recent first)
        all_conversations.sort(key=lambda c: c.get("_last_updated", 0), reverse=True)
        
        # Accumulate conversations up to size limit
        for convo in all_conversations:
            convo_size = convo.get("_size_bytes", 0)
            
            # If size limit reached, stop
            if total_size_bytes >= max_size_bytes:
                break
            
            # Check if adding this would exceed limit
            if total_size_bytes + convo_size > max_size_bytes:
                continue
            
            # Calculate signal score if not already calculated (for Claude Code)
            if convo.get("signal_score", 0) == 0.0:
                convo["signal_score"] = _calculate_signal_score(convo.get("messages", []))
            
            conversations.append(convo)
            total_size_bytes += convo_size
        
        print(f"📊 Accumulated {len(conversations)} conversations ({round(total_size_bytes / (1024 * 1024), 1)}MB) from most recent data", file=sys.stderr)
        
        # Now sort by signal score (highest first)
        conversations.sort(key=lambda c: c["signal_score"], reverse=True)
        
        # Return top conversations (respect max_conversations as upper bound)
        return conversations[:max_conversations]
    else:
        # Time-based: use Cursor conversations only, sort by signal score
        conversations = cursor_conversations
        conversations.sort(key=lambda c: c["signal_score"], reverse=True)
        return conversations[:max_conversations]


def _calculate_signal_score(messages: list[dict]) -> float:
    """
    Calculate a "signal score" for a conversation.
    
    Higher score = more valuable for theme extraction.
    
    Factors:
    - Message count (more = better, diminishing returns)
    - Back-and-forth density (alternating user/assistant)
    - Contains code blocks (```), error traces, or technical content
    - Message length (longer = more context)
    """
    if not messages:
        return 0.0
    
    score = 0.0
    
    # Factor 1: Message count (log scale to avoid huge conversations dominating)
    msg_count = len(messages)
    score += min(10, msg_count * 0.5)  # Max 10 points from message count
    
    # Factor 2: Back-and-forth density
    alternations = 0
    for i in range(1, len(messages)):
        if messages[i]["type"] != messages[i-1]["type"]:
            alternations += 1
    
    if msg_count > 1:
        alternation_ratio = alternations / (msg_count - 1)
        score += alternation_ratio * 5  # Max 5 points from alternation
    
    # Factor 3: Technical content indicators
    full_text = " ".join(m["text"] for m in messages)
    
    # Code blocks
    code_blocks = full_text.count("```")
    score += min(5, code_blocks * 0.5)  # Max 5 points from code
    
    # Error indicators
    error_keywords = ["error", "exception", "failed", "traceback", "TypeError", "ValueError"]
    error_count = sum(1 for kw in error_keywords if kw.lower() in full_text.lower())
    score += min(3, error_count * 0.5)  # Max 3 points from errors
    
    # Factor 4: Total text length (log scale)
    total_chars = len(full_text)
    if total_chars > 0:
        import math
        score += min(5, math.log10(total_chars))  # Max ~5 points from length
    
    return round(score, 2)


def format_conversations_for_prompt(conversations: list[dict]) -> str:
    """
    Format conversations into a readable string for LLM prompts.
    No size limits - compression handles token management.
    """
    if not conversations:
        return "(No conversations found)"
    
    lines = []
    for i, convo in enumerate(conversations, 1):
        workspace = convo.get("workspace", "Unknown")
        chat_type = convo.get("chat_type", "unknown")
        lines.append(f"=== Conversation {i} ({workspace}) [{chat_type}] ===")
        lines.append("")
        
        for msg in convo.get("messages", []):
            role = "USER" if msg["type"] == "user" else "ASSISTANT"
            text = msg["text"]
            # No truncation - compression will handle size
            lines.append(f"[{role}]")
            lines.append(text)
            lines.append("")
        
        lines.append("")
    
    return "\n".join(lines)


def estimate_db_metrics(db_path: Path | None = None) -> dict:
    """
    Estimate database metrics for Fast Start onboarding.
    
    Returns metrics about the Cursor database to help suggest
    an appropriate time window for Theme Map generation.
    
    Args:
        db_path: Optional path to database (auto-detects if not provided)
        
    Returns:
        {
            "size_mb": float,
            "estimated_conversations_total": int,
            "estimated_conversations_per_day": float,
            "suggested_days": int,
            "confidence": "high" | "medium" | "low",
            "explanation": str,
            "db_path": str,
        }
    """
    if db_path is None:
        try:
            db_path = get_cursor_db_path()
        except (FileNotFoundError, RuntimeError) as e:
            return {
                "size_mb": 0,
                "estimated_conversations_total": 0,
                "estimated_conversations_per_day": 0,
                "suggested_days": 14,
                "confidence": "low",
                "explanation": str(e),
                "db_path": None,
            }
    
    # Get file size
    size_bytes = db_path.stat().st_size
    size_mb = size_bytes / (1024 * 1024)
    
    # Sample recent conversations to estimate density
    try:
        conn = _open_db_safe(db_path)
        cursor = conn.cursor()
        
        # Count total composer entries
        cursor.execute("SELECT COUNT(*) FROM cursorDiskKV WHERE key LIKE 'composerData:%'")
        composer_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM cursorDiskKV WHERE key LIKE 'chatData:%'")
        chat_count = cursor.fetchone()[0]
        
        total_conversations = composer_count + chat_count
        
        # Sample entries across the full date range to estimate span
        # Use RANDOM() to get a representative sample, not just recent ones
        # Increased from 200 to 1000 for better reliability
        cursor.execute("""
            SELECT value FROM cursorDiskKV 
            WHERE key LIKE 'composerData:%' OR key LIKE 'chatData:%'
            ORDER BY RANDOM()
            LIMIT 1000
        """)
        sample_rows = cursor.fetchall()
        
        _close_db_safe(conn)
        
        # Parse timestamps from sample
        timestamps = []
        for (value,) in sample_rows:
            if not value:
                continue
            try:
                if isinstance(value, bytes):
                    value = value.decode('utf-8')
                data = json.loads(value)
                
                # Try various timestamp fields
                ts = (
                    data.get("lastUpdatedAt") or 
                    data.get("createdAt") or 
                    data.get("timestamp") or 0
                )
                if ts > 0:
                    timestamps.append(ts)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
        
        # Calculate date range and density
        date_range = {"start": "", "end": ""}
        days_span = 0  # Initialize for use in fallback calculations
        if timestamps:
            min_ts = min(timestamps)
            max_ts = max(timestamps)
            days_span = max(1, (max_ts - min_ts) / (1000 * 60 * 60 * 24))
            
            # Calculate actual date range
            start_date = datetime.fromtimestamp(min_ts / 1000).strftime('%Y-%m-%d')
            end_date = datetime.fromtimestamp(max_ts / 1000).strftime('%Y-%m-%d')
            date_range = {"start": start_date, "end": end_date}
            
            # Estimate conversations per day based on sample
            convos_per_day = total_conversations / days_span if days_span > 0 else 0
            
            # Suggest days to get ~40-120 conversations
            target_convos = 80  # Middle of 40-120 range
            if convos_per_day > 0:
                suggested_days = int(target_convos / convos_per_day)
                suggested_days = max(7, min(180, suggested_days))  # Clamp 7-180
            else:
                suggested_days = 14
            
            # Determine confidence
            if len(timestamps) >= 50 and total_conversations >= 100:
                confidence = "high"
                explanation = f"Based on {total_conversations} conversations over {int(days_span)} days"
            elif len(timestamps) >= 20:
                confidence = "medium"
                explanation = f"Based on sample of {len(timestamps)} conversations"
            else:
                confidence = "low"
                explanation = "Limited data available for estimation"
        else:
            convos_per_day = 0
            suggested_days = 14
            confidence = "low"
            explanation = "Could not extract timestamps from conversations"
        
        # Also count Claude Code sessions if available
        claude_code_count = 0
        claude_code_size_mb = 0
        try:
            from .source_detector import get_claude_code_path
            claude_path = get_claude_code_path()
            if claude_path and claude_path.exists():
                # Count JSONL session files
                session_files = list(claude_path.rglob("*.jsonl"))
                claude_code_count = len(session_files)
                # Calculate size
                claude_code_size_mb = sum(f.stat().st_size for f in session_files) / (1024 * 1024)
        except Exception:
            pass  # Claude Code detection is optional
        
        # Combine totals
        combined_total = total_conversations + claude_code_count
        combined_size = size_mb + claude_code_size_mb
        
        # Update explanation to include both sources
        if claude_code_count > 0 and days_span > 0:
            explanation = f"Based on {total_conversations} Cursor + {claude_code_count} Claude Code conversations over {int(days_span)} days"
        
        # Calculate recent_500mb metrics (for choice screen)
        # This calculates how many days the most recent 500MB covers
        # Use proportional estimate: if total is X MB over Y days, 500MB covers (500/X * Y) days
        # This is mathematically correct and avoids bugs in estimate_history_metrics
        recent_500mb_metrics = None
        if combined_size >= 500 and days_span > 0:  # Only calculate if total size is >= 500MB and we have date range
            estimated_days = max(1, int((500 / combined_size) * days_span))
            recent_500mb_metrics = {
                "size_mb": 500,
                "estimated_days": estimated_days,
                "estimated_messages": int((500 / combined_size) * combined_total),
                "coverage": f"Recent {estimated_days} days"
            }
        
        # Calculate actual months from date range
        actual_months = 0
        if date_range["start"] and date_range["end"]:
            try:
                start_dt = datetime.strptime(date_range["start"], '%Y-%m-%d')
                end_dt = datetime.strptime(date_range["end"], '%Y-%m-%d')
                days_diff = (end_dt - start_dt).days
                actual_months = max(1, round(days_diff / 30.44))  # Average days per month
            except (ValueError, TypeError):
                pass
        
        result = {
            "size_mb": round(combined_size, 1),
            "estimated_conversations_total": combined_total,
            "estimated_conversations_per_day": round(convos_per_day, 1),
            "suggested_days": suggested_days,
            "confidence": confidence,
            "explanation": explanation,
            "db_path": str(db_path),
            "cursor_conversations": total_conversations,
            "claude_code_conversations": claude_code_count,
            "date_range": date_range,
            "actual_months": actual_months if actual_months > 0 else None,
        }
        
        # Include recent_500mb if calculated
        if recent_500mb_metrics:
            result["recent_500mb"] = recent_500mb_metrics
        
        return result
        
    except sqlite3.Error as e:
        return {
            "size_mb": round(size_mb, 1),
            "estimated_conversations_total": 0,
            "estimated_conversations_per_day": 0,
            "suggested_days": 14,
            "confidence": "low",
            "explanation": f"Database error: {e}",
            "db_path": str(db_path),
        }
