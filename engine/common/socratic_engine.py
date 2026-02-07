"""
Socratic Engine — Generate probing reflection questions from Theme Explorer data.

Aggregates data from:
- Patterns tab (Library item clusters)
- Unexplored tab (Memory gaps)
- Counter-Intuitive tab (saved/dismissed perspectives)
- Library stats (temporal distribution, type distribution)
- Expert perspectives (Lenny KG semantic matches)

Then generates 8-12 probing questions via LLM that challenge the user's
patterns, surface blind spots, and prompt genuine self-reflection.
"""

import json
import sys
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from .config import get_data_dir, load_config
from .llm import call_llm
from .vector_db import get_supabase_client
from .lenny_search import search_lenny_archive


# Cache settings
CACHE_TTL_HOURS = 24
CACHE_FILE = "socratic_cache.json"


def get_cache_path() -> Path:
    """Get path to Socratic question cache."""
    return get_data_dir() / CACHE_FILE


def get_cached_questions() -> Optional[list[dict]]:
    """Return cached questions if still fresh."""
    cache_path = get_cache_path()
    if not cache_path.exists():
        return None
    
    try:
        with open(cache_path) as f:
            cache = json.load(f)
        
        cached_at = datetime.fromisoformat(cache.get("generated_at", "2000-01-01"))
        if datetime.now() - cached_at > timedelta(hours=CACHE_TTL_HOURS):
            return None  # Expired
        
        return cache.get("questions", [])
    except (json.JSONDecodeError, ValueError):
        return None


def save_to_cache(questions: list[dict]) -> None:
    """Save generated questions to cache."""
    cache_path = get_cache_path()
    cache = {
        "generated_at": datetime.now().isoformat(),
        "questions": questions,
    }
    
    # Atomic write
    tmp_path = cache_path.with_suffix(".tmp")
    with open(tmp_path, "w") as f:
        json.dump(cache, f, indent=2)
    tmp_path.rename(cache_path)


def aggregate_patterns(client) -> list[dict]:
    """
    Get Library item clusters (same logic as Theme Explorer Patterns tab).
    
    Returns top clusters with names, sizes, and sample items.
    """
    from .items_bank_supabase import get_all_items
    from .semantic_search import batch_get_embeddings
    import numpy as np
    
    items = get_all_items(client)
    if not items or len(items) < 5:
        return []
    
    # Get items with embeddings
    items_with_embeddings = []
    for item in items:
        embedding = item.get("embedding")
        if embedding and isinstance(embedding, list):
            items_with_embeddings.append(item)
    
    if len(items_with_embeddings) < 5:
        return []
    
    # Simple clustering by similarity (reuse Theme Explorer logic)
    # Group items by cosine similarity > threshold
    threshold = 0.70
    clusters = []
    used = set()
    
    embeddings = [item["embedding"] for item in items_with_embeddings]
    
    for i, item_a in enumerate(items_with_embeddings):
        if i in used:
            continue
        
        cluster = [item_a]
        used.add(i)
        
        for j, item_b in enumerate(items_with_embeddings):
            if j in used:
                continue
            
            # Cosine similarity
            sim = _cosine_similarity(embeddings[i], embeddings[j])
            if sim >= threshold:
                cluster.append(item_b)
                used.add(j)
        
        if len(cluster) >= 2:
            # Generate cluster name from titles
            titles = [item.get("title", "") for item in cluster[:5]]
            cluster_name = _generate_cluster_name(titles)
            
            clusters.append({
                "name": cluster_name,
                "itemCount": len(cluster),
                "items": [item.get("title", "") for item in cluster[:8]],
                "percentage": round(len(cluster) / len(items_with_embeddings) * 100, 1),
            })
    
    # Sort by size (largest first)
    clusters.sort(key=lambda x: x["itemCount"], reverse=True)
    return clusters[:10]  # Top 10 clusters


def aggregate_unexplored(client) -> list[dict]:
    """
    Get unexplored topics (Memory gaps not in Library).
    """
    from .unexplored_territory import detect_memory_library_mismatch
    
    try:
        areas = detect_memory_library_mismatch(
            days_back=90,
            include_low_severity=False,
        )
        
        return [{
            "topic": area.title,
            "conversationCount": area.conversation_count,
            "severity": area.severity,
            "sampleText": area.sample_texts[0] if area.sample_texts else "",
        } for area in areas[:8]]
    except Exception as e:
        print(f"⚠️  Failed to get unexplored areas: {e}", file=sys.stderr)
        return []


def aggregate_counter_intuitive() -> dict:
    """
    Get saved and dismissed counter-intuitive perspectives.
    """
    saved_path = get_data_dir() / "saved_reflections.json"
    dismissed_path = get_data_dir() / "dismissed_topics.json"
    
    saved = []
    dismissed = []
    
    if saved_path.exists():
        try:
            with open(saved_path) as f:
                data = json.load(f)
            saved = [r.get("counterPerspective", r.get("clusterTitle", ""))
                     for r in (data if isinstance(data, list) else data.get("reflections", []))]
        except (json.JSONDecodeError, KeyError):
            pass
    
    if dismissed_path.exists():
        try:
            with open(dismissed_path) as f:
                data = json.load(f)
            dismissed = [d.get("topic", "") for d in (data if isinstance(data, list) else data.get("dismissed", []))]
        except (json.JSONDecodeError, KeyError):
            pass
    
    return {"saved": saved[:5], "dismissed": dismissed[:5]}


def aggregate_library_stats(client) -> dict:
    """
    Get Library statistics for temporal and type analysis.
    """
    from .items_bank_supabase import get_all_items
    
    items = get_all_items(client)
    if not items:
        return {"totalItems": 0, "byType": {}, "oldestItemDate": None, "newestItemDate": None}
    
    by_type = {}
    dates = []
    
    for item in items:
        item_type = item.get("item_type", "unknown")
        by_type[item_type] = by_type.get(item_type, 0) + 1
        
        date_str = item.get("last_seen") or item.get("first_seen")
        if date_str:
            dates.append(date_str)
    
    dates.sort()
    
    return {
        "totalItems": len(items),
        "byType": by_type,
        "oldestItemDate": dates[0] if dates else None,
        "newestItemDate": dates[-1] if dates else None,
    }


def aggregate_expert_matches(patterns: list[dict]) -> list[dict]:
    """
    For top patterns, find matching expert perspectives from Lenny's archive.
    """
    matches = []
    
    for pattern in patterns[:5]:  # Top 5 patterns
        try:
            results = search_lenny_archive(
                query=pattern["name"],
                top_k=1,
                min_similarity=0.4,
            )
            
            if results:
                best = results[0]
                matches.append({
                    "theme": pattern["name"],
                    "expertQuote": best.text[:200],
                    "guestName": best.guest_name,
                    "episodeTitle": best.episode_title or best.episode_filename,
                    "similarity": round(best.similarity, 2),
                })
        except Exception as e:
            # Lenny search might not be available
            print(f"  ⚠️  Expert match failed for '{pattern['name']}': {e}", file=sys.stderr)
            continue
    
    return matches


def aggregate_temporal_shifts(client) -> list[dict]:
    """
    Detect themes that have appeared, disappeared, or shifted over time.
    
    Compares recent Library items (last 30 days) vs older items to find shifts.
    """
    from .items_bank_supabase import get_all_items
    
    items = get_all_items(client)
    if not items or len(items) < 10:
        return []
    
    now = datetime.now()
    recent_cutoff = (now - timedelta(days=30)).isoformat()
    older_cutoff = (now - timedelta(days=90)).isoformat()
    
    recent_items = []
    older_items = []
    
    for item in items:
        date_str = item.get("last_seen") or item.get("first_seen")
        if not date_str:
            continue
        
        if date_str >= recent_cutoff:
            recent_items.append(item)
        elif date_str >= older_cutoff:
            older_items.append(item)
    
    # Simple keyword-based shift detection
    # Count common words in recent vs older titles
    recent_words = _count_title_words([i.get("title", "") for i in recent_items])
    older_words = _count_title_words([i.get("title", "") for i in older_items])
    
    shifts = []
    
    # Find declining themes (were popular, now gone)
    for word, old_count in older_words.items():
        if old_count >= 3 and recent_words.get(word, 0) <= 1:
            shifts.append({
                "theme": word.capitalize(),
                "trend": "declining",
                "peakPeriod": older_cutoff[:7],
                "currentPeriod": now.strftime("%Y-%m"),
                "peakCount": old_count,
                "currentCount": recent_words.get(word, 0),
            })
    
    # Find emerging themes (new, weren't there before)
    for word, new_count in recent_words.items():
        if new_count >= 3 and older_words.get(word, 0) <= 1:
            shifts.append({
                "theme": word.capitalize(),
                "trend": "emerging",
                "peakPeriod": now.strftime("%Y-%m"),
                "currentPeriod": now.strftime("%Y-%m"),
                "peakCount": new_count,
                "currentCount": new_count,
            })
    
    return shifts[:5]


def aggregate_socratic_context(use_cache: bool = True) -> dict:
    """
    Aggregate all data sources needed for Socratic question generation.
    
    Returns a structured payload ready for the LLM prompt.
    """
    client = get_supabase_client()
    if not client:
        print("⚠️  Supabase not available. Socratic mode requires Full Setup.", file=sys.stderr)
        return {}
    
    print("📊 Aggregating Socratic context...", flush=True)
    
    # Aggregate all sources
    print("  → Patterns (Library clusters)...", flush=True)
    patterns = aggregate_patterns(client)
    print(f"    ✓ {len(patterns)} pattern clusters", flush=True)
    
    print("  → Unexplored areas (Memory gaps)...", flush=True)
    unexplored = aggregate_unexplored(client)
    print(f"    ✓ {len(unexplored)} unexplored topics", flush=True)
    
    print("  → Counter-intuitive perspectives...", flush=True)
    counter_intuitive = aggregate_counter_intuitive()
    print(f"    ✓ {len(counter_intuitive.get('saved', []))} saved, {len(counter_intuitive.get('dismissed', []))} dismissed", flush=True)
    
    print("  → Library stats...", flush=True)
    library_stats = aggregate_library_stats(client)
    print(f"    ✓ {library_stats['totalItems']} items", flush=True)
    
    print("  → Expert matches (Lenny's archive)...", flush=True)
    expert_matches = aggregate_expert_matches(patterns)
    print(f"    ✓ {len(expert_matches)} expert matches", flush=True)
    
    print("  → Temporal shifts...", flush=True)
    temporal_shifts = aggregate_temporal_shifts(client)
    print(f"    ✓ {len(temporal_shifts)} shifts detected", flush=True)
    
    context = {
        "patterns": patterns,
        "unexplored": unexplored,
        "counterIntuitive": counter_intuitive,
        "libraryStats": library_stats,
        "expertMatches": expert_matches,
        "temporalShifts": temporal_shifts,
    }
    
    return context


def generate_socratic_questions(
    force_regenerate: bool = False,
    output_json: bool = False,
) -> list[dict]:
    """
    Generate Socratic reflection questions.
    
    Uses cached questions if available and not expired.
    Otherwise aggregates context and calls LLM.
    """
    # Check cache first
    if not force_regenerate:
        cached = get_cached_questions()
        if cached:
            print("📋 Using cached Socratic questions (regenerate with --force)", flush=True)
            if output_json:
                print(json.dumps(cached, indent=2))
            return cached
    
    # Aggregate context from all sources
    context = aggregate_socratic_context()
    
    if not context:
        print("❌ No data available for Socratic questions. Run sync first.", file=sys.stderr)
        return []
    
    # Check minimum data requirements
    if not context.get("patterns") and not context.get("unexplored"):
        print("❌ Not enough data. Need at least Library items or Unexplored topics.", file=sys.stderr)
        return []
    
    # Load prompt template
    prompt_path = Path(__file__).parent.parent / "prompts" / "socratic_questions.md"
    if not prompt_path.exists():
        print(f"❌ Prompt template not found: {prompt_path}", file=sys.stderr)
        return []
    
    system_prompt = prompt_path.read_text(encoding="utf-8")
    
    # Build user message with context data
    user_message = f"""Here is the user's data. Generate 8-12 probing Socratic questions based on this.

{json.dumps(context, indent=2, default=str)}

Return ONLY the JSON array of questions. No markdown, no explanation."""
    
    print("\n🪞 Generating Socratic questions...", flush=True)
    
    # Call LLM
    config = load_config()
    provider = config.get("llm", {}).get("provider", "anthropic")
    model = config.get("llm", {}).get("model", "claude-sonnet-4-20250514")
    
    try:
        response = call_llm(
            system_prompt=system_prompt,
            user_message=user_message,
            provider=provider,
            model=model,
            temperature=0.8,  # Higher for more creative questioning
            max_tokens=4000,
        )
        
        if not response:
            print("❌ LLM returned empty response", file=sys.stderr)
            return []
        
        # Parse JSON from response
        questions = _parse_questions_json(response)
        
        if not questions:
            print("❌ Failed to parse questions from LLM response", file=sys.stderr)
            print(f"   Raw response: {response[:500]}", file=sys.stderr)
            return []
        
        # Add unique IDs
        for i, q in enumerate(questions):
            q["id"] = f"sq-{hashlib.sha256(q['question'].encode()).hexdigest()[:8]}"
        
        print(f"✅ Generated {len(questions)} Socratic questions", flush=True)
        
        # Cache results
        save_to_cache(questions)
        
        if output_json:
            print(json.dumps(questions, indent=2))
        
        return questions
        
    except Exception as e:
        print(f"❌ LLM call failed: {e}", file=sys.stderr)
        return []


def dismiss_question(question_id: str) -> bool:
    """Mark a question as dismissed (excluded from future generations)."""
    dismissed_path = get_data_dir() / "dismissed_socratic.json"
    
    dismissed = []
    if dismissed_path.exists():
        try:
            with open(dismissed_path) as f:
                dismissed = json.load(f)
        except json.JSONDecodeError:
            dismissed = []
    
    if question_id not in dismissed:
        dismissed.append(question_id)
        with open(dismissed_path, "w") as f:
            json.dump(dismissed, f, indent=2)
    
    return True


def mark_resonated(question_id: str) -> bool:
    """Mark a question as resonated (tracks engagement for quality feedback)."""
    resonated_path = get_data_dir() / "resonated_socratic.json"
    
    resonated = []
    if resonated_path.exists():
        try:
            with open(resonated_path) as f:
                resonated = json.load(f)
        except json.JSONDecodeError:
            resonated = []
    
    if question_id not in resonated:
        resonated.append(question_id)
        with open(resonated_path, "w") as f:
            json.dump(resonated, f, indent=2)
    
    return True


# --- Helper functions ---

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    import math
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _generate_cluster_name(titles: list[str]) -> str:
    """Generate a readable cluster name from item titles."""
    # Simple word frequency approach
    stop_words = {"the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
                  "have", "has", "had", "do", "does", "did", "will", "would", "could",
                  "should", "may", "might", "can", "shall", "must", "and", "or", "but",
                  "in", "on", "at", "to", "for", "of", "with", "by", "from", "as",
                  "into", "through", "during", "before", "after", "above", "below",
                  "between", "out", "off", "over", "under", "about", "up", "down",
                  "this", "that", "these", "those", "it", "its", "how", "what", "when",
                  "where", "why", "which", "who", "whom", "not", "no", "nor", "so",
                  "too", "very", "just", "than", "then", "also", "here", "there", "if",
                  "use", "using", "used"}
    
    word_counts: dict[str, int] = {}
    for title in titles:
        words = title.lower().split()
        for word in words:
            word = word.strip(".,!?;:()[]{}\"'`-_/\\")
            if len(word) > 3 and word not in stop_words:
                word_counts[word] = word_counts.get(word, 0) + 1
    
    top_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    if top_words:
        return " & ".join(w[0].capitalize() for w in top_words)
    
    return titles[0][:50] if titles else "Unknown"


def _count_title_words(titles: list[str]) -> dict[str, int]:
    """Count significant words across titles."""
    stop_words = {"the", "a", "an", "is", "are", "and", "or", "but", "in", "on", "at",
                  "to", "for", "of", "with", "by", "from", "as", "how", "what", "when",
                  "where", "why", "which", "who", "not", "this", "that", "it", "its",
                  "use", "using", "used"}
    
    counts: dict[str, int] = {}
    for title in titles:
        words = set(title.lower().split())
        for word in words:
            word = word.strip(".,!?;:()[]{}\"'`-_/\\")
            if len(word) > 3 and word not in stop_words:
                counts[word] = counts.get(word, 0) + 1
    
    return counts


def _parse_questions_json(response: str) -> list[dict]:
    """Parse JSON array of questions from LLM response."""
    # Try direct parse
    try:
        data = json.loads(response)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        pass
    
    # Try extracting JSON from markdown code block
    import re
    json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', response, re.DOTALL)
    if json_match:
        try:
            data = json.loads(json_match.group(1))
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass
    
    # Try finding array in response
    bracket_start = response.find("[")
    bracket_end = response.rfind("]")
    if bracket_start >= 0 and bracket_end > bracket_start:
        try:
            data = json.loads(response[bracket_start:bracket_end + 1])
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass
    
    return []


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate Socratic reflection questions")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--force", action="store_true", help="Force regeneration (ignore cache)")
    parser.add_argument("--context-only", action="store_true", help="Only output aggregated context (no LLM call)")
    args = parser.parse_args()
    
    if args.context_only:
        context = aggregate_socratic_context()
        print(json.dumps(context, indent=2, default=str))
    else:
        questions = generate_socratic_questions(
            force_regenerate=args.force,
            output_json=args.json,
        )
        
        if not args.json and questions:
            print("\n" + "=" * 60)
            print("🪞 SOCRATIC REFLECTION QUESTIONS")
            print("=" * 60)
            for i, q in enumerate(questions, 1):
                difficulty_icon = {"comfortable": "💭", "uncomfortable": "⚡", "confrontational": "🔥"}.get(q.get("difficulty", ""), "❓")
                print(f"\n{i}. {difficulty_icon} [{q.get('category', '?')}] {q['question']}")
                print(f"   Evidence: {q.get('evidence', 'N/A')}")
            print("\n" + "=" * 60)
