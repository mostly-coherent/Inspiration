#!/usr/bin/env python3
"""
Inspiration Engine — Unified Content Generation

Generate insights (shareable learnings) or ideas (prototype briefs) from Cursor chat history.
Supports both modes via --mode parameter.
"""

import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Literal

# Import common modules
from common import (
    load_config,
    load_env_file,
    get_workspaces,
    is_feature_enabled,
    get_feature_config,
    get_llm_config,
    get_data_dir,
    get_conversations_for_date,
    get_conversations_for_range,
    format_conversations_for_prompt,
    create_llm,
    LLMProvider,
    DEFAULT_ANTHROPIC_MODEL,
)
from common.progress_markers import (
    emit_phase,
    emit_stat,
    emit_info,
    emit_error,
    emit_warning,
    emit_progress,
    emit_tokens,
    emit_embedding_tokens,
    emit_request_confirmed,
    emit_search_started,
    emit_search_complete,
    emit_generation_started,
    emit_generation_progress,
    emit_generation_complete,
    emit_dedup_started,
    emit_dedup_progress,
    emit_dedup_complete,
    emit_ranking_started,
    emit_ranking_progress,
    emit_ranking_complete,
    emit_integration_started,
    emit_integration_progress,
    emit_integration_complete,
    emit_complete,
    start_run,
    end_run,
)
from common.config import (
    get_judge_temperature,
    get_compression_token_threshold,
    get_compression_date_threshold,
)

# Import v1 unified Items system (required - v0 removed)
from common.items_bank_supabase import ItemsBankSupabase as ItemsBank

# Load environment on import
load_env_file()

# =============================================================================
# Configuration
# =============================================================================

PROMPTS_DIR = Path(__file__).parent / "prompts"

# Mode-specific output directories
OUTPUT_DIRS = {
    "insights": get_data_dir() / "insights_output",
    "ideas": get_data_dir() / "ideas_output",
    "use_cases": get_data_dir() / "use_cases_output",
}

# Default generation settings - now loaded from config
from common.config import (
    get_generation_temperature,
    get_deduplication_threshold,
    get_quality_tier_thresholds,
    get_semantic_search_top_k,
    get_semantic_search_min_similarity,
)

# Legacy defaults (used if config not available)
DEFAULT_TEMPERATURE = 0.2
DEFAULT_TOP_P = 1.0
DEFAULT_BEST_OF = 1

def get_default_temperature() -> float:
    """Get temperature from config or fallback to default."""
    try:
        return get_generation_temperature()
    except Exception:
        return DEFAULT_TEMPERATURE

def get_default_dedup_threshold() -> float:
    """Get deduplication threshold from config or fallback to default."""
    try:
        return get_deduplication_threshold()
    except Exception:
        return 0.85

# Mode configuration
MODE_CONFIG = {
    "insights": {
        "bank_type": "insight",
        "output_dir": OUTPUT_DIRS["insights"],
        "has_output_check": lambda text: "## Post 1:" in (text or ""),
        "output_suffix": ".md",
        "no_output_suffix": "-no-post.md",
        "header_title": "Daily Insights",
        "aggregated_title": "Insights",
    },
    "ideas": {
        "bank_type": "idea",
        "output_dir": OUTPUT_DIRS["ideas"],
        "has_output_check": lambda text: "## Idea 1:" in (text or ""),
        "output_suffix": ".md",
        "no_output_suffix": "-no-ideas.md",
        "header_title": "Daily Ideas",
        "aggregated_title": "Ideas",
    },
}

# =============================================================================
# Quality Scoring (LLM-based)
# =============================================================================

QUALITY_SCORING_PROMPT = """Rate this {item_type} on three dimensions from 1-5:

1. **Novelty** (1-5): Is this a fresh perspective? Does it offer something new?
   - 1: Very common/obvious idea
   - 3: Somewhat original, seen variations before
   - 5: Highly novel, unique perspective

2. **Intellectual Interest** (1-5): Would someone want to explore this further?
   - 1: Mundane, no curiosity spark
   - 3: Interesting to some audiences
   - 5: Fascinating, broadly compelling

3. **Actionability** (1-5): Can this be built/shared/applied?
   - 1: Abstract, no clear next steps
   - 3: Some actionable elements
   - 5: Clear, specific, ready to act on

**Title:** {title}
**Content:** {content}

Respond with ONLY a JSON object:
{{"novelty": N, "interest": N, "actionability": N}}

No explanation, just the JSON."""


def score_item_quality(
    title: str,
    description: str,
    item_type: str,
    llm: LLMProvider,
) -> str | None:
    """
    Use LLM to score item quality and return A/B/C tier.
    
    Scoring:
    - A-tier: Total 13-15 points (exceptional)
    - B-tier: Total 9-12 points (good)
    - C-tier: Total 5-8 points (basic)
    
    Returns: "A", "B", "C", or None if scoring fails
    """
    try:
        prompt = QUALITY_SCORING_PROMPT.format(
            item_type=item_type,
            title=title,
            content=description[:500],  # Truncate for efficiency
        )
        
        response = llm.generate(
            prompt,
            temperature=0.1,  # Low temperature for consistent scoring
        )
        
        # Parse JSON response
        import re
        json_match = re.search(r'\{[^}]+\}', response)
        if not json_match:
            return None
        
        scores = json.loads(json_match.group())
        total = scores.get("novelty", 0) + scores.get("interest", 0) + scores.get("actionability", 0)
        
        # Get thresholds from config
        try:
            tier_a, tier_b, tier_c = get_quality_tier_thresholds()
        except Exception:
            tier_a, tier_b, tier_c = 13, 9, 5  # fallback defaults
        
        if total >= tier_a:
            return "A"
        elif total >= tier_b:
            return "B"
        elif total >= tier_c:
            return "C"
        else:
            return None
            
    except Exception as e:
        print(f"   ⚠️  Quality scoring failed: {e}", file=sys.stderr)
        return None


def batch_score_quality(
    items: list[dict],
    item_type: str,
    llm: LLMProvider,
) -> list[str | None]:
    """
    Batch score multiple items in parallel for efficiency.
    Returns list of quality tiers ("A", "B", "C", or None).
    """
    results = []
    
    # Use ThreadPoolExecutor for parallel scoring
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = []
        for item in items:
            future = executor.submit(
                score_item_quality,
                item.get("title", ""),
                item.get("description", ""),
                item_type,
                llm,
            )
            futures.append(future)
        
        for future in as_completed(futures):
            try:
                results.append(future.result())
            except Exception:
                results.append(None)
    
    return results


# =============================================================================
# Prompt Loading (with caching)
# =============================================================================

# In-memory cache for prompt templates
_prompt_cache: dict[str, str] = {}
_prompt_file_mtimes: dict[str, float] = {}


def load_synthesize_prompt(mode: Literal["insights", "ideas", "use_case"]) -> str:
    """Load the synthesis prompt for the given mode (cached, combines base + mode-specific)."""
    # Load base prompt (common elements)
    base_prompt_name = "base_synthesize"
    base_prompt_file = PROMPTS_DIR / f"{base_prompt_name}.md"
    
    base_content = ""
    if base_prompt_file.exists():
        current_mtime = base_prompt_file.stat().st_mtime
        cached_mtime = _prompt_file_mtimes.get(base_prompt_name, 0)
        
        if base_prompt_name in _prompt_cache and current_mtime == cached_mtime:
            base_content = _prompt_cache[base_prompt_name]
        else:
            base_content = base_prompt_file.read_text()
            _prompt_cache[base_prompt_name] = base_content
            _prompt_file_mtimes[base_prompt_name] = current_mtime
    
    # Load mode-specific prompt
    prompt_name = f"{mode}_synthesize"
    prompt_file = PROMPTS_DIR / f"{prompt_name}.md"
    
    mode_content = ""
    if prompt_file.exists():
        current_mtime = prompt_file.stat().st_mtime
        cached_mtime = _prompt_file_mtimes.get(prompt_name, 0)
        
        # Return cached version if file hasn't changed
        if prompt_name in _prompt_cache and current_mtime == cached_mtime:
            mode_content = _prompt_cache[prompt_name]
        else:
            # Load and cache
            mode_content = prompt_file.read_text()
            _prompt_cache[prompt_name] = mode_content
            _prompt_file_mtimes[prompt_name] = current_mtime
    
    # Combine base + mode-specific (mode-specific comes after base)
    combined = base_content
    if mode_content:
        if combined:
            combined += "\n\n---\n\n"
        combined += mode_content
    
    # Fallback defaults if files don't exist
    if not combined:
        if mode == "insights":
            return "Generate 3 shareable insight drafts from the following Cursor chat history."
        elif mode == "ideas":
            return "Generate 3 idea briefs from the following Cursor chat history."
        else:  # use_case
            return "Find and synthesize real-world use cases from the following Cursor chat history."
    
    return combined


def load_golden_posts() -> str:
    """Load user's actual posts as golden examples (insights mode only)."""
    # First try custom voice config
    voice_config = get_feature_config("customVoice")
    posts_dir = voice_config.get("goldenExamplesDir")
    
    # Fall back to social sync config
    if not posts_dir:
        linkedin_config = get_feature_config("linkedInSync")
        posts_dir = linkedin_config.get("postsDirectory")
    
    if not posts_dir:
        return ""
    
    posts_path = Path(posts_dir)
    if not posts_path.exists():
        return ""
    
    golden_posts = []
    for post_file in sorted(posts_path.glob("*.md")):
        try:
            content = post_file.read_text()
            # Extract post content (skip metadata sections)
            if "---" in content:
                post_content = content.split("---")[0].strip()
            else:
                post_content = content.strip()
            
            lines = post_content.split("\n")
            clean_lines = [l for l in lines if not l.startswith("#")]
            clean_post = "\n".join(clean_lines).strip()
            
            if clean_post and len(clean_post) > 50:
                golden_posts.append(f"### {post_file.stem}\n\n{clean_post}")
        except Exception:
            pass
    
    if golden_posts:
        return "\n\n---\n\n".join(golden_posts[-5:])  # Last 5 posts
    return ""


def load_voice_guide() -> str:
    """Load user's voice guide if configured (insights mode only)."""
    voice_config = get_feature_config("customVoice")
    guide_path = voice_config.get("voiceGuideFile")
    
    if not guide_path:
        return ""
    
    try:
        return Path(guide_path).read_text()
    except Exception:
        return ""


def get_author_context() -> tuple[str, str]:
    """Get author name and context from config (insights mode only)."""
    voice_config = get_feature_config("customVoice")
    name = voice_config.get("authorName", "")
    context = voice_config.get("authorContext", "")
    return name, context


# =============================================================================
# Content Generation (v2 - Item-Centric Architecture)
# =============================================================================

def generate_items(
    conversations_text: str,
    mode: Literal["insights", "ideas", "use_case"],
    *,
    llm: LLMProvider,
    item_count: int = 10,
    temperature: float = DEFAULT_TEMPERATURE,
    deduplicate: bool = True,
    deduplication_threshold: float = 0.85,
    rank: bool = True,
) -> tuple[list[dict], dict]:
    """
    Generate items (ideas, insights, or use cases) from conversation text.
    
    v2 Item-Centric Architecture:
    - Generates item_count items in a SINGLE LLM call
    - Deduplicates among generated items (before returning)
    - Ranks individual items (not sets)
    - Returns structured items ready for bank harmonization
    
    Args:
        conversations_text: Formatted conversation history
        mode: Generation mode ("insights", "ideas", or "use_case")
        llm: LLM provider instance
        item_count: Number of items to generate (default: 10)
        temperature: Sampling temperature (higher = more creative)
        deduplicate: Whether to deduplicate generated items
        deduplication_threshold: Similarity threshold for deduplication (0.0-1.0)
        rank: Whether to rank items by quality
    
    Returns:
        Tuple of (items_list, stats_dict)
        where items_list is [{"id": "Item 1", "title": "...", "content": {...}, "score": 18}, ...]
        and stats_dict contains generation metadata
    """
    from common.semantic_search import get_embedding, cosine_similarity, batch_get_embeddings
    
    # Overshoot by 50% to account for deduplication
    overshoot_count = int(item_count * 1.5) if deduplicate else item_count
    
    # Load and prepare prompt with item_count
    base_prompt = load_synthesize_prompt(mode)
    system_prompt = base_prompt.replace("{item_count}", str(overshoot_count))
    
    # Add mode-specific enhancements (only for insights)
    if mode == "insights":
        author_name, author_context = get_author_context()
        if author_name or author_context:
            context_section = "\n\n## Author Context\n\n"
            if author_name:
                context_section += f"**Author:** {author_name}\n"
            if author_context:
                context_section += f"**About:** {author_context}\n"
            system_prompt += context_section
        
        voice_guide = load_voice_guide()
        if voice_guide:
            system_prompt += f"\n\n## Voice & Style Guide\n\n{voice_guide}"
        
        golden = load_golden_posts()
        if golden:
            system_prompt += f"\n\n## Reference Posts (Study Voice & Style)\n\nThese are actual posts from the author. Study the voice, depth, introspection, and value-add patterns:\n\n{golden}"
    
    user_content = f"Here are the Cursor chat conversations:\n\n{conversations_text}"
    
    # Calculate max tokens based on item count (more items = more tokens needed)
    # Rough estimate: ~300 tokens per item
    max_tokens = min(4000, 500 + overshoot_count * 300)
    
    print(f"🧠 Generating {overshoot_count} {mode} items (temp={temperature})...", file=sys.stderr)
    emit_generation_started(overshoot_count)
    
    # Single LLM call to generate all items
    try:
        # Estimate input tokens for cost tracking
        from common.llm import estimate_tokens
        input_tokens = estimate_tokens(system_prompt + user_content)
        
        raw_output = llm.generate(
            user_content,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        
        # Track token usage and cost
        output_tokens = estimate_tokens(raw_output)
        emit_tokens(
            tokens_in=input_tokens,
            tokens_out=output_tokens,
            model=llm.model,
            operation="generation"
        )
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        raise RuntimeError(
            f"Failed to generate items: {e}\n\n"
            f"Traceback:\n{error_details}\n\n"
            "Common causes:\n"
            "  - Rate limits (prompt too large)\n"
            "  - API key issues\n"
            "  - Network issues\n"
            "Try reducing the date range or item count."
        ) from e
    
    # Parse items from raw output
    items = _parse_items_from_output(raw_output, mode)
    
    if not items:
        return [], {
            "raw_output": raw_output,
            "items_generated": 0,
            "items_after_dedup": 0,
            "items_returned": 0,
        }
    
    print(f"✅ Parsed {len(items)} items from LLM output", file=sys.stderr)
    emit_generation_complete(len(items))
    
    # Generate embeddings for deduplication/ranking (batch call - much faster)
    # Note: If OpenAI is not configured, this returns zero vectors and dedup is effectively skipped
    if deduplicate or rank:
        from common.semantic_search import is_openai_configured
        if not is_openai_configured():
            print("⚠️  OpenAI not configured - skipping deduplication (add OPENAI_API_KEY to enable)", file=sys.stderr)
            emit_dedup_complete(len(items), 0)  # No dedup, all items pass through
            deduplicate = False  # Skip dedup since all embeddings would be zeros
            rank = False
        else:
            texts = [_item_to_text_for_embedding(item, mode) for item in items]
            embeddings = batch_get_embeddings(texts)
            for i, item in enumerate(items):
                item["_embedding"] = embeddings[i]
    
    items_before_dedup = len(items)
    
    # Deduplicate among generated items
    if deduplicate and len(items) > 1:
        items = _deduplicate_items(items, threshold=deduplication_threshold)
        print(f"🔍 Deduplicated: {items_before_dedup} → {len(items)} items (threshold={deduplication_threshold})", file=sys.stderr)
        emit_dedup_started()
        emit_dedup_complete(len(items), items_before_dedup - len(items))
    
    # Rank items
    if rank and len(items) > 1:
        items = _rank_items(items, mode, llm)
        print(f"⚖️  Ranked {len(items)} items by quality", file=sys.stderr)
        emit_ranking_started()
        emit_ranking_complete(len(items))
    
    # Return top item_count items
    final_items = items[:item_count]
    
    # Clean up internal fields before returning
    for item in final_items:
        item.pop("_embedding", None)
    
    stats = {
        "raw_output": raw_output,
        "items_generated": items_before_dedup,
        "items_after_dedup": len(items),
        "items_returned": len(final_items),
    }
    
    print(f"📦 Returning {len(final_items)} items", file=sys.stderr)
    
    return final_items, stats


def _item_to_text_for_embedding(item: dict, mode: str) -> str:
    """Convert item to text for embedding generation."""
    parts = []
    
    if mode == "ideas":
        parts.append(item.get("title", ""))
        parts.append(item.get("problem", ""))
        parts.append(item.get("solution", ""))
    elif mode == "insights":
        parts.append(item.get("title", ""))
        parts.append(item.get("content", "")[:500])  # First 500 chars
    elif mode == "use_case":
        parts.append(item.get("title", ""))
        parts.append(item.get("what", ""))
        parts.append(item.get("how", ""))
    
    return " ".join(p for p in parts if p)


def _parse_items_from_output(raw_output: str, mode: str) -> list[dict]:
    """
    Parse LLM output into structured items with unified content format.
    
    All item types now use the same structure:
    - title: Compelling hook/attention grabber
    - description: Main content (combines problem+solution, post content, or JTBD)
    - tags: Auto-generated keywords
    """
    items = []
    
    if not raw_output or not raw_output.strip():
        return items
    
    # Clean markdown code fences
    content = raw_output.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        if lines[0].strip() in ["```", "```markdown", "```md"]:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        content = "\n".join(lines)
    
    # Universal pattern: ## Item N: Title (works for all modes)
    # Also matches legacy patterns for backward compatibility
    patterns = [
        r'^## Item \d+:\s*(.+?)(?=^## Item \d+:|\Z|^## Source|^## Skipped|^## No Items|^---\s*$)',
        r'^## Post \d+:\s*(.+?)(?=^## Post \d+:|\Z|^## Source|^## Skipped|^## No Posts|^---\s*$)',
        r'^## Idea \d+:\s*(.+?)(?=^## Idea \d+:|\Z|^## Source|^## Skipped|^## No Ideas|^---\s*$)',
        r'^## Use Case \d+:\s*(.+?)(?=^## Use Case \d+:|\Z|^## Consider|^# Use Cases|^---\s*$)',
    ]
    
    for pattern in patterns:
        for i, match in enumerate(re.finditer(pattern, content, re.MULTILINE | re.DOTALL)):
            full_match = match.group(0)
            title_line = match.group(1).strip().split('\n')[0]
            
            # Build description from the content after title
            lines = full_match.split('\n')
            description_parts = []
            tags = []
            
            # Skip title line, collect content
            for line in lines[1:]:
                line_stripped = line.strip()
                
                # Stop at section breaks
                if line_stripped.startswith('---'):
                    break
                
                # Extract tags
                if line_stripped.lower().startswith('**tags:**'):
                    tag_text = line_stripped.replace('**Tags:**', '').replace('**tags:**', '').strip()
                    tags = [t.strip().strip(',').strip('[').strip(']') for t in tag_text.split(',') if t.strip()]
                    continue
                
                # Skip empty lines at start
                if not description_parts and not line_stripped:
                    continue
                
                description_parts.append(line)
            
            description = '\n'.join(description_parts).strip()
            
            # Clean up description - remove trailing separators
            description = re.sub(r'\n---\s*$', '', description).strip()
            
            if title_line:
                item = {
                    "id": f"Item {i+1}",
                    "title": title_line,
                    "description": description,
                    "tags": tags[:10],  # Cap at 10 tags
                }
                items.append(item)
        
        # If we found items with this pattern, stop trying others
        if items:
            break
    
    return items


def _deduplicate_items(items: list[dict], threshold: float = 0.85) -> list[dict]:
    """Deduplicate items by cosine similarity of embeddings."""
    from common.semantic_search import cosine_similarity
    
    if len(items) <= 1:
        return items
    
    unique_items = []
    
    for item in items:
        is_duplicate = False
        item_embedding = item.get("_embedding", [])
        
        if not item_embedding:
            unique_items.append(item)
            continue
        
        for existing in unique_items:
            existing_embedding = existing.get("_embedding", [])
            if not existing_embedding:
                continue
            
            similarity = cosine_similarity(item_embedding, existing_embedding)
            if similarity >= threshold:
                # Found duplicate - keep the one with more content
                is_duplicate = True
                # Optionally: merge or update the existing item
                break
        
        if not is_duplicate:
            unique_items.append(item)
    
    return unique_items


def _safe_parse_judge_json(response: str) -> dict | None:
    """Safely parse JSON from LLM judge response."""
    import json
    import re
    
    if not response:
        return None
    
    # Try to extract JSON from the response
    # LLMs sometimes wrap JSON in markdown code blocks
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response)
    if json_match:
        response = json_match.group(1)
    
    # Try to find JSON object in the response
    json_start = response.find('{')
    json_end = response.rfind('}') + 1
    
    if json_start >= 0 and json_end > json_start:
        try:
            return json.loads(response[json_start:json_end])
        except json.JSONDecodeError:
            pass
    
    return None


def _rank_items(items: list[dict], mode: str, llm: LLMProvider) -> list[dict]:
    """Rank items by quality using LLM judge."""
    if len(items) <= 1:
        return items
    
    # Load ranking prompt
    ranker_prompt_path = PROMPTS_DIR / "item_ranker.md"
    if ranker_prompt_path.exists():
        ranker_prompt = ranker_prompt_path.read_text()
    else:
        ranker_prompt = "Rank these items by quality. Return JSON with 'rankings' array sorted best to worst."
    
    # Prepare items for ranking (truncate for efficiency)
    MAX_ITEM_CHARS = 500
    items_text = []
    for item in items:
        item_summary = f"**{item['id']}: {item.get('title', 'Untitled')}**\n"
        if mode == "ideas":
            item_summary += f"Problem: {item.get('problem', '')[:200]}\n"
            item_summary += f"Solution: {item.get('solution', '')[:200]}\n"
        elif mode == "insights":
            item_summary += f"Content: {item.get('content', '')[:300]}\n"
        elif mode == "use_case":
            item_summary += f"What: {item.get('what', '')[:200]}\n"
            item_summary += f"How: {item.get('how', '')[:200]}\n"
        
        items_text.append(item_summary[:MAX_ITEM_CHARS])
    
    user_content = f"Rank these {len(items)} items:\n\n" + "\n---\n".join(items_text)
    
    # Use cheaper judge model
    judge_llm = llm.get_judge_llm()
    if judge_llm != llm:
        print(f"💰 Using {judge_llm.provider}/{judge_llm.model} for ranking", file=sys.stderr)
    
    try:
        response = judge_llm.generate(
            user_content,
            system_prompt=ranker_prompt,
            max_tokens=500,
            temperature=0.0,
        )
        
        # Parse ranking response
        rankings = _safe_parse_judge_json(response)
        
        if rankings and "rankings" in rankings:
            # Create ID to score mapping
            id_to_score = {}
            for rank_info in rankings["rankings"]:
                item_id = rank_info.get("id", "")
                score = rank_info.get("total", 0)
                id_to_score[item_id] = score
            
            # Sort items by score (highest first)
            items.sort(key=lambda x: id_to_score.get(x["id"], 0), reverse=True)
            
            # Add scores to items
            for item in items:
                item["_score"] = id_to_score.get(item["id"], 0)
        
    except Exception as e:
        print(f"⚠️  Ranking failed, returning items in original order: {e}", file=sys.stderr)
    
    return items


def items_to_markdown(items: list[dict], mode: str) -> str:
    """Convert structured items to markdown output."""
    if not items:
        if mode == "ideas":
            return "## No Ideas Found\n\nNo ideas could be generated from the conversations."
        elif mode == "insights":
            return "## No Posts Found\n\nNo insights could be generated from the conversations."
        else:
            return "## No Use Cases Found\n\nNo use cases could be found from the conversations."
    
    lines = []
    
    for i, item in enumerate(items, 1):
        # Use Item N: format for consistent parsing (matches parser pattern)
        lines.append(f"## Item {i}: {item.get('title', 'Untitled')}")
        lines.append("")
        
        # v2: Unified description field takes precedence
        if item.get("description"):
            lines.append(item["description"])
            lines.append("")
        
        # Fallback: Legacy fields for backward compatibility
        elif mode == "ideas":
            if item.get("problem"):
                lines.append(f"**Problem:** {item['problem']}")
                lines.append("")
            if item.get("solution"):
                lines.append(f"**Solution:** {item['solution']}")
                lines.append("")
            if item.get("why_it_matters"):
                lines.append(f"**Why It Matters:** {item['why_it_matters']}")
                lines.append("")
            if item.get("build_complexity"):
                lines.append(f"**Build Complexity:** {item['build_complexity']}")
            if item.get("audience"):
                lines.append(f"**Audience:** {item['audience']}")
            lines.append("")
        
        elif mode == "insights":
            if item.get("content"):
                lines.append(item["content"])
                lines.append("")
        
        elif mode == "use_case":
            if item.get("what"):
                lines.append(f"**What:** {item['what']}")
                lines.append("")
            if item.get("how"):
                lines.append(f"**How:** {item['how']}")
                lines.append("")
            if item.get("context"):
                lines.append(f"**Context:** {item['context']}")
                lines.append("")
            if item.get("similarity"):
                lines.append(f"**Similarity:** {item['similarity']}")
                lines.append("")
        
        # Tags (for all modes)
        if item.get("tags"):
            lines.append(f"**Tags:** {', '.join(item['tags'])}")
            lines.append("")
        
        lines.append("---")
        lines.append("")
    
    return "\n".join(lines)


# =============================================================================
# Content Generation (v2 - Single Item Generation)
# =============================================================================

def generate_content(
    conversations_text: str,
    mode: Literal["insights", "ideas", "use_case"],
    *,
    llm: LLMProvider,
    max_tokens: int = 2000,
    temperature: float = DEFAULT_TEMPERATURE,
) -> tuple[str, list[tuple[str, str]]]:
    """
    Generate content (insights or ideas) from conversation text.
    
    Args:
        conversations_text: Formatted conversation history
        mode: Generation mode ("insights", "ideas", or "use_case")
        llm: LLM provider instance
        max_tokens: Max tokens for generation
        temperature: Sampling temperature
    
    Returns:
        Tuple of (generated_markdown, [(id, text)] for compatibility)
    """
    base_prompt = load_synthesize_prompt(mode)
    
    # Build comprehensive system prompt
    system_prompt = base_prompt
    
    # Add mode-specific enhancements (only for insights)
    if mode == "insights":
        # Add author context
        author_name, author_context = get_author_context()
        if author_name or author_context:
            context_section = "\n\n## Author Context\n\n"
            if author_name:
                context_section += f"**Author:** {author_name}\n"
            if author_context:
                context_section += f"**About:** {author_context}\n"
            system_prompt += context_section
        
        # Add voice guide if available
        voice_guide = load_voice_guide()
        if voice_guide:
            system_prompt += f"\n\n## Voice & Style Guide\n\n{voice_guide}"
        
        # Add golden examples
        golden = load_golden_posts()
        if golden:
            system_prompt += f"\n\n## Reference Posts (Study Voice & Style)\n\nThese are actual posts from the author. Study the voice, depth, introspection, and value-add patterns:\n\n{golden}"
    
    user_content = f"Here are today's Cursor chat conversations:\n\n{conversations_text}"
    
    result = llm.generate(
        user_content,
        system_prompt=system_prompt,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    
    # v2: Return content directly (no candidates)
    return result


# =============================================================================
# Output Management
# =============================================================================

def save_output(
    content: str,
    target_date: datetime.date,
    mode: Literal["insights", "ideas", "use_case"],
) -> Path:
    """Save generated content to file."""
    # Clean markdown code fences
    content = content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        if lines[0].strip() in ["```", "```markdown", "```md"]:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        content = "\n".join(lines)
    
    # Handle use_case mode (not in MODE_CONFIG)
    if mode == "use_case":
        output_dir = OUTPUT_DIRS["use_cases"]
        output_dir.mkdir(parents=True, exist_ok=True)
        date_str = target_date.strftime("%Y%m%d_%H%M%S")
        output_file = output_dir / f"use_case_{date_str}.md"
        
        header = f"""# Use Cases — {target_date.strftime("%Y-%m-%d")}

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

---

"""
    else:
        config = MODE_CONFIG[mode]
        output_dir = config["output_dir"]
        output_dir.mkdir(parents=True, exist_ok=True)
        
        date_str = target_date.strftime("%Y-%m-%d")
        
        has_output = config["has_output_check"](content)
        suffix = config["output_suffix"] if has_output else config["no_output_suffix"]
        output_file = output_dir / f"{date_str}{suffix}"
        
        # Remove alternate file if exists
        alt_suffix = config["no_output_suffix"] if has_output else config["output_suffix"]
        alt_file = output_dir / f"{date_str}{alt_suffix}"
        if alt_file.exists():
            alt_file.unlink()
        
        workspaces = get_workspaces()
        
        header = f"""# {config["header_title"]} — {date_str}

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
Workspaces: {', '.join(workspaces) if workspaces else 'All'}

---

"""
    
    # Atomic write: write to temp file first, then rename (prevents partial files)
    full_content = header + content
    temp_file = output_file.with_suffix(".tmp")
    try:
        temp_file.write_text(full_content)
        temp_file.rename(output_file)  # Atomic on most filesystems
    except Exception as e:
        # Clean up temp file if rename fails
        if temp_file.exists():
            temp_file.unlink()
        raise RuntimeError(f"WRITE_FAILED: Could not save {output_file.name}: {e}")
    
    return output_file


def save_aggregated_output(
    content: str,
    start_date: datetime.date,
    end_date: datetime.date,
    mode: Literal["insights", "ideas"],
    mode_name: str,
    *,
    total_conversations: int = 0,
) -> Path:
    """Save aggregated output for multi-day runs."""
    config = MODE_CONFIG[mode]
    output_dir = config["output_dir"]
    output_dir.mkdir(parents=True, exist_ok=True)
    
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    
    content = content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        if lines[0].strip() in ["```", "```markdown", "```md"]:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        content = "\n".join(lines)
    
    has_output = config["has_output_check"](content)
    suffix = ".judge.md" if has_output else f".judge-no-{mode[:-1] if mode == 'insights' else 'idea'}.md"
    output_file = output_dir / f"{mode_name}_{start_str}_to_{end_str}{suffix}"
    
    workspaces = get_workspaces()
    
    header = f"""# {mode_name.title()} {config["aggregated_title"]} — {start_str} to {end_str}

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
Workspaces: {', '.join(workspaces) if workspaces else 'All'}
Mode: {mode_name.title()} (aggregated)
Period: {start_str} to {end_str}
Total conversations analyzed: {total_conversations}

---

"""
    
    # Atomic write: write to temp file first, then rename (prevents partial files)
    full_content = header + content
    temp_file = output_file.with_suffix(".tmp")
    try:
        temp_file.write_text(full_content)
        temp_file.rename(output_file)  # Atomic on most filesystems
    except Exception as e:
        # Clean up temp file if rename fails
        if temp_file.exists():
            temp_file.unlink()
        raise RuntimeError(f"WRITE_FAILED: Could not save {output_file.name}: {e}")
    return output_file


# =============================================================================
# Bank Harmonization
# =============================================================================

def harmonize_all_outputs(
    mode: Literal["insights", "ideas"],
    llm: LLMProvider,
    batch_size: int = 5,
    source_date_range: tuple[str, str] | None = None,  # (start_date, end_date) for coverage tracking
) -> int:
    """
    Harmonize all output files into the unified ItemsBank (v1), then delete them.
    Returns number of files processed.
    
    Args:
        mode: Generation mode ("insights" or "ideas")
        llm: LLM provider for quality scoring
        batch_size: Number of files to process in each batch
        source_date_range: Optional (start_date, end_date) tuple for coverage tracking.
                          If provided, items will be marked with these dates for coverage analysis.
    """
    config = MODE_CONFIG[mode]
    output_dir = config["output_dir"]
    bank_type = config["bank_type"]
    
    # Map mode to theme/mode IDs
    mode_mapping = {
        "insights": ("generation", "insight"),
        "ideas": ("generation", "idea"),
    }
    theme_id, mode_id = mode_mapping[mode]
    
    if not output_dir.exists():
        return 0
    
    output_files = sorted(output_dir.glob("*.md"))
    if not output_files:
        return 0
    
    total_files = len(output_files)
    print(f"\n📦 Harmonizing {total_files} output file(s) into {config['aggregated_title']} Bank...")
    emit_integration_started()
    
    processed = 0
    total_items_processed = 0
    total_items_added = 0
    total_items_updated = 0
    
    for i in range(0, total_files, batch_size):
        batch = output_files[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (total_files + batch_size - 1) // batch_size
        
        if total_batches > 1:
            print(f"   Batch {batch_num}/{total_batches}: {len(batch)} files...")
        
        items = []
        for f in batch:
            content = f.read_text()
            parsed_items = _parse_output(content, mode)
            if parsed_items:
                # Extract first_seen_date from filename (e.g., "Insights_2026-01-02_to_2026-01-08.judge.md" → "2026-01")
                # Using YYYY-MM format (month-year only) for simpler date tracking
                import re
                date_match = re.search(r'(\d{4}-\d{2})-\d{2}_to_', f.name)
                first_seen_date = date_match.group(1) if date_match else None
                
                # Attach date to each item for later use
                for item in parsed_items:
                    item["_first_seen_date"] = first_seen_date
                
                items.extend(parsed_items)
            else:
                # Diagnose WHY no items were found
                content_lower = content.lower()
                
                if "no posts found" in content_lower or "no insights" in content_lower or "no ideas" in content_lower:
                    # Expected case: LLM intentionally returned no content for this date
                    print(f"   ℹ️  {f.name}: No items for this date (insufficient chat activity)", file=sys.stderr)
                elif not content.strip():
                    print(f"   ⚠️  {f.name}: File is empty (generation may have failed)", file=sys.stderr)
                elif "## Item" not in content and "## Post" not in content and "## Idea" not in content:
                    # LLM didn't use expected format
                    print(f"   ⚠️  {f.name}: Unexpected format (missing ## Item/Post/Idea headers)", file=sys.stderr)
                    content_preview = content[:300].replace('\n', ' ')
                    print(f"      Preview: {content_preview}...", file=sys.stderr)
                else:
                    # Has headers but still failed to parse
                    print(f"   ⚠️  {f.name}: Parsing failed despite having headers (regex issue?)", file=sys.stderr)
                    content_preview = content[:200].replace('\n', ' ')
                    print(f"      Preview: {content_preview}...", file=sys.stderr)
        
        if items:
            # Use v2 ItemsBank system with unified content structure
            bank = ItemsBank()
            
            # Get existing item IDs before processing (to detect new vs updated)
            existing_ids_before = bank.get_all_item_ids()
            
            batch_items_processed = 0
            batch_items_added = 0
            batch_items_updated = 0
            
            # OPTIMIZATION: Prepare all items first, then batch-generate embeddings
            from common.semantic_search import batch_get_embeddings
            
            prepared_items = []
            for item in items:
                # Use unified content structure (v2)
                title = item.get("title", "")
                description = item.get("description", "")
                tags = item.get("tags", [])
                
                # Fallback: build description from legacy fields if description is empty
                if not description:
                    if mode == "insights":
                        parts = []
                        if item.get("content"):
                            parts.append(item["content"])
                        elif item.get("hook"):
                            parts.append(item["hook"])
                        if item.get("key_insight"):
                            parts.append(f"\n\n{item['key_insight']}")
                        if item.get("takeaway"):
                            parts.append(f"\n\n**Takeaway:** {item['takeaway']}")
                        description = "".join(parts).strip()
                    else:  # ideas
                        parts = []
                        if item.get("problem"):
                            parts.append(f"**Problem:** {item['problem']}")
                        if item.get("solution"):
                            parts.append(f"\n\n**Solution:** {item['solution']}")
                        if item.get("why_it_matters"):
                            parts.append(f"\n\n**Why It Matters:** {item['why_it_matters']}")
                        description = "".join(parts).strip()
                
                prepared_items.append({
                    "title": title,
                    "description": description,
                    "tags": tags,
                })
            
            # Batch generate embeddings for all items at once (10x faster than individual calls)
            # Note: If OpenAI is not configured, this returns zero vectors (no dedup against bank)
            if prepared_items:
                from common.semantic_search import is_openai_configured
                texts = [f"{p['title']} {p['description']}" for p in prepared_items]
                if is_openai_configured():
                    print(f"   ⚡ Batch generating {len(texts)} embeddings...", file=sys.stderr)
                    embeddings = batch_get_embeddings(texts)
                else:
                    print(f"   ⚠️  OpenAI not configured - skipping embeddings (items added without dedup)", file=sys.stderr)
                    embeddings = [[0.0] * 1536] * len(texts)  # Zero vectors = no similarity matching
                
                # Quality scoring: Use LLM to rate items on novelty, interest, actionability
                print(f"   🎯 Scoring quality for {len(prepared_items)} items...", file=sys.stderr)
                try:
                    # Get LLM for quality scoring (use configured model)
                    llm_config = get_llm_config()
                    quality_llm = create_llm(llm_config)
                    quality_scores = batch_score_quality(prepared_items, mode_id, quality_llm)
                    print(f"   ✅ Quality scores: {sum(1 for q in quality_scores if q == 'A')} A, {sum(1 for q in quality_scores if q == 'B')} B, {sum(1 for q in quality_scores if q == 'C')} C", file=sys.stderr)
                except Exception as e:
                    print(f"   ⚠️  Quality scoring failed: {e}", file=sys.stderr)
                    quality_scores = [None] * len(prepared_items)
                
                # OPTIMIZATION (H-1, H-2): Batch add items with parallel deduplication
                # Prepare items for batch insertion
                batch_items_data = []
                for i, prep in enumerate(prepared_items):
                    batch_items_data.append({
                        "title": prep["title"],
                        "description": prep["description"],
                        "tags": prep["tags"],
                        "embedding": embeddings[i],
                        "first_seen_date": prep.get("_first_seen_date"),
                        "quality": quality_scores[i] if i < len(quality_scores) else None,
                    })
                
                # Use batch_add_items if available (ItemsBankSupabase), else fallback to sequential
                if hasattr(bank, 'batch_add_items'):
                    batch_result = bank.batch_add_items(
                        items=batch_items_data,
                        item_type=mode_id,
                        source_start_date=source_date_range[0] if source_date_range else None,
                        source_end_date=source_date_range[1] if source_date_range else None,
                        threshold=0.85,
                        max_workers=5,
                    )
                    batch_items_processed = batch_result.get("total", 0)
                    batch_items_added = batch_result.get("added", 0)
                    batch_items_updated = batch_result.get("updated", 0)
                    total_items_processed += batch_items_processed
                    total_items_added += batch_items_added
                    total_items_updated += batch_items_updated
                else:
                    # Fallback: Sequential add_item calls (for local ItemsBank)
                    total_to_process = len(prepared_items)
                    for i, prep in enumerate(prepared_items):
                        # Emit intra-phase progress
                        emit_integration_progress(i + 1, total_to_process)
                        
                        returned_id = bank.add_item(
                            item_type=mode_id,
                            title=prep["title"],
                            description=prep["description"],
                            tags=prep["tags"],
                            embedding=embeddings[i],
                            first_seen_date=prep.get("_first_seen_date"),
                            quality=quality_scores[i] if i < len(quality_scores) else None,
                            source_start_date=source_date_range[0] if source_date_range else None,
                            source_end_date=source_date_range[1] if source_date_range else None,
                        )
                        
                        batch_items_processed += 1
                        total_items_processed += 1
                        
                        if returned_id in existing_ids_before:
                            batch_items_updated += 1
                            total_items_updated += 1
                        else:
                            batch_items_added += 1
                            total_items_added += 1
                            existing_ids_before.add(returned_id)
            
            bank.save()
            
            # Print harmonization stats in format parseable by API route
            print(f"📊 Harmonization Stats: {batch_items_processed} processed, {batch_items_added} added, {batch_items_updated} updated, {batch_items_updated} deduplicated")
            if batch_items_added > 0:
                print(f"   ✅ Added {batch_items_added} new item(s) to unified Items Bank")
            if batch_items_updated > 0:
                print(f"   🔄 Updated {batch_items_updated} existing item(s) (duplicates)")
            
            # Emit integration complete marker
            emit_integration_complete(
                items_compared=batch_items_processed,
                items_added=batch_items_added,
                items_merged=batch_items_updated,
                items_filtered=0,  # Will be calculated from difference with sent items
            )
            emit_complete(batch_items_added, batch_items_updated)
        
        for f in batch:
            f.unlink()
            print(f"   🗑️  Deleted: {f.name}")
        processed += len(batch)
    
    # NOTE: Category grouping removed - redundant with Theme Explorer and tags
    # Theme Explorer provides dynamic similarity-based grouping
    # Tags provide user-managed organization
    
    return processed


def _parse_output(content: str, mode: Literal["insights", "ideas"]) -> list[dict[str, Any]]:
    """
    Parse output file into structured format with unified content structure.
    
    Uses the same parsing logic as _parse_items_from_output for consistency.
    Returns items with title, description, and tags.
    """
    if not content or not content.strip():
        return []
    
    # Parse items from content (v2: no more "All Generated Candidates" section)
    items = _parse_items_from_output(content, mode)
    
    return items


# =============================================================================
# Status Sync (Mode-Specific)
# =============================================================================

def sync_posted_status(llm: LLMProvider, dry_run: bool = False) -> int:
    """
    Sync insight bank with social posts to mark insights as shared (insights mode only).
    Uses unified ItemsBank (v1) with folder-based tracking.
    Returns number of insights marked as shared.
    """
    if not is_feature_enabled("linkedInSync"):
        return 0
    
    config = get_feature_config("linkedInSync")
    posts_dir = config.get("postsDirectory")
    if not posts_dir:
        return 0
    
    posts_path = Path(posts_dir)
    if not posts_path.exists():
        print(f"⚠️  Social posts directory not found: {posts_path}")
        return 0
    
    return _sync_posted_status_v1(posts_path, dry_run)


def sync_solved_status(llm: LLMProvider, dry_run: bool = False) -> int:
    """
    Sync idea bank with workspace projects to mark ideas as solved (ideas mode only).
    Uses unified ItemsBank (v1) with folder-based tracking.
    Returns number of ideas with updated status.
    """
    if not is_feature_enabled("solvedStatusSync"):
        return 0
    
    return _sync_solved_status_v1(dry_run)


def _sync_posted_status_v1(posts_dir: Path, dry_run: bool = False) -> int:
    """Sync posted status using unified ItemsBank (v1) with folder-based tracking."""
    from common.folder_tracking import sync_implemented_status_from_folder
    
    # Use folder-based tracking (same as solved status)
    # Get category similarity threshold from config
    return sync_implemented_status_from_folder(
        folder_path=posts_dir,
        mode="insight",
        similarity_threshold=get_category_similarity_threshold(),
        dry_run=dry_run,
    )


def _sync_solved_status_v1(dry_run: bool = False) -> int:
    """Sync solved status using unified ItemsBank (v1) with folder-based tracking."""
    from common.folder_tracking import sync_implemented_status_from_folder
    from common.mode_settings import get_mode_setting
    
    # Get implemented items folder from mode settings (themes.json)
    implemented_folder = get_mode_setting("generation", "idea", "implementedItemsFolder")
    
    # Fallback: check legacy config
    if not implemented_folder:
        config = get_feature_config("solvedStatusSync")
        implemented_folder = config.get("implementedItemsFolder")
    
    if not implemented_folder:
        print("ℹ️  No implemented items folder configured for idea mode")
        print("   Configure in mode settings: implementedItemsFolder")
        return 0
    
    folder_path = Path(implemented_folder)
    if not folder_path.exists():
        print(f"⚠️  Implemented items folder not found: {folder_path}")
        return 0
    
    # Use folder-based tracking
    # Get category similarity threshold from config
    return sync_implemented_status_from_folder(
        folder_path=folder_path,
        mode="idea",
        similarity_threshold=get_category_similarity_threshold(),
        dry_run=dry_run,
    )




# =============================================================================
# Main Processing
# =============================================================================

def _get_relevant_conversations(
    target_date: datetime.date,
    mode: Literal["insights", "ideas"],
    workspace_paths: list[str] | None = None,
    top_k: int = 50,
) -> list[dict]:
    """
    Use semantic search to find conversations likely to contain insights or ideas.
    Optimized with parallel searches and efficient data fetching.
    """
    try:
        from common.vector_db import get_supabase_client, get_conversations_by_chat_ids
        from common.semantic_search import search_messages
        
        # Try Vector DB semantic search first
        if get_supabase_client():
            # Calculate timestamp range
            start_datetime = datetime.combine(target_date, datetime.min.time())
            end_datetime = datetime.combine(target_date + timedelta(days=1), datetime.min.time())
            start_ts = int(start_datetime.timestamp() * 1000)
            end_ts = int(end_datetime.timestamp() * 1000)
            
            # Load search queries from mode settings (configurable per mode)
            from common.mode_settings import get_mode_setting
            
            # Map mode to theme/mode IDs
            theme_id = "generation"
            mode_id = "insight" if mode == "insights" else "idea"
            
            # Get queries from mode settings, fallback to defaults
            search_queries = get_mode_setting(theme_id, mode_id, "semanticSearchQueries", None)
            
            if not search_queries:
                # Fallback to defaults if not configured
                if mode == "insights":
                    search_queries = [
                        "What did I learn? What problems did I solve?",
                        "What decisions did I make? What patterns did I notice?",
                        "What insights came up?",
                    ]
                else:  # ideas
                    search_queries = [
                        "What should I build? What problems need solving?",
                        "What tools would be useful? What features should I add?",
                        "What prototypes could I make?",
                    ]
            
            # Collect unique chat_ids from semantic search (PARALLELIZED)
            relevant_chat_ids: set[tuple[str, str, str]] = set()  # (workspace, chat_id, chat_type)
            
            def search_query(query: str) -> list[dict]:
                """Helper to run a single search query."""
                return search_messages(
                    query,
                    messages=[],  # Empty - will use Vector DB
                    top_k=top_k,  # Use full top_k per query (queries are combined now)
                    min_similarity=0.3,  # Lower threshold to cast wider net
                    context_messages=0,  # Don't need context for grouping
                    use_vector_db=True,
                    start_timestamp=start_ts,
                    end_timestamp=end_ts,
                    workspace_paths=workspace_paths,
                )
            
            # Run searches in parallel (much faster!)
            print(f"🔍 Running {len(search_queries)} semantic searches in parallel...", file=sys.stderr)
            with ThreadPoolExecutor(max_workers=min(len(search_queries), 5)) as executor:
                futures = {executor.submit(search_query, query): query for query in search_queries}
                for future in as_completed(futures):
                    matches = future.result()
                    # Collect chat_ids from matches
                    for match in matches:
                        chat_id = match.get("chat_id", "unknown")
                        workspace = match.get("workspace", "Unknown")
                        chat_type = match.get("chat_type", "unknown")
                        relevant_chat_ids.add((workspace, chat_id, chat_type))
            
            if relevant_chat_ids:
                # Fetch ONLY relevant conversations (much more efficient!)
                print(f"🔍 Found {len(relevant_chat_ids)} relevant conversations via semantic search", file=sys.stderr)
                print(f"📥 Fetching conversations by chat_ids (optimized)...", file=sys.stderr)
                
                # Use optimized function that only fetches relevant conversations
                filtered_conversations = get_conversations_by_chat_ids(
                    list(relevant_chat_ids),
                    target_date,
                    target_date,
                )
                
                if filtered_conversations:
                    print(f"✅ Using {len(filtered_conversations)} relevant conversations", file=sys.stderr)
                    return filtered_conversations
            
            # If semantic search found nothing, return empty
            print(f"⚠️  Semantic search found no matches", file=sys.stderr)
            return []
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"⚠️  Semantic search failed: {e}", file=sys.stderr)
        print(f"   Full traceback:\n{error_details}", file=sys.stderr)
        raise RuntimeError(
            f"Failed to retrieve conversations from Vector DB: {e}\n"
            f"Traceback:\n{error_details}\n"
            "Make sure Vector DB is synced and RPC function exists."
        ) from e
    
    # No fallback - Vector DB is required
    raise RuntimeError(
        "Vector DB not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file."
    )


def process_single_date(
    target_date: datetime.date,
    mode: Literal["insights", "ideas"],
    *,
    llm: LLMProvider,
    dry_run: bool = False,
    verbose: bool = False,
    temperature: float = DEFAULT_TEMPERATURE,
    item_count: int = 10,
    dedup_threshold: float = 0.85,
) -> dict:
    """Process a single date and return results."""
    # Use semantic search to find relevant conversations
    try:
        conversations = _get_relevant_conversations(target_date, mode, workspace_paths=None)
    except Exception as e:
        import traceback
        error_msg = f"Failed to get conversations for {target_date}: {e}\n{traceback.format_exc()}"
        print(f"❌ {error_msg}", file=sys.stderr)
        raise RuntimeError(error_msg) from e
    
    config = MODE_CONFIG[mode]
    has_output_key = "has_posts" if mode == "insights" else "has_ideas"
    
    if not conversations:
        return {"date": target_date, "conversations": 0, has_output_key: False, "output_file": None}
    
    # Step 4: Compress/distill each conversation individually (lossless compression)
    # Users want signals/reminders, not all details - compression preserves key info
    from common.prompt_compression import compress_single_conversation, estimate_tokens
    
    # Pre-calculate which conversations need compression (avoid redundant formatting)
    conversations_to_compress = []
    conversations_to_keep = []
    
    for conv in conversations:
        conv_text = format_conversations_for_prompt([conv])
        conv_tokens = estimate_tokens(conv_text)
        if conv_tokens > 800:
            conversations_to_compress.append((conv, conv_tokens))
        else:
            conversations_to_keep.append((conv, conv_tokens))
    
    # Compress conversations in parallel (much faster!)
    compressed_conversations = []
    total_before = sum(tokens for _, tokens in conversations_to_compress) + sum(tokens for _, tokens in conversations_to_keep)
    
    if conversations_to_compress:
        print(f"📦 Compressing {len(conversations_to_compress)} large conversations...", file=sys.stderr)
        with ThreadPoolExecutor(max_workers=min(len(conversations_to_compress), 5)) as executor:
            futures = {executor.submit(compress_single_conversation, conv, llm=llm, max_tokens=500): conv for conv, _ in conversations_to_compress}
            for future in as_completed(futures):
                compressed_conv = future.result()
                compressed_conversations.append(compressed_conv)
        
        # Add uncompressed conversations
        compressed_conversations.extend([conv for conv, _ in conversations_to_keep])
        
        # Calculate total after compression
        total_after = 0
        for conv in compressed_conversations:
            conv_text = format_conversations_for_prompt([conv])
            total_after += estimate_tokens(conv_text)
        
        if total_before > total_after:
            reduction = ((total_before - total_after) / total_before) * 100
            print(f"✅ Compressed {len(conversations)} conversations: {total_before:,} → {total_after:,} tokens ({reduction:.1f}% reduction)", file=sys.stderr)
    else:
        compressed_conversations = [conv for conv, _ in conversations_to_keep]
    
    conversations_text = format_conversations_for_prompt(compressed_conversations)
    
    if verbose:
        print(f"\n--- {target_date} Conversations ---")
        print(conversations_text[:1000])
        print("... (truncated)\n")
    
    if dry_run:
        return {"date": target_date, "conversations": len(conversations), has_output_key: False, "output_file": None}
    
    # v2: Use generate_items() for item-centric generation
    items, stats = generate_items(
        conversations_text,
        mode,
        llm=llm,
        item_count=item_count,
        temperature=temperature,
        deduplication_threshold=dedup_threshold,
    )
    
    # Convert items to markdown for saving
    content = items_to_markdown(items, mode)
    has_output = len(items) > 0
    
    # Save with items metadata (v2: no candidates)
    output_file = save_output(content, target_date, mode)
    
    return {
        "date": target_date,
        "conversations": len(conversations),
        has_output_key: has_output,
        "output_file": output_file,
        "items_generated": stats.get("items_generated", 0),
        "items_after_dedup": stats.get("items_after_dedup", 0),
        "items_returned": stats.get("items_returned", 0),
    }


def process_aggregated_range(
    dates: list[datetime.date],
    mode: Literal["insights", "ideas"],
    mode_name: str,
    *,
    llm: LLMProvider,
    dry_run: bool = False,
    verbose: bool = False,
    temperature: float = DEFAULT_TEMPERATURE,
    item_count: int = 10,
    dedup_threshold: float = 0.85,
    timestamp_range: tuple[int, int] | None = None,  # Optional (start_ts, end_ts) for precise time-based ranges
    source_date_range: tuple[str, str] | None = None,  # Optional (start_date, end_date) for coverage tracking
    topic_filter: bool = True,  # IMP-17: Pre-filter covered topics to reduce LLM costs
) -> dict:
    """Process a date range with aggregated output."""
    # OPTIMIZATION: Search entire date range at once instead of per-date
    # This reduces semantic search calls from (days × queries) to just queries
    if not dates:
        return {
            "start_date": None,
            "end_date": None,
            "total_conversations": 0,
            "days_with_activity": 0,
            "has_posts" if mode == "insights" else "has_ideas": False,
            "output_file": None,
        }
    
    start_date = dates[0]
    end_date = dates[-1]
    
    # Display appropriate message based on date vs timestamp range
    if timestamp_range:
        from_dt = datetime.fromtimestamp(timestamp_range[0] / 1000)
        to_dt = datetime.fromtimestamp(timestamp_range[1] / 1000)
        hours_back = (to_dt - from_dt).total_seconds() / 3600
        print(f"📥 Collecting relevant conversations from last {int(hours_back)} hours ({from_dt.strftime('%m-%d %H:%M')} to {to_dt.strftime('%m-%d %H:%M')})...")
    else:
        print(f"📥 Collecting relevant conversations from {len(dates)} days ({start_date} to {end_date})...")
    print(f"🔍 Searching entire date range at once (optimized)...", file=sys.stderr)
    
    # Emit search phase marker
    emit_search_started()
    
    try:
        from common.vector_db import get_supabase_client, get_conversations_by_chat_ids
        from common.semantic_search import search_messages
        
        # Search entire date range at once (much faster!)
        if get_supabase_client():
            # Use timestamp_range if provided, otherwise calculate from dates
            if timestamp_range:
                start_ts, end_ts = timestamp_range
            else:
                start_datetime = datetime.combine(start_date, datetime.min.time())
                end_datetime = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
                start_ts = int(start_datetime.timestamp() * 1000)
                end_ts = int(end_datetime.timestamp() * 1000)
            
            # Load search queries from mode settings (configurable per mode)
            from common.mode_settings import get_mode_setting
            
            # Map mode to theme/mode IDs
            theme_id = "generation"
            mode_id = "insight" if mode == "insights" else "idea"
            
            # Get queries from mode settings, fallback to defaults
            search_queries = get_mode_setting(theme_id, mode_id, "semanticSearchQueries", None)
            
            if not search_queries:
                # Fallback to defaults if not configured
                if mode == "insights":
                    search_queries = [
                        "What did I learn? What problems did I solve?",
                        "What decisions did I make? What patterns did I notice?",
                        "What insights came up?",
                    ]
                else:  # ideas
                    search_queries = [
                        "What should I build? What problems need solving?",
                        "What tools would be useful? What features should I add?",
                        "What prototypes could I make?",
                    ]
            
            # Collect unique chat_ids from semantic search (PARALLELIZED across date range)
            relevant_chat_ids: set[tuple[str, str, str]] = set()
            
            def search_query(query: str) -> list[dict]:
                """Helper to run a single search query across entire date range."""
                return search_messages(
                    query,
                    messages=[],
                    top_k=50,  # Higher top_k since we're searching entire range
                    min_similarity=0.3,
                    context_messages=0,
                    use_vector_db=True,
                    start_timestamp=start_ts,
                    end_timestamp=end_ts,
                    workspace_paths=None,
                )
            
            # Run searches in parallel (only 3 searches instead of days × 5)
            print(f"🔍 Running {len(search_queries)} semantic searches across {len(dates)} days...", file=sys.stderr)
            with ThreadPoolExecutor(max_workers=len(search_queries)) as executor:
                futures = {executor.submit(search_query, query): query for query in search_queries}
                for future in as_completed(futures):
                    matches = future.result()
                    for match in matches:
                        chat_id = match.get("chat_id", "unknown")
                        workspace = match.get("workspace", "Unknown")
                        chat_type = match.get("chat_type", "unknown")
                        relevant_chat_ids.add((workspace, chat_id, chat_type))
            
            if relevant_chat_ids:
                print(f"🔍 Found {len(relevant_chat_ids)} relevant conversations via semantic search", file=sys.stderr)
                print(f"📥 Fetching conversations by chat_ids...", file=sys.stderr)
                
                # Fetch all conversations at once (much faster than per-date)
                all_conversations = get_conversations_by_chat_ids(
                    list(relevant_chat_ids),
                    start_date,
                    end_date,
                )
                
                # Add source_date based on message timestamps
                for conv in all_conversations:
                    if conv.get("messages"):
                        first_msg_ts = conv["messages"][0].get("timestamp", 0)
                        if first_msg_ts:
                            msg_date = datetime.fromtimestamp(first_msg_ts / 1000).date()
                            conv["source_date"] = str(msg_date)
                
                days_with_activity = len(set(conv.get("source_date", "") for conv in all_conversations))
                print(f"✅ Found {len(all_conversations)} conversations across {days_with_activity} active days")
                print(f"📊 Processing all {len(all_conversations)} conversations (compression will handle size)")
                
                # Emit search complete marker
                emit_search_complete(
                    conversations_found=len(all_conversations),
                    days_with_activity=days_with_activity,
                    days_processed=len(dates)
                )
            else:
                all_conversations = []
                days_with_activity = 0
                # PRE-FLIGHT CHECK: Clear message before wasting LLM credits
                print(f"", file=sys.stderr)  # Visual break
                print(f"❓ NO_MESSAGES_FOUND: No relevant conversations for {start_date} to {end_date}", file=sys.stderr)
                print(f"   Possible reasons:", file=sys.stderr)
                print(f"   • Brain not synced recently (check 'Sync Brain' in UI)", file=sys.stderr)
                print(f"   • No Cursor activity during this date range", file=sys.stderr)
                print(f"   • Search queries didn't match your chat content", file=sys.stderr)
                print(f"   Try: Different dates, shorter range, or sync your brain first.", file=sys.stderr)
                print(f"", file=sys.stderr)
                
                # Emit search complete with zero results
                emit_search_complete(
                    conversations_found=0,
                    days_with_activity=0,
                    days_processed=len(dates)
                )
                emit_error("no_messages", f"No relevant conversations for {start_date} to {end_date}")
        else:
            raise RuntimeError("Vector DB not configured")
            
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"⚠️  Failed to get conversations: {e}", file=sys.stderr)
        print(f"   Traceback: {traceback.format_exc()}", file=sys.stderr)
        # Fallback to per-date search if range search fails
        print(f"   Falling back to per-date search...", file=sys.stderr)
        all_conversations = []
        days_with_activity = 0
        
        def process_date(date: datetime.date) -> tuple[datetime.date, list[dict] | None]:
            try:
                conversations = _get_relevant_conversations(date, mode, workspace_paths=None)
                if conversations:
                    for conv in conversations:
                        conv["source_date"] = str(date)
                return (date, conversations)
            except Exception as e:
                return (date, None)
        
        max_workers = min(len(dates), 10)
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(process_date, date): date for date in dates}
            for future in as_completed(futures):
                date, conversations = future.result()
                if conversations:
                    days_with_activity += 1
                    all_conversations.extend(conversations)
        
        print(f"✅ Found {len(all_conversations)} conversations across {days_with_activity} active days")
        print(f"📊 Processing all {len(all_conversations)} conversations (compression will handle size)")
    
    config = MODE_CONFIG[mode]
    has_output_key = "has_posts" if mode == "insights" else "has_ideas"
    
    if not all_conversations:
        return {
            "start_date": dates[0] if dates else None,
            "end_date": dates[-1] if dates else None,
            "total_conversations": 0,
            "days_with_activity": 0,
            has_output_key: False,
            "output_file": None,
        }
    
    # Step 3.5 (IMP-17): Pre-filter covered topics to reduce LLM generation costs
    # For covered topics: Skip generation but expand date ranges (keeps coverage accurate)
    topic_filter_stats = None
    if topic_filter and source_date_range:
        from common.topic_filter import filter_covered_topics
        
        # Map mode to item_type
        item_type = "insight" if mode == "insights" else "idea"
        
        filter_result = filter_covered_topics(
            conversations=all_conversations,
            item_type=item_type,
            source_start_date=source_date_range[0],
            source_end_date=source_date_range[1],
            threshold=0.75,  # Lower than dedup threshold to catch more overlaps
            max_workers=5,
            verbose=verbose,
        )
        
        topic_filter_stats = {
            "original_conversations": len(all_conversations),
            "conversations_to_generate": filter_result.uncovered_count,
            "conversations_skipped": filter_result.covered_count,
            "items_date_range_expanded": filter_result.items_updated,
        }
        
        # Use filtered conversations for generation
        all_conversations = filter_result.conversations_to_generate
        
        # If all topics are covered, return early
        if not all_conversations:
            print(f"✅ All topics already covered! Date ranges expanded for {filter_result.items_updated} items.", file=sys.stderr)
            return {
                "start_date": dates[0],
                "end_date": dates[-1],
                "total_conversations": topic_filter_stats["original_conversations"],
                "days_with_activity": days_with_activity,
                has_output_key: False,
                "output_file": None,
                "topic_filter": topic_filter_stats,
                "skipped_reason": "all_topics_covered",
        }
    
    # Step 4: Compress/distill each conversation individually (lossless compression)
    # Users want signals/reminders, not all details - compression preserves key info
    # OPTIMIZATION: Skip compression for small date ranges (configurable threshold)
    # Small date ranges typically have small prompts; compression adds cost/time without much benefit
    from common.prompt_compression import compress_single_conversation, estimate_tokens
    
    date_range_days = len(dates)
    compression_date_threshold = get_compression_date_threshold()
    skip_compression = date_range_days < compression_date_threshold
    
    if skip_compression:
        print(f"⏭️  Skipping compression (date range: {date_range_days} days < {compression_date_threshold} days threshold)", file=sys.stderr)
        compressed_conversations = all_conversations
    else:
        # Pre-calculate which conversations need compression (avoid redundant formatting)
        conversations_to_compress = []
        conversations_to_keep = []
        
        for conv in all_conversations:
            conv_text = format_conversations_for_prompt([conv])
            conv_tokens = estimate_tokens(conv_text)
            if conv_tokens > 800:
                conversations_to_compress.append((conv, conv_tokens))
            else:
                conversations_to_keep.append((conv, conv_tokens))
        
        # Compress conversations in parallel (much faster!)
        compressed_conversations = []
        total_before = sum(tokens for _, tokens in conversations_to_compress) + sum(tokens for _, tokens in conversations_to_keep)
        
        if conversations_to_compress:
            print(f"📦 Compressing {len(conversations_to_compress)} large conversations (parallel)...", file=sys.stderr)
            with ThreadPoolExecutor(max_workers=min(len(conversations_to_compress), 5)) as executor:
                futures = {executor.submit(compress_single_conversation, conv, llm=llm, max_tokens=500): conv for conv, _ in conversations_to_compress}
                for future in as_completed(futures):
                    compressed_conv = future.result()
                    compressed_conversations.append(compressed_conv)
            
            # Add uncompressed conversations
            compressed_conversations.extend([conv for conv, _ in conversations_to_keep])
            
            # Calculate total after compression
            total_after = 0
            for conv in compressed_conversations:
                conv_text = format_conversations_for_prompt([conv])
                total_after += estimate_tokens(conv_text)
            
            if total_before > total_after:
                reduction = ((total_before - total_after) / total_before) * 100
                print(f"✅ Compressed {len(all_conversations)} conversations: {total_before:,} → {total_after:,} tokens ({reduction:.1f}% reduction)", file=sys.stderr)
            
            # Final safety check: warn if still too large (shouldn't happen with compression)
            if total_after > 25000:
                print(f"⚠️  Warning: Total size ({total_after:,} tokens) approaches rate limit (30k TPM)", file=sys.stderr)
                print(f"   Consider reducing date range if generation fails", file=sys.stderr)
        else:
            compressed_conversations = [conv for conv, _ in conversations_to_keep]
    
    conversations_text = format_conversations_for_prompt(compressed_conversations)
    
    if dry_run:
        return {
            "start_date": dates[0],
            "end_date": dates[-1],
            "total_conversations": len(all_conversations),
            "days_with_activity": days_with_activity,
            has_output_key: False,
            "output_file": None,
        }
    
    # v2: Use generate_items() for item-centric generation
    print(f"🧠 Generating {mode} (item_count={item_count}, temp={temperature}, dedup={dedup_threshold})...")
    items, stats = generate_items(
        conversations_text,
        mode,
        llm=llm,
        item_count=item_count,
        temperature=temperature,
        deduplication_threshold=dedup_threshold,
    )
    
    # Convert items to markdown for saving
    content = items_to_markdown(items, mode)
    has_output = len(items) > 0
    
    # Save output (v2: no candidates)
    output_file = save_aggregated_output(
        content,
        dates[0],
        dates[-1],
        mode,
        mode_name,
        total_conversations=len(all_conversations),
    )
    
    result = {
        "start_date": dates[0],
        "end_date": dates[-1],
        "total_conversations": len(all_conversations),
        "days_with_activity": days_with_activity,
        has_output_key: has_output,
        "output_file": output_file,
        "items_generated": stats.get("items_generated", 0),
        "items_after_dedup": stats.get("items_after_dedup", 0),
        "items_returned": stats.get("items_returned", 0),
    }
    
    # Add topic filter stats if available
    if topic_filter_stats:
        result["topic_filter"] = topic_filter_stats
        # Adjust total_conversations to reflect original count before filtering
        result["total_conversations"] = topic_filter_stats["original_conversations"]
    
    return result


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Generate insights (shareable learnings) or ideas (prototype briefs) from Cursor chat history",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    
    # Mode selection (required)
    parser.add_argument(
        "--mode",
        choices=["insights", "ideas"],
        required=True,
        help="Generation mode: 'insights' for shareable learnings, 'ideas' for prototype briefs",
    )
    
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument("--daily", action="store_true", help="Daily mode: 1 day, best-of 3")
    mode_group.add_argument("--sprint", action="store_true", help="Sprint mode: 2 weeks, best-of 5")
    mode_group.add_argument("--month", action="store_true", help="Month mode: 4 weeks, best-of 10")
    mode_group.add_argument("--quarter", action="store_true", help="Quarter mode: 6 weeks, best-of 15")
    
    parser.add_argument("--date", type=str, help="Single date (YYYY-MM-DD)")
    parser.add_argument("--days", type=int, help="Process last N days")
    parser.add_argument("--hours", type=int, help="Process last N hours (timestamp-based, more precise than --days)")
    parser.add_argument("--dry-run", action="store_true", help="Extract chats but don't generate")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--temperature", type=float, default=None)
    # v2 Item-centric architecture
    parser.add_argument("--item-count", dest="item_count", type=int, default=None,
                        help="Number of items to generate")
    parser.add_argument("--dedup-threshold", dest="dedup_threshold", type=float, default=0.85,
                        help="Similarity threshold for deduplication (0.0-1.0)")
    # Coverage Intelligence: precise date range arguments
    parser.add_argument("--start-date", dest="start_date", type=str,
                        help="Start date (YYYY-MM-DD) for coverage run")
    parser.add_argument("--end-date", dest="end_date", type=str,
                        help="End date (YYYY-MM-DD) for coverage run")
    parser.add_argument("--source-tracking", dest="source_tracking", action="store_true",
                        help="Track source dates for coverage analysis")
    parser.add_argument("--no-topic-filter", dest="no_topic_filter", action="store_true",
                        help="Disable IMP-17 pre-generation topic filter (generate all topics)")
    parser.add_argument("--items", dest="items_alias", type=int, default=None,
                        help="Alias for --item-count (for coverage runs)")
    
    args = parser.parse_args()
    
    # Handle --items alias for --item-count
    if args.items_alias is not None and args.item_count is None:
        args.item_count = args.items_alias
    
    mode: Literal["insights", "ideas"] = args.mode
    
    # MODE_PRESETS: (days_or_hours, item_count, temperature, is_hours)
    # Note: "daily" now uses hours=24 for true "last 24 hours" behavior
    MODE_PRESETS = {
        "daily": (24, 5, 0.3, True),   # 24 hours (not 1 day)
        "sprint": (14, 10, 0.4, False),  # 14 days
        "month": (28, 15, 0.5, False),   # 28 days
        "quarter": (42, 20, 0.5, False), # 42 days
    }
    
    mode_days, mode_item_count, mode_temperature = None, 10, get_default_temperature()
    mode_name = None
    use_aggregated = False
    
    if args.daily:
        hours_or_days, mode_item_count, mode_temperature, is_hours = MODE_PRESETS["daily"]
        if is_hours:
            args.hours = hours_or_days  # Use hours-based processing
            mode_days = None
        else:
            mode_days = hours_or_days
        mode_name = "daily"
        use_aggregated = True  # Use aggregated range for 24-hour window
    elif args.sprint:
        days_or_hours, mode_item_count, mode_temperature, is_hours = MODE_PRESETS["sprint"]
        mode_days = days_or_hours if not is_hours else None
        mode_name = "sprint"
        use_aggregated = True
    elif args.month:
        days_or_hours, mode_item_count, mode_temperature, is_hours = MODE_PRESETS["month"]
        mode_days = days_or_hours if not is_hours else None
        mode_name = "month"
        use_aggregated = True
    elif args.quarter:
        days_or_hours, mode_item_count, mode_temperature, is_hours = MODE_PRESETS["quarter"]
        mode_days = days_or_hours if not is_hours else None
        mode_name = "quarter"
        use_aggregated = True
    elif args.days and args.days > 1:
        # Custom date range: use aggregated processing (not per-day)
        # This ensures --item-count produces exactly N items total, not N per day
        mode_days = args.days
        mode_name = "custom"
        use_aggregated = True
    
    # Use mode's default item_count if not specified
    if args.item_count is None:
        args.item_count = mode_item_count
    if args.temperature is None:
        args.temperature = mode_temperature
    
    today = datetime.now().date()
    now = datetime.now()
    dates_to_process = []
    timestamp_range: tuple[int, int] | None = None  # For hours-based processing
    source_date_range: tuple[str, str] | None = None  # For coverage tracking
    
    # Priority: --start-date/--end-date > --hours > --days > mode default
    if args.start_date and args.end_date:
        # Coverage run: precise date range
        try:
            start_date = datetime.strptime(args.start_date, "%Y-%m-%d").date()
            end_date = datetime.strptime(args.end_date, "%Y-%m-%d").date()
            
            # Calculate days in range
            delta = (end_date - start_date).days + 1
            dates_to_process = [start_date + timedelta(days=i) for i in range(delta)]
            
            # Enable aggregated mode for coverage runs
            use_aggregated = True
            mode_name = "coverage"
            
            # ALWAYS track source dates for Coverage Intelligence
            source_date_range = (args.start_date, args.end_date)
            
            print(f"📅 Processing: {start_date} to {end_date} (coverage run)")
        except ValueError as e:
            print(f"Error: Invalid date format. Use YYYY-MM-DD. Error: {e}")
            return 1
    elif args.hours:
        # Use timestamp-based range for precise hour-based processing
        end_ts = int(now.timestamp() * 1000)
        start_ts = int((now - timedelta(hours=args.hours)).timestamp() * 1000)
        timestamp_range = (start_ts, end_ts)
        # Still create dates_to_process for display purposes (covers the hours window)
        dates_to_process = [today - timedelta(days=1), today]  # Yesterday and today
        # Track source dates for Coverage Intelligence (approximate from hours)
        start_date_for_hours = (now - timedelta(hours=args.hours)).date()
        source_date_range = (start_date_for_hours.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d"))
        print(f"📅 Processing: Last {args.hours} hours ({mode} mode)")
    else:
        effective_days = args.days if args.days else mode_days
        
        if effective_days:
            for i in range(effective_days):
                dates_to_process.append(today - timedelta(days=i))
            dates_to_process.reverse()
        elif args.date:
            try:
                dates_to_process = [datetime.strptime(args.date, "%Y-%m-%d").date()]
            except ValueError:
                print(f"Error: Invalid date format '{args.date}'")
                return 1
        else:
            dates_to_process = [today]
        
        # ALWAYS track source dates for Coverage Intelligence
        if dates_to_process:
            source_date_range = (
                dates_to_process[0].strftime("%Y-%m-%d"),
                dates_to_process[-1].strftime("%Y-%m-%d")
            )
        
        print(f"📅 Processing: {dates_to_process[0]} to {dates_to_process[-1]} ({mode} mode)")
    
    llm_config = get_llm_config()
    llm = create_llm(llm_config)
    
    print(f"🤖 LLM: {llm.provider} ({llm.model})")
    
    # Start performance tracking
    start_run(mode=mode, item_count=args.item_count, days=len(dates_to_process))
    
    try:
        # Emit progress markers for frontend streaming
        if dates_to_process:
            date_range_str = f"{dates_to_process[0]} to {dates_to_process[-1]}"
        elif timestamp_range:
            from_dt = datetime.fromtimestamp(timestamp_range[0] / 1000)
            to_dt = datetime.fromtimestamp(timestamp_range[1] / 1000)
            date_range_str = f"{from_dt.strftime('%m-%d %H:%M')} to {to_dt.strftime('%m-%d %H:%M')}"
        else:
            date_range_str = "today"
        emit_request_confirmed(
            date_range=date_range_str,
            requested_items=args.item_count,
            temperature=args.temperature,
            days_processed=len(dates_to_process)
        )
        
        if use_aggregated and mode_name:
            result = process_aggregated_range(
                dates_to_process,
                mode,
                mode_name,
                llm=llm,
                dry_run=args.dry_run,
                verbose=args.verbose,
                temperature=args.temperature,
                item_count=args.item_count,
                dedup_threshold=args.dedup_threshold,
                timestamp_range=timestamp_range,  # For hours-based processing
                source_date_range=source_date_range,  # For coverage tracking
                topic_filter=not args.no_topic_filter,  # IMP-17: Pre-filter covered topics
            )
            
            has_output_key = "has_posts" if mode == "insights" else "has_ideas"
            output_label = "Posts ✅" if mode == "insights" else "Ideas ✅"
            
            # v2 stats: items_generated, items_after_dedup, items_returned
            items_generated = result.get('items_generated', 0)
            items_after_dedup = result.get('items_after_dedup', 0)
            items_returned = result.get('items_returned', 0)
            
            print(f"\n📊 SUMMARY:")
            print(f"   Conversations analyzed: {result['total_conversations']}")
            print(f"   Days processed: {len(dates_to_process)}")
            print(f"   Days with activity: {result['days_with_activity']}")
            print(f"   Days with {'posts' if mode == 'insights' else 'ideas'}: {1 if result[has_output_key] else 0}")
            print(f"   Items generated: {items_generated}")
            print(f"   Items after dedup: {items_after_dedup}")
            print(f"   Items returned: {items_returned}")
            print(f"   Output: {output_label if result[has_output_key] else 'No output ❌'}")
            
            if result["output_file"] and not args.dry_run:
                print(f"📄 Output: {result['output_file']}")
                harmonize_all_outputs(mode, llm, source_date_range=source_date_range)
                # Sync operations are non-critical - don't crash if they fail
                # The main work (generation + harmonization) is already saved
                try:
                    if mode == "insights":
                        sync_posted_status(llm)
                    else:
                        sync_solved_status(llm)
                except Exception as e:
                    print(f"⚠️  Sync operation failed (non-critical, items are saved): {e}", file=sys.stderr)
                    print(f"   You can retry sync later via the UI or by running again", file=sys.stderr)
        else:
            for date in dates_to_process:
                result = process_single_date(
                    date,
                    mode,
                    llm=llm,
                    dry_run=args.dry_run,
                    verbose=args.verbose,
                    temperature=args.temperature,
                    item_count=args.item_count,
                    dedup_threshold=args.dedup_threshold,
                )
                has_output_key = "has_posts" if mode == "insights" else "has_ideas"
                output_icon = "✅" if result[has_output_key] else "❌"
                print(f"{output_icon} {date}: {result['conversations']} conversations")
            
            if not args.dry_run:
                harmonize_all_outputs(mode, llm)
                # Sync operations are non-critical - don't crash if they fail
                # The main work (generation + harmonization) is already saved
                try:
                    if mode == "insights":
                        sync_posted_status(llm)
                    else:
                        sync_solved_status(llm)
                except Exception as e:
                    print(f"⚠️  Sync operation failed (non-critical, items are saved): {e}", file=sys.stderr)
                    print(f"   You can retry sync later via the UI or by running again", file=sys.stderr)
        
        # End performance tracking (success path)
        perf_summary = end_run(success=True)
        if perf_summary:
            print(f"\n⏱️  Performance: {perf_summary.get('total_elapsed_seconds', 0):.1f}s total, ${perf_summary.get('total_cost_usd', 0):.4f} cost")
        
        return 0
    
    except Exception as e:
        # End performance tracking (error path)
        error_msg = str(e)
        emit_error("script_error", f"Generation failed: {error_msg}")
        end_run(success=False, error=error_msg)
        print(f"\n❌ Error: {error_msg}", file=sys.stderr)
        raise  # Re-raise to let caller handle


if __name__ == "__main__":
    exit(main())

