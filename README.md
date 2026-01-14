# Inspiration

> **Search and analyze your AI coding conversations.**
> 
> If you use Cursor or Claude Code as a thinking partner, you've accumulated months of conversations—reasoning, context, evolving understanding. Inspiration makes that history searchable and surfaces patterns you might have missed.

![Type](https://img.shields.io/badge/Type-Tool-purple)
![Status](https://img.shields.io/badge/Status-Active-green)
![Stack](https://img.shields.io/badge/Stack-Next.js%2015%20%7C%20Python%20%7C%20Claude-orange)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue)

<img src="public/screenshots/homepage.png" alt="Inspiration - Main Interface" width="800">

**New:** [Lenny's Podcast Integration](#whats-new) — 280+ expert episodes indexed locally. See expert perspectives alongside your own themes.

---

## Who This Is For

You'll find this useful if:
- You use **Cursor or Claude Code** as a thinking partner (not just autocomplete)
- You've had that moment: *"I solved this before... where was that conversation?"*
- You're curious what patterns emerge across 6 months of AI conversations
- You want to track how your thinking has evolved over time

If you just want to ship code fast, this probably isn't for you. But if you're curious about your own thinking—if "semantic search over your own conversations" sounds useful—keep reading.

---

## Privacy

Your data stays on your machine:
- **Local-first** — Inspiration reads your chat history directly, nothing leaves your machine by default
- **Optional cloud sync** — Supabase Vector DB only if you configure it (your own instance)
- **API usage** — Only analyzed content sent to LLM APIs for generation
- **No tracking** — Zero analytics, no telemetry
- **Open source** — [Audit the code](https://github.com/mostly-coherent/Inspiration)

You control your API keys, your optional cloud storage, what gets indexed.

---

## What You Get

| Mode | What It Does |
|------|-------------|
| **Theme Explorer** | See patterns in your thinking—3 tabs: Patterns, Unexplored, Counter-Intuitive |
| **Ideas** | Surface recurring pain points worth building solutions for |
| **Insights** | Extract learnings worth sharing (blogs, tweets, notes) |
| **Seek** | "I want to build X"—find similar examples from your own history |
| **Expert Perspectives** | 280+ Lenny's Podcast episodes integrated into Theme Explorer |

Before AI assistants, your problem-solving happened in your head. Now it's captured in Cursor/Claude Code conversations. But without structure, it's scattered. Inspiration turns that into something searchable and analyzable.

---

## Requirements

| Requirement | Version/Details |
|-------------|-----------------|
| **OS** | macOS or Windows |
| **Node.js** | 18.18.0+ |
| **Python** | 3.10+ (3.11+ recommended) |
| **Disk Space** | 100MB–2GB (scales with chat history) |
| **API Keys** | Anthropic (required), OpenAI (optional), Supabase (optional) |
| **Chat History** | Cursor or Claude Code with existing conversations |

**Notes:**
- Cursor chat history auto-detected on macOS and Windows
- Claude Code JSONL history supported on all platforms
- Cloud deployment (Vercel): Read-only mode

---

## Quick Start

```bash
git clone https://github.com/mostly-coherent/Inspiration.git
cd Inspiration
npm run bootstrap
npm run dev
```

Open `http://localhost:3000/onboarding-fast`

| Step | What Happens | Time |
|------|-------------|------|
| 1. Auto-detect | Finds your Cursor DB, shows size | ~3s |
| 2. API Key | Paste your Anthropic key | ~10s |
| 3. Generate | Creates Theme Map from local SQLite | ~60s |

No Supabase required for Fast Start—reads directly from your local Cursor database.

### Two Paths

| Path | For Who | What You Need |
|------|---------|---------------|
| **Fast Start** | First-time users | Anthropic API key |
| **Full Setup** | Large histories (500MB+) | Anthropic + OpenAI + Supabase |

### API Keys

| Key | Fast Start | Full Setup | What It Enables |
|-----|------------|------------|-----------------|
| **Anthropic** | Required | Required | Theme synthesis, generation |
| **OpenAI** | Optional | Required | Expert perspectives, embeddings, semantic search |
| **Supabase** | Not needed | Recommended | Scale to 2GB+ history |

### Typical Costs

| Activity | Estimated Cost |
|----------|----------------|
| First sync (3-6 months history) | $0.50–$5.00 (one-time) |
| Daily scan (24h) | $0.10–$0.50 |
| Weekly scan (7d) | $0.50–$2.00 |
| Theme Explorer | $0.05–$0.20 |

Cost estimates shown before each run. Performance optimizations reduce costs 50-80% via topic filtering and embedding caching.

---

## Features

- **Multi-Source** — Auto-detects Cursor and Claude Code, combines into unified Memory
- **Library** — Accumulated ideas/insights with automatic deduplication
- **Unexplored Territory** — Find topics you discuss but haven't captured; one-click enrich
- **Expert Perspectives** — 280+ Lenny's Podcast episodes indexed locally
- **Cost Estimation** — See estimated API cost before running
- **Vector Memory** — Scale to 2GB+ with Supabase pgvector (optional)
- **Time Presets** — Daily, Sprint (14d), Month, Quarter scans

---

## How It Works

1. **Auto-Detect** — Finds Cursor (SQLite) and Claude Code (JSONL) histories
2. **Index** — Optionally sync to Vector DB for large histories
3. **Search** — Semantic queries across months of conversations
4. **Synthesize** — Claude extracts patterns into structured ideas/insights
5. **Accumulate** — Library grows over time
6. **Reflect** — Theme Explorer groups items for review
7. **Discover** — Unexplored Territory shows gaps to fill

---

<details>
<summary><strong>Why not just ask Claude directly?</strong></summary>

You could manually search and ask:
- Search Cursor history (basic text, no semantic understanding)
- Copy/paste into Claude (context limit = 1-2 weeks max)
- Ask "What patterns?" (one-off, no dedup, no tracking)
- Repeat every time (doesn't scale)

Inspiration automates:
- Semantic search across 2GB+ history
- Deduplication before presentation
- Library that accumulates over time
- Cross-session pattern synthesis
- Unexplored topic detection
- 275x fewer API calls via optimizations

Manual = one-off queries. Inspiration = system that grows with your usage.

</details>

---

## Why Build This?

Every conversation with Claude is you reasoning through problems. Before AI assistants, that thinking was invisible. Now it's captured—but scattered across hundreds of conversations.

What you can discover:
- *"I've been circling this problem for 6 months without realizing it"*
- *"3 months ago I was focused on frontend, now it's all system design"*
- *"I keep hitting the same edge case across different projects"*

**Example:** Run Theme Explorer on 6 months of conversations. See a theme like "Developer tooling for async workflows." Zoom in: background jobs, webhooks, event-driven architecture. The synthesis shows it appeared in 12 conversations across 4 projects. You've been dancing around the same problem—maybe it's time to build a unified solution.

---

<details>
<summary><strong>Technical Details</strong></summary>

### Engineering

| Aspect | Details |
|--------|---------|
| **Multi-Source Extraction** | Reverse-engineered Cursor's "Bubble" format (SQLite) and Claude Code's JSONL |
| **Semantic Self-Search** | RAG over your own chat history (not docs or StackOverflow) |
| **Dedup Before Presentation** | Generate N×1.5 items, deduplicate via embedding similarity |
| **Hybrid Local/Cloud** | Local SQLite → Supabase Vector DB sync; works offline, scales to 2GB+ |

### Product

| Aspect | Details |
|--------|---------|
| **Library as Core** | The accumulated Library is the value—not each session |
| **Cross-Session Reflection** | Most dev tools focus on "do more"—this focuses on "learn from what you did" |

### What's Standard

- RAG pipeline (embed → search → retrieve → synthesize)
- Cosine similarity grouping
- Anthropic for generation, OpenAI for embeddings

The novelty is **what** you're searching (your own AI conversations), not the underlying tech.

</details>

---

## What's New

**Lenny's Podcast Integration**

Your themes are now enriched with wisdom from 280+ expert episodes—product leaders, engineers, founders. When you explore a theme, see what **Claire Vo** (ChatPRD), **Dylan Field** (Figma), **Elena Verna** (Lovable, Miro) said about similar topics. Click through to YouTube timestamps.

How it works:
- **Zero setup required:** Pre-computed embeddings (~219MB) are included in the repo. Just clone and run!
- 269 episodes, 44,371 searchable segments, all rich metadata (titles, YouTube URLs, timestamps)
- Works immediately with Fast Start (Anthropic key only) or Full Setup (+ OpenAI for embeddings)
- Auto-syncs new episodes when you refresh Memory (pulls from [ChatPRD's archive](https://github.com/ChatPRD/lennys-podcast-transcripts))
- No embedding cost on first run—everything pre-computed

Theme Explorer tabs:
- **Patterns** — Themes in your Library + expert validation
- **Unexplored** — Topics you discuss but haven't extracted
- **Counter-Intuitive** — Reflection prompts + expert contrarian takes

---

## Documentation

See `ARCHITECTURE.md` for system design and technical details.

---

## Support

- **Docs:** `ARCHITECTURE.md` (technical), `CLAUDE.md` (AI assistant context)
- **Bugs:** [GitHub Issues](https://github.com/mostly-coherent/Inspiration/issues)
- **Features:** [GitHub Issues](https://github.com/mostly-coherent/Inspiration/issues) (label: enhancement)
- **Discussion:** [GitHub Discussions](https://github.com/mostly-coherent/Inspiration/discussions)

PRs welcome. See issues tagged `good first issue`.

---

## Acknowledgments

Thanks to:

- **[Lenny Rachitsky](https://www.lennyspodcast.com/)** for making the podcast transcripts available for educational use. The Expert Perspectives feature exists because of this generosity.
- **[Claire Vo](https://github.com/ChatPRD)** for curating [lennys-podcast-transcripts](https://github.com/ChatPRD/lennys-podcast-transcripts) on GitHub—clean structure made integration straightforward.

---

**Status:** Active | **License:** MIT | **Author:** [@mostly-coherent](https://github.com/mostly-coherent)
