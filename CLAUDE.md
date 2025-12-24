# Inspiration — AI Assistant Context

> **Purpose:** Technical context for AI coding assistants working on this project

---

## What This Is

A web UI for extracting ideas and insights from Cursor chat history using Claude Sonnet 4.

- **Ideas** — Prototype and tool ideas worth building
- **Insights** — LinkedIn post drafts sharing learnings
- **Banks** — Deduplicated storage with harmonization

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
│       └── banks/        # Bank reading
├── engine/               # Python generation engine
│   ├── ideas.py          # Idea generation CLI
│   ├── insights.py       # Insight generation CLI
│   ├── common/           # Shared utilities
│   │   ├── cursor_db.py  # Cross-platform Cursor DB extraction
│   │   ├── llm.py        # Anthropic + OpenAI wrapper
│   │   ├── config.py     # User config management
│   │   └── bank.py       # Bank harmonization
│   └── prompts/          # LLM prompts
└── data/                 # User data (gitignored)
    ├── config.json       # User configuration
    ├── idea_bank.json    # Idea bank
    └── insight_bank.json # Insight bank
```

---

## Running

```bash
npm run dev
# Open http://localhost:3000
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main UI — tool selection, presets, banks viewer |
| `src/app/settings/page.tsx` | Settings wizard (workspaces, voice, LLM, features) |
| `src/app/api/generate/route.ts` | API route — calls Python engine |
| `src/lib/types.ts` | Shared types and preset configurations |
| `engine/ideas.py` | Idea generation script |
| `engine/insights.py` | Insight generation script |
| `engine/common/config.py` | Config loading/saving |
| `data/config.json` | User configuration |

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
  },
  "features": {
    "linkedInSync": {
      "enabled": true,
      "postsDirectory": "/path/to/linkedin/posts"
    },
    "solvedStatusSync": {
      "enabled": true
    },
    "customVoice": {
      "enabled": true,
      "voiceGuideFile": "/path/to/voice-guide.md",
      "goldenExamplesDir": "/path/to/examples",
      "authorName": "JM",
      "authorContext": "PM at a tech company"
    }
  }
}
```

---

## Presets

| Mode | Days | Candidates | Temp | Output |
|------|------|------------|------|--------|
| Daily | 1 | 3 | 0.3 | 1 file |
| Sprint | 14 | 5 | 0.4 | 1 file (aggregated) |
| Month | 30 | 10 | 0.5 | 1 file (aggregated) |
| Quarter | 90 | 15 | 0.5 | 1 file (aggregated) |

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/generate` | POST | Generate ideas/insights |
| `/api/config` | GET/POST/PUT | Read/update configuration |
| `/api/banks` | GET | Read bank data |

---

## Python Engine CLI

```bash
# From engine/ directory
python3 ideas.py --daily
python3 ideas.py --sprint
python3 insights.py --month
python3 insights.py --days 7 --best-of 5
```

---

## Dependencies

### Frontend
- Next.js 15, React 19, TypeScript
- TailwindCSS

### Backend
- Python 3.10+
- `anthropic` — Claude API
- `openai` — OpenAI API (optional fallback)

---

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Optional (for fallback)
OPENAI_API_KEY=sk-...

# Optional (password protection)
APP_PASSWORD=your-secure-password
```

**Password Protection:**
- If `APP_PASSWORD` is set, the app requires authentication to access
- Users are redirected to `/login` if not authenticated
- Authentication cookie expires after 30 days
- Logout button available in header (next to settings icon)

---

## Development Notes

1. **Config lives in `data/config.json`** — Created on first run or via Settings
2. **Banks are in `data/`** — `idea_bank.json`, `insight_bank.json`
3. **Engine is standalone** — Can run via CLI without the web UI
4. **Cross-platform** — Auto-detects Cursor DB path for macOS, Windows, Linux
