"""
Lenny Archive Search — Local semantic search using pre-computed embeddings.

Uses numpy for fast cosine similarity search over ~12K chunks.
Embeddings stored in .npz file (no cloud database needed).

v2: Supports rich metadata (title, youtube_url) from GitHub format.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    np = None
    NUMPY_AVAILABLE = False

from .config import get_data_dir
from .semantic_search import get_embedding, EMBEDDING_DIM


@dataclass
class LennySearchResult:
    """A search result from the Lenny archive."""
    guest_name: str
    speaker: str  # Who said it (guest or "Lenny")
    timestamp: str  # When in the episode
    content: str  # The matching chunk content
    similarity: float  # Cosine similarity score
    episode_filename: str  # For linking to full episode
    chunk_index: int
    # Rich metadata (v2, from GitHub format)
    episode_title: str | None = None
    youtube_url: str | None = None
    video_id: str | None = None
    duration: str | None = None  # Human-readable "1:23:45"


# Cache for loaded embeddings (avoid reloading on every search)
_embeddings_cache: dict = {}


def get_lenny_data_paths() -> tuple[Path, Path]:
    """Get paths to Lenny embeddings and metadata files."""
    data_dir = get_data_dir()
    embeddings_path = data_dir / "lenny_embeddings.npz"
    metadata_path = data_dir / "lenny_metadata.json"
    return embeddings_path, metadata_path


def is_lenny_indexed() -> bool:
    """Check if Lenny archive has been indexed."""
    embeddings_path, metadata_path = get_lenny_data_paths()
    return embeddings_path.exists() and metadata_path.exists()


def get_lenny_stats() -> Optional[dict]:
    """Get statistics about the indexed Lenny archive."""
    if not is_lenny_indexed():
        return None
    
    _, metadata_path = get_lenny_data_paths()
    
    try:
        with open(metadata_path) as f:
            metadata = json.load(f)
        
        return {
            "episode_count": metadata.get("stats", {}).get("total_episodes", 0),
            "chunk_count": metadata.get("stats", {}).get("total_chunks", 0),
            "word_count": metadata.get("stats", {}).get("total_words", 0),
            "with_rich_metadata": metadata.get("stats", {}).get("with_rich_metadata", 0),
            "indexed_at": metadata.get("indexed_at"),
            "version": metadata.get("version", 1),
            "format": metadata.get("format", "legacy"),
        }
    except (json.JSONDecodeError, IOError):
        return None


def load_lenny_embeddings() -> tuple[np.ndarray, list[dict]]:
    """
    Load Lenny embeddings and metadata from disk.
    
    Returns:
        Tuple of (embeddings array, chunks metadata list)
        
    Raises:
        RuntimeError: If embeddings not indexed or numpy not available
    """
    global _embeddings_cache
    
    if not NUMPY_AVAILABLE:
        raise RuntimeError("numpy not available. Install with: pip install numpy")
    
    if not is_lenny_indexed():
        raise RuntimeError(
            "Lenny archive not indexed. Run: python3 engine/scripts/index_lenny_local.py"
        )
    
    # Return cached if available
    if "embeddings" in _embeddings_cache and "chunks" in _embeddings_cache:
        return _embeddings_cache["embeddings"], _embeddings_cache["chunks"]
    
    embeddings_path, metadata_path = get_lenny_data_paths()
    
    # Load embeddings
    npz_data = np.load(embeddings_path)
    embeddings = npz_data["embeddings"]
    
    # Load metadata
    with open(metadata_path) as f:
        metadata = json.load(f)
    
    chunks = metadata.get("chunks", [])
    
    # Validate shapes match
    if len(embeddings) != len(chunks):
        raise RuntimeError(
            f"Embeddings/metadata mismatch: {len(embeddings)} embeddings, {len(chunks)} chunks"
        )
    
    # Cache for future calls
    _embeddings_cache["embeddings"] = embeddings
    _embeddings_cache["chunks"] = chunks
    _embeddings_cache["episodes"] = {ep["id"]: ep for ep in metadata.get("episodes", [])}
    
    return embeddings, chunks


def clear_lenny_cache():
    """Clear the embeddings cache (useful after re-indexing)."""
    global _embeddings_cache
    _embeddings_cache = {}


def search_lenny_archive(
    query: str,
    top_k: int = 5,
    min_similarity: float = 0.3,
    guest_filter: Optional[str] = None,
) -> list[LennySearchResult]:
    """
    Search Lenny podcast archive for relevant expert quotes.
    
    Args:
        query: Search query (topic, question, or concept)
        top_k: Maximum number of results
        min_similarity: Minimum cosine similarity threshold (0-1)
        guest_filter: Optional guest name to filter by (case-insensitive)
        
    Returns:
        List of LennySearchResult objects, sorted by similarity (descending)
    """
    if not NUMPY_AVAILABLE:
        raise RuntimeError("numpy not available. Install with: pip install numpy")
    
    # Load embeddings
    embeddings, chunks = load_lenny_embeddings()
    episodes = _embeddings_cache.get("episodes", {})
    
    # Embed query
    query_embedding = get_embedding(query, allow_fallback=False)
    query_vec = np.array(query_embedding)
    
    # Normalize query vector
    query_norm = np.linalg.norm(query_vec)
    if query_norm == 0:
        return []
    query_vec = query_vec / query_norm
    
    # Compute cosine similarities (embeddings should already be normalized)
    # If not normalized, normalize them
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1  # Avoid division by zero
    normalized_embeddings = embeddings / norms
    
    similarities = np.dot(normalized_embeddings, query_vec)
    
    # Apply guest filter if provided
    if guest_filter:
        guest_filter_lower = guest_filter.lower()
        mask = np.array([
            guest_filter_lower in chunks[i].get("speaker", "").lower() or
            guest_filter_lower in episodes.get(chunks[i].get("episode_id", ""), {}).get("guest_name", "").lower()
            for i in range(len(chunks))
        ])
        similarities = np.where(mask, similarities, -1)
    
    # Apply minimum similarity threshold
    valid_mask = similarities >= min_similarity
    if not np.any(valid_mask):
        return []
    
    # Get top-k indices
    # Set invalid ones to -inf so they're not selected
    similarities_masked = np.where(valid_mask, similarities, -np.inf)
    top_indices = np.argsort(similarities_masked)[-top_k:][::-1]
    
    # Filter out any that didn't meet threshold
    top_indices = [i for i in top_indices if similarities[i] >= min_similarity]
    
    # Build results
    results = []
    for idx in top_indices:
        chunk = chunks[idx]
        episode_id = chunk.get("episode_id", "")
        episode = episodes.get(episode_id, {})
        
        results.append(LennySearchResult(
            guest_name=episode.get("guest_name", "Unknown"),
            speaker=chunk.get("speaker", "Unknown"),
            timestamp=chunk.get("timestamp", "00:00:00"),
            content=chunk.get("content", ""),
            similarity=float(similarities[idx]),
            episode_filename=episode.get("filename", ""),
            chunk_index=chunk.get("idx", 0),
            # Rich metadata (v2)
            episode_title=episode.get("title"),
            youtube_url=episode.get("youtube_url"),
            video_id=episode.get("video_id"),
            duration=episode.get("duration"),
        ))
    
    return results


def get_episode_context(
    episode_filename: str,
    chunk_index: int,
    context_chunks: int = 2,
) -> dict:
    """
    Get surrounding context for a chunk (previous/next chunks in episode).
    
    Args:
        episode_filename: Episode filename
        chunk_index: Index of the target chunk
        context_chunks: Number of chunks before/after to include
        
    Returns:
        Dict with "before" and "after" chunk lists
    """
    _, chunks = load_lenny_embeddings()
    episodes = _embeddings_cache.get("episodes", {})
    
    # Find episode ID
    episode_id = None
    for ep_id, ep in episodes.items():
        if ep.get("filename") == episode_filename:
            episode_id = ep_id
            break
    
    if not episode_id:
        return {"before": [], "after": []}
    
    # Find all chunks for this episode
    episode_chunks = [
        (i, c) for i, c in enumerate(chunks) 
        if c.get("episode_id") == episode_id
    ]
    episode_chunks.sort(key=lambda x: x[1].get("idx", 0))
    
    # Find position of target chunk
    target_pos = None
    for pos, (global_idx, chunk) in enumerate(episode_chunks):
        if chunk.get("idx") == chunk_index:
            target_pos = pos
            break
    
    if target_pos is None:
        return {"before": [], "after": []}
    
    # Get context
    before_chunks = episode_chunks[max(0, target_pos - context_chunks):target_pos]
    after_chunks = episode_chunks[target_pos + 1:target_pos + 1 + context_chunks]
    
    return {
        "before": [c for _, c in before_chunks],
        "after": [c for _, c in after_chunks],
    }


def list_all_guests() -> list[str]:
    """Get list of all guest names in the indexed archive."""
    if not is_lenny_indexed():
        return []
    
    _, metadata_path = get_lenny_data_paths()
    
    try:
        with open(metadata_path) as f:
            metadata = json.load(f)
        
        return sorted([
            ep.get("guest_name", "Unknown")
            for ep in metadata.get("episodes", [])
        ])
    except (json.JSONDecodeError, IOError):
        return []


def get_episode_by_id(episode_id: str) -> Optional[dict]:
    """Get episode metadata by ID."""
    if not is_lenny_indexed():
        return None
    
    # Ensure cache is loaded
    load_lenny_embeddings()
    episodes = _embeddings_cache.get("episodes", {})
    
    return episodes.get(episode_id)


def list_all_episodes() -> list[dict]:
    """Get list of all episodes with metadata."""
    if not is_lenny_indexed():
        return []
    
    _, metadata_path = get_lenny_data_paths()
    
    try:
        with open(metadata_path) as f:
            metadata = json.load(f)
        
        return metadata.get("episodes", [])
    except (json.JSONDecodeError, IOError):
        return []


# For testing
if __name__ == "__main__":
    import sys
    
    if not is_lenny_indexed():
        print("❌ Lenny archive not indexed.")
        print("   Run: python3 engine/scripts/index_lenny_local.py")
        sys.exit(1)
    
    stats = get_lenny_stats()
    print(f"📚 Lenny Archive Stats:")
    print(f"   Episodes: {stats['episode_count']}")
    print(f"   Chunks: {stats['chunk_count']}")
    print(f"   Words: {stats['word_count']:,}")
    print(f"   Format: {stats['format']}")
    print(f"   With rich metadata: {stats['with_rich_metadata']}")
    
    # Test search
    query = sys.argv[1] if len(sys.argv) > 1 else "user onboarding activation"
    print(f"\n🔍 Searching for: '{query}'")
    
    results = search_lenny_archive(query, top_k=3)
    
    for i, result in enumerate(results, 1):
        print(f"\n{i}. {result.guest_name} ({result.similarity:.2f})")
        if result.episode_title:
            print(f"   Episode: {result.episode_title}")
        print(f"   Speaker: {result.speaker}")
        print(f"   Timestamp: {result.timestamp}")
        if result.youtube_url:
            print(f"   YouTube: {result.youtube_url}")
        print(f"   Content: {result.content[:200]}...")
