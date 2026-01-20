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
│                      │  Items Bank  │     │  Cursor DB   │                  │
│                      │  (Library)   │     │  (SQLite)    │                  │
│                      └──────────────┘     └──────────────┘                  │
│                            │              ┌──────────────┐                  │
│                            │              │ Claude Code  │                  │
│                            │              │   (JSONL)    │                  │
│                            │              └──────────────┘                  │
│                            ▼                                                │
│                      ┌──────────────┐                                       │
│                      │Lenny Archive │ (Pre-computed embeddings)             │
│                      │ (280+ eps)   │ NPZ + JSON, local search              │
│                      └──────────────┘                                       │
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

## Multi-Source Chat History Architecture

### Overview

Inspiration supports multiple AI coding assistant sources with automatic detection and unified storage:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MULTI-SOURCE EXTRACTION                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐                 ┌──────────────────┐         │
│  │   Cursor (SQLite) │                 │ Claude Code (JSONL)│         │
│  │                  │                 │                  │         │
│  │  Mac/Windows:    │                 │  Mac/Windows:    │         │
│  │  ~/Library/...   │                 │  ~/.claude/      │         │
│  │  %APPDATA%/...   │                 │  projects/       │         │
│  └────────┬─────────┘                 └────────┬─────────┘         │
│           │                                    │                   │
│           │   ┌────────────────────┐           │                   │
│           └──▶│ Source Detector    │◀──────────┘                   │
│               │ (Auto-detects both)│                               │
│               └─────────┬──────────┘                               │
│                         │                                          │
│           ┌─────────────┴─────────────┐                            │
│           ▼                           ▼                            │
│  ┌────────────────┐          ┌────────────────┐                   │
│  │ cursor_db.py   │          │claude_code_db.py│                   │
│  │                │          │                │                   │
│  │ • Bubble format│          │ • JSONL parser │                   │
│  │ • SQLite query │          │ • Subagent msgs│                   │
│  │ • Composer data│          │ • CWD matching │                   │
│  └────────┬───────┘          └────────┬───────┘                   │
│           │                           │                            │
│           └────────┬──────────────────┘                            │
│                    ▼                                               │
│          ┌──────────────────┐                                      │
│          │ sync_messages.py │                                      │
│          │                  │                                      │
│          │ • Per-source sync│                                      │
│          │ • Unified pipeline│                                     │
│          └────────┬─────────┘                                      │
│                   ▼                                                │
│          ┌──────────────────┐                                      │
│          │ Unified Vector DB │                                      │
│          │                  │                                      │
│          │ • source column  │                                      │
│          │ • source_detail  │                                      │
│          │ • embeddings     │                                      │
│          └──────────────────┘                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Source Detection

**Files:** `engine/common/source_detector.py`

Auto-detects available sources on user's system:

| Source | Format | macOS Location | Windows Location |
|--------|--------|---------------|------------------|
| **Cursor** | SQLite | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` | `%APPDATA%/Cursor/User/globalStorage/state.vscdb` |
| **Claude Code** | JSONL | `~/.claude/projects/{workspace}/{session}.jsonl` | `%APPDATA%/Claude/projects/{workspace}/{session}.jsonl` |

**Detection Logic:**
```python
sources = detect_sources()  # Returns list of ChatSource objects
print_detection_report(sources)  # User-friendly summary

# Example output:
# ✅ Cursor
#    Location: /Users/user/Library/.../state.vscdb
#    Format:   sqlite
# ✅ Claude Code
#    Location: /Users/user/.claude/projects
#    Format:   jsonl
# 📊 Total sources: 2
```

### Extraction Modules

#### Cursor Extraction (`engine/common/cursor_db.py`)

- **Format:** SQLite database with "Bubble" message architecture
- **Challenge:** Messages fragmented across `composerData` and `bubbleId` keys
- **Extraction:** Multi-strategy approach with fallback patterns
- **Output:** Unified message format with timestamps, workspace, metadata

#### Claude Code Extraction (`engine/common/claude_code_db.py`)

- **Format:** JSONL (one JSON event per line)
- **Structure:** `{type, message, timestamp, uuid, sessionId, cwd, gitBranch, ...}`
- **Features:**
  - Parses main session + subagent files
  - Handles workspace path mismatches (directory encoding vs. actual CWD)
  - Error recovery (malformed JSON, missing timestamps)
- **Output:** Same unified message format as Cursor

**Key Innovation — Workspace Matching:**
```python
# Claude Code directory: "-Users-username-Personal-Workspace"
# Actual workspace (cwd): "/Users/username/Personal Workspace"
# Solution: Extract actual workspace from message metadata (cwd field)
actual_workspace = messages[0]["metadata"].get("cwd")  # Use this, not directory name
```

### Unified Sync Pipeline

**File:** `engine/scripts/sync_messages.py`

**Per-Source Sync State:**
```json
{
  "sources": {
    "cursor": {
      "last_sync_timestamp": 1234567890000,
      "messages_indexed": 1000
    },
    "claude_code": {
      "last_sync_timestamp": 9876543210000,
      "messages_indexed": 500
    }
  }
}
```

**Sync Flow:**
```
1. Detect available sources (detect_sources())
2. For each source:
   a. Get last sync timestamp
   b. Extract new conversations (cursor_db or claude_code_db)
   c. Generate embeddings
   d. Index to Vector DB with source attribution
   e. Update sync state
3. Return stats: "Cursor: X indexed | Claude Code: Y indexed"
```

### Vector DB Schema

**Table:** `cursor_messages`

| Column | Type | Purpose |
|--------|------|---------|
| `message_id` | TEXT | Unique ID (prefixed with source: `cursor:{hash}` or `claude_code:{uuid}`) |
| `text` | TEXT | Message content |
| `timestamp` | BIGINT | Unix timestamp (milliseconds) |
| `workspace` | TEXT | Workspace path |
| `chat_id` | TEXT | Conversation/session ID |
| `chat_type` | TEXT | "composer_chat" or "claude_code_session" |
| `message_type` | TEXT | "user" or "assistant" |
| `source` | TEXT | **NEW:** "cursor" or "claude_code" |
| `source_detail` | JSONB | **NEW:** Source-specific metadata (tokens, git branch, subagent flag, etc.) |
| `embedding` | VECTOR(1536) | OpenAI embedding for semantic search |
| `indexed_at` | TIMESTAMPTZ | When this message was indexed |

**RPC Function:** `search_cursor_messages(..., source_filter)`

Supports optional source filtering for targeted queries.

### Configuration

**File:** `engine/common/config.py`

```json
{
  "messageSources": {
    "cursor": {
      "enabled": true,
      "autoDetect": true
    },
    "claudeCode": {
      "enabled": true,
      "autoDetect": true
    }
  }
}
```

### Frontend Integration

**Source Breakdown Display:**
- **Component:** `ScoreboardHeader.tsx`
- **API:** `/api/brain-stats/sources` → `{cursor: X, claudeCode: Y}`
- **UI:** Shows "Cursor: 1,234 | Claude Code: 567" in Memory stats

**Sync Output:**
- **API:** `/api/sync` → Parses multi-source output
- **Format:** `"Cursor: X indexed, Y skipped | Claude Code: A indexed, B skipped"`

### Fast Start Integration (Updated 2026-01-14)

**Combined Metrics in `estimate_db_metrics()`:**
- Cursor DB: SQLite query counts `composerData:*` and `chatData:*` entries
- Claude Code: Counts JSONL session files in `~/.claude/projects/`
- Combined total shown in onboarding: "1,089 Cursor + 38 Claude Code conversations"

**Date Span Calculation Fix:**
- Uses `ORDER BY RANDOM() LIMIT 200` for representative sampling
- Ensures date range reflects oldest to newest conversations (not just recent)
- Example: "177 days" instead of incorrectly showing "73 days"

**Size Display:**
- Combined size from both sources
- Auto-converts to GB when > 1000MB: "3.4 GB" instead of "3396 MB"

### Backward Compatibility

- Existing messages without `source` field → Default to `source='cursor'`
- Migration SQL is idempotent (safe to run multiple times)
- No breaking changes to existing APIs

---

## Lenny's Podcast Integration Architecture

### Overview

280+ expert podcast episodes from Lenny's Podcast, pre-indexed and searchable. Provides expert validation for user's themes in the Theme Explorer.

**Key Design Decision:** Pre-computed embeddings are **hosted on GitHub Releases** (not in repo due to 219MB size limit). For cloud deployments, **Supabase Storage** is used as primary source (faster, 5-10s) with GitHub Releases as fallback (30-60s). Local development downloads automatically via `scripts/download-lenny-embeddings.sh`.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LENNY'S PODCAST INTEGRATION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │ GitHub Repo      │     │ Transcript       │     │ Local Indexer    │    │
│  │ (ChatPRD/lennys) │────▶│ Parser           │────▶│ (Embeddings)     │    │
│  │                  │     │                  │     │                  │    │
│  │ 280+ episodes    │     │ YAML frontmatter │     │ OpenAI API       │    │
│  │ Rich metadata    │     │ Speaker chunks   │     │ text-embedding   │    │
│  └──────────────────┘     └──────────────────┘     └──────────────────┘    │
│           │                                               │                │
│           │  git pull                                     ▼                │
│           ▼                                      ┌──────────────────┐      │
│  ┌──────────────────┐                            │ GitHub Releases  │      │
│  │ data/lenny-      │                            │ v1.0.0-lenny     │      │
│  │ transcripts/     │                            │                  │      │
│  │ (GITIGNORED)     │                            │ • lenny_embeddi..│      │
│  └──────────────────┘                            │   .npz (219MB)   │      │
│                                                  │   [DOWNLOAD]     │      │
│                                                  │ • lenny_metadata │      │
│                                                  │   .json (28MB)   │      │
│                                                  │   [DOWNLOAD]     │      │
│                                                  └────────┬─────────┘      │
│                                                           │                │
│                                                   download-lenny-          │
│                                                   embeddings.sh            │
│                                                           │                │
│                                                           ▼                │
│                                                  ┌──────────────────┐      │
│                                                  │ data/ (local)    │      │
│                                                  │ lenny_embeddings │      │
│                                                  │ lenny_metadata   │      │
│                                                  │ (GITIGNORED)     │      │
│                                                  └────────┬─────────┘      │
│                                                           │                │
│           ┌───────────────────────────────────────────────┘                │
│           ▼                                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        SEARCH FLOW                                   │  │
│  │                                                                      │  │
│  │  Theme Explorer    /api/expert-       lenny_search.py    NumPy       │  │
│  │  (Patterns Tab) ──▶ perspectives ──▶ search_lenny_    ──▶ cosine     │  │
│  │  (Counter Tab)     GET ?theme=X      archive()            similarity │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Storage Strategy

| File | Size | Git Status | Purpose |
|------|------|------------|---------|
| `data/lenny-transcripts/` | ~25MB | **GITIGNORED** | Raw transcript source (cloned repo) |
| `data/lenny_embeddings.npz` | ~219MB | **GITIGNORED** | Pre-computed embeddings (local: downloaded from GitHub Releases; cloud: downloaded from Supabase Storage or GitHub) |
| `data/lenny_metadata.json` | ~28MB | **GITIGNORED** | Episode metadata + chunk content (local: downloaded from GitHub Releases; cloud: downloaded from Supabase Storage or GitHub) |

**Download Strategy:**

**Local Development:**
- Downloads from GitHub Releases to `data/` directory
- Auto-downloaded on first run via `scripts/download-lenny-embeddings.sh`
- Zero setup required

**Cloud Deployments (Vercel/Railway):**
- **Primary:** Supabase Storage bucket `lenny-embeddings` (5-10s download, requires one-time setup)
- **Fallback:** GitHub Releases (30-60s download, no setup needed)
- Files stored in `/tmp/lenny-embeddings/` (ephemeral, persists during warm function invocations)

**Why Not in Git?**
- Files too large for Git (219MB + 28MB = 247MB total, exceeds GitHub's 100MB file limit)
- No OpenAI API cost for first-time indexing ($0.20+)
- Instant "time to value" — expert perspectives appear immediately after one-time download

**Cloud Setup (Optional):** Upload embeddings to Supabase Storage for faster cloud downloads:
1. Create bucket `lenny-embeddings` (public, 500MB limit)
2. Upload `lenny_embeddings.npz` (~219MB) and `lenny_metadata.json` (~28KB)
3. Cloud deployments automatically prefer Supabase Storage over GitHub Releases

### Data Schema

**Episode Metadata:**
```json
{
  "id": "brian-chesky",
  "filename": "brian-chesky/transcript.md",
  "guest_name": "Brian Chesky",
  "title": "Brian Chesky on Designing a 10-Star Experience",
  "youtube_url": "https://youtube.com/watch?v=...",
  "video_id": "...",
  "description": "...",
  "duration": "1:23:45",
  "duration_seconds": 5025,
  "view_count": 500000,
  "word_count": 15000,
  "chunk_count": 45,
  "format": "github"
}
```

**Chunk Metadata:**
```json
{
  "idx": 0,
  "episode_id": "brian-chesky",
  "speaker": "Brian Chesky",
  "timestamp": "00:05:30",
  "content": "The actual quote text...",
  "word_count": 250
}
```

### Key Files

| File | Purpose |
|------|---------|
| `engine/common/lenny_parser.py` | Parse transcripts (YAML frontmatter + markdown), split into chunks |
| `engine/common/lenny_search.py` | NumPy-based cosine similarity search over embeddings (checks `/tmp` first for cloud, then `data/` for local) |
| `engine/scripts/index_lenny_local.py` | Re-index if transcripts updated (incremental via file hashing) |
| `src/app/api/lenny-download/route.ts` | Download API (Supabase Storage primary, GitHub Releases fallback, local filesystem for dev) |
| `src/app/api/lenny-stats/route.ts` | GET stats (episode count, chunk count, indexed date) |
| `src/app/api/lenny-sync/route.ts` | POST to git pull + re-index |
| `src/app/api/expert-perspectives/route.ts` | GET search results for a theme |

### Sync Flow

**Automatic (on Memory refresh):**
```
User clicks "Refresh Memory"
    ↓
ScoreboardHeader.tsx → POST /api/sync (Memory sync)
    ↓
After Memory sync completes:
    ↓
Auto-trigger: POST /api/lenny-sync
    ↓
1. Check if running in cloud (skip if Vercel)
2. git pull origin main (data/lenny-transcripts/)
3. If new files detected:
   a. Run index_lenny_local.py
   b. Update lenny_embeddings.npz
   c. Update lenny_metadata.json
4. Clear embedding cache
    ↓
UI shows: "✓ Synced 5 new episodes"
```

**Manual (sync button):**
- Click 🔄 button next to "280 expert episodes" in Scoreboard
- Same flow as above

### Search Performance

| Operation | Time | Cost |
|-----------|------|------|
| Load embeddings (first call) | ~200ms | $0 |
| Load embeddings (cached) | ~5ms | $0 |
| Embed query | ~100ms | ~$0.0001 |
| NumPy cosine similarity (44K vectors) | ~20ms | $0 |
| **Total search time** | **~300ms** | **~$0.0001** |

### UI Integration

**Theme Explorer — Patterns Tab:**
- When viewing a theme's synthesis, "Expert Perspectives" section shows
- Fetches: `GET /api/expert-perspectives?theme={theme_description}&topK=3`
- Displays: Quote, guest name, episode title, YouTube link

**Theme Explorer — Counter-Intuitive Tab:**
- For each counter-intuitive suggestion, fetches expert challenges
- Shows quotes from experts who have discussed similar contrarian ideas

**ScoreboardHeader:**
- Shows "🎙️ 280 expert episodes" badge
- Sync button for manual Lenny archive update
- Status message after sync ("✓ Up to date" or "✓ Synced N episodes")

---

## Directory Structure

```
inspiration/
├── src/
│   ├── app/                    # Next.js 15 App Router
│   │   ├── page.tsx            # Main page (orchestrates components)
│   │   ├── layout.tsx          # Root layout (ErrorBoundary, skip links)
│   │   ├── onboarding/page.tsx # Full setup wizard (API Keys + Sync)
│   │   ├── onboarding-fast/page.tsx # Fast Start wizard (~90s Theme Map)
│   │   ├── theme-map/page.tsx  # Theme Map viewer (accessible from header)
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
│   ├── generate_themes.py      # Theme Map generation (Fast Start)
│   ├── common/                 # Shared Python utilities
│   │   ├── cursor_db.py        # Cursor DB extraction (SQLite + Bubble logic)
│   │   ├── claude_code_db.py   # Claude Code extraction (JSONL parsing)
│   │   ├── source_detector.py  # Auto-detect available chat sources
│   │   ├── lenny_parser.py     # Parse Lenny transcripts (YAML + markdown)
│   │   ├── lenny_search.py     # NumPy-based Lenny archive search
│   │   ├── vector_db.py        # Supabase pgvector integration
│   │   ├── llm.py              # Anthropic + OpenAI wrapper
│   │   ├── config.py           # User config loader
│   │   ├── items_bank.py       # Unified ItemsBank harmonization
│   │   ├── items_bank_supabase.py # Supabase-backed ItemsBank
│   │   ├── prompt_compression.py # Per-conversation compression
│   │   ├── semantic_search.py  # Embedding generation & vector similarity
│   │   └── progress_markers.py # Progress streaming & performance logging
│   ├── scripts/                # Utility scripts
│   │   ├── index_all_messages.py # One-time Vector DB indexer
│   │   ├── sync_messages.py    # Incremental Vector DB sync
│   │   ├── init_vector_db.sql  # Supabase schema setup
│   │   └── clear_bank.py       # Clear ItemsBank utility
│   ├── scripts/                # Utility scripts
│   │   ├── index_all_messages.py # One-time Vector DB indexer
│   │   ├── sync_messages.py      # Incremental Vector DB sync
│   │   ├── index_lenny_local.py  # Lenny archive indexer (embeddings)
│   │   └── init_vector_db.sql    # Supabase schema setup
│   └── prompts/                # LLM prompt templates
│       ├── base_synthesize.md  # Shared prompt base (common rules)
│       ├── insights_synthesize.md # Insights-specific prompt
│       ├── ideas_synthesize.md    # Ideas-specific prompt
│       ├── use_case_synthesize.md # Use case synthesis prompt
│       └── judge.md            # Reranking judge prompt
└── data/                       # User data
    ├── config.json             # User configuration (gitignored)
    ├── items_bank.json         # Unified Library storage (gitignored)
    ├── themes.json             # Theme/Mode configuration (gitignored)
    ├── vector_db_sync_state.json # Sync state tracking (gitignored)
    ├── lenny_embeddings.npz    # Pre-computed Lenny embeddings (GITIGNORED, downloaded from GitHub Releases ~219MB)
    ├── lenny_metadata.json     # Lenny episode/chunk metadata (GITIGNORED, downloaded from GitHub Releases ~28MB)
    └── lenny-transcripts/      # Cloned Lenny repo (gitignored)
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
| `DebugReportButton` | Copy diagnostic info | `variant`, `className` |
| `DebugReportSection` | Troubleshooting section | None |

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

**4. Theme Explorer Context** (`themes/page.tsx`) — LIB-8: Theme Synthesis
- **Purpose**: Pattern discovery via dynamic similarity grouping (forest → trees zoom)
- **Boundaries**: Adjust zoom → Filter by type → View themes → Click theme → See AI synthesis
- **State**: `themes`, `zoomLevel`, `itemTypeFilter`, `selectedTheme`, `synthesis`, `isLoading`
- **API**: `/api/items/themes/preview`, `/api/items/themes/synthesize`
- **Status**: ✅ Complete (1/3 of Longitudinal Intelligence — LIB-9, LIB-10 pending)

**5. Settings Context** (`settings/page.tsx`, `AdvancedConfigSection`)
- **Purpose**: Configure all app settings
- **Boundaries**: Tab navigation → Edit settings → Save config
- **State**: `config`, `activeTab`, form states
- **API**: `/api/config`, `/api/modes`, `/api/prompts`

**6. Onboarding Context** (`onboarding/page.tsx`, `onboarding-fast/page.tsx`)
- **Purpose**: New user setup wizard (two paths: Fast Start ~90s, Full Setup ~2min)
- **Boundaries**: 
  - Fast Start: Welcome → API Key → Generate Theme Map
  - Full Setup: Welcome → API Keys → Sync → Complete
- **State**: `step`, `apiKeys`, `syncStatus`, `themeMap`, `dbMetrics`
- **API**: `/api/config/env`, `/api/config`, `/api/sync`, `/api/generate-themes`, `/api/theme-map`

**6b. Theme Map Context** (`theme-map/page.tsx`)
- **Purpose**: View and regenerate saved Theme Map (accessible from main app header)
- **Boundaries**: Display themes → Regenerate → Navigate to full app
- **State**: `themeMap`, `savedAt`, `regenerating`
- **API**: `/api/theme-map`, `/api/generate-themes`, `/api/config`

**7. Scoreboard Context** (`ScoreboardHeader`)
- **Purpose**: Always-visible Memory + Library status
- **Boundaries**: Display stats → Sync action → Navigate to Library/Theme Explorer
- **State**: `memoryStats`, `libraryStats`, `isSyncing`
- **API**: `/api/brain-stats`, `/api/items`, `/api/sync`

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

**API Client Organization (Updated 2026-01-14):**
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
├── brain-stats/               # Memory stats
│   ├── route.ts               # Memory stats endpoint
│   └── sources/route.ts       # Per-source breakdown (Cursor vs Claude Code)
├── brain-diagnostics/route.ts # Diagnostics endpoint
├── generate-themes/route.ts   # Fast Start Theme Map generation
├── theme-map/route.ts         # Theme Map persistence (GET/POST/DELETE)
├── debug-report/route.ts      # Diagnostic report for troubleshooting
├── chat-history/route.ts      # Chat history endpoint
├── harmonize/route.ts         # Item harmonization
├── modes/route.ts             # Mode management
├── prompts/route.ts           # Prompt templates
├── synthesis-prompts/route.ts # Synthesis prompt templates
├── themes/                    # Themes config & features
│   ├── route.ts               # Themes config CRUD
│   ├── counter-intuitive/     # Counter-intuitive suggestions
│   │   ├── route.ts           # Get suggestions
│   │   └── save/route.ts      # Save reflections
│   └── unexplored/route.ts    # Unexplored territory detection
├── unexplored/                # Unexplored topic management
│   ├── dismiss/route.ts       # Dismiss unexplored topic
│   └── enrich/route.ts        # Enrich unexplored topic
├── lenny-stats/route.ts       # Lenny archive statistics (NEW)
├── lenny-sync/route.ts        # Lenny git pull + re-index (NEW)
├── expert-perspectives/route.ts # Search Lenny for expert quotes (NEW)
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
| **Lenny Embeddings** | Local NumPy (.npz) | 12K vectors easily handled locally; no cloud cost; works offline |
| **Lenny Embeddings Git** | Downloaded from GitHub Releases | Too large for Git (247MB); auto-download on first run; zero-setup after download |
| **Multi-Source** | Cursor + Claude Code | Users may use both tools; unified Memory merges both sources |

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

**Last Updated:** 2026-01-14 (Lenny's Podcast Integration Architecture, Multi-Source improvements)

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

---

## Knowledge Graph Architecture (v6-v7)

> **Complete Specification:** See `KNOWLEDGE_GRAPH_ARCHITECTURE.md` for full technical details
> **Build Plan:** See `KNOWLEDGE_GRAPH_BUILD_PLAN.md` for phase-by-phase implementation tracking

### Vision

Transform Inspiration from "find patterns in conversations" to "understand connections in your thinking"—enabling multi-hop reasoning, evolution tracking, and cross-project insights.

**Shift:** From "what's similar?" to "how does it connect?"

### Core Concepts

| Concept | Definition | Example |
|---------|------------|---------|
| **Entity** | A distinct concept extracted from conversations | "React Server Components", "caching", "auth flow" |
| **Entity Type** | Category of entity | tool, pattern, problem, concept, person, project, workflow |
| **Relation** | Named connection between entities | SOLVES, CAUSES, ENABLES, PART_OF, USED_WITH |
| **Mention** | Instance where entity appears in conversation | Message ID + timestamp + context snippet |
| **Entity Cluster** | Group of semantically similar entities (deduplication) | "RSC", "React Server Components", "server components" → single entity |

### Data Model

**Tables:**
- `kg_entities` — Unique entities with embeddings, aliases, mention counts
- `kg_relations` — Relationships between entities with evidence snippets
- `kg_entity_mentions` — Links entities to specific messages
- `kg_entity_items` — Links entities to Library items
- `kg_user_corrections` — User feedback on extraction

**Entity Types:**
- `tool` — Technologies, frameworks, libraries (React, Supabase, Prisma)
- `pattern` — Design patterns, architectural patterns (caching, retry logic)
- `problem` — Issues, bugs, challenges (auth timeout, race condition)
- `concept` — Abstract ideas, principles (DRY, composition over inheritance)
- `person` — People mentioned (Lenny, Dan Abramov, team members)
- `project` — Projects, codebases, repos (Inspiration, dad-aura)
- `workflow` — Processes, methodologies (TDD, code review, pair programming)

**Relation Types:**
- `SOLVES` — tool/pattern SOLVES problem
- `CAUSES` — problem CAUSES problem (cascade)
- `ENABLES` — pattern/tool ENABLES capability
- `PART_OF` — entity is component of larger entity
- `USED_WITH` — entities commonly used together
- `ALTERNATIVE_TO` — entities serve similar purpose
- `REQUIRES` — entity depends on another
- `IMPLEMENTS` — pattern/tool IMPLEMENTS concept
- `MENTIONED_BY` — person MENTIONED entity (expert attribution)

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        KNOWLEDGE GRAPH PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐                  │
│  │   Cursor    │────▶│   Entity     │────▶│   Entity     │                  │
│  │  Messages   │     │  Extractor   │     │ Deduplicator │                  │
│  └─────────────┘     └──────────────┘     └──────────────┘                  │
│        │                   │                    │                           │
│        │                   ▼                    ▼                           │
│        │             ┌──────────────┐     ┌──────────────┐                  │
│        │             │  Relation    │     │  kg_entities │                  │
│        │             │  Extractor   │────▶│  (Supabase)  │                  │
│        │             └──────────────┘     └──────────────┘                  │
│        │                   │                    ▲                           │
│        │                   ▼                    │                           │
│        │             ┌──────────────┐           │                           │
│        │             │kg_relations  │───────────┘                           │
│        │             │  (Supabase)  │                                       │
│        │             └──────────────┘                                       │
│        │                                                                    │
│        └──────────────────────────────────────────────────────────────────▶│
│                                                                             │
│                      ┌──────────────┐                                       │
│                      │kg_entity_    │                                       │
│                      │  mentions    │                                       │
│                      │  (Supabase)  │                                       │
│                      └──────────────┘                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        KNOWLEDGE GRAPH UI                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐                  │
│  │   Entity    │────▶│   Graph      │────▶│  Evolution   │                  │
│  │  Explorer   │     │    View      │     │   Timeline   │                  │
│  └─────────────┘     └──────────────┘     └──────────────┘                  │
│        │                   │                    │                           │
│        ▼                   ▼                    ▼                           │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐                  │
│  │ /entities   │     │   /graph     │     │Intelligence  │                  │
│  │   page      │     │    page      │     │    Panel     │                  │
│  └─────────────┘     └──────────────┘     └──────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Extraction Pipeline

**1. Entity Extraction (`engine/common/entity_extractor.py`)**
- LLM-based extraction using GPT-4o-mini
- Structured JSON output with confidence scoring
- Blacklist for common uninteresting terms (KG_SKIP_LIST)
- Cost: ~$0.01 per 1000 messages

**2. Entity Deduplication (`engine/common/entity_deduplicator.py`)**
- **Exact match:** Lowercase comparison
- **Alias match:** Check against known aliases
- **Embedding similarity:** Cosine > 0.85 → candidate merge
- Automatic alias addition for near-duplicates

**3. Relation Extraction (`engine/common/relation_extractor.py`)**
- LLM-based extraction using GPT-4o-mini
- Handles multiple JSON response formats
- 30s timeout, improved error handling
- Relation type mapping (e.g., "USES" → "USED_WITH")

**4. Indexing (`engine/scripts/index_entities.py`)**
- CLI with `--dry-run`, `--limit`, `--with-relations`, `--verbose` flags
- Batch processing with progress reporting
- Incremental mode (skips already-processed messages)
- Saves entities, mentions, and relations to Supabase

### Query Patterns

**Graph Traversal (PostgreSQL CTEs):**
```sql
-- Find all tools that SOLVE a specific problem
WITH RECURSIVE tool_chain AS (
  SELECT e.id, e.canonical_name, r.relation_type, 1 as depth
  FROM kg_entities e
  JOIN kg_relations r ON e.id = r.source_entity_id
  WHERE r.target_entity_id = :problem_id
    AND r.relation_type = 'SOLVES'
  
  UNION ALL
  
  SELECT e.id, e.canonical_name, r.relation_type, tc.depth + 1
  FROM kg_entities e
  JOIN kg_relations r ON e.id = r.source_entity_id
  JOIN tool_chain tc ON r.target_entity_id = tc.id
  WHERE tc.depth < 5
)
SELECT * FROM tool_chain;
```

**Temporal Analysis (RPC Functions):**
- `get_entity_evolution()` — Single entity timeline
- `get_entities_evolution()` — Multi-entity comparison
- `get_trending_entities()` — Trending with trend score
- `get_kg_activity_timeline()` — Overall activity

**Intelligence Features (RPC Functions):**
- `detect_problem_solution_patterns()` — Recurring problem+solution pairs
- `detect_missing_links()` — Co-occurring entities without relations
- `find_entity_path()` — Shortest path between entities (max 5 hops)
- `find_entity_clusters()` — Entity clustering

### API Endpoints

| Endpoint | Purpose | Key Features |
|----------|---------|--------------|
| `/api/kg/stats` | KG statistics | Total entities, mentions, breakdown by type |
| `/api/kg/entities` | Entity list | Filtering by type, sorting, search by name |
| `/api/kg/relations` | Relations for entity | Incoming/outgoing relations with evidence |
| `/api/kg/subgraph` | Graph data | Centered or top entities with relations |
| `/api/kg/evolution` | Temporal analysis | Trending, activity, entity timeline, comparison |
| `/api/kg/intelligence` | Intelligence features | Patterns, missing links, path finding, clusters |

### UI Components

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| `EntityExplorer` | Browse entities | Filter by type, search, sort, detail panel |
| `GraphView` | Interactive graph | Force-directed layout, node click, zoom |
| `EvolutionTimeline` | Temporal analysis | Trending entities, activity chart, timeline |
| `IntelligencePanel` | Intelligence features | Pattern alerts, missing links, path finding |

### Performance Considerations

**Current Approach (PostgreSQL CTEs):**
- Suitable for < 100k entities
- Graph queries use recursive CTEs
- Indexes on entity_type, mention_count, last_seen
- HNSW index on embeddings for similarity search

**Future Scaling (Neo4j):**
- Migrate to Neo4j if > 100k entities
- Native graph traversal (faster than CTEs)
- Cypher queries for complex patterns
- Keep PostgreSQL for entity metadata

### Cost Estimation

**Full Backfill (10k messages):**
- Entity extraction: ~$10-15 (GPT-4o-mini)
- Relation extraction: ~$5-10 (GPT-4o-mini)
- Embedding generation: ~$1 (text-embedding-3-small)
- **Total:** ~$16-26 for full backfill

**Incremental Updates:**
- ~$0.01 per 100 new messages
- Runs automatically during sync

### Implementation Status

**All Phases Complete (2026-01-15):**
- ✅ Phase 1: Foundation (SQL schema, entity extraction, deduplication, indexing)
- ✅ Phase 2: Entity Explorer UI (browse, filter, search, detail view)
- ✅ Phase 3: Relation Extraction (relation extractor, API, UI integration)
- ✅ Phase 4: Graph View (interactive visualization with react-force-graph-2d)
- ✅ Phase 5: Evolution Timeline (temporal analysis, trending, charts)
- ✅ Phase 6: Intelligence Features (patterns, missing links, path finding)

**v2.0 Status (2026-01-19) — COMPLETE:**

| KG Source | Entities | Relations | Status |
|-----------|----------|-----------|--------|
| Lenny's KG (expert) | 13,878 | 10,898+ | ✅ Complete |
| User's KG (chat) | 1,571 | TBD | ✅ Complete |
| **Total** | **15,449** | **10,898+** | ✅ |

**Multi-Source Architecture:**
- ✅ Dual-KG system (User KG + Lenny's KG)
- ✅ Source filtering APIs (`?source=user`, `?source=lenny`, `?source=all`)
- ✅ Visual source distinction (solid=user, dashed=Lenny, ring=both)
- ✅ KGSourceSelector component for UI toggling
- ✅ SourceBadge for entity cards

**Quality & Performance:**
- ✅ Quality filter threshold: 0.25 (lowered from 0.35)
- ✅ Sponsor ad exclusion (13 regex patterns)
- ✅ HNSW embedding index (~0.08s queries)
- ✅ 79% deduplication rate within each source

**Cross-Source Analysis (2026-01-19):**
- Exact string overlap between KGs: **0 entities**
- Common concept words: **170**
- Conclusion: String-based deduplication deferred (no value)
- Future: Semantic cross-referencing ("Related Expert Insights")

**Next Steps:**
- Phase 3: Schema Evolution (discover types from "other" entities)
- Phase 4: Relationship Grouping (Dynamic Ontology)
- Future: Semantic cross-referencing between KGs

### Related Files

**SQL Schemas:**
- `engine/scripts/init_knowledge_graph.sql` — Core KG schema
- `engine/scripts/add_relations_schema.sql` — Relations schema
- `engine/scripts/add_evolution_schema.sql` — Evolution RPC functions
- `engine/scripts/add_intelligence_schema.sql` — Intelligence RPC functions

**Python Modules:**
- `engine/common/knowledge_graph.py` — Entity/relation type definitions
- `engine/common/entity_extractor.py` — LLM-based entity extraction
- `engine/common/entity_deduplicator.py` — Deduplication logic
- `engine/common/relation_extractor.py` — LLM-based relation extraction

**Indexing Scripts:**
- `engine/scripts/index_entities.py` — CLI indexing script
- `engine/scripts/index_lenny_kg.py` — Lenny-specific KG indexing

**API Routes:**
- `src/app/api/kg/stats/route.ts` — KG stats API
- `src/app/api/kg/entities/route.ts` — Entities API
- `src/app/api/kg/relations/route.ts` — Relations API
- `src/app/api/kg/subgraph/route.ts` — Graph data API
- `src/app/api/kg/evolution/route.ts` — Evolution API
- `src/app/api/kg/intelligence/route.ts` — Intelligence API

**UI Components:**
- `src/components/EntityExplorer.tsx` — Entity browser with source filtering
- `src/components/GraphView.tsx` — Interactive graph with source visual distinction
- `src/components/EvolutionTimeline.tsx` — Temporal analysis component
- `src/components/IntelligencePanel.tsx` — Intelligence features component
- `src/components/KGSourceSelector.tsx` — Multi-source toggle (My KG / Lenny's KG / Combined)
- `src/components/EpisodeQualityReport.tsx` — Per-episode indexing quality stats
- `src/app/entities/page.tsx` — Entity Explorer page with Episodes tab
- `src/app/graph/page.tsx` — Graph View page

**Tests:**
- `e2e/entities.spec.ts` — Entity Explorer E2E tests (7/7 passing)
- `e2e/graph.spec.ts` — Graph View E2E tests (7/7 passing)
- `e2e/evolution.spec.ts` — Evolution Timeline E2E tests (10/10 passing)

<!-- Merged from KNOWLEDGE_GRAPH_ARCHITECTURE.md on 2026-01-15 -->

**Last Updated:** 2026-01-19
