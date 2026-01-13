"""
Counter-Intuitive Perspective Generator — LLM-powered reflection prompts.

Analyzes strong Library themes and generates "good opposite" perspectives
that challenge user assumptions constructively.

IMPORTANT: This generates REFLECTION PROMPTS, not Library items.
Library remains pure (chat-only). These are seeds for future thinking.

Performance Optimizations (CI-PERF):
- P1: Parallel LLM calls via ThreadPoolExecutor (5x speedup)
- P2: Cache cluster results (threshold-keyed, skip re-clustering on filter change)
- P3: Cache counter-perspectives by cluster hash (skip LLM on repeat views)

Kill Criteria:
- < 20% engagement after 2 weeks → Remove feature
- > 80% dismiss rate → Feature doesn't resonate
- Zero saved reflections → No value delivered
"""

import os
import sys
import json
import hashlib
from datetime import datetime
from typing import Optional
from dataclasses import dataclass, asdict
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    Client = None

from common.config import load_env_file, get_data_dir
from common.semantic_search import cosine_similarity
from common.llm import create_llm


# =============================================================================
# P2 + P3: Caching Infrastructure
# =============================================================================

# In-memory cache for clusters (P2) - keyed by threshold
_cluster_cache: dict[float, tuple[list[list[dict]], float]] = {}  # threshold -> (clusters, timestamp)
CLUSTER_CACHE_TTL = 300  # 5 minutes - clusters don't change often

# In-memory cache for counter-perspectives (P3) - keyed by cluster hash
_perspective_cache: dict[str, tuple[dict, float]] = {}  # cluster_hash -> (LLM result, timestamp)
PERSPECTIVE_CACHE_TTL = 3600  # 1 hour - perspectives are expensive to generate


def _get_cluster_hash(cluster: list[dict]) -> str:
    """Generate a hash for a cluster based on item IDs and titles."""
    # Sort by ID for consistent hashing
    items_str = "|".join(sorted(f"{item.get('id', '')}:{item.get('title', '')}" for item in cluster))
    return hashlib.md5(items_str.encode()).hexdigest()[:12]


def _get_cached_clusters(threshold: float) -> Optional[list[list[dict]]]:
    """Get cached clusters if still valid (P2)."""
    import time
    if threshold in _cluster_cache:
        clusters, cached_at = _cluster_cache[threshold]
        if time.time() - cached_at < CLUSTER_CACHE_TTL:
            return clusters
    return None


def _cache_clusters(threshold: float, clusters: list[list[dict]]) -> None:
    """Cache clusters for a threshold (P2)."""
    import time
    _cluster_cache[threshold] = (clusters, time.time())


def _get_cached_perspective(cluster_hash: str) -> Optional[dict]:
    """Get cached counter-perspective if available (P3)."""
    import time
    if cluster_hash in _perspective_cache:
        result, cached_at = _perspective_cache[cluster_hash]
        if time.time() - cached_at < PERSPECTIVE_CACHE_TTL:
            return result
        # Expired, remove it
        del _perspective_cache[cluster_hash]
    return None


def _cache_perspective(cluster_hash: str, result: dict) -> None:
    """Cache a counter-perspective result (P3)."""
    import time
    _perspective_cache[cluster_hash] = (result, time.time())


def clear_caches() -> None:
    """Clear all caches (useful for testing or forced refresh)."""
    global _cluster_cache, _perspective_cache
    _cluster_cache = {}
    _perspective_cache = {}
    print("   🗑️  Caches cleared", file=sys.stderr)


@dataclass
class CounterIntuitiveSuggestion:
    """A counter-intuitive perspective on a Library theme."""
    id: str
    cluster_title: str
    cluster_size: int
    counter_perspective: str
    reasoning: str
    suggested_angles: list[str]
    reflection_prompt: str
    is_saved: bool = False
    saved_at: Optional[str] = None
    dismissed: bool = False


def get_supabase_client() -> Optional[Client]:
    """Get Supabase client."""
    if not SUPABASE_AVAILABLE:
        return None
    
    load_env_file()
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_key:
        return None
    
    return create_client(supabase_url, supabase_key)


def parse_embedding(embedding_data) -> Optional[list[float]]:
    """Parse embedding from various formats."""
    if embedding_data is None:
        return None
    
    if isinstance(embedding_data, list) and len(embedding_data) > 0:
        return embedding_data
    
    if isinstance(embedding_data, str):
        try:
            parsed = json.loads(embedding_data)
            if isinstance(parsed, list) and len(parsed) > 0:
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass
    
    return None


def cluster_library_items(
    client: Client,
    threshold: float = 0.75,
    use_cache: bool = True,
) -> list[list[dict]]:
    """
    Cluster Library items by embedding similarity.
    
    P2 Optimization: Results are cached by threshold for 5 minutes.
    When user changes min_cluster_size filter, we reuse cached clusters
    instead of re-fetching and re-clustering.
    
    Returns list of clusters, each cluster is a list of items.
    """
    # P2: Check cache first
    if use_cache:
        cached = _get_cached_clusters(threshold)
        if cached is not None:
            print(f"   📦 Using cached clusters (threshold={threshold})", file=sys.stderr)
            return cached
    
    # Fetch Library items with embeddings
    result = client.table("library_items")\
        .select("id, title, description, item_type, embedding")\
        .execute()
    
    if not result.data:
        return []
    
    # Parse embeddings and filter
    items = []
    for item in result.data:
        embedding = parse_embedding(item.get("embedding"))
        if embedding:
            items.append({
                "id": item.get("id"),
                "title": item.get("title", ""),
                "description": item.get("description", ""),
                "item_type": item.get("item_type", "idea"),
                "embedding": embedding,
            })
    
    if not items:
        return []
    
    # Cluster by similarity
    clusters: list[list[dict]] = []
    
    for item in items:
        embedding = item.get("embedding")
        if not embedding:
            continue
        
        best_cluster_idx = None
        best_similarity = 0
        
        for idx, cluster in enumerate(clusters):
            rep_embedding = cluster[0].get("embedding")
            if rep_embedding:
                similarity = cosine_similarity(embedding, rep_embedding)
                if similarity >= threshold and similarity > best_similarity:
                    best_similarity = similarity
                    best_cluster_idx = idx
        
        if best_cluster_idx is not None:
            clusters[best_cluster_idx].append(item)
        else:
            clusters.append([item])
    
    # P2: Cache the results
    if use_cache:
        _cache_clusters(threshold, clusters)
        print(f"   💾 Cached {len(clusters)} clusters (threshold={threshold})", file=sys.stderr)
    
    return clusters


def generate_cluster_title(items: list[dict]) -> str:
    """Generate a title for a cluster from item titles."""
    if not items:
        return "Unknown Theme"
    
    if len(items) == 1:
        return items[0].get("title", "Unknown")[:50]
    
    # Find common words in titles
    stop_words = {"the", "a", "an", "is", "are", "was", "were", "be", "been",
                  "have", "has", "had", "do", "does", "did", "will", "would",
                  "could", "should", "may", "might", "must", "can", "i", "you",
                  "we", "they", "it", "this", "that", "my", "your", "our",
                  "what", "which", "who", "how", "when", "where", "why", "to",
                  "for", "with", "from", "about", "into", "through", "and",
                  "but", "or", "if", "of", "at", "by", "in", "on", "as"}
    
    word_counts: dict[str, int] = {}
    for item in items[:10]:
        title = item.get("title", "").lower()
        words = title.split()
        for word in words:
            word = ''.join(c for c in word if c.isalnum())
            if len(word) > 3 and word not in stop_words:
                word_counts[word] = word_counts.get(word, 0) + 1
    
    top_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    
    if top_words:
        return " & ".join(w[0].capitalize() for w in top_words)
    
    return items[0].get("title", "Unknown Theme")[:40]


def load_prompt_template() -> str:
    """Load the counter-intuitive prompt template."""
    prompt_path = Path(__file__).parent.parent / "prompts" / "counter_intuitive.md"
    
    if prompt_path.exists():
        return prompt_path.read_text()
    
    # Fallback inline prompt
    return """Generate a counter-intuitive perspective for this theme.

Theme: {theme_name}
Items: {item_count}
Sample items:
{sample_items}

Return JSON with: counterPerspective, reasoning, suggestedAngles (array), reflectionPrompt"""


def generate_counter_perspective(
    theme_name: str,
    items: list[dict],
    use_cache: bool = True,
) -> Optional[dict]:
    """
    Use LLM to generate a counter-intuitive perspective for a theme.
    
    P3 Optimization: Results are cached by cluster hash. If the same cluster
    (same items) is encountered again, we return the cached LLM result
    instead of making another expensive API call.
    
    Returns dict with counterPerspective, reasoning, suggestedAngles, reflectionPrompt.
    """
    # P3: Check cache first
    cluster_hash = _get_cluster_hash(items)
    if use_cache:
        cached = _get_cached_perspective(cluster_hash)
        if cached is not None:
            print(f"   📦 Using cached perspective for: {theme_name}", file=sys.stderr)
            return cached
    
    # Prepare sample items for prompt
    sample_items = "\n".join([
        f"- {item.get('title', 'Untitled')}: {item.get('description', '')[:100]}"
        for item in items[:5]
    ])
    
    # Load and fill prompt template
    prompt_template = load_prompt_template()
    prompt = prompt_template.format(
        theme_name=theme_name,
        item_count=len(items),
        sample_items=sample_items,
    )
    
    try:
        # Create LLM provider and call
        llm = create_llm()
        response = llm.generate(
            prompt=prompt,
            temperature=0.7,  # Higher temp for creativity
            max_tokens=800,
        )
        
        if not response:
            return None
        
        # Parse JSON from response
        # Handle potential markdown code blocks
        text = response.strip()
        if text.startswith("```"):
            # Remove markdown code block
            lines = text.split("\n")
            # Find closing ``` and remove it too
            if "```" in lines[-1]:
                lines = lines[1:-1]
            else:
                lines = lines[1:]
            text = "\n".join(lines)
        
        # Also strip "json" from start if present
        if text.startswith("json"):
            text = text[4:].strip()
        
        result = json.loads(text)
        
        # Validate required fields
        required = ["counterPerspective", "reasoning", "suggestedAngles", "reflectionPrompt"]
        if all(k in result for k in required):
            # P3: Cache the result
            if use_cache:
                _cache_perspective(cluster_hash, result)
            return result
        
        return None
        
    except (json.JSONDecodeError, Exception) as e:
        print(f"⚠️  Failed to generate counter-perspective: {e}", file=sys.stderr)
        return None


def load_batch_prompt_template() -> str:
    """Load the batch counter-intuitive prompt template."""
    prompt_path = Path(__file__).parent.parent / "prompts" / "counter_intuitive_batch.md"
    
    if prompt_path.exists():
        return prompt_path.read_text()
    
    # Fallback inline prompt
    return """Generate counter-intuitive perspectives for these themes.

Themes:
{themes_json}

Return a JSON array with objects containing: themeIndex, counterPerspective, reasoning, suggestedAngles, reflectionPrompt"""


def generate_batch_counter_perspectives(
    themes: list[tuple[str, list[dict]]],
    use_cache: bool = True,
) -> list[Optional[dict]]:
    """
    P10 Optimization: Generate counter-perspectives for multiple themes in a single LLM call.
    
    This reduces API calls from N to 1, saving cost and potentially latency.
    
    Args:
        themes: List of (theme_name, items) tuples
        use_cache: Whether to use cached results
    
    Returns:
        List of result dicts (or None for failed themes), in same order as input
    """
    if not themes:
        return []
    
    # Check P3 cache for each theme first
    results: list[Optional[dict]] = [None] * len(themes)
    uncached_indices: list[int] = []
    uncached_themes: list[tuple[str, list[dict]]] = []
    
    for idx, (theme_name, items) in enumerate(themes):
        if use_cache:
            cluster_hash = _get_cluster_hash(items)
            cached = _get_cached_perspective(cluster_hash)
            if cached is not None:
                print(f"   📦 Using cached perspective for: {theme_name}", file=sys.stderr)
                results[idx] = cached
                continue
        uncached_indices.append(idx)
        uncached_themes.append((theme_name, items))
    
    if not uncached_themes:
        print(f"   ✅ All {len(themes)} perspectives from cache", file=sys.stderr)
        return results
    
    print(f"   🔄 Generating {len(uncached_themes)} perspectives in single batch call...", file=sys.stderr)
    
    # Prepare themes JSON for prompt
    themes_data = []
    for idx, (theme_name, items) in enumerate(uncached_themes):
        sample_items = [
            f"{item.get('title', 'Untitled')}: {item.get('description', '')[:80]}"
            for item in items[:4]
        ]
        themes_data.append({
            "index": idx,
            "themeName": theme_name,
            "itemCount": len(items),
            "sampleItems": sample_items,
        })
    
    # Load and fill prompt template
    prompt_template = load_batch_prompt_template()
    prompt = prompt_template.format(
        themes_json=json.dumps(themes_data, indent=2),
    )
    
    try:
        # Create LLM provider and call
        llm = create_llm()
        response = llm.generate(
            prompt=prompt,
            temperature=0.7,
            max_tokens=400 * len(uncached_themes),  # ~400 tokens per theme
        )
        
        if not response:
            print("   ⚠️  Empty response from batch LLM call", file=sys.stderr)
            return results
        
        # Parse JSON from response
        text = response.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            if "```" in lines[-1]:
                lines = lines[1:-1]
            else:
                lines = lines[1:]
            text = "\n".join(lines)
        if text.startswith("json"):
            text = text[4:].strip()
        
        batch_results = json.loads(text)
        
        if not isinstance(batch_results, list):
            print(f"   ⚠️  Expected array, got {type(batch_results)}", file=sys.stderr)
            return results
        
        # Map results back to original indices
        required = ["counterPerspective", "reasoning", "suggestedAngles", "reflectionPrompt"]
        for item in batch_results:
            theme_idx = item.get("themeIndex", -1)
            if theme_idx < 0 or theme_idx >= len(uncached_themes):
                continue
            
            if all(k in item for k in required):
                result = {
                    "counterPerspective": item["counterPerspective"],
                    "reasoning": item["reasoning"],
                    "suggestedAngles": item["suggestedAngles"],
                    "reflectionPrompt": item["reflectionPrompt"],
                }
                
                # Cache the result (P3)
                original_idx = uncached_indices[theme_idx]
                _, items = themes[original_idx]
                if use_cache:
                    cluster_hash = _get_cluster_hash(items)
                    _cache_perspective(cluster_hash, result)
                
                results[original_idx] = result
        
        cached_count = len(themes) - len(uncached_themes)
        generated_count = sum(1 for r in results if r is not None) - cached_count
        print(f"   ✅ Batch complete: {generated_count} generated, {cached_count} from cache", file=sys.stderr)
        
        return results
        
    except (json.JSONDecodeError, Exception) as e:
        print(f"   ⚠️  Batch generation failed: {e}", file=sys.stderr)
        return results


def get_saved_reflections_path() -> Path:
    """Get path to saved reflections file."""
    return get_data_dir() / "saved_reflections.json"


def load_saved_reflections() -> list[dict]:
    """Load saved reflections from file."""
    path = get_saved_reflections_path()
    if not path.exists():
        return []
    
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []


def save_reflection(suggestion: CounterIntuitiveSuggestion) -> bool:
    """Save a reflection prompt to the saved list."""
    reflections = load_saved_reflections()
    
    # Check if already saved
    if any(r.get("id") == suggestion.id for r in reflections):
        return False
    
    # Add to list
    reflection_data = {
        "id": suggestion.id,
        "clusterTitle": suggestion.cluster_title,
        "clusterSize": suggestion.cluster_size,
        "counterPerspective": suggestion.counter_perspective,
        "reasoning": suggestion.reasoning,
        "suggestedAngles": suggestion.suggested_angles,
        "reflectionPrompt": suggestion.reflection_prompt,
        "savedAt": datetime.now().isoformat(),
        "viewedCount": 0,
    }
    reflections.append(reflection_data)
    
    # Save to file
    path = get_saved_reflections_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(reflections, f, indent=2)
    
    return True


def get_dismissed_ids() -> set[str]:
    """Get set of dismissed suggestion IDs."""
    path = get_data_dir() / "dismissed_reflections.json"
    if not path.exists():
        return set()
    
    try:
        with open(path) as f:
            return set(json.load(f))
    except (json.JSONDecodeError, IOError):
        return set()


def dismiss_suggestion(suggestion_id: str) -> bool:
    """Mark a suggestion as dismissed."""
    dismissed = get_dismissed_ids()
    dismissed.add(suggestion_id)
    
    path = get_data_dir() / "dismissed_reflections.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(list(dismissed), f, indent=2)
    
    return True


def _generate_single_perspective(args: tuple) -> Optional[CounterIntuitiveSuggestion]:
    """
    Generate a single counter-perspective. Used by ThreadPoolExecutor.
    
    Args:
        args: Tuple of (idx, cluster, dismissed, saved, use_cache)
    
    Returns:
        CounterIntuitiveSuggestion or None if dismissed/failed
    """
    idx, cluster, dismissed, saved, use_cache = args
    
    cluster_title = generate_cluster_title(cluster)
    suggestion_id = f"counter-{idx}-{hash(cluster_title) % 10000}"
    
    # Skip if dismissed
    if suggestion_id in dismissed:
        return None
    
    # Generate counter-perspective (P3: pass use_cache to enable caching)
    print(f"   ⚡ Generating counter-perspective for: {cluster_title}...", file=sys.stderr)
    result = generate_counter_perspective(cluster_title, cluster, use_cache=use_cache)
    
    if result:
        return CounterIntuitiveSuggestion(
            id=suggestion_id,
            cluster_title=cluster_title,
            cluster_size=len(cluster),
            counter_perspective=result.get("counterPerspective", ""),
            reasoning=result.get("reasoning", ""),
            suggested_angles=result.get("suggestedAngles", []),
            reflection_prompt=result.get("reflectionPrompt", ""),
            is_saved=suggestion_id in saved,
        )
    return None


def detect_counter_intuitive(
    min_cluster_size: int = 5,
    threshold: float = 0.75,
    max_suggestions: int = 5,
    use_cache: bool = True,
    parallel: bool = True,
    batch: bool = True,
) -> list[CounterIntuitiveSuggestion]:
    """
    Find strong Library themes and generate counter-perspectives.
    
    Args:
        min_cluster_size: Minimum items in a cluster to consider (strong belief)
        threshold: Similarity threshold for clustering
        max_suggestions: Maximum number of suggestions to return
        use_cache: Whether to use cached results (avoid repeated LLM calls)
        parallel: Whether to use parallel LLM calls (P1, fallback if batch=False)
        batch: Whether to use batch LLM call (P10, default True for cost savings)
    
    Returns:
        List of CounterIntuitiveSuggestion objects
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import time
    
    client = get_supabase_client()
    if not client:
        print("⚠️  Supabase not configured", file=sys.stderr)
        return []
    
    print(f"🔄 Analyzing Library for strong themes...", file=sys.stderr)
    start_time = time.time()
    
    # Cluster Library items (P2: pass use_cache to enable caching)
    clusters = cluster_library_items(client, threshold, use_cache=use_cache)
    cluster_time = time.time() - start_time
    print(f"   Found {len(clusters)} clusters ({cluster_time:.1f}s)", file=sys.stderr)
    
    # Filter to strong themes (min cluster size)
    strong_clusters = [c for c in clusters if len(c) >= min_cluster_size]
    print(f"   {len(strong_clusters)} strong themes (≥{min_cluster_size} items)", file=sys.stderr)
    
    if not strong_clusters:
        return []
    
    # Sort by size (strongest beliefs first)
    strong_clusters.sort(key=len, reverse=True)
    
    # Get dismissed IDs
    dismissed = get_dismissed_ids()
    
    # Get saved reflections (to mark as saved)
    saved = {r.get("id") for r in load_saved_reflections()}
    
    # Prepare clusters to process
    clusters_to_process = strong_clusters[:max_suggestions]
    
    # Pre-filter dismissed clusters
    filtered_clusters: list[tuple[int, list[dict], str]] = []
    for idx, cluster in enumerate(clusters_to_process):
        cluster_title = generate_cluster_title(cluster)
        suggestion_id = f"counter-{idx}-{hash(cluster_title) % 10000}"
        if suggestion_id not in dismissed:
            filtered_clusters.append((idx, cluster, cluster_title))
    
    if not filtered_clusters:
        print("   ℹ️  All themes dismissed", file=sys.stderr)
        return []
    
    suggestions: list[CounterIntuitiveSuggestion] = []
    
    if batch and len(filtered_clusters) > 1:
        # P10: Batch LLM call (single call for all themes - cost savings)
        print(f"   📦 Using batch mode ({len(filtered_clusters)} themes in 1 call)...", file=sys.stderr)
        llm_start = time.time()
        
        # Prepare themes for batch call
        themes = [(title, cluster) for _, cluster, title in filtered_clusters]
        batch_results = generate_batch_counter_perspectives(themes, use_cache=use_cache)
        
        # Convert results to suggestions
        for i, (idx, cluster, cluster_title) in enumerate(filtered_clusters):
            result = batch_results[i] if i < len(batch_results) else None
            if result:
                suggestion_id = f"counter-{idx}-{hash(cluster_title) % 10000}"
                suggestions.append(CounterIntuitiveSuggestion(
                    id=suggestion_id,
                    cluster_title=cluster_title,
                    cluster_size=len(cluster),
                    counter_perspective=result.get("counterPerspective", ""),
                    reasoning=result.get("reasoning", ""),
                    suggested_angles=result.get("suggestedAngles", []),
                    reflection_prompt=result.get("reflectionPrompt", ""),
                    is_saved=suggestion_id in saved,
                ))
        
        llm_time = time.time() - llm_start
        print(f"   ✅ Batch generation complete ({llm_time:.1f}s)", file=sys.stderr)
        
    elif parallel and len(filtered_clusters) > 1:
        # P1: Parallel LLM calls using ThreadPoolExecutor (fallback if batch disabled)
        args_list = [(idx, cluster, dismissed, saved, use_cache) for idx, cluster, _ in filtered_clusters]
        max_workers = min(5, len(args_list))
        print(f"   ⚡ Generating {len(args_list)} counter-perspectives in parallel ({max_workers} workers)...", file=sys.stderr)
        llm_start = time.time()
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all tasks
            futures = {executor.submit(_generate_single_perspective, args): args[0] for args in args_list}
            
            # Collect results as they complete
            for future in as_completed(futures):
                try:
                    result = future.result()
                    if result:
                        suggestions.append(result)
                except Exception as e:
                    print(f"   ⚠️  Error generating perspective: {e}", file=sys.stderr)
        
        llm_time = time.time() - llm_start
        print(f"   ✅ Parallel generation complete ({llm_time:.1f}s)", file=sys.stderr)
    else:
        # Sequential fallback (for single item or if both batch and parallel disabled)
        for idx, cluster, _ in filtered_clusters:
            args = (idx, cluster, dismissed, saved, use_cache)
            result = _generate_single_perspective(args)
            if result:
                suggestions.append(result)
    
    # Sort by original index to maintain order (defensive error handling)
    def _get_suggestion_index(suggestion: CounterIntuitiveSuggestion) -> int:
        """Extract index from suggestion ID for sorting."""
        try:
            parts = suggestion.id.split('-')
            if len(parts) >= 2:
                return int(parts[1])
        except (ValueError, IndexError):
            pass
        return 999999  # Put malformed IDs at end
    
    suggestions.sort(key=_get_suggestion_index)
    
    total_time = time.time() - start_time
    print(f"   Generated {len(suggestions)} counter-perspectives ({total_time:.1f}s total)", file=sys.stderr)
    
    return suggestions


def suggestion_to_dict(suggestion: CounterIntuitiveSuggestion) -> dict:
    """Convert suggestion to JSON-serializable dict."""
    return {
        "id": suggestion.id,
        "clusterTitle": suggestion.cluster_title,
        "clusterSize": suggestion.cluster_size,
        "counterPerspective": suggestion.counter_perspective,
        "reasoning": suggestion.reasoning,
        "suggestedAngles": suggestion.suggested_angles,
        "reflectionPrompt": suggestion.reflection_prompt,
        "isSaved": suggestion.is_saved,
        "savedAt": suggestion.saved_at,
        "dismissed": suggestion.dismissed,
    }


# CLI for testing
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate counter-intuitive perspectives")
    parser.add_argument("--min-size", type=int, default=5, help="Minimum cluster size")
    parser.add_argument("--max", type=int, default=3, help="Maximum suggestions")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--no-batch", action="store_true", help="Disable batch mode (use parallel calls)")
    parser.add_argument("--no-parallel", action="store_true", help="Disable parallel mode (sequential)")
    parser.add_argument("--no-cache", action="store_true", help="Disable caching (fresh generation)")
    args = parser.parse_args()
    
    suggestions = detect_counter_intuitive(
        min_cluster_size=args.min_size,
        max_suggestions=args.max,
        use_cache=not args.no_cache,
        parallel=not args.no_parallel,
        batch=not args.no_batch,
    )
    
    if args.json:
        print(json.dumps([suggestion_to_dict(s) for s in suggestions], indent=2))
    else:
        if not suggestions:
            print("\n⚠️  No strong themes found for counter-perspectives.")
            print("   (Need clusters with ≥5 items)")
        else:
            print(f"\n🔄 Generated {len(suggestions)} counter-intuitive perspectives:\n")
            for s in suggestions:
                print(f"📌 Counter to: \"{s.cluster_title}\" ({s.cluster_size} items)")
                print(f"   {s.counter_perspective}")
                print(f"   Reasoning: {s.reasoning}")
                print(f"   Angles: {', '.join(s.suggested_angles)}")
                print(f"   💭 {s.reflection_prompt}")
                print()
