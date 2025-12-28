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
│   ├── ideas.py                # Idea generation CLI
│   ├── insights.py             # Insight generation CLI
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
└── data/                       # User data (gitignored)
    ├── config.json             # User configuration
    ├── idea_bank.json          # Structured idea storage
    ├── insight_bank.json       # Structured insight storage
    └── vector_db_sync_state.json # Sync state tracking
```

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
│  │ File: ideas.py    │  │ File: cursor_db  │              │
│  │       insights.py │  │       .py        │              │
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
