"""
Source Detector — Auto-detect available chat history sources on user's system.

Supports:
- Cursor (macOS, Windows)
- Claude (Code mode + Cowork mode via Desktop app) (macOS, Windows, Linux)

Returns detection report with paths, formats, and platform info.
"""

import os
import platform
from pathlib import Path
from typing import List, Optional


class ChatSource:
    """Represents a detected chat history source."""

    def __init__(self, name: str, path: Path, format: str, platform_name: str):
        """
        Initialize a chat source.

        Args:
            name: Source identifier ("cursor" | "claude_code")
            path: Path to storage location
            format: Storage format ("sqlite" | "jsonl")
            platform_name: Platform ("Darwin" | "Windows" | "Linux")
        """
        self.name = name
        self.path = path
        self.format = format
        self.platform = platform_name

    def __repr__(self):
        return f"ChatSource(name='{self.name}', path='{self.path}', format='{self.format}')"


def get_cursor_path() -> Optional[Path]:
    """
    Auto-detect Cursor database location.

    Returns:
        Path to Cursor's state.vscdb file, or None if not found.
    """
    system = platform.system()

    if system == "Darwin":  # macOS
        base = Path.home() / "Library/Application Support/Cursor/User/globalStorage"
    elif system == "Windows":
        appdata = os.getenv("APPDATA")
        if not appdata:
            return None
        base = Path(appdata) / "Cursor/User/globalStorage"
    else:
        return None  # Linux not supported for Cursor

    db_path = base / "state.vscdb"
    return db_path if db_path.exists() else None


def get_claude_code_path() -> Optional[Path]:
    """
    Auto-detect Claude Code projects location.

    Returns:
        Path to .claude/projects directory, or None if not found.
    """
    system = platform.system()

    if system == "Darwin":  # macOS
        base = Path.home() / ".claude/projects"
    elif system == "Windows":
        appdata = os.getenv("APPDATA")
        if not appdata:
            # Fallback to home directory
            base = Path.home() / ".claude/projects"
        else:
            base = Path(appdata) / "Claude/projects"
    else:  # Linux
        base = Path.home() / ".claude/projects"

    return base if base.exists() else None


def get_claude_cowork_project_paths() -> List[Path]:
    """
    Auto-detect Claude Desktop Cowork session directories.

    Cowork stores JSONL sessions in the same format as Claude Code, but under:
      ~/Library/Application Support/Claude/local-agent-mode-sessions/
        {session-group-id}/{account-id}/local_{session-id}/.claude/projects/

    Returns:
        List of .claude/projects/ Paths found within Cowork sessions (may be empty).
    """
    system = platform.system()

    if system == "Darwin":  # macOS
        base = Path.home() / "Library/Application Support/Claude/local-agent-mode-sessions"
    elif system == "Windows":
        appdata = os.getenv("APPDATA")
        if not appdata:
            return []
        base = Path(appdata) / "Claude/local-agent-mode-sessions"
    else:  # Linux
        return []  # Cowork currently macOS-only

    if not base.exists():
        return []

    project_paths = []

    # Walk: {session-group}/{account-id}/local_{session-id}/.claude/projects/
    for session_group in base.iterdir():
        if not session_group.is_dir():
            continue
        for account_dir in session_group.iterdir():
            if not account_dir.is_dir():
                continue
            for local_dir in account_dir.iterdir():
                if not local_dir.is_dir() or not local_dir.name.startswith("local_"):
                    continue
                projects_dir = local_dir / ".claude" / "projects"
                if projects_dir.exists() and projects_dir.is_dir():
                    project_paths.append(projects_dir)

    return project_paths


def detect_sources() -> List[ChatSource]:
    """
    Auto-detect all available chat history sources on the system.

    Returns:
        List of detected ChatSource objects.
    """
    sources = []
    system = platform.system()

    # Detect Cursor
    cursor_path = get_cursor_path()
    if cursor_path:
        sources.append(ChatSource(
            name="cursor",
            path=cursor_path,
            format="sqlite",
            platform_name=system
        ))

    # Detect Claude Code (Code mode sessions)
    claude_path = get_claude_code_path()
    if claude_path:
        sources.append(ChatSource(
            name="claude_code",
            path=claude_path,
            format="jsonl",
            platform_name=system
        ))

    # Detect Claude Desktop Cowork sessions
    cowork_paths = get_claude_cowork_project_paths()
    if cowork_paths:
        # Report the parent directory for display, individual paths used internally
        sources.append(ChatSource(
            name="claude_cowork",
            path=cowork_paths[0].parent.parent.parent.parent.parent,  # local-agent-mode-sessions dir
            format="jsonl",
            platform_name=system
        ))

    return sources


def print_detection_report(sources: List[ChatSource]) -> None:
    """
    Print human-readable detection report.

    Args:
        sources: List of detected ChatSource objects.
    """
    print("🔍 Detecting chat history sources...")
    print()

    if not sources:
        print("❌ No chat history sources detected")
        print("   Supported: Cursor, Claude Code")
        print("   Platforms: macOS (both), Windows (both), Linux (Claude Code only)")
        print()
        print("   Make sure you have:")
        print("   - Cursor installed with chat history")
        print("   - Claude Code CLI/extension with conversation history")
        return

    for source in sources:
        # Pretty print source name
        display_name = source.name.replace("_", " ").title()
        print(f"✅ {display_name}")
        print(f"   Location: {source.path}")
        print(f"   Format:   {source.format}")
        print(f"   Platform: {source.platform}")
        print()

    print(f"📊 Total sources: {len(sources)}")


def get_source_by_name(sources: List[ChatSource], name: str) -> Optional[ChatSource]:
    """
    Get a source by name from the detected sources.

    Args:
        sources: List of detected sources.
        name: Source name to find ("cursor" | "claude_code").

    Returns:
        ChatSource object if found, None otherwise.
    """
    for source in sources:
        if source.name == name:
            return source
    return None


if __name__ == "__main__":
    # CLI testing
    detected = detect_sources()
    print_detection_report(detected)
