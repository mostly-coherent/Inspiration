# Inspiration — Pivots & Decisions

> **Purpose:** Technical decisions and course corrections
> - Document WHY we chose certain approaches
> - Track when implementation diverges from PLAN.md
> - Append chronologically (never replace)

---

## Decision: Harmonization Performance Optimization - 2026-01-10

**Problem:** As Library grew to 275+ items, harmonization (deduplication) became the dominant bottleneck:
- Finding similar items required regenerating embeddings for ALL existing items
- 10 new items × 275 existing items = 2,750 embedding API calls
- Harmonization took 60-120 seconds, users complained of "slow saves"

**Decision:** Implement three-layer optimization stack:

| Layer | Change | Impact |
|-------|--------|--------|
| **IMP-15: pgvector RPC** | Store embeddings in `vector(1536)` column; server-side similarity search via RPC | Embeddings generated ONCE at creation |
| **IMP-16: Batch + Parallel** | `batch_add_items()` with `ThreadPoolExecutor` (5 workers); batch inserts | 10 parallel searches instead of 10 sequential |
| **IMP-17: Topic Filter** | Pre-filter conversations before LLM generation | Skip generation for covered topics entirely |

**Combined Impact:**
- Embedding API calls: 275+ → 1 per new item (**275x reduction**)
- Harmonization time: 60-120s → 2-5s (**20-60x faster**)
- LLM cost for repeat topics: 100% → 0% (**50-80% savings**)

**Alternatives Considered:**

1. **Client-side caching (in-memory):** Rejected. Embeddings too large for memory; doesn't persist across sessions.
2. **Approximate Nearest Neighbor (ANN) index:** Rejected for now. pgvector already fast enough at 275 items; can add `ivfflat` index later if needed at 10K+ items.
3. **Async harmonization:** Considered but orthogonal. These optimizations make sync fast enough (<5s).

**Occurrence Signal Preservation:**
Critical fix: When topic filter skips a conversation (topic already covered), we STILL:
1. Increment `occurrence` (the topic was seen again)
2. Update `last_seen` (for freshness)
3. Expand `source_start_date`/`source_end_date` (for coverage accuracy)

Without this, Theme Explorer would under-rank frequently-discussed topics.

**Code Paths Affected:**
- `engine/scripts/optimize_harmonization.sql` — New vector column + RPC
- `engine/common/items_bank_supabase.py` — `batch_add_items()`, pgvector RPC calls
- `engine/common/topic_filter.py` — New module for pre-generation filtering
- `engine/generate.py` — Integrated topic filter, batch harmonization
- `engine/scripts/backfill_library_embeddings.py` — Backfill script for existing items

**Status:** ✅ Implemented | **DRI:** AI Agent

---

## Decision: Coverage Intelligence — Automated Library Growth - 2026-01-10

**Problem:** Users are busy and reflective builders—they come to Inspiration to decompress, be inspired, and reflect on themes in their own thinking. They don't enjoy manually configuring and running generations. With 200+ items and months of chat history, users can't tell which time periods are well-covered vs. missing from their Library.

**Decision:** Build a Coverage Intelligence system that:
1. Analyzes Memory terrain (conversation density by week)
2. Compares against Library coverage (which periods have items derived from them)
3. Identifies coverage gaps (high chat density but low/no Library items)
4. Suggests generation runs sized appropriately for each gap
5. Shows estimated cost before execution
6. Allows users to click to run without manual configuration

**Key Design Choices:**

| Choice | Decision | Rationale |
|--------|----------|-----------|
| **Granularity** | Weekly | Matches natural work rhythms; daily too noisy, monthly too coarse |
| **Conversation Count** | All conversations (not just semantically relevant) | Goal is to map raw material density, not topic relevance |
| **Queue Management** | Manual click to execute (for now) | Start simple; auto-queue can be added later |
| **Run Modes** | Both Ideas and Insights per gap | Users want variety; let them choose which to run |
| **Coverage Rule** | 1 item per 10 conversations = healthy | Empirical balance—too many items = noise, too few = missed coverage |

**Run Sizing Strategy:**

| Gap Severity | Conversations | Expected Items | Rationale |
|--------------|--------------|----------------|-----------|
| High | 50+ | 10 items | Lots of material to mine |
| High | 30-49 | 8 items | Significant gap |
| Medium | 20+ | 5 items | Moderate gap |
| Low | Any | 3 items | Light maintenance |

**Alternatives Considered:**

1. **Full automation (auto-run suggested jobs):** Rejected for v1. Users want control over when costs are incurred. Can add auto-queue with budget limits later.

2. **Topic-based coverage (semantically relevant conversations):** Rejected. Goal is to map raw material density across time, not topic coverage. Topic analysis is better served by Theme Explorer.

3. **Daily granularity:** Rejected. Too noisy—many days have 0-1 conversations, creating lots of trivial gaps.

4. **Monthly granularity:** Rejected. Too coarse—a month with 100 conversations and 5 items might hide a week with 50 conversations and 0 items.

**Code Paths Affected:**
- `engine/scripts/add_coverage_tables.sql` — Schema + RPC function
- `engine/common/coverage.py` — Backend analysis logic
- `engine/generate.py` — Track `source_start_date`/`source_end_date` on generated items
- `engine/common/items_bank_supabase.py` — Store source dates
- `src/app/api/coverage/*` — Three new API endpoints
- `src/components/CoverageDashboard.tsx` — Visualization UI
- `src/app/coverage/page.tsx` — Dedicated page

**Impact:**
- **Scope:** Major new feature (v5 in PLAN.md)
- **Timeline:** Single session implementation
- **Architecture:** New bounded context (Coverage Intelligence) with dedicated page

**Status:** ✅ Implemented | **DRI:** AI Agent

---

## Critical Fix: Expand Source Date Range on Deduplication - 2026-01-10

**Problem:** Coverage Intelligence could create an infinite loop of false coverage gaps.

**Scenario:**
1. Week A (Jan 1-7): 50 conversations about "AI agents"
2. Week B (Jan 8-14): 30 conversations about "AI agents"
3. Run for Week B → 10 items added with `source_start_date = Jan 8`
4. Run for Week A → 10 items generated, but similar to Week B items → **ALL deduplicated, 0 new items**
5. Week A still shows as a coverage gap (no items with `source_start_date` in Jan 1-7)
6. User runs again → Same result → **Infinite frustration loop**

**Root Cause:** When harmonization finds a similar existing item, it only incremented `occurrence` count but did NOT expand the item's source date range. The existing item still only "covered" its original period, not the period that triggered the deduplication.

**Fix:** When deduplicating, expand the existing item's source date range to include the new period:

```python
# When similar item found during deduplication:
existing_item.source_start_date = MIN(existing.start, new.start)
existing_item.source_end_date = MAX(existing.end, new.end)
```

**Result:**
- Item about "AI agents" now has `source_start_date = Jan 1` and `source_end_date = Jan 14`
- Week A is correctly marked as "covered" by this item
- Coverage analysis no longer shows Week A as a gap

**Why This Is More Accurate:** An item spanning Jan 1-14 reflects reality—the same concept appeared across multiple time periods. This is a persistent theme worth noting, not a coverage gap.

**Code Paths Affected:**
- `engine/common/items_bank.py` — Updated `add_item()` to expand date range on existing item update
- `engine/common/items_bank_supabase.py` — Added `_find_and_update_similar()` and `_update_existing_item_on_dedup()` methods

**Verification:**
```bash
# Test: Run for Week A after Week B has items
# Expected: Week A coverage shows as covered (not a gap)
# Even if 0 new items added, existing items' date ranges expand
```

**Status:** ✅ Implemented | **DRI:** AI Agent

---

## Decision: Remove Power Features Section - 2026-01-10

**Problem:** The Power Features section (Social Media Sync and Solved Status Sync) was orphaned after implementation status was deprecated. These features were:
- **Social Media Sync:** Mark insights as "shared" when they match social media posts
- **Solved Status Sync:** Mark ideas as "solved" when they match projects in workspaces

**Decision:** Remove Power Features section entirely from Settings

**Rationale:**
1. **Implementation status deprecated:** The "implemented" field was removed in the Major Feature Declutter (2026-01-10), making these features meaningless
2. **Never used:** No backend logic ever consumed `linkedInSync` or `solvedStatusSync` config values
3. **Orphaned UI:** Settings page displayed these options but they had no effect
4. **Complexity without value:** Added cognitive load to onboarding wizard (5 steps → 4 steps now)

**Alternatives Considered:**
1. **Keep config but hide UI** — Rejected: Dead code is technical debt
2. **Repurpose for other features** — Rejected: No clear use case
3. **Remove entirely** — ✅ Chosen: Clean break, simpler onboarding

**Impact:**
- **Scope:** Removed PowerFeaturesSection component, linkedInSync/solvedStatusSync from config types
- **Onboarding:** Reduced from 5 steps to 4 steps (Workspaces → VectorDB → Voice → LLM → Done)
- **Settings:** General tab now has 4 sections instead of 5
- **Codebase:** ~80 lines of dead code removed

**Status:** ✅ Implemented | **DRI:** AI Agent

---

## Decision: Major Feature Declutter - 2026-01-10

**Problem:** The Inspiration app accumulated many features that added complexity without proportional value:
- **Quality rating (A/B/C):** Users never filtered by quality; items naturally surface by occurrence/recency
- **Implementation status:** With 200+ items, tracking "done vs pending" became noise—users want to explore themes, not tick off checklists
- **Tags:** 100+ tags = cognitive overload; Seek mode serves the "find something specific" use case better
- **Top 3 Today / Build/Share Next:** Hit-or-miss recommendations; Theme Explorer does this better with visual clustering
- **Themes Overview in Library:** Too many "Uncategorized" items made this useless; Theme Explorer is canonical
- **Run History:** Never consulted; users don't care about past generation runs
- **File Tracking Config:** Tied to implementation status which was removed

**Decision:** Remove all low-value features; simplify to core use cases

**Rationale:**
1. **User intent:** Users come to Inspiration for clarity, ideas, and insights—not to manage a complex database
2. **Theme Explorer is the centerpiece:** Visual exploration of themes/patterns is the unique value; everything else is secondary
3. **Library is for reference, not management:** Users browse, search, reflect—they don't need elaborate filtering/sorting
4. **Seek handles specificity:** If users want something specific, they use Seek mode, not tag filters
5. **Less is more:** Fewer features = faster app, easier onboarding, clearer purpose

**Alternatives Considered:**
1. **Keep all features but hide behind "Advanced" toggle** — Rejected: Still maintenance burden, confusing UX
2. **Gradually deprecate with warnings** — Rejected: Rip-the-bandaid-off is cleaner
3. **Convert to user-optional plugins** — Rejected: Over-engineering for features nobody uses
4. **Remove features and clean up dead code** — ✅ Chosen: Clean break, simpler codebase

**Impact:**
- **Scope:** Removed 5+ features, 4 API routes, dozens of UI elements
- **Types:** Simplified `Item` interface, reduced `ItemStatus` to 2 values
- **Settings:** File Tracking section removed
- **Codebase:** ~500 lines of dead code removed

**Post-Cleanup App Focus:**
1. **Memory Status:** How big is my chat history? Is it synced?
2. **Library Overview:** How many items? What themes emerged?
3. **Theme Explorer (LIB-8):** Pattern discovery in current Library (1/3 of Longitudinal Intelligence complete)
4. **Generate/Seek:** Occasional targeted extraction when something feels missing
5. **Coverage Intelligence (v5):** Automated gap detection and suggested runs

**Longitudinal Intelligence Roadmap:**
- ✅ **LIB-8 (Theme Synthesis):** Theme Explorer operational
- ⏳ **LIB-9 (Learning Trajectory):** Track interest shifts over time — Pending
- ⏳ **LIB-10 (Gap Detection):** Identify unexplored topics — Pending

---

## Decision: Migrate Library from JSON to Supabase - 2026-01-09

**Problem:** Vercel deployment failed with timeout errors when loading Library. With 245+ items, the `items_bank.json` file grew to 11MB. Parsing it from filesystem took 2-5 seconds locally and 30+ seconds on Vercel (often exceeding timeout limits). The app frequently crashed with "504 Gateway Timeout" errors.

**Root Cause:** 
- **Serverless filesystem limitations:** Vercel's serverless functions don't have local disk cache. Every API request re-reads and re-parses the entire 11MB JSON file from scratch.
- **JSON parsing overhead:** Parsing large JSON files is CPU-intensive and doesn't scale.
- **No indexing:** Filtering/searching requires loading entire file into memory.

**Decision:** Migrate Library storage to Supabase PostgreSQL

**Rationale:**
1. **Performance:** PostgreSQL with indexes provides 50-100ms response times vs 2-5s JSON parsing
2. **Scalability:** Can handle 10,000+ items without performance degradation
3. **Vercel compatibility:** Database queries work perfectly in serverless environment
4. **Already using Supabase:** Vector DB for chat history already deployed, adding Library tables is minimal overhead
5. **Server-side pagination:** Enables efficient pagination for large libraries (50 items per page)

**Alternatives Considered:**
1. **Keep JSON, optimize parsing** — Rejected: Doesn't solve serverless filesystem issue
2. **Use IndexedDB (client-side)** — Rejected: Requires downloading entire dataset to browser, poor UX for mobile
3. **Split JSON into multiple files** — Rejected: Doesn't address root cause, adds complexity
4. **Supabase PostgreSQL** — ✅ Chosen: Proven solution, already in tech stack, instant queries

**Code Paths Affected:**
- `engine/scripts/add_library_tables.sql` — Supabase schema (tables, indexes, RLS policies)
- `engine/scripts/migrate_library_to_supabase.py` — One-time migration script with verification
- `engine/common/items_bank_supabase.py` — Supabase storage layer (replaces JSON I/O)
- `src/app/api/items/route.ts` — Switched from JSON file reads to Supabase queries
- `engine/generate.py` — Uses `items_bank_supabase.py` for harmonization
- `engine/seek.py` — Uses `items_bank_supabase.py` for harmonization

**Migration Safety:**
- Full backup created: `data/items_bank_backup_20260109_134441.json`
- Old API route backed up: `src/app/api/items/route.ts.backup`
- Verification passed: 245 items migrated, counts match exactly
- Rollback possible: Restore from backup and switch route back

**Performance Impact:**

| Metric | Before (JSON) | After (Supabase) | Improvement |
|--------|--------------|-----------------|-------------|
| API Response Time | 2-5 seconds | 50-100ms | **50x faster** |
| Vercel Timeout | Frequent (30s+) | None (< 1s) | **No timeouts** |
| Query Time | Full file parse | Indexed SQL | **Instant** |
| Scalability | Fails > 500 items | Scales to 10,000+ | **20x capacity** |
| Memory Usage | 11MB per request | ~1-2MB | **5-10x less** |

**Verification:**
```bash
# Test migration locally
cd engine
python3 scripts/migrate_library_to_supabase.py

# Verify API works
curl http://localhost:3000/api/items?view=items

# Run E2E tests
npm test
```

**Impact:**
- **Scope:** Major architectural change (storage layer), but API interface unchanged
- **Timeline:** Immediate fix for Vercel deployment
- **Architecture:** Library now fully cloud-native (Supabase), no dependency on local filesystem

**Status:** Implemented | **DRI:** AI Assistant | **Date:** 2026-01-09

---

## Decision: Supabase Made Optional for Small Histories - 2026-01-09

**Problem:** Original design required Supabase Vector DB for all users, creating unnecessary friction for new users with small chat histories (< 50MB). The setup wizard required 3 API keys before users could see any value.

**Decision:** Make Supabase optional based on chat history size:

| Chat DB Size | Supabase Requirement | Rationale |
|-------------|---------------------|-----------|
| < 50MB | Optional | Local search works fine, user can add later |
| 50-500MB | Recommended | Performance benefit, but local works |
| > 500MB | Required | Local search too slow, Vector DB necessary |
| Cloud mode | Required | No local file access on Vercel |

**Alternatives Considered:**
1. **Always require Supabase** — Rejected: Too much friction for new/casual users
2. **Never require Supabase** — Rejected: Large histories (>500MB) would have terrible UX
3. **Tiered approach** — ✅ Chosen: Best of both worlds

**Code Paths Affected:**
- `src/app/onboarding/page.tsx` — Detects DB size, shows skip option for small histories
- `src/app/api/config/env/route.ts` — Made Supabase keys optional
- `src/app/page.tsx` — Redirect logic checks `setupComplete` flag

**Impact:**
- **Scope:** Reduced minimum setup from 3 keys to 1 key (Anthropic only)
- **Timeline:** No change (onboarding still fast)
- **Architecture:** Need to handle "no Vector DB" gracefully in search code

**Verification:**
```bash
# Test onboarding in preview mode
http://localhost:3000/onboarding?preview=true

# Run onboarding tests
npx playwright test --grep "Onboarding"
```

**Status:** Implemented | **DRI:** AI Assistant

---

## Decision: Resilience Strategy for Cursor DB Schema Changes - 2026-01-08

<!-- Merged from RESILIENCE_STRATEGY.md on 2026-01-09 -->

**Problem:** Cursor periodically changes its internal chat history database architecture, which can break Inspiration's extraction logic. Historical example: "The Bubble Problem" where messages moved from direct `composerData` entries to `bubbleId` references.

**Decision:** Implement multi-layer resilience:
1. **Schema Health Check** (`db_health_check.py`) — Detect schema changes before extraction
2. **Enhanced Error Surfacing** — Categorize errors with remediation steps
3. **Sync-Time Validation** — Abort early if schema incompatible
4. **Diagnostic Report Generation** — Auto-generate bug reports

**Alternatives Considered:**
1. **Just fix when it breaks** — Rejected: Poor UX, users get cryptic errors
2. **Multi-strategy extraction with fallbacks** — Deferred: Complex, may extract bad data silently
3. **Schema health check + clear errors** — ✅ Chosen: Best balance of safety and UX

**Trade-off:** Prioritize clear errors over silent degradation. Users should know when something is wrong rather than getting incomplete/incorrect data.

**Code Paths Affected:**
- `engine/common/db_health_check.py` — Schema detection and diagnostics
- `engine/scripts/sync_messages.py` — Health check integration
- `src/app/api/sync/route.ts` — Enhanced error responses

**Status:** Implemented | **DRI:** AI Assistant

---

## Complete Removal: "Candidates" Concept Eliminated - 2026-01-08

**Problem:** UI showed "Candidates Generated: 1" despite 14 items being added to Library. User correctly identified that "Candidates" is a deprecated concept that should be completely removed from the codebase.

**Root Cause:** The v2 Item-Centric Architecture pivot (2026-01-01) eliminated the "Candidates" concept in principle, but the implementation left remnants throughout the stack:
- Backend still had `all_candidates` parameters in save functions
- `generate_content()` returned a tuple `(content, candidates)` for "backward compatibility"
- "All Generated Candidates" section was still being generated in output files
- Frontend used `candidatesGenerated` field name
- UI labels still showed "Candidates Generated"
- Parsers looked for "Candidates" in output

**Decision:** Complete elimination - no "migration" or "renaming", just removal. The app generates **Items** (insights/ideas/use cases), harmonizes them into the **Library**, and auto-groups them into **Categories**. There is no intermediate "Candidates" concept.

**Code Paths Affected:**

**Backend (Python):**
- [x] `engine/generate.py` — Removed `all_candidates` parameter from `save_output()` and `save_aggregated_output()`
- [x] `engine/generate.py` — Removed "All Generated Candidates" section generation code
- [x] `engine/generate.py` — Changed `generate_content()` return type from `tuple[str, list]` to `str`
- [x] `engine/generate.py` — Updated `_parse_output()` to remove candidates section parsing
- [x] `engine/generate.py` — Updated all `save_output()` calls to remove `all_candidates` argument
- [x] `engine/seek.py` — Updated to use new `generate_content()` signature
- [x] `engine/api.py` — Updated parser to look for "Items generated/returned" instead of "Candidates"

**Frontend (TypeScript/React):**
- [x] `src/lib/types.ts` — Renamed `candidatesGenerated` → `itemsGenerated`, removed deprecated fields
- [x] `src/app/api/generate/route.ts` — Updated parser and all references to use `itemsGenerated`
- [x] `src/components/ResultsPanel.tsx` — Changed all labels to "Items Generated", updated cost estimation
- [x] `src/components/RunHistory.tsx` — Changed all labels to "Items", updated all field references
- [x] `src/app/page.tsx` — Updated stats initialization
- [x] `src/lib/resultParser.ts` — Removed "All Generated Candidates" parsing logic

**Verification:**
```bash
# No linter errors
npm run build

# No user-facing "Candidates" text
grep -r "[Cc]andidate" src/ | grep -v "node_modules" | grep -v ".next"
# Only shows internal field names and test descriptions

# Test end-to-end
npm run dev
# Generate Insights → Verify "Items Generated" matches harmonization count
```

**Status:** ✅ Implemented | **DRI:** AI Assistant

**Lesson Learned:** When eliminating a concept (not just renaming), be ruthless:
1. **Remove, don't rename:** Delete parameters, not just change names
2. **Simplify return types:** If function returned tuple for "compatibility", simplify it
3. **Delete generated sections:** Remove code that generates deprecated output
4. **Search exhaustively:** `grep -r` for all variations of the term
5. **Update types first:** TypeScript will catch all references that need updating

The original "fix" tried to maintain backward compatibility by keeping field names. The correct fix was complete removal - the concept doesn't exist, so the code shouldn't reference it anywhere.

---

## Decision: v3 UX Redesign — Library-Centric Architecture - 2026-01-01

**Decision:** Redesign frontend to center on Library (accumulated items) as core value prop, with full configuration exposure. Rename "Brain" → "Memory" and "Bank" → "Library".

**Rationale:**
- **User Mental Model:** Users measure success by Library growth, not by generation runs. The Library is the scoreboard.
- **Public Release:** App is going public; UX must be optimized for new users, not just the original developer.
- **Configuration Transparency:** Power users need to tune all parameters (temperature, similarity, LLM assignments) without code changes.
- **Analysis Assurance:** Users need confidence the app analyzed the right data before trusting "0 items found" results.
- **Memory Jog:** Items should link back to source chat context (dates, workspaces) to help users remember what they were doing.

**Terminology Changes:**
- "Brain" → "Memory" (clearer: "Your Memory" = indexed AI conversations)
- "Bank" → "Library" (familiar: like building a personal library of ideas)

**UI Changes:**
- Scoreboard Header: Always-visible Memory + Library stats
- Two-Panel Layout: Library (left) + Generate/Seek (right)
- Analysis Coverage: Show messages/dates/workspaces analyzed before and after generation
- Library Delta: Show "+N new items" after each run
- Item Source Context: Link items to source chat dates and workspaces

**Configuration Exposure:**
- LLM Assignments: generation, judging, embedding, compression (all configurable)
- Thresholds: temperature, dedup, category similarity, compression (all exposed in Settings)
- Prompt Templates: view/edit system prompts per mode
- Reference Paths: voice guide, golden examples, posted/implemented folders

**Alternatives Considered:**
- Keep current UI (rejected: Bank value is hidden, new users won't understand value prop)
- Add tabs/navigation (rejected: fragments experience, adds clicks)
- Focus on generation UI (rejected: inverts the actual user mental model)

**Status:** ✅ Implemented | **DRI:** User + AI Assistant

**Impact:**
- Scope: Frontend-only changes (backend stable)
- Timeline: 3 phases (Scoreboard → Layout → Config) - ALL COMPLETE
- Architecture: No backend changes; frontend componentization

---

## Decision: V3-2 — Two-Panel Layout Implementation - 2026-01-02

**Decision:** Implement side-by-side layout with Library on the left and Generate/Seek actions on the right, completing the final v3 feature.

**Changes Implemented:**
1. **Two-Panel Grid Layout:**
   - Desktop: 12-column grid (5 cols Library, 7 cols Action)
   - Mobile: Stacked layout (Action first, then Library)
   - Widened container from `max-w-5xl` to `max-w-7xl`

2. **Library Panel (Left):**
   - Sticky positioning on desktop
   - Compact stats grid (4 columns: Items, Cats, Done, Active)
   - Scrollable content area with `max-h-[60vh]`
   - Mobile collapse toggle (always expanded on desktop)

3. **Action Panel (Right):**
   - Mode selection, time presets, generate button
   - Analysis coverage, results, run history
   - Seek section for Use Case mode

4. **LibrarySearch Compact Mode:**
   - 2x2 filter grid (Type, Status, Category, Sort)
   - Smaller search input
   - Full functionality in narrower space

**Rationale:**
- **Simultaneous View:** Users see their Library while generating, reinforcing the "grow your Library" mental model
- **Efficiency:** No scrolling between Library and Actions
- **Responsive:** Works on both desktop (side-by-side) and mobile (stacked)
- **v3 Completion:** Final feature to complete the Library-centric UX redesign

**Status:** ✅ Implemented | **DRI:** AI Assistant

---

## Decision: v3 Phase 2 — Rich Library Experience - 2026-01-02

**Decision:** Implement rich ItemCard component with memory jog features and full search/filter capability for the Library.

**Changes Implemented:**
1. **ItemCard Component** — Shows each item with:
   - Type emoji (💡/✨/🔍) and recency indicator ("3d ago")
   - Date range display ("Dec 19 → Jan 1")
   - Occurrence count ("💬 5x mentioned")
   - Category badge and status indicator
   - Expandable description and tags

2. **LibrarySearch Component** — Full-featured filtering:
   - Full-text search across title, description, tags, content
   - Type filter (Idea, Insight, Use Case)
   - Status filter (Active, Built, Posted, Archived)
   - Category filter with item counts
   - Sort options (Most Recent, Most Mentioned, A-Z)

3. **BanksOverview Refactor** — Integrated new components:
   - Replaced inline item rendering with ItemCard
   - Replaced old filter dropdowns with LibrarySearch
   - Added filtered count display

**Rationale:**
- **Memory Jog:** Users need contextual metadata (dates, counts) to reconnect with past thinking
- **Discoverability:** As Library grows, search and filtering become essential
- **Progressive Disclosure:** Show less by default, let users expand on demand
- **Visual Encoding:** Recency coloring (green → gray) enables quick scanning

**Risks Identified:**
- Client-side filtering may lag for 1000+ items → future server-side pagination
- Filter state not persisted → consider URL params or localStorage
- Category lookup creates memory overhead → mitigated with useMemo

**Status:** ✅ Implemented | **DRI:** AI Assistant

**Impact:**
- Scope: Frontend only (Library section)
- Timeline: 1 session
- Architecture: New components (ItemCard, LibrarySearch), refactored BanksOverview

---

## Decision: v3 Phase 3 — Settings Configuration Hub - 2026-01-02

**Decision:** Create a comprehensive Settings Configuration Hub exposing all previously-hardcoded parameters to users.

**Components Implemented:**

1. **AdvancedConfigSection Component** — Collapsible sections for:
   - LLM Task Assignments (generation, judging, embedding, compression)
   - Global Thresholds (category similarity, judge temperature, compression thresholds)
   - Custom Time Presets (6h, 12h, etc.)

2. **PromptTemplateEditor Component** — In-browser prompt editing:
   - View all prompt templates (base, ideas, insights, use_case, judge)
   - Edit prompts with automatic backup
   - File metadata display (size, last modified)

3. **New API Route** — `/api/prompts` for CRUD on prompt templates

4. **New Type Definitions** — `AdvancedLLMConfig`, `GlobalThresholds`, `TimePreset`

**Rationale:**
- **Power users need control:** Users wanting to experiment with different models, temperatures, and prompts shouldn't need to edit code
- **No hardcoding principle:** All configuration should be visible and editable
- **Public release readiness:** Users need to understand and customize the app

**Design Decisions:**
- **Collapsible sections:** Avoid overwhelming users with all settings at once
- **Slider UI for thresholds:** More intuitive than text input for numeric ranges
- **Automatic backups:** Protect users from losing prompt edits

**Status:** ✅ Implemented | **DRI:** AI Assistant

**Impact:**
- Scope: Settings page + new API route
- Timeline: 1 session
- Architecture: New components, new API, extended types

**Next Step:**
- Wire the new config values to the Python engine (currently UI-only)

---

## Decision: Config-Driven Python Engine (No Hardcoding) - 2026-01-02

**Decision:** Wire all v3 advanced config values from the frontend Settings UI to the Python engine, eliminating hardcoded defaults.

**Changes Made:**
1. **config.py:** Added `advancedThresholds` to DEFAULT_CONFIG with:
   - `categorySimilarity`: 0.75
   - `judgeTemperature`: 0.0
   - `compressionTokenThreshold`: 10000
   - `compressionDateThreshold`: 7 days
2. **Getter Functions:** Added `get_category_similarity_threshold()`, `get_compression_date_threshold()`, etc.
3. **generate.py:** All hardcoded `0.75` and `< 7 days` replaced with config calls
4. **seek.py:** Same config-driven approach
5. **prompt_compression.py:** Token threshold now reads from config

**Rationale:**
- User explicitly requested no hardcoding
- Settings UI must actually affect behavior (not be "UI-only")
- Power users need to experiment with thresholds without code changes

**Status:** ✅ Implemented | **DRI:** AI Assistant

**Impact:**
- Scope: Engine + frontend config
- Timeline: Same session as Phase 3
- Architecture: Single source of truth in config.json

---

## Decision: Settings Page Tab Navigation - 2026-01-02

**Decision:** Add tabbed navigation to Settings page when setup is complete, organizing sections by purpose.

**Tabs:**
1. **General:** Workspaces, VectorDB, Voice & Style, LLM Settings, Power Features
2. **Modes:** Mode Settings Manager (create/edit/delete modes)
3. **Advanced:** LLM Task Assignments, Global Thresholds, Custom Time Presets
4. **Prompts:** Prompt Template Editor

**Rationale:**
- Settings page became too long with Phase 3 additions
- Users don't need to see all settings at once
- Logical grouping: basic setup vs. power user features
- Better UX for mobile/smaller screens

**Status:** ✅ Implemented | **DRI:** AI Assistant

**Impact:**
- Scope: Settings page UI only
- Timeline: Same session
- Architecture: No structural changes; conditional rendering based on active tab

---

## Decision: MyPrivateTools Folder Prevention - 2026-01-02

**Decision:** Add multiple safeguards to prevent MyPrivateTools folder creation during development.

**Problem:** The `MyPrivateTools/Inspiration/.next/` folder kept being created during browser testing, even after deletion. This pollutes the workspace with phantom files.

**Root Cause Analysis:**
- Unknown external trigger (possibly IDE file watcher, browser MCP, or cached path resolution)
- Next.js dev server creates `.next` folder in whatever directory it's started from
- If started from wrong directory, artifacts appear in unexpected locations

**Mitigations Applied:**
1. **next.config.ts** — Added `validateCwd()` function that:
   - Checks `process.cwd()` at config load time
   - Exits with error if directory contains "MyPrivateTools" or "Production_Clones"

2. **package.json** — Added `predev` script that:
   - Runs before `npm run dev`
   - Validates current working directory
   - Exits with clear error message if wrong

**Status:** ✅ Implemented | **DRI:** AI Assistant

**Impact:**
- Scope: Development environment only
- Timeline: Immediate
- Architecture: No runtime changes; development safety checks only

---

## Decision: Unified Content Generation Script - 2025-01-30

**Decision:** Merged `insights.py` and `ideas.py` into a single `generate.py` script with `--mode` parameter.

**Rationale:**
- **DRY Principle:** Both scripts shared ~90% of code (LLM generation, reranking, bank harmonization, output management)
- **Maintainability:** Common changes (prompt compression, error handling, retry logic) only need to be made once
- **Consistency:** Both modes use identical generation pipeline, ensuring consistent behavior
- **Code Reduction:** Eliminated ~1,000+ lines of duplicate code

**Alternatives Considered:**
- Keep separate scripts (rejected: too much duplication)
- Create shared library module (rejected: adds complexity, Python import path issues)
- Use inheritance/classes (rejected: over-engineering for this use case)

**Status:** ✅ Implemented | **DRI:** AI Assistant

**Impact:**
- Scope: No change (same functionality)
- Timeline: No delay (refactoring only)
- Architecture: Simplified codebase, easier to extend with new modes

---

## Decision: Prompt Refactoring - Shared Base + Mode-Specific - 2025-01-30

**Decision:** Extracted common prompt elements into `base_synthesize.md` and kept only unique elements in `insights_synthesize.md` and `ideas_synthesize.md`.

**Rationale:**
- **Clarity:** Each prompt file now contains only what's unique to that mode
- **Maintainability:** Common rules (confidentiality, audience awareness, voice guidelines) updated in one place
- **Consistency:** Both modes share the same base rules, reducing drift

**Common Elements Extracted:**
- Confidentiality & Professionalism Rules
- Audience Awareness guidelines
- Common Voice & Style rules
- Input format specification
- Quality over quantity philosophy

**Mode-Specific Elements:**
- **Insights:** Post requirements, emoji rules, post length guidelines, output format (Post 1/2/3)
- **Ideas:** Problem/Solution/Value Proposition structure, prioritization criteria, output format (Idea 1/2/3)

**Status:** ✅ Implemented | **DRI:** AI Assistant

**Impact:**
- Scope: No change (same prompts, better organized)
- Timeline: No delay (refactoring only)
- Architecture: Cleaner prompt structure, easier to maintain

---

## Pivot: Vector DB as Primary Backend - 2025-12-28

**Original:** SQLite + In-Memory search for chat history.

**New:** Supabase pgvector as primary backend, SQLite as fallback only.

**Trigger:** Discovered user's Cursor chat history is 2.1 GB (93,000+ messages), making SQLite approach inefficient (3-5s searches) and fragile.

**Impact:**
- **Scope:** Added Vector DB infrastructure, sync scripts, RPC functions
- **Timeline:** +2 days for Vector DB setup and migration
- **Architecture:** New `vector_db.py` module, Supabase integration, HNSW index for fast similarity search

**Status:** ✅ Implemented | **DRI:** AI Assistant

---

## Decision: Remove SQLite Fallback - 2025-01-30

**Decision:** Removed all SQLite fallbacks from `insights.py`, `ideas.py`, and `reverse_match.py`. Vector DB is now required.

**Rationale:**
- **Simplicity:** Single data source reduces complexity
- **Performance:** Vector DB is orders of magnitude faster
- **Consistency:** All modules use the same data source
- **Clear Errors:** Explicit error messages if Vector DB not configured

**Alternatives Considered:**
- Keep SQLite fallback (rejected: adds complexity, slower, inconsistent)
- Make SQLite optional via config (rejected: adds config complexity, user confusion)

**Status:** ✅ Implemented | **DRI:** AI Assistant

**Impact:**
- Scope: No change (Vector DB was already primary)
- Timeline: No delay (removed code)
- Architecture: Cleaner codebase, Vector DB is now a hard requirement

---

## Decision: Remove v0 Code & Data - 2025-12-29

**Decision:** Remove all v0 code and data files after successful migration to v1.

**Rationale:**
- Migration scripts successfully converted all v0 data to v1 format
- v0 code (ideas.py, insights.py, bank.py fallbacks) creates maintenance burden
- User is the only user, so backward compatibility not needed
- Clean codebase reduces confusion and technical debt

**What Was Removed:**
- Code files: `engine/ideas.py`, `engine/insights.py`, `src/app/api/banks/route.ts`
- Data files: `idea_bank.json`, `insight_bank.json`, `IDEA_BANK.md`, `INSIGHT_BANK.md`
- Fallback code: Legacy bank system fallbacks in `generate.py`
- Config: `customVoice` section (migrated to `userProfile`)
- Unused functions: `_get_projects_summary()` from `generate.py`

**What Was Kept:**
- Migration scripts (for reference/documentation)
- Backup files created during migration
- `bank.py` module (kept for reference, but not imported/used)

**Alternatives Considered:**
- Keep v0 code with feature flags: Rejected (unnecessary complexity for single user)
- Gradual deprecation: Rejected (clean break preferred)

**Status:** ✅ Implemented | **DRI:** AI Assistant

**Impact:**
- Scope: No change (functionality preserved in v1)
- Timeline: No delay (cleanup only)
- Architecture: Cleaner v1-only codebase, easier to maintain

---

## Decision: v1 Deployment Strategy - Modify Existing Folder - 2025-01-30

**Decision:** Modify existing `Inspiration/` folder with feature flags and gradual migration (not separate folder).

**Rationale:**
- Single codebase easier to maintain
- Migration path already planned
- Backward compatibility layer feasible
- No need to maintain two versions
- v1 is an evolution (not complete rewrite)

**Alternatives Considered:**
- Separate folder/project (`Inspiration-v1/`): Rejected (code duplication, harder maintenance, more complex deployment)

**Status:** ✅ Implemented | **DRI:** AI Assistant

**Impact:**
- Scope: Single codebase with feature flags
- Timeline: Gradual migration enabled
- Architecture: Backward compatibility layer in API routes

<!-- Merged from V1_DEPLOYMENT_STRATEGY.md on 2025-12-29 -->

---

## Decision: v1 Feature Migration Strategy - 2025-01-30

**Decision:** Drop auto-save .md files, transform separate banks to unified Items/Categories, transform fixed tools to Themes/Modes.

**Features Dropped:**
- Auto-save .md files → Replaced with in-memory storage + export on demand
- Separate Idea/Insight Banks → Unified `items_bank.json` with mode metadata
- Fixed Tool Types → Themes/Modes system
- Output File Tracking → In-memory results only

**Features Transformed:**
- Seek (Use Case) → Seek Theme → Use Case Mode
- Preset Modes → Keep as defaults, allow user customization
- Voice Profile → User Profile (global)
- Bank System → Unified Items/Categories with cosine similarity grouping

**Migration Strategy:**
- Keep & Enhance: Vector DB search, semantic search, bank harmonization, LLM generation
- Transform & Migrate: Banks, preset modes, voice profile, Seek
- Drop & Replace: Auto-save files, separate banks, fixed tools

**Status:** ✅ Implemented | **DRI:** AI Assistant

<!-- Merged from V1_MIGRATION_ANALYSIS.md on 2025-12-29 -->

---

## Decision: Platform Support - Mac & Windows Only - 2025-01-30

**Decision:** Remove Linux support, support Mac and Windows only.

**Rationale:**
- User requirement: "Let's have support for Mac and Windows, no Linux"
- Simplifies path detection logic
- Reduces maintenance burden

**Impact:**
- Scope: Removed Linux path detection from `cursor_db.py`
- Timeline: No delay (removed code)
- Architecture: Simplified platform detection

**Status:** ✅ Implemented | **DRI:** AI Assistant

<!-- Merged from V1_EVOLUTION_SUMMARY.md on 2025-12-29 -->

---

## Decision: Remove 90-Day Date Range Limit - 2025-01-30

**Decision:** Remove 90-day maximum date range validation. Vector DB enables unlimited date ranges.

**Rationale:**
- Vector DB efficiently handles large date ranges
- No technical limitation requiring 90-day cap
- User requested removal: "with Vector DB, we don't need Date Range Validation — 90 days max enforcement"

**Impact:**
- Scope: Removed `MAX_DAYS` constants and validation logic from all files
- Timeline: No delay (removed code)
- Architecture: Cleaner validation logic

**Status:** ✅ Implemented | **DRI:** AI Assistant

<!-- Merged from V1_EVOLUTION_SUMMARY.md on 2025-12-29 -->

---

## Decision: Performance Optimizations - Parallelization & Efficient Data Fetching - 2025-12-30

**Decision:** Implemented three major performance optimizations: parallelized semantic searches, optimized data fetching, and parallelized date processing.

**Rationale:**
- User reported slow generation times despite using Vector DB (200MB+) instead of SQLite (2GB+)
- Analysis revealed sequential operations were the bottleneck:
  - 5 semantic searches ran sequentially (each waiting for OpenAI embedding API)
  - Fetched ALL conversations then filtered client-side (inefficient)
  - Processed dates sequentially in multi-day ranges
- Vector DB was fast, but the Python code wasn't utilizing it efficiently

**Optimizations Implemented:**

1. **Parallelized Semantic Searches**
   - Before: 5 sequential searches (~1-2.5s total)
   - After: 5 parallel searches using ThreadPoolExecutor (~200-500ms total)
   - Impact: ~5x faster search phase

2. **Optimized Data Fetching**
   - Before: `get_conversations_from_vector_db()` fetched ALL conversations, then filtered client-side
   - After: New `get_conversations_by_chat_ids()` fetches only relevant conversations
   - Impact: 10-100x faster for days with many conversations

3. **Parallelized Date Processing**
   - Before: Processed dates sequentially in loop
   - After: Process dates concurrently (max 10 workers)
   - Impact: Up to 10x faster for multi-day ranges

**Alternatives Considered:**
- Keep sequential processing (rejected: too slow for user's use case)
- Increase parallelization beyond 10 workers (rejected: risk of API rate limits)
- Cache search results (deferred: may add later if needed)

**Status:** ✅ Implemented | **DRI:** AI Assistant

**Impact:**
- Scope: Performance improvements only (no functionality changes)
- Timeline: No delay (optimization only)
- Architecture: Added parallelization with ThreadPoolExecutor, new efficient data fetching function
- Performance: 5-10x faster generation times across all scenarios

---

## Pivot: Unified Synthesis Pipeline for Seek - 2025-01-30

**Original:** Seek returned raw chat messages with context, requiring manual parsing and synthesis by the user.

**New:** Seek uses the same unified synthesis pipeline as Generate: semantic search → LLM synthesis → structured output → bank storage → categories.

**Trigger:** User identified canonical use case: "I want to build X, do I have similar/related real-life examples?" This requires synthesis, not raw search results. User requested architecture alignment to keep codebase simpler.

**Impact:**
- **Scope:** Seek now generates structured use cases instead of raw matches
- **Timeline:** +1 day for refactoring
- **Architecture:** Unified backend flow for both Generate and Seek:
  - Same semantic search logic
  - Same LLM synthesis pipeline
  - Same harmonization system
  - Same category generation
  - Different prompts (use_case_synthesize.md vs insights/ideas_synthesize.md)
  - Different output format (Use Cases vs Ideas/Insights)

**Benefits:**
- Simpler codebase (one synthesis pipeline instead of two)
- Better UX (synthesized results instead of raw text)
- Use cases saved to ItemsBank (reusable assets)
- Consistent architecture across all modes
- Categories group similar use cases automatically

**Status:** ✅ Implemented | **DRI:** AI Assistant

---

## Decision: Performance Optimizations - 2025-01-30

**Decision:** Implemented three performance optimizations to reduce generation time without sacrificing quality:
1. Skip judging for `best_of=1` (no choice needed)
2. Skip compression for date ranges < 7 days (small prompts don't need it)
3. Async category generation (non-blocking, user gets results immediately)

**Rationale:**
- User reported generation taking ~3 minutes for 30-day ranges
- Analysis showed:
  - Judging adds 5-15 seconds even when only 1 candidate (unnecessary)
  - Compression adds 10-30 seconds for small date ranges (not needed)
  - Category generation blocks response for 15-30 seconds (can run in background)
- These optimizations save 30-60 seconds of user wait time without affecting quality

**Alternatives Considered:**
- **Reduce date range:** User wants full range, not acceptable
- **Reduce best_of:** User wants quality, not acceptable
- **Skip compression entirely:** Risk of hitting rate limits for large ranges
- **Synchronous category generation:** Blocks user unnecessarily

**Impact:**
- **Performance:** 30-60 seconds faster perceived response time
- **Cost:** ~$0.003-0.005 saved per generation (fewer API calls)
- **Quality:** No degradation (optimizations are safe)
- **UX:** Results appear immediately; categories update in background

**Status:** ✅ Implemented | **DRI:** AI Assistant

---

## Decision: Hybrid Deployment Architecture (Railway + Vercel) - 2025-01-30

**Decision:** Deploy Python engine to Railway as separate HTTP service, keep Next.js frontend on Vercel. Use HTTP calls instead of process spawning.

**Rationale:**

1. **Vercel Limitation:** Vercel serverless functions cannot spawn child processes. The original architecture used Node.js API routes that spawned Python scripts via `child_process.spawn()`, which doesn't work in Vercel's serverless environment.

2. **Vercel Python Alternative:** While Vercel supports Python serverless functions, converting would require:
   - Refactoring all Node.js API routes (`/api/generate`, `/api/seek`, `/api/sync`) to Python
   - Rewriting spawn logic to import Python modules directly
   - Significant code changes and testing overhead

3. **Railway Benefits:**
   - Minimal code changes: Only needed to wrap existing Python scripts in Flask API
   - Preserves existing Python codebase (28 files, complex logic)
   - Faster path to deployment (15 minutes vs days of refactoring)
   - Better for long-running tasks (Railway has longer timeouts)
   - Clear separation of concerns (frontend vs backend)

4. **Automatic Fallback:** Implemented smart routing:
   - If `PYTHON_ENGINE_URL` is set → use HTTP calls to Railway (production)
   - If not set → use local `spawn()` (development)
   - Zero-config local development, seamless production deployment

**Alternatives Considered:**

1. **Convert to Vercel Python Functions:**
   - Pros: Single platform, no separate service
   - Cons: Requires refactoring all API routes, more complex migration, higher risk
   - Status: Rejected (too much work, Railway faster)

2. **Deploy Everything to Railway:**
   - Pros: Single platform, full Python support
   - Cons: Loses Vercel's excellent frontend hosting (edge network, automatic optimizations)
   - Status: Rejected (Vercel better for Next.js frontend)

3. **Convert Python to Node.js:**
   - Pros: Everything on Vercel, no separate service
   - Cons: Massive rewrite (28 Python files), high risk, loses existing tested code
   - Status: Rejected (too risky, too much work)

**Implementation:**

- Created Flask API wrapper (`engine/api.py`) wrapping `generate.py`, `seek.py`, `sync_messages.py`
- Created HTTP client utility (`src/lib/pythonEngine.ts`) with automatic local/HTTP fallback
- Updated Next.js API routes to use HTTP calls when `PYTHON_ENGINE_URL` is set
- Deployed Python engine to Railway with environment variables
- Configured Vercel with `PYTHON_ENGINE_URL` environment variable

**Impact:**
- **Scope:** +3 files (api.py, pythonEngine.ts, deployment docs), ~500 lines of code
- **Timeline:** ~2 hours implementation + deployment
- **Architecture:** Hybrid deployment (Vercel frontend + Railway backend)
- **Cost:** Railway free tier sufficient, Vercel free tier sufficient
- **Maintenance:** Two services to monitor (acceptable trade-off for faster deployment)

**Status:** ✅ Implemented | **DRI:** AI Assistant

---

## Decision: Compression vs Truncation for Long Messages - 2025-01-30

**Decision:** Hybrid approach - Compress very long messages (>8000 chars), truncate moderately long ones (6000-8000 chars)

**Rationale:**

1. **Problem with Truncation Only:**
   - Loses information beyond 6000 characters
   - No context preservation - cuts off mid-sentence
   - Poor search quality - missing critical details

2. **Benefits of Compression:**
   - Preserves key information - technical decisions, code patterns, insights
   - Better search quality - all important details retained
   - Lossless distillation - removes redundancy, keeps essentials

3. **Why Hybrid:**
   - Very long messages (>8000 chars) are rare but contain critical information
   - Compression cost (~$0.001-0.002 per message) is worth it for rare, important messages
   - Moderately long messages (6000-8000 chars) are common enough that compression cost adds up
   - Truncation is fast, free, and still preserves most information

**Alternatives Considered:**

1. **Truncation Only:**
   - Pros: Fast, free, simple
   - Cons: Loses information, poor search quality
   - Status: Rejected (quality impact too high)

2. **Compression for All Long Messages:**
   - Pros: Best quality
   - Cons: Higher cost (~$0.05-0.10 per 1000 messages), slower
   - Status: Rejected (cost not justified for moderately long messages)

**Implementation:**

- New function: `compress_single_message()` using GPT-3.5-turbo (cheaper than Claude)
- Updated sync logic: Compress if >8000 chars, truncate if 6000-8000 chars
- Falls back to truncation if compression fails

**Impact:**
- **Cost:** ~$0.01-0.02 per 1000 messages (negligible)
- **Time:** ~10-20 seconds extra per 1000 messages (acceptable)
- **Quality:** Better search quality, preserves critical information
- **Scope:** Only affects very long messages (>8000 chars, ~1% of messages)

**Status:** ✅ Implemented | **DRI:** AI Assistant

<!-- Merged from COMPRESSION_VS_TRUNCATION.md on 2025-01-30 -->

---

## Decision: Refresh Brain Optimizations - 2025-01-30

**Decision:** Implemented three optimizations: pre-truncate long messages, increase batch size to 200, skip very short messages

**Rationale:**

1. **Pre-truncate Long Messages:**
   - Messages longer than 8192 tokens would fail during embedding API call
   - Pre-truncating at 6000 chars prevents failures, saves API calls and retries
   - Impact: Prevents ~104 failed messages per sync

2. **Increased Batch Size:**
   - Changed from 100 to 200 messages per batch
   - 2x faster batch processing, fewer API calls
   - Still well within OpenAI's limit of 2048 inputs per request

3. **Skip Very Short Messages:**
   - Messages shorter than 10 characters are skipped
   - Reduces processing time, lower cost, better quality
   - Examples: "ok", "yes", "👍", "?"

**Alternatives Considered:**

1. **Keep Original Batch Size (100):**
   - Pros: Conservative, safe
   - Cons: Slower, more API calls
   - Status: Rejected (optimization opportunity)

2. **Process All Messages (Including Short):**
   - Pros: Complete coverage
   - Cons: Wastes resources on meaningless messages
   - Status: Rejected (quality/cost trade-off)

**Implementation:**

- Constants: `MAX_TEXT_LENGTH = 6000`, `MIN_TEXT_LENGTH = 10`, `BATCH_SIZE = 200`
- Truncation logic tries to cut at sentence boundaries
- Files modified: `engine/scripts/sync_messages.py`, `engine/scripts/index_all_messages.py`

**Impact:**
- **Time:** ~50% faster (from 2-3 minutes to 1-1.5 minutes per 100 messages)
- **Cost:** ~50% fewer API calls, 100% failure reduction
- **Quality:** Maintained (all meaningful messages still indexed)

**Status:** ✅ Implemented | **DRI:** AI Assistant

<!-- Merged from REFRESH_BRAIN_OPTIMIZATIONS.md on 2025-01-30 -->

---

## Pivot: Item-Centric Architecture Simplification - 2026-01-01

**Original:** "Candidate" = a set of items (e.g., 3 ideas), "bestOf" generates multiple candidates → Judge picks best candidate → Parse items from winner.

**New:** "Item" = single idea/insight/use case. User specifies item count → AI generates N items directly → Deduplicate among generated items + existing bank → Rank → Return to user → Harmonize to bank.

**Trigger:** User identified that the Candidate-based architecture is over-engineered and confusing. The mental model should be simpler: "I want 10 ideas" → get 10 ideas.

**Key Changes:**

1. **Terminology:** Rename "Candidate" to "Item" everywhere. Remove "Candidate" from codebase.

2. **Generation Flow:**
   - Old: `bestOf=5` → 5 candidates (each with ~3 items) → Judge picks 1 candidate → ~3 items returned
   - New: `itemCount=10` → Generate 10-15 items → Deduplicate → Rank → Return top 10

3. **Deduplication:**
   - Old: After harmonization (against bank only)
   - New: Before returning (among generated items + existing bank items)

4. **Ranking:**
   - Old: Judge ranks candidate sets
   - New: Judge ranks individual items by quality/relevance

5. **Three Banks (clarified):**
   - **Ideas Bank** 💡: Generated ideas; tracks "Implemented" status by scanning Cursor workspaces
   - **Insights Bank** ✨: Generated insights; tracks "Shared" status by scanning social posts folder
   - **Use Cases Bank** 🔍: Stores user query (the idea/insight seeking evidence) + found evidence from chat history

6. **Configurable Settings (expose in UI):**
   - `itemCount`: How many items user wants (default: 10)
   - `deduplicationThreshold`: Similarity for duplicate detection (default: 0.85)
   - `temperature`: Creativity for Generate mode
   - `minSimilarity`: Threshold for Seek mode

**User Flow (New):**
```
User Input:
├─ Mode: [Idea | Insight | Use Case]
├─ Item Count: N
├─ Date Range: [Preset | Custom]
└─ Temperature (Generate) | Similarity (Seek)
        ↓
AI Generation/Seek:
├─ Search Vector DB for relevant conversations
├─ Generate/Find up to N items
        ↓
If Items = 0:
├─ Explain why (# conversations analyzed, date range, nothing found)
        ↓
If Items > 0:
├─ Deduplicate (merge similar items)
├─ Rank/Judge (most compelling first)
├─ Return sorted list
        ↓
Harmonize to Bank:
├─ Add new items
├─ Increment hits on existing items
├─ Show: new added, existing updated, implemented/shared status
```

**Alternatives Considered:**
- Keep Candidate-based architecture: Rejected (confusing UX, wasted LLM calls)
- Generate exactly N items (no overshoot): Rejected (deduplication may reduce count)

**Status:** ✅ Implemented (2025-01-01) | **DRI:** AI Assistant

**Impact:**
- **Scope:** Major refactor of generate.py, seek.py, items_bank.py, frontend
- **Timeline:** Completed in ~2 hours
- **Architecture:** Simpler mental model, fewer wasted LLM calls, better UX
- **Cost:** ~80% reduction (single LLM call vs parallel candidates)

**Implementation Details:**
- Added `generate_items()` function in `generate.py` (line 246)
- Added `_parse_items_from_output()` for structured item extraction
- Added `_deduplicate_items()` for pre-return deduplication
- Added `_rank_items()` for individual item ranking
- Updated prompts with `{item_count}` placeholder
- Created `item_ranker.md` prompt for ranking
- Updated themes.json: `defaultItemCount`, `deduplicationThreshold`
- Updated frontend: `itemCount` slider replaces `bestOf`
- Updated API: `--item-count` and `--dedup-threshold` args

---

## Implementation: v2 Item-Centric Architecture - 2025-01-01

**Files Changed:**

**Python Engine:**
- `engine/generate.py` - Added `generate_items()`, `_parse_items_from_output()`, `_deduplicate_items()`, `_rank_items()`, `items_to_markdown()`
- `engine/prompts/ideas_synthesize.md` - Added `{item_count}` placeholder
- `engine/prompts/insights_synthesize.md` - Added `{item_count}` placeholder
- `engine/prompts/use_case_synthesize.md` - Added `{item_count}` placeholder
- `engine/prompts/item_ranker.md` - New ranking prompt

**Configuration:**
- `data/themes.json` - Added `defaultItemCount`, `deduplicationThreshold` per mode

**Frontend:**
- `src/lib/types.ts` - Added `itemCount`, `deduplicationThreshold` types
- `src/app/page.tsx` - Replaced `bestOf` with `itemCount`, updated progress phases
- `src/components/AdvancedSettings.tsx` - Replaced `bestOf` slider with `itemCount`
- `src/components/ExpectedOutput.tsx` - Updated labels for items

**API:**
- `src/app/api/generate/route.ts` - Added `itemCount`, `deduplicationThreshold` handling

**Documentation:**
- `FLOW_ANALYSIS.md` - Updated with v2 architecture details

**E2E Tests:**
- `e2e/inspiration.spec.ts` - Updated for v2 architecture (12 tests passing)

---

## Decision: User-Controlled Variety via Multiple Runs - 2026-01-01

**Context:** The v2 architecture removed the "generate N candidate sets, judge best" flow in favor of direct item generation.

**Decision:** Users who want diverse outputs should run the same query multiple times with varying temperature/similarity settings. The bank naturally deduplicates across runs.

**Rationale:**
- **Simplicity:** No complex bestOf/judging logic needed
- **User control:** Users decide how much variety they want
- **Natural aggregation:** Bank deduplication handles overlap automatically
- **Transparent cost:** Each run has predictable cost

**Example Workflow:**
```
Run 1: Generate 5 ideas at temperature 0.2 (conservative) → Bank deduplicates
Run 2: Generate 5 ideas at temperature 0.8 (creative) → Bank deduplicates
Result: Bank contains unique ideas from both runs
```

**Status:** Documented | **DRI:** User

---

## Decision: Brain Refresh Fixes & Performance - 2025-01-30

**Context:** Multiple issues identified with Vector DB sync, including cloud mode UI, duplicate detection clarity, timestamp fields, brain size estimation, and batch insert performance.

**Decisions:**

1. **Cloud Mode Persistence:** Updated error detection to check for both "Cannot sync from cloud" and "cloud environment" strings. Cloud mode status now persists permanently (not cleared after 5 seconds).

2. **Duplicate Detection Clarification:** Duplicates identified by `message_id` hash = `SHA256(workspace:chat_id:timestamp:text[:50])[:16]`. This ensures uniqueness even if workspace/chat_id format changes.

3. **Timestamp Fields:** 
   - `timestamp` (BIGINT): When the chat message occurred (from Cursor DB)
   - `indexed_at` (TIMESTAMP): When indexed into Vector DB
   - `created_at` / `updated_at`: Auto-set by PostgreSQL

4. **Brain Size Estimation:** Removed hardcoded 244MB value. Now uses RPC function first, falls back to conservative estimate (8KB per message) only if RPC fails.

5. **Batch Inserts:** Added `index_messages_batch()` for 10-50x faster database writes (1 API call per batch vs 200).

**Impact:**
- **Performance:** ~3-5x faster sync times
- **Reliability:** Zero hardcoded values
- **UX:** Cloud mode shows and persists correctly

**Status:** Implemented | **DRI:** AI

<!-- Merged from BRAIN_REFRESH_FIXES.md on 2026-01-01 -->

---

## Decision: Compression vs Truncation (Hybrid) - 2025-01-30

**Context:** Long messages (>6000 chars) need to fit in embedding context window. Truncation loses information, compression preserves it but costs money.

**Decision:** Hybrid approach:
- **Very long messages (>8000 chars):** Compress using GPT-3.5-turbo (~$0.001/msg)
- **Moderately long (6000-8000 chars):** Truncate (free, instant)
- **Normal (<6000 chars):** No processing needed

**Rationale:**
- Very long messages (1% of total) contain critical info worth preserving
- Moderately long messages (5%) preserve most info with truncation
- Cost-effective: ~$0.01-0.02 per 1000 messages

**Implementation:**
```python
if len(msg_text) > 8000:  # Compress (preserves info)
    msg_text = compress_single_message(msg_text, max_chars=6000)
elif len(msg_text) > 6000:  # Truncate (fast, free)
    msg_text = truncate_text_for_embedding(msg_text)
```

**Constants:**
- `MAX_TEXT_LENGTH = 6000` (target for embeddings)
- `COMPRESSION_THRESHOLD = 8000` (when to compress)

**Status:** Implemented | **DRI:** AI

<!-- Merged from COMPRESSION_VS_TRUNCATION.md on 2026-01-01 -->

---

## Decision: Refresh Brain Optimizations - 2025-01-30

**Context:** Vector DB sync needed performance improvements.

**Optimizations Implemented:**

1. **Pre-truncate Long Messages:** Messages >6000 chars truncated before embedding API call (prevents ~104 failed messages per sync)

2. **Increased Batch Size:** 100 → 200 messages per batch (2x faster, fewer API calls)

3. **Skip Short Messages:** Messages <10 chars skipped (saves cost, better quality)

4. **Cache-First Embedding:** `batch_get_embeddings()` checks cache before API calls

**Performance Impact (per 100 new messages):**
- **Before:** ~2-3 minutes, ~100 API calls, ~5-10 failures
- **After:** ~1-1.5 minutes, ~50 API calls, ~0 failures
- **Savings:** ~50% time, ~50% API calls, 100% failure reduction

**Constants:**
```python
MAX_TEXT_LENGTH = 6000   # Truncate longer messages
MIN_TEXT_LENGTH = 10     # Skip shorter messages
BATCH_SIZE = 200         # Messages per batch
```

**Status:** Implemented | **DRI:** AI

<!-- Merged from REFRESH_BRAIN_OPTIMIZATIONS.md on 2026-01-01 -->

---

## Bug Fix: Custom Date Ranges Use Aggregated Processing - 2026-01-04

**Problem:** Custom date ranges (via `--days N` without preset mode) were generating `itemCount` items **per active day** instead of **total**. User requested 25 items across 3 months, got 109 items (25 × 7 active days).

**Root Cause:** The v2 Item-Centric Architecture pivot documented the intent ("user requests N items, AI generates N items") but the implementation only applied to preset modes (`--daily`, `--sprint`, etc.). The `else` branch for custom modes was never updated.

**Fix:** Added condition in `generate.py` to use aggregated processing for custom date ranges:

```python
elif args.days and args.days > 1:
    mode_days = args.days
    mode_name = "custom"
    use_aggregated = True
```

**Code Paths Affected:**
- [x] `--daily` preset → `use_aggregated = True` ✅ (already correct)
- [x] `--sprint` preset → `use_aggregated = True` ✅ (already correct)
- [x] `--month` preset → `use_aggregated = True` ✅ (already correct)
- [x] `--quarter` preset → `use_aggregated = True` ✅ (already correct)
- [x] `--days N` custom range → `use_aggregated = True` ✅ (FIXED)
- [ ] `--date YYYY-MM-DD` single date → `process_single_date()` (correct behavior for single day)

**Verification:**
```bash
# Test: Custom date range should produce ≤25 items total, not per-day
python3 engine/generate.py --mode insights --days 30 --item-count 25
# Expected: ~25 items in output file, NOT 25 × active days
```

**Status:** ✅ Implemented | **DRI:** AI Assistant

**Lesson Learned:** When documenting a pivot, explicitly list ALL code paths affected and how to verify. This bug persisted because the pivot documentation described the intent but didn't create a verification checklist.

---

