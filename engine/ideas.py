#!/usr/bin/env python3
"""
Inspiration Engine — Idea Generation

Extract patterns from Cursor chat history and generate buildable idea briefs.
"""

import argparse
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

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
    load_bank,
    save_bank,
    harmonize_into_bank,
    LLMProvider,
    DEFAULT_ANTHROPIC_MODEL,
)

# Load environment on import
load_env_file()

# =============================================================================
# Configuration
# =============================================================================

PROMPTS_DIR = Path(__file__).parent / "prompts"
OUTPUT_DIR = get_data_dir() / "ideas_output"

# Default generation settings
DEFAULT_TEMPERATURE = 0.2
DEFAULT_TOP_P = 1.0
DEFAULT_BEST_OF = 1


# =============================================================================
# Prompt Loading (with caching)
# =============================================================================

# In-memory cache for prompt templates
_prompt_cache: dict[str, str] = {}
_prompt_file_mtimes: dict[str, float] = {}


def load_synthesize_prompt() -> str:
    """Load the idea synthesis prompt (cached)."""
    prompt_name = "ideas_synthesize"
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
    
    return "Generate 3 idea briefs from the following Cursor chat history."


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


# =============================================================================
# Idea Generation
# =============================================================================

def generate_ideas(
    conversations_text: str,
    *,
    llm: LLMProvider,
    max_tokens: int = 2000,
    temperature: float = DEFAULT_TEMPERATURE,
    best_of: int = 1,
    rerank: bool = True,
    include_scorecard: bool = True,
) -> tuple[str, list[tuple[str, str]]]:
    """
    Generate idea briefs from conversation text.
    
    Args:
        conversations_text: Formatted conversation history
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
    system_prompt = load_synthesize_prompt()
    user_content_base = f"Here are today's Cursor chat conversations:\n\n{conversations_text}"
    
    # Multiple candidates with reranking - generate in parallel for speed
    candidates = []
    if best_of <= 1:
        # Single generation (deterministic) - no parallelization needed
        candidate_id = "C1"
        text = llm.generate(
            user_content_base,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        candidates.append((candidate_id, text))
    else:
        # Generate candidates in parallel
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
    # Try extracting JSON object
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


def _has_ideas(text: str) -> bool:
    """Check if output contains generated ideas."""
    return "## Idea 1:" in (text or "")


# =============================================================================
# Output Management
# =============================================================================

def save_output(content: str, target_date: datetime.date, all_candidates: list[tuple[str, str]] | None = None) -> Path:
    """Save generated ideas to file."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
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
    
    has_ideas = _has_ideas(content)
    suffix = ".md" if has_ideas else "-no-ideas.md"
    output_file = OUTPUT_DIR / f"{date_str}{suffix}"
    
    # Remove alternate file if exists
    alt_suffix = "-no-ideas.md" if has_ideas else ".md"
    alt_file = OUTPUT_DIR / f"{date_str}{alt_suffix}"
    if alt_file.exists():
        alt_file.unlink()
    
    # Get workspaces for header
    workspaces = get_workspaces()
    
    header = f"""# Daily Ideas — {date_str}

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
    mode_name: str,
    *,
    total_conversations: int = 0,
    all_candidates: list[tuple[str, str]] | None = None,
) -> Path:
    """Save aggregated output for multi-day runs."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    
    # Clean code fences
    content = content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        if lines[0].strip() in ["```", "```markdown", "```md"]:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        content = "\n".join(lines)
    
    has_ideas = _has_ideas(content)
    suffix = ".judge.md" if has_ideas else ".judge-no-idea.md"
    output_file = OUTPUT_DIR / f"{mode_name}_{start_str}_to_{end_str}{suffix}"
    
    workspaces = get_workspaces()
    
    header = f"""# {mode_name.title()} Ideas — {start_str} to {end_str}

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

def harmonize_all_outputs(llm: LLMProvider, batch_size: int = 5) -> int:
    """
    Harmonize all output files into the bank, then delete them.
    Returns number of files processed.
    """
    if not OUTPUT_DIR.exists():
        return 0
    
    output_files = sorted(OUTPUT_DIR.glob("*.md"))
    if not output_files:
        return 0
    
    total_files = len(output_files)
    print(f"\n📦 Harmonizing {total_files} output file(s) into Idea Bank...")
    
    processed = 0
    for i in range(0, total_files, batch_size):
        batch = output_files[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (total_files + batch_size - 1) // batch_size
        
        if total_batches > 1:
            print(f"   Batch {batch_num}/{total_batches}: {len(batch)} files...")
        
        # Collect content
        items = []
        for f in batch:
            content = f.read_text()
            # Parse ideas from content (now returns a list)
            parsed_items = _parse_idea_output(content)
            items.extend(parsed_items)
        
        if items:
            # Harmonize batch
            current_bank = load_bank("idea")
            updated_bank, harmonization_stats = harmonize_into_bank("idea", items, llm)
            save_bank("idea", updated_bank)
            print(f"📊 Harmonization Stats: {harmonization_stats['items_processed']} processed, "
                  f"{harmonization_stats['items_added']} added, "
                  f"{harmonization_stats['items_updated']} updated, "
                  f"{harmonization_stats['items_deduplicated']} deduplicated")
        
        # Delete processed files
        for f in batch:
            f.unlink()
            print(f"   🗑️  Deleted: {f.name}")
        processed += len(batch)
    
    return processed


def _parse_idea_output(content: str) -> list[dict[str, Any]]:
    """Parse idea output file into structured format.
    
    Returns a list of items - one for the best match and one for each candidate.
    """
    items = []
    
    # Parse the main/best output (before "## All Generated Candidates")
    main_section = content.split("## All Generated Candidates")[0]
    
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
        # Extract each candidate (### C1, ### C2, etc.)
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
    
    # If no structured items found, return empty list (not None)
    return items


# =============================================================================
# Solved Status Sync
# =============================================================================

def sync_solved_status(llm: LLMProvider, dry_run: bool = False) -> int:
    """
    Sync idea bank with workspace projects to mark ideas as solved.
    Returns number of ideas with updated status.
    """
    if not is_feature_enabled("solvedStatusSync"):
        return 0
    
    bank_entries = load_bank("idea")
    if not bank_entries:
        print("📭 No ideas in bank to check")
        return 0
    
    print(f"\n🔍 Checking {len(bank_entries)} idea(s) against workspace projects...")
    
    # Get workspace summary
    workspaces = get_workspaces()
    projects_summary = _get_projects_summary(workspaces)
    
    updated_count = 0
    
    for idea in bank_entries:
        # Skip already solved
        if idea.get("solved") == "fully_solved":
            continue
        
        prompt = f"""Check if this idea has been solved by existing projects:

IDEA:
Title: {idea.get('title', '')}
Problem: {idea.get('problem', '')}
Solution: {idea.get('solution', '')}

EXISTING PROJECTS:
{projects_summary}

Return JSON: {{"solved": "fully_solved"|"partially_solved"|"unsolved", "matched_project": "name"|null, "reason": "..."}}"""

        try:
            result = llm.generate(prompt, max_tokens=500, temperature=0.0)
            
            # Parse result
            json_match = re.search(r'\{[\s\S]*\}', result)
            if json_match:
                data = json.loads(json_match.group())
                new_status = data.get("solved", "unsolved")
                
                if new_status != "unsolved" and new_status != idea.get("solved"):
                    if not dry_run:
                        idea["solved"] = new_status
                        idea["solved_date"] = datetime.now().strftime("%Y-%m-%d")
                        idea["solved_file"] = data.get("matched_project", "")
                        updated_count += 1
                    
                    icon = "✅" if new_status == "fully_solved" else "🔶"
                    print(f"   {icon} {idea.get('title', 'Untitled')}: {new_status}")
        
        except Exception as e:
            print(f"   ⚠️  Failed to check idea: {e}")
    
    if updated_count > 0 and not dry_run:
        save_bank("idea", bank_entries)
        print(f"\n📄 Updated {updated_count} idea(s) with solved status")
    
    return updated_count


def _get_projects_summary(workspaces: list[str]) -> str:
    """Get a summary of projects in workspaces."""
    summaries = []
    
    for workspace in workspaces:
        workspace_path = Path(workspace)
        if not workspace_path.exists():
            continue
        
        for item in sorted(workspace_path.iterdir()):
            if item.name.startswith(('.', '_')) or item.name in ['node_modules', 'OtherBuilders']:
                continue
            
            if item.is_dir():
                desc = ""
                for doc in ['CLAUDE.md', 'README.md', 'Plan.md']:
                    doc_path = item / doc
                    if doc_path.exists():
                        content = doc_path.read_text()[:500]
                        for line in content.split('\n'):
                            line = line.strip()
                            if line and not line.startswith('#') and len(line) > 20:
                                desc = line[:100]
                                break
                        if desc:
                            break
                
                summaries.append(f"- {item.name}: {desc}" if desc else f"- {item.name}")
    
    return "\n".join(summaries) if summaries else "(No projects found)"


# =============================================================================
# Main Processing
# =============================================================================

def process_single_date(
    target_date: datetime.date,
    *,
    llm: LLMProvider,
    dry_run: bool = False,
    verbose: bool = False,
    temperature: float = DEFAULT_TEMPERATURE,
    best_of: int = 1,
    rerank: bool = True,
) -> dict:
    """Process a single date and return results."""
    # MVP: Search ALL workspaces regardless of config (non-negotiable)
    conversations = get_conversations_for_date(target_date, workspace_paths=None)
    
    if not conversations:
        return {"date": target_date, "conversations": 0, "has_ideas": False, "output_file": None}
    
    conversations_text = format_conversations_for_prompt(conversations)
    
    if verbose:
        print(f"\n--- {target_date} Conversations ---")
        print(conversations_text[:1000])
        print("... (truncated)\n")
    
    if dry_run:
        return {"date": target_date, "conversations": len(conversations), "has_ideas": False, "output_file": None}
    
    ideas, all_candidates = generate_ideas(
        conversations_text,
        llm=llm,
        temperature=temperature,
        best_of=best_of,
        rerank=rerank,
    )
    
    output_file = save_output(ideas, target_date, all_candidates)
    has_ideas = _has_ideas(ideas)
    
    return {
        "date": target_date,
        "conversations": len(conversations),
        "has_ideas": has_ideas,
        "output_file": output_file,
    }


def process_aggregated_range(
    dates: list[datetime.date],
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
    
    print(f"📥 Collecting conversations from {len(dates)} days...")
    for i, date in enumerate(dates):
        conversations = get_conversations_for_date(date, workspace_paths=None)
        if conversations:
            days_with_activity += 1
            for conv in conversations:
                conv["source_date"] = str(date)
            all_conversations.extend(conversations)
        if (i + 1) % 7 == 0 or i == len(dates) - 1:
            print(f"   [{i+1}/{len(dates)}] {len(all_conversations)} conversations so far...")
    
    print(f"✅ Found {len(all_conversations)} conversations across {days_with_activity} active days")
    print(f"📊 Conversations analyzed: {len(all_conversations)}")
    
    if not all_conversations:
        return {
            "start_date": dates[0] if dates else None,
            "end_date": dates[-1] if dates else None,
            "total_conversations": 0,
            "days_with_activity": 0,
            "has_ideas": False,
            "output_file": None,
        }
    
    conversations_text = format_conversations_for_prompt(all_conversations)
    
    # Optional prompt compression for cost savings
    config = load_config()
    llm_config = config.get("llm", {})
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
            "has_ideas": False,
            "output_file": None,
        }
    
    print(f"🧠 Generating ideas (best-of {best_of}, temp {temperature})...")
    ideas, all_candidates = generate_ideas(
        conversations_text,
        llm=llm,
        temperature=temperature,
        best_of=best_of,
        rerank=rerank,
    )
    
    output_file = save_aggregated_output(
        ideas,
        dates[0],
        dates[-1],
        mode_name,
        total_conversations=len(all_conversations),
        all_candidates=all_candidates,
    )
    
    return {
        "start_date": dates[0],
        "end_date": dates[-1],
        "total_conversations": len(all_conversations),
        "days_with_activity": days_with_activity,
        "has_ideas": _has_ideas(ideas),
        "output_file": output_file,
    }


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Generate idea briefs from Cursor chat history",
        formatter_class=argparse.RawDescriptionHelpFormatter,
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
    
    # Mode presets
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
    
    # Apply defaults
    if args.best_of is None:
        args.best_of = mode_best_of
    if args.temperature is None:
        args.temperature = mode_temperature
    
    # Determine dates
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
    
    print(f"📅 Processing: {dates_to_process[0]} to {dates_to_process[-1]}")
    
    # Create LLM
    llm_config = get_llm_config()
    llm = create_llm(llm_config)
    
    print(f"🤖 LLM: {llm.provider} ({llm.model})")
    
    # Process
    if use_aggregated and mode_name:
        result = process_aggregated_range(
            dates_to_process,
            mode_name,
            llm=llm,
            dry_run=args.dry_run,
            verbose=args.verbose,
            temperature=args.temperature,
            best_of=args.best_of,
        )
        
        print(f"\n📊 SUMMARY: {result['total_conversations']} conversations, {'Ideas ✅' if result['has_ideas'] else 'No ideas ❌'}")
        
        if result["output_file"] and not args.dry_run:
            print(f"📄 Output: {result['output_file']}")
            harmonize_all_outputs(llm)
            sync_solved_status(llm)
    else:
        for date in dates_to_process:
            result = process_single_date(
                date,
                llm=llm,
                dry_run=args.dry_run,
                verbose=args.verbose,
                temperature=args.temperature,
                best_of=args.best_of,
            )
            print(f"{'✅' if result['has_ideas'] else '❌'} {date}: {result['conversations']} conversations")
        
        if not args.dry_run:
            harmonize_all_outputs(llm)
            sync_solved_status(llm)
    
    return 0


if __name__ == "__main__":
    exit(main())

