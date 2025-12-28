"""
Cursor Database Extraction — Cross-platform support for extracting chat history.

Supports: macOS, Windows, Linux
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
    
    Returns:
        Path to state.vscdb file
        
    Raises:
        FileNotFoundError: If Cursor database not found
        RuntimeError: If OS not supported
    """
    system = platform.system()
    
    if system == "Darwin":  # macOS
        db_path = Path.home() / "Library/Application Support/Cursor/User/globalStorage/state.vscdb"
    elif system == "Windows":
        appdata = os.environ.get("APPDATA", "")
        if not appdata:
            raise RuntimeError("APPDATA environment variable not set")
        db_path = Path(appdata) / "Cursor/User/globalStorage/state.vscdb"
    elif system == "Linux":
        db_path = Path.home() / ".config/Cursor/User/globalStorage/state.vscdb"
    else:
        raise RuntimeError(f"Unsupported operating system: {system}")
    
    if not db_path.exists():
        raise FileNotFoundError(
            f"Cursor database not found at {db_path}. "
            "Make sure Cursor is installed and has been used at least once."
        )
    
    return db_path


def get_workspace_storage_path() -> Path:
    """Get the workspace storage directory path."""
    system = platform.system()
    
    if system == "Darwin":
        return Path.home() / "Library/Application Support/Cursor/User/workspaceStorage"
    elif system == "Windows":
        appdata = os.environ.get("APPDATA", "")
        return Path(appdata) / "Cursor/User/workspaceStorage"
    elif system == "Linux":
        return Path.home() / ".config/Cursor/User/workspaceStorage"
    else:
        raise RuntimeError(f"Unsupported operating system: {system}")


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
                    # Decode URL encoding: file:///Users/jmbeh/Project%20Understanding
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
) -> list[dict]:
    """
    Extract messages from chat data (supports both Composer and regular chat formats).
    
    Args:
        data: Parsed JSON data from database
        start_ts: Start timestamp (milliseconds)
        end_ts: End timestamp (milliseconds)
    
    Returns:
        List of message dicts with type, text, timestamp
    """
    messages = []
    
    # Try top-level text/richText first (current Cursor format)
    # These might contain the current message being composed
    messages_raw = []
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
    
    # Try Composer format: data.conversation.messages
    if not messages_raw:
        conversation = data.get("conversation", {})
        messages_raw = conversation.get("messages", [])
    
    # If no messages in composer format, try conversationMap (new Cursor format)
    if not messages_raw:
        conversation_map = data.get("conversationMap", {})
        if isinstance(conversation_map, dict):
            # Flatten all messages from all conversations in the map
            for conv_id, conv_data in conversation_map.items():
                if isinstance(conv_data, dict):
                    conv_messages = conv_data.get("messages", [])
                    if conv_messages:
                        messages_raw.extend(conv_messages)
    
    # If no messages, try fullConversationHeadersOnly (metadata that sometimes contains richText)
    if not messages_raw:
        full_headers = data.get("fullConversationHeadersOnly", [])
        if isinstance(full_headers, list):
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
                            messages_raw.append({
                                "text": text,
                                "timestamp": ts,
                                "type": 2 if header.get("role") == "assistant" else 1,  # Assume assistant if role not specified
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
                            messages_raw.append({
                                "text": text,
                                "timestamp": ts,
                                "type": 2 if header.get("role") == "assistant" else 1,
                            })
    
    # If no messages in composer format, try regular chat format: data.messages
    if not messages_raw:
        messages_raw = data.get("messages", [])
    
    # If still no messages, try nested format: data.chat.messages
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
        
        # Filter by timestamp if provided (for date-specific queries)
        # Note: For reverse_match range queries, we want all messages, so start_ts/end_ts may be None
        # or represent the full range, so we don't filter here - filtering happens at conversation level
        if start_ts and end_ts and ts > 0:
            # Only filter if timestamps are provided AND message has a valid timestamp
            # But note: for range queries, we want messages from the entire range, not just one day
            # So this filtering is only used for single-day queries
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
    
    # Chat data is stored in globalStorage cursorDiskKV (current Cursor format)
    # Keys: composerData:{uuid} (Composer chats) and chatData:{uuid} (regular chats)
    # Also check ItemTable for backwards compatibility
    
    db_path = get_cursor_db_path()
    
    if not db_path.exists():
        print(f"⚠️  [DEBUG] Database not found at {db_path}", file=sys.stderr)
        return conversations
    
    print(f"🔍 [DEBUG] Searching globalStorage cursorDiskKV for BOTH Composer and regular chats", file=sys.stderr)
    
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()
        
        # Query cursorDiskKV for composer and chat data (current format)
        cursor.execute("""
            SELECT key, value FROM cursorDiskKV 
            WHERE key LIKE 'composerData:%'
               OR key LIKE 'chatData:%'
        """)
        
        all_rows = cursor.fetchall()
        print(f"📊 [DEBUG] Found {len(all_rows)} conversation entries in globalStorage cursorDiskKV", file=sys.stderr)
        
        for key, value in all_rows:
            if not value:
                continue
            
            try:
                # cursorDiskKV stores values as BLOB, need to decode
                if isinstance(value, bytes):
                    value_str = value.decode('utf-8')
                else:
                    value_str = value
                data = json.loads(value_str)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            
            # Determine chat type and extract ID
            # Keys are: composerData:{uuid} or chatData:{uuid}
            chat_type = "composer" if key.startswith("composerData:") else "chat"
            chat_id = key.split(":", 1)[1] if ":" in key else "unknown"
            
            # Extract workspace from conversation data if available
            workspace_path = "Unknown"
            workspace_hash: str | None = None
            if isinstance(data, dict):
                workspace_hash = (
                    data.get("workspaceHash") or 
                    data.get("workspace") or 
                    data.get("workspaceId")
                )
                # Also check context field
                if not workspace_hash and "context" in data:
                    context = data["context"]
                    if isinstance(context, dict):
                        workspace_hash = context.get("workspaceHash") or context.get("workspace")
                
                if workspace_hash and workspace_hash in workspace_mapping:
                    workspace_path = workspace_mapping[workspace_hash]
            
            # MVP: Search ALL workspaces regardless of filter (non-negotiable)
            # Only filter if workspace_paths is explicitly provided AND we have a valid workspace_hash
            # If workspace_hash is missing (common in composerData), include the conversation anyway
            if normalized_workspaces and workspace_hash:
                norm_workspace = os.path.normpath(workspace_path)
                if norm_workspace not in normalized_workspaces:
                    continue
            # If normalized_workspaces is None (search all) OR workspace_hash is missing, include the conversation
            
            # Extract messages using unified function
            messages = extract_messages_from_chat_data(data, start_ts, end_ts)
            
            # Check if any messages are in the date range
            has_messages_in_range = any(
                start_ts <= msg["timestamp"] < end_ts 
                for msg in messages
            )
            
            if has_messages_in_range and messages:
                conversations.append({
                    "chat_id": chat_id,
                    "chat_type": chat_type,
                    "workspace": workspace_path,
                    "messages": messages,
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
    Extract all conversations for a date range.
    
    Args:
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
        workspace_paths: Optional list of workspace paths to filter by
    
    Returns:
        Combined list of conversations from all dates.
        Note: Conversations are deduplicated by chat_id+workspace, and messages
        from all days in the range are included (not filtered to specific days).
    """
    print(f"📅 [DEBUG] get_conversations_for_range: {start_date} to {end_date}", file=sys.stderr)
    if workspace_paths:
        print(f"🔍 [DEBUG] Workspace filter: {workspace_paths}", file=sys.stderr)
    
    # Calculate timestamp range for the entire period
    start_of_range = datetime.combine(start_date, datetime.min.time())
    end_of_range = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
    start_ts = int(start_of_range.timestamp() * 1000)
    end_ts = int(end_of_range.timestamp() * 1000)
    
    print(f"⏰ [DEBUG] Timestamp range: {start_ts} to {end_ts} ({start_of_range} to {end_of_range})", file=sys.stderr)
    
    # Get all conversations that have activity in ANY day of the range
    # We'll collect unique conversations and include ALL their messages (not filtered by day)
    conversation_map: dict[str, dict] = {}  # key: f"{workspace}:{chat_id}:{chat_type}"
    
    current = start_date
    total_days = (end_date - start_date).days + 1
    days_processed = 0
    
    while current <= end_date:
        days_processed += 1
        if days_processed % 10 == 0 or days_processed == total_days:
            print(f"  [DEBUG] Processing day {days_processed}/{total_days}: {current}", file=sys.stderr)
        
        # Get conversations for this day (but we'll merge messages across days)
        # Temporarily disable cache to see what's actually being found
        convos = get_conversations_for_date(current, workspace_paths, use_cache=False)
        
        if convos:
            print(f"  [DEBUG] Day {current}: Found {len(convos)} conversations", file=sys.stderr)
        
        for convo in convos:
            workspace = convo.get("workspace", "Unknown")
            chat_id = convo.get("chat_id", "unknown")
            chat_type = convo.get("chat_type", "unknown")
            key = f"{workspace}:{chat_id}:{chat_type}"
            
            if key not in conversation_map:
                # New conversation - add it
                conversation_map[key] = {
                    "chat_id": chat_id,
                    "chat_type": chat_type,
                    "workspace": workspace,
                    "messages": [],
                }
            
            # Add messages from this day (they're already filtered to this day by get_conversations_for_date)
            existing_messages = conversation_map[key]["messages"]
            new_messages = convo.get("messages", [])
            
            # Merge messages, avoiding duplicates by timestamp
            existing_timestamps = {msg["timestamp"] for msg in existing_messages}
            for msg in new_messages:
                if msg["timestamp"] not in existing_timestamps:
                    existing_messages.append(msg)
        
        current += timedelta(days=1)
    
    print(f"📊 [DEBUG] Collected {len(conversation_map)} unique conversations", file=sys.stderr)
    
    # Convert map to list and filter messages to the full date range
    all_conversations = []
    for convo in conversation_map.values():
        # Filter messages to the full date range (in case some were outside)
        filtered_messages = [
            msg for msg in convo["messages"]
            if start_ts <= msg["timestamp"] < end_ts
        ]
        if filtered_messages:
            convo["messages"] = filtered_messages
            all_conversations.append(convo)
            print(f"  [DEBUG] Conversation {convo['chat_id']} ({convo['chat_type']}) in {convo['workspace']}: {len(filtered_messages)} messages", file=sys.stderr)
    
    print(f"✅ [DEBUG] Returning {len(all_conversations)} conversations with {sum(len(c['messages']) for c in all_conversations)} total messages", file=sys.stderr)
    
    return all_conversations


def format_conversations_for_prompt(conversations: list[dict]) -> str:
    """
    Format conversations into a readable string for LLM prompts.
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
            # Truncate very long messages
            if len(text) > 2000:
                text = text[:2000] + "... (truncated)"
            lines.append(f"[{role}]")
            lines.append(text)
            lines.append("")
        
        lines.append("")
    
    return "\n".join(lines)

