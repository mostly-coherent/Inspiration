# Inspiration

> **Treats your Cursor chat history as artifacts of thinking, not disposable logs.**

You have hundreds (or thousands) of conversations with Claude—reasoning through architecture decisions, debugging trade-offs, exploring patterns. Then they disappear. Inspiration mines them.

![Type](https://img.shields.io/badge/Type-Tool-purple)
![Status](https://img.shields.io/badge/Status-Active-green)
![Stack](https://img.shields.io/badge/Stack-Next.js%2015%20%7C%20Python%20%7C%20Claude-orange)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue)

<img src="https://raw.githubusercontent.com/mostly-coherent/Inspiration/main/public/screenshots/homepage.png" alt="Inspiration - Main Interface" width="800">

**For builders who use AI as a thinking partner** (not just autocomplete). If you've thought *"I solved this before... where is that conversation?"*, this is for you.

---

## 🚀 Quick Start

```bash
git clone https://github.com/mostly-coherent/Inspiration.git
cd Inspiration
npm run bootstrap
npm run dev
```

**→ Open http://localhost:3000/onboarding-fast**

| Step | What Happens | Time |
|------|-------------|------|
| 1. Auto-detect | Finds your Cursor DB | ~3s |
| 2. API Key | Paste Anthropic key | ~10s |
| 3. Generate | Maps local chat history | ~60s |

**Cost:** $0 for local history (<500MB). Optional vector indexing costs ~$0.50–$5 one-time.

**Full Power:** Add an OpenAI key to connect your thinking with **300+ Lenny's Podcast episodes**—Dylan Field (Figma), Elena Verna (Lovable), Claire Vo (ChatPRD), and other product leaders.

---

## 🤝 The Thinking Partner Test

A true thinking partner does three things:

**(a) Remembers what you've said before**  
Reads Cursor's SQLite database directly (`state.vscdb`), converts messages to embeddings, runs semantic similarity across your entire history.

**(b) Connects dots you haven't connected**  
Knowledge graph extraction maps how concepts link across projects. Reveals that a pattern you rejected in Project A fits Project B.

**(c) Challenges your assumptions**  
Theme Explorer's Counter-Intuitive tab generates "good opposite" perspectives as reflection prompts. Pushes back on your patterns.

**The gap:** Tools respond to what you ask. Thinking partners surface what you didn't know to ask about. Inspiration does the latter.

---

## 🎯 Where It Helps

**1. Pattern Recognition You Can't Do Yourself**

Surfaces: "You've been circling this same caching problem across three projects for four months." Each conversation felt isolated—a colleague would've noticed.

**2. Cross-Project Connections**

Knowledge graphs synthesize across boundaries you've mentally siloed. A debugging pattern from March connects to work you're doing now.

**3. Blind Spot Detection**

Theme Explorer tabs:
- **Patterns** — Semantic clustering (forest-level → tree-level zoom)
- **Unexplored** — Topics discussed but not formalized (gaps in your Library)
- **Counter-Intuitive** — "Good opposite" perspectives (reflection prompts)

**4. Expert Knowledge Bridging**

300+ Lenny's Podcast episodes pre-indexed and matched against your knowledge graph. Working through growth strategy? See what Elena Verna said about similar patterns. Connects your private thinking with public expertise.

**5. Longitudinal Intelligence**

Compounding factor. Tracks evolution: "Your focus shifted from UI to systems design without you noticing." No single-session tool can do this.

---

## 🔒 Privacy & Performance

- Reads data directly from Cursor's local storage (no plugin, no extension, no modification)
- <500MB histories: works entirely locally with 90s Fast Start—no database needed
- Larger histories: choose quick scan (recent 500MB) or full Vector DB indexing
- Privacy-first: data stays on your machine. Optional Supabase sync uses your own instance.

---

<details>
<summary><strong>🧠 How It Works</strong></summary>

Conversations with AI capture reasoning in the moment—not polished docs. Inspiration analyzes this in two ways:

**Pattern recognition:** Semantic search finds recurring themes. You keep hitting the same edge case. Your focus shifted from frontend to systems without noticing. You've been circling the same architectural challenge from different angles.

**Relationship forming:** Semantic connections link conversations. A discussion from March connects to work you're doing now. Three projects share a common problem you didn't notice.

**What this reveals:** Git history shows what you shipped. Patterns show how you thought about it—trade-offs, dead-ends, constraints. Sometimes that context is more valuable than the code.

**Why it compounds:** More conversations = more patterns and graph nodes. The value isn't additive—it's discovering connections and recurring themes you didn't know existed.

</details>

<details>
<summary><strong>⚙️ Environment Variables</strong></summary>

Required environment variables:

- **`ANTHROPIC_API_KEY`** – Required: For Claude (generation, synthesis)
- **`OPENAI_API_KEY`** – Optional: Enables expert perspectives (embeddings, semantic search)
- **`SUPABASE_URL`** – Optional: For Vector DB (required for 500MB+ histories)
- **`SUPABASE_ANON_KEY`** – Optional: Supabase anonymous key

**Notes:**
- Cursor chat history auto-detected on macOS and Windows
- Claude Code JSONL history supported on all platforms
- Cloud deployment (Vercel): Read-only mode

</details>

<details>
<summary><strong>🚢 Deployment</strong></summary>

**Recommended: Deploy to Vercel**

1. Build locally and verify: `npm run build`
2. Connect GitHub repo to Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy

**Note:** Cloud deployments run in read-only mode (cannot sync local Cursor DB). For full functionality, run locally.

</details>

<details>
<summary><strong>⚙️ System Requirements</strong></summary>

| Requirement | Version/Details |
|-------------|-----------------|
| **OS** | macOS or Windows |
| **Node.js** | 18.18.0+ |
| **Python** | 3.10+ (3.11+ recommended) |
| **Disk Space** | 100MB–2GB (scales with chat history) |
| **API Keys** | Anthropic (required), OpenAI (optional), Supabase (optional) |
| **Chat History** | Cursor or Claude Code with existing conversations |

</details>

<details>
<summary><strong>🔧 Technical Implementation</strong></summary>

**Stack:** Next.js 15, Python, Anthropic Claude, OpenAI embeddings, pgvector

**Key Engineering:**
- Reverse-engineered Cursor's "Bubble" format (SQLite) + Claude Code's JSONL
- RAG over your own chat history for conceptual relationships
- Dedup via embedding similarity (generate N×1.5, present N)
- Hybrid local/cloud: SQLite → optional Supabase Vector DB sync
- pgvector for server-side similarity (275x fewer API calls)

**Architecture:** Standard RAG pipeline (embed → analyze → retrieve → synthesize) + semantic search + cosine similarity. Novelty is longitudinal intelligence over your own thinking.

</details>

<details>
<summary><strong>📖 Development Notes</strong></summary>

- See `CLAUDE.md` for detailed development commands, project structure, and environment setup
- See `PLAN.md` for product requirements and milestones
- See `ARCHITECTURE.md` for system design and technical details

</details>

<details>
<summary><strong>💬 Community & Support</strong></summary>

**Bugs/Features:** [GitHub Issues](https://github.com/mostly-coherent/Inspiration/issues) | **Discussion:** [GitHub Discussions](https://github.com/mostly-coherent/Inspiration/discussions) | **Docs:** `ARCHITECTURE.md`, `CLAUDE.md`

PRs welcome. See issues tagged `good first issue`. Share discoveries: #InspirationDiscoveries on Twitter.

</details>

<details>
<summary><strong>🙏 Acknowledgments</strong></summary>

Thanks to:

- **[Lenny Rachitsky](https://www.lennyspodcast.com/)** for making the podcast transcripts available for educational use. The Expert Perspectives feature exists because of this generosity.
- **[Claire Vo](https://github.com/ChatPRD)** for curating [lennys-podcast-transcripts](https://github.com/ChatPRD/lennys-podcast-transcripts) on GitHub—clean structure made integration straightforward.

</details>

---

**Status:** Active | **License:** MIT | **Author:** [@mostly-coherent](https://github.com/mostly-coherent)
