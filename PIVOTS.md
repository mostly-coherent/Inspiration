# Inspiration — Pivots & Decisions

> **Purpose:** Technical decisions and course corrections
> - Document WHY we chose certain approaches
> - Track when implementation diverges from PLAN.md
> - Append chronologically (never replace)

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
   - Exits with error if directory contains "MyPrivateTools" or "OtherBuilders"

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
   - **Insights Bank** ✨: Generated insights; tracks "Shared" status by scanning LinkedIn posts folder
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

