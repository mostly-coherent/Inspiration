"""
Semantic Search — Embedding-based similarity search for chat history.

Uses OpenAI text-embedding-3-small for embeddings and cosine similarity for matching.
"""

import json
import os
import hashlib
from pathlib import Path
from typing import Any

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    np = None

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    openai = None
    OPENAI_AVAILABLE = False

from .config import get_data_dir, load_env_file


# Embedding model
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536  # Dimension for text-embedding-3-small


def get_embedding_cache_path() -> Path:
    """Get path to embedding cache file."""
    data_dir = get_data_dir()
    return data_dir / "embedding_cache.json"


def get_openai_client():
    """Get OpenAI client, initializing if needed."""
    if not OPENAI_AVAILABLE:
        raise RuntimeError("OpenAI library not installed. Run: pip install openai")
    
    load_env_file()
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY not found. Please set it in your .env file."
        )
    
    return openai.OpenAI(api_key=api_key)


def get_text_hash(text: str) -> str:
    """Generate hash for text (for cache key)."""
    return hashlib.sha256(text.encode()).hexdigest()


def get_embedding(text: str, use_cache: bool = True) -> list[float]:
    """
    Get embedding for text, using cache if available.
    
    Args:
        text: Text to embed
        use_cache: Whether to use cached embeddings
    
    Returns:
        Embedding vector (list of floats)
    """
    if not text.strip():
        return [0.0] * EMBEDDING_DIM
    
    cache_path = get_embedding_cache_path()
    cache_key = get_text_hash(text)
    
    # Try cache first
    if use_cache and cache_path.exists():
        try:
            with open(cache_path) as f:
                cache = json.load(f)
                if cache_key in cache:
                    return cache[cache_key]
        except (json.JSONDecodeError, IOError):
            pass
    
    # Generate embedding
    client = get_openai_client()
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text.strip(),
    )
    embedding = response.data[0].embedding
    
    # Save to cache
    if use_cache:
        try:
            cache = {}
            if cache_path.exists():
                with open(cache_path) as f:
                    cache = json.load(f)
            cache[cache_key] = embedding
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_path, "w") as f:
                json.dump(cache, f)
        except (IOError, json.JSONEncodeError):
            pass  # Cache write failed, but embedding is still valid
    
    return embedding


def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    """
    Calculate cosine similarity between two vectors.
    
    Args:
        vec1: First vector
        vec2: Second vector
    
    Returns:
        Similarity score between -1 and 1 (higher = more similar)
    """
    if NUMPY_AVAILABLE:
        vec1_arr = np.array(vec1)
        vec2_arr = np.array(vec2)
        
        dot_product = np.dot(vec1_arr, vec2_arr)
        norm1 = np.linalg.norm(vec1_arr)
        norm2 = np.linalg.norm(vec2_arr)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return float(dot_product / (norm1 * norm2))
    else:
        # Pure Python fallback
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = sum(a * a for a in vec1) ** 0.5
        norm2 = sum(b * b for b in vec2) ** 0.5
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)


def search_messages(
    query: str,
    messages: list[dict],
    top_k: int = 10,
    min_similarity: float = 0.0,
    context_messages: int = 2,
) -> list[dict]:
    """
    Search messages for semantic matches to query.
    
    Args:
        query: Search query (user's insight/idea)
        messages: List of message dicts with "text" and "timestamp" keys
        top_k: Maximum number of results to return
        min_similarity: Minimum similarity score threshold (0-1)
        context_messages: Number of messages before/after to include as context
    
    Returns:
        List of match dicts:
        [
            {
                "message": {...},  # Original message
                "similarity": 0.85,
                "context": {
                    "before": [...],  # Previous messages
                    "after": [...],   # Next messages
                },
            },
            ...
        ]
    """
    if not messages:
        return []
    
    # Get query embedding
    query_embedding = get_embedding(query)
    
    # Get embeddings for all messages
    message_embeddings = []
    for msg in messages:
        text = msg.get("text", "").strip()
        if not text:
            continue
        embedding = get_embedding(text)
        message_embeddings.append({
            "message": msg,
            "embedding": embedding,
        })
    
    if not message_embeddings:
        return []
    
    # Calculate similarities
    matches = []
    for item in message_embeddings:
        similarity = cosine_similarity(query_embedding, item["embedding"])
        if similarity >= min_similarity:
            matches.append({
                "message": item["message"],
                "similarity": similarity,
            })
    
    # Sort by similarity (descending)
    matches.sort(key=lambda x: x["similarity"], reverse=True)
    
    # Take top_k
    matches = matches[:top_k]
    
    # Add context (previous/next messages)
    for match in matches:
        msg_idx = None
        for i, msg in enumerate(messages):
            if msg == match["message"]:
                msg_idx = i
                break
        
        if msg_idx is not None:
            context_before = messages[max(0, msg_idx - context_messages):msg_idx]
            context_after = messages[msg_idx + 1:msg_idx + 1 + context_messages]
            match["context"] = {
                "before": context_before,
                "after": context_after,
            }
        else:
            match["context"] = {"before": [], "after": []}
    
    return matches


def batch_get_embeddings(texts: list[str], use_cache: bool = True) -> list[list[float]]:
    """
    Get embeddings for multiple texts efficiently (batched API call).
    
    Args:
        texts: List of texts to embed
        use_cache: Whether to use cached embeddings
    
    Returns:
        List of embedding vectors
    """
    if not texts:
        return []
    
    # Filter out empty texts
    non_empty_texts = [(i, text) for i, text in enumerate(texts) if text.strip()]
    if not non_empty_texts:
        return [[0.0] * EMBEDDING_DIM] * len(texts)
    
    cache_path = get_embedding_cache_path()
    cache = {}
    if use_cache and cache_path.exists():
        try:
            with open(cache_path) as f:
                cache = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    
    # Check cache for each text
    indices_to_fetch = []
    texts_to_fetch = []
    embeddings_result = [None] * len(texts)
    
    for i, text in non_empty_texts:
        cache_key = get_text_hash(text)
        if use_cache and cache_key in cache:
            embeddings_result[i] = cache[cache_key]
        else:
            indices_to_fetch.append(i)
            texts_to_fetch.append(text)
    
    # Fetch missing embeddings in batch
    if texts_to_fetch:
        client = get_openai_client()
        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=texts_to_fetch,
        )
        
        # Update cache and results
        for idx, embedding_data in zip(indices_to_fetch, response.data):
            embedding = embedding_data.embedding
            embeddings_result[idx] = embedding
            
            # Update cache
            if use_cache:
                text = texts_to_fetch[indices_to_fetch.index(idx)]
                cache_key = get_text_hash(text)
                cache[cache_key] = embedding
        
        # Save updated cache
        if use_cache:
            try:
                cache_path.parent.mkdir(parents=True, exist_ok=True)
                with open(cache_path, "w") as f:
                    json.dump(cache, f)
            except (IOError, json.JSONEncodeError):
                pass
    
    # Fill in empty texts with zero vectors
    for i, text in enumerate(texts):
        if not text.strip():
            embeddings_result[i] = [0.0] * EMBEDDING_DIM
    
    return embeddings_result

