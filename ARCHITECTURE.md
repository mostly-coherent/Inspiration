# Inspiration — Architecture & Workflows

> **Purpose:** Technical architecture document showing end-to-end workflows and system loops

---

## System Overview

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
│   │   ├── ReverseMatchSection.tsx # Reverse match search UI
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
│   │   └── logger.ts           # Conditional logging
│   └── hooks/                  # Custom React hooks
│       └── useDebounce.ts      # Debounce hook
├── engine/                     # Python generation engine
│   ├── generate.py             # Unified content generation CLI (insights/ideas modes)
│   ├── reverse_match.py        # Reverse matching CLI
│   ├── common/                 # Shared Python utilities
│   │   ├── cursor_db.py        # Cursor DB extraction (SQLite + Bubble logic)
│   │   ├── vector_db.py        # Supabase pgvector integration
│   │   ├── llm.py              # Anthropic + OpenAI wrapper
│   │   ├── config.py           # User config loader
│   │   ├── bank.py             # Bank harmonization logic
│   │   └── semantic_search.py  # Embedding generation & vector similarity
│   ├── scripts/                # Utility scripts
│   │   ├── index_all_messages.py # One-time Vector DB indexer
│   │   ├── sync_messages.py    # Incremental Vector DB sync
│   │   └── init_vector_db.sql  # Supabase schema setup
│   └── prompts/                # LLM prompt templates
│       ├── base_synthesize.md  # Shared prompt base (common rules)
│       ├── insights_synthesize.md # Insights-specific prompt
│       ├── ideas_synthesize.md    # Ideas-specific prompt
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
│  │  ├── ReverseMatchSection.tsx    (Search domain)          │  │
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
- **ReverseMatchSection**: Reverse match search UI. Owns search state, calls `/api/reverse-match`.
- **ResultsPanel**: Displays generation results. Pure presentation, receives `GenerateResult` prop.

**UI Components** (Reusable):
- **ModeCard**: Mode selection card. Pure presentation, receives `mode` and `onClick` props.
- **ProgressPanel**: Progress display. Pure presentation, receives progress props.
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
| `ReverseMatchSection` | Reverse match search UI | Search state | Yes (`/api/reverse-match`) | None |
| `ResultsPanel` | Results display | View mode (formatted/raw) | No | `MarkdownContent` |
| `ModeCard` | Mode selection card | None (controlled) | No | None |
| `ProgressPanel` | Progress display | None (controlled) | No | `LoadingSpinner`, `StopIcon` |
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
    │   └─→ reverseMatch state
    │
    ├─→ API calls (fetch)
    │   │
    │   ├─→ /api/generate (POST)
    │   │   └─→ Python: generate.py --mode {tool}
    │   │       └─→ Vector DB (Supabase)
    │   │
    │   ├─→ /api/sync (POST)
    │   │   └─→ Python: sync_messages.py
    │   │       └─→ Cursor DB (SQLite) → Vector DB (Supabase)
    │   │
    │   └─→ /api/reverse-match (POST)
    │       └─→ Python: reverse_match.py
    │           └─→ Vector DB (Supabase)
    │
    └─→ Props to Components
        │
        ├─→ Feature Components (domain state)
        │   ├─→ BanksOverview (fetches own data)
        │   └─→ ReverseMatchSection (receives state from parent)
        │
        └─→ UI Components (presentation)
            └─→ ResultsPanel, ModeCard, ProgressPanel, etc.
```

### Bounded Contexts

**1. Generation Context** (`page.tsx`, `ResultsPanel`, `ProgressPanel`, `ModeCard`, `AdvancedSettings`, `ExpectedOutput`)
- **Purpose**: Generate insights/ideas from chat history
- **Boundaries**: Tool selection → Mode selection → Generate → Results display
- **State**: `selectedTool`, `selectedMode`, `isGenerating`, `result`, `progress`
- **API**: `/api/generate`

**2. Reverse Match Context** (`page.tsx`, `ReverseMatchSection`)
- **Purpose**: Search chat history for evidence of user-provided insights/ideas
- **Boundaries**: Query input → Search → Results display
- **State**: `reverseQuery`, `reverseDaysBack`, `reverseTopK`, `reverseMinSimilarity`, `reverseResult`
- **API**: `/api/reverse-match`

**3. Bank Context** (`BanksOverview`)
- **Purpose**: Display and manage idea/insight banks
- **Boundaries**: Load stats → Display → Expand → Export
- **State**: `ideaStats`, `insightStats`, `expandedBank`, `bankMarkdown`
- **API**: `/api/banks`

**4. Settings Context** (`settings/page.tsx`)
- **Purpose**: Configure workspaces, voice, LLM, features
- **Boundaries**: Multi-step wizard → Save config
- **State**: `config`, `currentStep`, form state
- **API**: `/api/config`

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

**API Client Organization:**
```
src/app/api/
├── generate/route.ts          # Content generation endpoint
├── generate-stream/route.ts  # Streaming generation endpoint
├── reverse-match/route.ts    # Reverse match search endpoint
├── sync/route.ts             # Vector DB sync endpoint
├── banks/route.ts            # Bank reading endpoint
├── config/route.ts          # Config CRUD endpoint
├── login/route.ts           # Authentication endpoint
└── logout/route.ts          # Logout endpoint
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

**Component Size Analysis:**

| Component | Lines | Status | Recommendation |
|-----------|-------|--------|----------------|
| `page.tsx` | 511 | ⚠️ Large | Consider splitting into `GenerationSection`, `ReverseMatchSection` |
| `ReverseMatchSection.tsx` | 469 | ⚠️ Large | Consider splitting into `MatchList`, `MatchItem` |
| `AdvancedSettings.tsx` | 235 | ✅ Good | Acceptable size |
| `BanksOverview.tsx` | 220 | ✅ Good | Acceptable size |
| `ResultsPanel.tsx` | 170 | ✅ Good | Acceptable size |
| Others | <105 | ✅ Excellent | Well-sized |

**Performance Recommendations:**
1. **Split `page.tsx`**: Extract `GenerationSection` and `ReverseMatchSection` components
2. **Split `ReverseMatchSection.tsx`**: Extract `MatchList` and `MatchItem` components
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

### 3. Search (Reverse Match)
*   **Module:** `engine/common/semantic_search.py`
*   **Logic:**
    *   **IF** Supabase credentials exist & Vector DB is populated: Use `vector_db.py` to run similarity search in Postgres (fast).
    *   **ELSE**: Fall back to loading JSON cache and calculating cosine similarity in memory (slow for >1GB data).

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

### Workflow 6: Reverse Match (Vector DB Powered)

```
┌──────────────────────────────────────────────────────────────────────┐
│                      REVERSE MATCH WORKFLOW                           │
└──────────────────────────────────────────────────────────────────────┘

User        UI          API            Python Engine      Supabase (PgVector)
  │          │            │                  │                 │
  │─ Enter ─▶│           │                  │                 │
  │  query   │           │                  │                 │
  │           │           │                  │                 │
  │─ Click ──▶│           │                  │                 │
  │ Search    │           │                  │                 │
  │           │── POST ──▶│                  │                 │
  │           │/reverse-  │                  │                 │
  │           │  match    │                  │                 │
  │           │           │                  │                 │
  │           │           │──── Spawn ──────▶│                 │
  │           │           │   python reverse_ │                 │
  │           │           │   match.py       │                 │
  │           │           │                  │                 │
  │           │           │                  │─ Embed query ──▶ OpenAI API
  │           │           │                  │◀─ Vector ───────┘
  │           │           │                  │                 │
  │           │           │                  │── RPC Search ──▶│
  │           │           │                  │   (similarity)  │
  │           │           │                  │◀── Matches ─────│
  │           │           │                  │                 │
  │           │           │◀──── stdout ─────│                 │
  │           │           │   JSON matches   │                 │
  │           │◀─ JSON ───│                  │                 │
  │◀─ Render ─│  response │                  │                 │
  │   matches │           │                  │                 │
  │           │           │                  │                 │
```

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

| Operation | Before (SQLite/JSON) | After (Vector DB) | Improvement |
|-----------|----------------------|-------------------|-------------|
| **Reverse Match (90 days)** | 3-5 seconds | **0.5-1 second** | **5-10x Faster** |
| **Scaling Limit** | ~3GB database | Terabytes | **Unlimited** |
| **Data Integrity** | Locked file risks | Independent clone | **High** |
| **Search Cost** | Per-query embedding | One-time indexing | **~99% Cheaper** |

---

**Last Updated:** 2025-12-28
