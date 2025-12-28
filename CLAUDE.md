# Inspiration — AI Assistant Context

> **Purpose:** Technical context for AI coding assistants working on this project

---

## What This Is

A web UI for extracting ideas and insights from Cursor chat history using Claude Sonnet 4. Now powered by **Supabase Vector DB** for massive scale support (>2GB chat history).

- **Ideas** — Prototype and tool ideas worth building
- **Insights** — Social media post drafts sharing learnings
- **Banks** — Deduplicated storage with harmonization
- **Reverse Match** — Semantic search to find chat history evidence for user-provided insights/ideas

---

## Architecture

```
inspiration/
├── src/app/              # Next.js 15 App Router
│   ├── page.tsx          # Main generation UI
│   ├── settings/         # Settings wizard
│   └── api/
│       ├── generate/     # Calls Python engine
│       ├── config/       # Config CRUD
│       ├── banks/        # Bank reading
│       └── reverse-match/ # Semantic search chat history
├── engine/               # Python generation engine
│   ├── ideas.py          # Idea generation CLI
│   ├── insights.py       # Insight generation CLI
│   ├── reverse_match.py  # Reverse matching CLI
│   ├── common/           # Shared utilities
│   │   ├── cursor_db.py  # Cross-platform Cursor DB extraction
│   │   ├── vector_db.py  # Supabase pgvector integration
│   │   ├── llm.py        # Anthropic + OpenAI wrapper
│   │   ├── config.py     # User config management
│   │   ├── bank.py       # Bank harmonization
│   │   └── semantic_search.py # Embedding generation & vector similarity
│   └── scripts/          # Database management scripts
│       ├── index_all_messages.py # One-time bulk indexer
│       ├── sync_messages.py      # Incremental sync service
│       └── init_vector_db.sql    # Supabase schema
└── data/                 # User data (gitignored)
    ├── config.json       # User configuration
    ├── idea_bank.json    # Idea bank
    ├── insight_bank.json # Insight bank
    └── vector_db_sync_state.json # Sync tracking
```

---

## Running

```bash
npm run dev
# Open http://localhost:3000
```

---

## Vector Database Setup (Required for >100MB history)

1.  **Configure Supabase:** Add credentials to `.env.local`
    ```
    SUPABASE_URL=https://your-project.supabase.co
    SUPABASE_ANON_KEY=your-anon-key
    ```
2.  **Initialize DB:** Run `engine/scripts/init_vector_db.sql` in Supabase SQL Editor.
3.  **Index History:** Run `python3 engine/scripts/index_all_messages.py` (one-time).
4.  **Sync:** Run `python3 engine/scripts/sync_messages.py` periodically.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main UI — tool selection, presets, banks viewer, reverse match |
| `src/app/settings/page.tsx` | Settings wizard (workspaces, voice, LLM, features) |
| `engine/common/cursor_db.py` | Core DB extraction (handles "Bubble" architecture) |
| `engine/common/vector_db.py` | Supabase interface for storage & search |
| `engine/common/semantic_search.py` | Hybrid search logic (Vector DB with local fallback) |
| `engine/scripts/sync_messages.py` | Incremental sync service |

---

## Configuration Schema

```json
{
  "version": 1,
  "setupComplete": true,
  "workspaces": ["/path/to/workspace"],
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "fallbackProvider": "openai",
    "fallbackModel": "gpt-4o"
  }
}
```

---

## Dependencies

### Frontend
- Next.js 15, React 19, TypeScript
- TailwindCSS

### Backend
- Python 3.10+
- `anthropic` — Claude API
- `openai` — OpenAI API
- `supabase` — Vector DB client
- `numpy` — Vector operations

---

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Required for reverse match (embeddings)
OPENAI_API_KEY=sk-...

# Required for Vector DB
SUPABASE_URL=...
SUPABASE_ANON_KEY=...

# Optional (password protection)
APP_PASSWORD=your-secure-password
```

---

## Development Notes

1. **Cursor DB Structure:** Messages are often stored as "Bubbles" (`bubbleId`) separate from `composerData`. `cursor_db.py` handles resolving these links.
2. **Vector Strategy:** We index everything to Supabase to enable O(1) semantic search. The app automatically prefers Vector DB over local search if configured.
3. **Data Ownership:** The Vector DB serves as an independent vault of user history, protecting against Cursor retention policy changes.
