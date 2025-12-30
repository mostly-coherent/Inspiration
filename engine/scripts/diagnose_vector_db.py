#!/usr/bin/env python3
"""
Diagnostic script for vector database:
- Get actual table size
- Investigate "unknown" workspace messages
- Find earliest message
"""

import json
import sys
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

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


def get_table_size(client):
    """Get actual table size from Supabase."""
    try:
        # Query table size using PostgreSQL pg_total_relation_size
        # This requires a custom RPC function or direct SQL query
        # For now, we'll use a workaround: query pg_class if we have direct DB access
        # Otherwise, estimate from row count and average row size
        
        # Get row count
        result = client.table("cursor_messages").select("message_id", count="exact").execute()
        row_count = result.count if hasattr(result, "count") else 0
        
        # Try to get actual size via RPC (if available)
        try:
            size_result = client.rpc("get_table_size", {"table_name": "cursor_messages"}).execute()
            if size_result.data:
                size_bytes = size_result.data[0].get("size_bytes", None)
                if size_bytes:
                    return size_bytes, format_bytes(size_bytes)
        except:
            pass
        
        # Fallback: estimate from sample rows
        # Sample a few rows to estimate average size
        sample = client.table("cursor_messages").select("*").limit(100).execute()
        if sample.data and len(sample.data) > 0:
            # Estimate: each row has embedding (1536 floats * 4 bytes = 6144 bytes)
            # + text (average ~500 bytes) + metadata (~200 bytes) = ~6844 bytes per row
            avg_row_size = 6844
            estimated_bytes = row_count * avg_row_size
            return estimated_bytes, format_bytes(estimated_bytes)
        
        return None, None
    except Exception as e:
        print(f"Error getting table size: {e}", file=sys.stderr)
        return None, None


def investigate_unknown_workspace(client):
    """Investigate why many messages have workspace = 'Unknown'."""
    try:
        # Count messages by workspace - need to get all fields for samples
        result = client.table("cursor_messages").select("workspace, message_id, chat_id, chat_type, timestamp, text").execute()
        
        workspace_counts = {}
        unknown_samples = []
        
        for row in result.data:
            workspace = row.get("workspace", "Unknown")
            workspace_counts[workspace] = workspace_counts.get(workspace, 0) + 1
            
            # Collect samples of "Unknown" workspace messages
            if workspace == "Unknown" and len(unknown_samples) < 10:
                unknown_samples.append({
                    "message_id": row.get("message_id"),
                    "chat_id": row.get("chat_id"),
                    "chat_type": row.get("chat_type"),
                    "timestamp": row.get("timestamp"),
                    "text_preview": (row.get("text", "") or "")[:100],
                })
        
        return workspace_counts, unknown_samples
    except Exception as e:
        print(f"Error investigating workspace: {e}", file=sys.stderr)
        return {}, []


def find_earliest_message(client):
    """Find the earliest message in the database."""
    try:
        result = client.table("cursor_messages")\
            .select("message_id, text, timestamp, workspace, chat_id, chat_type")\
            .order("timestamp", desc=False)\
            .limit(1)\
            .execute()
        
        if result.data and len(result.data) > 0:
            msg = result.data[0]
            timestamp = msg.get("timestamp", 0)
            dt = datetime.fromtimestamp(timestamp / 1000) if timestamp > 0 else None
            
            return {
                "message_id": msg.get("message_id"),
                "timestamp": timestamp,
                "datetime": dt.isoformat() if dt else None,
                "workspace": msg.get("workspace"),
                "chat_id": msg.get("chat_id"),
                "chat_type": msg.get("chat_type"),
                "text_preview": (msg.get("text", "") or "")[:200],
            }
        
        return None
    except Exception as e:
        print(f"Error finding earliest message: {e}", file=sys.stderr)
        return None


def main():
    """Run diagnostics."""
    client = get_supabase_client()
    if not client:
        print("❌ Supabase client not available. Check SUPABASE_URL and SUPABASE_ANON_KEY in .env")
        return
    
    print("🔍 Running Vector DB Diagnostics...\n")
    
    # Get table size
    print("1. Table Size:")
    size_bytes, size_formatted = get_table_size(client)
    if size_bytes:
        print(f"   Size: {size_formatted} ({size_bytes:,} bytes)")
    else:
        print("   Could not determine table size")
    
    # Get row count
    result = client.table("cursor_messages").select("message_id", count="exact").execute()
    row_count = result.count if hasattr(result, "count") else 0
    print(f"   Row count: {row_count:,}")
    
    print("\n2. Workspace Analysis:")
    workspace_counts, unknown_samples = investigate_unknown_workspace(client)
    print(f"   Total unique workspaces: {len(workspace_counts)}")
    print(f"   Messages by workspace:")
    for workspace, count in sorted(workspace_counts.items(), key=lambda x: x[1], reverse=True)[:10]:
        percentage = (count / row_count * 100) if row_count > 0 else 0
        print(f"     {workspace}: {count:,} ({percentage:.1f}%)")
    
    if "Unknown" in workspace_counts:
        print(f"\n   ⚠️  Found {workspace_counts['Unknown']:,} messages with workspace='Unknown'")
        print(f"   Sample 'Unknown' workspace messages:")
        for sample in unknown_samples[:5]:
            timestamp = sample.get("timestamp")
            if timestamp and isinstance(timestamp, (int, float)) and timestamp > 0:
                dt = datetime.fromtimestamp(timestamp / 1000)
                dt_str = dt.isoformat()
            else:
                dt_str = "N/A"
            print(f"     - Chat: {sample['chat_id']} ({sample['chat_type']})")
            print(f"       Time: {dt_str}")
            print(f"       Preview: {sample['text_preview']}...")
    
    print("\n3. Earliest Message:")
    earliest = find_earliest_message(client)
    if earliest:
        print(f"   Message ID: {earliest['message_id']}")
        print(f"   Timestamp: {earliest['timestamp']}")
        print(f"   DateTime: {earliest['datetime']}")
        print(f"   Workspace: {earliest['workspace']}")
        print(f"   Chat ID: {earliest['chat_id']} ({earliest['chat_type']})")
        print(f"   Preview: {earliest['text_preview']}...")
    else:
        print("   No messages found")
    
    # Output JSON for API use
    output = {
        "tableSizeBytes": size_bytes,
        "tableSize": size_formatted,
        "rowCount": row_count,
        "workspaceCounts": workspace_counts,
        "unknownWorkspaceCount": workspace_counts.get("Unknown", 0),
        "unknownSamples": unknown_samples[:5],
        "earliestMessage": earliest,
    }
    
    print("\n📊 JSON Output:")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()

