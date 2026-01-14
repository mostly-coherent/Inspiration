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
    
    # Check if we can skip (files unchanged)
    if not force:
        existing_metadata = load_existing_metadata()
        if existing_metadata:
            existing_hashes = get_indexed_file_hashes(existing_metadata)
            new_hashes = {ep.filename: ep.file_hash for ep in episodes}
            
            if existing_hashes == new_hashes:
                print(f"\n✅ Archive already indexed and unchanged.")
                print(f"   Use --force to re-index anyway.")
                return {
                    "success": True,
                    "skipped": True,
                    "reason": "Already indexed, no changes",
                }
    
    # Generate embeddings
    print(f"\n🧠 Generating embeddings...")
    print(f"   Batch size: {batch_size}")
    print(f"   Estimated API cost: ~${total_chunks * 0.0001:.2f}")
    
    # Collect all chunk texts
    all_chunks = []
    for ep in episodes:
        for chunk in ep.chunks:
            all_chunks.append(chunk.content)
    
    # Embed in batches with progress
    all_embeddings = []
    start_time = time.time()
    
    for i in range(0, len(all_chunks), batch_size):
        batch = all_chunks[i:i + batch_size]
        batch_num = i // batch_size + 1
        total_batches = (len(all_chunks) + batch_size - 1) // batch_size
        
        print(f"   Batch {batch_num}/{total_batches} ({i + len(batch)}/{len(all_chunks)} chunks)...", end="", flush=True)
        
        try:
            embeddings = batch_get_embeddings(batch, use_cache=True, allow_fallback=False)
            all_embeddings.extend(embeddings)
            print(" ✅")
        except Exception as e:
            print(f" ❌")
            print(f"   Error: {e}")
            return {"success": False, "error": str(e)}
    
    embed_time = time.time() - start_time
    print(f"   ✅ Generated {len(all_embeddings)} embeddings in {embed_time:.1f}s")
    
    # Convert to numpy array
    embeddings_array = np.array(all_embeddings, dtype=np.float32)
    print(f"   📐 Embeddings shape: {embeddings_array.shape}")
    
    # Create metadata
    metadata = episodes_to_metadata(episodes, archive_format)
    metadata["source_path"] = str(archive_path)
    
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
