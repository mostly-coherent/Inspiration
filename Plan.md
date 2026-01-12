# Inspiration — Plan

> **Purpose:** Refactor Inspiration into a self-contained, open-source app that any Cursor user can use to extract ideas and insights from their chat history.

---

## Vision

**One-liner:** Turn your Cursor AI conversations into actionable ideas and shareable insights.

**Target Users:**
- Builders using Cursor who want to reflect on patterns in their AI-assisted work
- PMs/developers who want to generate content (social media posts, idea briefs) from their coding sessions
- Anyone exploring agentic workflows who wants to capture learnings

---

## Canonical Use Cases

Each mode serves a distinct purpose:

### Generate (Insights)
**Canonical Use Case:** Extract shareable insights from coding sessions—for blogs, tweets, posts, or deeper research.

**What it does:** Analyzes chat history for learnings, patterns, and observations worth sharing. Generates shareable drafts that are casual, thoughtful, and helpful—use them however you like (social posts, blog material, research sparks, etc.).

**Example:** "What did I learn about AI-assisted coding today that others would find valuable?"

---

### Generate (Ideas)
**Canonical Use Case:** Identify problems worth building solutions for from patterns in chat history.

**What it does:** Finds recurring pain points or gaps in your work. Generates 3 idea briefs (Problem + Solution + Value Proposition) for prototypes/tools that are broadly useful and buildable.

**Example:** "What problems did I encounter repeatedly that could be solved with a tool?"

---

### Seek (Use Cases)
**Canonical Use Case:** "I want to build X (or post Y on social media), do I have similar/related real-life examples from the past that I worked through?"

**What it does:** Takes your query (what you want to build/find), searches chat history for similar examples, and synthesizes structured use cases showing:
- **What** you built/did before
- **How** you approached it
- **Context** (when/why it happened)
- **Similarity** to your query
- **Key takeaways** (what's reusable)

**Example:** "I want to build a task automation tool" → Returns: "You built email filtering in March, calendar sync in February, etc. Here's how you approached them..."

**Key Difference:** Generate creates new content; Seek finds and synthesizes existing examples from your history.

---

## Requirements

### Core Features

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| C1 | **Idea Generation** | Extract prototype/tool ideas from Cursor chat history | ✅ Done |
| C2 | **Insight Generation** | Extract social media-worthy insights from Cursor chat history | ✅ Done |
| C3 | **Cross-Platform Cursor DB** | Auto-detect Cursor database on macOS, Windows, Linux | ✅ Done |
| C4 | **Idea Bank** | Harmonize ideas into a deduplicated bank with occurrence tracking | ✅ Done |
| C5 | **Insight Bank** | Harmonize insights into a deduplicated bank with occurrence tracking | ✅ Done |
| C6 | **Setup Wizard** | First-run + anytime configuration of workspaces, API keys, features | ✅ Done |
| C7 | **Preset Modes** | Last 24h/14d/30d/90d presets with sensible defaults | ✅ Done |
| C8 | **Advanced Mode** | Custom days, date range, candidates, temperature | ✅ Done |
| C9 | **Progress UI** | Real-time progress, elapsed time, stop button | ✅ Done |
| C10 | **Results Display** | Rendered markdown output with formatted/raw toggle | ✅ Done |
| C11 | **Seek (Use Case)** | Find and synthesize real-world examples from chat history using unified synthesis pipeline | ✅ Done |
| C12 | **Abort Signal Support** | STOP button properly kills Python processes on cancel | ✅ Done |
| C13 | **Vector DB Search** | Supabase pgvector backend for massive (>2GB) chat histories | ✅ Done |

### Power User Features (Optional, Configurable)

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| P1 | **Social Media Sync** | Check if insights have been shared in posts folder | ✅ Done |
| P2 | **Solved Status Sync** | Check if ideas are tackled by projects in workspace | ✅ Done |
| P3 | **Voice Profile** | Multi-file voice/style configuration for authentic generation | ✅ Done |

### Voice Profile System

The voice profile captures the user's authentic writing style through:

| Component | Purpose | File Type |
|-----------|---------|-----------|
| **Author Name** | Name used in prompts | Config value |
| **Author Context** | Brief role/background (e.g., "PM who codes agentically") | Config value |
| **Golden Examples** | Folder of actual social posts to study | Directory of .md files |
| **Voice Guide** | Explicit rules: words to use/avoid, style preferences | Single .md file |

The engine combines these into a comprehensive system prompt that helps Claude match the user's authentic voice.

### LLM Support

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| L1 | **Anthropic Claude** | Primary LLM (Claude Sonnet 4) | ✅ Done |
| L2 | **OpenAI Fallback** | GPT-4o as fallback if Anthropic unavailable | ✅ Done |
| L3 | **OpenRouter** | Access 500+ models from 60+ providers via unified API | ✅ Done |
| L4 | **Model Selection** | Let user choose provider and model in settings | ✅ Done |

### UX/Polish

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| U1 | **Beautiful README** | Quick-start guide with screenshots/GIFs | ✅ Done |
| U2 | **One-Command Setup** | `npm install && pip install -r requirements.txt` | ✅ Done |
| U3 | **Settings Page** | UI to configure workspaces, features, API keys | ✅ Done |
| U4 | **Bank Viewer** | View Idea Bank and Insight Bank in the UI | ✅ Done |
| U5 | **Export to Markdown** | Download ideas/insights as standalone .md files | ✅ Done |

### New User Onboarding

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| ONB-1 | **Smart DB Detection** | Auto-detect chat history size to determine Vector DB requirement | ✅ Done |
| ONB-2 | **Tiered Setup** | < 50MB: Supabase optional • 50-500MB: recommended • > 500MB: required | ✅ Done |
| ONB-3 | **3-Step Wizard** | Welcome → API Keys → Sync → Theme Explorer | ✅ Done |
| ONB-4 | **Preview Mode** | `?preview=true` to test onboarding without resetting data | ✅ Done |
| ONB-5 | **Auto-Redirect** | New users (missing keys or setupComplete=false) redirect to /onboarding | ✅ Done |
| ONB-6 | **API Key Validation** | Test API keys before saving to catch typos | Pending |
| ONB-7 | **Demo Mode** | Pre-populated sample data for exploring before committing | Pending |

**Verification:** Visit `/onboarding?preview=true` to test the flow without affecting your data.

---

## MVP: Chat History Search Across All Workspaces

**Requirement:** All three features (Generate Insights, Generate Ideas, Seek) must search through chat history **regardless of workspace and LLM** (both Composer and regular chats). This is a **NON-NEGOTIABLE MVP**.

**Status:** ✅ IMPLEMENTED

**Implementation Details:**
1.  **Unified Search:** `insights.py`, `ideas.py`, and `reverse_match.py` now explicitly pass `workspace_paths=None` to query the entire database.
2.  **Bubble Extraction:** Core logic in `cursor_db.py` updated to handle Cursor's "Bubble" architecture, extracting messages from fragmented `bubbleId` entries in `cursorDiskKV`.
3.  **Vector Acceleration:** For large datasets (>100MB), the system now seamlessly offloads search to Supabase pgvector.

---

## Architecture

### Target (Self-Contained)

```
inspiration/
├── src/
│   ├── app/
│   │   ├── page.tsx              ← Main UI
│   │   ├── settings/page.tsx     ← Settings/wizard UI
│   │   └── api/
│   │       ├── generate/route.ts ← Calls engine
│   │       ├── config/route.ts   ← Read/write config
│   │       └── banks/route.ts    ← Read banks
│   └── lib/
│       ├── types.ts
│       └── config.ts             ← Config utilities
├── engine/                       ← Python engine
│   ├── ideas.py
│   ├── insights.py
│   ├── common/
│   │   ├── cursor_db.py          ← Cross-platform DB extraction (SQLite)
│   │   ├── vector_db.py          ← Supabase pgvector integration (NEW)
│   │   ├── llm.py                ← Anthropic + OpenAI wrapper
│   │   ├── config.py             ← User config loader
│   │   └── bank.py               ← Bank harmonization
│   └── scripts/                  ← Vector DB management (NEW)
│       ├── index_all_messages.py
│       ├── sync_messages.py
│       └── init_vector_db.sql
├── data/                         ← User data (gitignored)
│   ├── config.json               ← User configuration
│   ├── idea_bank.json
│   ├── insight_bank.json
│   └── vector_db_sync_state.json
```

---

## Configuration Schema

```json
{
  "version": 1,
  "setupComplete": true,
  "workspaces": [
    "/path/to/workspace-a",
    "/path/to/workspace-b"
  ],
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "fallbackProvider": "openai",
    "fallbackModel": "gpt-4o"
  },
  "features": {
    "linkedInSync": {
      "enabled": true,
      "postsDirectory": "/path/to/posts"
    },
    "solvedStatusSync": {
      "enabled": true
    },
    "customVoice": {
      "enabled": false,
      "filePath": null
    }
  },
  "ui": {
    "defaultTool": "insights",
    "defaultMode": "sprint"
  }
}
```

---

---

## v1 Vision & Evolution

**v1 Goal:** Transform Inspiration into a flexible, theme-based system where users can create custom modes, with unified Items/Categories system and visual-first display.

**Key Changes:**
- Themes (Generation, Seek) with user-creatable Modes
- Unified Items/Categories system (replaces separate Idea/Insight banks)
- Visual-first display (no auto-save .md files)
- Enhanced settings (OpenRouter, mode management, folder tracking)

**Platform Support:** Mac and Windows only (Linux support removed in v1)

**UX Parity Requirements:**
- ✅ Same look and feel — Maintain visual consistency with v0
- ✅ Stop mid-way — Retain abort signal support and Stop button
- ✅ See progress — Retain progress bar, percentage, phase, elapsed/remaining time
- ✅ Conversations analyzed — Retain conversation count display in results
- ✅ NFR retention — Keep all v0 non-functional requirements (performance, error handling, accessibility)

**v1 Features:**
- Theme: Generation (Modes: Idea, Insight, custom modes)
- Theme: Seek (Mode: Use Case, custom modes)
- Unified Items/Categories bank with cosine similarity grouping
- Mode-specific settings (temperature, similarity thresholds, folder paths)
- Optional file export (user-initiated, not auto-save)

**v1 Features Removed (2026-01-10):**
- ~~Folder-based tracking for implemented items~~ — Removed: Users focus on themes, not item status
- ~~Run history storage (localStorage)~~ — Removed: Never used

<!-- Merged from Next.md and V1_BUILD_PLAN.md on 2025-12-29 -->

---

## v2 Item-Centric Architecture (2026-01-01)

**v2 Goal:** Simplify the generation flow by unifying "Candidate" and "Item" into a single concept, with direct N-item generation and configurable deduplication.

**Key Changes:**
- **Unified Item Concept:** No more "candidates" — user requests N items, AI generates N items
- **Direct Generation:** Single LLM call generates requested number of items (not sets of candidates)
- **Pre-return Deduplication:** Items are deduplicated and ranked BEFORE returning to user
- **Configurable Dedup Threshold:** Per-mode `deduplicationThreshold` setting (0.0-1.0 cosine similarity)
- **True 24-Hour Window:** "Last 24 hours" preset uses timestamp-based filtering (not calendar date)
- **Brain Status Date Range:** Shows earliest → latest chat date (MM-DD-YYYY format)

**v2 Features:**

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| V2-1 | **Item-Centric Flow** | Replace `bestOf` candidates with direct `itemCount` generation | ✅ Done |
| V2-2 | **Configurable Dedup** | Per-mode `deduplicationThreshold` in Mode Settings UI | ✅ Done |
| V2-3 | **Last 24 Hours Preset** | True timestamp-based 24h window (not "today's date") | ✅ Done |
| V2-4 | **Brain Status Date Range** | Show earliest → latest indexed chat date | ✅ Done |
| V2-5 | **Hours-based CLI** | `--hours N` argument for precise time windows | ✅ Done |

**v2 Rationale:**
- Users think in terms of "I want 10 ideas" not "I want 3 sets of candidates"
- Deduplication happens automatically; users run multiple queries with varied settings to get variety
- The Bank becomes the natural aggregation point for all generated items

---

## v3 UX Redesign — Library-Centric Architecture (2026-01-01)

**v3 Goal:** Redesign the frontend to center on the Library (accumulated items) as the core value proposition, with full configuration exposure in Settings. Prepare for public release.

**Core Insight:** The Library is the scoreboard—not just storage. Users measure their learning and productivity by whether their Library is growing with valuable items. Generation/Seek are tools to grow that number.

### Terminology Changes

| Old Term | New Term | Rationale |
|----------|----------|-----------|
| Brain | **Memory** | "Your Memory" = all indexed AI conversations |
| Bank | **Library** | "Your Library" = accumulated ideas/insights, like building a personal library |

### User Mental Model (Guiding Principles)

1. **Memory completeness:** "Do I have all my chats indexed?" → Show coverage dates, size comparison (local vs. vector), workspace count
2. **Library growth:** "Is my Library growing?" → Show total items, weekly delta, categories
3. **Analysis assurance:** "Did the app analyze the right chats?" → Show messages analyzed, date range, workspaces searched, before AND after generation
4. **Easy experimentation:** All parameters (temperature, similarity, LLM assignments) exposed and editable in Settings
5. **Memory jog:** Items link back to source chat dates and workspaces to help users remember context

### v3 Features

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| V3-1 | **Scoreboard Header** | Always-visible Memory + Library stats at top of page | ✅ Done (Phase 1) |
| V3-2 | **Two-Panel Layout** | Library (left) + Generate/Seek (right) side-by-side | ✅ Done |
| V3-3 | **Analysis Coverage Panel** | Show what will be/was analyzed (messages, dates, workspaces) | ✅ Done (Phase 1) |
| V3-4 | **Library Delta Display** | After generation, show: "Library: 247 → 253 (+6 new)" | ✅ Done (Phase 1) |
| V3-5 | **Rich Item Cards** | Each item shows: recency, date range, occurrence, category, tags | ✅ Done (Phase 2) |
| V3-5b | **Library Search & Filter** | Search items, filter by type/status/category, sort options | ✅ Done (Phase 2) |
| V3-6 | **Full Config Exposure** | All parameters in Settings: LLM assignments, thresholds, prompts | ✅ Done (Phase 3) |
| V3-7 | **Editable System Prompts** | View/edit prompt templates per mode in Settings | ✅ Done (Phase 3) |
| V3-8 | **LLM Task Assignments** | Configure which LLM for: generation, judging, embedding, compression | ✅ Done (Phase 3) |
| V3-9 | **Advanced Thresholds** | Expose: category similarity, compression threshold, judge temperature | ✅ Done (Phase 3) |
| V3-10 | **Custom Time Presets** | Add/edit time presets (6h, 12h, etc.) | ✅ Done (Phase 3) |

### Configuration Exposure (No Hardcoding)

**LLM Assignments (per task):**
- Generation LLM (default: Claude Sonnet 4)
- Judge/Ranking LLM (default: GPT-3.5-turbo)
- Embedding LLM (default: OpenAI text-embedding-3-small)
- Compression LLM (default: GPT-3.5-turbo)

**Thresholds (Advanced Settings):**
- Generation temperature (per mode, already in themes.json)
- Judge temperature (default: 0.0)
- Deduplication threshold (per mode, already in themes.json)
- Category similarity threshold (default: 0.75)
- Seek min similarity (per mode, already in themes.json)
- Compression token threshold (default: 10000)
- Compression date threshold (default: 7 days)

**Prompt Templates (per mode):**
- System prompt file path (editable)
- Semantic search queries (already in themes.json)

**Reference Paths:**
- Voice Guide file
- Golden Examples folder

### UI Layout (v3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SCOREBOARD HEADER (always visible)                                         │
│  🧠 MEMORY: 2.1GB | Jul 15 → Jan 1 | 3 workspaces                          │
│  📚 LIBRARY: 247 items | +12 this week | 14 categories                     │
└─────────────────────────────────────────────────────────────────────────────┘
┌───────────────────────────────┬─────────────────────────────────────────────┐
│  📚 LIBRARY                   │  ✨ GENERATE / 🔍 SEEK                       │
│  [Search...] [Filters]        │  [Mode] [Preset] [⚙️ Advanced]              │
│                               │                                              │
│  Categories (collapsible)     │  Analysis Coverage:                         │
│  • AI Agents (12 items)       │  📅 Dec 18 → Jan 1 | 127 conversations     │
│  • CLI Tools (8 items)        │                                              │
│  • ...                        │  [Generate 10 Ideas →]                      │
│                               │                                              │
│  Recent Items                 │  ─────────────────────────────────────────  │
│  • Item 1 (Dec 28)           │  RESULTS                                     │
│  • Item 2 (Dec 27)           │  ✅ Analyzed 127 conversations               │
│  • ...                        │  📊 10 generated → 6 new in Library         │
│                               │                                              │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

### Implementation Phases

**Phase 1: Scoreboard + Assurance (High Impact)**
- V3-1: Scoreboard Header
- V3-3: Analysis Coverage Panel
- V3-4: Library Delta Display

**Phase 2: Two-Panel Layout**
- V3-2: Library (left) + Action (right) layout
- V3-5: Item Source Context

**Phase 3: Full Configuration**
- V3-6: Full Config Exposure in Settings
- V3-7: Editable System Prompts
- V3-8: LLM Task Assignments
- V3-9: Advanced Thresholds
- V3-10: Custom Time Presets

---

## 🎯 NEXT FOCUS

**Priority:** Testing Coverage Intelligence and preparing for public release.

**Current Status:**
- ✅ v1 implementation complete (all phases done)
- ✅ v2 Item-Centric Architecture complete
- ✅ Vector DB architecture stable (2.1GB indexed)
- ✅ All E2E tests passing (12/12)
- ✅ v3 Complete — Library-centric UI with Scoreboard, Two-Panel Layout, Settings Hub
- ✅ v3.1 Complete — View Modes (Library View / Comprehensive View)
- ✅ v4 Complete — Library Enhancements (Merge Similar, Auto-Archive, Bulk Actions)
- ✅ v5 Complete — Coverage Intelligence (Gap Detection, Suggested Runs, Visualization)
- ✅ Performance Optimizations — IMP-15 (pgvector RPC), IMP-16 (Batch+Parallel), IMP-17 (Topic Filter)

**v5 Complete!** Coverage Intelligence fully operational with optimized harmonization.

---

## v3.1 View Modes (2026-01-05)

**v3.1 Goal:** Add dedicated Library View for focused item exploration as library grows to 100+ items.

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| V31-1 | **View Toggle** | Switch between Library View and Comprehensive View | ✅ Done |
| V31-2 | **Library View** | Full-width dedicated view for exploring items with detail panel | ✅ Done |
| V31-3 | **Comprehensive View** | Retain existing two-panel layout (Library + Generate/Seek) | ✅ Done |

**Library View Features:**
- Full-width two-column layout (items grid + detail panel)
- Search, filter by type/status/category, sort options
- Item cards with type badge, status, occurrence count, date
- Detail panel shows full description, tags, metadata, source dates
- Click item to view details (no generation clutter)

**Comprehensive View:** Unchanged from v3 - two-panel layout with Library on left, Generate/Seek on right.

---

**Immediate Next Steps:**
1. ✅ Test v3 UI changes (Scoreboard, Library, Settings with tabs)
2. ✅ Wire advanced config to Python engine (use config values instead of hardcoded)
3. ✅ Implement V3-2: Two-Panel Layout
4. ✅ V3.1 View Modes (Library View / Comprehensive View)
5. E2E test the full generation flow with new settings
6. Prepare for public release (README updates, documentation)

---

## v4 Library Enhancement — From List to Intelligence (2026-01-08)

**Problem:** At 200+ items, the Library becomes noise. Users scroll, don't act. The Library is a collection, not a tool.

**Goal:** Transform Library from "list you search" to "mirror that shows what you're thinking about—and what you're missing."

### Phase 1: Declutter (Low Effort, High Impact)

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| LIB-1 | ~~**Quality Tier (A/B/C)**~~ | ~~Rate items on save; default filter to A-tier only~~ | ❌ Removed (2026-01-10) |
| LIB-2 | **Merge Similar** | "These 5 items are essentially the same—combine?" Button on category level | ✅ Done |
| LIB-3 | **Auto-Archive Stale** | Items >90 days old → auto-archive (one-click restore) | ✅ Done |
| LIB-4 | **Bulk Actions** | Select multiple items → archive, delete | ✅ Done (simplified) |

### Phase 2: Surface — ❌ REMOVED (2026-01-10)

*Entire phase removed. Theme Explorer serves the "surfacing" use case better than algorithmic recommendations.*

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| LIB-5 | ~~**Top 3 Today**~~ | ~~Daily recommendations with freshness scoring~~ | ❌ Removed |
| LIB-6 | ~~**Workspace Context**~~ | ~~Highlight items matching current workspace~~ | ❌ Removed |
| LIB-7 | ~~**Build/Share Next**~~ | ~~Recommendations based on type priority~~ | ❌ Removed |

### Phase 3: Synthesize (High Effort, High Novelty)

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| LIB-8 | **Theme Synthesis** | Category overview with item breakdown per theme | ✅ Complete |
| LIB-9 | **Learning Trajectory** | "Your interests shifted from X → Y → Z over 6 months" | Pending |
| LIB-10 | **Gap Detection** | "You've explored A and C extensively, but B is absent" | Pending |

### Features Also Removed (2026-01-10)

| Feature | Why Removed |
|---------|-------------|
| **Implementation Status Tracking** | Users focus on themes, not item completion |
| **Tags Display/Filter** | 100+ tags = unusable; Seek mode handles "find specific" |
| **Themes Overview in Library** | Too many "Uncategorized"; Theme Explorer is canonical |
| **Run History** | Never used |
| **Most Occurrences / A-Z Sort** | Low value without tags/categories |
| **File Tracking Config** | Tied to removed implementation status |

### Implementation Order

**Phase 1** — Declutter: ✅ Complete
1. LIB-4: Bulk Actions (simplified to Active/Archived)
2. LIB-2: Merge Similar
3. LIB-3: Auto-Archive

**Phase 2** — Surface: ❌ Removed (Theme Explorer serves this purpose)

**Phase 3** — Longitudinal intelligence: Post-release

---

## v5 Coverage Intelligence (2026-01-10)

**Problem:** Users are busy and reflective—they come to Inspiration to be inspired, not to manually configure and run generations. With 200+ items and months of chat history, users don't know what time periods are well-covered vs. missing from their Library.

**Goal:** Automate Library growth by analyzing Memory terrain vs. Library coverage, and queuing intelligent generation runs to fill gaps.

**Core Concepts:**
- **Memory Terrain:** Distribution of chat sessions over time (conversation density)
- **Library Coverage:** Which time periods have Library items derived from them
- **Coverage Gap:** Time period with high chat density but low/no Library items
- **Coverage Run:** A queued generation job targeting a specific time period
- **Coverage Score:** 0-100% metric of how well Library coverage matches Memory terrain

### v5 Features

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| COV-1 | **Memory Terrain Analysis** | SQL RPC to analyze conversation density by week | ✅ Done |
| COV-2 | **Library Coverage Tracking** | Track `source_start_date`/`source_end_date` on items | ✅ Done |
| COV-3 | **Gap Detection Algorithm** | Compare terrain vs. coverage to identify gaps | ✅ Done |
| COV-4 | **Run Sizing Strategy** | Size runs based on conversation count and gap severity | ✅ Done |
| COV-5 | **Suggested Runs Queue** | UI to view and execute suggested runs | ✅ Done |
| COV-6 | **Cost Estimation** | Show estimated cost ($0.XX) before execution | ✅ Done |
| COV-7 | **Coverage Dashboard** | Visual display of Memory terrain vs. Library coverage | ✅ Done |

### Run Sizing Rules

| Gap Severity | Conversations | Expected Items |
|--------------|--------------|----------------|
| High | 50+ | 10 items |
| High | 30-49 | 8 items |
| Medium | 20+ | 5 items |
| Low | Any | 3 items |

**Rule of Thumb:** 1 Library item per 10 conversations is healthy coverage.

### Implementation Notes

- **Granularity:** Weekly (matches natural work rhythms)
- **Conversation Count:** Uses ALL conversations in period (not just semantically relevant)
- **Queue Management:** Manual for now (user clicks to execute), auto-queue planned for future
- **Mode:** Suggests both Ideas and Insights runs per gap

---

## 🔮 Future Directions

Active development focused on longitudinal intelligence—moving beyond single-session extraction. Roadmap details kept internal.

---

## 🔮 Improvement Backlog (Post-v3)

**Coverage Intelligence (v5 Enhancements):**
| ID | Improvement | Priority | Effort |
|----|-------------|----------|--------|
| COV-8 | **Auto-queue with budget cap** — Automatically run suggested jobs up to $X/week | MEDIUM | MEDIUM |
| COV-9 | **Coverage visualization** — Terrain vs coverage chart with normalized % | ✅ Done | MEDIUM |
| COV-10 | **Smart run batching** — Combine adjacent weeks into single runs for efficiency | LOW | LOW |
| COV-11 | **Priority weighting** — Factor in topic relevance (via semantic search) in gap severity | LOW | HIGH |
| COV-12 | **Coverage notifications** — Alert user when coverage drops below threshold | LOW | LOW |
| COV-13 | **Refactor generation handlers** — Extract shared logic into `executeGeneration()` | ✅ Done | LOW |
| COV-14 | **Progress tracking for suggested runs** — Show which suggested run is currently processing with live status | MEDIUM | MEDIUM |
| COV-15 | **Multi-run queue** — Let users queue multiple suggested runs and process them sequentially | MEDIUM | MEDIUM |

**Progress Optimization, Transparency & Analytics:**
| ID | Improvement | Priority | Effort |
|----|-------------|----------|--------|
| PROG-1 | **Settings page performance analytics section** — View bottleneck analysis, avg phase timings, cost trends | MEDIUM | MEDIUM |
| PROG-2 | **Automatic log rotation** — Delete performance logs older than 30 days | LOW | LOW |
| PROG-3 | **Actual API token counts** — Modify LLM wrapper to return actual token usage from API response | MEDIUM | MEDIUM |
| PROG-4 | **Per-item timing in harmonization** — Track time spent per item to identify slowest operations | MEDIUM | LOW |

**Performance:**
| ID | Improvement | Priority | Effort |
|----|-------------|----------|--------|
| IMP-1 | Server-side pagination for Library (1000+ items) | MEDIUM | HIGH |
| IMP-8 | Bundle size analysis with `@next/bundle-analyzer` | LOW | LOW |
| IMP-15 | **Harmonization optimization** — Use pgvector RPC for server-side similarity search instead of regenerating embeddings for every item | ✅ Done | MEDIUM |
| IMP-16 | **Batch + parallel deduplication** — Use ThreadPoolExecutor for parallel similarity searches during harmonization | ✅ Done | LOW |
| IMP-17 | **Pre-generation topic check (H-6)** — Before LLM generation, check which topics already have items; expand date ranges without generating. Reduces LLM costs while keeping coverage % truthful | ✅ Done | MEDIUM |
| IMP-18 | **Tune topic filter threshold** — Adjust 0.75 similarity threshold based on real-world results (false positives vs false negatives) | LOW | LOW |
| IMP-19 | **Topic filter UI indicator** — Show "X topics skipped, Y generated" in results panel | LOW | LOW |
| IMP-20 | **Cache conversation embeddings** — Store embeddings for repeat runs to skip embedding generation | LOW | MEDIUM |

**UX Enhancements:**
| ID | Improvement | Priority | Effort |
|----|-------------|----------|--------|
| IMP-2 | Persist filter state to URL params | LOW | LOW |
| IMP-3 | Bulk actions (archive, status change multiple items) | LOW | MEDIUM |
| IMP-4 | Item detail modal with full chat context | MEDIUM | HIGH |
| IMP-5 | Export only filtered/selected items | LOW | LOW |
| IMP-14 | **Suggested date range on "Request Too Large" error** — Auto-calculates smaller range | ✅ Done | LOW |

**Reliability:**
| ID | Improvement | Priority | Effort |
|----|-------------|----------|--------|
| IMP-6 | Automatic retry logic for failed operations | LOW | MEDIUM |
| IMP-7 | Save drafts locally (IndexedDB) for offline resilience | LOW | HIGH |
| IMP-13 | Prompt template validation (syntax check before save) | MEDIUM | MEDIUM |
| IMP-21 | **Resume generation from partial progress** — Save intermediate state, not just final output | MEDIUM | HIGH |
| IMP-22 | **Streaming progress per-day** — Show which day is being processed during generation | LOW | MEDIUM |
| IMP-23 | **Multi-strategy extraction** — Fallback logic for Cursor DB schema changes | MEDIUM | HIGH |
| IMP-24 | **Auto-adaptation** — Discover new schema patterns automatically (conceptual) | LOW | HIGH |
| IMP-25 | **Cost estimation before generation** — "This will cost ~$0.50" warning | MEDIUM | MEDIUM |

<!-- IMP-21-24 renumbered to avoid conflicts; merged from RESILIENCE_STRATEGY.md on 2026-01-09 -->

**Error Handling (Implemented 2026-01-05):**
| ID | Improvement | Status | Notes |
|----|-------------|--------|-------|
| ERR-1 | Smart LLM routing — Size request before calling, pick capable model | ✅ Done | `MODEL_CONTEXT_LIMITS` in `llm.py` |
| ERR-2 | User-friendly error messages with CTAs | ✅ Done | `errorMessages.ts` maps errors to plain English |
| ERR-3 | Pre-flight message count check | ✅ Done | Warns if no messages found before LLM calls |
| ERR-4 | Atomic file writes | ✅ Done | Write to `.tmp`, then rename (prevents partial files) |
| ERR-5 | Diagnostic parsing errors | ✅ Done | Distinguishes "no activity" vs "parsing failed" |
| ERR-6 | Manual harmonization resume | ✅ Done | `/api/harmonize` endpoint + CTA button |

**Prompt Editing Risk Mitigation:**
Users can now edit prompt templates directly in the UI. While we create backups before each save, there's no validation to prevent users from breaking prompts with invalid edits. Future work should include:
- Syntax validation before save
- Preview of prompt output with sample data
- One-click restore from backup
- Version history with diff view

**Legacy Code Cleanup (Completed 2026-01-05):**
| ID | Cleanup | Status | Notes |
|----|---------|--------|-------|
| CLN-1 | Remove deprecated `best_of` and `rerank` parameters | ✅ Done | Removed from generate.py and seek.py |
| CLN-2 | Remove judge-related code | ✅ Done | Removed `load_judge_prompt`, `_safe_parse_judge_json`, `_format_scorecard`, `judge.md` |

---

**Last Updated:** 2026-01-10 (v5 Coverage Intelligence + Performance Optimizations Complete)
