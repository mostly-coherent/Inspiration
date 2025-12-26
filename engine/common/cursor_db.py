"""
Cursor Database Extraction — Cross-platform support for extracting chat history.

Supports: macOS, Windows, Linux
"""

import json
import platform
import os
import sqlite3
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
    
    # Try Composer format first: data.conversation.messages
    conversation = data.get("conversation", {})
    messages_raw = conversation.get("messages", [])
    
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


def get_conversations_for_date(
    target_date: datetime.date,
    workspace_paths: list[str] | None = None,
) -> list[dict]:
    """
    Extract all conversations from the target date.
    Searches both Composer chats and regular chat conversations.
    
    Args:
        target_date: Date to extract conversations for
        workspace_paths: Optional list of workspace paths to filter by.
                        If None, returns all workspaces.
    
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
    db_path = get_cursor_db_path()
    workspace_mapping = get_workspace_mapping()
    
    # Normalize workspace paths for comparison
    if workspace_paths:
        normalized_workspaces = {os.path.normpath(p) for p in workspace_paths}
    else:
        normalized_workspaces = None
    
    # Date range for filtering (full day in local time)
    start_of_day = datetime.combine(target_date, datetime.min.time())
    end_of_day = datetime.combine(target_date + timedelta(days=1), datetime.min.time())
    
    # Convert to millisecond timestamps
    start_ts = int(start_of_day.timestamp() * 1000)
    end_ts = int(end_of_day.timestamp() * 1000)
    
    conversations = []
    
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()
        
        # Query BOTH Composer chats AND regular chat conversations
        cursor.execute("""
            SELECT key, value FROM ItemTable 
            WHERE key LIKE 'composer.composerData%'
               OR key LIKE 'workbench.panel.aichat.view.aichat.chatdata%'
        """)
        
        for key, value in cursor.fetchall():
            if not value:
                continue
            
            try:
                data = json.loads(value)
            except json.JSONDecodeError:
                continue
            
            # Determine chat type and extract workspace
            chat_type = "composer" if key.startswith("composer.composerData") else "chat"
            workspace_path = "Unknown"
            chat_id = "unknown"
            
            if chat_type == "composer":
                # Format: composer.composerData.{workspace_hash}.{composer_id}
                parts = key.split(".")
                if len(parts) >= 3:
                    workspace_hash = parts[2]
                    workspace_path = workspace_mapping.get(workspace_hash, "Unknown")
                    chat_id = parts[-1] if len(parts) >= 4 else "unknown"
            else:
                # Format: workbench.panel.aichat.view.aichat.chatdata.{workspace_hash}.{chat_id}
                parts = key.split(".")
                if len(parts) >= 6:
                    workspace_hash = parts[5]  # Usually the workspace hash
                    workspace_path = workspace_mapping.get(workspace_hash, "Unknown")
                    chat_id = parts[-1] if len(parts) >= 7 else "unknown"
            
            # Filter by workspace if specified
            if normalized_workspaces:
                norm_workspace = os.path.normpath(workspace_path)
                if norm_workspace not in normalized_workspaces:
                    continue
            
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
        raise RuntimeError(f"Failed to read Cursor database: {e}")
    
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
        Combined list of conversations from all dates
    """
    all_conversations = []
    current = start_date
    
    while current <= end_date:
        convos = get_conversations_for_date(current, workspace_paths)
        all_conversations.extend(convos)
        current += timedelta(days=1)
    
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

