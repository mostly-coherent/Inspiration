# Inspiration — AI Assistant Context

> **Purpose:** Technical context for AI coding assistants working on this project

---

## What This Is

A thinking partner for builders who use AI coding tools. Mines your Cursor conversations, Claude sessions (Code + Cowork), and workspace artifacts (markdown, TODOs, code comments) to surface patterns, blind spots, and probing questions. Powered by Supabase Vector DB (pgvector) for semantic search across your entire history. **v6** adds Multi-Source Memory and Socratic Mode (Reflect tab).

### Core Concepts

| Term | What It Is | UI Location |
|------|-----------|-------------|
| **Memory** | Indexed chat history in Vector DB (formerly "Brain") | Scoreboard Header (left) |
| **Library** | Accumulated ideas/insights/use cases (formerly "Bank") | Scoreboard Header (right) + Left Panel |
| **Generate** | Create new items from chat history | Action Panel (right) |
| **Seek** | Find evidence for user-provided queries | Action Panel (right) |

### Features

- **Generate (Idea/Insight/Custom Modes)** — Extract ideas, insights, or user-defined modes from chat history
- **Seek (Use Case Mode)** — Find chat history evidence for user-provided queries
- **Library** — Items and Categories with automatic grouping via cosine similarity (Supabase-backed)
- **Memory** — Multi-source indexed history: Cursor chats, Claude Code, Claude Cowork, workspace docs
- **Theme Explorer** — 3 tabs:
  - **Patterns** — Semantic clustering (forest → tree zoom), AI synthesis per theme
  - **Reflect** (Socratic Mode) — Probing questions generated from your patterns, gaps, and expert knowledge
  - **Unexplored** — Topics in Memory but missing from Library (experimental)
- **Expert Perspectives (Lenny's Podcast)** — 300+ episodes with YouTube timestamp deep-links (`00:15:30` → `?t=930`)
- **Theme Map** — Fast generation from local SQLite with cost estimation before generation
- **Knowledge Graph (v2.0)** — Entity Explorer, Graph View, Evolution Timeline (expert KG useful; user KG quality poor)
- **Scoreboard** — "Your Memory Sources" showing AI chats, workspace docs, and code comments

**Longitudinal Intelligence Status:**
- ✅ Theme Explorer (v4-v6) — Patterns, Reflect, Unexplored tabs operational
- ✅ Knowledge Graph (v2.0) — Complete foundation: Lenny's Expert KG (13,878 entities), User KG (1,571 entities)
- ⏳ Learning Trajectory (LIB-9) — Track interest shifts over time (next major feature)

### Lenny's Podcast Integration

**What:** 300+ expert podcast episodes from Lenny's Podcast, pre-indexed and searchable. Updated weekly when Claire Vo updates the ChatPRD GitHub repository.

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

**Sync Flow:** When user clicks "Refresh Memory", Lenny archive auto-syncs via `git pull` from [ChatPRD/lennys-podcast-transcripts](https://github.com/ChatPRD/lennys-podcast-transcripts) (updated weekly by Claire Vo) and re-indexes if new episodes detected.

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
├── src/
│   ├── app/                  # Next.js 15 App Router
│   │   ├── page.tsx          # Main UI (redirects to onboarding if new user)
│   │   ├── onboarding-fast/  # Fast Start (90s, local SQLite)
│   │   ├── onboarding/       # Full Setup wizard
│   │   ├── themes/           # Theme Explorer (Patterns, Reflect, Unexplored)
│   │   ├── theme-map/        # Theme Map viewer (with cost estimation)
│   │   ├── settings/         # Settings (General, Modes, Advanced, Prompts)
│   │   ├── entities/         # Entity Explorer (KG)
│   │   ├── graph/            # Graph View (KG)
│   │   └── api/
│   │       ├── generate-themes/ # Theme Map generation + cost estimation
│   │       ├── theme-map/       # Theme Map persistence
│   │       ├── themes/socratic/ # Socratic question generation
│   │       ├── expert-perspectives/ # Lenny semantic search
│   │       ├── brain-stats/   # Memory stats + source breakdown
│   │       ├── sync/          # Multi-source sync (Cursor + Claude + Docs)
│   │       ├── items/         # Library CRUD (Supabase-backed)
│   │       ├── config/        # Config CRUD
│   │       ├── kg/            # Knowledge Graph endpoints
│   │       └── lenny-*/       # Lenny download, sync, stats
│   ├── components/
│   │   ├── ScoreboardHeader.tsx    # Memory Sources scoreboard
│   │   ├── ThemeExplorerTabs.tsx   # Tab config (Patterns | Reflect | Unexplored)
│   │   ├── ReflectTab.tsx          # Socratic Mode UI
│   │   ├── UnexploredTab.tsx       # Gap detection UI
│   │   ├── CounterIntuitiveTab.tsx # Reflection prompts (inside Reflect)
│   │   ├── EntityExplorer.tsx      # KG Entity browser
│   │   └── GraphView.tsx           # KG interactive graph
│   └── lib/
│       ├── socratic.ts       # Socratic Engine (data aggregation + LLM)
│       ├── youtube.ts        # YouTube timestamp deep-links (HH:MM:SS → ?t=N)
│       └── types.ts          # Shared TypeScript types
├── engine/                   # Python backend
│   ├── generate.py           # Unified generation CLI (Ideas/Insights/Custom)
│   ├── generate_themes.py    # Theme Map generation + cost estimation
│   ├── common/
│   │   ├── cursor_db.py      # Cursor SQLite extraction (Mac/Windows)
│   │   ├── claude_code_db.py # Claude Code + Cowork JSONL parsing
│   │   ├── source_detector.py # Auto-detect chat history locations
│   │   ├── workspace_scanner.py # Scan .md files + code comments
│   │   ├── vector_db.py      # Supabase pgvector integration
│   │   ├── items_bank_supabase.py # Library (Supabase-backed)
│   │   ├── cost_estimator.py # LLM cost estimation
│   │   ├── lenny_parser.py   # Transcript parser (YAML + markdown)
│   │   ├── lenny_search.py   # Local semantic search over embeddings
│   │   ├── llm.py            # Anthropic + OpenAI wrapper
│   │   └── config.py         # User config management
│   ├── prompts/              # LLM prompt templates
│   └── scripts/
│       ├── sync_messages.py  # Multi-source incremental sync
│       ├── get_brain_stats.py # Memory size calculation (all sources)
│       └── migrations/       # Supabase schema migrations
└── data/                     # User data (gitignored)
    ├── config.json           # User configuration
    ├── themes.json           # Theme/Mode configuration
    ├── vector_db_sync_state.json # Sync tracking
    └── theme_maps/           # Saved Theme Maps (JSON)
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
| **Frontend — Pages** | |
| `src/app/page.tsx` | Main UI — redirects to onboarding if new user |
| `src/app/onboarding-fast/page.tsx` | Fast Start onboarding (90s, local SQLite) |
| `src/app/themes/page.tsx` | Theme Explorer — Patterns, Reflect, Unexplored tabs |
| `src/app/theme-map/page.tsx` | Theme Map viewer (with cost estimation + regeneration) |
| `src/app/settings/page.tsx` | Settings (General, Modes, Advanced, Prompts) |
| **Frontend — Components** | |
| `src/components/ScoreboardHeader.tsx` | "Your Memory Sources" — AI chats, docs, code comments |
| `src/components/ThemeExplorerTabs.tsx` | Tab config (Patterns \| Reflect \| Unexplored) |
| `src/components/ReflectTab.tsx` | Socratic Mode — probing questions UI |
| `src/components/UnexploredTab.tsx` | Gap detection — Memory topics missing from Library |
| `src/components/CounterIntuitiveTab.tsx` | LLM reflection prompts (used within Reflect) |
| `src/components/LibraryView.tsx` | Full-width library browser with detail panel |
| **Frontend — Lib** | |
| `src/lib/socratic.ts` | Socratic Engine — data aggregation + LLM question generation |
| `src/lib/youtube.ts` | YouTube timestamp deep-links (HH:MM:SS → ?t=seconds) |
| **API Routes** | |
| `src/app/api/generate-themes/route.ts` | Theme Map generation + cost estimation API |
| `src/app/api/themes/socratic/route.ts` | Socratic question generation (24h cache) |
| `src/app/api/expert-perspectives/route.ts` | Lenny semantic search for Theme Explorer |
| `src/app/api/brain-stats/sources/route.ts` | Source breakdown (Cursor, Claude, Docs) |
| `src/app/api/sync/route.ts` | Multi-source sync trigger |
| **Python — Core** | |
| `engine/generate.py` | Unified generation CLI (Ideas/Insights/Custom) |
| `engine/generate_themes.py` | Theme Map generation + cost estimation |
| `engine/common/cursor_db.py` | Cursor SQLite extraction (Mac/Windows, "Bubble" format) |
| `engine/common/claude_code_db.py` | Claude Code + Cowork JSONL parsing |
| `engine/common/source_detector.py` | Auto-detect all chat history locations |
| `engine/common/workspace_scanner.py` | Scan .md files + TODO/FIXME code comments |
| `engine/common/vector_db.py` | Supabase pgvector interface (storage + search) |
| `engine/common/items_bank_supabase.py` | Library storage (Supabase-backed, batch operations) |
| `engine/common/cost_estimator.py` | LLM cost estimation for Theme Map generation |
| `engine/common/lenny_parser.py` | Transcript parser (YAML frontmatter + markdown) |
| `engine/common/lenny_search.py` | Local semantic search over pre-computed embeddings |
| `engine/scripts/sync_messages.py` | Multi-source incremental sync (Cursor + Claude + Docs) |
| `engine/scripts/get_brain_stats.py` | Memory size calculation (all sources) |

---

## Knowledge Graph (v2.0)

**Status:** ✅ **Complete Foundation** — Phase 0, 1a, 1b, 1c complete | ✅ User chat KG (1,571 entities) | ✅ Lenny's Expert KG (13,878 entities) | ✅ All UI components operational

**What It Does:**
- Extracts entities (tools, patterns, problems, concepts) and relations from conversations
- Builds a knowledge graph showing how your thinking connects over time
- Lenny's Podcast integration: 300+ expert episodes indexed for cross-source insights (updated weekly from ChatPRD GitHub)

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

**Current State (2026-02-06):**
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
    "provider": "anthropic",  // Options: "anthropic", "openai"
    "model": "claude-sonnet-4-20250514",
    "fallbackProvider": "openai",
    "fallbackModel": "gpt-4o"
  },
  "userProfile": {
    "name": "Your Name",
    "jobContext": "PM at a tech company",
    "styleguide": "Professional, concise"
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

### Items Bank (Supabase `library_items` table)

Library items are stored in Supabase PostgreSQL (migrated from JSON in v3). Key fields: `id`, `mode`, `name`, `content`, `occurrence`, `first_seen_date`, `last_seen_date`, `embedding` (vector(1536)), `category_id`. See `engine/scripts/add_library_tables.sql` for schema.

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

1. **Cursor DB Structure:** Messages stored as "Bubbles" (`bubbleId`) separate from `composerData`. `cursor_db.py` handles resolving these links. Mac/Windows only (no Linux).
2. **Multi-Source Memory:** Indexes 4 sources: Cursor (SQLite), Claude Code (JSONL), Claude Cowork (JSONL), workspace docs (.md + code comments).
3. **Vector DB:** Required for >500MB histories. Supabase pgvector with RPC for server-side similarity search.
4. **Library Storage:** Migrated from JSON to Supabase PostgreSQL (v3). Unified Items/Categories with cosine similarity grouping.
5. **LLM Providers:** Anthropic (generation) + OpenAI (embeddings, judge). OpenRouter removed from UI (backend still supports).
6. **Terminology:** "Brain" → "Memory", "Bank" → "Library". Theme Explorer tabs: Patterns, Reflect, Unexplored.
7. **Deployment:** Hybrid — Vercel (frontend) + Railway (Python engine). `PYTHON_ENGINE_URL` env var controls routing.
8. **Configuration:** No hardcoding. All parameters exposed in Settings (General, Modes, Advanced, Prompts tabs).
9. **YouTube Deep-Links:** Lenny quotes with `HH:MM:SS` timestamps auto-convert to `?t=seconds` for exact moment links.
10. **Cost Estimation:** Theme Map page shows estimated cost before generation starts (uses `cost_estimator.py`).

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

---

## Onboarding Testing & Auditing

### Quick Start Methods

**Method 1: Preview Mode (Fastest - No Reset Needed)**
- Navigate to: `http://localhost:3000/onboarding-fast?preview=true`
- Simulates DB detection, cost estimates, theme map generation
- **No data is saved** (config, theme maps, etc.)
- Skips API key validation
- Fast iteration (no real API calls)

**Method 2: Reset Onboarding Button (Full Reset)**
- Navigate to Settings → Advanced → Testing & Development
- Click "Reset Onboarding State" button
- Resets: Theme map cache, `setupComplete` flag, `fastStartComplete` flag
- Does NOT reset: Vector DB data, Library items, API keys in `.env.local`

**Method 3: API Reset (Programmatic)**
```bash
curl -X POST http://localhost:3000/api/test/reset-onboarding
```

**Method 4: Manual Config Reset**
- Edit `data/config.json`: Set `setupComplete: false`, `fastStartComplete: false`
- Clear theme map cache: `rm -rf data/theme_maps/*.json`
- If using Supabase, update `app_config` table

### Automated Testing (Playwright E2E)

```bash
# Run all onboarding tests
npm test

# Run only Fast Start tests
npx playwright test e2e/fast-start.spec.ts

# Run only Full Onboarding tests
npx playwright test e2e/onboarding.spec.ts

# Run with UI (interactive)
npm run test:ui

# Run in headed mode (watch browser)
npm run test:headed
```

### Manual Audit Checklist

**Scenario 1: New User with <500MB History**
- [ ] Home page redirects to `/onboarding-fast` when not set up
- [ ] DB detection shows correct size
- [ ] Time window selector works (1/2/4/6 weeks)
- [ ] Cost estimate appears and updates when days change
- [ ] API key validation works (shows ✅/❌)
- [ ] Theme map generation shows progress
- [ ] After completion, visiting `/` does NOT redirect

**Scenario 2: New User with >500MB History**
- [ ] Detects large history (>500MB)
- [ ] Redirects to `/onboarding-choice` (not `/onboarding`)
- [ ] Choice screen shows both options
- [ ] Quick Start button navigates to `/onboarding-fast?mode=partial`
- [ ] Full Setup button navigates to `/onboarding`

**Scenario 3: Error Scenarios**
- [ ] Invalid API key shows error message with actionable guidance
- [ ] DB detection failure shows Python version error or "Cursor database not found"
- [ ] Theme generation failure shows user-friendly error message
- [ ] Config save failure shows warning message

### Browser DevTools Commands

```javascript
// Check current config state
fetch('/api/config').then(r => r.json()).then(console.log);

// Check environment variables (doesn't return values, just status)
fetch('/api/config/env').then(r => r.json()).then(console.log);

// Reset onboarding
fetch('/api/test/reset-onboarding', { method: 'POST' })
  .then(r => r.json())
  .then(console.log);

// Check theme map cache
fetch('/api/theme-map').then(r => r.json()).then(console.log);
```

### Key URLs for Testing

| Flow | URL | Preview Mode |
|------|-----|--------------|
| **Fast Start** | `/onboarding-fast` | `?preview=true` |
| **Choice Screen** | `/onboarding-choice` | (Mock >500MB) |
| **Full Setup** | `/onboarding` | `?preview=true` |
| **Home** | `/` | N/A |
| **Settings** | `/settings` | N/A |

### Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/config` | GET | Check setup status |
| `/api/config/env` | GET | Check API keys configured |
| `/api/generate-themes` | GET | Get DB metrics |
| `/api/generate-themes` | POST | Generate theme map |
| `/api/test/reset-onboarding` | POST | Reset onboarding state |
| `/api/config` | POST | Save config |

### Key Config Flags

| Flag | Purpose | Set When |
|------|---------|----------|
| `setupComplete` | Full setup done | After Full Setup sync |
| `fastStartComplete` | Fast Start done | After Fast Start theme map |

**Note:** After fixes, Fast Start also sets `setupComplete: true` to prevent redirect loops.

<!-- Merged from ONBOARDING_AUDIT_GUIDE.md on 2026-01-23 -->

---

## Security & Privacy

<!-- Merged from SECURITY_PRIVACY_ASSESSMENT.md on 2026-01-21 -->

> **Purpose:** Verify that user data is NOT exposed when cloning the Inspiration repo, while Lenny's open-sourced podcast data CAN be safely included.

### ✅ User Data Protection (VERIFIED)

**Your Chat History:**
- ✅ **NOT in repo** — All chat history files are gitignored:
  - `data/config.json` (user-specific config)
  - `data/conversation_cache.json` (cached conversations)
  - `data/embedding_cache.json` (cached embeddings)
  - `data/vector_db_sync_state.json` (sync state)
- ✅ **Read from local files only** — The app reads from your local Cursor DB (`Library/Application Support/Cursor/...`) or Claude Code projects folder
- ✅ **No hardcoded paths** — Paths are auto-detected based on platform (macOS/Windows)

**Your Vector Database & Embeddings:**
- ✅ **NOT in repo** — Stored in your own Supabase instance
- ✅ **Environment variables required** — Each user must configure:
  - `SUPABASE_URL` (your own Supabase project URL)
  - `SUPABASE_ANON_KEY` (your own Supabase anonymous key)
- ✅ **No hardcoded credentials** — All Supabase connections use `process.env.SUPABASE_URL` (no real URLs in code)
- ✅ **Per-instance isolation** — Each user runs their own Supabase instance (no shared database)

**Your Knowledge Graph:**
- ✅ **NOT in repo** — Stored in your Supabase instance
- ✅ **Source tracking** — Database schema separates user data (`source_type='user'`) from Lenny data (`source_type='expert'` or `source_type='lenny'`)
- ✅ **RLS policies** — Row Level Security enabled (though per-instance, not multi-tenant)

**Environment Variables:**
- ✅ **Gitignored** — `.env` and `.env*.local` files are excluded from git
- ✅ **No sample data** — No example `.env` files with real credentials
- ✅ **Placeholders only** — Code uses placeholders like `https://your-project.supabase.co`

### ✅ Lenny's Podcast Data (Safe to Include)

**Current Status:**
- ⚠️ **Currently gitignored** — Lenny's data is excluded:
  - `data/lenny-transcripts/` (raw transcripts)
  - `data/lenny_embeddings.npz` (pre-computed embeddings)
  - `data/lenny_metadata.json` (episode metadata)

**Why It's Safe to Include:**
- ✅ **Open-sourced** — Lenny has open-sourced all podcast transcripts on GitHub
- ✅ **Public domain** — Transcripts are publicly available
- ✅ **Read-only** — Embeddings are deterministic and never modified by users
- ✅ **Separated in DB** — Database uses `source_type` to distinguish Lenny data from user data

**Recommendation:**
If you want to enable zero-setup onboarding (as mentioned in optimization docs), you can:
1. **Remove from `.gitignore`:**
   - `data/lenny_embeddings.npz` (pre-computed embeddings)
   - `data/lenny_metadata.json` (episode metadata)
2. **Keep gitignored:**
   - `data/lenny-transcripts/` (too large, can be cloned separately)
3. **Add to README:** Instructions for cloning Lenny's transcripts repo separately

### 🔒 Security Checklist

| Item | Status | Notes |
|------|--------|-------|
| User chat history files | ✅ Protected | Gitignored, read from local files only |
| User embeddings | ✅ Protected | Stored in user's Supabase instance |
| User KG data | ✅ Protected | Stored in user's Supabase instance |
| Supabase credentials | ✅ Protected | Environment variables, gitignored |
| Hardcoded URLs/keys | ✅ None found | All use environment variables |
| Sample data files | ✅ None found | No example files with real data |
| Lenny's data | ⚠️ Currently excluded | Safe to include (open-sourced) |

### 📋 What Gets Cloned

When someone clones `https://github.com/mostly-coherent/Inspiration`:

**✅ Included (Safe):**
- Source code (TypeScript, Python)
- Database schema migrations (SQL files)
- Documentation (README, PLAN, etc.)
- Configuration templates (no real credentials)

**❌ NOT Included (Protected):**
- User chat history files
- User embeddings/cache files
- User Knowledge Graph data
- Environment variables (`.env` files)
- User-specific config files

**⚠️ Currently Excluded (But Safe to Include):**
- Lenny's podcast embeddings (`data/lenny_embeddings.npz`)
- Lenny's episode metadata (`data/lenny_metadata.json`)
- Lenny's transcripts (`data/lenny-transcripts/` - too large for git, can be cloned separately)

### 🛡️ Database Isolation

**Schema Design:**
- **`source_type` column** — Distinguishes data sources:
  - `'user'` — User's chat conversations
  - `'expert'` or `'lenny'` — Lenny's podcast episodes
  - `'both'` — Entities mentioned in both sources

**RLS Policies:**
- **Per-instance, not multi-tenant** — Each user runs their own Supabase instance
- **Full access within instance** — RLS policies use `USING (true)` because each instance is user-specific
- **No cross-user access** — Impossible because each user has their own Supabase project

**Last Updated:** 2026-01-20  
**Verified By:** Code review of `.gitignore`, database schema, and environment variable usage
