# ✨ Inspiration

> Turn your Cursor AI conversations into actionable ideas, shareable insights, and a deduplicated knowledge library.

![Type](https://img.shields.io/badge/Type-Tool-purple)
![Status](https://img.shields.io/badge/Status-Active-green)
![Stack](https://img.shields.io/badge/Stack-Next.js%2015%20%7C%20Python%20%7C%20Claude%20%7C%20Supabase-orange)

<img src="public/screenshots/homepage.png" alt="Inspiration - Main Interface" width="800">

*Extract ideas and insights from your Cursor chat history with AI-powered analysis*

## 🚀 Quick Start

```bash
# 1. Install
git clone https://github.com/yourusername/inspiration.git
cd inspiration
npm install
pip install -r engine/requirements.txt

# 2. Configure (See CLAUDE.md for full setup)
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
# Optional: Add SUPABASE_URL/KEY for massive history support

# 3. Run
npm run dev
```

**→ Open http://localhost:3000**

> **Note:** E2E tests are optional. If you want to run tests:
> 1. `cp playwright.config.ts.example playwright.config.ts`
> 2. `mkdir -p e2e && cp inspiration.spec.ts.example e2e/inspiration.spec.ts`
> 3. `npm test`

---

<details>
<summary><strong>✨ Features</strong></summary>

- **💡 Ideas Generation:** Extract prototype and tool ideas worth building from chat history.
- **✨ Insight Generation:** Generate social media / blog post drafts sharing your learnings.
- **🔍 Use Case Search:** Find evidence in your chat history for user-provided insights/ideas.
- **📚 Library System:** Deduplicated, categorized storage with automatic grouping via semantic similarity.
- **⚙️ Preset Modes:** Daily, Sprint (14d), Month (30d), Quarter (90d) scans.
- **🎯 Item-Centric Generation:** Generate multiple items with smart deduplication before saving.
- **🧠 Vector Memory:** Supports indexing >2GB of chat history using Supabase pgvector for O(1) search speeds.
- **🔄 Cross-Platform:** Auto-detects Cursor DB on macOS and Windows.

</details>

<details>
<summary><strong>🎯 How It Works</strong></summary>

Inspiration reads your local Cursor chat history database (`state.vscdb`), extracts relevant conversations (handling complex "Bubble" architecture), and uses Claude Sonnet 4 to distill them into structured ideas or social content.

For power users with massive histories (>100MB), it can optionally index your chat logs into a private **Supabase Vector Database**, turning your history into an instantly searchable, persistent "Second Memory" independent of Cursor's local storage.

</details>

<details>
<summary><strong>📚 Development Notes</strong></summary>

- **Config:** `data/config.json` (created on first run)
- **Library:** `data/items_bank.json` (unified items and categories)
- **Themes:** `data/themes.json` (mode configurations)
- **Engine:** Standalone Python scripts in `engine/` directory
- **Vector DB:** `engine/common/vector_db.py` and `engine/scripts/`
- See `CLAUDE.md` for detailed technical setup and architecture.
- See `PLAN.md` for product requirements.
- See `BUILD_LOG.md` for chronological progress.

</details>

---

**Status:** Active | **Purpose:** Personal productivity tool
