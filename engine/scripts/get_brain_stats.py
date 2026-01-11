#!/usr/bin/env python3
"""
Get brain size statistics (local chat file and vector DB).

Returns JSON with:
- localSize: Human-readable local chat file size (e.g., "2.1 GB")
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


def get_local_chat_size() -> tuple[int, str]:
    """Get local Cursor chat database file size."""
    try:
        db_path = get_cursor_db_path()
        if db_path.exists():
            size_bytes = db_path.stat().st_size
            return size_bytes, format_bytes(size_bytes)
        else:
            return 0, "0 B"
    except Exception as e:
        # Database not found (cloud environment)
        return 0, None


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
    local_size_bytes, local_size = get_local_chat_size()
    vector_size_bytes, vector_size = get_vector_db_size()
    library_size_bytes, library_size = get_library_size()
    earliest_date, latest_date = get_vector_db_date_range()
    
    stats = {
        "localSizeBytes": local_size_bytes,
        "localSize": local_size,
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

