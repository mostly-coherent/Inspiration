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
│  │  Settings   │     │   Config     │     │  Cursor DB   │                  │
│  │   Wizard    │────▶│   (JSON)     │◀────│  (SQLite)    │                  │
│  └─────────────┘     └──────────────┘     └──────────────┘                  │
│                            │                    │                           │
│                            ▼                    ▼                           │
│                      ┌──────────────┐     ┌──────────────┐                  │
│                      │  Idea Bank   │     │  Claude API  │                  │
│                      │ Insight Bank │     │  (Anthropic) │                  │
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
│   │   ├── page.tsx            # Main page (orchestrates components, ~430 lines)
│   │   ├── layout.tsx          # Root layout (ErrorBoundary, skip links)
│   │   ├── settings/page.tsx   # Settings wizard
│   │   ├── api/                # API routes (server-side)
│   │   │   ├── generate/route.ts       # POST: spawn Python engine
│   │   │   ├── config/route.ts        # GET/POST: config CRUD
│   │   │   ├── banks/route.ts         # GET: read bank data
│   │   │   ├── reverse-match/route.ts  # POST: semantic search chat history
│   │   │   ├── login/route.ts         # POST: authentication
│   │   │   └── logout/route.ts        # POST: logout
│   │   └── globals.css         # Global styles (Tailwind + custom)
│   ├── components/             # React components (UI layer)
│   │   ├── BanksOverview.tsx          # Bank statistics & display
│   │   ├── ResultsPanel.tsx           # Results display (formatted/raw)
│   │   ├── ReverseMatchSection.tsx     # Reverse match search UI
│   │   ├── ProgressPanel.tsx           # Generation progress display
│   │   ├── ModeCard.tsx               # Mode selection card
│   │   ├── AdvancedSettings.tsx       # Advanced settings panel
│   │   ├── ExpectedOutput.tsx         # Expected output summary
│   │   ├── MarkdownContent.tsx        # Markdown renderer
│   │   ├── LoadingSpinner.tsx          # Loading spinner icon
│   │   ├── StopIcon.tsx               # Stop icon SVG
│   │   ├── LogoutButton.tsx           # Logout button
│   │   └── ErrorBoundary.tsx          # Error boundary wrapper
│   ├── lib/                    # Shared utilities & types
│   │   ├── types.ts            # TypeScript types & presets
│   │   ├── utils.ts            # Utility functions (clipboard, file download)
│   │   └── logger.ts           # Conditional logging utility
│   └── hooks/                  # Custom React hooks
│       └── useDebounce.ts      # Debounce hook for search input
├── engine/                     # Python generation engine
│   ├── ideas.py                # Idea generation CLI
│   ├── insights.py             # Insight generation CLI
│   ├── reverse_match.py        # Reverse matching CLI (semantic search)
│   ├── common/                 # Shared Python utilities
│   │   ├── cursor_db.py        # Cross-platform DB extraction
│   │   ├── llm.py              # Anthropic + OpenAI wrapper
│   │   ├── config.py           # User config loader
│   │   ├── bank.py             # Bank harmonization logic
│   │   └── semantic_search.py # Embedding generation & vector similarity
│   └── prompts/                # LLM prompt templates
│       ├── ideas_synthesize.md
│       ├── insights_synthesize.md
│       └── judge.md
└── data/                       # User data (gitignored)
    ├── config.json             # User configuration
    ├── idea_bank.json          # Structured idea storage
    ├── insight_bank.json       # Structured insight storage
    ├── IDEA_BANK.md            # Human-readable view
    ├── INSIGHT_BANK.md         # Human-readable view
    └── embedding_cache.json    # Cached embeddings for reverse match
```

---

## E2E Workflows

### Workflow 1: First-Time Setup

```
┌──────────────────────────────────────────────────────────────────────┐
│                         FIRST-TIME SETUP                              │
└──────────────────────────────────────────────────────────────────────┘

User                    UI                     API                Config
  │                      │                      │                    │
  │──── Opens app ──────▶│                      │                    │
  │                      │──── GET /config ────▶│                    │
  │                      │                      │──── Read file ────▶│
  │                      │◀─── 404 or empty ────│                    │
  │                      │                      │                    │
  │◀── Redirect /settings│                      │                    │
  │                      │                      │                    │
  │── Configure wizard ─▶│                      │                    │
  │   • Workspaces       │                      │                    │
  │   • Voice Profile    │                      │                    │
  │   • LLM Provider     │                      │                    │
  │   • Features         │                      │                    │
  │                      │                      │                    │
  │──── Save settings ──▶│                      │                    │
  │                      │──── POST /config ───▶│                    │
  │                      │                      │──── Write file ───▶│
  │                      │◀─── Success ─────────│                    │
  │◀── Redirect home ────│                      │                    │
  │                      │                      │                    │
```

---

### Workflow 2: Generate Ideas/Insights

```
┌──────────────────────────────────────────────────────────────────────┐
│                       GENERATION WORKFLOW                             │
└──────────────────────────────────────────────────────────────────────┘

User        UI          API            Python Engine         Cursor DB    LLM
  │          │            │                  │                   │         │
  │─ Select ─▶│           │                  │                   │         │
  │  tool &   │           │                  │                   │         │
  │  preset   │           │                  │                   │         │
  │           │           │                  │                   │         │
  │─ Click ──▶│           │                  │                   │         │
  │ Generate  │           │                  │                   │         │
  │           │── POST ──▶│                  │                   │         │
  │           │ /generate │                  │                   │         │
  │           │           │                  │                   │         │
  │           │           │──── Spawn ──────▶│                   │         │
  │           │           │   python engine  │                   │         │
  │           │           │                  │                   │         │
  │           │           │                  │── Query chats ───▶│         │
  │           │           │                  │◀── Chat JSON ─────│         │
  │           │           │                  │                   │         │
  │◀ Progress │           │                  │                   │         │
  │   bar     │           │                  │                   │         │
  │           │           │                  │                   │         │
  │           │           │                  │─ Generate N ─────────────────▶
  │           │           │                  │  candidates                  │
  │           │           │                  │◀─ N outputs ─────────────────│
  │           │           │                  │                   │         │
  │           │           │                  │─ Judge best ─────────────────▶
  │           │           │                  │◀─ Winner ────────────────────│
  │           │           │                  │                   │         │
  │           │           │◀──── stdout ─────│                   │         │
  │           │           │   JSON result    │                   │         │
  │           │◀─ JSON ───│                  │                   │         │
  │◀─ Render ─│  response │                  │                   │         │
  │   result  │           │                  │                   │         │
  │           │           │                  │                   │         │
```

---

### Workflow 3: Bank Harmonization Loop

```
┌──────────────────────────────────────────────────────────────────────┐
│                    BANK HARMONIZATION LOOP                            │
└──────────────────────────────────────────────────────────────────────┘

After Generation        Engine              Bank Files           LLM
       │                   │                     │                │
       │── trigger ───────▶│                     │                │
       │                   │                     │                │
       │                   │── Load existing ───▶│                │
       │                   │   bank.json         │                │
       │                   │◀── Bank data ───────│                │
       │                   │                     │                │
       │                   │── Combine new ──────────────────────▶│
       │                   │   output + bank                      │
       │                   │                                      │
       │                   │◀── Delta ops ───────────────────────│
       │                   │   (new/update)                       │
       │                   │                     │                │
       │                   │── Apply deltas ────▶│                │
       │                   │   to bank.json      │                │
       │                   │                     │                │
       │                   │── Generate ────────▶│                │
       │                   │   BANK.md view      │                │
       │                   │                     │                │
       │                   │── Delete output ───▶│                │
       │                   │   files             │                │
       │◀── complete ──────│                     │                │
       │                   │                     │                │
```

---

### Workflow 4: LinkedIn Sync (Power Feature)

```
┌──────────────────────────────────────────────────────────────────────┐
│                      LINKEDIN SYNC LOOP                               │
└──────────────────────────────────────────────────────────────────────┘

After Harmonization     Engine           LinkedIn Posts       LLM
       │                   │                   │                │
       │── trigger ───────▶│                   │                │
       │                   │                   │                │
       │                   │── Scan folder ───▶│                │
       │                   │◀── .md files ─────│                │
       │                   │                   │                │
       │                   │── Compare to bank ─────────────────▶│
       │                   │   (semantic match)                  │
       │                   │◀── Match results ─────────────────│
       │                   │                   │                │
       │                   │── Update ─────────▶│                │
       │                   │   shared_score     │                │
       │                   │   in bank.json     │                │
       │                   │                   │                │
       │◀── complete ──────│                   │                │
       │                   │                   │                │
```

---

### Workflow 5: Solved Status Sync (Power Feature)

```
┌──────────────────────────────────────────────────────────────────────┐
│                    SOLVED STATUS SYNC LOOP                            │
└──────────────────────────────────────────────────────────────────────┘

After Harmonization     Engine           Workspace Projects    LLM
       │                   │                   │                │
       │── trigger ───────▶│                   │                │
       │                   │                   │                │
       │                   │── Scan projects ─▶│                │
       │                   │   (from config)   │                │
       │                   │◀── Project files ─│                │
       │                   │                   │                │
       │                   │── Compare ideas ─────────────────▶│
       │                   │   to project content               │
       │                   │◀── Match results ─────────────────│
       │                   │                   │                │
       │                   │── Update ─────────▶│                │
       │                   │   solved_score     │                │
       │                   │   in bank.json     │                │
       │                   │                   │                │
       │◀── complete ──────│                   │                │
       │                   │                   │                │
```

### Workflow 6: Reverse Match (User Query → Chat History)

```
┌──────────────────────────────────────────────────────────────────────┐
│                      REVERSE MATCH WORKFLOW                           │
└──────────────────────────────────────────────────────────────────────┘

User        UI          API            Python Engine      Cursor DB    OpenAI
  │          │            │                  │                 │         │
  │─ Enter ─▶│           │                  │                 │         │
  │  query   │           │                  │                 │         │
  │           │           │                  │                 │         │
  │─ Click ──▶│           │                  │                 │         │
  │ Search    │           │                  │                 │         │
  │           │── POST ──▶│                  │                 │         │
  │           │/reverse-  │                  │                 │         │
  │           │  match    │                  │                 │         │
  │           │           │                  │                 │         │
  │           │           │──── Spawn ──────▶│                 │         │
  │           │           │   python reverse_ │                 │         │
  │           │           │   match.py       │                 │         │
  │           │           │                  │                 │         │
  │           │           │                  │── Query chats ─▶│         │
  │           │           │                  │◀── Chat JSON ───│         │
  │           │           │                  │                 │         │
  │◀ Progress │           │                  │                 │         │
  │   (can    │           │                  │                 │         │
  │   STOP)   │           │                  │                 │         │
  │           │           │                  │                 │         │
  │           │           │                  │─ Embed query ──────────────▶
  │           │           │                  │◀─ Query vector ───────────│
  │           │           │                  │                 │         │
  │           │           │                  │─ Embed messages ───────────▶
  │           │           │                  │◀─ Message vectors ─────────│
  │           │           │                  │                 │         │
  │           │           │                  │─ Cosine similarity ────────│
  │           │           │                  │   (rank matches)           │
  │           │           │                  │                 │         │
  │           │           │                  │─ Add context ──────────────│
  │           │           │                  │   (before/after msgs)      │
  │           │           │                  │                 │         │
  │           │           │◀──── stdout ─────│                 │         │
  │           │           │   JSON matches   │                 │         │
  │           │◀─ JSON ───│                  │                 │         │
  │◀─ Render ─│  response │                  │                 │         │
  │   matches │           │                  │                 │         │
  │           │           │                  │                 │         │
```

---

## Data Flow Summary

### 1. Configuration Flow
```
Settings UI  →  POST /api/config  →  data/config.json
                                           ↓
Python Engine reads config on each invocation
```

### 2. Generation Flow
```
UI (React)  →  POST /api/generate  →  spawn(python ideas.py)
                                              ↓
                                    Cursor DB (SQLite)
                                              ↓
                                    Claude API (Anthropic)
                                              ↓
                                    stdout JSON
                                              ↓
                                    Parse & return to UI
```

### 2b. Reverse Match Flow
```
UI (React)  →  POST /api/reverse-match  →  spawn(python reverse_match.py)
                                                      ↓
                                            Cursor DB (SQLite)
                                                      ↓
                                            OpenAI Embeddings API
                                                      ↓
                                            Cosine Similarity (local)
                                                      ↓
                                            stdout JSON (matches + context)
                                                      ↓
                                            Parse & return to UI
```

### 3. Bank Persistence Flow
```
Generation Output  →  Harmonization  →  idea_bank.json
                                               ↓
                                        IDEA_BANK.md
                                               ↓
                                    GET /api/banks → UI
```

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **UI Framework** | Next.js 15 App Router | Modern React, API routes colocated |
| **Engine Language** | Python | Better SQLite libraries, Claude SDK |
| **Communication** | subprocess spawn | Simpler than HTTP server, portable |
| **Config Format** | JSON | Easy to edit manually, portable |
| **Bank Format** | JSON + Markdown | Machine-readable + human-readable |
| **LLM** | Claude Sonnet 4 | Best quality for synthesis tasks |
| **Fallback LLM** | GPT-4o | Widely available alternative |
| **Embeddings** | OpenAI text-embedding-3-small | Cost-effective, good quality |
| **Abort Signals** | AbortController + SIGTERM | Proper process cleanup on cancel |

---

## Cross-Platform Support

### Cursor DB Detection

```python
def get_cursor_db_path() -> Path:
    system = platform.system()
    
    if system == "Darwin":  # macOS
        return Path.home() / "Library/Application Support/Cursor/User/workspaceStorage"
    elif system == "Windows":
        return Path(os.environ["APPDATA"]) / "Cursor/User/workspaceStorage"
    elif system == "Linux":
        return Path.home() / ".config/Cursor/User/workspaceStorage"
```

### Database Query

**Chat History Extraction:**
- Searches both Composer chats and regular chat conversations
- Composer: `composer.composerData%`
- Regular Chat: `workbench.panel.aichat.view.aichat.chatdata%`

```sql
SELECT key, value 
FROM ItemTable 
WHERE key LIKE 'composer.composerData%'
   OR key LIKE 'workbench.panel.aichat.view.aichat.chatdata%'
```

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| **API Keys** | Stored in `.env` (gitignored), never in config.json |
| **Personal Data** | `data/` folder is gitignored |
| **Bank Content** | Local only, user controls what to share |
| **LLM Requests** | HTTPS, no data retention by Anthropic |

---

## Performance Characteristics

| Operation | Typical Duration | Bottleneck | With Optimizations |
|-----------|------------------|------------|-------------------|
| DB Query | < 1 second | SQLite read | < 0.1s (cached) |
| Generate 1 candidate | ~15-20 seconds | LLM API | ~15-20s (same) |
| Judge N candidates | ~10-15 seconds | LLM API | ~2-3s (GPT-3.5, opt-in) |
| Full generation (5 candidates) | ~90 seconds | LLM API | ~25s (parallel) |
| Bank harmonization | ~10-30 seconds | LLM API (delta mode) | ~1-3s (cache + batch) |
| LinkedIn sync (24 insights) | ~20-40 seconds | LLM API (batched) | ~5-10s (cache) |
| Reverse match (90 days, 10 results) | ~3-5 seconds | Embedding API + similarity calc | ~2-3s (debounced) |
| Embedding generation (cached) | < 0.1 seconds | Cache lookup | < 0.1s (same) |
| Embedding generation (new) | ~0.5-1 second | OpenAI API | ~0.5-1s (same) |

**Optimization Impact:**
- **Parallel generation:** 4x faster (100s → 25s for 5 candidates)
- **Harmonization cache:** 80-90% cost reduction (skips duplicates)
- **Batch harmonization:** 90% fewer API calls (10 items = 1 call)
- **Cheaper judge model:** ~80% cost reduction on judging (opt-in)
- **Prompt compression:** 50-70% cost reduction for long histories (opt-in)

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
│  │ File: ideas.py    │  │ File: cursor_db  │              │
│  │       insights.py │  │       .py        │              │
│  └──────────────────┘  └──────────────────┘              │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐              │
│  │ Harmonization    │  │ Embeddings       │              │
│  │ (JSON cache)     │  │ (JSON cache)     │              │
│  │                  │  │                  │              │
│  │ File: bank.py    │  │ File: semantic_  │              │
│  │                   │  │       search.py │              │
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

### Cost Optimization Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                   COST OPTIMIZATION FLOW                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Harmonization Request                                      │
│       │                                                     │
│       ├─→ Check Cache ──→ Already processed? ──→ Skip!    │
│       │                    │                               │
│       │                    └─→ New? ──→ Continue           │
│       │                                                     │
│       ├─→ Batch Size ──→ > 20 items? ──→ Split chunks     │
│       │                    │                               │
│       │                    └─→ ≤ 20 items ──→ Single batch │
│       │                                                     │
│       └─→ Process Batch ──→ 1 AI call for N items         │
│                              (vs N calls without batching)  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Frontend Component Architecture

### Separation of Concerns

The frontend follows a clear separation of concerns with bounded contexts:

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
│  │  ├── BanksOverview.tsx          (Bank domain)           │  │
│  │  ├── ResultsPanel.tsx           (Results domain)        │  │
│  │  └── ReverseMatchSection.tsx    (Search domain)         │  │
│  │                                                          │  │
│  │  UI Components (Reusable)                               │  │
│  │  ├── ProgressPanel.tsx          (Progress display)      │  │
│  │  ├── ModeCard.tsx               (Mode selection)        │  │
│  │  ├── AdvancedSettings.tsx       (Settings form)         │  │
│  │  ├── ExpectedOutput.tsx         (Info display)          │  │
│  │  ├── MarkdownContent.tsx        (Content renderer)      │  │
│  │  ├── LoadingSpinner.tsx         (Loading state)         │  │
│  │  ├── StopIcon.tsx               (Icon component)        │  │
│  │  └── LogoutButton.tsx           (Auth action)           │  │
│  │                                                          │  │
│  │  Infrastructure Components                               │  │
│  │  └── ErrorBoundary.tsx          (Error handling)        │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              ORCHESTRATION LAYER (Pages)                │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │                                                          │  │
│  │  page.tsx (Main Page)                                   │  │
│  │  ├── State management (tool, mode, results)            │  │
│  │  ├── API calls (generate, reverse-match)                │  │
│  │  ├── Progress tracking                                  │  │
│  │  └── Component composition                               │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              UTILITY LAYER (lib/)                        │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │                                                          │  │
│  │  utils.ts         (Clipboard, file download)            │  │
│  │  types.ts         (TypeScript types, presets)            │  │
│  │  logger.ts        (Conditional logging)                  │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              HOOKS LAYER (hooks/)                        │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │                                                          │  │
│  │  useDebounce.ts   (Debounce logic for search)           │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

**Feature Components** (Domain-Specific):
- **BanksOverview**: Manages bank statistics, loading, and display. Owns bank domain state.
- **ResultsPanel**: Handles result display, formatting, and export. Owns result view state.
- **ReverseMatchSection**: Manages search query, results, and abort logic. Owns search domain state.

**UI Components** (Reusable):
- **ProgressPanel**: Displays generation progress. Pure presentation, no domain logic.
- **ModeCard**: Mode selection card. Pure presentation, receives callbacks.
- **AdvancedSettings**: Settings form. Owns form state, emits changes via callbacks.
- **ExpectedOutput**: Info display. Pure presentation, receives props.
- **MarkdownContent**: Markdown renderer. Pure transformation, no state.
- **LoadingSpinner**, **StopIcon**: Icon components. Pure presentation.

**Infrastructure Components**:
- **ErrorBoundary**: Catches React errors. Cross-cutting concern, wraps app.

### Data Flow

```
User Interaction
    │
    ▼
page.tsx (Orchestrator)
    │
    ├─→ State updates (useState)
    │
    ├─→ API calls (fetch)
    │   │
    │   └─→ API Routes (server-side)
    │       └─→ Python Engine
    │
    └─→ Props to Components
        │
        ├─→ Feature Components (domain state)
        │   └─→ Own state + API calls
        │
        └─→ UI Components (presentation)
            └─→ Props only, no API calls
```

### Component Responsibilities

| Component | Responsibility | State | API Calls | Dependencies |
|-----------|---------------|-------|-----------|--------------|
| `page.tsx` | Orchestration, routing | Tool/mode/result state | Yes (generate, reverse-match) | All components |
| `BanksOverview` | Bank display | Bank stats, expanded state | Yes (banks API) | `utils.ts`, `react-markdown` |
| `ResultsPanel` | Result display | View mode (raw/formatted) | No | `utils.ts`, `MarkdownContent` |
| `ReverseMatchSection` | Search interface | Query, results, loading | Yes (reverse-match API) | `utils.ts`, `LoadingSpinner`, `StopIcon` |
| `ProgressPanel` | Progress display | None (props only) | No | `LoadingSpinner`, `StopIcon` |
| `ModeCard` | Mode selection | None (props only) | No | None |
| `AdvancedSettings` | Settings form | Form state | No | `types.ts` (PRESET_MODES) |
| `ExpectedOutput` | Info display | None (props only) | No | `types.ts` |
| `MarkdownContent` | Markdown render | None (props only) | No | None |
| `ErrorBoundary` | Error handling | Error state | No | None |

### Bounded Contexts

**1. Generation Context** (`page.tsx` + `ProgressPanel` + `ResultsPanel`)
- **Purpose**: Generate ideas/insights from chat history
- **Boundaries**: Tool selection → Generation → Results display
- **State**: `selectedTool`, `selectedMode`, `isGenerating`, `result`
- **API**: `/api/generate`

**2. Bank Context** (`BanksOverview`)
- **Purpose**: Display and manage idea/insight banks
- **Boundaries**: Bank statistics → Bank content → Export
- **State**: `ideaStats`, `insightStats`, `expandedBank`, `bankMarkdown`
- **API**: `/api/banks`

**3. Search Context** (`ReverseMatchSection`)
- **Purpose**: Semantic search across chat history
- **Boundaries**: Query input → Search → Results display
- **State**: `query`, `result`, `isMatching`, search params
- **API**: `/api/reverse-match`

**4. Settings Context** (`AdvancedSettings` + `ModeCard` + `ExpectedOutput`)
- **Purpose**: Configure generation parameters
- **Boundaries**: Mode selection → Advanced settings → Expected output
- **State**: Form state (managed by parent `page.tsx`)
- **API**: None (emits changes via callbacks)

**5. Infrastructure Context** (`ErrorBoundary`, `LogoutButton`, `LoadingSpinner`, `StopIcon`)
- **Purpose**: Cross-cutting concerns (errors, auth, loading states)
- **Boundaries**: App-wide, no domain boundaries
- **State**: Minimal, self-contained
- **API**: `/api/logout` (LogoutButton only)

### Design Principles

1. **Single Responsibility**: Each component has one clear purpose
2. **Composition over Inheritance**: Components compose via props, not inheritance
3. **Props Down, Events Up**: Data flows down, events flow up
4. **Container/Presenter Split**: `page.tsx` is container (logic), components are presenters (UI)
5. **Domain Boundaries**: Feature components own domain state; UI components are stateless
6. **Reusability**: UI components are reusable across contexts
7. **Testability**: Small, focused components are easier to test

---

## Extension Points

1. **Additional LLM Providers** — Extend `engine/common/llm.py`
2. **New Generation Types** — Add new Python script + prompt
3. **Custom Bank Schemas** — Modify `engine/common/bank.py`
4. **UI Themes** — Update Tailwind config
5. **Export Formats** — Add to UI export handlers
6. **Optimization Strategies** — Extend caching/batching logic in respective modules
7. **New Components** — Add to `src/components/` following existing patterns
8. **New Hooks** — Add to `src/hooks/` for reusable logic
9. **New Utilities** — Add to `src/lib/utils.ts` or create new utility modules

---

**Last Updated:** 2025-01-30

**Recent Updates:**
- Added Reverse Match workflow (Workflow 6) - semantic search across chat history
- Expanded database queries to include both Composer and regular chat conversations
- Added abort signal support for proper process cleanup on STOP button
- Added embedding cache for performance optimization
- **Implemented 10 performance & cost optimizations:**
  - Prompt template cache (RAM-based)
  - Retry logic with exponential backoff
  - Debounced search input
  - Conversation text cache
  - Parallel candidate generation (4x faster)
  - Cheaper judge model (GPT-3.5, opt-in, ~80% savings)
  - Bank harmonization cache (80-90% savings)
  - Batch bank harmonization (90% fewer calls)
  - Streaming responses (real-time progress)
  - Prompt compression (50-70% savings, opt-in)
- **Component Architecture Refactoring:**
  - Split `page.tsx` from 1,661 lines → 433 lines (74% reduction)
  - Extracted 12 components into `src/components/` with clear boundaries
  - Established separation of concerns: Feature components (domain) vs UI components (presentation)
  - Defined 5 bounded contexts: Generation, Bank, Search, Settings, Infrastructure
  - Created utility layer (`src/lib/utils.ts`) and hooks layer (`src/hooks/`)
  - Improved maintainability, testability, and reusability

