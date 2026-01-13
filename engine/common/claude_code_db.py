"""
Claude Code Database — Extract chat messages from Claude Code's JSONL storage.

Claude Code stores conversations in JSON Lines format:
  ~/.claude/projects/{url-encoded-workspace}/{session-uuid}.jsonl
  ~/.claude/projects/{url-encoded-workspace}/{session-uuid}/subagents/agent-{id}.jsonl

Each line is a JSON event (user message, assistant response, metadata, etc.).
This module parses these files and extracts messages compatible with the sync pipeline.
"""

import json
import sys
from pathlib import Path
from datetime import datetime, date, timedelta
from urllib.parse import unquote
from typing import List, Dict, Optional
import os


def get_claude_code_projects_path() -> Optional[Path]:
    """
    Get Claude Code projects directory.

    Returns:
        Path to .claude/projects directory, or None if not found.
    """
    from .source_detector import get_claude_code_path
    return get_claude_code_path()


def decode_workspace_name(encoded: str) -> str:
    """
    Decode URL-encoded workspace directory name.

    Examples:
        "-Users-username-Personal-Workspace" → "/Users/username/Personal Workspace"
        "-C-Users-test-Projects" → "/C/Users/test/Projects"

    Args:
        encoded: URL-encoded directory name (with leading dash).

    Returns:
        Decoded absolute path.
    """
    decoded = unquote(encoded)

    # Handle leading dash → root path
    if decoded.startswith("-"):
        # Remove leading dash and replace with /
        decoded = "/" + decoded[1:]

    return decoded


def parse_message_content(content_blocks: List[Dict]) -> str:
    """
    Extract text from Claude Code message content blocks.

    Content can include:
    - {"type": "text", "text": "..."}
    - {"type": "tool_use", "name": "Read", "input": {...}}
    - {"type": "tool_result", "tool_use_id": "...", "content": "..."}

    Args:
        content_blocks: List of content block dicts from message.

    Returns:
        Combined text content.
    """
    text_parts = []

    # Handle edge case where content might be a string instead of list
    if isinstance(content_blocks, str):
        return content_blocks

    # Handle edge case where content might not be a list
    if not isinstance(content_blocks, list):
        return ""

    for block in content_blocks:
        # Skip if block is not a dict
        if not isinstance(block, dict):
            continue

        block_type = block.get("type")

        if block_type == "text":
            text_parts.append(block.get("text", ""))
        elif block_type == "tool_use":
            # Include tool usage context (helpful for understanding what the assistant did)
            tool_name = block.get("name", "unknown")
            text_parts.append(f"[Tool: {tool_name}]")
        elif block_type == "tool_result":
            # Optionally include tool results (can be verbose)
            # For MVP, skip tool results to keep messages concise
            pass

    return " ".join(text_parts).strip()


def parse_jsonl_session(session_file: Path) -> List[Dict]:
    """
    Parse single Claude Code JSONL session file.

    Args:
        session_file: Path to .jsonl file.

    Returns:
        List of message dicts with keys:
            - type: "user" | "assistant"
            - text: Message text content
            - timestamp: Timestamp in milliseconds
            - metadata: Dict with uuid, session_id, version, cwd, git_branch, usage
    """
    messages = []
    line_num = 0

    try:
        with open(session_file, 'r', encoding='utf-8') as f:
            for line in f:
                line_num += 1
                line = line.strip()
                if not line:
                    continue

                try:
                    event = json.loads(line)

                    # Only process user/assistant messages
                    event_type = event.get("type")
                    if event_type not in ("user", "assistant"):
                        continue

                    message_obj = event.get("message", {})
                    content_blocks = message_obj.get("content", [])

                    # Extract text content
                    text = parse_message_content(content_blocks)
                    if not text:
                        continue

                    # Parse timestamp
                    timestamp_str = event.get("timestamp")
                    if not timestamp_str:
                        print(f"⚠️  No timestamp for message in {session_file.name}:{line_num}, skipping",
                              file=sys.stderr)
                        continue

                    # Convert ISO8601 → milliseconds
                    try:
                        dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                        timestamp_ms = int(dt.timestamp() * 1000)
                    except ValueError as e:
                        print(f"⚠️  Invalid timestamp format in {session_file.name}:{line_num}: {e}",
                              file=sys.stderr)
                        continue

                    # Extract metadata
                    usage = message_obj.get("usage", {}) if event_type == "assistant" else None

                    messages.append({
                        "type": "user" if event_type == "user" else "assistant",
                        "text": text,
                        "timestamp": timestamp_ms,
                        "metadata": {
                            "uuid": event.get("uuid"),
                            "session_id": event.get("sessionId"),
                            "version": event.get("version"),
                            "cwd": event.get("cwd"),
                            "git_branch": event.get("gitBranch"),
                            "is_subagent": False,
                            "usage": usage,
                        }
                    })

                except json.JSONDecodeError as e:
                    print(f"⚠️  Skipping malformed JSONL line {line_num} in {session_file.name}: {e}",
                          file=sys.stderr)
                    continue

    except Exception as e:
        print(f"⚠️  Error reading {session_file}: {e}", file=sys.stderr)
        return []

    return messages


def find_subagent_sessions(workspace_dir: Path, session_id: str) -> List[Path]:
    """
    Find subagent JSONL files for a session.

    Subagents are stored in:
      {workspace_dir}/{session_id}/subagents/agent-{id}.jsonl

    Args:
        workspace_dir: Path to workspace directory.
        session_id: Session UUID (without .jsonl extension).

    Returns:
        List of subagent JSONL file paths.
    """
    subagent_dir = workspace_dir / session_id / "subagents"
    if not subagent_dir.exists():
        return []

    return list(subagent_dir.glob("agent-*.jsonl"))


def parse_subagent_sessions(workspace_dir: Path, session_id: str) -> List[Dict]:
    """
    Parse all subagent conversations for a session.

    Args:
        workspace_dir: Path to workspace directory.
        session_id: Session UUID.

    Returns:
        List of message dicts (same format as parse_jsonl_session),
        with metadata.is_subagent = True.
    """
    subagent_files = find_subagent_sessions(workspace_dir, session_id)
    all_messages = []

    for subagent_file in subagent_files:
        messages = parse_jsonl_session(subagent_file)
        # Mark as subagent messages
        for msg in messages:
            msg["metadata"]["is_subagent"] = True
            msg["metadata"]["subagent_file"] = subagent_file.name
        all_messages.extend(messages)

    return all_messages


def get_conversations_for_date(target_date: date, workspace_paths: List[str]) -> List[Dict]:
    """
    Get Claude Code conversations for a specific date.

    API-compatible with cursor_db.get_conversations_for_date().

    Args:
        target_date: Date to fetch conversations for.
        workspace_paths: List of workspace paths to include.

    Returns:
        List of conversation dicts with keys:
            - chat_id: Session UUID
            - chat_type: "claude_code_session"
            - workspace: Workspace path
            - messages: List of message dicts
    """
    projects_path = get_claude_code_projects_path()
    if not projects_path:
        print(f"ℹ️  No Claude Code directory found, skipping", file=sys.stderr)
        return []

    conversations = []
    target_ts = int(datetime.combine(target_date, datetime.min.time()).timestamp() * 1000)
    next_day_ts = target_ts + (24 * 60 * 60 * 1000)

    # Normalize workspace paths for matching
    normalized_workspaces = {os.path.normpath(p) for p in workspace_paths}

    # Iterate through workspace directories
    for workspace_dir in projects_path.iterdir():
        if not workspace_dir.is_dir():
            continue

        # Find all session JSONL files (top-level only, not in subdirectories)
        session_files = [f for f in workspace_dir.glob("*.jsonl") if f.is_file()]

        for session_file in session_files:
            session_id = session_file.stem

            # Parse main session
            messages = parse_jsonl_session(session_file)

            # Parse subagents
            subagent_messages = parse_subagent_sessions(workspace_dir, session_id)
            messages.extend(subagent_messages)

            # Skip if no messages
            if not messages:
                continue

            # Extract actual workspace from message metadata (cwd field)
            # Use the first message's cwd as the session workspace
            actual_workspace = messages[0]["metadata"].get("cwd")
            if not actual_workspace:
                # Fallback to decoded directory name if cwd not available
                try:
                    actual_workspace = decode_workspace_name(workspace_dir.name)
                except Exception:
                    continue

            # Normalize and check if this workspace is in user's config
            normalized_actual = os.path.normpath(actual_workspace)
            if normalized_actual not in normalized_workspaces:
                continue

            # Filter by date
            messages_on_date = [
                msg for msg in messages
                if target_ts <= msg["timestamp"] < next_day_ts
            ]

            if messages_on_date:
                conversations.append({
                    "chat_id": session_id,
                    "chat_type": "claude_code_session",
                    "workspace": normalized_actual,
                    "messages": messages_on_date,
                })

    return conversations


def get_claude_code_conversations(
    start_date: date,
    end_date: date,
    workspace_paths: List[str]
) -> List[Dict]:
    """
    Get Claude Code conversations for date range.

    API-compatible with cursor_db module.

    Args:
        start_date: Start date (inclusive).
        end_date: End date (inclusive).
        workspace_paths: List of workspace paths to include.

    Returns:
        List of conversation dicts (same format as get_conversations_for_date).
    """
    all_conversations = []
    current_date = start_date

    while current_date <= end_date:
        conversations = get_conversations_for_date(current_date, workspace_paths)
        all_conversations.extend(conversations)
        current_date = date.fromordinal(current_date.toordinal() + 1)

    return all_conversations


if __name__ == "__main__":
    # CLI testing
    import sys
    from datetime import date, timedelta

    print("🧪 Testing Claude Code extraction...")
    print()

    # Detect Claude Code
    projects_path = get_claude_code_projects_path()
    if not projects_path:
        print("❌ No Claude Code directory found")
        sys.exit(1)

    print(f"✅ Found Claude Code projects: {projects_path}")
    print()

    # Test date range (last 7 days)
    end_date = date.today()
    start_date = end_date - timedelta(days=7)

    # Test with current workspace
    workspace_path = os.getcwd()
    print(f"Testing with workspace: {workspace_path}")
    print(f"Date range: {start_date} to {end_date}")
    print()

    conversations = get_claude_code_conversations(start_date, end_date, [workspace_path])

    print(f"📊 Found {len(conversations)} conversations")
    for conv in conversations[:3]:  # Show first 3
        print(f"  - Session {conv['chat_id'][:8]}...: {len(conv['messages'])} messages")
