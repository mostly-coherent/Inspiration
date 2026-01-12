# Inspiration — Architecture & Workflows

> **Purpose:** Technical architecture document showing end-to-end workflows and system loops

---

## Canonical Use Cases (Context)

Before diving into technical details, understand what each mode is for:

- **Generate (Insights):** Extract shareable insights from coding sessions → Social media posts
- **Generate (Ideas):** Identify problems worth building solutions for → Prototype ideas
- **Seek (Use Cases):** "I want to build X, do I have similar examples?" → Synthesized use cases from history

See PLAN.md for detailed use case descriptions.

---

## System Overview

### Application Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INSPIRATION                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐                  │
│  │   Next.js   │────▶│  API Routes  │────▶│   Python     │                  │
│  │     UI      │◀────│   (Node)     │◀────│   Engine     │                  │
│  └─────────────┘     └──────────────┘     └──────────────┘                  │
│        │                   │                    │                           │
│        ▼                   ▼                    ▼                           │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐                  │
│  │  Settings   │     │   Config     │     │  Vector DB   │                  │
│  │   Wizard    │────▶│   (JSON)     │◀────│  (Supabase)  │                  │
│  └─────────────┘     └──────────────┘     └──────────────┘                  │
│                            │                    ▲                           │
│                            ▼                    │ (Sync)                    │
│                      ┌──────────────┐     ┌──────────────┐                  │
│                      │  Idea Bank   │     │  Cursor DB   │                  │
│                      │ Insight Bank │     │  (SQLite)    │                  │
│                      └──────────────┘     └──────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Deployment Architecture (Production)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION DEPLOYMENT                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────┐              ┌──────────────────────┐            │
│  │   Vercel (Frontend)  │              │  Railway (Backend)   │            │
│  │                      │              │                      │            │
│  │  ┌──────────────┐    │    HTTP      │  ┌──────────────┐    │            │
│  │  │  Next.js UI  │    │◀─────────────▶│  │ Flask API    │    │            │
│  │  │  (React)     │    │   Requests   │  │ (Python)     │    │            │
│  │  └──────────────┘    │              │  └──────────────┘    │            │
│  │        │             │              │        │             │            │
│  │  ┌──────────────┐    │              │  ┌──────────────┐    │            │
│  │  │ API Routes   │────┼──────────────┼─▶│ generate.py  │    │            │
│  │  │ (Node.js)    │    │              │  │ seek.py      │    │            │
│  │  └──────────────┘    │              │  │ sync_messages│    │            │
│  │                      │              │  └──────────────┘    │            │
│  │  Edge Network        │              │  Python Runtime      │            │
│  │  Auto-optimized     │              │  Long-running tasks  │            │
│  └──────────────────────┘              └──────────────────────┘            │
│                                                                             │
│  Environment: PYTHON_ENGINE_URL=https://...railway.app                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Local Development Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LOCAL DEVELOPMENT                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │              Local Machine (Single Process)                  │           │
│  │                                                              │           │
│  │  ┌──────────────┐         ┌──────────────┐                  │           │
│  │  │  Next.js UI  │────────▶│ API Routes   │                  │           │
│  │  │  (React)     │◀────────│ (Node.js)    │                  │           │
│  │  └──────────────┘         └──────────────┘                  │           │
│  │         │                        │                           │           │
│  │         │                        │ spawn()                    │           │
│  │         │                        ▼                           │           │
│  │         │                 ┌──────────────┐                  │           │
│  │         │                 │ Python Engine │                  │           │
│  │         │                 │ (subprocess)  │                  │           │
│  │         │                 └──────────────┘                  │           │
│  │         │                        │                           │           │
│  │         └────────────────────────┴─────────────────────────│           │
│  │                                                              │           │
│  │  Environment: PYTHON_ENGINE_URL not set                     │           │
│  │  → Automatic fallback to local spawn()                      │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- **Production:** Hybrid deployment - Vercel hosts frontend, Railway hosts Python backend
- **Local:** Single-process development - Node.js spawns Python directly
- **Automatic:** Code detects environment and routes accordingly (no config needed)
- **Rationale:** Vercel can't spawn processes, Railway can't match Vercel's frontend optimizations

---

## Directory Structure

```
inspiration/
├── src/
│   ├── app/                    # Next.js 15 App Router
│   │   ├── page.tsx            # Main page (orchestrates components)
│   │   ├── layout.tsx          # Root layout (ErrorBoundary, skip links)
│   │   ├── settings/page.tsx   # Settings wizard
│   │   ├── api/                # API routes (server-side)
│   │   │   ├── generate/       # Calls Python engine
│   │   │   ├── config/         # Config CRUD
│   │   │   ├── banks/          # Bank reading
│   │   │   ├── reverse-match/  # Semantic search chat history
│   │   │   ├── login/          # Authentication
│   │   │   └── logout/         # Logout
│   │   └── globals.css         # Global styles
│   ├── components/             # React components (UI layer)
│   │   ├── BanksOverview.tsx   # Bank statistics & display
│   │   ├── ResultsPanel.tsx    # Results display (formatted/raw)
│   │   ├── SeekSection.tsx # Seek (Use Case) search UI
│   │   ├── ProgressPanel.tsx   # Generation progress display
│   │   ├── ModeCard.tsx        # Mode selection card
│   │   ├── AdvancedSettings.tsx # Advanced settings panel
│   │   ├── ExpectedOutput.tsx  # Expected output summary
│   │   ├── MarkdownContent.tsx # Markdown renderer
│   │   ├── LoadingSpinner.tsx  # Loading spinner icon
│   │   ├── StopIcon.tsx        # Stop icon SVG
│   │   ├── LogoutButton.tsx    # Logout button
│   │   └── ErrorBoundary.tsx   # Error boundary wrapper
│   ├── lib/                    # Shared utilities & types
│   │   ├── types.ts            # TypeScript types & presets
│   │   ├── utils.ts            # Utility functions
│   │   ├── logger.ts           # Conditional logging
│   │   └── errorExplainer.ts   # Error classification for user-friendly messages
│   └── hooks/                  # Custom React hooks
│       └── useDebounce.ts      # Debounce hook
├── engine/                     # Python generation engine
│   ├── generate.py             # Unified content generation CLI (insights/ideas/use_case modes)
│   ├── seek.py                 # Seek (Use Case) CLI (uses unified synthesis pipeline)
│   ├── common/                 # Shared Python utilities
│   │   ├── cursor_db.py        # Cursor DB extraction (SQLite + Bubble logic)
│   │   ├── vector_db.py        # Supabase pgvector integration
│   │   ├── llm.py              # Anthropic + OpenAI wrapper
│   │   ├── config.py           # User config loader
│   │   ├── items_bank.py       # Unified ItemsBank harmonization
│   │   ├── items_bank_supabase.py # Supabase-backed ItemsBank
│   │   ├── coverage.py         # Coverage Intelligence analysis (NEW)
│   │   ├── prompt_compression.py # Per-conversation compression
│   │   ├── semantic_search.py  # Embedding generation & vector similarity
│   │   └── progress_markers.py # Progress streaming & performance logging
│   ├── scripts/                # Utility scripts
│   │   ├── index_all_messages.py # One-time Vector DB indexer
│   │   ├── sync_messages.py    # Incremental Vector DB sync
│   │   ├── init_vector_db.sql  # Supabase schema setup
│   │   └── clear_bank.py       # Clear ItemsBank utility
│   └── prompts/                # LLM prompt templates
│       ├── base_synthesize.md  # Shared prompt base (common rules)
│       ├── insights_synthesize.md # Insights-specific prompt
│       ├── ideas_synthesize.md    # Ideas-specific prompt
│       ├── use_case_synthesize.md # Use case synthesis prompt (NEW)
│       └── judge.md            # Reranking judge prompt
└── data/                       # User data (gitignored)
    ├── config.json             # User configuration
    ├── idea_bank.json          # Structured idea storage
    ├── insight_bank.json       # Structured insight storage
    └── vector_db_sync_state.json # Sync state tracking
```

---

## Frontend Component Architecture

### Separation of Concerns

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              PRESENTATION LAYER (Components)             │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │                                                          │  │
│  │  Feature Components (Domain-Specific)                    │  │
│  │  ├── BanksOverview.tsx         (Bank domain)            │  │
│  │  ├── SeekSection.tsx            (Search domain)          │  │
│  │  ├── ResultsPanel.tsx           (Results domain)         │  │
│  │  │                                                          │  │
│  │  UI Components (Reusable)                               │  │
│  │  ├── ModeCard.tsx              (Mode selection)          │  │
│  │  ├── ProgressPanel.tsx         (Progress display)        │  │
│  │  ├── AdvancedSettings.tsx      (Settings form)          │  │
│  │  ├── ExpectedOutput.tsx        (Output preview)         │  │
│  │  ├── MarkdownContent.tsx       (Markdown renderer)       │  │
│  │  ├── LoadingSpinner.tsx        (Loading indicator)       │  │
│  │  ├── StopIcon.tsx              (Stop icon)               │  │
│  │  ├── LogoutButton.tsx          (Logout action)           │  │
│  │  │                                                          │  │
│  │  Infrastructure Components                               │  │
│  │  └── ErrorBoundary.tsx         (Error handling)          │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              ORCHESTRATION LAYER (Pages)                │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │                                                          │  │
│  │  page.tsx (Main Page - 511 lines)                       │  │
│  │  ├── State management (useState, useRef)                 │  │
│  │  ├── API calls (fetch to /api/generate, /api/sync)        │  │
│  │  ├── Component composition                               │  │
│  │  └── Progress tracking                                   │  │
│  │                                                          │  │
│  │  settings/page.tsx (Settings Wizard)                    │  │
│  │  ├── Config CRUD operations                              │  │
│  │  └── Multi-step wizard UI                               │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              UTILITY LAYER (lib/)                        │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │                                                          │  │
│  │  types.ts         (TypeScript types & presets)          │  │
│  │  utils.ts         (copyToClipboard, downloadFile)         │  │
│  │  logger.ts        (Conditional logging)                 │  │
│  │  errorExplainer.ts (Error → user-friendly explanation)    │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              HOOKS LAYER (hooks/)                        │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │                                                          │  │
│  │  useDebounce.ts   (Debounce hook for search)            │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

**Feature Components** (Domain-Specific):
- **BanksOverview**: Displays idea/insight bank statistics. Owns bank state, fetches from `/api/banks`.
- **SeekSection**: Seek (Use Case) search UI. Owns search state, calls `/api/seek`.
- **ResultsPanel**: Displays generation results. Pure presentation, receives `GenerateResult` prop.

**UI Components** (Reusable):
- **ModeCard**: Mode selection card. Pure presentation, receives `mode` and `onClick` props.
- **ProgressPanel**: Real-time progress display with phases, cost tracking, warnings. Receives streaming progress props.
- **AdvancedSettings**: Advanced settings form. Owns form state via props (controlled component).
- **ExpectedOutput**: Expected output summary. Pure presentation, receives calculation props.
- **MarkdownContent**: Markdown renderer. Pure presentation, receives `content` string.
- **LoadingSpinner**: Loading indicator. Pure presentation, no props.
- **StopIcon**: Stop icon SVG. Pure presentation, no props.
- **LogoutButton**: Logout action. Owns logout state, calls `/api/logout`.

**Infrastructure Components**:
- **ErrorBoundary**: Error boundary wrapper. Cross-cutting concern, catches React errors.

### Component Responsibilities

| Component | Responsibility | State | API Calls | Dependencies |
|-----------|---------------|-------|-----------|--------------|
| `page.tsx` | Orchestration, routing, state management | 20+ useState hooks | Yes (`/api/generate`, `/api/sync`) | All components |
| `BanksOverview` | Bank statistics & display | Bank stats state | Yes (`/api/banks`) | None |
| `SeekSection` | Seek (Use Case) search UI | Search state | Yes (`/api/seek`) | None |
| `ResultsPanel` | Results display | View mode (formatted/raw) | No | `MarkdownContent` |
| `ModeCard` | Mode selection card | None (controlled) | No | None |
| `ProgressPanel` | Real-time progress with phases, cost, warnings | Phase/stat state (from streaming) | No | `LoadingSpinner`, `StopIcon` |
| `AdvancedSettings` | Advanced settings form | None (controlled via props) | No | None |
| `ExpectedOutput` | Expected output summary | None (controlled) | No | None |
| `MarkdownContent` | Markdown renderer | None | No | `react-markdown` |
| `LogoutButton` | Logout action | Loading state | Yes (`/api/logout`) | None |
| `ErrorBoundary` | Error handling | Error state | No | React |

### Data Flow

```
User Interaction
    │
    ▼
page.tsx (Orchestrator)
    │
    ├─→ State updates (useState)
    │   ├─→ selectedTool, selectedMode, showAdvanced
    │   ├─→ isGenerating, result, progress
    │   └─→ seek state
    │
    ├─→ API calls (fetch)
    │   │
    │   ├─→ /api/generate (POST)
    │   │   └─→ Python: generate.py --mode {tool}
    │   │       └─→ Unified Synthesis Pipeline
    │   │           └─→ Vector DB (Supabase) → LLM → ItemsBank
    │   │
    │   ├─→ /api/seek (POST)
    │   │   └─→ Python: seek.py --query {query}
    │   │       └─→ Unified Synthesis Pipeline
    │   │           └─→ Vector DB (Supabase) → LLM → ItemsBank
    │   │
    │   ├─→ /api/sync (POST)
    │   │   └─→ Python: sync_messages.py
    │   │       └─→ Cursor DB (SQLite) → Vector DB (Supabase)
    │
    └─→ Props to Components
        │
        ├─→ Feature Components (domain state)
        │   ├─→ BanksOverview (fetches own data)
        │   └─→ SeekSection (receives state from parent)
        │
        └─→ UI Components (presentation)
            └─→ ResultsPanel, ModeCard, ProgressPanel, etc.
```

### Component Categorization (Updated 2026-01-10)

**Feature Components (Domain-Specific):**

| Component | Purpose | Owns State | API Calls |
|-----------|---------|------------|-----------|
| `ScoreboardHeader` | Memory + Library stats | Yes | `/api/brain-stats`, `/api/items`, `/api/sync` |
| `LibraryView` | Library browsing with detail panel | Yes | `/api/items`, `/api/items/bulk`, `/api/items/merge` |
| `LibrarySearch` | Search and filter items | Yes (via parent) | None (filters parent data) |
| `BanksOverview` | Library preview in compact mode | Yes | `/api/items` |
| `SeekSection` | Use case search with results | Yes | `/api/seek` |
| `ResultsPanel` | Generated results display | No | None |
| `ProgressPanel` | Generation progress | No | None |

**UI Components (Reusable):**

| Component | Purpose | Props |
|-----------|---------|-------|
| `ItemCard` | Display single library item | `item`, `isExpanded` |
| `ModeCard` | Mode selection card | `mode`, `isSelected`, `onClick` |
| `ViewToggle` | View mode switcher | `viewMode`, `onChange` |
| `LoadingSpinner` | Loading indicator | None |
| `StopIcon` | Stop button icon | None |
| `MarkdownContent` | Render markdown | `content` |
| `ExpectedOutput` | Cost/time estimate | Config props |
| `AnalysisCoverage` | Analysis scope display | Stats props |

**Configuration Components:**

| Component | Purpose | API |
|-----------|---------|-----|
| `AdvancedConfigSection` | Full configuration (🔴 needs splitting) | `/api/config` |
| `AdvancedSettings` | Generation settings | None (props) |
| `ModeSettingsEditor` | Per-mode settings | `/api/modes` |
| `ModeSettingsManager` | Mode CRUD | `/api/modes` |
| `ModeForm` | Create/edit mode | `/api/modes` |
| `PromptTemplateEditor` | Edit prompt templates | `/api/prompts` |
| `SimpleModeSelector` | Simple mode dropdown | None |

**Infrastructure Components:**

| Component | Purpose | Scope |
|-----------|---------|-------|
| `ErrorBoundary` | Catch React errors | App-level |
| `SectionErrorBoundary` | Catch section errors | Section-level |
| `LogoutButton` | Auth logout | Navigation |

---

### Bounded Contexts (Updated 2026-01-10)

**1. Generation Context** (`page.tsx`, `ResultsPanel`, `ProgressPanel`, `ModeCard`, `AdvancedSettings`, `ExpectedOutput`)
- **Purpose**: Generate insights/ideas from chat history
- **Boundaries**: Mode selection → Generate → Results display → Harmonize to Library
- **State**: `selectedModeId`, `selectedTheme`, `isGenerating`, `result`, `progress`
- **API**: `/api/generate`, `/api/harmonize`

**2. Seek Context** (`page.tsx`, `SeekSection`)
- **Purpose**: Search chat history for evidence of user-provided queries
- **Boundaries**: Query input → Search → Results display → Harmonize to Library
- **State**: `reverseQuery`, `reverseDaysBack`, `reverseTopK`, `reverseMinSimilarity`, `seekResult`
- **API**: `/api/seek`

**3. Library Context** (`LibraryView`, `LibrarySearch`, `BanksOverview`, `ItemCard`)
- **Purpose**: Browse, search, filter, and manage Library items
- **Boundaries**: Search → Filter → View items → Bulk actions → Merge → Detail panel
- **State**: `items`, `filters`, `selectedIds`, `expandedItem`, `staleCount`
- **API**: `/api/items`, `/api/items/bulk`, `/api/items/merge`, `/api/items/cleanup`

**4. Theme Explorer Context** (`themes/page.tsx`)
- **Purpose**: Interactive theme grouping with LLM synthesis
- **Boundaries**: Adjust zoom → View themes → Click theme → See synthesis
- **State**: `themes`, `zoomLevel`, `selectedTheme`, `synthesis`, `isLoading`
- **API**: `/api/items/themes`, `/api/items/themes/preview`, `/api/items/themes/synthesize`

**5. Settings Context** (`settings/page.tsx`, `AdvancedConfigSection`)
- **Purpose**: Configure all app settings
- **Boundaries**: Tab navigation → Edit settings → Save config
- **State**: `config`, `activeTab`, form states
- **API**: `/api/config`, `/api/modes`, `/api/prompts`

**6. Onboarding Context** (`onboarding/page.tsx`)
- **Purpose**: New user setup wizard
- **Boundaries**: Welcome → API Keys → Sync → Complete
- **State**: `step`, `apiKeys`, `syncStatus`
- **API**: `/api/config/env`, `/api/config`, `/api/sync`

**7. Scoreboard Context** (`ScoreboardHeader`)
- **Purpose**: Always-visible Memory + Library status
- **Boundaries**: Display stats → Sync action → Navigate to Library/Theme Explorer
- **State**: `memoryStats`, `libraryStats`, `isSyncing`
- **API**: `/api/brain-stats`, `/api/items`, `/api/sync`

**8. Coverage Intelligence Context** (`coverage/page.tsx`, `CoverageDashboard`)
- **Purpose**: Automate Library growth by analyzing Memory terrain vs. Library coverage
- **Boundaries**: Analyze coverage → Identify gaps → Suggest runs → Execute runs → Track completion
- **State**: `memoryDensity`, `libraryCoverage`, `coverageGaps`, `suggestedRuns`, `coverageScore`
- **API**: `/api/coverage/analyze`, `/api/coverage/runs`, `/api/coverage/runs/execute`

**Core Concepts:**
- **Memory Terrain**: Conversation density by week (from `get_memory_density_by_week()` RPC)
- **Library Coverage**: Items with `source_start_date`/`source_end_date` spanning each week
- **Coverage Gap**: Week with high conversation count but low/no Library items
- **Coverage Run**: Queued generation job targeting a specific date range

**Data Flow:**
```
/coverage page loads
    ↓
GET /api/coverage/analyze
    ↓
Python: coverage.py → get_memory_density_from_db()
                    → get_library_coverage_from_db()
                    → analyze_coverage() → gaps
                    → suggest_runs_from_gaps()
    ↓
Frontend displays:
    ├─→ Coverage Score (0-100%)
    ├─→ Memory Terrain vs Library Coverage chart
    └─→ Suggested Runs (with "Run Now" buttons)
    
User clicks "Run Now"
    ↓
POST /api/coverage/runs/execute
    ↓
Python: generate.py --mode ideas/insights
        --date-range start:end
        --item-count N
        --source-run-id {runId}
    ↓
Items generated with source_start_date/source_end_date
    ↓
Coverage run marked completed
```

---

### v3 UI Architecture (Library-Centric Layout)

**Terminology:**
- "Brain" → **Memory** (indexed chat history in Vector DB)
- "Bank" → **Library** (accumulated ideas/insights/use cases)

**Layout Structure:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SCOREBOARD HEADER (always visible)                                         │
│  ┌─────────────────────────────┬───────────────────────────────────────────┐│
│  │ 🧠 MEMORY                   │ 📚 LIBRARY                                ││
│  │ 2.1GB | Jul 15 → Jan 1     │ 247 items | +12 this week                 ││
│  │ 3 workspaces [🔄 Sync]     │ 14 themes [View All →]                    ││
│  └─────────────────────────────┴───────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
┌───────────────────────────────┬─────────────────────────────────────────────┐
│  📚 LIBRARY PANEL             │  ✨ ACTION PANEL                             │
│  ─────────────────────────    │  ─────────────────────────────────────────  │
│  [Search...] [Filters ▼]      │  [Mode: Idea ▼] [Preset: Sprint ▼]         │
│                               │  [⚙️ Advanced]                              │
│  CATEGORIES                   │                                              │
│  ▼ AI Agents (12 items, +3)  │  ANALYSIS COVERAGE                          │
│    • Semantic Code Review     │  📅 Dec 18 → Jan 1 (14 days)               │
│    • Prompt Debugger          │  💬 2,847 messages | 127 conversations      │
│    • ...                      │  📁 3 workspaces                            │
│  ▶ CLI Tools (8 items)       │                                              │
│  ▶ API Patterns (15 items)   │  [Generate 10 Ideas →]                      │
│                               │  Expected: ~45s | ~$0.23                     │
│  RECENT ITEMS                 │                                              │
│  • Item Name (Dec 28)        │  ─────────────────────────────────────────  │
│  • Item Name (Dec 27)        │  RESULTS / PROGRESS                          │
│  • ...                        │  ✅ Analyzed 127 conversations               │
│                               │  📊 15 generated → 10 after dedup           │
│  ACTIVITY                     │  🏦 Library: 247 → 253 (+6 new)            │
│  • +6 items (Jan 1, 10:30)   │                                              │
│  • +3 items (Dec 31, 2:15)   │  [Item cards with source context...]        │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

**Component Hierarchy (v3):**

```
page.tsx
├─→ ScoreboardHeader
│   ├─→ MemoryStats (size, coverage, workspaces, sync button)
│   └─→ LibraryStats (total items, weekly delta, themes)
│
├─→ MainLayout (two-panel)
│   │
│   ├─→ LibraryPanel (left)
│   │   ├─→ SearchBar
│   │   ├─→ FilterControls
│   │   ├─→ CategoriesList (collapsible)
│   │   ├─→ RecentItemsList
│   │   └─→ ActivityFeed
│   │
│   └─→ ActionPanel (right)
│       ├─→ ModeSelector
│       ├─→ PresetSelector
│       ├─→ AdvancedSettings (collapsible)
│       ├─→ AnalysisCoverage (new - shows what will be analyzed)
│       ├─→ GenerateButton
│       ├─→ ProgressPanel (during generation)
│       └─→ ResultsPanel (after generation)
│           └─→ ItemCard (with source context)
│               ├─→ ItemContent
│               ├─→ SourceContext (dates, workspace)
│               └─→ ItemActions (copy, export, archive)
```

**New Bounded Contexts (v3):**

**5. Scoreboard Context** (`ScoreboardHeader`)
- **Purpose**: Always-visible Memory + Library status
- **Boundaries**: Display stats → Sync action → Navigate to Library
- **State**: `memoryStats`, `libraryStats`, `isSyncing`
- **API**: `/api/brain-stats`, `/api/items`, `/api/sync`

**6. Library Panel Context** (`LibraryPanel`)
- **Purpose**: Browse and manage Library items
- **Boundaries**: Search → Filter → Browse categories → View items
- **State**: `searchQuery`, `filters`, `expandedCategories`, `selectedItem`
- **API**: `/api/items`

**7. Analysis Coverage Context** (`AnalysisCoverage`)
- **Purpose**: Show what data will be/was analyzed
- **Boundaries**: Display coverage before generation → Update after generation
- **State**: `coverageStats` (messages, dates, workspaces)
- **API**: Derived from generation request/response

---

### Design Principles

1. **Single Responsibility**: Each component has one clear purpose
2. **Composition over Inheritance**: Components compose via props
3. **Props Down, Events Up**: Data flows down, events flow up
4. **Container/Presenter Split**: `page.tsx` is container (logic), components are presenters (UI)
5. **Domain Boundaries**: Feature components own domain state; UI components are stateless
6. **Reusability**: UI components are reusable across contexts
7. **Memoization**: Expensive components (`BanksOverview`, `ResultsPanel`) use `React.memo`

### State Management Strategy

**State Colocation Decision Tree:**
```
State needed by:
├─→ Single component → useState (local state)
│   Examples: showAdvanced, isGenerating, progress
│
├─→ Parent + immediate children → Lift state to parent
│   Examples: selectedTool, selectedMode (used by ModeCard, ExpectedOutput)
│
├─→ Sibling components → Lift to common ancestor
│   Examples: result (used by ResultsPanel, but no siblings)
│
└─→ Multiple pages/features → Context API or state management library
    Not needed (single-page app)
```

**State Management Patterns:**

| Pattern | When Used | Example |
|---------|-----------|---------|
| **useState** | Component-local state | Form inputs, UI toggles, progress |
| **useRef** | Mutable values that don't trigger re-renders | AbortController, intervals |
| **useCallback** | Memoize functions passed as props | `handleSync`, `handleGenerate`, `estimateTime` |
| **useMemo** | Memoize expensive computations | `currentModeConfig`, `estimateCost` |
| **React.memo** | Prevent unnecessary re-renders | `BanksOverview`, `ResultsPanel` |

**State Normalization:**
- No complex nested state structures
- Flat state objects (e.g., `result.stats.conversationsAnalyzed`)
- No normalization needed (simple data structures)

**Derived State vs Stored State:**
- **Derived**: `currentModeConfig` (computed from `selectedMode`), `getCurrentBestOf()` (computed from `showAdvanced`)
- **Stored**: `selectedTool`, `selectedMode`, `isGenerating` (explicitly stored)
- Prefer derived when possible to avoid sync issues

### Error Handling & Resilience Patterns

**Error Boundary Strategy:**
```
┌─────────────────────────────────────────┐
│         App-Level Error Boundary        │
│  (ErrorBoundary in layout.tsx)          │
└─────────────────────────────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
┌───▼────┐         ┌───▼────┐
│ page   │         │settings│
│        │         │        │
└───┬────┘         └───┬────┘
    │                   │
┌───▼────┐         ┌───▼────┐
│Feature │         │Feature │
│Comps   │         │Comps   │
└────────┘         └────────┘
```

**Error Handling Layers:**

| Layer | Responsibility | Pattern |
|-------|---------------|---------|
| **Component** | Try/catch for async operations | `try/catch` in event handlers (`handleSync`, `handleGenerate`) |
| **Page** | Error state management | `result.error`, `syncStatus` for user feedback |
| **App** | Global error boundary | `<ErrorBoundary>` in `layout.tsx` |
| **API** | API error handling | Error responses, abort signal handling |

**Fallback UI Patterns:**
- **Loading**: `ProgressPanel` with progress bar, `LoadingSpinner`
- **Error**: Error messages in `ResultsPanel`, `BanksOverview`
- **Empty**: Empty state messages ("No matches found", "No output generated")
- **Offline**: Not implemented (future enhancement)

**Error Recovery Patterns:**
- **Retry**: Manual retry buttons (`BanksOverview` retry button)
- **Fallback**: Graceful degradation (cloud mode message for sync)
- **Graceful Degradation**: Disable features, show message (sync disabled in cloud)

### Dependency Management & Coupling

**Import Organization:**
```typescript
// 1. External dependencies
import { useState, useEffect } from "react";
import { NextRequest, NextResponse } from "next/server";

// 2. Internal absolute imports (@/ alias)
import { BanksOverview } from "@/components/BanksOverview";
import { GenerateResult } from "@/lib/types";

// 3. Relative imports (rare)
import { utils } from "./utils";

// 4. Types (always last)
import type { ToolType } from "@/lib/types";
```

**Coupling Analysis:**
- **Low Coupling**: Components depend on props/types, not concrete implementations
- **No Circular Dependencies**: Clean import hierarchy
- **Barrel Exports**: Not used (direct imports preferred)

**Dependency Inversion:**
- Components depend on abstractions (interfaces, types)
- Example: `ResultsPanel` receives `GenerateResult` type, not concrete implementation

### API & Data Layer Architecture

**API Client Organization (Updated 2026-01-10):**
```
src/app/api/
├── generate/route.ts          # Content generation endpoint
├── generate-stream/route.ts   # Streaming generation with progress markers
├── seek/route.ts              # Seek (Use Case) search endpoint
├── seek-stream/route.ts       # Streaming seek with progress markers
├── performance/route.ts       # Performance analytics (logs, analysis)
├── sync/route.ts              # Vector DB sync endpoint
├── config/                    # Configuration
│   ├── route.ts               # Config CRUD
│   ├── env/route.ts           # Environment variables
│   └── validate/route.ts      # Config validation
├── items/                     # Library items
│   ├── route.ts               # Items CRUD
│   ├── bulk/route.ts          # Bulk operations
│   ├── cleanup/route.ts       # Stale item cleanup
│   ├── merge/route.ts         # Merge similar items
│   └── themes/                # Theme grouping
│       ├── route.ts           # Theme listing
│       ├── preview/route.ts   # Theme preview
│       └── synthesize/route.ts # LLM synthesis
├── brain-stats/route.ts       # Memory stats endpoint
├── brain-diagnostics/route.ts # Diagnostics endpoint
├── coverage/                  # Coverage Intelligence
│   ├── analyze/route.ts       # Analyze coverage gaps
│   ├── runs/route.ts          # Coverage runs CRUD
│   └── runs/execute/route.ts  # Execute coverage run
├── chat-history/route.ts      # Chat history endpoint
├── harmonize/route.ts         # Item harmonization
├── modes/route.ts             # Mode management
├── prompts/route.ts           # Prompt templates
├── themes/route.ts            # Themes config
├── login/route.ts             # Authentication
├── logout/route.ts            # Logout
└── test-supabase/route.ts     # DB connection test
```

**Data Fetching Patterns:**

| Pattern | Library | When Used |
|---------|---------|-----------|
| **Custom Hooks** | None | Simple cases, full control (`useDebounce`) |
| **Direct fetch** | Native fetch | All API calls (no React Query/SWR needed) |
| **Server Components** | Next.js | Not used (all client components) |

**Cache Boundaries:**
- **No client-side caching**: Each request fetches fresh data
- **Server-side caching**: Python scripts cache prompts, embeddings, conversations
- **Time-based**: No TTL (always fresh data)

**Data Transformation Layers:**
- **API Routes**: Transform Python script output to JSON
- **Components**: Transform API responses to display format
- **Validation**: TypeScript types provide compile-time validation

### Performance Architecture Patterns

**Code Splitting Strategy:**
- **Route-based**: Next.js App Router handles automatic code splitting
- **Component-based**: Not implemented (components are small enough)

**Memoization Decision Tree:**
```
Expensive computation?
├─→ Yes → useMemo (currentModeConfig, estimateCost)
└─→ No → Skip memoization

Function passed as prop?
├─→ Yes → useCallback (handleSync, handleGenerate, estimateTime)
└─→ No → Skip memoization

Component re-renders unnecessarily?
├─→ Yes → React.memo (BanksOverview, ResultsPanel)
└─→ No → Skip memoization
```

**Performance Patterns:**

| Pattern | When Used | Implementation |
|---------|-----------|----------------|
| **Lazy Loading** | Not needed | Components are small |
| **Virtualization** | Not needed | Lists are short (<50 items) |
| **Debouncing** | Search input | `useDebounce` hook (500ms) |
| **Throttling** | Not needed | No scroll/resize handlers |
| **Code Splitting** | Route-based | Next.js automatic |

**Bundle Size Management:**
- Tree shaking: ES modules, named exports
- Dynamic imports: Not used (components are small)
- Bundle analysis: Not configured (future enhancement)

**Component Size Analysis (Updated 2026-01-10 — Post-Refactoring):**

| Component | Lines | Status | Notes |
|-----------|-------|--------|-------|
| `onboarding/page.tsx` | 870 | ⚠️ Large | Wizard flow - tightly coupled by design |
| `page.tsx` | 782 | ⚠️ Large | Main page - acceptable for orchestration |
| `LibraryView.tsx` | 741 | ✅ Acceptable | Self-contained with co-located sub-components |
| `settings/page.tsx` | 555 | ✅ Refactored | Was 1,177 → Extracted 6 components |
| `generate/route.ts` | 501 | ⚠️ Large | Consider: Split complex logic |
| `themes/page.tsx` | 450 | ✅ Acceptable | Theme Explorer - complex by nature |
| `SeekSection.tsx` | 387 | ✅ Good | Single-purpose component |
| `ResultsPanel.tsx` | 378 | ✅ Good | Well-sized |
| `BanksOverview.tsx` | 296 | ✅ Good | Well-sized |
| `ScoreboardHeader.tsx` | 282 | ✅ Good | Well-sized |
| `AdvancedConfigSection.tsx` | 259 | ✅ Refactored | Was 1,228 → Extracted 9 components |
| Others | <250 | ✅ Excellent | Well-sized |

**Refactoring Completed (2026-01-10):**

| Component | Before | After | Extracted Components |
|-----------|--------|-------|----------------------|
| `AdvancedConfigSection.tsx` | 1,228 | 259 | `config/LLMConfigSection`, `config/ThresholdsSection`, `config/TimePresetsSection`, `config/GenerationSection`, `config/SeekDefaultsSection`, `config/SemanticSearchSection`, `config/ThemeExplorerSection`, `config/ThemeSynthesisSection`, `config/ConfigHelpers` |
| `settings/page.tsx` | 1,177 | 555 | `settings/SettingsSection`, `settings/WorkspacesSection`, `settings/VectorDBSection`, `settings/VoiceStyleSection`, `settings/LLMSettingsSection`, `settings/PowerFeaturesSection` |

**Not Refactored (Intentionally):**

| Component | Lines | Reason |
|-----------|-------|--------|
| `LibraryView.tsx` | 741 | Sub-components (`ItemCard`, `ItemDetailPanel`) are co-located in same file - no reuse benefit from extraction |
| `onboarding/page.tsx` | 870 | Wizard flow is tightly coupled by design |
| `page.tsx` | 782 | Main orchestration page with complex state |

**Performance Recommendations:**
1. **Split `page.tsx`**: Extract `GenerationSection` and `SeekSection` components
2. **Split `SeekSection.tsx`**: Extract `MatchList` and `MatchItem` components
3. **Add React Suspense**: Wrap lazy-loaded components (if splitting)
4. **Bundle Analysis**: Configure `@next/bundle-analyzer` for monitoring

### Extension Points

1. **New Components** — Add to `src/components/` following existing patterns
2. **New Hooks** — Add to `src/hooks/` for reusable logic
3. **New Utilities** — Add to `src/lib/utils.ts` or create new utility modules
4. **New API Routes** — Add to `src/app/api/` following existing patterns
5. **New Bounded Contexts** — Create new feature component group with clear boundaries
6. **New Generation Modes** — Add to `generate.py --mode` parameter (extend `MODE_CONFIG`)

---

## Architecture: Cursor Data Extraction

### The "Bubble" Architecture
Cursor stores chat history in a complex structure within `state.vscdb` (SQLite):
1.  **`composerData`**: High-level metadata about a conversation session.
2.  **`bubbleId`**: Individual messages are stored as distinct blobs, referenced by `fullConversationHeadersOnly` in the composer entry.
3.  **Extraction Logic**: `cursor_db.py` handles this by:
    *   Scanning `composerData` and `chatData` entries.
    *   Parsing `fullConversationHeadersOnly` to find `bubbleId`s.
    *   Looking up each `bubbleId` to get the raw text content.
    *   Deriving timestamps from the parent composer entry if individual bubble timestamps are missing (distributing them evenly between start/end times).

---

## Architecture: Vector Database (Supabase)

To handle large chat histories (e.g., 2.1GB+), we use an external Vector DB.

### 1. Initial Indexing
*   **Script:** `engine/scripts/index_all_messages.py`
*   **Flow:** Extract from SQLite → Generate Embeddings (OpenAI) → Store in Supabase (`cursor_messages` table).
*   **Capacity:** Scalable to millions of messages (Postgres).

### 2. Incremental Sync
*   **Script:** `engine/scripts/sync_messages.py`
*   **Flow:** Check `vector_db_sync_state.json` → Fetch new messages from SQLite (since last sync) → Embed & Upsert to Supabase.
*   **Frequency:** Can be run daily via cron.

### 3. Unified Synthesis Pipeline (Generate & Seek)

Both Generate and Seek now use the same pipeline:

**Step 1: Semantic Search**
*   **Module:** `engine/common/semantic_search.py`
*   **Logic:** Use `vector_db.py` to run similarity search in Postgres (fast)
*   **Generate:** Uses predefined queries (configurable per mode)
*   **Seek:** Uses user's query

**Step 2: Fetch Conversations**
*   **Module:** `engine/common/vector_db.py`
*   **Function:** `get_conversations_by_chat_ids()` - fetches only relevant conversations

**Step 3: Compress (if needed)**
*   **Module:** `engine/common/prompt_compression.py`
*   **Logic:** Per-conversation compression for large conversations (>800 tokens)

**Step 4: LLM Synthesis**
*   **Module:** `engine/generate.py` → `generate_content()`
*   **Prompts:** Mode-specific (`insights_synthesize.md`, `ideas_synthesize.md`, `use_case_synthesize.md`)
*   **Output:** Structured content (Ideas, Insights, or Use Cases)

**Step 5: Save & Harmonize**
*   **Module:** `engine/generate.py` → `save_output()` + `harmonize_all_outputs()`
*   **Logic:** Save to markdown file → Parse items → Add to ItemsBank → Generate categories

---

## Optimization Architecture

### Caching Layer

```
┌─────────────────────────────────────────────────────────────┐
│                      CACHING LAYER                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐              │
│  │ Prompt Templates  │  │ Conversations    │              │
│  │ (RAM cache)       │  │ (JSON cache)     │              │
│  │                   │  │                  │              │
│  │ File: generate.py │  │ File: cursor_db  │              │
│  │ (--mode ideas/    │  │       .py        │              │
│  │  insights)        │  │                  │              │
│  └──────────────────┘  └──────────────────┘              │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐              │
│  │ Harmonization    │  │ Vector DB        │              │
│  │ (JSON cache)     │  │ (Supabase)       │              │
│  │                  │  │                  │              │
│  │ File: bank.py    │  │ File: vector_db  │              │
│  │                   │  │       .py        │              │
│  └──────────────────┘  └──────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### LLM Optimization Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    LLM CALL OPTIMIZATION                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Generation Request                                         │
│       │                                                     │
│       ├─→ Check Cache? ──→ Hit? ──→ Return cached         │
│       │                    │                               │
│       │                    └─→ Miss? ──→ Continue         │
│       │                                                     │
│       ├─→ Parallel Gen? ──→ Yes ──→ ThreadPoolExecutor    │
│       │                    │         (5 concurrent)       │
│       │                    └─→ No ──→ Sequential          │
│       │                                                     │
│       ├─→ Judge Model ──→ Cheaper? ──→ GPT-3.5 (opt-in)   │
│       │                    │                               │
│       │                    └─→ Default ──→ Claude         │
│       │                                                     │
│       ├─→ Retry Logic ──→ Fail? ──→ Exponential backoff   │
│       │                    │         (1s → 2s → 4s)       │
│       │                    └─→ Success ──→ Return          │
│       │                                                     │
│       └─→ Prompt Compression? ──→ Yes (>10K tokens) ──→   │
│                                   GPT-3.5 summarize         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## E2E Workflows

### Workflow 6: Seek (Use Case) - Unified Synthesis Pipeline

```
┌──────────────────────────────────────────────────────────────────────┐
│                      SEEK (USE CASE) WORKFLOW                         │
│              (Unified Synthesis Pipeline - Same as Generate)           │
└──────────────────────────────────────────────────────────────────────┘

User        UI          API            Python Engine      Supabase (PgVector)
  │          │            │                  │                 │
  │─ Enter ─▶│           │                  │                 │
  │  query   │           │                  │                 │
  │           │           │                  │                 │
  │─ Click ──▶│           │                  │                 │
  │ Seek      │           │                  │                 │
  │           │── POST ──▶│                  │                 │
  │           │/api/seek  │                  │                 │
  │           │           │                  │                 │
  │           │           │──── Spawn ──────▶│                 │
  │           │           │   python seek.py │                 │
  │           │           │                  │                 │
  │           │           │                  │─ Semantic ─────▶│
  │           │           │                  │   Search        │
  │           │           │                  │◀─ Conversations │
  │           │           │                  │                 │
  │           │           │                  │─ Fetch Full ───▶│
  │           │           │                  │   Conversations │
  │           │           │                  │◀─ Full Context ─│
  │           │           │                  │                 │
  │           │           │                  │─ Compress ──────▶│
  │           │           │                  │   (if needed)   │
  │           │           │                  │◀─ Compressed ───│
  │           │           │                  │                 │
  │           │           │                  │─ LLM ───────────▶│
  │           │           │                  │   Synthesis      │
  │           │           │                  │   (use_case)    │
  │           │           │                  │◀─ Use Cases ────│
  │           │           │                  │                 │
  │           │           │                  │─ Save File ─────▶│
  │           │           │                  │   (markdown)     │
  │           │           │                  │                 │
  │           │           │                  │─ Harmonize ─────▶│
  │           │           │                  │   ItemsBank      │
  │           │           │                  │◀─ Saved ────────│
  │           │           │                  │                 │
  │           │           │                  │─ Categories ────▶│
  │           │           │                  │   (auto-group)   │
  │           │           │                  │◀─ Grouped ──────│
  │           │           │                  │                 │
  │           │           │◀──── stdout ─────│                 │
  │           │           │   JSON (content   │                 │
  │           │           │   + items)       │                 │
  │           │◀─ JSON ───│                  │                 │
  │◀─ Render ─│  response │                  │                 │
  │   use     │           │                  │                 │
  │   cases   │           │                  │                 │
  │           │           │                  │                 │
```

**Key Difference from Generate:**
- Input: User's query (not predefined queries)
- Prompt: `use_case_synthesize.md` (finds examples, not generates new ideas)
- Output: Structured use cases (What, How, Context, Similarity, Takeaways)
- Bank Mode: `use_case` (saved to ItemsBank with `theme="seek"`)

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Vector DB** | Supabase pgvector | Handles massive datasets (2GB+) efficiently; SQL-compatible |
| **Extraction** | Bubble-aware SQLite | Necessary to parse Cursor's fragmented message storage |
| **Search Strategy** | Hybrid | Vector search for speed/scale; SQLite fallback for portability |
| **Sync Strategy** | Incremental | Only sync new messages to save API costs and time |
| **UI Framework** | Next.js 15 | Modern, React Server Components |
| **Engine** | Python | Rich ecosystem for DB/AI tasks |

---

## Cross-Platform Support

### Cursor DB Detection
Auto-detects path based on OS:
*   **macOS:** `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
*   **Windows:** `%APPDATA%/Cursor/User/globalStorage/state.vscdb`
*   **Linux:** `~/.config/Cursor/User/globalStorage/state.vscdb`

---

## Performance Characteristics

### Generation Performance (2025-12-30 Optimizations)

| Scenario | Before Optimizations | After Optimizations | Speedup |
|----------|----------------------|---------------------|---------|
| **Single day** | ~3-5s | **~0.5-1s** | **5-10x** |
| **7 days** | ~20-35s | **~2-5s** | **7-10x** |
| **14 days (sprint)** | ~40-70s | **~4-8s** | **8-10x** |
| **28 days (month)** | ~80-140s | **~8-15s** | **8-10x** |

### Search Performance

| Operation | Before (SQLite/JSON) | After (Vector DB) | Improvement |
|-----------|----------------------|-------------------|-------------|
| **Seek (Use Case) - 90 days** | 3-5 seconds | **0.5-1 second** | **5-10x Faster** |
| **Scaling Limit** | ~3GB database | Terabytes | **Unlimited** |
| **Data Integrity** | Locked file risks | Independent clone | **High** |
| **Search Cost** | Per-query embedding | One-time indexing | **~99% Cheaper** |

### Performance Optimization Architecture (2025-01-30)

**1. Parallelized Semantic Searches**
- **Implementation:** `ThreadPoolExecutor` with max 5 workers
- **Location:** `engine/generate.py` → `_get_relevant_conversations()`
- **Impact:** 5 search queries run concurrently instead of sequentially
- **Speedup:** ~5x faster search phase (from ~1-2.5s to ~200-500ms)

**2. Optimized Data Fetching**
- **Implementation:** New `get_conversations_by_chat_ids()` function
- **Location:** `engine/common/vector_db.py`
- **Impact:** Fetches only relevant conversations (not all then filter)
- **Speedup:** 10-100x faster for days with many conversations

**3. Parallelized Date Processing**
- **Implementation:** `ThreadPoolExecutor` with max 10 workers
- **Location:** `engine/generate.py` → `process_aggregated_range()`
- **Impact:** Processes multiple dates concurrently
- **Speedup:** Up to 10x faster for multi-day ranges

**Performance Optimizations (2025-01-30):**

1. **Skip Judging for `best_of=1`**
   - **When:** Only 1 candidate generated
   - **Impact:** Saves 5-15 seconds, ~$0.003 per generation
   - **Implementation:** Early return in `generate_content()` if `best_of <= 1`

2. **Skip Compression for Small Date Ranges**
   - **When:** Date range < 7 days
   - **Impact:** Saves 10-30 seconds, ~$0.001-0.005 per generation
   - **Implementation:** Check `date_range_days < 7` before compression in `process_aggregated_range()` and `seek_use_case()`

3. **Async Category Generation**
   - **When:** Items added to bank
   - **Impact:** Saves 15-30 seconds from user wait time (non-blocking)
   - **Implementation:** Background thread using `threading.Thread` with `daemon=True`
   - **Fallback:** Synchronous if threading fails

**Performance Bottlenecks Eliminated:**
- ❌ Sequential semantic searches (5 queries waiting for each other)
- ❌ Over-fetching conversations (fetch all, filter client-side)
- ❌ Sequential date processing (one date at a time)
- ❌ Unnecessary judging when only 1 candidate (2025-01-30)
- ❌ Compression for small date ranges (2025-01-30)
- ❌ Blocking category generation (2025-01-30)

**Vector DB Sync Optimizations (2025-01-30):**

1. **Pre-truncate Long Messages**
   - **Implementation:** Messages >6000 chars truncated before embedding API call
   - **Location:** `engine/scripts/sync_messages.py`, `engine/scripts/index_all_messages.py`
   - **Impact:** Prevents ~104 failed messages per sync, saves API calls and retries
   - **Constants:** `MAX_TEXT_LENGTH = 6000`

2. **Increased Batch Size**
   - **Implementation:** Changed from 100 to 200 messages per batch
   - **Location:** `engine/common/vector_db.py` → `batch_get_embeddings()`
   - **Impact:** 2x faster batch processing, fewer API calls
   - **Constants:** `BATCH_SIZE = 200`

3. **Skip Very Short Messages**
   - **Implementation:** Messages <10 chars skipped entirely
   - **Location:** `engine/scripts/sync_messages.py`
   - **Impact:** Reduced processing time, lower cost, better quality
   - **Constants:** `MIN_TEXT_LENGTH = 10`

4. **Cache-First Embedding**
   - **Implementation:** `batch_get_embeddings()` checks cache before API calls
   - **Location:** `engine/common/vector_db.py`
   - **Impact:** Zero cost for cached embeddings, instant retrieval

**Expected Performance (per 100 new messages):**
- **Before:** ~2-3 minutes, ~100 API calls, ~5-10 failures
- **After:** ~1-1.5 minutes, ~50 API calls, ~0 failures
- **Savings:** ~50% time, ~50% API calls, 100% failure reduction

**Current Architecture:**
```
Generation Request
    │
    ├─→ Parallel Semantic Searches (5 concurrent)
    │   └─→ ThreadPoolExecutor (max 5 workers)
    │
    ├─→ Efficient Data Fetching (by chat_ids only)
    │   └─→ get_conversations_by_chat_ids()
    │
    └─→ Parallel Date Processing (multi-day ranges)
        └─→ ThreadPoolExecutor (max 10 workers)
```

---

---

## Unified Synthesis Pipeline Architecture (2025-01-30)

**All modes (Generate Insights, Generate Ideas, Seek Use Cases) now use the same backend flow:**

```
1. Semantic Search
   ├─→ Generate: Predefined queries (configurable per mode)
   └─→ Seek: User's query
   │
   └─→ Vector DB (Supabase pgvector)
       └─→ Returns relevant chat_ids

2. Fetch Conversations
   └─→ get_conversations_by_chat_ids()
       └─→ Returns full conversations (only relevant ones)

3. Compress (if needed)
   └─→ compress_single_conversation()
       └─→ Per-conversation compression (>800 tokens)

4. LLM Synthesis
   ├─→ generate_content()
   ├─→ Mode-specific prompt:
   │   ├─→ insights_synthesize.md (for Insights)
   │   ├─→ ideas_synthesize.md (for Ideas)
   │   └─→ use_case_synthesize.md (for Use Cases)
   └─→ Returns structured content

5. Save to File
   └─→ save_output()
       └─→ Markdown file with header + content + candidates

6. Harmonize to Bank
   ├─→ _parse_output() - Extract items from markdown
   ├─→ ItemsBank.add_item() - Add/update items
   └─→ ItemsBank.save() - Persist to items_bank.json

7. Generate Categories
   └─→ ItemsBank.generate_categories()
       └─→ Groups similar items using cosine similarity
```

**Key Benefits:**
- Single codebase for all modes (DRY principle)
- Consistent behavior across modes
- Easier to maintain and extend
- Use cases become reusable assets in bank

**Last Updated:** 2026-01-11 (Progress Tracking & Transparency Architecture)

---

## Deployment Architecture

### Overview

Inspiration uses a **hybrid deployment architecture**:
- **Vercel:** Hosts Next.js frontend (edge network, automatic optimizations)
- **Railway:** Hosts Python engine (Flask API wrapping existing scripts)

This architecture was chosen because Vercel serverless functions cannot spawn child processes, but Railway provides full Python runtime support.

### Communication Flow

**Production (Vercel → Railway):**
```
User Action (e.g., "Generate Ideas")
    ↓
Next.js Frontend (Vercel)
    ↓
API Route (/api/generate) - Node.js
    ↓
HTTP Request → Railway Flask API
    ↓
Python Script Execution (generate.py)
    ↓
HTTP Response ← Railway Flask API
    ↓
API Route processes response
    ↓
Frontend displays results
```

**Local Development:**
```
User Action
    ↓
Next.js Frontend (localhost:3000)
    ↓
API Route (/api/generate) - Node.js
    ↓
spawn("python3", "generate.py") - Direct subprocess
    ↓
Python Script Execution
    ↓
stdout/stderr captured
    ↓
API Route processes output
    ↓
Frontend displays results
```

### Environment Detection

The `src/lib/pythonEngine.ts` utility automatically detects the environment:

```typescript
const PYTHON_ENGINE_URL = process.env.PYTHON_ENGINE_URL;
const USE_LOCAL_PYTHON = !PYTHON_ENGINE_URL;

if (USE_LOCAL_PYTHON) {
  // Local: Use spawn()
  return callPythonEngineLocal(endpoint, body, signal);
} else {
  // Production: Use HTTP
  return callPythonEngineHTTP(endpoint, body, signal);
}
```

**Benefits:**
- Zero configuration for local development
- Seamless production deployment (just set env var)
- No code changes needed when switching environments

### Railway Deployment

**Components:**
- `engine/api.py` - Flask API wrapper (exposes `/generate`, `/seek`, `/sync`, `/health`)
- `engine/Procfile` - Railway startup command (`web: python api.py`)
- `engine/requirements.txt` - Python dependencies (includes Flask)
- `engine/runtime.txt` - Python version (3.11)

**Environment Variables (Railway):**
- `ANTHROPIC_API_KEY` - LLM API key
- `OPENAI_API_KEY` - Optional, for embeddings
- `SUPABASE_URL` - Vector database URL
- `SUPABASE_ANON_KEY` - Vector database key
- `PORT` - Auto-set by Railway

**Deployment URL:** `https://inspiration-production-6eaf.up.railway.app`

### Vercel Deployment

**Components:**
- Next.js app (all of `src/`)
- API routes (`src/app/api/*`) - Proxy to Railway when `PYTHON_ENGINE_URL` is set
- Static assets, edge functions

**Environment Variables (Vercel):**
- `PYTHON_ENGINE_URL` - Railway deployment URL (production only)
- Other env vars handled by Railway (not needed in Vercel)

### Why Not Vercel Python?

While Vercel supports Python serverless functions, converting would require:
1. Refactoring all Node.js API routes to Python
2. Rewriting spawn logic to import modules directly
3. Significant code changes and testing

Railway approach:
- Minimal changes (just wrap existing scripts)
- Preserves existing Python codebase
- Faster deployment (15 minutes vs days)
- Better for long-running tasks

See `PIVOT_LOG.md` for detailed decision rationale.

---

## v2 Item-Centric Flow Analysis (2026-01-01)

### Key Changes from v1

| Aspect | v1 (Candidate-Based) | v2 (Item-Centric) |
|--------|---------------------|-------------------|
| **Generation** | Multiple parallel LLM calls (1 per candidate) | Single LLM call generates all items |
| **Unit of Work** | "Candidate" = set of items | "Item" = single idea/insight/use case |
| **Parameter** | `bestOf` (candidates to generate) | `itemCount` (items to generate) |
| **Deduplication** | Only at bank harmonization | BEFORE returning to user |
| **Ranking** | Pick best candidate (set) | Rank individual items |
| **Latency** | ~20-25s × bestOf (parallel) | ~30-60s single call |
| **Cost** | $0.023 × bestOf + $0.025 judge | ~$0.02 generation + $0.003 ranking |

### v2 Flow Overview

```
User clicks Generate (itemCount=10, temp=0.3, dedupThreshold=0.85)
↓
Single LLM call generates 15 items (overshoot 50%)
↓
Batch embedding generation (parallelized via batch_get_embeddings)
↓
Deduplicate: 15 → 11 items (remove items with similarity > 0.85)
↓
Rank individual items by quality (single judge call)
↓
Return top 10 items (sorted by rank)
↓
Harmonize deduplicated items to bank
```

### Configurable Parameters

| Parameter | Default | Location | Description |
|-----------|---------|----------|-------------|
| `itemCount` | 10 | themes.json `defaultItemCount` | Number of items to generate |
| `deduplicationThreshold` | 0.85 | themes.json `settings.deduplicationThreshold` | Cosine similarity threshold for dedup |
| `temperature` | 0.2-0.5 | themes.json `settings.temperature` | LLM creativity (higher = more varied) |

### Cost Comparison (v2 vs v1)

| Scenario | v1 Cost | v2 Cost | Savings |
|----------|---------|---------|---------|
| Generate (bestOf=5 / itemCount=10) | ~$0.16-0.18 | ~$0.03-0.04 | **~80%** |
| Seek (bestOf=1 / itemCount=5) | ~$0.04-0.05 | ~$0.03-0.04 | **~20%** |

### Remaining Bottlenecks

1. **O(n) Deduplication Scan** - `_find_similar_item()` iterates through ALL items (Priority: MEDIUM)
2. **File I/O Blocking** - `save()` blocks until file write completes (Priority: MEDIUM)
3. **Progress Simulation** - Client-side estimation, not streamed from backend (Priority: LOW)

### User Strategy for Variety

Users wanting diverse outputs should run multiple queries with different temperature/similarity settings. The bank naturally deduplicates across runs.

<!-- Merged from FLOW_ANALYSIS.md on 2026-01-01 - see PIVOT_LOG.md for full decision rationale -->

---

## Harmonization & Pre-Generation Optimization Architecture (2026-01-10)

### The Problem

As the Library grew (275+ items), several bottlenecks emerged:

| Bottleneck | Before | Impact |
|------------|--------|--------|
| **Harmonization** | Regenerate embeddings for EVERY existing item on EVERY comparison | O(n*m) API calls, 60-120s for 10 items |
| **Sequential deduplication** | N items = N sequential RPC calls | Linear slowdown with item count |
| **Redundant generation** | Generate items for topics already in Library | Wasted LLM costs (dedup during harmonization) |

### Optimization Stack

```
┌─────────────────────────────────────────────────────────────────────┐
│                    GENERATION + HARMONIZATION PIPELINE              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐                                            │
│  │ 1. Pre-Generation   │  IMP-17: Topic Filter                     │
│  │    Topic Check      │  ─────────────────────                    │
│  │                     │  • Extract conversation summaries          │
│  │                     │  • Batch embed (single API call)           │
│  │                     │  • Parallel pgvector search (5 workers)    │
│  │                     │  • Skip covered topics → expand date range │
│  │                     │  • Increment occurrence for skipped topics │
│  └─────────┬───────────┘                                            │
│            │ Only uncovered topics                                  │
│            ▼                                                        │
│  ┌─────────────────────┐                                            │
│  │ 2. LLM Generation   │  Only for NEW topics                      │
│  │                     │  ─────────────────────                    │
│  │                     │  • Generate N items                        │
│  │                     │  • Cost reduced 50-80% for repeat topics  │
│  └─────────┬───────────┘                                            │
│            │                                                        │
│            ▼                                                        │
│  ┌─────────────────────┐                                            │
│  │ 3. Batch Embedding  │  IMP-16: Parallel Processing              │
│  │                     │  ────────────────────────                 │
│  │                     │  • Single batch API call for all items     │
│  │                     │  • Embeddings stored in DB (not regenerated) │
│  └─────────┬───────────┘                                            │
│            │                                                        │
│            ▼                                                        │
│  ┌─────────────────────┐                                            │
│  │ 4. Server-Side      │  IMP-15: pgvector RPC                     │
│  │    Similarity       │  ─────────────────────                    │
│  │                     │  • search_similar_library_items() RPC      │
│  │                     │  • Parallel execution (5 workers)          │
│  │                     │  • No client-side embedding regeneration   │
│  └─────────┬───────────┘                                            │
│            │                                                        │
│            ▼                                                        │
│  ┌─────────────────────┐                                            │
│  │ 5. Batch DB Ops     │  IMP-16: Batch + Parallel                 │
│  │                     │  ────────────────────────                 │
│  │                     │  • Batch insert for new items              │
│  │                     │  • Parallel updates for existing items     │
│  │                     │  • Date range expansion on dedup           │
│  └─────────────────────┘                                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Performance Impact

| Metric | Before Optimization | After Optimization | Improvement |
|--------|---------------------|-------------------|-------------|
| Embedding API calls per item | 275+ (all existing items) | 1 (new item only) | **275x** |
| RPC calls for 10 items | N/A | 10 parallel (5 workers) | **2x faster** |
| DB inserts for 10 items | 10 sequential | 1 batch | **10x faster** |
| LLM calls for covered topics | 100% | 0% (skipped) | **50-80% cost** |
| Harmonization time (10 items) | 60-120s | ~2-5s | **20-60x** |

### Key SQL Functions

**`search_similar_library_items()`** - Server-side similarity search:
```sql
CREATE FUNCTION search_similar_library_items(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  similarity_threshold float DEFAULT 0.85
) RETURNS TABLE (id text, title text, similarity float)
```

**`get_memory_density_by_week()`** - Memory terrain analysis:
```sql
RETURNS TABLE (week_start date, week_end date, conversation_count int, message_count int)
```

**`get_library_coverage_by_week_and_type()`** - Coverage by item type:
```sql
RETURNS TABLE (week_start date, week_end date, item_type text, item_count int)
```

### Files Involved

| File | Purpose |
|------|---------|
| `engine/common/topic_filter.py` | Pre-generation topic check |
| `engine/common/items_bank_supabase.py` | Batch operations, pgvector RPC |
| `engine/scripts/optimize_harmonization.sql` | Vector column + RPC function |
| `engine/scripts/backfill_library_embeddings.py` | Populate embeddings for existing items |

---

## Progress Tracking & Transparency Architecture (2026-01-11)

### Overview

Real-time progress streaming provides users visibility into generation/seek operations, building trust through transparency.

### Progress Marker System

**Python Backend** (`engine/common/progress_markers.py`) emits structured markers:

```
[PHASE:searching]              # Phase transition
[STAT:conversationsFound=8]    # Statistics update
[PROGRESS:current=5,total=22,label=generating]  # Intra-phase progress
[COST:tokensIn=1200,tokensOut=800,cost=0.0042,cumulative=0.0156]
[WARNING:slow_phase=search took 45s (threshold: 30s)]
[PERF:totalSeconds=120,totalCost=0.0234]  # End-of-run summary
[ERROR:API rate limit exceeded]
```

### Streaming Flow

```
User clicks Generate/Seek
    ↓
Frontend → POST /api/generate-stream (or /api/seek-stream)
    ↓
API spawns Python process (generate.py or seek.py)
    ↓
Python emits progress markers to stdout
    ↓
API parses markers → sends Server-Sent Events (SSE)
    ↓
Frontend updates ProgressPanel in real-time
    ↓
Performance log saved to data/performance_logs/run_*.json
```

### Phase Progression

| Phase | Description | Markers Emitted |
|-------|-------------|-----------------|
| `confirming` | Request parameters confirmed | STAT (dateRange, itemCount, temperature) |
| `searching` | Semantic search in progress | STAT (conversationsFound, daysWithActivity) |
| `generating` | LLM generation in progress | PROGRESS (current/total), COST (tokens) |
| `deduplicating` | Removing duplicate items | STAT (itemsAfterSelfDedup) |
| `ranking` | Ranking items by quality | PROGRESS (current/total) |
| `integrating` | Harmonizing to Library | PROGRESS, STAT (itemsAdded, itemsMerged) |
| `complete` | Run finished successfully | PERF (totalSeconds, totalCost) |
| `error` | Run failed | ERROR (message) |

### Performance Logging

All progress events are logged to JSON files for post-run analysis:

```
data/performance_logs/
├── run_1736617200_generate_insights.json
├── run_1736617500_seek_use_case.json
└── ...
```

**Log Contents:**
- `run_id`, `run_type`, `started_at`, `completed_at`
- `phases[]` — timing and stats per phase
- `events[]` — full event timeline
- `totals` — total_seconds, total_tokens_in, total_tokens_out, total_cost

### Performance Analytics API

**`GET /api/performance?action=list`** — Recent run summaries
**`GET /api/performance?action=detail&runId=...`** — Full event log
**`GET /api/performance?action=analyze`** — Bottleneck analysis across runs

### Error Explanation System

`src/lib/errorExplainer.ts` classifies errors into user-friendly explanations:

| Error Pattern | User-Friendly Title | Recommendation |
|--------------|---------------------|----------------|
| `rate limit` | AI rate limit reached | Wait 1-2 minutes, retry |
| `timeout` | Request took too long | Try a smaller date range |
| `insufficient_quota` | API quota exceeded | Check billing/add credits |
| `context_length` | Too much data for AI | Reduce date range |

### Files Involved

| File | Purpose |
|------|---------|
| `engine/common/progress_markers.py` | Emit markers, log performance |
| `src/app/api/generate-stream/route.ts` | Parse markers, stream SSE |
| `src/app/api/seek-stream/route.ts` | Parse markers, stream SSE |
| `src/app/api/performance/route.ts` | Analytics API |
| `src/components/ProgressPanel.tsx` | Real-time progress display |
| `src/lib/errorExplainer.ts` | Error classification |

---

## Known Risks, Complexity & Future Improvements (2026-01-02)

### v3 Phase 2 Risks & Complexity

**1. Client-Side Filtering (LibrarySearch)**
- **Risk:** All items are loaded and filtered in the browser. For large libraries (1000+ items), this could cause UI lag.
- **Mitigation:** Consider server-side pagination with URL params for filter state.
- **Threshold:** Watch for 500+ item performance.
- **Priority:** MEDIUM

**2. Category Lookup Memory Overhead (ItemCard)**
- **Risk:** We create a `Map<itemId, Category>` on every render.
- **Mitigation:** Cache category map at BanksOverview level, memoize with `useMemo`.
- **Current Status:** Memoized with `useMemo`, acceptable for current scale.
- **Priority:** LOW

**3. No Filter Persistence**
- **Risk:** Filter settings (search query, type, status) reset on page refresh.
- **Mitigation:** Use URL query params or localStorage to persist filter state.
- **Priority:** LOW

**4. MyPrivateTools Folder Recreation**
- **Risk:** The `MyPrivateTools/Inspiration/.next/` folder keeps being created.
- **Root Cause:** Unknown external trigger (possibly IDE file watcher or browser MCP cache path resolution).
- **Mitigations Applied:**
  - `next.config.ts` validates `process.cwd()` at startup, exits if run from wrong directory.
  - `package.json` `predev` script checks directory before starting dev server.
- **Status:** Monitoring - added double safeguard in v3 Phase 2.
- **Priority:** MEDIUM (recurring issue)

### Suggested Improvements (Backlog)

| ID | Improvement | Category | Priority | Effort |
|----|-------------|----------|----------|--------|
| IMP-1 | Server-side pagination for Library (1000+ items) | Performance | MEDIUM | HIGH |
| IMP-2 | Persist filter state to URL params | UX | LOW | LOW |
| IMP-3 | Bulk actions (archive, status change multiple items) | Feature | LOW | MEDIUM |
| IMP-4 | Item detail modal with full chat context | Feature | MEDIUM | HIGH |
| IMP-5 | Export only filtered/selected items | Feature | LOW | LOW |
| IMP-6 | Automatic retry logic for failed operations | Reliability | LOW | MEDIUM |
| IMP-7 | Save drafts locally (IndexedDB) for offline resilience | Reliability | LOW | HIGH |
| IMP-8 | Bundle size analysis with `@next/bundle-analyzer` | Performance | LOW | LOW |

### Technical Debt

| ID | Issue | Impact | Priority |
|----|-------|--------|----------|
| TD-1 | `items/route.ts` has TypeScript errors (pre-existing) | Build warnings | MEDIUM |
| TD-2 | Unused `ReactMarkdown` import in BanksOverview (removed) | Bundle size | DONE |
| TD-3 | `page.tsx` is 511+ lines (should split into sections) | Maintainability | MEDIUM |

---

## Resilience Strategy: Cursor DB Schema Changes (2026-01-08)

<!-- Merged from RESILIENCE_STRATEGY.md on 2026-01-09 -->

### The Problem

Cursor periodically changes its internal chat history database architecture, which can break Inspiration's extraction logic:

- **Before:** Messages stored directly in `composerData` entries
- **After:** Messages stored as `bubbleId` references, requiring two-step lookup
- **Impact:** Extraction failed completely until code updated

### Schema Health Check (`engine/common/db_health_check.py`)

**Purpose:** Detect schema changes before attempting extraction

**Features:**
- **Version Detection:** Identifies schema version (v1-direct, v2-bubbles, unknown)
- **Strategy Validation:** Tests which extraction strategies are viable
- **Issue Reporting:** Lists specific incompatibilities found
- **Diagnostic Data:** Collects full schema information for bug reports

**Usage:**
```bash
python3 engine/common/db_health_check.py
# Output: Diagnostic report saved to db_diagnostic_report_YYYYMMDD_HHMMSS.md
```

### Detection & Response Matrix

| Scenario | Detection | Response | User Experience |
|----------|-----------|----------|----------------|
| **No DB** | File not found | Cloud mode | "☁️ Cloud Mode (Read-only)" |
| **Schema v1** | composerData has messages | Direct extraction | Normal sync |
| **Schema v2** | bubbleId references exist | Bubble-based extraction | Normal sync |
| **Schema v3** | Unknown pattern | Health check fails | "⚠️ DB Schema Changed" + diagnostic |
| **Partial Compat** | Some strategies work | Use working strategy | Degraded functionality + warning |
| **Zero Compat** | No strategies work | Abort + report | Alert + remediation steps |

### Schema Version Catalog

| Version | Detection | Extraction Method | Cursor Version | Status |
|---------|-----------|-------------------|----------------|--------|
| v1-direct | `messages` field in composerData | Direct message array access | Pre-0.40 | Deprecated |
| v2-bubbles | `bubbleId` references + `fullConversationHeadersOnly` | Two-step bubble lookup | 0.40+ | Current |

### Related Files

- **Implementation:** `engine/common/db_health_check.py`
- **Integration:** `engine/scripts/sync_messages.py`
- **API Errors:** `src/app/api/sync/route.ts`

**Last Updated:** 2026-01-09
