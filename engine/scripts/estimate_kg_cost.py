#!/usr/bin/env python3
"""
Cost Estimator for Knowledge Graph Indexing.

Shows users BEFORE they start:
- How many chunks will be processed
- Estimated cost
- Estimated time
- Quality threshold impact

Usage:
    # Estimate for Lenny's podcast
    python3 engine/scripts/estimate_kg_cost.py
    
    # Try different quality thresholds
    python3 engine/scripts/estimate_kg_cost.py --threshold 0.40
    python3 engine/scripts/estimate_kg_cost.py --threshold 0.50
"""

import argparse
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv()

from engine.common.lenny_parser import parse_all_episodes
from engine.common.kg_quality_filter import score_chunk_quality, estimate_indexing_cost
from engine.common.vector_db import get_supabase_client


def get_indexed_count() -> int:
    """Get count of already-indexed chunks."""
    client = get_supabase_client()
    try:
        result = client.rpc('get_indexed_chunk_ids_count', {'p_source_type': 'lenny'}).execute()
        return result.data.get('count', 0)
    except:
        return 0


def estimate_quality_filtered_cost(
    episodes: list,
    quality_threshold: float = 0.35,
    with_relations: bool = True,
    show_samples: bool = False
) -> dict:
    """
    Estimate cost after quality filtering.
    
    Returns:
        Dict with cost estimate and sample chunks
    """
    total_chunks = sum(len(ep.chunks) for ep in episodes)
    chunks_passing_filter = 0
    sample_high_quality = []
    sample_low_quality = []
    
    print(f"📊 Analyzing {total_chunks:,} chunks with quality threshold {quality_threshold}...")
    print()
    
    for episode in episodes:
        for i, chunk in enumerate(episode.chunks):
            score = score_chunk_quality(chunk.content, content_type="podcast")
            
            if score.score >= quality_threshold:
                chunks_passing_filter += 1
                
                if show_samples and len(sample_high_quality) < 3:
                    sample_high_quality.append({
                        "episode": episode.guest_name or episode.filename,
                        "score": score.score,
                        "reason": score.reason,
                        "preview": chunk.content[:200] + "..."
                    })
            else:
                if show_samples and len(sample_low_quality) < 3:
                    sample_low_quality.append({
                        "episode": episode.guest_name or episode.filename,
                        "score": score.score,
                        "reason": score.reason,
                        "preview": chunk.content[:200] + "..."
                    })
    
    # Calculate hit rate
    hit_rate = (chunks_passing_filter / total_chunks * 100) if total_chunks > 0 else 0
    
    # Estimate cost for chunks passing filter
    cost_estimate = estimate_indexing_cost(
        total_chunks=chunks_passing_filter,
        avg_chunk_size=200,
        model="claude-haiku-4-5",
        with_relations=with_relations
    )
    
    return {
        "total_chunks": total_chunks,
        "chunks_passing_filter": chunks_passing_filter,
        "chunks_filtered_out": total_chunks - chunks_passing_filter,
        "hit_rate": hit_rate,
        "quality_threshold": quality_threshold,
        "cost_estimate": cost_estimate,
        "sample_high_quality": sample_high_quality,
        "sample_low_quality": sample_low_quality,
    }


def main():
    parser = argparse.ArgumentParser(description="Estimate KG indexing cost")
    parser.add_argument("--threshold", type=float, default=0.35, 
                       help="Quality threshold (0.0-1.0, default: 0.35)")
    parser.add_argument("--with-relations", action="store_true", default=True,
                       help="Include relation extraction (default: True)")
    parser.add_argument("--show-samples", action="store_true",
                       help="Show sample chunks at different quality levels")
    parser.add_argument("--compare-thresholds", action="store_true",
                       help="Compare multiple quality thresholds")
    parser.add_argument("--archive-path", type=str, default="data/lenny-transcripts",
                       help="Path to Lenny transcripts archive")
    args = parser.parse_args()
    
    print("=" * 70)
    print("💰 Knowledge Graph Indexing — Cost Estimator")
    print("=" * 70)
    print()
    
    # Load episodes
    print("📚 Loading Lenny's podcast transcripts...")
    archive_path = Path(args.archive_path)
    if not archive_path.exists():
        print(f"❌ Archive path not found: {archive_path}")
        return
    
    episodes = parse_all_episodes(archive_path)
    print(f"   Found {len(episodes)} episodes")
    print()
    
    # Check already indexed
    already_indexed = get_indexed_count()
    if already_indexed > 0:
        print(f"ℹ️  Note: {already_indexed:,} chunks already indexed (will skip these)")
        print()
    
    if args.compare_thresholds:
        # Compare multiple thresholds
        print("📊 Comparing Quality Thresholds:")
        print()
        thresholds = [0.30, 0.35, 0.40, 0.50]
        
        for threshold in thresholds:
            estimate = estimate_quality_filtered_cost(
                episodes, 
                quality_threshold=threshold,
                with_relations=args.with_relations,
                show_samples=False
            )
            
            cost = estimate["cost_estimate"]
            print(f"🎚️  Threshold {threshold:.2f}:")
            print(f"   Chunks: {estimate['chunks_passing_filter']:,} ({estimate['hit_rate']:.1f}%)")
            print(f"   Cost: ${cost['total_cost_usd']:.2f}")
            print(f"   Time: {cost['estimated_time_hours']:.1f}h")
            print()
    else:
        # Single threshold estimate
        estimate = estimate_quality_filtered_cost(
            episodes,
            quality_threshold=args.threshold,
            with_relations=args.with_relations,
            show_samples=args.show_samples
        )
        
        cost = estimate["cost_estimate"]
        
        print("📊 Quality Filtering:")
        print(f"   Quality threshold: {args.threshold:.2f}")
        print(f"   Total chunks: {estimate['total_chunks']:,}")
        print(f"   ✅ Pass filter: {estimate['chunks_passing_filter']:,} ({estimate['hit_rate']:.1f}%)")
        print(f"   ❌ Filtered out: {estimate['chunks_filtered_out']:,} ({100-estimate['hit_rate']:.1f}%)")
        print()
        
        print("💰 Cost Estimate:")
        print(f"   Model: {cost['model']}")
        print(f"   Chunks to process: {cost['total_chunks']:,}")
        print(f"   Relations: {'✅ Enabled' if cost['with_relations'] else '❌ Disabled'}")
        print(f"   Total cost: ${cost['total_cost_usd']:.2f}")
        print(f"     - Input tokens: ${cost['input_cost_usd']:.2f}")
        print(f"     - Output tokens: ${cost['output_cost_usd']:.2f}")
        print(f"   Cost per chunk: ${cost['cost_per_chunk']:.4f}")
        print()
        
        print("⏱️  Time Estimate:")
        print(f"   Total time: {cost['estimated_time_hours']:.1f} hours ({cost['estimated_time_minutes']:.0f} minutes)")
        print(f"   Rate: ~{19.8:.1f} chunks/min (with 4 workers)")
        print()
        
        if args.show_samples:
            print("=" * 70)
            print("🔍 Sample Chunks (High Quality):")
            print("=" * 70)
            for i, sample in enumerate(estimate["sample_high_quality"], 1):
                print(f"\n{i}. Episode: {sample['episode']}")
                print(f"   Score: {sample['score']:.2f}")
                print(f"   Reason: {sample['reason']}")
                print(f"   Preview: {sample['preview']}")
            
            print()
            print("=" * 70)
            print("🚫 Sample Chunks (Low Quality - Filtered Out):")
            print("=" * 70)
            for i, sample in enumerate(estimate["sample_low_quality"], 1):
                print(f"\n{i}. Episode: {sample['episode']}")
                print(f"   Score: {sample['score']:.2f}")
                print(f"   Reason: {sample['reason']}")
                print(f"   Preview: {sample['preview']}")
            print()
        
        print("=" * 70)
        print("💡 Tips:")
        print("=" * 70)
        print("• Higher threshold = fewer chunks = lower cost (but might miss entities)")
        print("• Lower threshold = more chunks = higher cost (more comprehensive)")
        print("• Default 0.35 is optimized for quality/cost balance")
        print("• Use --compare-thresholds to see impact of different thresholds")
        print("• Use --show-samples to preview what will be indexed")
        print()


if __name__ == "__main__":
    main()
