# Inspiration — Plan

> **Purpose:** Refactor Inspiration into a self-contained, open-source app that any Cursor user can use to extract ideas and insights from their chat history.

---

## Vision

**One-liner:** Turn your Cursor AI conversations into actionable ideas and shareable insights.

**Target Users:**
- Builders using Cursor who want to reflect on patterns in their AI-assisted work
- PMs/developers who want to generate content (LinkedIn posts, idea briefs) from their coding sessions
- Anyone exploring agentic workflows who wants to capture learnings

---

## Requirements

### Core Features

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| C1 | **Idea Generation** | Extract prototype/tool ideas from Cursor chat history | ✅ Done |
| C2 | **Insight Generation** | Extract LinkedIn-worthy insights from Cursor chat history | ✅ Done |
| C3 | **Cross-Platform Cursor DB** | Auto-detect Cursor database on macOS, Windows, Linux | ✅ Done |
| C4 | **Idea Bank** | Harmonize ideas into a deduplicated bank with occurrence tracking | ✅ Done |
| C5 | **Insight Bank** | Harmonize insights into a deduplicated bank with occurrence tracking | ✅ Done |
| C6 | **Setup Wizard** | First-run + anytime configuration of workspaces, API keys, features | ✅ Done |
| C7 | **Preset Modes** | Daily/Sprint/Month/Quarter presets with sensible defaults | ✅ Done |
| C8 | **Advanced Mode** | Custom days, date range, candidates, temperature | ✅ Done |
| C9 | **Progress UI** | Real-time progress, elapsed time, stop button | ✅ Done |
| C10 | **Results Display** | Rendered markdown output with formatted/raw toggle | ✅ Done |

### Power User Features (Optional, Configurable)

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| P1 | **LinkedIn Sync** | Check if insights have been shared in LinkedIn posts folder | ✅ Done |
| P2 | **Solved Status Sync** | Check if ideas are tackled by projects in workspace | ✅ Done |
| P3 | **Voice Profile** | Multi-file voice/style configuration for authentic generation | ✅ Done |

### Voice Profile System

The voice profile captures the user's authentic writing style through:

| Component | Purpose | File Type |
|-----------|---------|-----------|
| **Author Name** | Name used in prompts | Config value |
| **Author Context** | Brief role/background (e.g., "PM who codes agentically") | Config value |
| **Golden Examples** | Folder of actual LinkedIn posts to study | Directory of .md files |
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

## Architecture

### Current (Personal Setup)

```
Personal Builder Lab/
├── MyPrivateTools/
│   ├── Inspiration/          ← Web UI only
│   ├── MyIdeas/              ← Separate Python project
│   └── MyInsights/           ← Separate Python project
├── MyPrivatePrompts/         ← Personal voice files
└── MyPrivateProfileBuilding/ ← LinkedIn posts
```

### Target (Self-Contained)

```
inspiration/
├── src/
│   ├── app/
│   │   ├── page.tsx              ← Main UI
│   │   ├── settings/page.tsx     ← Settings/wizard UI (NEW)
│   │   └── api/
│   │       ├── generate/route.ts ← Calls engine
│   │       ├── config/route.ts   ← Read/write config (NEW)
│   │       └── banks/route.ts    ← Read banks (NEW)
│   └── lib/
│       ├── types.ts
│       └── config.ts             ← Config utilities (NEW)
├── engine/                       ← Python engine (NEW)
│   ├── ideas.py
│   ├── insights.py
│   ├── common/
│   │   ├── cursor_db.py          ← Cross-platform DB extraction
│   │   ├── llm.py                ← Anthropic + OpenAI wrapper
│   │   ├── config.py             ← User config loader
│   │   └── bank.py               ← Bank harmonization
│   └── prompts/
│       ├── ideas_synthesize.md
│       ├── ideas_judge.md
│       ├── insights_synthesize.md
│       ├── insights_judge.md
│       └── voice_default.md
├── data/                         ← User data (gitignored)
│   ├── config.json               ← User configuration
│   ├── idea_bank.json
│   ├── idea_bank.md
│   ├── insight_bank.json
│   └── insight_bank.md
├── .env.example
├── .gitignore
├── package.json
├── requirements.txt
├── CLAUDE.md
└── README.md
```

---

## Configuration Schema

```json
{
  "version": 1,
  "setupComplete": true,
  "workspaces": [
    "/Users/jmbeh/Personal Builder Lab",
    "/Users/jmbeh/Project Understanding"
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
      "postsDirectory": "/Users/jmbeh/Personal Builder Lab/MyPrivateProfileBuilding/LinkedIn_Postings"
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

## Refactoring Phases

### Phase 1: Engine Foundation ✅
- [x] Create `engine/` directory structure
- [x] Create `engine/common/cursor_db.py` with cross-platform detection
- [x] Create `engine/common/llm.py` with Anthropic + OpenAI support
- [x] Create `engine/common/config.py` for user config management
- [x] Create `engine/common/bank.py` for shared bank logic

### Phase 2: Migrate Python Logic ✅
- [x] Migrate idea generation logic to `engine/ideas.py`
- [x] Migrate insight generation logic to `engine/insights.py`
- [x] Migrate prompts to `engine/prompts/`
- [x] Create generic judge prompt
- [x] Ensure all paths are configurable (no hardcoding)

### Phase 3: Update API Routes ✅
- [x] Update `api/generate/route.ts` to call `engine/` scripts
- [x] Create `api/config/route.ts` for config CRUD
- [x] Create `api/banks/route.ts` for reading banks

### Phase 4: Settings UI ✅
- [x] Create `/settings` page with wizard flow
- [x] Workspace configuration (add/remove folders)
- [x] Voice profile configuration (name, context, golden examples, voice guide)
- [x] LLM provider selection
- [x] Feature toggles (LinkedIn sync, solved status)
- [x] API key management (via .env, with placeholder in settings)
- [ ] First-run detection and redirect (optional polish)

### Phase 5: Bank Viewer ✅
- [x] Add "View Banks" section to main UI
- [x] Display Idea Bank with solved status
- [x] Display Insight Bank with shared status
- [x] Filter by status (unsolved/unshared first)

### Phase 6: Polish & Publish 🔄
- [x] Update README with beautiful quick-start
- [x] Update CLAUDE.md with architecture details
- [x] Move to root (`Personal Builder Lab/Inspiration/`)
- [x] Migrate existing bank data to `data/`
- [x] End-to-end testing (10 Playwright tests, 12 screenshots in `e2e-results/`)
- [ ] Add screenshots/GIFs to README (optional)
- [ ] Publish to `github.com/mostly-coherent/inspiration`

---

## Migration Notes

### Files to Migrate

| Source | Destination | Notes |
|--------|-------------|-------|
| `MyIdeas/my_ideas.py` | `engine/ideas.py` | Remove personal paths |
| `MyInsights/my_insights.py` | `engine/insights.py` | Remove personal paths |
| `MyIdeas/prompts/*.md` | `engine/prompts/ideas_*.md` | Generalize |
| `MyInsights/prompts/*.md` | `engine/prompts/insights_*.md` | Generalize |
| `MyIdeas/idea_bank.json` | `data/idea_bank.json` | User data |
| `MyInsights/insight_bank.json` | `data/insight_bank.json` | User data |

### Paths to Make Configurable

| Hardcoded Path | Configuration Key |
|----------------|-------------------|
| `TARGET_WORKSPACES` | `config.workspaces` |
| `LINKEDIN_POSTS_DIR` | `config.features.linkedInSync.postsDirectory` |
| `CURSOR_DB_PATH` | Auto-detected by OS |
| Script paths in `types.ts` | Relative to project root |

---

## Success Criteria

1. **New user can start in < 5 minutes:** Clone → install → add API key → run
2. **No hardcoded personal paths:** All paths from config or auto-detected
3. **Cross-platform:** Works on macOS, Windows, Linux
4. **Existing features preserved:** All current functionality works
5. **Power features accessible:** LinkedIn sync, solved status available in settings

---

## Open Questions

1. ~~Keep LinkedIn sync?~~ → Yes, as power feature
2. ~~Keep solved status sync?~~ → Yes, as power feature
3. ~~Support OpenAI?~~ → Yes, as fallback
4. ~~First-run wizard?~~ → Yes, and accessible anytime via Settings
5. Should we support local LLMs (Ollama)? → Future consideration

---

**Last Updated:** 2025-12-21

