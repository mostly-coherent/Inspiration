# Inspiration

> **Your AI conversations (Cursor & Claude Code) contain your best problem-solving. Inspiration structures them to reveal patterns, evolution, and connections you missed.**

![Type](https://img.shields.io/badge/Type-Tool-purple)
![Status](https://img.shields.io/badge/Status-Active-green)
![Stack](https://img.shields.io/badge/Stack-Next.js%2015%20%7C%20Python%20%7C%20Claude-orange)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue)

<img src="https://raw.githubusercontent.com/mostly-coherent/Inspiration/main/public/screenshots/homepage.png" alt="Inspiration - Main Interface" width="800">

<details open>
<summary><strong>📚 Why This Exists</strong></summary>

Your best problem-solving happens in conversations with AI—reasoning through trade-offs, exploring architectures, and debugging complex issues. But this thinking is usually ephemeral. **Inspiration** analyzes your history to reveal the patterns you miss in the moment.

**What you can discover:**
- **Hidden Loops:** "I've been circling this same architectural problem for months."
- **Evolution:** "My focus shifted from UI polish to distributed systems without me noticing."
- **Cross-Project Insights:** "The auth pattern I rejected in Project A is actually perfect for Project B."

**Who This Is For:**
Builders who use AI as a **thinking partner** (reasoning, trade-offs, decisions)—not just for autocomplete. If you've ever thought *"I solved this before... where is that conversation?"*, this is for you.

</details>

<details>
<summary><strong>🔍 What Makes It Different</strong></summary>

Inspiration is designed to work with your chat history over time:
- **Works across tools:** Unified view of Cursor and Claude Code conversations
- **Privacy-first:** Your data stays on your machine (local-first). Optional Supabase sync uses your own instance. No tracking, no telemetry.
- **Longitudinal:** Becomes more useful the longer you use it, revealing evolution in your thinking
- **Semantic:** Finds conceptual connections, not just keyword matches

After several months of use, your Inspiration contains patterns specific to your workflow—connections between projects, recurring problems you didn't notice, evolution in your approach.

</details>

<details>
<summary><strong>✨ Features</strong></summary>

| Mode | What It Does |
|------|-------------|
| **Theme Explorer** | See patterns in your thinking—3 tabs: Patterns, Unexplored, Counter-Intuitive |
| **Ideas** | Surface recurring pain points worth building solutions for |
| **Insights** | Extract learnings worth sharing (blogs, tweets, notes) |
| **Seek** | "I want to build X"—find similar examples from your own history |
| **Expert Perspectives** | Connect your thinking with 300+ Lenny's Podcast episodes via semantic search (updated weekly) |
| **Knowledge Graph** | Entity/relation extraction from conversations, Graph View, Evolution Timeline, Intelligence features |

**How It Gets More Useful:**

| Timeline | What You Can Do |
|----------|-----------------|
| **Day 1** | Semantic search across 300+ Lenny's Podcast episodes for expert insights |
| **Month 1** | See patterns across your conversations; discover how your themes relate to expert discussions |
| **Month 6** | Your patterns connect with expert knowledge—relationships you didn't know existed |

</details>

<details>
<summary><strong>🆕 What's New: Lenny's Podcast Integration</strong></summary>

Your patterns now connect with expert knowledge. Semantic search across both your conversations and 300+ Lenny's Podcast episodes (updated weekly from [ChatPRD's archive](https://github.com/ChatPRD/lennys-podcast-transcripts))—**Claire Vo** (ChatPRD), **Dylan Field** (Figma), **Elena Verna** (Lovable, Miro), and other product leaders, engineers, and founders. Discover how expert thinking relates to your own patterns, inspiring outward exploration. Click through to YouTube timestamps.

How it works:
- **One-time auto-download:** ~250MB embeddings downloaded from GitHub Releases on first run
- **Requires:** Anthropic API key (Theme Map) + OpenAI API key (expert perspectives unlock)
- 269 episodes, 44,371 searchable segments, all rich metadata (titles, YouTube URLs, timestamps)
- Works with Fast Start (Anthropic key)—add OpenAI key to unlock expert perspectives
- Auto-syncs new episodes when you refresh Memory (pulls from [ChatPRD's archive](https://github.com/ChatPRD/lennys-podcast-transcripts))
- No embedding cost—everything pre-computed and downloaded once

Theme Explorer tabs:
- **Patterns** — Themes in your Library connected to related expert discussions
- **Unexplored** — Topics you discuss but haven't extracted (with expert examples to inspire)
- **Counter-Intuitive** — Reflection prompts + expert contrarian perspectives

</details>

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
| 1. Auto-detect | Finds your Cursor DB, shows size | ~3s |
| 2. API Key | Paste your Anthropic key | ~10s |
| 3. Generate | Creates Theme Map from local SQLite | ~60s |

**Fast Start (90s):** Just paste your Anthropic key. Inspiration instantly maps your local chat history (Cursor or Claude Code) to find patterns. No database setup required.

**Full Power:** Add an OpenAI key to connect your thinking with **300+ Lenny's Podcast episodes**. See how expert product leaders solved the problems you're facing now.

**Cost:** **$0** for local history (<500MB). Optional vector indexing (for massive scale) costs ~$0.50–$5 one-time (paid directly to OpenAI/Anthropic for its API usage).

---

<details>
<summary><strong>🧠 How It Works</strong></summary>

Inspiration indexes your Cursor and Claude Code conversations (optionally to a Vector DB for large histories). It uses semantic search to recognize patterns and reveals relationships through semantic analysis. Claude synthesizes these into structured ideas or insights. Your Library grows over time, the Theme Explorer surfaces patterns, and Unexplored Territory shows topics you've discussed but haven't captured yet.

**Longitudinal intelligence over your own thinking.**

Your conversations with AI capture reasoning at the moment you're working through problems—not polished documentation. Inspiration analyzes this in two ways:

**1. Pattern recognition (semantic search):**  
Find recurring themes across conversations. You keep hitting the same edge case. Your focus shifted from frontend to systems design. You've been circling the same architectural challenge from different angles.

**2. Relationship forming (semantic connections):**  
Conversations connect through semantic similarity. A discussion from March connects to work you're doing now. Three different projects link through a common problem you didn't notice.

**What this reveals:**

Your git history shows what you shipped. The patterns and relationships show how you thought about it: trade-offs considered, dead-ends explored, constraints that mattered. Sometimes that context is more valuable than the code itself.

**Why it compounds:**

More conversations mean more patterns and more nodes in the graph. The value isn't additive—it's about discovering connections and recurring themes you didn't know existed.

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

### Engineering

| Aspect | Details |
|--------|---------|
| **Multi-Source Extraction** | Reverse-engineered Cursor's "Bubble" format (SQLite) and Claude Code's JSONL |
| **Relationship Discovery** | RAG over your own chat history to find conceptual relationships |
| **Dedup Before Presentation** | Generate N×1.5 items, deduplicate via embedding similarity |
| **Hybrid Local/Cloud** | Local SQLite → Supabase Vector DB sync; works offline, scales to 2GB+ |

### Architecture

- Standard RAG pipeline (embed → analyze → retrieve → synthesize)
- Semantic search for pattern recognition
- Cosine similarity for relationship discovery
- Anthropic Claude for synthesis, OpenAI for embeddings
- pgvector for server-side similarity search (275x fewer API calls)

The novelty is longitudinal intelligence: pattern recognition + relationship forming over your own thinking.

</details>

<details>
<summary><strong>📖 Development Notes</strong></summary>

- See `CLAUDE.md` for detailed development commands, project structure, and environment setup
- See `PLAN.md` for product requirements and milestones
- See `ARCHITECTURE.md` for system design and technical details

</details>

<details>
<summary><strong>💬 Community</strong></summary>

Early users are finding it useful for discovering patterns they'd missed manually.

*Have something to share? Tag #InspirationDiscoveries on Twitter or open a discussion on GitHub.*

</details>

<details>
<summary><strong>🆘 Support</strong></summary>

- **Docs:** `ARCHITECTURE.md` (technical), `CLAUDE.md` (AI assistant context)
- **Bugs:** [GitHub Issues](https://github.com/mostly-coherent/Inspiration/issues)
- **Features:** [GitHub Issues](https://github.com/mostly-coherent/Inspiration/issues) (label: enhancement)
- **Discussion:** [GitHub Discussions](https://github.com/mostly-coherent/Inspiration/discussions)

PRs welcome. See issues tagged `good first issue`.

</details>

<details>
<summary><strong>🙏 Acknowledgments</strong></summary>

Thanks to:

- **[Lenny Rachitsky](https://www.lennyspodcast.com/)** for making the podcast transcripts available for educational use. The Expert Perspectives feature exists because of this generosity.
- **[Claire Vo](https://github.com/ChatPRD)** for curating [lennys-podcast-transcripts](https://github.com/ChatPRD/lennys-podcast-transcripts) on GitHub—clean structure made integration straightforward.

</details>

---

**Status:** Active | **License:** MIT | **Author:** [@mostly-coherent](https://github.com/mostly-coherent)
