#!/usr/bin/env python3
"""
Check the local SQLite database directly (bypassing Vector DB) to see
what messages are actually stored in the Cursor database file.
"""

import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.cursor_db import get_cursor_db_path, get_workspace_mapping


def extract_text_from_richtext(richtext_json: str) -> str:
    """Extract plain text from richText JSON."""
    try:
        data = json.loads(richtext_json)
        if isinstance(data, list):
            text_parts = []
            for item in data:
                if isinstance(item, dict):
                    if "text" in item:
                        text_parts.append(item["text"])
                    elif "content" in item:
                        text_parts.append(str(item["content"]))
            return "".join(text_parts)
        elif isinstance(data, dict):
            return data.get("text", str(data))
        return str(data)
    except:
        return ""


def check_sqlite_directly():
    """Check SQLite database directly for messages."""
    print("🔍 Checking Local SQLite Database Directly...\n")
    
    db_path = get_cursor_db_path()
    print(f"📁 Database: {db_path}")
    print(f"   Size: {db_path.stat().st_size / (1024*1024):.1f} MB\n")
    
    workspace_mapping = get_workspace_mapping()
    print(f"🗺️  Workspace mapping: {len(workspace_mapping)} workspaces\n")
    
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    cursor = conn.cursor()
    
    # Check cursorDiskKV for composerData and chatData
    print("📊 Checking cursorDiskKV table...")
    cursor.execute("""
        SELECT key, value FROM cursorDiskKV 
        WHERE key LIKE 'composerData:%' OR key LIKE 'chatData:%'
        LIMIT 100
    """)
    
    rows = cursor.fetchall()
    print(f"   Found {len(rows)} entries (showing first 100)\n")
    
    # Analyze timestamps
    all_timestamps = []
    july_timestamps = []
    aug_timestamps = []
    sept_timestamps = []
    oct_timestamps = []
    
    for key, value in rows[:50]:  # Check first 50
        try:
            if value is None:
                continue
            
            if isinstance(value, bytes):
                value_str = value.decode('utf-8')
            else:
                value_str = value
            
            if not value_str:
                continue
            
            data = json.loads(value_str)
            
            # Extract timestamps from various places
            timestamps = []
            
            # Check top-level timestamps
            if "createdAt" in data:
                ts = data["createdAt"]
                if isinstance(ts, (int, float)) and ts > 0:
                    timestamps.append(ts)
            
            if "lastUpdatedAt" in data:
                ts = data["lastUpdatedAt"]
                if isinstance(ts, (int, float)) and ts > 0:
                    timestamps.append(ts)
            
            # Check headers for timestamps
            if "headers" in data and isinstance(data["headers"], list):
                for header in data["headers"]:
                    if isinstance(header, dict):
                        ts = header.get("timestamp") or header.get("createdAt")
                        if ts and isinstance(ts, (int, float)) and ts > 0:
                            timestamps.append(ts)
            
            # Check messages array
            if "messages" in data and isinstance(data["messages"], list):
                for msg in data["messages"]:
                    if isinstance(msg, dict):
                        ts = msg.get("timestamp") or msg.get("createdAt")
                        if ts and isinstance(ts, (int, float)) and ts > 0:
                            timestamps.append(ts)
            
            # Categorize timestamps
            for ts in timestamps:
                all_timestamps.append(ts)
                dt = datetime.fromtimestamp(ts / 1000)
                
                if dt.year == 2025:
                    if dt.month == 7:
                        july_timestamps.append((ts, key, data))
                    elif dt.month == 8:
                        aug_timestamps.append((ts, key, data))
                    elif dt.month == 9:
                        sept_timestamps.append((ts, key, data))
                    elif dt.month == 10:
                        oct_timestamps.append((ts, key, data))
        
        except (json.JSONDecodeError, UnicodeDecodeError, KeyError, ValueError) as e:
            continue
    
    print(f"📅 Timestamp Analysis (from first 50 entries):")
    print(f"   Total timestamps found: {len(all_timestamps)}")
    print(f"   July 2025: {len(july_timestamps)}")
    print(f"   August 2025: {len(aug_timestamps)}")
    print(f"   September 2025: {len(sept_timestamps)}")
    print(f"   October 2025: {len(oct_timestamps)}\n")
    
    if july_timestamps:
        july_timestamps.sort(key=lambda x: x[0])
        earliest_july = july_timestamps[0]
        print(f"✅ Earliest July message:")
        print(f"   Timestamp: {earliest_july[0]}")
        print(f"   DateTime: {datetime.fromtimestamp(earliest_july[0] / 1000).isoformat()}")
        print(f"   Key: {earliest_july[1]}")
        print()
    
    if not july_timestamps and not aug_timestamps and not sept_timestamps:
        print("⚠️  No July/August/September messages found in first 50 entries")
        print("   This could mean:")
        print("   1. Messages are stored differently")
        print("   2. Messages were deleted/archived")
        print("   3. Need to check more entries")
        print()
    
    # Check ItemTable as well
    print("📊 Checking ItemTable (legacy format)...")
    try:
        cursor.execute("""
            SELECT key, value FROM ItemTable 
            WHERE key LIKE 'composer.composerData%' OR key LIKE 'workbench.panel.aichat%'
            LIMIT 50
        """)
        item_rows = cursor.fetchall()
        print(f"   Found {len(item_rows)} entries\n")
        
        # Quick check for July timestamps in ItemTable
        july_in_itemtable = 0
        for key, value in item_rows:
            try:
                if isinstance(value, bytes):
                    value_str = value.decode('utf-8')
                else:
                    value_str = value
                data = json.loads(value_str)
                # Check for timestamps
                if "createdAt" in data:
                    ts = data["createdAt"]
                    if isinstance(ts, (int, float)):
                        dt = datetime.fromtimestamp(ts / 1000)
                        if dt.year == 2025 and dt.month == 7:
                            july_in_itemtable += 1
            except:
                continue
        
        if july_in_itemtable > 0:
            print(f"   Found {july_in_itemtable} entries with July 2025 timestamps")
    except sqlite3.OperationalError:
        print("   ItemTable not found or not accessible")
    
    conn.close()
    
    # Summary
    print(f"\n📋 Summary:")
    print(f"   Database file exists: ✅ ({db_path.stat().st_size / (1024*1024):.1f} MB)")
    print(f"   Workspaces mapped: {len(workspace_mapping)}")
    print(f"   July 2025 messages in sample: {len(july_timestamps)}")
    print(f"   August 2025 messages in sample: {len(aug_timestamps)}")
    print(f"   September 2025 messages in sample: {len(sept_timestamps)}")
    print(f"   October 2025 messages in sample: {len(oct_timestamps)}")
    
    if len(july_timestamps) == 0 and len(aug_timestamps) == 0 and len(sept_timestamps) == 0:
        print(f"\n⚠️  No July-September messages found in sampled entries.")
        print(f"   Possible reasons:")
        print(f"   1. Messages may be stored in a different format/location")
        print(f"   2. Messages may have been archived or moved")
        print(f"   3. Cursor may have started storing chats differently in October")
        print(f"   4. Need to check ALL entries (not just first 50)")


if __name__ == "__main__":
    check_sqlite_directly()

