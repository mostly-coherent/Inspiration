# Inspiration — AI Assistant Context

> **Purpose:** Technical context for AI coding assistants working on this project

---

## What This Is

A web UI for extracting ideas and insights from Cursor chat history using Claude Sonnet 4. Now powered by **Supabase Vector DB** for massive scale support (>2GB chat history). **v3** introduces a Library-centric UI where the accumulated items are the core value proposition.

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
- **Theme Explorer** — Interactive theme grouping with LLM-powered synthesis

### New User Onboarding

| Step | What Happens | Required? |
|------|-------------|-----------|
| **1. Welcome** | Detect chat DB size, explain value prop | — |
| **2. API Keys** | Anthropic key required; Supabase optional for < 500MB | ✅ Anthropic |
| **3. Sync** | Index chat history to Vector DB (if Supabase configured) | Auto |
| **4. Theme Explorer** | First "aha moment" — see patterns in thinking | — |

**Testing Onboarding:** Visit `/onboarding?preview=true` to test without resetting data.

**Supabase Requirement Thresholds:**
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
│       ├── generate-stream/ # Streaming generation
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
| `src/app/page.tsx` | Main UI — redirects to onboarding if new user, Theme Explorer hero, Generate actions |
| `src/app/onboarding/page.tsx` | 3-step onboarding wizard (Welcome → API Keys → Sync) |
| `src/app/themes/page.tsx` | Theme Explorer — interactive theme grouping with LLM synthesis |
| `src/app/settings/page.tsx` | Settings wizard (workspaces, VectorDB, voice, LLM, mode settings, features) |
| `src/app/api/config/env/route.ts` | Environment variables API for onboarding |
| `src/app/api/items/themes/synthesize/route.ts` | LLM-powered theme synthesis API |
| `src/components/ModeSettingsManager.tsx` | Mode management UI (create/edit/delete modes) (v1) |
| `src/components/BanksOverview.tsx` | Unified Items/Categories bank viewer (v1) |
| `src/components/ScoreboardHeader.tsx` | Memory + Library stats header (v3) |
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
