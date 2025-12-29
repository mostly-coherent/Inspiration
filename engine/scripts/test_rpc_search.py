#!/usr/bin/env python3
"""
Test the RPC search function to see what it returns.
"""

import sys
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.vector_db import get_supabase_client
from common.semantic_search import get_embedding


def test_rpc_search():
    """Test the RPC search function."""
    client = get_supabase_client()
    if not client:
        print("❌ Supabase client not available")
        return
    
    # Get a test embedding
    query = "test search query"
    print(f"🔍 Testing RPC search with query: '{query}'")
    
    try:
        query_embedding = get_embedding(query)
        print(f"✅ Got embedding (dimension: {len(query_embedding)})")
        
        # Call RPC function
        rpc_params = {
            "query_embedding": query_embedding,
            "match_threshold": 0.0,
            "match_count": 3,
        }
        
        print(f"📞 Calling RPC with params: {list(rpc_params.keys())}")
        result = client.rpc("search_cursor_messages", rpc_params).execute()
        
        print(f"✅ RPC call succeeded!")
        print(f"   Returned {len(result.data)} results")
        
        if result.data:
            print(f"\n📋 First result structure:")
            first_row = result.data[0]
            print(f"   Keys: {list(first_row.keys())}")
            print(f"   Sample data:")
            for key, value in first_row.items():
                if isinstance(value, (str, int, float)):
                    print(f"     {key}: {value}")
                elif isinstance(value, list):
                    print(f"     {key}: [list of length {len(value)}]")
                else:
                    print(f"     {key}: {type(value).__name__}")
        else:
            print("   No results returned")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        print(f"\nTraceback:")
        print(traceback.format_exc())


if __name__ == "__main__":
    test_rpc_search()

