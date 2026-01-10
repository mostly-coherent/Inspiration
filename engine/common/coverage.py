"""
Coverage Intelligence — Analyze Memory terrain and Library coverage to detect gaps.

This module provides:
1. Memory density analysis (conversations per week)
2. Library coverage analysis (items per week by source date)
3. Gap detection algorithm
4. Run suggestion generation with sizing and cost estimation
"""

import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal, Optional

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    Client = None

from .config import load_env_file


# Cost estimation constants (USD)
COST_PER_ITEM_IDEA = 0.025  # ~$0.025 per idea (Claude generation)
COST_PER_ITEM_INSIGHT = 0.020  # ~$0.02 per insight (slightly shorter)
COST_PER_ITEM_USE_CASE = 0.030  # ~$0.03 per use case (more context)

# Run sizing thresholds
CONVERSATIONS_PER_ITEM = 10  # Expect ~1 item per 10 conversations as healthy coverage


@dataclass
class WeekDensity:
    """Memory density for a single week."""
    week_label: str  # e.g., "2025-W28"
    week_start: str  # ISO date
    week_end: str  # ISO date
    conversation_count: int
    message_count: int


@dataclass
class WeekCoverage:
    """Library coverage for a single week."""
    week_label: str
    week_start: str
    item_count: int


@dataclass
class CoverageGap:
    """A detected coverage gap."""
    week_label: str
    week_start: str
    week_end: str
    conversation_count: int
    message_count: int
    existing_items: int
    expected_items: int
    severity: Literal["high", "medium", "low"]
    gap_score: float  # Higher = more urgent


@dataclass
class SuggestedRun:
    """A suggested generation run to fill a gap."""
    week_label: str
    start_date: str
    end_date: str
    item_type: str
    expected_items: int
    conversation_count: int
    message_count: int
    existing_items: int
    priority: Literal["high", "medium", "low"]
    reason: str
    estimated_cost: float


def get_supabase_client() -> Optional[Client]:
    """Get Supabase client, initializing if needed."""
    if not SUPABASE_AVAILABLE:
        return None
    
    load_env_file()
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_key:
        return None
    
    return create_client(supabase_url, supabase_key)


def get_memory_density() -> list[WeekDensity]:
    """
    Get Memory density by week from Vector DB.
    
    Returns list of WeekDensity objects sorted by week (oldest first).
    """
    client = get_supabase_client()
    if not client:
        return []
    
    try:
        result = client.rpc("get_memory_density_by_week").execute()
        
        weeks = []
        for row in result.data or []:
            weeks.append(WeekDensity(
                week_label=row.get("week_label", ""),
                week_start=str(row.get("week_start", "")),
                week_end=str(row.get("week_end", "")),
                conversation_count=int(row.get("conversation_count", 0)),
                message_count=int(row.get("message_count", 0)),
            ))
        
        return weeks
        
    except Exception as e:
        import sys
        print(f"⚠️  Failed to get memory density: {e}", file=sys.stderr)
        return []


def get_library_coverage() -> list[WeekCoverage]:
    """
    Get Library coverage by week from Vector DB.
    
    Returns list of WeekCoverage objects sorted by week (oldest first).
    """
    client = get_supabase_client()
    if not client:
        return []
    
    try:
        result = client.rpc("get_library_coverage_by_week").execute()
        
        weeks = []
        for row in result.data or []:
            weeks.append(WeekCoverage(
                week_label=row.get("week_label", ""),
                week_start=str(row.get("week_start", "")),
                item_count=int(row.get("item_count", 0)),
            ))
        
        return weeks
        
    except Exception as e:
        import sys
        print(f"⚠️  Failed to get library coverage: {e}", file=sys.stderr)
        return []


def get_full_coverage_analysis() -> dict[str, Any]:
    """
    Get full coverage analysis from Vector DB via RPC.
    
    Returns dict with memory, library, and analyzedAt fields.
    """
    client = get_supabase_client()
    if not client:
        return {
            "memory": {"weeks": [], "totalConversations": 0, "totalMessages": 0},
            "library": {"weeks": [], "totalItems": 0, "itemsWithSourceDates": 0},
            "analyzedAt": datetime.now().isoformat(),
        }
    
    try:
        result = client.rpc("get_coverage_analysis").execute()
        return result.data if result.data else {}
        
    except Exception as e:
        import sys
        print(f"⚠️  Failed to get coverage analysis: {e}", file=sys.stderr)
        return {}


def detect_gaps(
    memory_density: list[WeekDensity],
    library_coverage: list[WeekCoverage],
) -> list[CoverageGap]:
    """
    Detect coverage gaps by comparing Memory terrain to Library coverage.
    
    Strategy:
    - For each week in Memory, check Library coverage
    - Calculate expected items based on conversation density
    - Flag gaps where actual < expected
    - Assign severity based on gap size and conversation count
    - SKIP incomplete weeks (week_end >= today)
    
    Returns list of CoverageGap objects sorted by severity (high first).
    """
    from datetime import date
    
    today = date.today()
    
    # Build lookup map for library coverage
    coverage_map: dict[str, int] = {}
    for cov in library_coverage:
        coverage_map[cov.week_label] = cov.item_count
    
    gaps: list[CoverageGap] = []
    
    for week in memory_density:
        conversations = week.conversation_count
        existing_items = coverage_map.get(week.week_label, 0)
        
        # Skip incomplete weeks (week hasn't ended yet)
        try:
            week_end_date = date.fromisoformat(week.week_end)
            if week_end_date >= today:
                continue  # Week is still in progress, don't suggest runs for it
        except (ValueError, TypeError):
            pass  # If date parsing fails, include the week
        
        # Calculate expected items (1 per 10 conversations, minimum 1 if any conversations)
        if conversations == 0:
            continue  # Skip empty weeks
        
        expected = max(1, conversations // CONVERSATIONS_PER_ITEM)
        
        # Check if there's a gap
        if existing_items >= expected:
            continue  # Well covered
        
        # Calculate gap score (higher = more urgent)
        # Based on: conversation count × coverage deficit ratio
        deficit_ratio = (expected - existing_items) / expected
        gap_score = conversations * deficit_ratio
        
        # Assign severity
        if existing_items == 0 and conversations >= 30:
            severity = "high"
        elif existing_items == 0 and conversations >= 10:
            severity = "high" if conversations >= 20 else "medium"
        elif existing_items < expected / 2:
            severity = "medium"
        else:
            severity = "low"
        
        gaps.append(CoverageGap(
            week_label=week.week_label,
            week_start=week.week_start,
            week_end=week.week_end,
            conversation_count=conversations,
            message_count=week.message_count,
            existing_items=existing_items,
            expected_items=expected,
            severity=severity,
            gap_score=gap_score,
        ))
    
    # Sort by severity (high > medium > low), then by gap_score (descending)
    severity_order = {"high": 0, "medium": 1, "low": 2}
    gaps.sort(key=lambda g: (severity_order[g.severity], -g.gap_score))
    
    return gaps


def calculate_run_size(gap: CoverageGap) -> int:
    """
    Calculate recommended run size based on gap characteristics.
    
    Sizing strategy:
    - High severity (0 items, >50 convos): 10 items
    - High severity (0 items, 30-50 convos): 8 items
    - High severity (0 items, <30 convos): 5 items
    - Medium severity (<50% coverage): 5 items
    - Low severity (>50% coverage): 3 items
    """
    if gap.severity == "high":
        if gap.conversation_count >= 50:
            return 10
        elif gap.conversation_count >= 30:
            return 8
        else:
            return 5
    elif gap.severity == "medium":
        return 5
    else:
        return 3


def estimate_cost(item_count: int, item_type: str) -> float:
    """Estimate cost for generating N items of given type."""
    cost_per_item = {
        "idea": COST_PER_ITEM_IDEA,
        "insight": COST_PER_ITEM_INSIGHT,
        "use_case": COST_PER_ITEM_USE_CASE,
    }.get(item_type, COST_PER_ITEM_IDEA)
    
    return round(item_count * cost_per_item, 4)


def generate_suggested_runs(
    gaps: list[CoverageGap],
    item_types: list[str] | None = None,
    max_gaps: int = 10,
) -> list[SuggestedRun]:
    """
    Generate suggested runs to fill coverage gaps.
    
    Args:
        gaps: List of detected coverage gaps
        item_types: Types of items to generate (default: ["idea", "insight"])
        max_gaps: Maximum number of gaps to process (each gap gets one run per type)
    
    Returns:
        List of SuggestedRun objects (sorted by priority, then by type)
    """
    if item_types is None:
        item_types = ["idea", "insight"]  # Generate both by default
    
    runs: list[SuggestedRun] = []
    
    for gap in gaps[:max_gaps]:
        run_size = calculate_run_size(gap)
        
        # Build base reason string
        if gap.existing_items == 0:
            base_reason = f"{gap.conversation_count} conversations with no items covering this period"
        else:
            base_reason = f"{gap.conversation_count} conversations with only {gap.existing_items} items (expected {gap.expected_items})"
        
        # Create a run for each item type
        for item_type in item_types:
            estimated_cost = estimate_cost(run_size, item_type)
            type_label = "Ideas" if item_type == "idea" else "Insights" if item_type == "insight" else item_type.title()
            
            runs.append(SuggestedRun(
                week_label=gap.week_label,
                start_date=gap.week_start,
                end_date=gap.week_end,
                item_type=item_type,
                expected_items=run_size,
                conversation_count=gap.conversation_count,
                message_count=gap.message_count,
                existing_items=gap.existing_items,
                priority=gap.severity,
                reason=f"[{type_label}] {base_reason}",
                estimated_cost=estimated_cost,
            ))
    
    # Sort: high priority first, then by week, then ideas before insights
    type_order = {"idea": 0, "insight": 1, "use_case": 2}
    severity_order = {"high": 0, "medium": 1, "low": 2}
    runs.sort(key=lambda r: (severity_order.get(r.priority, 9), r.week_label, type_order.get(r.item_type, 9)))
    
    return runs


def calculate_coverage_score(
    memory_density: list[WeekDensity],
    library_coverage: list[WeekCoverage],
) -> int:
    """
    Calculate overall coverage score (0-100%).
    
    Score = (covered weeks / total weeks with activity) × 100
    
    A week is "covered" if it has at least 1 item when conversations exist.
    """
    if not memory_density:
        return 100  # No memory = 100% coverage (nothing to cover)
    
    coverage_map: dict[str, int] = {}
    for cov in library_coverage:
        coverage_map[cov.week_label] = cov.item_count
    
    total_weeks = 0
    covered_weeks = 0
    
    for week in memory_density:
        if week.conversation_count == 0:
            continue  # Skip empty weeks
        
        total_weeks += 1
        items = coverage_map.get(week.week_label, 0)
        
        # A week is covered if it has at least 1 item
        if items > 0:
            covered_weeks += 1
    
    if total_weeks == 0:
        return 100
    
    return round((covered_weeks / total_weeks) * 100)


def get_coverage_summary() -> dict[str, Any]:
    """
    Get a summary of coverage analysis with gaps and suggested runs.
    
    Returns dict with:
    - coverageScore: 0-100%
    - gaps: List of gaps with details
    - suggestedRuns: List of suggested runs
    - memory: Memory terrain summary
    - library: Library coverage summary
    """
    memory_density = get_memory_density()
    library_coverage = get_library_coverage()
    
    # Detect gaps
    gaps = detect_gaps(memory_density, library_coverage)
    
    # Generate suggested runs for both ideas and insights
    suggested_runs = generate_suggested_runs(gaps, item_types=["idea", "insight"])
    
    # Calculate coverage score
    coverage_score = calculate_coverage_score(memory_density, library_coverage)
    
    # Build gap counts by severity
    gap_counts = {"high": 0, "medium": 0, "low": 0}
    for gap in gaps:
        gap_counts[gap.severity] += 1
    
    # Calculate totals
    total_conversations = sum(w.conversation_count for w in memory_density)
    total_messages = sum(w.message_count for w in memory_density)
    total_items = sum(w.item_count for w in library_coverage)
    
    # Get date range
    if memory_density:
        earliest_date = memory_density[0].week_start
        latest_date = memory_density[-1].week_end
    else:
        earliest_date = None
        latest_date = None
    
    return {
        "coverageScore": coverage_score,
        "gapCounts": gap_counts,
        "gaps": [
            {
                "weekLabel": g.week_label,
                "weekStart": g.week_start,
                "weekEnd": g.week_end,
                "conversationCount": g.conversation_count,
                "messageCount": g.message_count,
                "existingItems": g.existing_items,
                "expectedItems": g.expected_items,
                "severity": g.severity,
            }
            for g in gaps
        ],
        "suggestedRuns": [
            {
                "weekLabel": r.week_label,
                "startDate": r.start_date,
                "endDate": r.end_date,
                "itemType": r.item_type,
                "expectedItems": r.expected_items,
                "conversationCount": r.conversation_count,
                "messageCount": r.message_count,
                "existingItems": r.existing_items,
                "priority": r.priority,
                "reason": r.reason,
                "estimatedCost": r.estimated_cost,
            }
            for r in suggested_runs
        ],
        "memory": {
            "totalWeeks": len(memory_density),
            "totalConversations": total_conversations,
            "totalMessages": total_messages,
            "earliestDate": earliest_date,
            "latestDate": latest_date,
        },
        "library": {
            "totalItems": total_items,
            "weeksWithItems": len(library_coverage),
        },
        "analyzedAt": datetime.now().isoformat(),
    }


# ============================================================================
# Run Queue Management
# ============================================================================

def get_pending_runs() -> list[dict[str, Any]]:
    """Get all pending runs (queued or processing)."""
    client = get_supabase_client()
    if not client:
        return []
    
    try:
        result = client.table("coverage_runs")\
            .select("*")\
            .in_("status", ["queued", "processing"])\
            .order("created_at", desc=False)\
            .execute()
        
        return result.data or []
        
    except Exception as e:
        import sys
        print(f"⚠️  Failed to get pending runs: {e}", file=sys.stderr)
        return []


def get_run_history(limit: int = 20) -> list[dict[str, Any]]:
    """Get recent run history (completed, failed, cancelled)."""
    client = get_supabase_client()
    if not client:
        return []
    
    try:
        result = client.table("coverage_runs")\
            .select("*")\
            .in_("status", ["completed", "failed", "cancelled"])\
            .order("completed_at", desc=True)\
            .limit(limit)\
            .execute()
        
        return result.data or []
        
    except Exception as e:
        import sys
        print(f"⚠️  Failed to get run history: {e}", file=sys.stderr)
        return []


def create_run(
    week_label: str,
    start_date: str,
    end_date: str,
    item_type: str,
    expected_items: int,
    conversation_count: int,
    message_count: int,
    existing_items: int,
    priority: str,
    reason: str,
    estimated_cost: float,
    status: str = "queued",
) -> Optional[str]:
    """
    Create a new coverage run in the queue.
    
    Returns the run ID if successful, None otherwise.
    """
    client = get_supabase_client()
    if not client:
        return None
    
    try:
        result = client.table("coverage_runs").insert({
            "week_label": week_label,
            "start_date": start_date,
            "end_date": end_date,
            "item_type": item_type,
            "expected_items": expected_items,
            "conversation_count": conversation_count,
            "message_count": message_count,
            "existing_items": existing_items,
            "priority": priority,
            "reason": reason,
            "estimated_cost": estimated_cost,
            "status": status,
        }).execute()
        
        if result.data:
            return result.data[0].get("id")
        return None
        
    except Exception as e:
        import sys
        print(f"⚠️  Failed to create run: {e}", file=sys.stderr)
        return None


def update_run_status(
    run_id: str,
    status: str,
    *,
    progress: Optional[int] = None,
    actual_items: Optional[int] = None,
    actual_cost: Optional[float] = None,
    error: Optional[str] = None,
) -> bool:
    """Update a run's status and optional fields."""
    client = get_supabase_client()
    if not client:
        return False
    
    try:
        update_data: dict[str, Any] = {"status": status}
        
        if status == "processing" and progress is None:
            update_data["started_at"] = datetime.now().isoformat()
        
        if status in ("completed", "failed", "cancelled"):
            update_data["completed_at"] = datetime.now().isoformat()
        
        if progress is not None:
            update_data["progress"] = progress
        
        if actual_items is not None:
            update_data["actual_items"] = actual_items
        
        if actual_cost is not None:
            update_data["actual_cost"] = actual_cost
        
        if error is not None:
            update_data["error"] = error
        
        result = client.table("coverage_runs")\
            .update(update_data)\
            .eq("id", run_id)\
            .execute()
        
        return len(result.data or []) > 0
        
    except Exception as e:
        import sys
        print(f"⚠️  Failed to update run status: {e}", file=sys.stderr)
        return False


def delete_run(run_id: str) -> bool:
    """Delete a run from the queue."""
    client = get_supabase_client()
    if not client:
        return False
    
    try:
        result = client.table("coverage_runs")\
            .delete()\
            .eq("id", run_id)\
            .execute()
        
        return len(result.data or []) > 0
        
    except Exception as e:
        import sys
        print(f"⚠️  Failed to delete run: {e}", file=sys.stderr)
        return False


def clear_suggested_runs() -> int:
    """Clear all suggested (not yet queued) runs. Returns count deleted."""
    client = get_supabase_client()
    if not client:
        return 0
    
    try:
        result = client.table("coverage_runs")\
            .delete()\
            .eq("status", "suggested")\
            .execute()
        
        return len(result.data or [])
        
    except Exception as e:
        import sys
        print(f"⚠️  Failed to clear suggested runs: {e}", file=sys.stderr)
        return 0


# ============================================================================
# CLI for testing
# ============================================================================

if __name__ == "__main__":
    import json
    import sys
    
    print("📊 Coverage Analysis")
    print("=" * 60)
    
    summary = get_coverage_summary()
    
    print(f"\n📈 Coverage Score: {summary['coverageScore']}%")
    print(f"\n🧠 Memory Terrain:")
    print(f"   • {summary['memory']['totalWeeks']} weeks of activity")
    print(f"   • {summary['memory']['totalConversations']:,} conversations")
    print(f"   • {summary['memory']['totalMessages']:,} messages")
    print(f"   • {summary['memory']['earliestDate']} → {summary['memory']['latestDate']}")
    
    print(f"\n📚 Library Coverage:")
    print(f"   • {summary['library']['totalItems']} items")
    print(f"   • {summary['library']['weeksWithItems']} weeks with items")
    
    print(f"\n🔴 Gaps: {summary['gapCounts']['high']} high | {summary['gapCounts']['medium']} medium | {summary['gapCounts']['low']} low")
    
    if summary['suggestedRuns']:
        print(f"\n💡 Suggested Runs (top {len(summary['suggestedRuns'])}):")
        total_cost = 0.0
        for run in summary['suggestedRuns'][:5]:
            total_cost += run['estimatedCost']
            print(f"   • {run['weekLabel']}: {run['conversationCount']} convos → {run['expectedItems']} items (${run['estimatedCost']:.2f})")
            print(f"     {run['reason']}")
        print(f"\n   Total estimated cost for top 5: ${total_cost:.2f}")
    else:
        print("\n✅ No coverage gaps detected!")
    
    # Output full JSON for debugging
    if "--json" in sys.argv:
        print("\n" + "=" * 60)
        print("Full JSON output:")
        print(json.dumps(summary, indent=2))
