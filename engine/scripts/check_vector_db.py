#!/usr/bin/env python3
"""
Check if vector database RPC function exists and test it.
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.vector_db import get_supabase_client
from common.semantic_search import get_embedding


def check_rpc_function():
    """Check if search_cursor_messages RPC function exists."""
    client = get_supabase_client()
    if not client:
        print("❌ Supabase client not available. Check SUPABASE_URL and SUPABASE_ANON_KEY in .env")
        return False
    
    print("🔍 Checking if RPC function exists...")
    
    # Try to call the RPC function with a test query
    try:
        # Get a test embedding
        test_embedding = get_embedding("test query")
        
        # Try calling the RPC function
        result = client.rpc("search_cursor_messages", {
            "query_embedding": test_embedding,
            "match_threshold": 0.0,
            "match_count": 1,
        }).execute()
        
        print("✅ RPC function exists and is callable!")
        print(f"   Test query returned {len(result.data)} results")
        return True
        
    except Exception as e:
        error_msg = str(e)
        print(f"❌ RPC function check failed: {error_msg}")
        
        if "function" in error_msg.lower() and "does not exist" in error_msg.lower():
            print("\n💡 The RPC function doesn't exist. You need to run the SQL migration:")
            print("   1. Go to your Supabase dashboard")
            print("   2. Open SQL Editor")
            print("   3. Run the SQL from: engine/scripts/init_vector_db.sql")
        elif "permission" in error_msg.lower() or "403" in error_msg:
            print("\n💡 Permission error - check your Supabase ANON_KEY permissions")
        else:
            print(f"\n💡 Error details: {error_msg}")
        
        return False


def check_table_exists():
    """Check if cursor_messages table exists."""
    client = get_supabase_client()
    if not client:
        return False
    
    print("\n🔍 Checking if cursor_messages table exists...")
    
    try:
        # Try to query the table
        result = client.table("cursor_messages").select("message_id", count="exact").limit(1).execute()
        count = result.count if hasattr(result, "count") else 0
        print(f"✅ Table exists! Found {count} messages")
        return True
    except Exception as e:
        print(f"❌ Table check failed: {e}")
        print("\n💡 The table doesn't exist. Run the SQL migration:")
        print("   engine/scripts/init_vector_db.sql")
        return False


def check_indexes():
    """Check if vector index exists."""
    print("\n🔍 Checking vector index...")
    print("   (This requires checking via Supabase dashboard SQL editor)")
    print("   Run: SELECT * FROM pg_indexes WHERE tablename = 'cursor_messages';")


if __name__ == "__main__":
    print("=" * 60)
    print("Vector DB Health Check")
    print("=" * 60)
    
    table_exists = check_table_exists()
    rpc_exists = check_rpc_function()
    check_indexes()
    
    print("\n" + "=" * 60)
    if table_exists and rpc_exists:
        print("✅ All checks passed!")
    else:
        print("⚠️  Some checks failed. See instructions above.")
    print("=" * 60)

