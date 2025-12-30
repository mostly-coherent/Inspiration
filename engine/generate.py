#!/usr/bin/env python3
"""
Inspiration Engine — Unified Content Generation

Generate insights (LinkedIn posts) or ideas (prototype briefs) from Cursor chat history.
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

# Import v1 unified Items system (required - v0 removed)
from common.items_bank import ItemsBank

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
}

# Default generation settings
DEFAULT_TEMPERATURE = 0.2
DEFAULT_TOP_P = 1.0
DEFAULT_BEST_OF = 1

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
# Prompt Loading (with caching)
# =============================================================================

# In-memory cache for prompt templates
_prompt_cache: dict[str, str] = {}
_prompt_file_mtimes: dict[str, float] = {}


def load_synthesize_prompt(mode: Literal["insights", "ideas"]) -> str:
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
            return "Generate 3 LinkedIn post drafts from the following Cursor chat history."
        else:
            return "Generate 3 idea briefs from the following Cursor chat history."
    
    return combined


def load_judge_prompt() -> str:
    """Load the reranking judge prompt (cached)."""
    prompt_name = "judge"
    prompt_file = PROMPTS_DIR / f"{prompt_name}.md"
    
    # Check cache and file modification time
    if prompt_file.exists():
        current_mtime = prompt_file.stat().st_mtime
        cached_mtime = _prompt_file_mtimes.get(prompt_name, 0)
        
        # Return cached version if file hasn't changed
        if prompt_name in _prompt_cache and current_mtime == cached_mtime:
            return _prompt_cache[prompt_name]
        
        # Load and cache
        content = prompt_file.read_text()
        _prompt_cache[prompt_name] = content
        _prompt_file_mtimes[prompt_name] = current_mtime
        return content
    
    return """Pick the best candidate set. Return JSON: {"best": "C1", "why": "...", "scores": {...}}"""


def load_golden_posts() -> str:
    """Load user's actual LinkedIn posts as golden examples (insights mode only)."""
    # First try custom voice config
    voice_config = get_feature_config("customVoice")
    posts_dir = voice_config.get("goldenExamplesDir")
    
    # Fall back to LinkedIn sync config
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
# Content Generation
# =============================================================================

def generate_content(
    conversations_text: str,
    mode: Literal["insights", "ideas"],
    *,
    llm: LLMProvider,
    max_tokens: int = 2000,
    temperature: float = DEFAULT_TEMPERATURE,
    best_of: int = 1,
    rerank: bool = True,
    include_scorecard: bool = True,
) -> tuple[str, list[tuple[str, str]]]:
    """
    Generate content (insights or ideas) from conversation text.
    
    Args:
        conversations_text: Formatted conversation history
        mode: Generation mode ("insights" or "ideas")
        llm: LLM provider instance
        max_tokens: Max tokens for generation
        temperature: Sampling temperature
        best_of: Number of candidates to generate
        rerank: Whether to rerank candidates
        include_scorecard: Whether to include judge scorecard
    
    Returns:
        Tuple of (best_match_markdown, all_candidates_list)
        where all_candidates_list is [(candidate_id, text), ...]
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
    
    user_content_base = f"Here are today's Cursor chat conversations:\n\n{conversations_text}"
    
    # Single generation (deterministic)
    if best_of <= 1:
        single_result = llm.generate(
            user_content_base,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return single_result, [("C1", single_result)]
    
    # Multiple candidates with reranking - generate in parallel for speed
    candidates = []
    with ThreadPoolExecutor(max_workers=min(best_of, 5)) as executor:
        # Submit all generation tasks
        futures = {}
        for i in range(best_of):
            candidate_id = f"C{i+1}"
            user_content = f"{user_content_base}\n\n(Candidate {candidate_id})"
            future = executor.submit(
                llm.generate,
                user_content,
                system_prompt=system_prompt,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            futures[future] = candidate_id
        
        # Collect results as they complete
        for future in as_completed(futures):
            candidate_id = futures[future]
            try:
                text = future.result()
                candidates.append((candidate_id, text))
            except Exception as e:
                print(f"⚠️  Failed to generate {candidate_id}: {e}")
                # Continue with remaining candidates
    
    # Check if we have any successful candidates
    if not candidates:
        raise RuntimeError(
            "All candidate generations failed. This may be due to:\n"
            "- Rate limits (prompt too large)\n"
            "- API errors\n"
            "- Network issues\n\n"
            "Try:\n"
            "- Enabling prompt compression in settings\n"
            "- Reducing the date range\n"
            "- Using a smaller best-of value"
        )
    
    if not rerank:
        return candidates[0][1], candidates
    
    # Rerank candidates using cheaper judge model if available
    judge_prompt = load_judge_prompt()
    candidates_blob = "\n\n".join([f"---\nCANDIDATE {cid}\n---\n{text}" for cid, text in candidates])
    judge_user = f"Pick the best set.\n\n{candidates_blob}"
    
    # Use cheaper judge model if configured (saves ~80% cost)
    judge_llm = llm.get_judge_llm()
    if judge_llm != llm:
        print(f"💰 Using {judge_llm.provider}/{judge_llm.model} for judging (cost optimization)")
    
    judge_text = judge_llm.generate(
        judge_user,
        system_prompt=judge_prompt,
        max_tokens=300,
        temperature=0.0,
    )
    
    # Parse judge response
    judge = _safe_parse_judge_json(judge_text)
    best_id = judge.get("best", "C1") if judge else "C1"
    if not isinstance(best_id, str) or not re.fullmatch(r"C\d+", best_id.strip()):
        best_id = "C1"
    best_id = best_id.strip().upper()
    
    # Find best match, or use first candidate if best_id not found
    best_match = next((t for cid, t in candidates if cid == best_id), candidates[0][1])
    
    if include_scorecard and judge:
        scorecard_md = _format_scorecard(judge, candidates)
        return f"{best_match}\n\n---\n\n{scorecard_md}\n", candidates
    
    return best_match, candidates


def _safe_parse_judge_json(text: str) -> dict | None:
    """Parse judge JSON, handling various formats."""
    if not text:
        return None
    raw = text.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(raw[start:end + 1])
        except json.JSONDecodeError:
            pass
    return None


def _format_scorecard(judge: dict, candidates: list[tuple[str, str]]) -> str:
    """Format judge scores as markdown table."""
    best = judge.get("best", "")
    why = judge.get("why", "")
    scores = judge.get("scores", {})
    
    lines = ["## Judge Scorecard", ""]
    if best:
        lines.append(f"**Best:** {best}")
    if why:
        lines.append(f"**Why:** {why}")
    lines.append("")
    lines.append("| Candidate | Specificity | Constructive | Voice | Actionability | Nonrepetition | Total |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|")
    
    for cid, _ in candidates:
        s = scores.get(cid, {})
        mark = " ✅" if cid == best else ""
        lines.append(
            f"| {cid}{mark} | {s.get('specificity', '')} | {s.get('constructive', '')} | "
            f"{s.get('voice', '')} | {s.get('actionability', '')} | {s.get('nonrepetition', '')} | {s.get('total', '')} |"
        )
    
    return "\n".join(lines)


# =============================================================================
# Output Management
# =============================================================================

def save_output(
    content: str,
    target_date: datetime.date,
    mode: Literal["insights", "ideas"],
    all_candidates: list[tuple[str, str]] | None = None,
) -> Path:
    """Save generated content to file."""
    config = MODE_CONFIG[mode]
    output_dir = config["output_dir"]
    output_dir.mkdir(parents=True, exist_ok=True)
    
    date_str = target_date.strftime("%Y-%m-%d")
    
    # Clean markdown code fences
    content = content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        if lines[0].strip() in ["```", "```markdown", "```md"]:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        content = "\n".join(lines)
    
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
    
    # Append all candidates section if multiple candidates were generated
    footer = ""
    if all_candidates and len(all_candidates) > 1:
        footer = "\n\n---\n\n## All Generated Candidates\n\n"
        for cid, candidate_text in all_candidates:
            footer += f"### {cid}\n\n{candidate_text}\n\n---\n\n"
    
    output_file.write_text(header + content + footer)
    return output_file


def save_aggregated_output(
    content: str,
    start_date: datetime.date,
    end_date: datetime.date,
    mode: Literal["insights", "ideas"],
    mode_name: str,
    *,
    total_conversations: int = 0,
    all_candidates: list[tuple[str, str]] | None = None,
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
    
    # Append all candidates section if multiple candidates were generated
    footer = ""
    if all_candidates and len(all_candidates) > 1:
        footer = "\n\n---\n\n## All Generated Candidates\n\n"
        for cid, candidate_text in all_candidates:
            footer += f"### {cid}\n\n{candidate_text}\n\n---\n\n"
    
    output_file.write_text(header + content + footer)
    return output_file


# =============================================================================
# Bank Harmonization
# =============================================================================

def harmonize_all_outputs(mode: Literal["insights", "ideas"], llm: LLMProvider, batch_size: int = 5) -> int:
    """
    Harmonize all output files into the unified ItemsBank (v1), then delete them.
    Returns number of files processed.
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
    
    processed = 0
    items_added_count = 0
    
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
            items.extend(parsed_items)
        
        if items:
            # Use v1 ItemsBank system
            bank = ItemsBank()
            
            for item in items:
                # Convert item format to ItemsBank format
                content_dict = {}
                if mode == "insights":
                    content_dict = {
                        "title": item.get("title", ""),
                        "hook": item.get("hook", ""),
                        "insight": item.get("key_insight", ""),
                        "takeaway": item.get("takeaway", ""),
                    }
                else:  # ideas
                    content_dict = {
                        "title": item.get("title", ""),
                        "problem": item.get("problem", ""),
                        "solution": item.get("solution", ""),
                        "context": item.get("context", ""),
                    }
                
                bank.add_item(
                    mode=mode_id,
                    theme=theme_id,
                    content=content_dict,
                )
                items_added_count += 1
            
            bank.save()
            print(f"📊 Added {len(items)} item(s) to unified Items Bank")
        
        for f in batch:
            f.unlink()
            print(f"   🗑️  Deleted: {f.name}")
        processed += len(batch)
    
    # Generate categories after harmonization
    if items_added_count > 0:
        print(f"\n📂 Generating categories for {mode_id} mode...")
        bank = ItemsBank()
        categories = bank.generate_categories(mode=mode_id, similarity_threshold=0.75)
        bank.save()
        print(f"✅ Created/updated {len(categories)} categor{'y' if len(categories) == 1 else 'ies'}")
    
    return processed


def _parse_output(content: str, mode: Literal["insights", "ideas"]) -> list[dict[str, Any]]:
    """Parse output file into structured format based on mode."""
    items = []
    
    # Parse the main/best output (before "## All Generated Candidates")
    main_section = content.split("## All Generated Candidates")[0]
    
    if mode == "insights":
        # Extract all post sections from main content
        post_pattern = r'^## Post \d+:\s*(.+?)(?=^## |\Z)'
        for match in re.finditer(post_pattern, main_section, re.MULTILINE | re.DOTALL):
            item = {}
            item["title"] = match.group(1).strip().split('\n')[0]
            
            post_content = match.group(0)
            patterns = {
                "hook": r'\*\*Hook:?\*\*[:\s]*(.+?)(?=\*\*|$)',
                "key_insight": r'\*\*(?:Key )?Insight:?\*\*[:\s]*(.+?)(?=\*\*|$)',
                "takeaway": r'\*\*Takeaway:?\*\*[:\s]*(.+?)(?=\*\*|$)',
            }
            
            for key, pattern in patterns.items():
                pattern_match = re.search(pattern, post_content, re.DOTALL | re.IGNORECASE)
                if pattern_match:
                    item[key] = pattern_match.group(1).strip()
            
            if item.get("title"):
                items.append(item)
        
        # Parse all candidates section if it exists
        if "## All Generated Candidates" in content:
            candidates_section = content.split("## All Generated Candidates")[1]
            candidate_pattern = r'^### (C\d+)\s*\n\n(.+?)(?=^### |\Z)'
            for match in re.finditer(candidate_pattern, candidates_section, re.MULTILINE | re.DOTALL):
                candidate_id = match.group(1)
                candidate_text = match.group(2).strip()
                
                # Parse candidate text for posts
                for post_match in re.finditer(post_pattern, candidate_text, re.MULTILINE | re.DOTALL):
                    item = {}
                    item["title"] = post_match.group(1).strip().split('\n')[0]
                    item["candidate_id"] = candidate_id
                    
                    post_content = post_match.group(0)
                    patterns = {
                        "hook": r'\*\*Hook:?\*\*[:\s]*(.+?)(?=\*\*|$)',
                        "key_insight": r'\*\*(?:Key )?Insight:?\*\*[:\s]*(.+?)(?=\*\*|$)',
                        "takeaway": r'\*\*Takeaway:?\*\*[:\s]*(.+?)(?=\*\*|$)',
                    }
                    
                    for key, pattern in patterns.items():
                        pattern_match = re.search(pattern, post_content, re.DOTALL | re.IGNORECASE)
                        if pattern_match:
                            item[key] = pattern_match.group(1).strip()
                    
                    if item.get("title"):
                        items.append(item)
    
    else:  # ideas mode
        # Extract all idea sections from main content
        idea_pattern = r'^## Idea \d+:\s*(.+?)(?=^## |\Z)'
        for match in re.finditer(idea_pattern, main_section, re.MULTILINE | re.DOTALL):
            item = {}
            item["title"] = match.group(1).strip().split('\n')[0]
            
            idea_content = match.group(0)
            patterns = {
                "problem": r'\*\*Problem:?\*\*[:\s]*(.+?)(?=\*\*|$)',
                "solution": r'\*\*Solution:?\*\*[:\s]*(.+?)(?=\*\*|$)',
                "context": r'\*\*Why It Matters:?\*\*[:\s]*(.+?)(?=\*\*|$)',
            }
            
            for key, pattern in patterns.items():
                pattern_match = re.search(pattern, idea_content, re.DOTALL | re.IGNORECASE)
                if pattern_match:
                    item[key] = pattern_match.group(1).strip()
            
            if item.get("title"):
                items.append(item)
        
        # Parse all candidates section if it exists
        if "## All Generated Candidates" in content:
            candidates_section = content.split("## All Generated Candidates")[1]
            candidate_pattern = r'^### (C\d+)\s*\n\n(.+?)(?=^### |\Z)'
            for match in re.finditer(candidate_pattern, candidates_section, re.MULTILINE | re.DOTALL):
                candidate_id = match.group(1)
                candidate_text = match.group(2).strip()
                
                # Parse candidate text for ideas
                for idea_match in re.finditer(idea_pattern, candidate_text, re.MULTILINE | re.DOTALL):
                    item = {}
                    item["title"] = idea_match.group(1).strip().split('\n')[0]
                    item["candidate_id"] = candidate_id
                    
                    idea_content = idea_match.group(0)
                    patterns = {
                        "problem": r'\*\*Problem:?\*\*[:\s]*(.+?)(?=\*\*|$)',
                        "solution": r'\*\*Solution:?\*\*[:\s]*(.+?)(?=\*\*|$)',
                        "context": r'\*\*Why It Matters:?\*\*[:\s]*(.+?)(?=\*\*|$)',
                    }
                    
                    for key, pattern in patterns.items():
                        pattern_match = re.search(pattern, idea_content, re.DOTALL | re.IGNORECASE)
                        if pattern_match:
                            item[key] = pattern_match.group(1).strip()
                    
                    if item.get("title"):
                        items.append(item)
    
    return items


# =============================================================================
# Status Sync (Mode-Specific)
# =============================================================================

def sync_posted_status(llm: LLMProvider, dry_run: bool = False) -> int:
    """
    Sync insight bank with LinkedIn posts to mark insights as posted (insights mode only).
    Uses unified ItemsBank (v1) with folder-based tracking.
    Returns number of insights marked as posted.
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
    return sync_implemented_status_from_folder(
        folder_path=posts_dir,
        mode="insight",
        similarity_threshold=0.75,
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
    return sync_implemented_status_from_folder(
        folder_path=folder_path,
        mode="idea",
        similarity_threshold=0.75,
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
    """
    try:
        from common.vector_db import get_supabase_client, get_conversations_from_vector_db
        from common.semantic_search import search_messages
        
        # Try Vector DB semantic search first
        if get_supabase_client():
            # Calculate timestamp range
            start_datetime = datetime.combine(target_date, datetime.min.time())
            end_datetime = datetime.combine(target_date + timedelta(days=1), datetime.min.time())
            start_ts = int(start_datetime.timestamp() * 1000)
            end_ts = int(end_datetime.timestamp() * 1000)
            
            # Mode-specific search queries
            if mode == "insights":
                search_queries = [
                    "What did I learn today?",
                    "What problems did I solve?",
                    "What decisions did I make?",
                    "What patterns did I notice?",
                    "What insights came up?",
                ]
            else:  # ideas
                search_queries = [
                    "What should I build?",
                    "What problems need solving?",
                    "What tools would be useful?",
                    "What features should I add?",
                    "What prototypes could I make?",
                ]
            
            # Collect unique chat_ids from semantic search
            relevant_chat_ids: set[tuple[str, str, str]] = set()  # (workspace, chat_id, chat_type)
            
            for query in search_queries:
                matches = search_messages(
                    query,
                    messages=[],  # Empty - will use Vector DB
                    top_k=top_k // len(search_queries) + 1,  # Distribute top_k across queries
                    min_similarity=0.3,  # Lower threshold to cast wider net
                    context_messages=0,  # Don't need context for grouping
                    use_vector_db=True,
                    start_timestamp=start_ts,
                    end_timestamp=end_ts,
                    workspace_paths=workspace_paths,
                )
                
                # Collect chat_ids from matches
                for match in matches:
                    chat_id = match.get("chat_id", "unknown")
                    workspace = match.get("workspace", "Unknown")
                    chat_type = match.get("chat_type", "unknown")
                    relevant_chat_ids.add((workspace, chat_id, chat_type))
            
            if relevant_chat_ids:
                # Fetch FULL conversations for these chat_ids from Vector DB
                print(f"🔍 Found {len(relevant_chat_ids)} relevant conversations via semantic search", file=sys.stderr)
                print(f"📥 Fetching full conversations from Vector DB...", file=sys.stderr)
                
                # Get all messages in date range, then filter to relevant conversations
                all_conversations = get_conversations_from_vector_db(
                    target_date,
                    target_date,
                    workspace_paths=workspace_paths,
                )
                
                # Filter to only relevant conversations
                filtered_conversations = []
                for conv in all_conversations:
                    conv_key = (conv.get("workspace", "Unknown"), conv.get("chat_id", "unknown"), conv.get("chat_type", "unknown"))
                    if conv_key in relevant_chat_ids:
                        filtered_conversations.append(conv)
                
                if filtered_conversations:
                    print(f"✅ Using {len(filtered_conversations)} relevant conversations (instead of {len(all_conversations)} total)", file=sys.stderr)
                    return filtered_conversations
            
            # If semantic search found nothing, return empty
            print(f"⚠️  Semantic search found no matches", file=sys.stderr)
            return []
    except Exception as e:
        print(f"⚠️  Semantic search failed: {e}", file=sys.stderr)
        raise RuntimeError(
            f"Failed to retrieve conversations from Vector DB: {e}\n"
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
    best_of: int = 1,
    rerank: bool = True,
) -> dict:
    """Process a single date and return results."""
    # Use semantic search to find relevant conversations
    conversations = _get_relevant_conversations(target_date, mode, workspace_paths=None)
    
    config = MODE_CONFIG[mode]
    has_output_key = "has_posts" if mode == "insights" else "has_ideas"
    
    if not conversations:
        return {"date": target_date, "conversations": 0, has_output_key: False, "output_file": None}
    
    conversations_text = format_conversations_for_prompt(conversations)
    
    # Optional prompt compression for cost savings
    app_config = load_config()
    llm_config = app_config.get("llm", {})
    compression_config = llm_config.get("promptCompression", {})
    if compression_config.get("enabled", False):
        from common.prompt_compression import compress_conversations
        threshold = compression_config.get("threshold", 10000)
        compression_model = compression_config.get("compressionModel", "gpt-3.5-turbo")
        conversations_text = compress_conversations(
            conversations_text,
            llm=None,  # Will create compression LLM from config
            threshold=threshold,
            compression_model=compression_model,
        )
    
    if verbose:
        print(f"\n--- {target_date} Conversations ---")
        print(conversations_text[:1000])
        print("... (truncated)\n")
    
    if dry_run:
        return {"date": target_date, "conversations": len(conversations), has_output_key: False, "output_file": None}
    
    content, all_candidates = generate_content(
        conversations_text,
        mode,
        llm=llm,
        temperature=temperature,
        best_of=best_of,
        rerank=rerank,
    )
    
    output_file = save_output(content, target_date, mode, all_candidates)
    has_output = config["has_output_check"](content)
    
    return {
        "date": target_date,
        "conversations": len(conversations),
        has_output_key: has_output,
        "output_file": output_file,
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
    best_of: int = 1,
    rerank: bool = True,
) -> dict:
    """Process a date range with aggregated output."""
    # MVP: Search ALL workspaces regardless of config (non-negotiable)
    all_conversations = []
    days_with_activity = 0
    
    print(f"📥 Collecting relevant conversations from {len(dates)} days (using semantic search)...")
    for i, date in enumerate(dates):
        conversations = _get_relevant_conversations(date, mode, workspace_paths=None)
        if conversations:
            days_with_activity += 1
            for conv in conversations:
                conv["source_date"] = str(date)
            all_conversations.extend(conversations)
        if (i + 1) % 7 == 0 or i == len(dates) - 1:
            print(f"   [{i+1}/{len(dates)}] {len(all_conversations)} conversations so far...")
    
    print(f"✅ Found {len(all_conversations)} conversations across {days_with_activity} active days")
    print(f"📊 Conversations analyzed: {len(all_conversations)}")
    
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
    
    conversations_text = format_conversations_for_prompt(all_conversations)
    
    # Optional prompt compression for cost savings
    app_config = load_config()
    llm_config = app_config.get("llm", {})
    compression_config = llm_config.get("promptCompression", {})
    if compression_config.get("enabled", False):
        from common.prompt_compression import compress_conversations
        threshold = compression_config.get("threshold", 10000)
        compression_model = compression_config.get("compressionModel", "gpt-3.5-turbo")
        conversations_text = compress_conversations(
            conversations_text,
            llm=None,  # Will create compression LLM from config
            threshold=threshold,
            compression_model=compression_model,
        )
    
    if dry_run:
        return {
            "start_date": dates[0],
            "end_date": dates[-1],
            "total_conversations": len(all_conversations),
            "days_with_activity": days_with_activity,
            has_output_key: False,
            "output_file": None,
        }
    
    print(f"🧠 Generating {mode} (best-of {best_of}, temp {temperature})...")
    content, all_candidates = generate_content(
        conversations_text,
        mode,
        llm=llm,
        temperature=temperature,
        best_of=best_of,
        rerank=rerank,
    )
    
    output_file = save_aggregated_output(
        content,
        dates[0],
        dates[-1],
        mode,
        mode_name,
        total_conversations=len(all_conversations),
        all_candidates=all_candidates,
    )
    
    has_output = config["has_output_check"](content)
    
    return {
        "start_date": dates[0],
        "end_date": dates[-1],
        "total_conversations": len(all_conversations),
        "days_with_activity": days_with_activity,
        has_output_key: has_output,
        "output_file": output_file,
    }


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Generate insights (LinkedIn posts) or ideas (prototype briefs) from Cursor chat history",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    
    # Mode selection (required)
    parser.add_argument(
        "--mode",
        choices=["insights", "ideas"],
        required=True,
        help="Generation mode: 'insights' for LinkedIn posts, 'ideas' for prototype briefs",
    )
    
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument("--daily", action="store_true", help="Daily mode: 1 day, best-of 3")
    mode_group.add_argument("--sprint", action="store_true", help="Sprint mode: 2 weeks, best-of 5")
    mode_group.add_argument("--month", action="store_true", help="Month mode: 4 weeks, best-of 10")
    mode_group.add_argument("--quarter", action="store_true", help="Quarter mode: 6 weeks, best-of 15")
    
    parser.add_argument("--date", type=str, help="Single date (YYYY-MM-DD)")
    parser.add_argument("--days", type=int, help="Process last N days")
    parser.add_argument("--dry-run", action="store_true", help="Extract chats but don't generate")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--temperature", type=float, default=None)
    parser.add_argument("--best-of", dest="best_of", type=int, default=None)
    
    args = parser.parse_args()
    
    mode: Literal["insights", "ideas"] = args.mode
    
    MODE_PRESETS = {
        "daily": (1, 3, 0.3),
        "sprint": (14, 5, 0.4),
        "month": (28, 10, 0.5),
        "quarter": (42, 15, 0.5),
    }
    
    mode_days, mode_best_of, mode_temperature = None, 1, DEFAULT_TEMPERATURE
    mode_name = None
    use_aggregated = False
    
    if args.daily:
        mode_days, mode_best_of, mode_temperature = MODE_PRESETS["daily"]
        mode_name = "daily"
    elif args.sprint:
        mode_days, mode_best_of, mode_temperature = MODE_PRESETS["sprint"]
        mode_name = "sprint"
        use_aggregated = True
    elif args.month:
        mode_days, mode_best_of, mode_temperature = MODE_PRESETS["month"]
        mode_name = "month"
        use_aggregated = True
    elif args.quarter:
        mode_days, mode_best_of, mode_temperature = MODE_PRESETS["quarter"]
        mode_name = "quarter"
        use_aggregated = True
    
    if args.best_of is None:
        args.best_of = mode_best_of
    if args.temperature is None:
        args.temperature = mode_temperature
    
    today = datetime.now().date()
    dates_to_process = []
    
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
    
    print(f"📅 Processing: {dates_to_process[0]} to {dates_to_process[-1]} ({mode} mode)")
    
    llm_config = get_llm_config()
    llm = create_llm(llm_config)
    
    print(f"🤖 LLM: {llm.provider} ({llm.model})")
    
    if use_aggregated and mode_name:
        result = process_aggregated_range(
            dates_to_process,
            mode,
            mode_name,
            llm=llm,
            dry_run=args.dry_run,
            verbose=args.verbose,
            temperature=args.temperature,
            best_of=args.best_of,
        )
        
        has_output_key = "has_posts" if mode == "insights" else "has_ideas"
        output_label = "Posts ✅" if mode == "insights" else "Ideas ✅"
        
        print(f"\n📊 SUMMARY:")
        print(f"   Conversations analyzed: {result['total_conversations']}")
        print(f"   Days with activity: {result['days_with_activity']}")
        print(f"   Output: {output_label if result[has_output_key] else 'No output ❌'}")
        
        if result["output_file"] and not args.dry_run:
            print(f"📄 Output: {result['output_file']}")
            harmonize_all_outputs(mode, llm)
            if mode == "insights":
                sync_posted_status(llm)
            else:
                sync_solved_status(llm)
    else:
        for date in dates_to_process:
            result = process_single_date(
                date,
                mode,
                llm=llm,
                dry_run=args.dry_run,
                verbose=args.verbose,
                temperature=args.temperature,
                best_of=args.best_of,
            )
            has_output_key = "has_posts" if mode == "insights" else "has_ideas"
            output_icon = "✅" if result[has_output_key] else "❌"
            print(f"{output_icon} {date}: {result['conversations']} conversations")
        
        if not args.dry_run:
            harmonize_all_outputs(mode, llm)
            if mode == "insights":
                sync_posted_status(llm)
            else:
                sync_solved_status(llm)
    
    return 0


if __name__ == "__main__":
    exit(main())

