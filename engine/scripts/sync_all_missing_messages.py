#!/usr/bin/env python3
"""
Sync all messages from local database to Vector DB, including July-September 2025.
This will index all messages that haven't been synced yet.
"""

import sys
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.cursor_db import get_conversations_for_range
from common.vector_db import get_supabase_client, get_message_count


def check_missing_messages():
    """Check what messages are missing from Vector DB."""
    print("🔍 Checking Missing Messages...\n")
    
    # Check local database for July-September
    print("📊 Local Database (July-September 2025):")
    july_sept_conversations = get_conversations_for_range(
        datetime(2025, 7, 1).date(),
        datetime(2025, 9, 30).date(),
        workspace_paths=None
    )
    
    local_messages = []
    for conv in july_sept_conversations:
        local_messages.extend(conv.get("messages", []))
    
    print(f"   Conversations: {len(july_sept_conversations)}")
    print(f"   Messages: {len(local_messages)}")
    
    if local_messages:
        local_messages.sort(key=lambda m: m.get("timestamp", 0))
        earliest = local_messages[0]
        latest = local_messages[-1]
        print(f"   Earliest: {datetime.fromtimestamp(earliest.get('timestamp', 0) / 1000).isoformat()}")
        print(f"   Latest: {datetime.fromtimestamp(latest.get('timestamp', 0) / 1000).isoformat()}\n")
    
    # Check Vector DB
    print("📊 Vector DB:")
    client = get_supabase_client()
    if client:
        vector_count = get_message_count(client)
        print(f"   Total messages indexed: {vector_count:,}\n")
        
        print("💡 To sync July-September messages to Vector DB, run:")
        print("   python3 engine/scripts/index_all_messages.py")
        print("\n   This will index ALL messages from your local database.")
        print("   It may take a while depending on how many messages you have.")
    else:
        print("   ❌ Vector DB not configured\n")


if __name__ == "__main__":
    check_missing_messages()

