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


def get_conversations_for_date(
    target_date: datetime.date,
    workspace_paths: list[str] | None = None,
) -> list[dict]:
    """
    Extract all conversations from the target date.
    
    Args:
        target_date: Date to extract conversations for
        workspace_paths: Optional list of workspace paths to filter by.
                        If None, returns all workspaces.
    
    Returns:
        List of conversation dicts:
        [
            {
                "composer_id": "...",
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
        
        # Query all composer data
        cursor.execute("""
            SELECT key, value FROM ItemTable 
            WHERE key LIKE 'composer.composerData%'
        """)
        
        for key, value in cursor.fetchall():
            if not value:
                continue
            
            try:
                data = json.loads(value)
            except json.JSONDecodeError:
                continue
            
            # Extract workspace from key
            # Format: composer.composerData.{workspace_hash}.{composer_id}
            parts = key.split(".")
            if len(parts) >= 3:
                workspace_hash = parts[2]
                workspace_path = workspace_mapping.get(workspace_hash, "Unknown")
            else:
                workspace_path = "Unknown"
            
            # Filter by workspace if specified
            if normalized_workspaces:
                norm_workspace = os.path.normpath(workspace_path)
                if norm_workspace not in normalized_workspaces:
                    continue
            
            # Extract messages
            conversation = data.get("conversation", {})
            messages_raw = conversation.get("messages", [])
            
            messages = []
            has_messages_in_range = False
            
            for msg in messages_raw:
                # Check timestamp
                ts = msg.get("timestamp", 0)
                if isinstance(ts, str):
                    try:
                        ts = int(ts)
                    except ValueError:
                        ts = 0
                
                if start_ts <= ts < end_ts:
                    has_messages_in_range = True
                
                # Extract text
                text = ""
                if "text" in msg:
                    text = msg["text"]
                elif "richText" in msg:
                    text = extract_text_from_richtext(json.dumps(msg["richText"]))
                
                if text.strip():
                    msg_type = "user" if msg.get("type") == 1 else "assistant"
                    messages.append({
                        "type": msg_type,
                        "text": text.strip(),
                        "timestamp": ts,
                    })
            
            if has_messages_in_range and messages:
                conversations.append({
                    "composer_id": parts[-1] if len(parts) >= 4 else "unknown",
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
        lines.append(f"=== Conversation {i} ({workspace}) ===")
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

