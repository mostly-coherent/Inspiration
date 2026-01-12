# Code Audit: Seek Use Case Flow
**Date:** 2026-01-12  
**Scope:** User clicks "Search Chat History" → Use cases saved to Library (including all error paths)
**Last Updated:** 2026-01-12 (Phase 1 & 2 Fixes Implemented)

---

## Executive Summary

**Total Issues Found:** 23  
**Critical:** 4 | **High:** 6 | **Medium:** 7 | **Low:** 6

**Key Risk Areas:**
1. **Parsing failures** - Silent failures when LLM output doesn't match expected format
2. **Streaming state** - Frontend can hang if Python crashes without emitting markers
3. **Orphaned files** - Output files left in limbo if harmonization fails (no retry mechanism)
4. **Error classification** - Generic errors don't provide actionable guidance
5. **Thread safety** - Parallel search exceptions not fully handled

---

## Fix Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Fixed and verified |
| 🔧 | Fix in progress |
| ❌ | Not yet fixed |
| ⚠️ | Partially addressed (pre-existing) |
| 🚫 | Not an issue (already fixed in code) |

---

## Issue Catalog

### 🔴 CRITICAL (Must Fix)

#### S1: Parsing Failures Are Silent ✅ FIXED
**Location:** `engine/seek.py:seek_use_case()` (line 388-404)
**Status:** ✅ Fixed

**Fix Implemented:**
- Added `emit_warning("parsing", ...)` when parsing returns 0 items but content is non-empty
- Saves raw content to `data/output/failed_parses/seek_*.md` for debugging
- Logs first 500 chars of content for diagnosis
- Emits `[INFO:message=...]` with file path so user can retry

---

#### S2: Orphaned Output Files After Harmonization Failure ✅ FIXED
**Location:** `engine/seek.py:seek_use_case()` (line 515-528)
**Status:** ✅ Fixed

**Fix Implemented:**
- On harmonization failure, moves output file to `data/output/failed_harmonization/`
- Emits `[INFO:message=Output saved to failed_harmonization/{name} for retry]`
- User can manually retry harmonization from preserved file
- Files no longer accumulate in main output directory

---

#### S3: Frontend Doesn't Verify Complete Marker Before Ending ✅ FIXED
**Location:** `src/components/SeekSection.tsx:handleSearch()` (line 107, 170, 319, 360-374)
**Status:** ✅ Fixed

**Fix Implemented:**
- Added `receivedCompleteMarker` ref to track if complete marker was received
- Reset at start of each search
- Set to `true` when `[PHASE:complete]` is received
- After stream ends, checks Library count even if marker missing
- Shows warning if items were saved but stream ended early

---

#### S4: No Timeout on Streaming Reader ✅ FIXED
**Location:** `src/components/SeekSection.tsx:handleSearch()` (line 110, 231-248)
**Status:** ✅ Fixed

**Fix Implemented:**
- Added `STREAM_TIMEOUT_MS = 60000` (60 seconds)
- Created `readWithTimeout()` function using `Promise.race`
- Resets timeout on each activity (data received)
- Throws clear error: "Stream timeout - no response for 60 seconds. Check your Library for results."

---

### 🟠 HIGH (Should Fix)

#### S5: LLM API Failures Don't Emit Structured Errors ✅ FIXED
**Location:** `engine/seek.py:seek_use_case()` (line 325-358)
**Status:** ✅ Fixed

**Fix Implemented:**
- Wrapped `generate_content()` in try/except
- Classifies errors based on message content:
  - `rate_limit` - Rate limit/429 errors
  - `auth_failure` - Authentication/API key errors
  - `timeout` - Request timeout errors
  - `network_error` - Connection/network errors
  - `context_too_long` - Token limit exceeded
  - `generation_error` - Other LLM errors
- Emits `[ERROR:type=X,message=Y]` for each error type
- Frontend can show user-friendly messages with recommendations

---

#### S6: File I/O Errors Not Caught During Output Writing ✅ FIXED
**Location:** `engine/seek.py:seek_use_case()` (line 410-425)
**Status:** ✅ Fixed

**Fix Implemented:**
- Wrapped `save_output()` in try/except
- Emits `[ERROR:type=file_write,message=...]` on failure
- Sets `output_file = None` on failure
- Continues with in-memory items (harmonization can still work)
- User sees clear error message about file write failure

---

#### S7: Process Abort Doesn't Clean Up Output Files ✅ FIXED
**Location:** `src/app/api/seek-stream/route.ts:runPythonScriptStream()` (line 113-135)
**Status:** ✅ Fixed

**Fix Implemented:**
- On abort, scans `data/output/use_cases_output/` directory
- Deletes any `.tmp` files (incomplete writes from atomic save)
- Logs cleanup actions for debugging
- Emits `[INFO:message=Cleaned up temporary files]`

---

#### S8: Library Count Verification Uses Stale Progress Data ✅ FIXED
**Location:** `src/components/SeekSection.tsx:handleSearch()` (line 105, 260-310, 360-380)
**Status:** ✅ Fixed

**Fix Implemented:**
- Added `progressDataRef = useRef<SeekProgressData>({})` to track latest data
- All `setProgressData` calls now also update `progressDataRef.current`
- Library count verification reads from `progressDataRef.current`
- Result building and error handling use `progressDataRef.current`
- No more stale closure issues

---

#### S9: JSON Parsing Can Fail Silently ✅ FIXED
**Location:** `src/app/api/seek-stream/route.ts:runPythonScriptStream()` (line 141-151)
**Status:** ✅ Fixed

**Fix Implemented:**
- JSON parsing errors now logged to logger
- Logs problematic JSON (first 500 chars) for debugging
- Still accumulates incomplete JSON for retry
- Errors are visible in server logs

---

#### S10: No Check for Complete Marker Before Verifying Library Count ✅ FIXED
**Location:** `src/components/SeekSection.tsx:handleSearch()` (line 107, 319-325, 360-374)
**Status:** ✅ Fixed

**Fix Implemented:**
- Added `receivedCompleteMarker` ref (shared with S3 fix)
- After stream ends, checks if complete marker was received
- If no marker, logs warning and still checks Library count
- If items were saved despite missing marker, logs success
- Result `success` field reflects complete marker status

---

### 🟡 MEDIUM (Nice to Fix)

#### S11: Empty Conversations List Error Message Could Be Clearer ⚠️
**Location:** `engine/seek.py:seek_use_case()` (line 232-245)

**Problem:**
- If no conversations found, error is emitted and function returns early
- Error message is clear but could include more actionable guidance
- No suggestion to try different keywords or date range

**Impact:**
- Minor: User may not know how to improve search

**Recommendation:**
- Enhance error message with specific suggestions
- Include query in error message for context

---

#### S12: Stream Parser Doesn't Handle Malformed Markers ⚠️
**Location:** `src/app/api/seek-stream/route.ts:runPythonScriptStream()` (line 134-229)

**Problem:**
- If Python emits malformed marker (e.g., `[PHASE:invalid`), parser ignores it
- No error logged, no way to debug
- Progress updates may be missed

**Impact:**
- Silent failures in progress tracking
- Hard to debug why progress isn't updating

**Recommendation:** Log warnings for lines that look like markers but don't match patterns.

---

#### S13: No File Locking for Concurrent Seek Runs ❌
**Location:** `engine/seek.py:seek_use_case()` (line 390-402)

**Problem:**
- If two seek runs happen concurrently, they may process same output files
- No file locking mechanism
- Second run could delete file before first run finishes

**Impact:**
- Race condition in harmonization
- Potential data loss

**Recommendation:** Add file locking or process-level mutex for harmonization (like Generate flow).

---

#### S14: Progress Ref Not Reset Between Runs ❌
**Location:** `src/components/SeekSection.tsx:handleSearch()` (line 166-170)

**Problem:**
- `progressData` state is reset at start of run
- But if previous run errored, state may have stale data
- New run may show incorrect initial state

**Impact:**
- Minor: Stale progress data shown briefly

**Recommendation:**
- Ensure state is reset before every run
- Add explicit reset in error handler

---

#### S15: Error Explainer Doesn't Handle Seek-Specific Errors ⚠️
**Location:** `src/lib/errorExplainer.ts`

**Problem:**
- Error explainer is designed for Generate flow
- Seek-specific errors (e.g., "no_conversations", "harmonization_failed") may not be handled well
- No Seek-specific error messages

**Impact:**
- Generic error messages for Seek failures
- Less helpful guidance

**Recommendation:**
- Add Seek-specific error patterns to explainer
- Include query context in error messages

---

### 🟢 LOW (Optional)

#### S16: Parallel Search Exceptions Not Fully Handled ❌
**Location:** `engine/seek.py:_get_relevant_conversations_for_query()` (line 127-136)

**Problem:**
- `ThreadPoolExecutor` runs searches in parallel
- `future.result()` can raise if individual search fails
- Exception propagates and stops entire search even if other searches succeeded
- Partial results are lost

**Impact:**
- One failed search query kills entire search
- Partial results not used
- User sees generic error instead of partial success

**Evidence:**
```python
# Line 127-136: No exception handling per-future
with ThreadPoolExecutor(max_workers=min(len(all_queries), 5)) as executor:
    futures = {executor.submit(search_query, q): q for q in all_queries}
    for future in as_completed(futures):
        matches = future.result()  # Raises if search failed!
        # ...
```

**Recommendation:**
- Wrap `future.result()` in try/except
- Continue with partial results if some searches fail
- Log which queries failed

---

#### S17: Embedding Batch Generation Can Fail Silently ❌
**Location:** `engine/seek.py:seek_use_case()` (line 469-475)

**Problem:**
- `batch_get_embeddings()` can fail (API error, timeout)
- Exception is not caught at this location
- Entire harmonization fails even if embeddings for some items succeeded

**Impact:**
- Entire batch fails if one embedding fails
- No partial recovery

**Evidence:**
```python
# Line 469-475: No try/except
texts = [f"{p['title']} {p['description']}" for p in prepared_items]
embeddings = batch_get_embeddings(texts)  # Can raise!

for i, item in enumerate(prepared_items):
    item["embedding"] = embeddings[i]
```

**Recommendation:**
- Wrap in try/except
- Emit error marker if embedding generation fails
- Consider individual fallback for failed embeddings

---

#### S18: Token Estimation Uses Rough Multipliers ❌
**Location:** `engine/seek.py:seek_use_case()` (line 321-340)

**Problem:**
- Token estimation uses `estimate_tokens()` which may be inaccurate
- Cost tracking relies on estimates, not actual API response
- Actual costs may differ from displayed costs

**Impact:**
- Cost estimates may be inaccurate
- User may be surprised by actual costs

**Recommendation:**
- Track actual token counts from API responses (if available)
- Use estimates as fallback only

---

#### S19: No Validation of LLM Output Format Before Parsing ❌
**Location:** `engine/seek.py:seek_use_case()` (line 342-388)

**Problem:**
- Parser assumes LLM will use specific format (`## Item N:` or `## Use Case N:`)
- No validation that format is correct before parsing
- Silent failure if format is wrong

**Impact:**
- Parsing failures are silent
- No way to detect format issues early

**Recommendation:**
- Validate output format before parsing
- Emit warning if format looks wrong
- Show sample of raw output in error message

---

#### S20: AbortController Not Reset on Error ❌
**Location:** `src/components/SeekSection.tsx:handleSearch()` (line 396)

**Problem:**
- `abortController.current` is reset in `finally` block
- But if error occurs before `finally`, controller may not be reset
- Next run may use stale controller

**Impact:**
- Minor: Stale abort controller
- Low priority

**Recommendation:**
- Ensure abortController is reset in all code paths
- Add explicit reset in error handler

---

#### S21: Compression Parallel Exceptions Not Handled ❌
**Location:** `engine/seek.py:seek_use_case()` (line 279-288)

**Problem:**
- Compression uses ThreadPoolExecutor like search
- `future.result()` can raise if compression fails
- One failed compression stops entire process

**Evidence:**
```python
# Line 284-288: No exception handling per-future
for future in as_completed(futures):
    compressed_conv = future.result()  # Can raise!
    compressed_conversations.append(compressed_conv)
    compressed_count += 1
```

**Impact:**
- One failed compression kills entire run
- Partial results lost

**Recommendation:**
- Wrap in try/except, continue with uncompressed conversation on failure
- Log which conversations failed compression

---

#### S22: Missing Search Phase Progress Markers ❌
**Location:** `engine/seek.py:_get_relevant_conversations_for_query()` (line 104-155)

**Problem:**
- No `emit_search_started()` or `emit_search_complete()` calls
- Search phase duration not tracked in performance logs
- Frontend can't show granular search progress

**Impact:**
- Less visibility into search performance
- Can't identify search bottlenecks

**Recommendation:**
- Add `emit_search_started()` before parallel search
- Add `emit_search_complete()` with conversation count

---

#### S23: Query Length Not Validated ❌
**Location:** `engine/seek.py:seek_use_case()` (line 204)

**Problem:**
- User query is truncated to 50 chars for stat emission but not validated
- Very long queries could cause:
  - Excessive embedding generation costs
  - Prompt length issues
  - Slow semantic search

**Evidence:**
```python
emit_stat("query", query[:50] + "..." if len(query) > 50 else query)
# But full query is used everywhere else
```

**Impact:**
- Minor: Performance/cost issues with very long queries

**Recommendation:**
- Add query length validation (e.g., max 500 chars)
- Emit warning if query is truncated

---

## Summary by Component

### Frontend (`src/components/SeekSection.tsx`)
- **Issues:** S3, S4, S8, S10, S14, S20
- **Focus:** Error handling, state management, Library count verification, timeout handling

### API Route (`src/app/api/seek-stream/route.ts`)
- **Issues:** S7, S9, S12
- **Focus:** Process cleanup, stream parsing, JSON handling

### Python Backend (`engine/seek.py`)
- **Issues:** S1, S2, S5, S6, S11, S13, S16, S17, S19, S21, S22, S23
- **Focus:** Error handling, parsing, harmonization, file I/O, thread safety, progress markers

### Error Explainer (`src/lib/errorExplainer.ts`)
- **Issues:** S15
- **Focus:** Seek-specific error patterns

---

## Recommended Fix Priority

| Phase | Issues | Status |
|-------|--------|--------|
| Phase 1 (Critical) | S1, S2, S3, S4 | ✅ Fixed |
| Phase 2 (High) | S5, S6, S7, S8, S9, S10 | ✅ Fixed |
| Phase 3 (Medium) | S11-S15 | ❌ Not yet fixed |
| Phase 4 (Low) | S16-S23 | ❌ Not yet fixed |

---

---

## Implementation Details

### Files Modified

1. **`engine/seek.py`**
   - S1: Added parsing failure warning and debug file saving
   - S2: Added try/except around harmonization with file preservation
   - S5: Added LLM error classification
   - S6: Wrapped file save in try/except

2. **`src/components/SeekSection.tsx`**
   - S3/S10: Added `receivedCompleteMarker` ref
   - S4: Added 60-second timeout for streaming reader
   - S8: Added `progressDataRef` for stale closure fix

3. **`src/app/api/seek-stream/route.ts`**
   - S7: Added cleanup of `.tmp` files on abort
   - S9: Added logging for JSON parse errors

---

## Testing Recommendations

1. **Parsing Failure Tests:**
   - Mock LLM to return malformed output
   - Verify error markers are emitted
   - Verify output file is preserved

2. **Harmonization Failure Tests:**
   - Mock database to fail mid-batch
   - Verify output files are not deleted
   - Verify partial success stats are returned

3. **Stream Interruption Tests:**
   - Kill Python process mid-stream
   - Verify frontend handles gracefully
   - Verify Library count verification works

4. **Timeout Tests:**
   - Simulate stalled Python process
   - Verify timeout triggers abort
   - Verify user gets clear error message

---

## Comparison with Generate Flow

| Issue Type | Generate Flow | Seek Flow | Status |
|------------|---------------|-----------|--------|
| Parsing failures silent | ✅ Fixed (C1) | ❌ S1 | Same pattern, can apply fix |
| Orphaned files on failure | ✅ Fixed (C2) | ❌ S2 | Same pattern, can apply fix |
| Missing complete marker | ✅ Fixed (C3) | ⚠️ S3 | Python has finally block, frontend needs fix |
| No streaming timeout | ✅ Fixed (C5) | ❌ S4 | Same pattern, can apply fix |
| LLM error classification | ✅ Fixed (H2) | ❌ S5 | Same pattern, can apply fix |
| File I/O not caught | ✅ Fixed (H4) | ❌ S6 | Same pattern, can apply fix |
| Abort cleanup | ✅ Fixed (H7) | ❌ S7 | Same pattern, can apply fix |
| Stale closure in state | ✅ Fixed (useRef) | ❌ S8 | Same pattern, can apply fix |
| Race condition locking | ✅ Fixed (H9) | ❌ S13 | Same pattern, can apply fix |
| Parallel exception handling | Not applicable | ❌ S16, S21 | Seek-specific (ThreadPoolExecutor) |
| Missing progress markers | N/A | ❌ S22 | Seek-specific |

**Key Differences from Generate:**
1. Seek uses more parallel processing (ThreadPoolExecutor) - needs additional exception handling
2. Seek has search + compression phases before generation - more places for failures
3. Seek's `emit_phase("complete")` IS in finally block (line 504-506) - Python side is better, but frontend still needs timeout

**Conclusion:** Many fixes from Generate can be applied to Seek. Some issues are Seek-specific (parallel processing, compression).

---

**Next Steps:**
1. Review this audit
2. Prioritize fixes based on user impact
3. Apply Generate flow fixes to Seek where applicable
4. Implement Seek-specific fixes
5. Run tests and verify fixes
