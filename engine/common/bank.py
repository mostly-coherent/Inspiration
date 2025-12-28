"""
Bank Management — Harmonize and manage idea/insight banks.
"""

import json
import re
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from .config import get_data_dir
from .llm import LLMProvider


BankType = Literal["idea", "insight"]


def get_harmonization_cache_path(bank_type: BankType) -> Path:
    """Get path to harmonization cache file."""
    return get_data_dir() / f"{bank_type}_harmonization_cache.json"


def get_item_hash(item: dict[str, Any]) -> str:
    """Generate hash for an item to track if it's been harmonized."""
    # Create a stable hash from item content
    content_str = json.dumps(item, sort_keys=True)
    return hashlib.sha256(content_str.encode()).hexdigest()


def load_harmonization_cache(bank_type: BankType) -> dict[str, Any]:
    """Load harmonization cache."""
    cache_path = get_harmonization_cache_path(bank_type)
    if cache_path.exists():
        try:
            with open(cache_path) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def save_harmonization_cache(bank_type: BankType, cache: dict[str, Any]) -> None:
    """Save harmonization cache."""
    cache_path = get_harmonization_cache_path(bank_type)
    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        with open(cache_path, "w") as f:
            json.dump(cache, f, indent=2)
    except IOError:
        pass  # Cache write failed, but harmonization can continue


def get_bank_paths(bank_type: BankType) -> tuple[Path, Path]:
    """
    Get paths for bank JSON and Markdown files.
    
    Args:
        bank_type: "idea" or "insight"
    
    Returns:
        Tuple of (json_path, md_path)
    """
    data_dir = get_data_dir()
    
    if bank_type == "idea":
        return data_dir / "idea_bank.json", data_dir / "IDEA_BANK.md"
    else:
        return data_dir / "insight_bank.json", data_dir / "INSIGHT_BANK.md"


def load_bank(bank_type: BankType) -> list[dict[str, Any]]:
    """
    Load bank from JSON file.
    
    Args:
        bank_type: "idea" or "insight"
    
    Returns:
        List of bank entries
    """
    json_path, _ = get_bank_paths(bank_type)
    
    if not json_path.exists():
        return []
    
    try:
        with open(json_path) as f:
            data = json.load(f)
            return data.get("entries", [])
    except (json.JSONDecodeError, IOError):
        return []


def save_bank(bank_type: BankType, entries: list[dict[str, Any]]) -> bool:
    """
    Save bank to JSON and generate Markdown.
    
    Args:
        bank_type: "idea" or "insight"
        entries: List of bank entries
    
    Returns:
        True if successful
    """
    json_path, md_path = get_bank_paths(bank_type)
    
    try:
        # Save JSON
        bank_data = {
            "version": 1,
            "type": bank_type,
            "entries": entries,
            "last_updated": datetime.now().isoformat(),
        }
        
        with open(json_path, "w") as f:
            json.dump(bank_data, f, indent=2)
        
        # Generate Markdown
        md_content = generate_bank_markdown(bank_type, entries)
        with open(md_path, "w") as f:
            f.write(md_content)
        
        return True
    
    except IOError as e:
        print(f"⚠️  Failed to save bank: {e}")
        return False


def generate_bank_markdown(bank_type: BankType, entries: list[dict[str, Any]]) -> str:
    """
    Generate human-readable Markdown from bank entries.
    
    Args:
        bank_type: "idea" or "insight"
        entries: List of bank entries
    
    Returns:
        Markdown content
    """
    if bank_type == "idea":
        return _generate_idea_bank_md(entries)
    else:
        return _generate_insight_bank_md(entries)


def _generate_idea_bank_md(entries: list[dict[str, Any]]) -> str:
    """Generate Markdown for idea bank."""
    lines = ["# 💡 Idea Bank", ""]
    
    # Count by status
    unsolved = [e for e in entries if e.get("solved") == "unsolved"]
    partial = [e for e in entries if e.get("solved") == "partially_solved"]
    solved = [e for e in entries if e.get("solved") == "fully_solved"]
    
    lines.append(f"> **{len(entries)} ideas** — {len(unsolved)} unsolved, {len(partial)} in progress, {len(solved)} completed")
    lines.append("")
    lines.append("---")
    lines.append("")
    
    def format_idea(idea: dict, index: int) -> list[str]:
        result = []
        status = idea.get("solved", "unsolved")
        badge = "🔲" if status == "unsolved" else "🔶" if status == "partially_solved" else "✅"
        
        result.append(f"## {badge} {index}. {idea.get('title', 'Untitled')}")
        result.append("")
        
        if idea.get("problem"):
            result.append(f"**Problem:** {idea['problem']}")
            result.append("")
        
        if idea.get("solution"):
            result.append(f"**Solution:** {idea['solution']}")
            result.append("")
        
        if idea.get("context"):
            result.append(f"*Context: {idea['context']}*")
            result.append("")
        
        # Metadata
        meta = []
        if idea.get("occurrence_count", 1) > 1:
            meta.append(f"Seen {idea['occurrence_count']}x")
        if idea.get("last_updated"):
            meta.append(f"Updated: {idea['last_updated'][:10]}")
        if status == "fully_solved" and idea.get("solved_file"):
            meta.append(f"Solved in: {idea['solved_file']}")
        
        if meta:
            result.append(f"*{' | '.join(meta)}*")
            result.append("")
        
        result.append("---")
        result.append("")
        return result
    
    # Show unsolved first, then partial, then solved
    idx = 1
    if unsolved:
        lines.append("## 🔲 Unsolved Ideas")
        lines.append("")
        for idea in unsolved:
            lines.extend(format_idea(idea, idx))
            idx += 1
    
    if partial:
        lines.append("## 🔶 In Progress")
        lines.append("")
        for idea in partial:
            lines.extend(format_idea(idea, idx))
            idx += 1
    
    if solved:
        lines.append("## ✅ Completed")
        lines.append("")
        for idea in solved:
            lines.extend(format_idea(idea, idx))
            idx += 1
    
    return "\n".join(lines)


def _generate_insight_bank_md(entries: list[dict[str, Any]]) -> str:
    """Generate Markdown for insight bank."""
    lines = ["# 💬 Insight Bank", ""]
    
    # Count by status
    unshared = [e for e in entries if e.get("posted") == "unshared"]
    partial = [e for e in entries if e.get("posted") == "partially_shared"]
    shared = [e for e in entries if e.get("posted") == "fully_shared"]
    
    lines.append(f"> **{len(entries)} insights** — {len(unshared)} unshared, {len(partial)} partially shared, {len(shared)} shared")
    lines.append("")
    lines.append("---")
    lines.append("")
    
    def format_insight(insight: dict, index: int) -> list[str]:
        result = []
        status = insight.get("posted", "unshared")
        badge = "📝" if status == "unshared" else "📤" if status == "partially_shared" else "✅"
        
        result.append(f"## {badge} {index}. {insight.get('title', 'Untitled')}")
        result.append("")
        
        if insight.get("hook"):
            result.append(f"**Hook:** {insight['hook']}")
            result.append("")
        
        if insight.get("key_insight"):
            result.append(f"**Key Insight:** {insight['key_insight']}")
            result.append("")
        
        if insight.get("takeaway"):
            result.append(f"**Takeaway:** {insight['takeaway']}")
            result.append("")
        
        if insight.get("context"):
            result.append(f"*Context: {insight['context']}*")
            result.append("")
        
        # Metadata
        meta = []
        if insight.get("occurrence_count", 1) > 1:
            meta.append(f"Seen {insight['occurrence_count']}x")
        if insight.get("last_updated"):
            meta.append(f"Updated: {insight['last_updated'][:10]}")
        if status != "unshared" and insight.get("posted_file"):
            meta.append(f"Posted: {insight['posted_file']}")
        
        if meta:
            result.append(f"*{' | '.join(meta)}*")
            result.append("")
        
        result.append("---")
        result.append("")
        return result
    
    # Show unshared first, then partial, then shared
    idx = 1
    if unshared:
        lines.append("## 📝 Unshared Insights")
        lines.append("")
        for insight in unshared:
            lines.extend(format_insight(insight, idx))
            idx += 1
    
    if partial:
        lines.append("## 📤 Partially Shared")
        lines.append("")
        for insight in partial:
            lines.extend(format_insight(insight, idx))
            idx += 1
    
    if shared:
        lines.append("## ✅ Shared")
        lines.append("")
        for insight in shared:
            lines.extend(format_insight(insight, idx))
            idx += 1
    
    return "\n".join(lines)


def harmonize_into_bank(
    bank_type: BankType,
    new_items: list[dict[str, Any]],
    llm: LLMProvider,
    use_cache: bool = True,
    force_full: bool = False,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """
    Harmonize new items into an existing bank using LLM.
    
    Uses delta-based approach: LLM returns only changes to apply.
    Supports incremental harmonization with caching for cost optimization.
    
    Args:
        bank_type: "idea" or "insight"
        new_items: New items to harmonize
        llm: LLM provider for semantic matching
        use_cache: Whether to use cached harmonization results (default: True)
        force_full: Force full re-harmonization even if items are cached (default: False)
    
    Returns:
        Tuple of (updated bank entries, stats dict)
    """
    current_entries = load_bank(bank_type)
    
    if not new_items:
        return current_entries, {"items_processed": 0, "items_added": 0, "items_updated": 0, "items_deduplicated": 0}
    
    # Incremental harmonization: only process items not yet harmonized
    cached_count = 0
    if use_cache and not force_full:
        cache = load_harmonization_cache(bank_type)
        processed_hashes = set(cache.get("processed_hashes", []))
        
        # Filter out already-processed items
        items_to_process = []
        for item in new_items:
            item_hash = get_item_hash(item)
            if item_hash not in processed_hashes:
                items_to_process.append(item)
            else:
                cached_count += 1
                print(f"⏭️  Skipping already-harmonized item (hash: {item_hash[:8]}...)")
        
        if not items_to_process:
            print("✅ All items already harmonized (using cache)")
            return current_entries, {"items_processed": len(new_items), "items_added": 0, "items_updated": 0, "items_deduplicated": len(new_items)}
        
        print(f"📊 Processing {len(items_to_process)} new items (skipped {cached_count} cached)")
        new_items = items_to_process
    
    # Batch processing: handle large batches by chunking if needed
    # Estimate prompt size (rough heuristic: ~100 tokens per item)
    MAX_ITEMS_PER_BATCH = 20  # Conservative limit to avoid token limits
    updated_entries = current_entries
    total_stats = {"items_processed": len(new_items) + cached_count, "items_added": 0, "items_updated": 0, "items_deduplicated": cached_count}
    
    if len(new_items) > MAX_ITEMS_PER_BATCH:
        print(f"📦 Large batch detected ({len(new_items)} items), processing in chunks of {MAX_ITEMS_PER_BATCH}")
        # Process in chunks
        for i in range(0, len(new_items), MAX_ITEMS_PER_BATCH):
            chunk = new_items[i:i + MAX_ITEMS_PER_BATCH]
            print(f"   Processing chunk {i//MAX_ITEMS_PER_BATCH + 1}/{(len(new_items) + MAX_ITEMS_PER_BATCH - 1)//MAX_ITEMS_PER_BATCH} ({len(chunk)} items)")
            updated_entries, stats = _harmonize_batch(bank_type, updated_entries, chunk, llm, use_cache)
            total_stats["items_added"] += stats["items_added"]
            total_stats["items_updated"] += stats["items_updated"]
            total_stats["items_deduplicated"] += stats["items_deduplicated"]
    else:
        # Single batch (optimized path)
        updated_entries, stats = _harmonize_batch(bank_type, current_entries, new_items, llm, use_cache)
        total_stats["items_added"] += stats["items_added"]
        total_stats["items_updated"] += stats["items_updated"]
        total_stats["items_deduplicated"] += stats["items_deduplicated"]
    
    return updated_entries, total_stats


def _harmonize_batch(
    bank_type: BankType,
    current_entries: list[dict[str, Any]],
    new_items: list[dict[str, Any]],
    llm: LLMProvider,
    use_cache: bool,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """
    Internal function to harmonize a batch of items.
    Handles a single LLM call for the batch.
    """
    # Build prompt for delta-based harmonization
    if bank_type == "idea":
        prompt = _build_idea_harmonization_prompt(current_entries, new_items)
    else:
        prompt = _build_insight_harmonization_prompt(current_entries, new_items)
    
    system_prompt = """You are a content deduplication assistant. Your job is to compare new items against an existing bank and return ONLY the changes needed:

RULES:
1. If a new item is semantically similar to an existing one, output an UPDATE with merged content
2. If a new item is genuinely new, output a NEW entry
3. Preserve nuances and unique details from both items when merging
4. Return ONLY a JSON object with "changes" array
5. Process ALL new items in this batch

OUTPUT FORMAT (strict JSON):
{
  "changes": [
    {"action": "update", "id": 123, "merged": {...merged entry...}},
    {"action": "new", "entry": {...new entry...}}
  ]
}

If no changes needed, return: {"changes": []}"""

    try:
        result = llm.generate(prompt, system_prompt=system_prompt, max_tokens=4000)
        
        # Parse result
        json_match = re.search(r'\{[\s\S]*\}', result)
        if not json_match:
            print("⚠️  Failed to extract JSON from LLM response")
            return current_entries
        
        changes = json.loads(json_match.group())
        
        # Apply changes and collect stats
        changes_list = changes.get("changes", [])
        updated_entries = _apply_changes(current_entries, changes_list)
        
        # Count stats
        new_count = sum(1 for c in changes_list if c.get("action") == "new")
        update_count = sum(1 for c in changes_list if c.get("action") == "update")
        total_processed = len(new_items)
        
        # Update cache with processed items
        if use_cache:
            cache = load_harmonization_cache(bank_type)
            processed_hashes = set(cache.get("processed_hashes", []))
            
            # Add hashes of processed items
            for item in new_items:
                item_hash = get_item_hash(item)
                processed_hashes.add(item_hash)
            
            cache["processed_hashes"] = list(processed_hashes)
            cache["last_harmonization"] = datetime.now().isoformat()
            cache["total_processed"] = len(processed_hashes)
            save_harmonization_cache(bank_type, cache)
        
        # Return entries and stats
        stats = {
            "items_processed": total_processed,
            "items_added": new_count,
            "items_updated": update_count,
            "items_deduplicated": total_processed - new_count - update_count,
        }
        return updated_entries, stats
    
    except json.JSONDecodeError as e:
        print(f"⚠️  Failed to parse harmonization result: {e}")
        return current_entries, {"items_processed": len(new_items), "items_added": 0, "items_updated": 0, "items_deduplicated": 0}
    except Exception as e:
        print(f"⚠️  Harmonization error: {e}")
        return current_entries, {"items_processed": len(new_items), "items_added": 0, "items_updated": 0, "items_deduplicated": 0}


def _build_idea_harmonization_prompt(existing: list[dict], new_items: list[dict]) -> str:
    """Build prompt for idea harmonization."""
    lines = ["## Existing Ideas Bank:"]
    
    for i, idea in enumerate(existing):
        lines.append(f"[ID:{i}] Title: {idea.get('title', 'N/A')}")
        lines.append(f"  Problem: {idea.get('problem', 'N/A')}")
        lines.append(f"  Solution: {idea.get('solution', 'N/A')}")
        lines.append("")
    
    lines.append("## New Ideas to Harmonize:")
    for i, idea in enumerate(new_items):
        lines.append(f"[NEW:{i}] Title: {idea.get('title', 'N/A')}")
        lines.append(f"  Problem: {idea.get('problem', 'N/A')}")
        lines.append(f"  Solution: {idea.get('solution', 'N/A')}")
        lines.append("")
    
    lines.append("""
Analyze each new idea:
- If it's similar to an existing idea (ID:X), output UPDATE with merged content
- If it's genuinely new, output NEW entry

Required fields for ideas: title, problem, solution, context
Optional fields: occurrence_count (default 1), last_updated (ISO date)

Return only the JSON changes object.""")
    
    return "\n".join(lines)


def _build_insight_harmonization_prompt(existing: list[dict], new_items: list[dict]) -> str:
    """Build prompt for insight harmonization."""
    lines = ["## Existing Insights Bank:"]
    
    for i, insight in enumerate(existing):
        lines.append(f"[ID:{i}] Title: {insight.get('title', 'N/A')}")
        lines.append(f"  Hook: {insight.get('hook', 'N/A')}")
        lines.append(f"  Key Insight: {insight.get('key_insight', 'N/A')}")
        lines.append("")
    
    lines.append("## New Insights to Harmonize:")
    for i, insight in enumerate(new_items):
        lines.append(f"[NEW:{i}] Title: {insight.get('title', 'N/A')}")
        lines.append(f"  Hook: {insight.get('hook', 'N/A')}")
        lines.append(f"  Key Insight: {insight.get('key_insight', 'N/A')}")
        lines.append("")
    
    lines.append("""
Analyze each new insight:
- If it's similar to an existing insight (ID:X), output UPDATE with merged content
- If it's genuinely new, output NEW entry

Required fields for insights: title, hook, key_insight, takeaway, context
Optional fields: occurrence_count (default 1), last_updated (ISO date)

Return only the JSON changes object.""")
    
    return "\n".join(lines)


def _apply_changes(existing: list[dict], changes: list[dict]) -> list[dict]:
    """Apply delta changes to existing entries."""
    result = existing.copy()
    now = datetime.now().isoformat()
    
    for change in changes:
        action = change.get("action")
        
        if action == "update":
            idx = change.get("id", -1)
            if 0 <= idx < len(result):
                merged = change.get("merged", {})
                merged["last_updated"] = now
                merged["occurrence_count"] = result[idx].get("occurrence_count", 1) + 1
                # Preserve status fields
                for key in ["solved", "solved_date", "solved_file", "posted", "posted_date", "posted_file"]:
                    if key in result[idx] and key not in merged:
                        merged[key] = result[idx][key]
                result[idx] = merged
        
        elif action == "new":
            entry = change.get("entry", {})
            entry["last_updated"] = now
            entry["occurrence_count"] = 1
            result.append(entry)
    
    return result


def parse_output_file(file_path: Path, bank_type: BankType) -> dict[str, Any] | None:
    """
    Parse an output file into a structured item.
    
    Args:
        file_path: Path to output markdown file
        bank_type: "idea" or "insight"
    
    Returns:
        Parsed item dict or None if parsing fails
    """
    try:
        content = file_path.read_text()
        
        if bank_type == "idea":
            return _parse_idea_output(content)
        else:
            return _parse_insight_output(content)
    
    except IOError:
        return None


def _parse_idea_output(content: str) -> dict[str, Any] | None:
    """Parse idea output file."""
    item = {}
    
    # Extract title
    title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    if title_match:
        item["title"] = title_match.group(1).strip()
    
    # Extract sections
    sections = {
        "problem": r'\*\*Problem Statement\*\*[:\s]*(.+?)(?=\*\*|$)',
        "solution": r'\*\*Solution\*\*[:\s]*(.+?)(?=\*\*|$)',
        "context": r'\*\*Context\*\*[:\s]*(.+?)(?=\*\*|$)',
    }
    
    for key, pattern in sections.items():
        match = re.search(pattern, content, re.DOTALL | re.IGNORECASE)
        if match:
            item[key] = match.group(1).strip()
    
    return item if item.get("title") else None


def _parse_insight_output(content: str) -> dict[str, Any] | None:
    """Parse insight output file."""
    item = {}
    
    # Extract title
    title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    if title_match:
        item["title"] = title_match.group(1).strip()
    
    # Extract sections
    sections = {
        "hook": r'\*\*Hook\*\*[:\s]*(.+?)(?=\*\*|$)',
        "key_insight": r'\*\*Key Insight\*\*[:\s]*(.+?)(?=\*\*|$)',
        "takeaway": r'\*\*Takeaway\*\*[:\s]*(.+?)(?=\*\*|$)',
        "context": r'\*\*Context\*\*[:\s]*(.+?)(?=\*\*|$)',
    }
    
    for key, pattern in sections.items():
        match = re.search(pattern, content, re.DOTALL | re.IGNORECASE)
        if match:
            item[key] = match.group(1).strip()
    
    return item if item.get("title") else None

