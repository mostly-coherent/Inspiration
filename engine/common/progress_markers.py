"""
Progress Markers for Frontend Streaming

These markers are printed to stdout and can be parsed by the frontend
to show real-time progress during generation.

Format: [MARKER_TYPE:key=value,key2=value2]
Types:
  - PHASE: Current phase (confirming, searching, generating, deduplicating, ranking, integrating)
  - STAT: A numeric statistic to display
  - INFO: An informational message
  - ERROR: An error message with classification
  - PROGRESS: Intra-phase progress (e.g., "5 of 22")
  - TIMING: Phase timing for performance analysis
  - COST: Token usage and cost estimates
  - WARNING: Slow phase warnings
"""

import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any


# === Performance Logging ===
# All events are recorded to a JSON log file for post-run analysis

_run_id: str | None = None
_run_log: list[dict] = []
_phase_timers: dict[str, float] = {}
_total_tokens_in: int = 0
_total_tokens_out: int = 0
_total_cost: float = 0.0

# Slow phase thresholds (seconds) - warn if exceeded
SLOW_PHASE_THRESHOLDS = {
    "searching": 30,
    "generating": 120,
    "deduplicating": 30,
    "ranking": 60,
    "integrating": 60,
}


def _get_log_dir() -> Path:
    """Get the performance logs directory."""
    log_dir = Path(__file__).parent.parent.parent / "data" / "performance_logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir


def _log_event(event_type: str, data: dict[str, Any]) -> None:
    """Log an event with timestamp for performance analysis."""
    global _run_log
    event = {
        "timestamp": datetime.now().isoformat(),
        "elapsed_ms": int((time.time() - _phase_timers.get("_start", time.time())) * 1000),
        "type": event_type,
        **data,
    }
    _run_log.append(event)


def start_run(mode: str, item_count: int, days: int) -> str:
    """Start a new run and return the run ID."""
    global _run_id, _run_log, _phase_timers, _total_tokens_in, _total_tokens_out, _total_cost
    
    _run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    _run_log = []
    _phase_timers = {"_start": time.time()}
    _total_tokens_in = 0
    _total_tokens_out = 0
    _total_cost = 0.0
    
    _log_event("run_start", {
        "run_id": _run_id,
        "mode": mode,
        "item_count": item_count,
        "days": days,
    })
    
    return _run_id


def end_run(success: bool = True, error: str | None = None) -> dict:
    """End the run and save the performance log. Returns summary stats."""
    global _run_id, _run_log
    
    if not _run_id:
        return {}
    
    total_elapsed = time.time() - _phase_timers.get("_start", time.time())
    
    summary = {
        "run_id": _run_id,
        "success": success,
        "error": error,
        "total_elapsed_seconds": round(total_elapsed, 2),
        "total_tokens_in": _total_tokens_in,
        "total_tokens_out": _total_tokens_out,
        "total_cost_usd": round(_total_cost, 4),
        "phase_timings": {},
    }
    
    # Calculate phase timings from log
    phase_starts = {}
    phase_ends = {}
    for event in _run_log:
        if event["type"] == "phase_start":
            phase_starts[event["phase"]] = event["elapsed_ms"]
        elif event["type"] == "phase_end":
            phase_ends[event["phase"]] = event["elapsed_ms"]
    
    for phase, start_ms in phase_starts.items():
        end_ms = phase_ends.get(phase, int(total_elapsed * 1000))
        summary["phase_timings"][phase] = round((end_ms - start_ms) / 1000, 2)
    
    _log_event("run_end", summary)
    
    # Save log to file
    log_file = _get_log_dir() / f"run_{_run_id}.json"
    try:
        log_file.write_text(json.dumps({
            "summary": summary,
            "events": _run_log,
        }, indent=2))
    except Exception as e:
        print(f"⚠️ Failed to save performance log: {e}", file=sys.stderr)
    
    # Emit summary for frontend
    print(f"[PERF:totalSeconds={summary['total_elapsed_seconds']},tokensIn={_total_tokens_in},tokensOut={_total_tokens_out},cost={summary['total_cost_usd']}]", flush=True)
    
    return summary


# === Core Markers ===

def emit_phase(phase: str, message: str = "") -> None:
    """Emit a phase transition marker."""
    # End previous phase timing
    for p, start_time in list(_phase_timers.items()):
        if p != "_start" and p != phase:
            elapsed = time.time() - start_time
            _log_event("phase_end", {"phase": p, "elapsed_seconds": round(elapsed, 2)})
            
            # Check for slow phase warning
            threshold = SLOW_PHASE_THRESHOLDS.get(p, 60)
            if elapsed > threshold:
                emit_warning(f"{p} took {elapsed:.1f}s (threshold: {threshold}s)", phase=p)
            
            del _phase_timers[p]
    
    # Start new phase timing
    _phase_timers[phase] = time.time()
    _log_event("phase_start", {"phase": phase, "message": message})
    
    print(f"[PHASE:{phase}]", flush=True)
    if message:
        print(f"[INFO:message={message}]", flush=True)


def emit_stat(key: str, value: int | float | str) -> None:
    """Emit a statistic for the frontend to display."""
    _log_event("stat", {"key": key, "value": value})
    print(f"[STAT:{key}={value}]", flush=True)


def emit_stats(**kwargs) -> None:
    """Emit multiple statistics at once."""
    for key, value in kwargs.items():
        emit_stat(key, value)


def emit_info(message: str) -> None:
    """Emit an informational message."""
    _log_event("info", {"message": message})
    safe_message = message.replace("=", "≡")
    print(f"[INFO:message={safe_message}]", flush=True)


def emit_error(error_type: str, message: str, details: str = "") -> None:
    """Emit an error marker with type and message."""
    _log_event("error", {"error_type": error_type, "message": message, "details": details})
    safe_message = message.replace("=", "≡").replace("\n", " ")
    print(f"[ERROR:type={error_type},message={safe_message}]", flush=True)
    if details:
        print(f"   Details: {details}", file=sys.stderr)


def emit_warning(message: str, phase: str = "") -> None:
    """Emit a warning marker (e.g., slow phase)."""
    _log_event("warning", {"message": message, "phase": phase})
    safe_message = message.replace("=", "≡")
    print(f"[WARNING:phase={phase},message={safe_message}]", flush=True)


# === Intra-Phase Progress ===

def emit_progress(current: int, total: int, label: str = "") -> None:
    """Emit intra-phase progress (e.g., 'Generating item 5 of 22')."""
    _log_event("progress", {"current": current, "total": total, "label": label})
    print(f"[PROGRESS:current={current},total={total},label={label}]", flush=True)


# === Token & Cost Tracking ===

# Pricing per 1M tokens (as of 2026-01)
TOKEN_PRICING = {
    "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
    "claude-3-5-sonnet-20241022": {"input": 3.0, "output": 15.0},
    "claude-3-opus-20240229": {"input": 15.0, "output": 75.0},
    "gpt-4o": {"input": 2.5, "output": 10.0},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "text-embedding-3-small": {"input": 0.02, "output": 0.0},
    "text-embedding-3-large": {"input": 0.13, "output": 0.0},
}


def emit_tokens(
    tokens_in: int,
    tokens_out: int,
    model: str = "claude-sonnet-4-20250514",
    operation: str = "generation"
) -> None:
    """Emit token usage and calculate cost."""
    global _total_tokens_in, _total_tokens_out, _total_cost
    
    pricing = TOKEN_PRICING.get(model, {"input": 3.0, "output": 15.0})
    cost = (tokens_in / 1_000_000 * pricing["input"]) + (tokens_out / 1_000_000 * pricing["output"])
    
    _total_tokens_in += tokens_in
    _total_tokens_out += tokens_out
    _total_cost += cost
    
    _log_event("tokens", {
        "operation": operation,
        "model": model,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "cost_usd": round(cost, 6),
        "cumulative_cost_usd": round(_total_cost, 4),
    })
    
    print(f"[COST:tokensIn={tokens_in},tokensOut={tokens_out},cost={cost:.6f},cumulative={_total_cost:.4f}]", flush=True)


def emit_embedding_tokens(tokens: int, count: int, model: str = "text-embedding-3-small") -> None:
    """Emit embedding token usage."""
    global _total_tokens_in, _total_cost
    
    pricing = TOKEN_PRICING.get(model, {"input": 0.02, "output": 0.0})
    cost = tokens / 1_000_000 * pricing["input"]
    
    _total_tokens_in += tokens
    _total_cost += cost
    
    _log_event("embedding_tokens", {
        "model": model,
        "tokens": tokens,
        "count": count,
        "cost_usd": round(cost, 6),
        "cumulative_cost_usd": round(_total_cost, 4),
    })
    
    print(f"[COST:type=embedding,count={count},tokens={tokens},cost={cost:.6f}]", flush=True)


# === Convenience Functions ===

def emit_request_confirmed(
    date_range: str,
    requested_items: int,
    temperature: float,
    days_processed: int = 0
) -> None:
    """Emit the request confirmation phase data."""
    emit_phase("confirming", "Request parameters confirmed")
    emit_stat("dateRange", date_range)
    emit_stat("requestedItems", requested_items)
    emit_stat("temperature", temperature)
    if days_processed > 0:
        emit_stat("daysProcessed", days_processed)


def emit_search_started() -> None:
    """Emit that the search phase has started."""
    emit_phase("searching", "Searching chat history via semantic search...")


def emit_search_complete(
    conversations_found: int,
    days_with_activity: int,
    days_processed: int
) -> None:
    """Emit search phase results."""
    emit_stats(
        conversationsFound=conversations_found,
        daysWithActivity=days_with_activity,
        daysProcessed=days_processed
    )


def emit_generation_started(item_count: int) -> None:
    """Emit that generation has started."""
    emit_phase("generating", f"Generating {item_count} items with AI...")


def emit_generation_progress(current: int, total: int) -> None:
    """Emit progress within generation phase."""
    emit_progress(current, total, "items")


def emit_generation_complete(items_generated: int) -> None:
    """Emit generation results."""
    emit_stat("itemsGenerated", items_generated)


def emit_dedup_started() -> None:
    """Emit that deduplication has started."""
    emit_phase("deduplicating", "Checking for duplicate items...")


def emit_dedup_progress(current: int, total: int) -> None:
    """Emit progress within deduplication phase."""
    emit_progress(current, total, "comparisons")


def emit_dedup_complete(items_after: int, duplicates_removed: int = 0) -> None:
    """Emit deduplication results."""
    emit_stat("itemsAfterSelfDedup", items_after)
    if duplicates_removed > 0:
        emit_info(f"{duplicates_removed} duplicates removed among new items")


def emit_ranking_started() -> None:
    """Emit that ranking has started."""
    emit_phase("ranking", "Ranking items by quality...")


def emit_ranking_progress(current: int, total: int) -> None:
    """Emit progress within ranking phase."""
    emit_progress(current, total, "items")


def emit_ranking_complete(items_ranked: int) -> None:
    """Emit ranking results."""
    emit_stat("sentToLibrary", items_ranked)


def emit_integration_started() -> None:
    """Emit that library integration has started."""
    emit_phase("integrating", "Adding items to your Library...")


def emit_integration_progress(current: int, total: int) -> None:
    """Emit progress within integration phase."""
    emit_progress(current, total, "items")


def emit_integration_complete(
    items_compared: int,
    items_added: int,
    items_merged: int,
    items_filtered: int = 0,
    filter_reason: str = ""
) -> None:
    """Emit library integration results."""
    emit_stats(
        itemsCompared=items_compared,
        itemsAdded=items_added,
        itemsMerged=items_merged
    )
    if items_filtered > 0:
        emit_stat("itemsFiltered", items_filtered)
        if filter_reason:
            emit_info(f"Filter reason: {filter_reason}")


def emit_complete(items_added: int, items_merged: int) -> None:
    """Emit that generation is complete."""
    emit_phase("complete", "Generation complete!")
    emit_stat("finalItemsAdded", items_added)
    emit_stat("finalItemsMerged", items_merged)


# === Performance Log Analysis ===

def get_recent_runs(limit: int = 10) -> list[dict]:
    """Get summaries of recent runs for analysis."""
    log_dir = _get_log_dir()
    runs = []
    
    for log_file in sorted(log_dir.glob("run_*.json"), reverse=True)[:limit]:
        try:
            data = json.loads(log_file.read_text())
            runs.append(data.get("summary", {}))
        except Exception:
            pass
    
    return runs


def get_run_details(run_id: str) -> dict | None:
    """Get full details of a specific run."""
    log_file = _get_log_dir() / f"run_{run_id}.json"
    if log_file.exists():
        try:
            return json.loads(log_file.read_text())
        except Exception:
            pass
    return None


def analyze_phase_performance(runs: list[dict] | None = None) -> dict:
    """Analyze average phase timings across runs."""
    if runs is None:
        runs = get_recent_runs(20)
    
    phase_times: dict[str, list[float]] = {}
    
    for run in runs:
        if not run.get("success"):
            continue
        for phase, time_s in run.get("phase_timings", {}).items():
            if phase not in phase_times:
                phase_times[phase] = []
            phase_times[phase].append(time_s)
    
    analysis = {}
    for phase, times in phase_times.items():
        if times:
            analysis[phase] = {
                "avg_seconds": round(sum(times) / len(times), 2),
                "min_seconds": round(min(times), 2),
                "max_seconds": round(max(times), 2),
                "sample_count": len(times),
            }
    
    return analysis
