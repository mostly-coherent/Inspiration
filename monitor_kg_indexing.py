#!/usr/bin/env python3
"""
Real-time monitoring for Knowledge Graph indexing progress.

Usage:
    python3 monitor_kg_indexing.py
"""

import sys
import time
from datetime import datetime
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from engine.common.vector_db import get_supabase_client


def get_current_stats():
    """Get current KG stats from database."""
    client = get_supabase_client()
    
    # Overall stats
    stats = client.rpc('get_kg_stats').execute()
    
    # By source
    result = client.rpc('get_entities_by_source', {'p_source_type': None, 'p_limit': 5000}).execute()
    by_source = {}
    for e in result.data:
        st = e['source_type']
        by_source[st] = by_source.get(st, 0) + 1
    
    return {
        'total_entities': stats.data['totalEntities'],
        'total_mentions': stats.data['totalMentions'],
        'user_entities': by_source.get('user', 0),
        'expert_entities': by_source.get('expert', 0),
        'both_entities': by_source.get('both', 0),
        'by_type': stats.data.get('byType', {}),
    }


def format_duration(seconds):
    """Format seconds as human-readable duration."""
    if seconds < 60:
        return f"{seconds:.0f}s"
    elif seconds < 3600:
        return f"{seconds/60:.1f}m"
    else:
        hours = int(seconds / 3600)
        mins = int((seconds % 3600) / 60)
        return f"{hours}h {mins}m"


def main():
    """Monitor indexing progress in real-time."""
    print("🔍 Knowledge Graph Indexing Monitor")
    print("=" * 60)
    print("Press Ctrl+C to stop monitoring\n")
    
    # Get initial stats
    print("📊 Getting baseline stats...")
    initial_stats = get_current_stats()
    start_time = time.time()
    last_stats = initial_stats.copy()
    iteration = 0
    
    print(f"✅ Baseline: {initial_stats['expert_entities']} expert entities, {initial_stats['total_mentions']} mentions\n")
    
    try:
        while True:
            iteration += 1
            time.sleep(30)  # Poll every 30 seconds
            
            # Get current stats
            current_stats = get_current_stats()
            elapsed = time.time() - start_time
            
            # Calculate deltas
            delta_expert = current_stats['expert_entities'] - last_stats['expert_entities']
            delta_mentions = current_stats['total_mentions'] - last_stats['total_mentions']
            delta_both = current_stats['both_entities'] - last_stats['both_entities']
            
            total_delta_expert = current_stats['expert_entities'] - initial_stats['expert_entities']
            total_delta_mentions = current_stats['total_mentions'] - initial_stats['total_mentions']
            
            # Calculate rates
            rate_expert = total_delta_expert / (elapsed / 60) if elapsed > 0 else 0
            rate_mentions = total_delta_mentions / (elapsed / 60) if elapsed > 0 else 0
            
            # Estimate completion (rough estimate: 2000-5000 target entities)
            target_entities = 3000  # Mid-range estimate
            remaining = target_entities - current_stats['expert_entities']
            eta_minutes = remaining / rate_expert if rate_expert > 0 else 0
            
            # Clear screen and show updated stats
            print("\033[2J\033[H")  # Clear screen, move cursor to top
            print("🔍 Knowledge Graph Indexing Monitor")
            print("=" * 60)
            print(f"⏱️  Running for: {format_duration(elapsed)}")
            print(f"🔄 Last update: {datetime.now().strftime('%H:%M:%S')}")
            print()
            
            print("📊 CURRENT TOTALS:")
            print(f"   Expert entities:  {current_stats['expert_entities']:,}")
            print(f"   User entities:    {current_stats['user_entities']:,}")
            print(f"   Cross-source:     {current_stats['both_entities']:,}")
            print(f"   Total mentions:   {current_stats['total_mentions']:,}")
            print()
            
            print("📈 PROGRESS (since start):")
            print(f"   Expert entities:  +{total_delta_expert:,} ({rate_expert:.1f}/min)")
            print(f"   Mentions:         +{total_delta_mentions:,} ({rate_mentions:.1f}/min)")
            print()
            
            print("⚡ LAST 30 SECONDS:")
            print(f"   Expert entities:  +{delta_expert}")
            print(f"   Mentions:         +{delta_mentions}")
            if delta_both > 0:
                print(f"   Cross-source:     +{delta_both} 🎉")
            print()
            
            if rate_expert > 0:
                progress_pct = (current_stats['expert_entities'] / target_entities) * 100
                print("🎯 ESTIMATED COMPLETION:")
                print(f"   Progress:         {progress_pct:.1f}% of ~{target_entities:,} entities")
                print(f"   Remaining:        ~{remaining:,} entities")
                print(f"   ETA:              {format_duration(eta_minutes * 60)}")
            else:
                print("⏳ Calculating rate...")
            
            print()
            print("=" * 60)
            print("Press Ctrl+C to stop monitoring")
            
            # Update last stats
            last_stats = current_stats.copy()
            
    except KeyboardInterrupt:
        print("\n\n✅ Monitoring stopped")
        print(f"\n📊 Final Stats:")
        print(f"   Expert entities: {current_stats['expert_entities']:,} (+{total_delta_expert:,} since start)")
        print(f"   Total mentions: {current_stats['total_mentions']:,} (+{total_delta_mentions:,} since start)")
        print(f"   Cross-source: {current_stats['both_entities']:,}")
        print(f"   Total time: {format_duration(elapsed)}")
        if rate_expert > 0:
            print(f"   Average rate: {rate_expert:.1f} expert entities/min")


if __name__ == "__main__":
    main()
