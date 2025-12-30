# Inspiration — AI Assistant Context

> **Purpose:** Technical context for AI coding assistants working on this project

---

## What This Is

A web UI for extracting ideas and insights from Cursor chat history using Claude Sonnet 4. Now powered by **Supabase Vector DB** for massive scale support (>2GB chat history). **v1** introduces a unified Items/Categories system with user-definable Themes and Modes.

- **Generation Theme** — Generate content from chat history
  - **Idea Mode** — Prototype and tool ideas worth building
  - **Insight Mode** — Social media post drafts sharing learnings
  - **Custom Modes** — User-defined generation modes
- **Seek Theme** — Search chat history for evidence
  - **Use Case Mode** — Find chat history evidence for use cases
- **Unified Bank** — Items and Categories with automatic grouping via cosine similarity
- **Reverse Match** — Semantic search to find chat history evidence for user-provided insights/ideas

---

## Architecture

```
inspiration/
├── src/app/              # Next.js 15 App Router
│   ├── page.tsx          # Main generation UI (v1: Theme/Mode selectors)
│   ├── settings/         # Settings wizard (v1: Mode Settings section)
│   └── api/
│       ├── generate/     # Calls Python engine (v1: theme/mode support)
│       ├── generate-stream/ # Streaming generation
│       ├── config/       # Config CRUD
│       ├── items/        # Unified Items/Categories API (v1)
│       ├── themes/       # Themes configuration API (v1)
│       ├── modes/        # Mode CRUD API (v1)
│       └── reverse-match/ # Semantic search chat history
├── engine/               # Python generation engine
│   ├── generate.py       # Unified generation CLI (v1: replaces ideas.py/insights.py)
│   ├── reverse_match.py  # Reverse matching CLI
│   ├── common/           # Shared utilities
│   │   ├── cursor_db.py  # Cross-platform Cursor DB extraction (Mac/Windows only)
│   │   ├── vector_db.py  # Supabase pgvector integration
│   │   ├── items_bank.py # Unified Items/Categories bank (v1)
│   │   ├── folder_tracking.py # Folder-based tracking (v1)
│   │   ├── mode_settings.py # Mode settings loader (v1)
│   │   ├── llm.py        # Anthropic + OpenAI wrapper
│   │   ├── config.py     # User config management
│   │   └── semantic_search.py # Embedding generation & vector similarity
│   ├── prompts/          # Prompt templates
│   │   ├── base_synthesize.md # Common prompt elements
│   │   ├── ideas_synthesize.md # Idea-specific prompts
│   │   └── insights_synthesize.md # Insight-specific prompts
│   └── scripts/          # Database management scripts
│       ├── index_all_messages.py # One-time bulk indexer
│       ├── sync_messages.py      # Incremental sync service
│       ├── init_vector_db.sql    # Supabase schema
│       ├── migrate_banks_to_v1.py # Bank migration script (one-time use)
│       └── migrate_voice_profile.py # Voice profile migration script (one-time use)
└── data/                 # User data (gitignored)
    ├── config.json       # User configuration (v1: userProfile instead of customVoice)
    ├── themes.json       # Theme/Mode configuration (v1)
    ├── items_bank.json   # Unified Items/Categories bank (v1)
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
| `src/app/page.tsx` | Main UI — Theme/Mode selection, presets, unified bank viewer, reverse match, run history |
| `src/app/settings/page.tsx` | Settings wizard (workspaces, VectorDB, voice, LLM, mode settings, features) |
| `src/components/ThemeSelector.tsx` | Theme selection component (v1) |
| `src/components/ModeSelector.tsx` | Mode selection component (v1) |
| `src/components/ModeSettingsManager.tsx` | Mode management UI (create/edit/delete modes) (v1) |
| `src/components/BanksOverview.tsx` | Unified Items/Categories bank viewer (v1) |
| `src/components/RunHistory.tsx` | Run history display component (v1) |
| `engine/generate.py` | Unified generation CLI (v1: replaces ideas.py/insights.py) |
| `engine/common/cursor_db.py` | Core DB extraction (Mac/Windows only, handles "Bubble" architecture) |
| `engine/common/vector_db.py` | Supabase interface for storage & search (server-side RPC) |
| `engine/common/items_bank.py` | Unified Items/Categories bank manager (v1) |
| `engine/common/folder_tracking.py` | Folder-based tracking for implemented items (v1) |
| `engine/common/semantic_search.py` | Embedding generation & vector similarity |
| `engine/scripts/sync_messages.py` | Incremental sync service |
| `data/themes.json` | Theme/Mode configuration (v1) |

---

## Configuration Schema

### App Config (`data/config.json`)

```json
{
  "version": 1,
  "setupComplete": true,
  "workspaces": ["/path/to/workspace"],
  "vectordb": {
    "provider": "supabase",
    "url": "https://xxx.supabase.co",
    "anonKey": "eyJ...",
    "serviceRoleKey": "eyJ...",
    "initialized": true,
    "lastSync": "2025-01-30T12:00:00Z"
  },
  "chatHistory": {
    "path": "/path/to/state.vscdb",
    "platform": "darwin",
    "autoDetected": true,
    "lastChecked": "2025-01-30T12:00:00Z"
  },
  "llm": {
    "provider": "anthropic",  // Options: "anthropic", "openai", "openrouter"
    "model": "claude-sonnet-4-20250514",
    "fallbackProvider": "openai",
    "fallbackModel": "gpt-4o",
    "promptCompression": {
      "enabled": true,
      "threshold": 10000,
      "compressionModel": "gpt-3.5-turbo"
    }
  },
  "userProfile": {
    "name": "Your Name",
    "jobContext": "PM at a tech company",
    "styleguide": "Professional, concise"
  },
  "features": {
    "linkedInSync": { "enabled": false, "postsDirectory": null },
    "solvedStatusSync": { "enabled": false },
    "customVoice": { "enabled": false },
    "v1Enabled": true
  }
}
```

### Themes Config (`data/themes.json`)

```json
{
  "version": 1,
  "themes": [
    {
      "id": "generation",
      "label": "Generation",
      "modes": [
        {
          "id": "idea",
          "name": "Idea",
          "settings": {
            "temperature": 0.2,
            "goldenExamplesFolder": null,
            "implementedItemsFolder": null
          }
        }
      ]
    }
  ]
}
```

### Items Bank (`data/items_bank.json`)

```json
{
  "version": 2,
  "items": [
    {
      "id": "item-xxx",
      "mode": "idea",
      "theme": "generation",
      "name": "Item Name",
      "content": {...},
      "occurrence": 3,
      "implemented": false,
      "categoryId": "category-xxx"
    }
  ],
  "categories": [
    {
      "id": "category-xxx",
      "name": "Category Name",
      "theme": "generation",
      "mode": "idea",
      "itemIds": ["item-xxx", "item-yyy"]
    }
  ]
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
# LLM Provider (choose one or more)
ANTHROPIC_API_KEY=sk-ant-...      # For Anthropic Claude
OPENAI_API_KEY=sk-...              # For OpenAI GPT or embeddings
OPENROUTER_API_KEY=sk-or-...       # For OpenRouter (500+ models)

# Required for Vector DB
SUPABASE_URL=...
SUPABASE_ANON_KEY=...

# Optional (password protection)
APP_PASSWORD=your-secure-password
```

---

## Development Notes

1. **Cursor DB Structure:** Messages are often stored as "Bubbles" (`bubbleId`) separate from `composerData`. `cursor_db.py` handles resolving these links. **v1:** Mac/Windows only (Linux support removed).
2. **Vector Strategy:** We index everything to Supabase to enable O(1) semantic search via server-side RPC function (`search_cursor_messages`). The app automatically prefers Vector DB over local search if configured. **v1:** No SQLite fallback - Vector DB is the only source.
3. **Data Ownership:** The Vector DB serves as an independent vault of user history, protecting against Cursor retention policy changes.
4. **v1 Architecture:** Unified Items/Categories system replaces separate idea/insight banks. Themes contain user-definable Modes. Categories are auto-generated via cosine similarity.
5. **Folder-Based Tracking:** Items can be marked as "implemented" by scanning folders and matching via cosine similarity (configured per mode in `themes.json`).
6. **Backward Compatibility:** v0 API calls with `tool` parameter still work - automatically mapped to `theme`/`modeId`.
7. **Date Range:** No 90-day limit in v1 - Vector DB enables unlimited date ranges.
