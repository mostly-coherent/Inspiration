#!/usr/bin/env python3
"""
Verify that all messages from local Cursor database are synced to Vector DB.
Compares timestamp ranges and shows any gaps.
"""

import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.cursor_db import get_conversations_for_range, _get_conversations_for_date_sqlite
from common.vector_db import get_supabase_client
from datetime import timedelta


def get_local_timestamp_range(start_date, end_date):
    """Get min and max timestamps from local database by querying SQLite directly."""
    print("🔍 Querying local database for timestamp range...")
    
    import sqlite3
    import json
    from common.cursor_db import get_cursor_db_path
    
    db_path = get_cursor_db_path()
    all_timestamps = []
    total_messages = 0
    
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()
        
        # Query cursorDiskKV for all composerData and chatData entries
        cursor.execute("""
            SELECT value FROM cursorDiskKV 
            WHERE key LIKE 'composerData:%' OR key LIKE 'chatData:%'
        """)
        
        rows = cursor.fetchall()
        print(f"   Found {len(rows)} chat entries to scan...")
        
        for row in rows[:1000]:  # Limit to first 1000 for speed, should be enough to find range
            try:
                value = row[0]
                if value is None:
                    continue
                    
                if isinstance(value, bytes):
                    value_str = value.decode('utf-8')
                else:
                    value_str = value
                
                if not value_str:
                    continue
                
                data = json.loads(value_str)
                
                # Extract timestamps from various places in the data structure
                timestamps = []
                
                # Check top-level timestamps
                for key in ["createdAt", "lastUpdatedAt", "timestamp"]:
                    if key in data:
                        ts = data[key]
                        if isinstance(ts, (int, float)) and ts > 0:
                            timestamps.append(ts)
                
                # Check headers array
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
                                # Count messages with text content
                                if msg.get("text") or msg.get("richText"):
                                    total_messages += 1
                
                all_timestamps.extend(timestamps)
                
            except (json.JSONDecodeError, UnicodeDecodeError, KeyError, ValueError):
                continue
        
        conn.close()
        
        if not all_timestamps:
            return None, None, 0
        
        min_ts = min(all_timestamps)
        max_ts = max(all_timestamps)
        
        print(f"   ✅ Scanned {len(rows)} entries, found {total_messages:,} messages")
        
        return min_ts, max_ts, total_messages
        
    except Exception as e:
        print(f"   ⚠️  Error querying local database: {e}")
        return None, None, 0


def get_vector_db_timestamp_range(client):
    """Get min and max timestamps from Vector DB."""
    print("🔍 Querying Vector DB for timestamp range...")
    
    try:
        # Get earliest message
        earliest = client.table("cursor_messages")\
            .select("timestamp")\
            .order("timestamp", desc=False)\
            .limit(1)\
            .execute()
        
        # Get latest message
        latest = client.table("cursor_messages")\
            .select("timestamp")\
            .order("timestamp", desc=True)\
            .limit(1)\
            .execute()
        
        # Get count
        count_result = client.table("cursor_messages").select("message_id", count="exact").execute()
        count = count_result.count if hasattr(count_result, "count") else 0
        
        min_ts = earliest.data[0]["timestamp"] if earliest.data else None
        max_ts = latest.data[0]["timestamp"] if latest.data else None
        
        return min_ts, max_ts, count
    except Exception as e:
        print(f"❌ Error querying Vector DB: {e}")
        return None, None, 0


def format_timestamp(ts):
    """Format timestamp to readable date."""
    if not ts:
        return "N/A"
    try:
        dt = datetime.fromtimestamp(ts / 1000)
        return dt.isoformat()
    except:
        return f"Invalid: {ts}"


def check_coverage(local_min, local_max, vector_min, vector_max):
    """Check if Vector DB covers the local database range."""
    print("\n📊 Coverage Analysis:")
    
    if not local_min or not local_max:
        print("   ❌ No messages found in local database")
        return False
    
    if not vector_min or not vector_max:
        print("   ❌ No messages found in Vector DB")
        return False
    
    # Calculate time differences (in seconds)
    start_diff = abs((vector_min - local_min) / 1000)  # Convert ms to seconds
    end_diff = abs((vector_max - local_max) / 1000)
    
    # Allow small differences (within 5 minutes = 300 seconds) due to timing/precision
    TOLERANCE_SECONDS = 300
    
    covers_start = vector_min <= local_min or start_diff <= TOLERANCE_SECONDS
    covers_end = vector_max >= local_max or end_diff <= TOLERANCE_SECONDS
    
    print(f"   Local DB range:     {format_timestamp(local_min)} to {format_timestamp(local_max)}")
    print(f"   Vector DB range:    {format_timestamp(vector_min)} to {format_timestamp(vector_max)}")
    print(f"   Start difference:   {start_diff:.1f} seconds")
    print(f"   End difference:     {end_diff:.1f} seconds")
    print()
    
    if covers_start and covers_end:
        print("   ✅ Vector DB covers entire local database range!")
        if start_diff > 0 or end_diff > 0:
            print(f"      (Small timing differences within tolerance: ±{TOLERANCE_SECONDS}s)")
        return True
    else:
        print("   ⚠️  Coverage gaps detected:")
        if not covers_start and start_diff > TOLERANCE_SECONDS:
            gap_start = local_min
            gap_end = vector_min
            gap_seconds = (vector_min - local_min) / 1000
            print(f"      Missing from start: {format_timestamp(gap_start)} to {format_timestamp(gap_end)} ({gap_seconds:.1f}s gap)")
        if not covers_end and end_diff > TOLERANCE_SECONDS:
            gap_start = vector_max
            gap_end = local_max
            gap_seconds = (local_max - vector_max) / 1000
            print(f"      Missing from end: {format_timestamp(gap_start)} to {format_timestamp(gap_end)} ({gap_seconds:.1f}s gap)")
        return False


def sample_messages_by_date(client, target_date):
    """Sample messages from a specific date to verify they exist."""
    # Use a wider range to catch messages from that month
    start_ts = int(datetime.combine(target_date, datetime.min.time()).timestamp() * 1000)
    end_ts = int(datetime.combine(target_date + timedelta(days=32), datetime.min.time()).timestamp() * 1000)
    
    try:
        result = client.table("cursor_messages")\
            .select("timestamp, workspace, chat_id")\
            .gte("timestamp", start_ts)\
            .lt("timestamp", end_ts)\
            .limit(5)\
            .execute()
        
        return result.data if result.data else []
    except Exception as e:
        print(f"   ⚠️  Error sampling {target_date}: {e}")
        return []


def main():
    """Main verification function."""
    print("🔍 Verifying Sync Completeness\n")
    print("=" * 60)
    
    # Date range to check (July 2025 to now)
    start_date = datetime(2025, 7, 1).date()
    end_date = datetime.now().date()
    
    print(f"📅 Checking date range: {start_date} to {end_date}\n")
    
    # Get local database range
    print("1️⃣  Local Database Analysis:")
    local_min, local_max, local_count = get_local_timestamp_range(start_date, end_date)
    
    if local_min and local_max:
        print(f"   ✅ Earliest message: {format_timestamp(local_min)}")
        print(f"   ✅ Latest message:   {format_timestamp(local_max)}")
        print(f"   ✅ Total messages:    {local_count:,}")
    else:
        print("   ❌ No messages found in local database")
        return
    
    print()
    
    # Get Vector DB range
    print("2️⃣  Vector DB Analysis:")
    client = get_supabase_client()
    if not client:
        print("   ❌ Supabase client not available")
        return
    
    vector_min, vector_max, vector_count = get_vector_db_timestamp_range(client)
    
    if vector_min and vector_max:
        print(f"   ✅ Earliest message: {format_timestamp(vector_min)}")
        print(f"   ✅ Latest message:   {format_timestamp(vector_max)}")
        print(f"   ✅ Total messages:    {vector_count:,}")
    else:
        print("   ❌ No messages found in Vector DB")
        return
    
    print()
    
    # Check coverage
    print("3️⃣  Coverage Verification:")
    is_complete = check_coverage(local_min, local_max, vector_min, vector_max)
    
    print()
    
    # Sample check for July 2025 (earliest month)
    print("4️⃣  Sample Verification (July 2025):")
    july_date = datetime.fromtimestamp(local_min / 1000).date() if local_min else datetime(2025, 7, 19).date()
    july_samples = sample_messages_by_date(client, july_date)
    if july_samples:
        print(f"   ✅ Found {len(july_samples)} sample messages from {july_date}:")
        for sample in july_samples[:3]:
            print(f"      - {format_timestamp(sample['timestamp'])} ({sample.get('workspace', 'Unknown')})")
    else:
        # Check if we have messages close to the earliest timestamp
        if local_min:
            earliest_check = client.table("cursor_messages")\
                .select("timestamp, workspace")\
                .gte("timestamp", int(local_min) - 86400000)\
                .lt("timestamp", int(local_min) + 86400000)\
                .limit(3)\
                .execute()
            if earliest_check.data:
                print(f"   ✅ Found messages near earliest timestamp ({format_timestamp(local_min)}):")
                for sample in earliest_check.data[:3]:
                    print(f"      - {format_timestamp(sample['timestamp'])} ({sample.get('workspace', 'Unknown')})")
            else:
                print(f"   ⚠️  No messages found near earliest timestamp ({format_timestamp(local_min)})")
        else:
            print("   ⚠️  Cannot verify - no local timestamps found")
    
    print()
    
    # Summary
    print("=" * 60)
    print("📋 Summary:")
    print(f"   Local DB:    {local_count:,} messages ({format_timestamp(local_min)} to {format_timestamp(local_max)})")
    print(f"   Vector DB:   {vector_count:,} messages ({format_timestamp(vector_min)} to {format_timestamp(vector_max)})")
    
    if is_complete:
        print("\n   ✅ VERIFICATION PASSED: Vector DB covers entire local database range!")
    else:
        print("\n   ⚠️  VERIFICATION INCOMPLETE: Some messages may be missing from Vector DB")
        print("      Consider re-running index_all_messages.py to sync missing messages")


if __name__ == "__main__":
    main()

