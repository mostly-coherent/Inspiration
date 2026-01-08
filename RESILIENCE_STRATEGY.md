# Resilience Strategy: Handling Cursor DB Architecture Changes

> **Purpose:** Harden the app against Cursor database schema changes ("The Bubble Problem")
> **Created:** 2026-01-08
> **Status:** Implemented

---

## The Problem

Cursor periodically changes its internal chat history database architecture, which can break Inspiration's extraction logic:

**Historical Example: "The Bubble Problem"**
- **Before:** Messages stored directly in `composerData` entries
- **After:** Messages stored as `bubbleId` references, requiring two-step lookup
- **Impact:** Extraction failed completely until code updated

**Future Risk:** Cursor may change the schema again at any time, breaking sync/indexing functionality.

---

## Resilience Architecture

### 1. Schema Health Check (`engine/common/db_health_check.py`)

**Purpose:** Detect schema changes before attempting extraction

**Features:**
- **Version Detection:** Identifies schema version (v1-direct, v2-bubbles, unknown)
- **Strategy Validation:** Tests which extraction strategies are viable
- **Issue Reporting:** Lists specific incompatibilities found
- **Diagnostic Data:** Collects full schema information for bug reports

**Usage:**
```bash
# Run standalone health check
python3 engine/common/db_health_check.py

# Output: Diagnostic report saved to db_diagnostic_report_YYYYMMDD_HHMMSS.md
```

**Schema Detection Logic:**
```python
SchemaHealth = {
    is_healthy: bool,  # Can we extract messages?
    schema_version: str,  # "v2-bubbles", "v1-direct", "unknown"
    extraction_strategies: {
        "composerData_direct": bool,
        "composerData_bubbles": bool,
        "fullConversationHeadersOnly": bool,
        "conversationWithMessages": bool,
    },
    issues: List[str],  # What's broken
    diagnostics: Dict,  # Full data for reporting
}
```

### 2. Enhanced Error Surfacing

**API Layer** (`src/app/api/sync/route.ts`):
- Categorizes errors by type (`database_not_found`, `schema_incompatible`, `extraction_failed`)
- Provides remediation steps
- Includes diagnostic commands

**Error Response Format:**
```json
{
  "success": false,
  "errorType": "schema_incompatible",
  "error": "Cursor database schema has changed...",
  "remediation": "Run diagnostic: python3 engine/common/db_health_check.py",
  "diagnosticCommand": "python3 engine/common/db_health_check.py"
}
```

**Frontend Handling** (`src/app/page.tsx`):
- Displays user-friendly status messages
- Shows remediation steps in alerts for critical issues
- Logs diagnostic information to console

### 3. Sync-Time Validation

**Integration Point:** `engine/scripts/sync_messages.py`

**Flow:**
```
1. Health Check (detect schema version)
   ├─ If healthy → Continue sync
   └─ If unhealthy → Generate diagnostic report, abort sync

2. Extraction Attempt
   ├─ Success → Index messages
   └─ Failure → Enhanced error message with remediation
```

**Early Abort:**
- If schema is incompatible, abort before attempting extraction
- Saves user time and prevents confusing errors
- Generates diagnostic report automatically

### 4. Diagnostic Report Generation

**Auto-Generated Report Includes:**
- Schema version detected
- List of incompatibilities
- Viable/non-viable extraction strategies
- Sample key patterns (anonymized)
- Cursor version (if detectable)
- Remediation steps
- GitHub issue template

**Example Output:**
```markdown
## Database Schema Compatibility Issue

**Schema Version:** unknown-v3
**Health Status:** ❌ Unhealthy

### Issues Found:
- CRITICAL: No known extraction strategy viable
- WARNING: fullConversationHeadersOnly found but no bubble keys

### Extraction Strategies:
- ❌ composerData_direct
- ❌ composerData_bubbles
- ✅ fullConversationHeadersOnly
- ❌ conversationWithMessages

### Sample Keys:
composerData:abc123
fullConversationHeadersOnly:def456
newPatternWeHaventSeenBefore:ghi789

### Remediation Steps:
1. Report this issue at https://github.com/mostly-coherent/Inspiration/issues
2. Share this diagnostic report (anonymized data only)
3. Temporary workaround: Use previous version until fix available
```

---

## Multi-Strategy Extraction (Future Enhancement)

**Status:** Pending Implementation

**Concept:** Try multiple extraction methods with fallbacks

**Proposed Flow:**
```python
def extract_with_fallbacks(data, composer_id, db_path):
    strategies = [
        try_bubble_extraction,
        try_direct_extraction,
        try_conversation_messages,
        try_generic_json_walk,  # Last resort: find any text-like fields
    ]
    
    for strategy in strategies:
        try:
            messages = strategy(data, composer_id, db_path)
            if messages:
                return messages
        except Exception as e:
            log_strategy_failure(strategy.__name__, e)
            continue
    
    return []  # All strategies failed
```

**Benefits:**
- Graceful degradation
- Partial functionality even with schema changes
- Buys time to implement full fix

---

## Auto-Adaptation Strategy (Future Enhancement)

**Status:** Conceptual

**Goal:** Automatically discover new schema patterns

**Approach:**
1. **Pattern Discovery:** Analyze sample entries to find text-containing fields
2. **Heuristic Extraction:** Try extracting from discovered patterns
3. **Confidence Scoring:** Rate extraction quality
4. **User Confirmation:** "Found messages using new pattern, does this look correct?"
5. **Submit Telemetry:** Share discovered pattern for analysis

**Challenges:**
- Risk of false positives
- May extract incomplete/incorrect data
- User may not notice quality degradation

**Trade-offs:**
- **Pro:** Keeps app working even with breaking changes
- **Con:** May extract bad data silently
- **Decision:** Prioritize clear errors over silent degradation

---

## Detection & Response Matrix

| Scenario | Detection | Response | User Experience |
|----------|-----------|----------|----------------|
| **No DB** | File not found | Cloud mode | "☁️ Cloud Mode (Read-only)" |
| **Schema v1** | composerData has messages | Direct extraction | Normal sync |
| **Schema v2** | bubbleId references exist | Bubble-based extraction | Normal sync |
| **Schema v3** | Unknown pattern | Health check fails | "⚠️ DB Schema Changed" + diagnostic |
| **Partial Compat** | Some strategies work | Use working strategy | Degraded functionality + warning |
| **Zero Compat** | No strategies work | Abort + report | Alert + remediation steps |

---

## Developer Workflow

### When Schema Change Detected:

**1. User Reports Issue:**
- User sees "⚠️ DB Schema Changed" status
- Runs diagnostic: `python3 engine/common/db_health_check.py`
- Gets diagnostic report with schema details
- Files GitHub issue with report

**2. Developer Investigates:**
```bash
# Run health check locally
python3 engine/common/db_health_check.py

# Review diagnostic report
cat db_diagnostic_report_*.md

# Inspect database manually if needed
sqlite3 ~/Library/Application\ Support/Cursor/User/globalStorage/state.vscdb
> SELECT key FROM cursorDiskKV WHERE key LIKE 'composerData:%' LIMIT 10;
> SELECT key FROM cursorDiskKV LIMIT 100;
```

**3. Implement Fix:**
- Add new extraction strategy to `cursor_db.py`
- Update health check to recognize new schema version
- Test against user's diagnostic data
- Deploy fix

**4. Communicate:**
- Update GitHub issue with fix
- Document new schema version
- Release new version

---

## Testing

### Health Check Testing:
```bash
# Test current DB
python3 engine/common/db_health_check.py

# Expected output for healthy DB:
# Schema Version: v2-bubbles
# Health Status: ✅ Healthy
# Extraction Strategies:
#   ✅ composerData_bubbles
#   ✅ fullConversationHeadersOnly
```

### Sync Error Testing:
```bash
# Temporarily break extraction to test error handling
# (Edit cursor_db.py to simulate failure)

# Run sync
curl -X POST http://localhost:3000/api/sync

# Expected: Enhanced error message with remediation steps
```

---

## Maintenance

### Periodic Health Checks:
- Run health check after Cursor updates
- Monitor GitHub issues for schema change reports
- Test extraction strategies against new Cursor versions

### Schema Version Catalog:
| Version | Detection | Extraction Method | Cursor Version | Status |
|---------|-----------|-------------------|----------------|--------|
| v1-direct | `messages` field in composerData | Direct message array access | Pre-0.40 | Deprecated |
| v2-bubbles | `bubbleId` references + `fullConversationHeadersOnly` | Two-step bubble lookup | 0.40+ | Current |
| v3-* | TBD | TBD | Future | Unknown |

---

## Related Documentation

- **Implementation:** `engine/common/db_health_check.py`
- **Integration:** `engine/scripts/sync_messages.py`
- **API Errors:** `src/app/api/sync/route.ts`
- **Frontend:** `src/app/page.tsx`
- **Architecture:** `ARCHITECTURE.md`

---

## Future Enhancements

1. **Multi-Strategy Extraction:** Fallback logic (pending)
2. **Auto-Adaptation:** Pattern discovery (conceptual)
3. **Telemetry:** Anonymous schema pattern reporting (optional)
4. **Version Pinning:** Document compatible Cursor versions
5. **Schema Changelog:** Track Cursor's internal changes

---

**Last Updated:** 2026-01-08
**Status:** Core resilience features implemented, multi-strategy extraction pending
