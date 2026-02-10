#!/usr/bin/env python3
"""
Get brain size statistics (all local sources + vector DB).

Returns JSON with:
- localSize: Total raw size of ALL local sources (Cursor DB + Claude JSONL + workspace files)
- vectorSize: Human-readable vector DB size (e.g., "200 MB")
- localSizeBytes: Size in bytes
- vectorSizeBytes: Size in bytes
"""

import json
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.cursor_db import get_cursor_db_path
from common.source_detector import get_claude_code_path, get_claude_cowork_project_paths
from common.config import load_config
from common.vector_db import get_supabase_client


def format_bytes(bytes_size: int) -> str:
    """Format bytes to human-readable size."""
    if bytes_size is None or bytes_size == 0:
        return "0 B"
    
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} PB"


def _dir_total_size(dir_path: Path) -> int:
    """Recursively sum file sizes in a directory."""
    total = 0
    try:
        for f in dir_path.rglob("*"):
            if f.is_file():
                total += f.stat().st_size
    except (PermissionError, OSError):
        pass
    return total


def get_local_source_sizes() -> dict:
    """
    Get raw sizes for each local source.

    Returns dict with keys: cursor_bytes, claude_bytes, workspace_bytes, total_bytes, total_formatted.
    """
    cursor_bytes = 0
    claude_bytes = 0
    workspace_bytes = 0

    # 1. Cursor SQLite DB
    try:
        db_path = get_cursor_db_path()
        if db_path.exists():
            cursor_bytes = db_path.stat().st_size
    except Exception:
        pass

    # 2. Claude Code JSONL (all files under ~/.claude/projects/)
    try:
        code_path = get_claude_code_path()
        if code_path:
            claude_bytes += _dir_total_size(code_path)
    except Exception:
        pass

    # 3. Claude Cowork JSONL sessions
    try:
        for projects_dir in get_claude_cowork_project_paths():
            claude_bytes += _dir_total_size(projects_dir)
    except Exception:
        pass

    # 4. Workspace files (only .md files + code files the scanner processes)
    try:
        from common.workspace_scanner import CODE_EXTENSIONS, SKIP_DIRS
        config = load_config()
        workspace_paths = config.get("workspaces", [])
        scanned_extensions = {".md"} | CODE_EXTENSIONS
        seen_files: set[str] = set()

        for ws in workspace_paths:
            ws_path = Path(ws)
            if not ws_path.exists():
                continue
            for root, dirs, files in __import__("os").walk(ws_path):
                # Skip excluded directories (same logic as workspace_scanner)
                dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
                for filename in files:
                    ext = Path(filename).suffix.lower()
                    if ext not in scanned_extensions:
                        continue
                    filepath = Path(root) / filename
                    try:
                        real = str(filepath.resolve())
                        if real not in seen_files:
                            seen_files.add(real)
                            workspace_bytes += filepath.stat().st_size
                    except (PermissionError, OSError):
                        continue
    except Exception:
        pass

    total = cursor_bytes + claude_bytes + workspace_bytes
    return {
        "cursor_bytes": cursor_bytes,
        "claude_bytes": claude_bytes,
        "workspace_bytes": workspace_bytes,
        "total_bytes": total,
        "total_formatted": format_bytes(total),
    }


def get_vector_db_date_range() -> tuple[str | None, str | None]:
    """Get date range (earliest to latest) of messages in Vector DB."""
    client = get_supabase_client()
    if not client:
        return None, None
    
    try:
        # Get earliest timestamp
        earliest_result = client.table("cursor_messages").select("timestamp").order("timestamp", desc=False).limit(1).execute()
        # Get latest timestamp
        latest_result = client.table("cursor_messages").select("timestamp").order("timestamp", desc=True).limit(1).execute()
        
        earliest_ts = None
        latest_ts = None
        
        if earliest_result.data and len(earliest_result.data) > 0:
            earliest_ts = earliest_result.data[0].get("timestamp")
        if latest_result.data and len(latest_result.data) > 0:
            latest_ts = latest_result.data[0].get("timestamp")
        
        # Convert timestamps to dates (MM-DD-YYYY format)
        from datetime import datetime
        earliest_date = None
        latest_date = None
        
        if earliest_ts:
            # Timestamps are in milliseconds
            earliest_date = datetime.fromtimestamp(earliest_ts / 1000).strftime("%m-%d-%Y")
        if latest_ts:
            latest_date = datetime.fromtimestamp(latest_ts / 1000).strftime("%m-%d-%Y")
        
        return earliest_date, latest_date
    except Exception:
        return None, None


def get_library_size() -> tuple[int, str]:
    """Get library items table size."""
    client = get_supabase_client()
    if not client:
        return 0, None
    
    # Try to get actual table size via RPC (if function exists)
    try:
        size_result = client.rpc("get_library_size").execute()
        if size_result.data:
            size_data = size_result.data if isinstance(size_result.data, dict) else {}
            total_bytes = size_data.get("total_size_bytes")
            if total_bytes:
                return total_bytes, format_bytes(total_bytes)
    except Exception:
        pass  # RPC might not exist, fall through to estimation
    
    # Fallback: estimate based on item count
    try:
        result = client.table("library_items").select("id", count="exact").execute()
        item_count = result.count if hasattr(result, "count") else 0
        
        if item_count > 0:
            # Each library item is roughly 15KB (embedding 6KB + text 2KB + metadata 7KB)
            avg_row_size = 15360  # 15 KB per item
            estimated_bytes = int(item_count * avg_row_size)
            return estimated_bytes, format_bytes(estimated_bytes)
        
        return 0, "0 B"
    except Exception:
        return 0, None


def get_vector_db_size() -> tuple[int, str]:
    """Get vector database size (actual or estimated)."""
    client = get_supabase_client()
    if not client:
        return 0, None
    
    try:
        # Get message count
        result = client.table("cursor_messages").select("message_id", count="exact").execute()
        message_count = result.count if hasattr(result, "count") else 0
        
        # Try to get actual table size via RPC (if available)
        # First, try the RPC function if it exists
        try:
            size_result = client.rpc("get_table_size", {"table_name": "cursor_messages"}).execute()
            if size_result.data:
                # RPC function returns a dict directly, not a list
                if isinstance(size_result.data, dict):
                    size_data = size_result.data
                elif isinstance(size_result.data, list) and len(size_result.data) > 0:
                    size_data = size_result.data[0]
                else:
                    size_data = size_result.data
                
                total_bytes = size_data.get("total_size_bytes")
                if total_bytes:
                    return total_bytes, format_bytes(total_bytes)
        except Exception as e:
            # RPC function doesn't exist or failed, fall back to estimation
            import sys
            print(f"⚠️  RPC function failed, using estimation: {e}", file=sys.stderr)
            pass
        
        # Fallback: Use estimation only if RPC completely fails
        # Try to query actual size using pg_size_pretty via direct SQL query
        # This is more reliable than hardcoded values
        try:
            # Try to get actual size using a direct query (if RPC doesn't work)
            # Note: This requires the service role key or proper permissions
            size_query_result = client.table("cursor_messages").select("id", count="exact").limit(1).execute()
            # If we can't get actual size, use a conservative estimate
            # Based on typical row size: embedding (6KB) + text (avg 1KB) + metadata (0.5KB) + overhead (0.5KB) = ~8KB per message
            if message_count > 0:
                # Conservative estimate: 8KB per message
                avg_row_size = 8192  # 8 KB per message (conservative estimate)
                estimated_bytes = int(message_count * avg_row_size)
            else:
                estimated_bytes = 0
        except Exception:
            # Last resort: very conservative estimate
            if message_count > 0:
                avg_row_size = 8192
                estimated_bytes = int(message_count * avg_row_size)
            else:
                estimated_bytes = 0
        
        return estimated_bytes, format_bytes(estimated_bytes)
    except Exception as e:
        # If we can't get count, return None
        return 0, None


def main():
    """Get and return brain statistics."""
    source_sizes = get_local_source_sizes()
    vector_size_bytes, vector_size = get_vector_db_size()
    library_size_bytes, library_size = get_library_size()
    earliest_date, latest_date = get_vector_db_date_range()
    
    stats = {
        "localSizeBytes": source_sizes["total_bytes"],
        "localSize": source_sizes["total_formatted"],
        "vectorSizeBytes": vector_size_bytes,
        "vectorSize": vector_size,
        "librarySizeBytes": library_size_bytes,
        "librarySize": library_size,
        "earliestDate": earliest_date,
        "latestDate": latest_date,
    }
    
    print(json.dumps(stats))


if __name__ == "__main__":
    main()

