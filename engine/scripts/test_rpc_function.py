#!/usr/bin/env python3
"""Test if get_table_size RPC function exists and works."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.vector_db import get_supabase_client

client = get_supabase_client()
if not client:
    print("❌ Supabase client not available")
    sys.exit(1)

print("🔍 Testing get_table_size RPC function...\n")

try:
    result = client.rpc("get_table_size", {"table_name": "cursor_messages"}).execute()
    if result.data:
        print("✅ RPC function exists and works!")
        print(f"   Result: {result.data}")
    else:
        print("⚠️  RPC function exists but returned no data")
except Exception as e:
    print(f"❌ RPC function doesn't exist or failed: {e}")
    print("\n💡 You need to create the RPC function in Supabase:")
    print("   1. Go to Supabase SQL Editor")
    print("   2. Run the SQL from engine/scripts/get_table_size.sql")
    print("   3. Or follow SUPABASE_SETUP_INSTRUCTIONS.md Step 3")

