# ✨ Inspiration

> Turn your Cursor AI conversations into actionable ideas, shareable insights, and deduplicated knowledge banks.

![Type](https://img.shields.io/badge/Type-Tool-purple)
![Status](https://img.shields.io/badge/Status-Active-green)
![Stack](https://img.shields.io/badge/Stack-Next.js%2015%20%7C%20Python%20%7C%20Claude-orange)

![Inspiration Homepage](e2e-results/01-homepage.png)

## 🚀 Quick Start

```bash
# 1. Install
git clone https://github.com/mostly-coherent/inspiration.git
cd inspiration
npm install
pip install -r engine/requirements.txt

# 2. Configure
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# 3. Run
npm run dev
```

**→ Open http://localhost:3000**

---

<details>
<summary><strong>✨ Features</strong></summary>

- **💡 Ideas Generation:** Extract prototype and tool ideas worth building from chat history.
- **✨ Insight Generation:** Generate LinkedIn post drafts sharing your learnings.
- **🏦 Knowledge Banks:** Deduplicated, harmonized storage for ideas and insights.
- **⚙️ Preset Modes:** Daily, Sprint (14d), Month (30d), Quarter (90d) scans.
- **⚡ Best-of-N:** Generate multiple candidates and pick the best one.
- **🔄 Cross-Platform:** Auto-detects Cursor DB on macOS, Windows, and Linux.

</details>

<details>
<summary><strong>🎯 How It Works</strong></summary>

Inspiration reads your local Cursor chat history database (`state.vscdb`), extracts relevant conversations, and uses Claude Sonnet 4 to distill them into structured ideas or social content. It then "harmonizes" these new items into your persistent JSON banks to prevent duplicates.

</details>

<details>
<summary><strong>⚙️ Configuration</strong></summary>

**First Run Wizard:**
1. **Workspaces:** Add your Cursor project folders.
2. **Voice & Style:** Configure your authentic writing voice (Author Name, Context, Golden Examples).
3. **LLM Settings:** Choose your model (Claude Sonnet 4 recommended).
4. **Power Features:** Enable LinkedIn sync, solved status tracking.

**Environment Variables (.env):**
- `ANTHROPIC_API_KEY` (Required)
- `OPENAI_API_KEY` (Optional fallback)

</details>

<details>
<summary><strong>🛠️ Available Scripts</strong></summary>

```bash
# Web UI
npm run dev

# Python Engine CLI (Direct usage)
python3 engine/ideas.py --daily
python3 engine/insights.py --month
```

</details>

<details>
<summary><strong>📚 Development Notes</strong></summary>

- **Config:** `data/config.json` (created on first run)
- **Banks:** `data/idea_bank.json`, `data/insight_bank.json`
- **Engine:** Standalone Python scripts in `engine/` directory
- See `CLAUDE.md` for detailed technical setup and architecture.
- See `Plan.md` for product requirements.
- See `BUILD_LOG.md` for chronological progress.

</details>

---

**Status:** Active | **Purpose:** Personal productivity tool
