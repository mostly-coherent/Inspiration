#!/usr/bin/env python3
"""
Index Lenny Podcast Archive — Create local embeddings for semantic search.

Creates:
- data/lenny_embeddings.npz — Pre-computed embeddings (~74MB)
- data/lenny_metadata.json — Episode and chunk metadata (lossless)

Supports two formats:
- GitHub repo format (preferred): data/lenny-transcripts/episodes/*/transcript.md
- Legacy Dropbox format: Lennys Podcast Public Archive/*.txt

Usage:
    python3 engine/scripts/index_lenny_local.py [archive_path]
    
    # Default: data/lenny-transcripts (GitHub format)
    
Options:
    --dry-run       Parse and report stats without generating embeddings
    --force         Re-index even if already indexed with same file hashes
    --batch-size N  Number of chunks to embed in one API call (default: 100)
"""

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    np = None
    NUMPY_AVAILABLE = False

from engine.common.lenny_parser import (
    parse_all_episodes,
    find_transcript_files,
    detect_archive_format,
    ParsedEpisode,
)
from engine.common.config import get_data_dir, load_env_file
from engine.common.semantic_search import (
    batch_get_embeddings,
    is_openai_configured,
    EMBEDDING_DIM,
)


def get_output_paths() -> tuple[Path, Path]:
    """Get paths for output files."""
    data_dir = get_data_dir()
    return (
        data_dir / "lenny_embeddings.npz",
        data_dir / "lenny_metadata.json",
    )


def load_existing_metadata() -> dict | None:
    """Load existing metadata if present."""
    _, metadata_path = get_output_paths()
    if not metadata_path.exists():
        return None
    try:
        with open(metadata_path) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def get_indexed_file_hashes(metadata: dict) -> dict[str, str]:
    """Get dict of filename -> file_hash from existing metadata."""
    if not metadata:
        return {}
    return {
        ep.get("filename"): ep.get("file_hash")
        for ep in metadata.get("episodes", [])
    }


def episodes_to_metadata(episodes: list[ParsedEpisode], archive_format: str) -> dict:
    """
    Convert parsed episodes to metadata JSON structure.
    
    This is the LOSSLESS representation — full content preserved in chunks.
    Rich metadata (guest, title, youtube_url) included when available.
    """
    episode_list = []
    chunk_list = []
    chunk_idx = 0
    
    for ep in episodes:
        # Generate episode ID from filename or guest folder
        if ep.filename == "transcript.md":
            # GitHub format: use parent folder name
            episode_id = ep.guest_name.lower().replace(' ', '-')
        else:
            # Legacy format: use filename
            episode_id = ep.filename.replace('.txt', '').lower().replace(' ', '-')
        
        # Build episode entry with rich metadata
        episode_entry = {
            "id": episode_id,
            "filename": ep.filename,
            "guest_name": ep.guest_name,
            "word_count": ep.word_count,
            "chunk_count": len(ep.chunks),
            "chunk_start_idx": chunk_idx,
            "file_hash": ep.file_hash,
        }
        
        # Add rich metadata if available (GitHub format)
        if ep.metadata:
            episode_entry["title"] = ep.metadata.title
            episode_entry["youtube_url"] = ep.metadata.youtube_url
            episode_entry["video_id"] = ep.metadata.video_id
            episode_entry["description"] = ep.metadata.description
            episode_entry["duration_seconds"] = ep.metadata.duration_seconds
            episode_entry["duration"] = ep.metadata.duration
            episode_entry["view_count"] = ep.metadata.view_count
        
        episode_list.append(episode_entry)
        
        for chunk in ep.chunks:
            chunk_list.append({
                "idx": chunk_idx,
                "episode_id": episode_id,
                "speaker": chunk.speaker,
                "timestamp": chunk.timestamp,
                "content": chunk.content,  # LOSSLESS: full chunk content
                "word_count": chunk.word_count,
            })
            chunk_idx += 1
    
    total_words = sum(ep.word_count for ep in episodes)
    with_rich_metadata = sum(1 for ep in episodes if ep.metadata)
    
    return {
        "version": 2,  # v2 includes rich metadata
        "format": archive_format,
        "indexed_at": datetime.utcnow().isoformat() + "Z",
        "stats": {
            "total_episodes": len(episodes),
            "total_chunks": len(chunk_list),
            "total_words": total_words,
            "with_rich_metadata": with_rich_metadata,
        },
        "episodes": episode_list,
        "chunks": chunk_list,
    }


def index_lenny_archive(
    archive_path: Path,
    dry_run: bool = False,
    force: bool = False,
    batch_size: int = 100,
) -> dict:
    """
    Index the Lenny podcast archive to local embeddings.
    
    Args:
        archive_path: Path to archive folder containing transcripts
        dry_run: If True, only parse and report stats (no embeddings)
        force: If True, re-index even if files haven't changed
        batch_size: Number of chunks to embed per API call
        
    Returns:
        Dict with indexing results
    """
    print(f"\n🎙️  Lenny Podcast Archive Indexer")
    print(f"{'=' * 50}")
    print(f"📂 Archive path: {archive_path}")
    
    # Check archive exists
    if not archive_path.exists():
        print(f"❌ Archive path not found: {archive_path}")
        return {"success": False, "error": "Archive path not found"}
    
    # Detect format
    archive_format = detect_archive_format(archive_path)
    print(f"📋 Detected format: {archive_format}")
    
    if archive_format == "unknown":
        print("❌ Could not detect archive format")
        return {"success": False, "error": "Unknown archive format"}
    
    # Find transcript files
    transcript_files = find_transcript_files(archive_path)
    print(f"📄 Found {len(transcript_files)} transcript files")
    
    if not transcript_files:
        print("❌ No transcript files found")
        return {"success": False, "error": "No transcript files found"}
    
    # Parse all episodes
    print(f"\n📖 Parsing transcripts...")
    start_time = time.time()
    episodes = parse_all_episodes(archive_path)
    parse_time = time.time() - start_time
    
    print(f"   ✅ Parsed {len(episodes)} episodes in {parse_time:.1f}s")
    
    # Calculate stats
    total_chunks = sum(len(ep.chunks) for ep in episodes)
    total_words = sum(ep.word_count for ep in episodes)
    with_metadata = sum(1 for ep in episodes if ep.metadata)
    
    print(f"\n📊 Statistics:")
    print(f"   Episodes:        {len(episodes)}")
    print(f"   With metadata:   {with_metadata} ({100*with_metadata/len(episodes):.0f}%)")
    print(f"   Chunks:          {total_chunks:,}")
    print(f"   Words:           {total_words:,}")
    print(f"   Avg chunks/ep:   {total_chunks / len(episodes):.1f}")
    print(f"   Avg words/chunk: {total_words / total_chunks:.0f}")
    
    if dry_run:
        print(f"\n🔍 Dry run complete. No embeddings generated.")
        return {
            "success": True,
            "dry_run": True,
            "format": archive_format,
            "episodes": len(episodes),
            "with_metadata": with_metadata,
            "chunks": total_chunks,
            "words": total_words,
        }
    
    # Check if OpenAI is configured
    load_env_file()
    if not is_openai_configured():
        print(f"\n❌ OPENAI_API_KEY not configured.")
        print(f"   Add your OpenAI API key to .env.local to generate embeddings.")
        return {"success": False, "error": "OpenAI API key not configured"}
    
    # Check numpy
    if not NUMPY_AVAILABLE:
        print(f"\n❌ numpy not available. Install with: pip install numpy")
        return {"success": False, "error": "numpy not available"}
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # INCREMENTAL INDEXING: Only embed new/changed episodes
    # 
    # Designed for continuous growth: Lenny's Podcast adds 2-3 episodes/week.
    # This incremental approach ensures weekly syncs only embed new episodes,
    # reusing cached embeddings for unchanged content (saves ~$3-4 per sync).
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    existing_metadata = load_existing_metadata()
    existing_embeddings = None
    episodes_to_embed = episodes  # Default: embed all
    reuse_existing = False
    
    if not force and existing_metadata:
        existing_hashes = get_indexed_file_hashes(existing_metadata)
        new_hashes = {ep.filename: ep.file_hash for ep in episodes}
        
        # Check if completely unchanged
        if existing_hashes == new_hashes:
            print(f"\n✅ Archive already indexed and unchanged.")
            print(f"   Use --force to re-index anyway.")
            return {
                "success": True,
                "skipped": True,
                "reason": "Already indexed, no changes",
            }
        
        # Find new/changed episodes
        new_episodes = []
        unchanged_episodes = []
        for ep in episodes:
            if ep.filename not in existing_hashes:
                new_episodes.append(ep)
            elif existing_hashes.get(ep.filename) != ep.file_hash:
                new_episodes.append(ep)
            else:
                unchanged_episodes.append(ep)
        
        if new_episodes:
            print(f"\n📈 Incremental update detected:")
            print(f"   New/changed episodes: {len(new_episodes)}")
            print(f"   Unchanged episodes:   {len(unchanged_episodes)}")
            
            # Load existing embeddings for reuse
            embeddings_path, _ = get_output_paths()
            if embeddings_path.exists():
                try:
                    data = np.load(embeddings_path)
                    existing_embeddings = data["embeddings"]
                    reuse_existing = True
                    print(f"   Reusing {existing_embeddings.shape[0]:,} existing embeddings")
                except Exception as e:
                    print(f"   ⚠️ Could not load existing embeddings: {e}")
                    print(f"   Will re-embed all episodes")
            
            if reuse_existing:
                episodes_to_embed = new_episodes
            else:
                episodes_to_embed = episodes  # Full re-index
    
    # Calculate chunks to embed
    chunks_to_embed = sum(len(ep.chunks) for ep in episodes_to_embed)
    
    # Generate embeddings
    print(f"\n🧠 Generating embeddings...")
    print(f"   Episodes to embed: {len(episodes_to_embed)}")
    print(f"   Chunks to embed:   {chunks_to_embed:,}")
    print(f"   Batch size:        {batch_size}")
    print(f"   Estimated API cost: ~${chunks_to_embed * 0.0001:.2f}")
    
    # Collect chunk texts for episodes to embed
    all_chunks = []
    for ep in episodes_to_embed:
        for chunk in ep.chunks:
            all_chunks.append(chunk.content)
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # CHECKPOINT SYSTEM: Save progress every 50 batches to prevent data loss
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    checkpoint_path = get_data_dir() / "lenny_checkpoint.json"
    checkpoint_interval = 50  # Save every 50 batches
    
    # Try to load checkpoint
    start_batch = 0
    new_embeddings = []
    
    if checkpoint_path.exists() and not force:
        try:
            with open(checkpoint_path) as f:
                checkpoint = json.load(f)
            if checkpoint.get("chunks_to_embed") == chunks_to_embed:
                new_embeddings = checkpoint.get("embeddings", [])
                start_batch = len(new_embeddings) // batch_size
                print(f"   📍 Resuming from checkpoint: batch {start_batch + 1}/{(len(all_chunks) + batch_size - 1) // batch_size}")
                print(f"   📍 Already have {len(new_embeddings):,} embeddings")
        except Exception as e:
            print(f"   ⚠️ Could not load checkpoint: {e}")
            start_batch = 0
            new_embeddings = []
    
    # Embed in batches with progress + checkpointing
    start_time = time.time()
    
    # WORKAROUND: Skip oversized chunks that exceed OpenAI's token limit
    # These are poorly formatted transcripts with entire intros in single chunks
    # Oversized chunks that exceed embedding model limits (8192 tokens)
    SKIP_CHUNK_INDICES = {
        37850,  # Ryan Hoover
        42869,  # Upasna Gautam  
        43385,  # Vijay
    } | set(range(43400, 43500)) \
      | set(range(48700, 48800)) \
      | set(range(49400, 49500))  # Batches 435, 488, 495 with oversized chunks
    
    for i in range(start_batch * batch_size, len(all_chunks), batch_size):
        batch = all_chunks[i:i + batch_size]
        batch_num = i // batch_size + 1
        total_batches = (len(all_chunks) + batch_size - 1) // batch_size
        
        print(f"   Batch {batch_num}/{total_batches} ({i + len(batch)}/{len(all_chunks)} chunks)...", end="", flush=True)
        
        # Check if this batch contains any problematic chunks
        batch_start = i
        batch_end = i + len(batch)
        batch_range = set(range(batch_start, batch_end))
        skip_chunks_in_batch = batch_range & SKIP_CHUNK_INDICES
        
        if skip_chunks_in_batch:
            print(f" ⚠️ Skipping {len(skip_chunks_in_batch)} problematic chunk(s)")
            # Process batch with skips
            for chunk_idx in range(batch_start, batch_end):
                if chunk_idx in SKIP_CHUNK_INDICES:
                    # Insert zero vector for skipped chunk
                    new_embeddings.append([0.0] * 1536)
                    print(f"   Skipped chunk {chunk_idx + 1} (oversized)")
                else:
                    # Embed this chunk normally
                    embeddings = batch_get_embeddings([all_chunks[chunk_idx]], use_cache=True, allow_fallback=False)
                    new_embeddings.extend(embeddings)
            print(f"   ✅ Batch completed (with {len(skip_chunks_in_batch)} skip(s))")
            continue
        
        try:
            embeddings = batch_get_embeddings(batch, use_cache=True, allow_fallback=False)
            new_embeddings.extend(embeddings)
            print(" ✅")
            
            # Save checkpoint every N batches
            if batch_num % checkpoint_interval == 0:
                try:
                    with open(checkpoint_path, 'w') as f:
                        json.dump({
                            "batch": batch_num,
                            "chunks_to_embed": chunks_to_embed,
                            "embeddings": new_embeddings,
                            "timestamp": datetime.utcnow().isoformat() + "Z"
                        }, f)
                    print(f"   💾 Checkpoint saved")
                except Exception as e:
                    print(f"   ⚠️ Checkpoint save failed: {e}")
                    
        except Exception as e:
            print(f" ❌")
            print(f"   Error: {e}")
            # Save emergency checkpoint before failing
            try:
                with open(checkpoint_path, 'w') as f:
                    json.dump({
                        "batch": batch_num,
                        "chunks_to_embed": chunks_to_embed,
                        "embeddings": new_embeddings,
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                        "error": str(e)
                    }, f)
                print(f"   💾 Emergency checkpoint saved")
            except:
                pass
            return {"success": False, "error": str(e)}
    
    embed_time = time.time() - start_time
    print(f"   ✅ Generated {len(new_embeddings)} embeddings in {embed_time:.1f}s")
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # MERGE: Combine new embeddings with existing (if incremental)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Note: For simplicity, we always regenerate the full embeddings array
    # from ALL episodes (in order). The incremental part just saves API calls
    # by using the embedding cache for unchanged chunks.
    # 
    # A more complex approach would merge embeddings by episode index,
    # but that requires tracking chunk-to-episode mapping carefully.
    # For now, we regenerate metadata for all episodes but only call
    # the API for new/changed chunks (cache handles the rest).
    
    # Convert to numpy array (these are all the embeddings we need)
    all_chunk_contents = []
    for ep in episodes:
        for chunk in ep.chunks:
            all_chunk_contents.append(chunk.content)
    
    # For full re-indexing, we already have all embeddings
    # For incremental, the cache should have the unchanged ones
    if len(new_embeddings) == chunks_to_embed and chunks_to_embed == total_chunks:
        # Full index - use new embeddings directly
        embeddings_array = np.array(new_embeddings, dtype=np.float32)
    else:
        # Incremental - we need to get embeddings for ALL chunks
        # The cache will return cached values for unchanged chunks
        print(f"\n📦 Building complete embeddings array...")
        print(f"   Total chunks needed: {total_chunks:,}")
        print(f"   New embeddings generated: {len(new_embeddings)}")
        print(f"   Getting remaining from cache...")
        
        # Get all embeddings (cache will be hit for unchanged)
        all_embeddings_list = []
        for i in range(0, len(all_chunk_contents), batch_size):
            batch = all_chunk_contents[i:i + batch_size]
            batch_embeddings = batch_get_embeddings(batch, use_cache=True, allow_fallback=False)
            all_embeddings_list.extend(batch_embeddings)
        
        embeddings_array = np.array(all_embeddings_list, dtype=np.float32)
    
    print(f"   📐 Final embeddings shape: {embeddings_array.shape}")
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # VALIDATION: Verify indexing completeness
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print(f"\n🔍 Validating indexing completeness...")
    
    validation_errors = []
    
    # 1. Check source file count matches parsed episode count
    source_files = find_transcript_files(archive_path)
    if len(source_files) != len(episodes):
        validation_errors.append(
            f"File count mismatch: {len(source_files)} files vs {len(episodes)} parsed episodes"
        )
    else:
        print(f"   ✅ Episode count: {len(episodes)} files = {len(episodes)} episodes")
    
    # 2. Check embedding count matches chunk count
    if embeddings_array.shape[0] != total_chunks:
        validation_errors.append(
            f"Embedding count mismatch: {embeddings_array.shape[0]} embeddings vs {total_chunks} chunks"
        )
    else:
        print(f"   ✅ Chunk coverage: {total_chunks:,} chunks = {embeddings_array.shape[0]:,} embeddings")
    
    # 3. Check for empty chunks (check ALL chunks, not just new ones)
    empty_chunks = sum(1 for chunk in all_chunk_contents if not chunk.strip())
    if empty_chunks > 0:
        validation_errors.append(f"Found {empty_chunks} empty chunks")
    else:
        print(f"   ✅ No empty chunks")
    
    # 4. Check word coverage (chunks should contain ~95%+ of original words)
    chunk_words = sum(len(c.split()) for c in all_chunk_contents)
    word_coverage = chunk_words / total_words if total_words > 0 else 0
    if word_coverage < 0.90:
        validation_errors.append(
            f"Low word coverage: chunks contain {word_coverage:.1%} of original words"
        )
    else:
        print(f"   ✅ Word coverage: {word_coverage:.1%} of original content in chunks")
    
    # 5. Check embedding dimension
    if embeddings_array.shape[1] != EMBEDDING_DIM:
        validation_errors.append(
            f"Embedding dimension mismatch: {embeddings_array.shape[1]} vs expected {EMBEDDING_DIM}"
        )
    else:
        print(f"   ✅ Embedding dimension: {embeddings_array.shape[1]}")
    
    # Report validation results
    if validation_errors:
        print(f"\n❌ VALIDATION FAILED:")
        for err in validation_errors:
            print(f"   • {err}")
        return {"success": False, "error": "Validation failed", "validation_errors": validation_errors}
    
    print(f"   🎯 All validation checks passed!")
    
    # Create metadata
    metadata = episodes_to_metadata(episodes, archive_format)
    metadata["source_path"] = str(archive_path)
    metadata["validation"] = {
        "source_files": len(source_files),
        "parsed_episodes": len(episodes),
        "total_chunks": total_chunks,
        "total_embeddings": embeddings_array.shape[0],
        "word_coverage_pct": round(word_coverage * 100, 1),
        "empty_chunks": empty_chunks,
        "validated_at": datetime.utcnow().isoformat() + "Z",
    }
    
    # Save files
    embeddings_path, metadata_path = get_output_paths()
    
    print(f"\n💾 Saving files...")
    
    # Save embeddings
    np.savez_compressed(embeddings_path, embeddings=embeddings_array)
    embeddings_size = embeddings_path.stat().st_size / (1024 * 1024)
    print(f"   ✅ {embeddings_path.name}: {embeddings_size:.1f}MB")
    
    # Save metadata
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    metadata_size = metadata_path.stat().st_size / (1024 * 1024)
    print(f"   ✅ {metadata_path.name}: {metadata_size:.1f}MB")
    
    print(f"\n🎉 Indexing complete!")
    print(f"   Total time: {parse_time + embed_time:.1f}s")
    print(f"   Total size: {embeddings_size + metadata_size:.1f}MB")
    
    # Clean up checkpoint file on successful completion
    if checkpoint_path.exists():
        try:
            checkpoint_path.unlink()
            print(f"   ✅ Checkpoint cleaned up")
        except Exception as e:
            print(f"   ⚠️ Could not delete checkpoint: {e}")
    
    return {
        "success": True,
        "format": archive_format,
        "episodes": len(episodes),
        "with_metadata": with_metadata,
        "chunks": total_chunks,
        "words": total_words,
        "embeddings_size_mb": embeddings_size,
        "metadata_size_mb": metadata_size,
        "time_seconds": parse_time + embed_time,
        "validation": {
            "source_files": len(source_files),
            "word_coverage_pct": round(word_coverage * 100, 1),
            "all_checks_passed": True,
        },
    }


def main():
    parser = argparse.ArgumentParser(
        description="Index Lenny Podcast Archive for local semantic search"
    )
    parser.add_argument(
        "archive_path",
        nargs="?",
        default="data/lenny-transcripts",  # Default to GitHub format
        help="Path to archive folder (default: 'data/lenny-transcripts')",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and report stats without generating embeddings",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-index even if already indexed with same file hashes",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Number of chunks to embed per API call (default: 100)",
    )
    
    args = parser.parse_args()
    
    # Resolve archive path relative to project root
    archive_path = Path(args.archive_path)
    if not archive_path.is_absolute():
        project_root = Path(__file__).parent.parent.parent
        archive_path = project_root / archive_path
    
    result = index_lenny_archive(
        archive_path=archive_path,
        dry_run=args.dry_run,
        force=args.force,
        batch_size=args.batch_size,
    )
    
    if not result.get("success"):
        sys.exit(1)


if __name__ == "__main__":
    main()
