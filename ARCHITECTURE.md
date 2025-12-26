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
├── src/app/                    # Next.js 15 App Router
│   ├── page.tsx                # Main UI (tool selection, presets, banks)
│   ├── settings/page.tsx       # Settings wizard
│   └── api/
│       ├── generate/route.ts   # POST: spawn Python engine
│       ├── config/route.ts     # GET/POST: config CRUD
│       ├── banks/route.ts      # GET: read bank data
│       └── reverse-match/route.ts # POST: semantic search chat history
├── engine/                     # Python generation engine
│   ├── ideas.py                # Idea generation CLI
│   ├── insights.py             # Insight generation CLI
│   ├── reverse_match.py        # Reverse matching CLI (semantic search)
│   ├── common/
│   │   ├── cursor_db.py        # Cross-platform DB extraction
│   │   ├── llm.py              # Anthropic + OpenAI wrapper
│   │   ├── config.py           # User config loader
│   │   ├── bank.py             # Bank harmonization logic
│   │   └── semantic_search.py  # Embedding generation & vector similarity
│   └── prompts/
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

| Operation | Typical Duration | Bottleneck |
|-----------|------------------|------------|
| DB Query | < 1 second | SQLite read |
| Generate 1 candidate | ~15-20 seconds | LLM API |
| Judge N candidates | ~10-15 seconds | LLM API |
| Full generation (5 candidates) | ~90 seconds | LLM API |
| Bank harmonization | ~10-30 seconds | LLM API (delta mode) |
| LinkedIn sync (24 insights) | ~20-40 seconds | LLM API (batched) |
| Reverse match (90 days, 10 results) | ~3-5 seconds | Embedding API + similarity calc |
| Embedding generation (cached) | < 0.1 seconds | Cache lookup |
| Embedding generation (new) | ~0.5-1 second | OpenAI API |

---

## Extension Points

1. **Additional LLM Providers** — Extend `engine/common/llm.py`
2. **New Generation Types** — Add new Python script + prompt
3. **Custom Bank Schemas** — Modify `engine/common/bank.py`
4. **UI Themes** — Update Tailwind config
5. **Export Formats** — Add to UI export handlers

---

**Last Updated:** 2025-01-30

**Recent Updates:**
- Added Reverse Match workflow (Workflow 6) - semantic search across chat history
- Expanded database queries to include both Composer and regular chat conversations
- Added abort signal support for proper process cleanup on STOP button
- Added embedding cache for performance optimization

