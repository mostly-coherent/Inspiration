#!/usr/bin/env python3
"""
Check local Cursor chat history to see what messages are actually stored.
Find the earliest messages and check date ranges.
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.cursor_db import (
    get_cursor_db_path,
    get_conversations_for_range,
    get_workspace_mapping,
)


def format_timestamp(ts: int) -> str:
    """Format timestamp to readable date."""
    if not ts or ts == 0:
        return "N/A"
    try:
        dt = datetime.fromtimestamp(ts / 1000)
        return dt.isoformat()
    except:
        return f"Invalid: {ts}"


def analyze_local_database():
    """Analyze the local Cursor database."""
    print("🔍 Analyzing Local Cursor Chat History...\n")
    
    try:
        db_path = get_cursor_db_path()
        print(f"📁 Database path: {db_path}")
        print(f"   Exists: {db_path.exists()}")
        if db_path.exists():
            size = db_path.stat().st_size
            print(f"   Size: {size:,} bytes ({size / (1024*1024):.1f} MB)\n")
    except Exception as e:
        print(f"❌ Could not access database: {e}\n")
        return
    
    # Get workspace mapping
    workspace_mapping = get_workspace_mapping()
    print(f"🗺️  Workspace mapping: {len(workspace_mapping)} workspaces found")
    for hash_val, path in list(workspace_mapping.items())[:5]:
        print(f"   {hash_val[:20]}... -> {path}")
    print()
    
    # Check date range: July 2025 to now
    start_date = datetime(2025, 7, 1).date()
    end_date = datetime.now().date()
    
    print(f"📅 Checking date range: {start_date} to {end_date}\n")
    
    # Get conversations for July 2025
    print("📊 July 2025:")
    july_conversations = get_conversations_for_range(
        datetime(2025, 7, 1).date(),
        datetime(2025, 7, 31).date(),
        workspace_paths=None
    )
    print(f"   Conversations found: {len(july_conversations)}")
    
    july_messages = []
    for conv in july_conversations:
        july_messages.extend(conv.get("messages", []))
    print(f"   Total messages: {len(july_messages)}")
    
    if july_messages:
        july_messages.sort(key=lambda m: m.get("timestamp", 0))
        earliest_july = july_messages[0]
        latest_july = july_messages[-1]
        print(f"   Earliest: {format_timestamp(earliest_july.get('timestamp', 0))}")
        print(f"   Latest: {format_timestamp(latest_july.get('timestamp', 0))}")
        print(f"   Preview: {earliest_july.get('text', '')[:100]}...")
    print()
    
    # Check August 2025
    print("📊 August 2025:")
    aug_conversations = get_conversations_for_range(
        datetime(2025, 8, 1).date(),
        datetime(2025, 8, 31).date(),
        workspace_paths=None
    )
    print(f"   Conversations found: {len(aug_conversations)}")
    
    aug_messages = []
    for conv in aug_conversations:
        aug_messages.extend(conv.get("messages", []))
    print(f"   Total messages: {len(aug_messages)}")
    print()
    
    # Check September 2025
    print("📊 September 2025:")
    sept_conversations = get_conversations_for_range(
        datetime(2025, 9, 1).date(),
        datetime(2025, 9, 30).date(),
        workspace_paths=None
    )
    print(f"   Conversations found: {len(sept_conversations)}")
    
    sept_messages = []
    for conv in sept_conversations:
        sept_messages.extend(conv.get("messages", []))
    print(f"   Total messages: {len(sept_messages)}")
    print()
    
    # Check October 2025 (where we know messages exist)
    print("📊 October 2025:")
    oct_conversations = get_conversations_for_range(
        datetime(2025, 10, 1).date(),
        datetime(2025, 10, 31).date(),
        workspace_paths=None
    )
    print(f"   Conversations found: {len(oct_conversations)}")
    
    oct_messages = []
    for conv in oct_conversations:
        oct_messages.extend(conv.get("messages", []))
    print(f"   Total messages: {len(oct_messages)}")
    
    if oct_messages:
        oct_messages.sort(key=lambda m: m.get("timestamp", 0))
        earliest_oct = oct_messages[0]
        print(f"   Earliest: {format_timestamp(earliest_oct.get('timestamp', 0))}")
        print(f"   Preview: {earliest_oct.get('text', '')[:100]}...")
    print()
    
    # Find absolute earliest message across all dates
    print("🔍 Finding absolute earliest message in local database...")
    all_conversations = get_conversations_for_range(
        start_date,
        end_date,
        workspace_paths=None
    )
    
    all_messages = []
    for conv in all_conversations:
        for msg in conv.get("messages", []):
            ts = msg.get("timestamp", 0)
            if ts and ts > 0:
                all_messages.append({
                    "timestamp": ts,
                    "text": msg.get("text", "")[:200],
                    "workspace": conv.get("workspace", "Unknown"),
                    "chat_id": conv.get("chat_id", "unknown"),
                    "chat_type": conv.get("chat_type", "unknown"),
                    "type": msg.get("type", "unknown"),
                })
    
    if all_messages:
        all_messages.sort(key=lambda m: m["timestamp"])
        earliest = all_messages[0]
        print(f"\n✅ Earliest message found:")
        print(f"   Timestamp: {earliest['timestamp']}")
        print(f"   DateTime: {format_timestamp(earliest['timestamp'])}")
        print(f"   Workspace: {earliest['workspace']}")
        print(f"   Chat ID: {earliest['chat_id']} ({earliest['chat_type']})")
        print(f"   Type: {earliest['type']}")
        print(f"   Preview: {earliest['text']}...")
        
        # Show distribution by month
        print(f"\n📈 Message distribution:")
        monthly_counts = {}
        for msg in all_messages:
            dt = datetime.fromtimestamp(msg["timestamp"] / 1000)
            month_key = dt.strftime("%Y-%m")
            monthly_counts[month_key] = monthly_counts.get(month_key, 0) + 1
        
        for month in sorted(monthly_counts.keys()):
            print(f"   {month}: {monthly_counts[month]:,} messages")
    else:
        print("❌ No messages found in date range")
    
    # Check if there are messages before July 2025
    print(f"\n🔍 Checking for messages before July 2025...")
    early_start = datetime(2024, 1, 1).date()
    early_conversations = get_conversations_for_range(
        early_start,
        datetime(2025, 6, 30).date(),
        workspace_paths=None
    )
    
    early_messages = []
    for conv in early_conversations:
        early_messages.extend(conv.get("messages", []))
    
    if early_messages:
        early_messages.sort(key=lambda m: m.get("timestamp", 0))
        earliest_early = early_messages[0]
        print(f"   Found {len(early_messages)} messages before July 2025")
        print(f"   Earliest: {format_timestamp(earliest_early.get('timestamp', 0))}")
    else:
        print(f"   No messages found before July 2025")


if __name__ == "__main__":
    analyze_local_database()

