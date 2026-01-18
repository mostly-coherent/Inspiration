# Inspiration

> **Your thinking is accumulating in AI conversations—Inspiration surfaces the patterns and relationships.**
> 
> If you've used Cursor or Claude Code for months, you've reasoned through problems, explored trade-offs, had breakthroughs. That thinking is scattered across hundreds of conversations, but it contains patterns (what you keep circling back to) and relationships (how different projects connect).
>
> Inspiration uses semantic search to find patterns and reveals relationships: what you keep circling back to, how your thinking has evolved, what connects across different projects.

![Type](https://img.shields.io/badge/Type-Tool-purple)
![Status](https://img.shields.io/badge/Status-Active-green)
![Stack](https://img.shields.io/badge/Stack-Next.js%2015%20%7C%20Python%20%7C%20Claude-orange)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue)

<img src="https://raw.githubusercontent.com/mostly-coherent/Inspiration/main/public/screenshots/homepage.png" alt="Inspiration - Main Interface" width="800">

**New:** [Lenny's Podcast Integration](#whats-new) — Connect your thinking with 280+ expert episodes. Semantic search across both your conversations and expert wisdom to inspire outward exploration.

---

## Why This Exists

I built this for myself. After months of using Cursor, I realized my best problem-solving was happening in conversations with Claude—but I had no way to see patterns across those conversations.

Questions I couldn't answer:
- "Am I circling the same problem from different angles?"
- "How has my approach to architecture evolved over time?"
- "What connects this project to work I did three months ago?"

Every conversation with Claude is you reasoning through problems. Before AI assistants, that thinking was invisible. Now it's captured—but without structure, you can't see the relationships. Inspiration analyzes your conversations to reveal how your thinking connects over time.

What you can discover:
- *"I've been circling this problem for months without realizing it"*
- *"Three months ago I was focused on frontend, now it's all system design—I didn't notice the shift"*
- *"I keep hitting the same edge case across different projects"*

**Example:** Run Theme Explorer on 6 months of conversations. See a theme like "Developer tooling for async workflows." Zoom in: background jobs, webhooks, event-driven architecture. The synthesis shows it appeared in 12 conversations across 4 projects. You've been dancing around the same problem—maybe it's time to build a unified solution.

---

## Who This Is For

You'll find this useful if:
- You use Cursor or Claude Code as a thinking partner (not just autocomplete)
- You've had that moment: *"I solved this before... where was that conversation?"*
- You're curious what patterns emerge across months of conversations
- You want to see how your thinking has evolved over time

**Not for you if:** You use Cursor or Claude Code just for autocomplete and cut-and-dry coding. Inspiration is for people who have conversations with AI while building—reasoning through problems, exploring trade-offs, working through decisions.

---

## What Makes It Different

Inspiration is designed to work with your chat history over time:
- Works across tools (Cursor, Claude Code)
- Becomes more useful the longer you use it
- Local-first architecture (your data stays on your machine)
- Semantic search, not just text matching
- Personalized to how you actually work

After several months of use, your Inspiration contains patterns specific to your workflow—connections between projects, recurring problems you didn't notice, evolution in your approach.

---

## Privacy

**Local-first.** Your data stays on your machine. Optional Supabase sync (your own instance). Only analyzed content sent to LLM APIs. No tracking, no telemetry. [Open source](https://github.com/mostly-coherent/Inspiration).

---

## What You Get

| Mode | What It Does |
|------|-------------|
| **Theme Explorer** | See patterns in your thinking—3 tabs: Patterns, Unexplored, Counter-Intuitive |
| **Ideas** | Surface recurring pain points worth building solutions for |
| **Insights** | Extract learnings worth sharing (blogs, tweets, notes) |
| **Seek** | "I want to build X"—find similar examples from your own history |
| **Expert Perspectives** | Connect your thinking with 280+ Lenny's Podcast episodes via semantic search |

---

## How It Gets More Useful

| Timeline | What You Can Do |
|----------|-----------------|
| **Day 1** | Semantic search across 280+ Lenny's Podcast episodes for expert insights |
| **Month 1** | See patterns across your conversations; discover how your themes relate to expert discussions |
| **Month 6** | Your patterns connect with expert knowledge—relationships you didn't know existed |

The more you use Inspiration, the more useful it becomes. Your Library accumulates, patterns emerge, connections between your thinking and expert knowledge become visible.

---

<details>
<summary><strong>Requirements</strong></summary>

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

</details>

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

**Value on Day 1:** Even with zero personal conversations, Inspiration includes 280+ Lenny's Podcast episodes (product leaders, engineers, founders). You can immediately ask: *"What do experts say about pricing strategy?"* or *"How did successful PMs approach their first PM role?"*

As you add your own conversations, your patterns connect with expert knowledge—discovering how your thinking relates to industry expertise.

**API Keys:** Anthropic required. OpenAI optional (enables expert perspectives). Supabase optional (for 500MB+ histories).

**Typical costs:** $0.50–$5 first sync, $0.10–$2 per scan. Estimates shown before each run.

---

## How It Works

Inspiration indexes your Cursor and Claude Code conversations (optionally to a Vector DB for large histories). It uses semantic search to recognize patterns and reveals relationships through semantic analysis. Claude synthesizes these into structured ideas or insights. Your Library grows over time, the Theme Explorer surfaces patterns, and Unexplored Territory shows topics you've discussed but haven't captured yet.

---

## What's Intellectually Interesting Here

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

<details>
<summary><strong>Technical Implementation</strong></summary>

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

---

## What's New

**Lenny's Podcast Integration**

Your patterns now connect with expert knowledge. Semantic search across both your conversations and 280+ Lenny's Podcast episodes—**Claire Vo** (ChatPRD), **Dylan Field** (Figma), **Elena Verna** (Lovable, Miro), and other product leaders, engineers, and founders. Discover how expert thinking relates to your own patterns, inspiring outward exploration. Click through to YouTube timestamps.

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

---

## Community

Early users are finding it useful for discovering patterns they'd missed manually.

*Have something to share? Tag #InspirationDiscoveries on Twitter or open a discussion on GitHub.*

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
