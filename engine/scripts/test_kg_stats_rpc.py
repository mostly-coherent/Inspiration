#!/usr/bin/env python3
"""
Test the optimized KG stats RPC function.
Run this to verify the RPC function is deployed and working correctly.
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from engine.common.vector_db import get_supabase_client

def test_rpc_function():
    """Test the get_kg_stats_by_source_type RPC function."""
    print("🔍 Testing get_kg_stats_by_source_type RPC function...\n")
    
    client = get_supabase_client()
    
    test_cases = [
        ("all", "All sources"),
        ("user", "User sources"),
        ("expert", "Expert sources"),
        ("both", "Both sources"),
    ]
    
    for source_type, description in test_cases:
        print(f"📊 Testing {description} (sourceType={source_type})...")
        try:
            result = client.rpc("get_kg_stats_by_source_type", {
                "p_source_type": source_type
            }).execute()
            
            if result.data:
                stats = result.data
                print(f"  ✅ Success!")
                print(f"     Entities: {stats.get('totalEntities', 0):,}")
                print(f"     Mentions: {stats.get('totalMentions', 0):,}")
                print(f"     Relations: {stats.get('totalRelations', 0):,}")
                print(f"     Indexed: {stats.get('indexed', False)}")
                print(f"     Types: {len(stats.get('byType', {}))} entity types")
            else:
                print(f"  ⚠️  RPC returned no data")
        except Exception as e:
            print(f"  ❌ Error: {e}")
        print()
    
    print("✅ RPC function test complete!")

if __name__ == "__main__":
    test_rpc_function()
