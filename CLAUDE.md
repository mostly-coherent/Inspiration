# Inspiration — AI Assistant Context

> **Purpose:** Technical context for AI coding assistants working on this project

---

## What This Is

A web UI for extracting ideas and insights from Cursor chat history using Claude Sonnet 4. Now powered by **Supabase Vector DB** for massive scale support (>2GB chat history). **v2.0** introduces Knowledge Graphs for longitudinal intelligence—extracting entities and relations from conversations to reveal connections in your thinking.

### Core Concepts

| Term | What It Is | UI Location |
|------|-----------|-------------|
| **Memory** | Indexed chat history in Vector DB (formerly "Brain") | Scoreboard Header (left) |
| **Library** | Accumulated ideas/insights/use cases (formerly "Bank") | Scoreboard Header (right) + Left Panel |
| **Generate** | Create new items from chat history | Action Panel (right) |
| **Seek** | Find evidence for user-provided queries | Action Panel (right) |

### Features

- **Generate (Idea Mode)** — Prototype and tool ideas worth building
- **Generate (Insight Mode)** — Social media post drafts sharing learnings
- **Generate (Custom Modes)** — User-defined generation modes
- **Seek (Use Case Mode)** — Find chat history evidence for use cases
- **Library** — Items and Categories with automatic grouping via cosine similarity
- **Memory** — Indexed chat history with sync status and date coverage
- **Theme Explorer (LIB-8)** — Pattern discovery via dynamic similarity grouping (forest → trees zoom), AI synthesis per theme
- **Unexplored Territory (LIB-10)** — Find topics discussed in Memory but missing from Library
- **Counter-Intuitive (LIB-11)** — LLM-generated reflection prompts for "good opposite" perspectives
- **Expert Perspectives (Lenny's Podcast)** — 280+ expert episodes integrated into Theme Explorer (Patterns + Counter-Intuitive tabs)
- **Knowledge Graph (v2.0)** — Entity/relation extraction from conversations, Entity Explorer, Graph View, Evolution Timeline, Intelligence features

**Longitudinal Intelligence Status:**
- ✅ Theme Explorer (v4 Phase 3) — Patterns, Unexplored, Counter-Intuitive tabs operational
- ✅ Knowledge Graph (v2.0) — Complete foundation: User chat KG (1,571 entities), Lenny's Expert KG (13,878 entities), Entity Explorer, Graph View, Evolution Timeline, Intelligence Panel

### Lenny's Podcast Integration

**What:** 280+ expert podcast episodes from Lenny's Podcast, pre-indexed and searchable.

**Key Design Decision:** Pre-computed embeddings are **hosted on GitHub Releases** (not in repo due to 219MB size limit). For cloud deployments, **Supabase Storage** is used as primary source (faster, 5-10s) with GitHub Releases as fallback (30-60s). Local development downloads automatically via `scripts/download-lenny-embeddings.sh`.

| File | Size | Purpose |
|------|------|---------|
| `data/lenny_embeddings.npz` | ~219MB | Pre-computed embeddings (DOWNLOADED from GitHub Releases) |
| `data/lenny_metadata.json` | ~28MB | Episode metadata + chunk content (DOWNLOADED from GitHub Releases) |
| `data/lenny-transcripts/` | ~25MB | Raw transcripts (GITIGNORED - source repo) |

**Key Files:**
- `engine/common/lenny_parser.py` — Parse transcripts (YAML frontmatter + markdown)
- `engine/common/lenny_search.py` — Local semantic search over embeddings (checks `/tmp` first for cloud, then `data/` for local)
- `engine/scripts/index_lenny_local.py` — Re-index if transcripts updated
- `src/app/api/lenny-download/route.ts` — Download API (Supabase Storage primary, GitHub fallback)
- `src/app/api/lenny-stats/route.ts` — Stats API
- `src/app/api/lenny-sync/route.ts` — Git pull + re-index API
- `src/app/api/expert-perspectives/route.ts` — Search API for Theme Explorer

**Download Strategy (Cloud Deployments):**
- **Primary:** Supabase Storage bucket `lenny-embeddings` (5-10s download, requires setup)
- **Fallback:** GitHub Releases (30-60s download, no setup needed)
- **Local:** Downloads to `data/` directory via bash script

**Cloud Setup (Optional):** Upload embeddings to Supabase Storage for faster cloud downloads:
1. Create bucket `lenny-embeddings` (public, 500MB limit)
2. Upload `lenny_embeddings.npz` (~219MB) and `lenny_metadata.json` (~28KB)
3. Cloud deployments will automatically use Supabase Storage

**Sync Flow:** When user clicks "Refresh Memory", Lenny archive auto-syncs via `git pull` and re-indexes if new episodes detected.

### New User Onboarding

**Two Paths:**

| Path | Steps | Time | What You Need |
|------|-------|------|---------------|
| **⚡ Fast Start** | Welcome → API Key → Theme Map | ~90 seconds | 1 LLM key |
| **🔧 Full Setup** | Welcome → API Keys → Sync → Theme Explorer | ~2 minutes | LLM + OpenAI + Supabase |

**Fast Start Flow** (`/onboarding-fast`):

| Step | What Happens | Time |
|------|-------------|------|
| 1. Welcome | Auto-detect Cursor DB, show size + density | ~3s |
| 2. API Key | Paste Anthropic API key | ~10s |
| 3. Generate | Create Theme Map from local SQLite | ~60s |
| **Done!** | See top 5 themes + unexplored territory | 🎉 |

**Key Files:**
- `src/app/onboarding-fast/page.tsx` — Fast Start UI
- `src/app/theme-map/page.tsx` — Theme Map viewer (accessible from main app)
- `src/app/api/generate-themes/route.ts` — Theme Map generation API
- `src/app/api/theme-map/route.ts` — Theme Map persistence API
- `engine/generate_themes.py` — Python CLI for theme generation
- `engine/common/cursor_db.py` → `get_high_signal_conversations_sqlite_fast()` — Fast SQLite extraction

**Testing Onboarding:** 
- Fast Start: `/onboarding-fast?preview=true`
- Full Setup: `/onboarding?preview=true`

**Supabase Requirement Thresholds:**
- **Fast Start:** No Supabase needed (reads local SQLite directly)
- < 50MB: Optional (local search works)
- 50-500MB: Recommended
- \> 500MB: Required (local too slow)
- Cloud mode: Required (no local file access)

### User Mental Model

1. **Memory completeness:** "Do I have all my chats indexed?" → Coverage dates + size
2. **Library growth:** "Is my Library growing?" → Total items + weekly delta
3. **Analysis assurance:** "Did the app analyze the right chats?" → Messages/dates/workspaces shown
4. **Easy experimentation:** All parameters exposed in Settings
5. **Memory jog:** Items link back to source chat dates and workspaces

---

## Architecture

```
inspiration/
├── src/app/              # Next.js 15 App Router
│   ├── page.tsx          # Main generation UI (redirects to onboarding if new user)
│   ├── onboarding/       # New user onboarding wizard (3 steps)
│   ├── themes/           # Theme Explorer (dedicated page)
│   ├── settings/         # Settings wizard (v1: Mode Settings section)
│   └── api/
│       ├── generate/     # Calls Python engine (v1: theme/mode support)
│       ├── generate-stream/ # Streaming generation with progress markers
│       ├── seek-stream/  # Streaming seek with progress markers
│       ├── performance/  # Performance analytics API
│       ├── config/       # Config CRUD
│       │   └── env/      # Environment variables API (onboarding)
│       ├── items/        # Unified Items/Categories API (v1)
│       │   └── themes/   # Theme grouping + synthesis API
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
│   │   ├── semantic_search.py # Embedding generation & vector similarity
│   │   └── progress_markers.py # Progress streaming & performance logging
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
    ├── vector_db_sync_state.json # Sync tracking
    └── performance_logs/ # Run performance logs (JSON)
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
5.  **Harmonization Optimization:** Run `engine/scripts/optimize_harmonization.sql` + `python3 engine/scripts/backfill_library_embeddings.py`.

---

**Performance Optimizations (IMP-15/16/17):**
- pgvector RPC for server-side similarity search (275x fewer API calls)
- Batch + parallel deduplication (5 workers)
- Pre-generation topic filter (50-80% LLM cost reduction)

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main UI — redirects to onboarding if new user |
| `src/app/onboarding/page.tsx` | 3-step onboarding wizard (Welcome → API Keys → Sync) |
| `src/app/themes/page.tsx` | Theme Explorer (LIB-8/10/11) — Patterns, Unexplored Territory, Counter-Intuitive tabs |
| `src/components/UnexploredTab.tsx` | Unexplored Territory tab — find Memory topics missing from Library |
| `src/components/CounterIntuitiveTab.tsx` | Counter-Intuitive tab — LLM reflection prompts |
| `engine/common/unexplored_territory.py` | Unexplored detection algorithm (Memory vs Library clustering) |
| `engine/common/counter_intuitive.py` | Counter-perspective LLM generation |
| `src/app/settings/page.tsx` | Settings wizard (workspaces, VectorDB, voice, LLM, mode settings) |
| `src/app/api/generate/route.ts` | Generation API with topic filter support |
| `src/app/api/generate-stream/route.ts` | Streaming generation with real-time progress markers |
| `src/app/api/seek-stream/route.ts` | Streaming seek with real-time progress markers |
| `src/app/api/performance/route.ts` | Performance analytics API (run logs, bottleneck analysis) |
| `src/components/ScoreboardHeader.tsx` | Memory + Library stats header (v3) |
| `src/components/ProgressPanel.tsx` | Real-time progress display with phases, cost, warnings |
| `src/lib/errorExplainer.ts` | Classify errors into layman-friendly explanations |
| `src/components/LibraryView.tsx` | Full-width library browser with detail panel (v3.1) |
| `engine/generate.py` | Unified generation CLI with topic filter integration |
| `engine/common/cursor_db.py` | Core DB extraction (Mac/Windows only, handles "Bubble" architecture) |
| `engine/common/vector_db.py` | Supabase interface for storage & search (server-side RPC) |
| `engine/common/items_bank_supabase.py` | Supabase-backed ItemsBank with batch operations |
| `engine/common/topic_filter.py` | Pre-generation topic filtering (IMP-17) |
| `engine/common/semantic_search.py` | Embedding generation & vector similarity |
| `engine/common/progress_markers.py` | Progress streaming markers & performance logging |
| `engine/scripts/sync_messages.py` | Incremental sync service |
| `engine/scripts/optimize_harmonization.sql` | pgvector optimization schema |
| `data/themes.json` | Theme/Mode configuration (v1) |

---

## Knowledge Graph (v2.0)

**Status:** ✅ **Complete Foundation** — Phase 0, 1a, 1b, 1c complete | ✅ User chat KG (1,571 entities) | ✅ Lenny's Expert KG (13,878 entities) | ✅ All UI components operational

**What It Does:**
- Extracts entities (tools, patterns, problems, concepts) and relations from conversations
- Builds a knowledge graph showing how your thinking connects over time
- Lenny's Podcast integration: 280+ expert episodes indexed for cross-source insights

**Key Features:**
- **Entity Explorer** — Browse all entities with filtering, search, detail view
- **Graph View** — Interactive visualization of entity connections
- **Evolution Timeline** — See how focus shifts over time (trending entities, activity charts)
- **Intelligence Panel** — Pattern detection, missing links, path finding
- **Provenance Tracking** — Link entities to source messages/episodes (YouTube links for Lenny)
- **Confidence Scoring** — Filter by High/Medium/Low confidence (0-1.0 score)

**Key Files:**
- `src/app/entities/page.tsx` — Entity Explorer page
- `src/app/graph/page.tsx` — Graph View page
- `src/components/EntityExplorer.tsx` — Entity browser component
- `src/components/GraphView.tsx` — Interactive graph visualization
- `src/components/EvolutionTimeline.tsx` — Temporal analysis component
- `src/app/api/kg/*` — All KG API endpoints (entities, relations, evolution, intelligence)
- `engine/common/entity_extractor.py` — LLM-based entity extraction
- `engine/common/relation_extractor.py` — LLM-based relation extraction
- `engine/common/triple_extractor.py` — **Phase 0:** Triple-based extraction (SPO triples)
- `engine/common/entity_canonicalizer.py` — **Phase 0:** Entity deduplication/canonicalization
- `engine/common/temporal_tracker.py` — **Phase 1b:** Temporal chain building (FOLLOWED_BY, REFERENCED_BY, OBSOLETES)
- `engine/common/decision_extractor.py` — **Phase 1b:** Decision point extraction (TECHNOLOGY_CHOICE, ARCHITECTURE, DEPENDENCY, ASSUMPTION)
- `engine/scripts/index_user_kg_parallel.py` — **Phase 1b:** User chat KG indexing (COMPLETE: 1,571 entities)
- `engine/scripts/index_lenny_kg_parallel.py` — **Phase 1a:** Lenny's KG baseline indexing (COMPLETE: 13,878 entities)
- `engine/scripts/init_knowledge_graph.sql` — KG schema

**Database Tables:**
- `kg_entities` — Unique entities with embeddings, aliases, mention counts, confidence scores
- `kg_relations` — Relationships between entities (SOLVES, ENABLES, USED_WITH, FOLLOWED_BY, REFERENCED_BY, OBSOLETES, etc.)
- `kg_entity_mentions` — Links entities to specific messages/episodes
- `kg_decisions` — **Phase 1b:** Decision points extracted from user chat (TECHNOLOGY_CHOICE, ARCHITECTURE, DEPENDENCY, ASSUMPTION)
- `kg_episode_metadata` — Lenny episode metadata (YouTube URLs, titles, guest names)

**Current State (2026-01-19):**
- ✅ **Phase 0 (Triple-Based Foundation):** Complete — Triple extraction + entity canonicalization implemented
- ✅ **Phase 1a (Lenny's Expert KG):** Complete — 13,878 entities from 303 episodes indexed
- ✅ **Phase 1b (User's Chat KG):** Complete — 1,571 entities from Cursor + Claude Code history indexed
- ✅ **Phase 1c (Pro Features):** Complete — Provenance tracking, Confidence scoring, Deduplication operational
- ✅ **Multi-Source Views:** Complete — Toggle between My KG / Lenny's KG / Combined views
- ✅ **Episode Quality Report:** Complete — Per-episode indexing stats and quality metrics
- ✅ All UI components working (Entity Explorer, Graph View, Evolution Timeline, Intelligence Panel)
- ✅ All API endpoints functional
- ✅ All SQL RPC functions deployed
- ⏸️ **Phase 2 (Cross-KG Connection):** Deferred — 0 string overlap found, semantic matching future consideration
- ⏳ **Phase 3+ (Future):** Schema Evolution, Relationship Grouping, Open-Schema Extraction (see `INSPIRATION_V2_PLAN.md`)

**Critical Implementation Details for AI Assistants:**

**Phase 0 (Triple-Based Foundation):**
- **Triple Extraction:** Uses LLM (default: `claude-haiku-4-5`) to extract Subject-Predicate-Object triples from text
- **Entity Canonicalization:** CRITICAL — Prevents graph fragmentation by merging semantically identical entities (e.g., "Next.js" = "NextJS")
- **Entity Type "unknown":** Deliberate design choice for schema evolution (Phase 3). DO NOT map "unknown" to other types — it's needed for dynamic schema discovery.
- **Files:** `triple_extractor.py`, `entity_canonicalizer.py`, `canonicalize_entities.py` (batch script)

**Phase 1b (User's Chat KG):**
- **Chunking Strategy:** Conversation-level (not speaker-turn) — each conversation = 1 processing unit
- **Source Data:** Reads from local Cursor SQLite DB + Claude Code JSONL files (NOT Supabase — faster, avoids timeouts)
- **Temporal Chains:** Tracks conversation relationships (FOLLOWED_BY, REFERENCED_BY, OBSOLETES) — saved as relations between conversation entities
- **Decision Extraction:** Extracts TECHNOLOGY_CHOICE, ARCHITECTURE, DEPENDENCY, ASSUMPTION — stored in `kg_decisions` table
- **Trace ID Extraction:** Extracts `# @trace-id: research_node_882` comments from code — links decisions to research
- **Files:** `index_user_kg_parallel.py`, `temporal_tracker.py`, `decision_extractor.py`

**Lenny's KG Indexing:**
- **Chunking Strategy:** Speaker-turn based (not conversation-level) — each speaker turn = 1 chunk (~92 words avg)
- **Total Chunks:** 50,815 chunks across 303 episodes
- **LLM Model:** `claude-haiku-4-5` for both triple and entity extraction (baseline quality)
- **Resume Capability:** Tracks indexed chunks, can safely pause/resume
- **Rate Limiting:** Handles Anthropic rate limits with exponential backoff + circuit breaker
- **Files:** `index_lenny_kg_parallel.py`, `lenny_parser.py`

**Database Migrations (CRITICAL — Must be Applied):**
- ✅ `add_unknown_entity_type.sql` — Adds "unknown" to `entity_type` enum
- ✅ `add_temporal_relation_types.sql` — Adds FOLLOWED_BY, REFERENCED_BY, OBSOLETES to `relation_type` enum
- ✅ `add_decisions_schema.sql` — Creates `kg_decisions` table

**See Also:**
- `INSPIRATION_V2_PLAN.md` — Detailed v2.0 build plan (all 6 phases)
- `ARCHITECTURE.md` — Knowledge Graph Architecture section
- `BUILD_LOG.md` — Chronological progress diary

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
# LLM Provider
ANTHROPIC_API_KEY=sk-ant-...      # Required: For Claude (generation, synthesis)
OPENAI_API_KEY=sk-...              # Required for Full Setup: Embeddings, semantic search

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
8. **Deployment:** Hybrid architecture - Vercel hosts Next.js frontend, Railway hosts Python engine. See `ARCHITECTURE.md` for details.
9. **v3 Terminology:** "Brain" → "Memory", "Bank" → "Library". Library is the core value prop (scoreboard), not just storage.
10. **v3 Configuration:** No hardcoding. All parameters (LLM assignments, thresholds, prompts) exposed in Settings.

---

## Supabase Setup

### Create RPC Function for Table Size

To get actual table size (instead of estimating), create an RPC function in Supabase:

1. **Go to Supabase Dashboard:** https://supabase.com/dashboard
2. **Select your project**
3. **Click "SQL Editor"** → **"New query"**
4. **Run this SQL:**

```sql
-- Create RPC function to get table size (for API access)
CREATE OR REPLACE FUNCTION get_table_size(table_name text)
RETURNS json AS $$
DECLARE
    result json;
BEGIN
    SELECT json_build_object(
        'total_size_bytes', pg_total_relation_size(table_name::regclass),
        'table_size_bytes', pg_relation_size(table_name::regclass),
        'indexes_size_bytes', pg_indexes_size(table_name::regclass),
        'total_size', pg_size_pretty(pg_total_relation_size(table_name::regclass)),
        'table_size', pg_size_pretty(pg_relation_size(table_name::regclass)),
        'indexes_size', pg_size_pretty(pg_indexes_size(table_name::regclass))
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_table_size(text) TO anon;
GRANT EXECUTE ON FUNCTION get_table_size(text) TO authenticated;
```

5. **Test it:**

```sql
SELECT get_table_size('cursor_messages');
```

**Verify from app:**
```bash
cd engine
python3 scripts/test_rpc_function.py
```

### Troubleshooting RPC Function

If RPC function not found:

1. **Verify function exists:**
```sql
SELECT proname as function_name, pg_get_function_arguments(oid) as arguments
FROM pg_proc WHERE proname = 'get_table_size';
```

2. **Recreate if needed:**
```sql
DROP FUNCTION IF EXISTS get_table_size(text);
-- Then run creation SQL above
```

3. **Grant all permissions:**
```sql
GRANT EXECUTE ON FUNCTION get_table_size(text) TO anon;
GRANT EXECUTE ON FUNCTION get_table_size(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_size(text) TO service_role;
```

4. **Refresh schema cache:** Wait 1-2 minutes after creating function

<!-- Merged from CREATE_RPC_FUNCTION.md and SUPABASE_SETUP_INSTRUCTIONS.md and TROUBLESHOOT_RPC_FUNCTION.md on 2025-01-30 -->

---

## Vector DB Sync

### How "Refresh Brain" Works

The "Refresh Brain" feature syncs your local Cursor chat history to the cloud Vector DB, making it searchable for AI-powered insights and ideas.

**Two Ways to Trigger:**

1. **Automatic (On First Load):**
   - App loads for the first time
   - Automatically runs sync in the background
   - Shows "Syncing..." then updates to show results
   - ✅ Local app only | ❌ Vercel (shows "Cloud Mode")

2. **Manual (Click Button):**
   - User clicks "🔄 Refresh Brain" button
   - Immediately starts sync
   - Shows "Syncing..." then updates to show results
   - ✅ Local app only | ❌ Vercel (shows "Cloud Mode")

**Detection Logic:**

1. API tries to run sync script
2. Script tries to find Cursor database
3. If database not found → Returns "Cannot sync from cloud environment"
4. Frontend shows: "☁️ Cloud Mode (Read-only)"

**What Happens During Sync:**

1. Reads local database (SQLite file)
2. Finds new messages (since last sync timestamp)
3. Checks Vector DB for duplicates
4. Processes only new messages:
   - Creates embeddings (AI search format)
   - Indexes into Vector DB
5. Updates sync state (saves latest timestamp)
6. Refreshes brain size display

**Status Messages:**
- "Syncing..." - Currently syncing
- "✓ Synced X new items" - Successfully added new messages
- "✓ Synced X new items (Y already indexed)" - Some were duplicates
- "✓ Brain up to date" - Everything is synced
- "☁️ Cloud Mode (Read-only)" - Running on Vercel, can't sync

<!-- Merged from HOW_REFRESH_BRAIN_WORKS.md on 2025-01-30 -->

### Monitor Sync Progress

**Real-Time Monitoring:**

```bash
# Watch log file (recommended)
tail -f /tmp/sync_progress.log

# Check last 30 lines
tail -30 /tmp/sync_progress.log

# See only important progress messages
tail -100 /tmp/sync_progress.log | grep -E "(🚀|📅|📚|📊|🔍|Already|Need to|Processing batch|Indexed|✅|complete)"
```

**Check if Script is Running:**
```bash
ps aux | grep index_all_messages.py | grep -v grep
```

**Progress Indicators:**

- **Loading Phase:** `📚 Loading conversations from LOCAL Cursor database (SQLite)...`
- **Deduplication Phase:** `🔍 Checking which messages already exist in Vector DB...`
- **Indexing Phase:** `📝 Processing X new messages... Processing batch 1/X...`
- **Completion:** `✅ Indexing complete!`

**Estimated Time:**
- Loading: 5-15 minutes
- Deduplication: 1-2 minutes
- Indexing: 30-60 minutes
- **Total:** ~45-75 minutes for full sync

**Troubleshooting:**

If script seems stuck:
```bash
# Check if running
ps aux | grep index_all_messages.py

# Stop and restart (will skip already-indexed messages)
pkill -f index_all_messages.py
cd engine
python3 scripts/index_all_messages.py
```

<!-- Merged from MONITOR_SYNC_PROGRESS.md on 2025-01-30 -->

### Missing Messages Explanation

**Issue:** July-September 2025 messages missing from Vector DB (only October+ present)

**Root Cause:** The `index_all_messages.py` script was using `get_conversations_for_range()`, which queries **Vector DB** instead of the **local SQLite database**. This created a circular dependency:

1. Script tries to index messages → queries Vector DB
2. Vector DB only has October+ messages → misses July-September
3. July-September messages never get indexed

**Solution:** Updated `index_all_messages.py` to:
1. Read directly from **local SQLite database** using `_get_conversations_for_date_sqlite()`
2. Start from **July 1, 2025** (when you started using Cursor)
3. Process day-by-day to ensure all messages are captured

**To Sync Missing Messages:**

```bash
cd engine
python3 scripts/index_all_messages.py
```

**Note:** This will process ALL messages from July 2025 to now, may take 30-60 minutes.

**Dry run test:**
```bash
python3 scripts/index_all_messages.py --dry-run
```

<!-- Merged from MISSING_MESSAGES_EXPLANATION.md on 2025-01-30 -->

### Unknown Workspace Confirmation

**Verification:** The Inspiration app **does NOT filter out or ignore** messages with `workspace = "Unknown"`. These messages are fully included in all searches and analysis.

**Code Evidence:**

1. **Vector DB Search (`vector_db.py`):**
   - Workspace filter only applied if `workspace_paths` is explicitly provided
   - If `workspace_paths` is `None`: ALL messages included, including "Unknown"

2. **Generate Script (`generate.py`):**
   - All calls pass `workspace_paths=None`
   - This means **all workspaces are included**, including "Unknown"

3. **Sync Script (`sync_messages.py`):**
   - `workspace_paths=None` - syncs ALL messages, including "Unknown"

**Why "Unknown" Exists:**

Messages get `workspace = "Unknown"` when:
1. Workspace was deleted/moved (workspaceStorage entry no longer exists)
2. Workspace hash doesn't match current workspaceStorage mapping
3. Chat data doesn't contain workspace hash information

**How Workspace Mapping Works:**
1. `get_workspace_mapping()` reads from `workspaceStorage` directory
2. Each workspace folder contains a `workspace.json` with the folder path
3. The folder name is the workspace hash
4. If a hash isn't found in this mapping → "Unknown"

This is **expected behavior** for historical/deleted workspaces and does **NOT** affect searchability.

**Conclusion:**
✅ Your "Unknown" workspace messages ARE being mined for insights, ideas, and use cases
✅ No code changes needed - the app already includes them
✅ All "Unknown" messages are searchable and analyzable

<!-- Merged from UNKNOWN_WORKSPACE_CONFIRMATION.md on 2025-01-30 -->
<!-- Merged from engine/scripts/EXPLAIN_UNKNOWN_WORKSPACE.md on 2026-01-02 -->

---

## Deployment

### Railway Deployment Steps

**Prerequisites:**
- Railway CLI installed: `npm install -g @railway/cli`
- Flask API wrapper created (`engine/api.py`)
- Procfile created (`engine/Procfile`)

**Steps:**

1. **Login to Railway:**
```bash
cd engine
railway login
```

2. **Initialize Railway Project:**
```bash
railway init
# When prompted: Create new project, name it (e.g., "inspiration-engine")
```

3. **Set Environment Variables (via Railway Dashboard):**
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY` (optional)
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

4. **Deploy:**
```bash
railway up
```

5. **Get Deployment URL:**
```bash
railway domain
# Example: https://inspiration-production-6eaf.up.railway.app
```

6. **Configure Vercel:**
   - Add `PYTHON_ENGINE_URL=https://your-railway-url.railway.app` to Vercel environment variables
   - Redeploy Vercel app

**Check Logs:**
```bash
railway logs
```

**Test Health Endpoint:**
```bash
curl https://your-railway-url.railway.app/health
```

<!-- Merged from RAILWAY_DEPLOYMENT_STEPS.md on 2025-01-30 -->

---

## QA Checklist

> **Purpose:** Mandatory checks before marking any feature "done"
> **Applies to:** All code changes, especially UI/UX changes

### Pre-Commit Checklist

**1. Code Quality**
- [ ] No linter errors: `npm run lint`
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] Code compiles: `npm run build`

**2. Automated Tests**
- [ ] E2E tests pass: `npm test`
- [ ] New E2E test added if new feature
- [ ] Test covers the bug if bug fix

**3. Manual Testing (CRITICAL - Don't Skip!)**
- [ ] **Actually run the app:** `npm run dev`
- [ ] **Use the feature you just built/changed**
- [ ] **Look at the UI with user eyes** - does it make sense?
- [ ] **Check the stats/numbers** - do they tell a coherent story?
- [ ] **Test edge cases:**
  - Empty state (no data)
  - Error state (API fails)
  - Success state (happy path)
  - Partial success (some data)

**4. User Perspective**
- [ ] **Labels are clear** - would a non-technical user understand them?
- [ ] **Numbers make sense together** - do the stats relate logically?
- [ ] **Error messages are helpful** - not just "failed"
- [ ] **Success feedback is clear** - what actually happened?

**5. Data Flow Verification**
- [ ] **Frontend ↔ API:** Does UI display what API returns?
- [ ] **API ↔ Python:** Does API parse Python output correctly?
- [ ] **Python ↔ Database:** Does Python save/load data correctly?
- [ ] **End-to-end:** Does data flow correctly from generation → harmonization → Library?

### Specific to Stats Display Changes

When changing stats display:
- [ ] Print Python script output and verify format
- [ ] Check API route parser regex patterns
- [ ] Verify TypeScript types match API response
- [ ] Look at UI and verify all stats show correctly
- [ ] Test with: no data, some data, all data
- [ ] Verify harmonization stats match generation stats

### Example: Testing "Generate Insights"

1. **Run the app:** `npm run dev`
2. **Click "Generate Insights"** with 7-day preset
3. **Wait for completion**
4. **Check the "Generated Insights" panel:**
   - ✅ "Conversations Analyzed" shows a number
   - ✅ "Days with Activity" shows "X of Y" format
   - ✅ "Items Generated" shows a number (or 0, not blank)
   - ✅ "Items in Output File" shows Yes/No
   - ✅ If harmonization ran, "New Items Added" makes sense
   - ✅ Numbers are coherent (e.g., if 14 items added, can't show "0 output")
5. **Check terminal output:**
   - ✅ Python script printed stats in expected format
   - ✅ No errors in API parsing
6. **Check Library:**
   - ✅ Item count increased by expected amount
   - ✅ Can view the new items

### When You're Tempted to Skip Testing

**DON'T.**

The time you save by skipping manual testing is **always** exceeded by:
- User finding bugs
- Debugging later
- Lost trust
- Context switching cost

If you're too tired to test properly, **stop and test tomorrow**.

### For AI Assistants

**Before marking TODO "Test end-to-end" as complete:**
1. Use browser MCP tools to navigate and test the UI
2. Take screenshots of before/after
3. Verify stats make sense from user perspective
4. Check that changes work in context of full app

**Red flags that mean you MUST test:**
- Changed stats display
- Modified API parsing
- Updated data flow
- Changed user-facing labels
- Refactored anything that touches multiple layers

<!-- Merged from QA_CHECKLIST.md on 2026-01-08 -->
