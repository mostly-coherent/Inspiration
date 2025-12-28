# Inspiration — Plan

> **Purpose:** Refactor Inspiration into a self-contained, open-source app that any Cursor user can use to extract ideas and insights from their chat history.

---

## Vision

**One-liner:** Turn your Cursor AI conversations into actionable ideas and shareable insights.

**Target Users:**
- Builders using Cursor who want to reflect on patterns in their AI-assisted work
- PMs/developers who want to generate content (social media posts, idea briefs) from their coding sessions
- Anyone exploring agentic workflows who wants to capture learnings

---

## Requirements

### Core Features

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| C1 | **Idea Generation** | Extract prototype/tool ideas from Cursor chat history | ✅ Done |
| C2 | **Insight Generation** | Extract social media-worthy insights from Cursor chat history | ✅ Done |
| C3 | **Cross-Platform Cursor DB** | Auto-detect Cursor database on macOS, Windows, Linux | ✅ Done |
| C4 | **Idea Bank** | Harmonize ideas into a deduplicated bank with occurrence tracking | ✅ Done |
| C5 | **Insight Bank** | Harmonize insights into a deduplicated bank with occurrence tracking | ✅ Done |
| C6 | **Setup Wizard** | First-run + anytime configuration of workspaces, API keys, features | ✅ Done |
| C7 | **Preset Modes** | Daily/Sprint/Month/Quarter presets with sensible defaults | ✅ Done |
| C8 | **Advanced Mode** | Custom days, date range, candidates, temperature | ✅ Done |
| C9 | **Progress UI** | Real-time progress, elapsed time, stop button | ✅ Done |
| C10 | **Results Display** | Rendered markdown output with formatted/raw toggle | ✅ Done |
| C11 | **Reverse Match** | Search chat history for user-provided insights/ideas | ✅ Done |
| C12 | **Abort Signal Support** | STOP button properly kills Python processes on cancel | ✅ Done |
| C13 | **Vector DB Search** | Supabase pgvector backend for massive (>2GB) chat histories | ✅ Done |

### Power User Features (Optional, Configurable)

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| P1 | **Social Media Sync** | Check if insights have been shared in posts folder | ✅ Done |
| P2 | **Solved Status Sync** | Check if ideas are tackled by projects in workspace | ✅ Done |
| P3 | **Voice Profile** | Multi-file voice/style configuration for authentic generation | ✅ Done |

### Voice Profile System

The voice profile captures the user's authentic writing style through:

| Component | Purpose | File Type |
|-----------|---------|-----------|
| **Author Name** | Name used in prompts | Config value |
| **Author Context** | Brief role/background (e.g., "PM who codes agentically") | Config value |
| **Golden Examples** | Folder of actual social posts to study | Directory of .md files |
| **Voice Guide** | Explicit rules: words to use/avoid, style preferences | Single .md file |

The engine combines these into a comprehensive system prompt that helps Claude match the user's authentic voice.

### LLM Support

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| L1 | **Anthropic Claude** | Primary LLM (Claude Sonnet 4) | ✅ Done |
| L2 | **OpenAI Fallback** | GPT-4o as fallback if Anthropic unavailable | ✅ Done |
| L3 | **Model Selection** | Let user choose model in settings | ✅ Done |

### UX/Polish

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| U1 | **Beautiful README** | Quick-start guide with screenshots/GIFs | ✅ Done |
| U2 | **One-Command Setup** | `npm install && pip install -r requirements.txt` | ✅ Done |
| U3 | **Settings Page** | UI to configure workspaces, features, API keys | ✅ Done |
| U4 | **Bank Viewer** | View Idea Bank and Insight Bank in the UI | ✅ Done |
| U5 | **Export to Markdown** | Download ideas/insights as standalone .md files | ✅ Done |

---

## MVP: Chat History Search Across All Workspaces

**Requirement:** All three features (Generate Insights, Generate Ideas, Reverse Match) must search through chat history **regardless of workspace and LLM** (both Composer and regular chats). This is a **NON-NEGOTIABLE MVP**.

**Status:** ✅ IMPLEMENTED

**Implementation Details:**
1.  **Unified Search:** `insights.py`, `ideas.py`, and `reverse_match.py` now explicitly pass `workspace_paths=None` to query the entire database.
2.  **Bubble Extraction:** Core logic in `cursor_db.py` updated to handle Cursor's "Bubble" architecture, extracting messages from fragmented `bubbleId` entries in `cursorDiskKV`.
3.  **Vector Acceleration:** For large datasets (>100MB), the system now seamlessly offloads search to Supabase pgvector.

---

## Architecture

### Target (Self-Contained)

```
inspiration/
├── src/
│   ├── app/
│   │   ├── page.tsx              ← Main UI
│   │   ├── settings/page.tsx     ← Settings/wizard UI
│   │   └── api/
│   │       ├── generate/route.ts ← Calls engine
│   │       ├── config/route.ts   ← Read/write config
│   │       └── banks/route.ts    ← Read banks
│   └── lib/
│       ├── types.ts
│       └── config.ts             ← Config utilities
├── engine/                       ← Python engine
│   ├── ideas.py
│   ├── insights.py
│   ├── common/
│   │   ├── cursor_db.py          ← Cross-platform DB extraction (SQLite)
│   │   ├── vector_db.py          ← Supabase pgvector integration (NEW)
│   │   ├── llm.py                ← Anthropic + OpenAI wrapper
│   │   ├── config.py             ← User config loader
│   │   └── bank.py               ← Bank harmonization
│   └── scripts/                  ← Vector DB management (NEW)
│       ├── index_all_messages.py
│       ├── sync_messages.py
│       └── init_vector_db.sql
├── data/                         ← User data (gitignored)
│   ├── config.json               ← User configuration
│   ├── idea_bank.json
│   ├── insight_bank.json
│   └── vector_db_sync_state.json
```

---

## Configuration Schema

```json
{
  "version": 1,
  "setupComplete": true,
  "workspaces": [
    "/path/to/workspace-a",
    "/path/to/workspace-b"
  ],
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "fallbackProvider": "openai",
    "fallbackModel": "gpt-4o"
  },
  "features": {
    "linkedInSync": {
      "enabled": true,
      "postsDirectory": "/path/to/posts"
    },
    "solvedStatusSync": {
      "enabled": true
    },
    "customVoice": {
      "enabled": false,
      "filePath": null
    }
  },
  "ui": {
    "defaultTool": "insights",
    "defaultMode": "sprint"
  }
}
```

---

## 🎯 NEXT FOCUS

**Priority:** Maintain stability & monitor Vector DB syncing.

**Current Status:**
- Phase 1-7 complete.
- Vector DB architecture implemented and indexing.
- Critical NFRs (caching, parallel processing) active.

**Next Steps:**
1. ✅ Monitor the initial indexing of the 2.1GB dataset.
2. ✅ Verify incremental sync works for daily updates.
3. Optional: Add a "Last Sync" indicator in the UI.

---

**Last Updated:** 2025-12-28
