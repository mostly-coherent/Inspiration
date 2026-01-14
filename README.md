# ✨ Inspiration

> **Turn your AI coding conversations into a mirror for your thinking.**
> If you treat AI as a thinking partner (not just a code generator), you've been having months of conversations about what matters to you. Inspiration helps you see the patterns.
> 
> Works with **Cursor** and **Claude Code** chat history.

![Type](https://img.shields.io/badge/Type-Tool-purple)
![Status](https://img.shields.io/badge/Status-Active-green)
![Stack](https://img.shields.io/badge/Stack-Next.js%2015%20%7C%20Python%20%7C%20Claude-orange)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue)
![Fast Start](https://img.shields.io/badge/Fast%20Start-~90%20seconds-brightgreen)

<img src="public/screenshots/homepage.png" alt="Inspiration - Main Interface" width="800">

> **🎙️ NEW: [Lenny's Podcast Integration](#-whats-new)** — 280+ expert episodes now enrich your themes with industry wisdom. [Learn more ↓](#-whats-new)

---

## 🧠 Who This Is For

**You're the right person for this if:**
- You use **Cursor or Claude Code** as a **thinking partner**, not just an autocomplete tool
- You've had that moment: *"I solved this before... where was that conversation?"*
- You keep notes, journals, or a "second brain"—but your AI chats aren't in it yet
- You're curious about **meta-analysis**: *"What patterns emerge when I look at 6 months of my conversations?"*
- You get excited by self-reflection: *"What was I thinking about 3 months ago vs. now?"*

**This tool is for pattern seekers and reflective builders.**

Agentic coding fundamentally changed how we think and learn. Instead of searching StackOverflow or reading docs, we *converse* with AI about problems. Instead of solo debugging, we *collaborate* with Claude to explore solutions. Each conversation captures not just code, but **your reasoning, your context, your evolving understanding of problems**.

**That conversation history is a goldmine of your intellectual growth—if you can mine it.**

If you just want to ship code fast and don't care about longitudinal self-knowledge, this probably isn't for you. But if you're intellectually curious about your own thinking—if the idea of **"semantic search over your own conversations"** or **"LLM-synthesized themes of your interests"** sounds compelling—keep reading.

---

## 🔒 Privacy First

**Your data stays yours:**
- ✅ **Local-first:** Chat history stays on your machine—Inspiration reads it directly
- ✅ **Optional cloud sync:** Supabase Vector DB only if *you* configure it with your own instance
- ✅ **API usage:** Only analyzed message content sent to LLM APIs (Anthropic/OpenAI) for generation
- ✅ **No tracking:** Zero analytics, no telemetry, no data collection by this app
- ✅ **Open source:** Full transparency—[audit the code yourself](https://github.com/mostly-coherent/Inspiration)

**You control everything:** Your API keys, your optional cloud storage, what gets indexed. This is a tool for self-reflection, not a service that stores your data.

---

## 💡 What You Get

| Mode | What It Does | Why It's Interesting |
|------|-------------|---------------------|
| **🔭 Theme Explorer** | See patterns in your thinking—3 tabs: Patterns, Unexplored, Counter-Intuitive | Meta-cognition: What themes keep surfacing? What's missing? What should you challenge? |
| **💡 Ideas** | Surface recurring pain points worth building solutions for | Pattern recognition: Which of your 20 ideas keeps coming up in different contexts? |
| **✨ Insights** | Extract learnings worth sharing (blogs, tweets, research sparks) | Knowledge synthesis: What have you learned that's worth teaching others? |
| **🔍 Seek** | "I want to build X"—find similar examples from your own history | Self-search: Mine your past conversations for evidence and context |
| **🎙️ Expert Wisdom** | A growing 280+ expert episodes from Lenny's Podcast integrated into Theme Explorer | Validation: See how industry experts think about the same themes you're exploring |

**The shift to agentic coding means your conversation history is now a record of your thinking process.**

Before AI assistants, your problem-solving happened in your head—invisible and lost. Now it's captured in every Cursor/Claude Code conversation. But without structure, it's just noise. Inspiration turns that noise into signal.

This isn't just about generating ideas—it's about **understanding your own intellectual trajectory**. What were you curious about 6 months ago? What patterns keep recurring? What did you learn but forget? Agentic coding made your thinking visible. Inspiration makes it analyzable.

---

## 📋 Requirements

| Requirement | Version/Details |
|-------------|-----------------|
| **Operating System** | macOS or Windows (Linux support coming soon) |
| **Node.js** | 18.18.0+ (for Next.js 15) |
| **Python** | 3.10+ (3.11+ recommended) |
| **Disk Space** | 100MB–2GB (scales with chat history size) |
| **API Keys** | Anthropic (required), OpenAI (optional), Supabase (optional for 500MB+ history) |
| **Chat History** | Cursor or Claude Code with existing conversations |

**Platform Notes:**
- Cursor chat history auto-detected on macOS and Windows
- Claude Code JSONL history supported on all platforms
- Cloud deployment (Vercel): Read-only mode—can't sync local chat history

---

## 🚀 Quick Start (~90 seconds)

```bash
# Clone & install
git clone https://github.com/mostly-coherent/Inspiration.git
cd Inspiration
npm run bootstrap   # One command: checks prereqs + installs deps
npm run dev
```

**→ Open http://localhost:3000/onboarding-fast**

The **Fast Start** gets you to your first insights in ~90 seconds:

| Step | What Happens | Time |
|------|-------------|------|
| 1. Auto-detect | Finds your Cursor DB, shows size + density | ~3s |
| 2. API Key | Paste one key (Anthropic/OpenAI/OpenRouter) | ~10s |
| 3. Generate | Creates your Theme Map from local SQLite | ~60s |
| **Done!** | See top 5 themes + unexplored territory | 🎉 |

**No Supabase required.** Fast Start reads directly from your local Cursor database.

### Two Paths

| Path | For Who | What You Need |
|------|---------|---------------|
| **⚡ Fast Start** | First-time users, quick exploration | 1 LLM key (Anthropic/OpenAI/OpenRouter) |
| **🔧 Full Setup** | Power users, large histories (500MB+) | LLM key + OpenAI (embeddings) + Supabase |

### API Keys

| Key | Fast Start | Full Setup | What It Enables |
|-----|------------|------------|-----------------|
| **Anthropic** | ✅ or | ✅ Yes | Theme synthesis, generation |
| **OpenAI** | ✅ or | ✅ Yes | Embeddings, dedup, semantic search |
| **OpenRouter** | ✅ | Optional | 500+ models from 60+ providers |
| **Supabase** | ❌ Not needed | Optional | Scale to 2GB+ history with instant search |

> **Fast Start:** One key → Theme Map in 90 seconds. No Vector DB.  
> **Full Setup:** All keys → Full Library, semantic search, generation modes.

### 💰 Typical Costs

| Activity | Estimated Cost | What It Does |
|----------|----------------|-------------|
| **First sync** | $0.50–$5.00 | Indexes 3-6 months of chat history (one-time) |
| **Daily scan (24h)** | $0.10–$0.50 | Generates 3-5 ideas or insights from yesterday |
| **Weekly scan (7d)** | $0.50–$2.00 | Generates 10-15 items from last week |
| **Theme Explorer** | $0.05–$0.20 | Synthesizes patterns from existing Library |
| **Unexplored Territory** | $0.20–$1.00 | Auto-enriches missing topics (per run) |

*Costs vary by history size, LLM model, and Library size. The app shows cost estimates before each run. With performance optimizations (IMP-15/16/17), typical costs are 50-80% lower than naive implementations due to topic filtering and embedding caching.*

---

## ✨ Features

- **📚 Library System** — Accumulated ideas/insights with automatic deduplication and categorization
- **🧭 Unexplored Territory** — Find topics you discuss frequently but haven't captured yet; one-click "Enrich Library"
- **🎙️ Expert Wisdom (NEW!)** — 280+ episodes from Lenny's Podcast indexed locally; see expert perspectives on your themes
- **📄 Pagination** — Browse large libraries efficiently (50 items per page)
- **💰 Cost Estimation** — See estimated API cost before running generation
- **⚡ Optimized Harmonization** — pgvector RPC + parallel processing for 20-60x faster saves
- **⚙️ Time Presets** — Daily (24h), Sprint (14d), Month (30d), Quarter (90d) scans
- **🧠 Vector Memory** — Scale to 2GB+ chat history with Supabase pgvector (optional)
- **🔄 Multi-Source Support** — Auto-detects Cursor and Claude Code on macOS and Windows
- **🎨 Voice Matching** — Golden examples + voice guides for authentic style

---

## 🎯 How It Works

1. **Extract** — Reads from Cursor (SQLite) and Claude Code (JSONL) chat histories, automatically detecting both sources
2. **Index** — Optionally sync to Vector DB for massive histories
3. **Search** — Semantic queries find relevant conversations across months
4. **Synthesize** — Claude distills patterns into structured ideas or shareable insights
5. **Accumulate** — Library grows over time—value compounds
6. **Reflect** — Theme Explorer groups items dynamically for self-reflection
7. **Discover** — Unexplored Territory shows topics to explore next; one-click enrichment

---

<details>
<summary><strong>🤔 Why not just ask Claude directly?</strong> (Click to expand)</summary>

**You could** manually search and ask:
- ❌ Search Cursor history (basic text search, no semantic understanding)
- ❌ Copy/paste conversations into Claude (context limit ~200K tokens = 1-2 weeks max)
- ❌ Ask "What patterns do you see?" (one-off answer, no deduplication, no tracking)
- ❌ Repeat process every time you want insights (doesn't scale)

**Inspiration automates:**
- ✅ **Unlimited semantic search** — 2GB+ chat history with vector similarity
- ✅ **Deduplication before presentation** — No repeated ideas cluttering your Library
- ✅ **Accumulating library** — Value compounds over time as Library grows
- ✅ **Cross-session synthesis** — See patterns across 6+ months of conversations
- ✅ **One-click Theme Explorer** — Dynamic grouping + LLM synthesis of your thinking
- ✅ **Unexplored Territory detection** — Auto-finds topics you discuss but haven't captured
- ✅ **Performance optimizations** — 275x fewer API calls, 50-80% cost reduction via topic filtering

**The difference:** Manual = one-off queries that don't scale. Inspiration = longitudinal intelligence system that grows smarter as you use it.

**The compound value:** Each time you run generation, your Library grows. Theme Explorer gets richer. Unexplored Territory finds new gaps. It's not just a query tool—it's a second brain that learns your intellectual patterns.

</details>

---

## 🎯 Why This Is Intellectually Stimulating

**Agentic coding created a new form of thinking-out-loud.** Every conversation with Claude is you reasoning through problems, exploring trade-offs, iterating on solutions. Before AI assistants, this thinking happened in your head—invisible and lost. Now it's captured in chat logs, but scattered and unsearchable.

**Inspiration makes that captured thinking analyzable.**

**For reflective engineers and pattern seekers:**

- **Self-Discovery Through Data** — Run Theme Explorer and discover: *"I didn't realize I've been circling this problem for 6 months"*
- **Meta-Analysis** — It's like running analytics on your own brain. What patterns emerge when you have 500+ conversations indexed?
- **Evolution Tracking** — See how your thinking has changed: *"3 months ago I was focused on frontend performance, now I'm obsessed with system design"*
- **Pattern Recognition** — Theme Explorer's 3 tabs show patterns (what exists), unexplored territory (what's missing), and counter-intuitive prompts (what to challenge)
- **Compound Knowledge** — Your Library grows with every conversation. Watch your intellectual progress quantified.
- **Externalized Cognition** — Agentic coding externalized your thought process. Inspiration helps you learn from it.

**The "Aha Moment" User Story:**

> You run Theme Explorer on 6 months of conversations. At the "Forest" view (broad themes), you see: **"Developer tooling for async workflows."**
> 
> Zooming in shows specific themes: background jobs, webhooks, event-driven architecture.
> 
> The LLM synthesis reveals: *"This pattern appears in 12 conversations across 4 different projects. You keep encountering the same pain point: coordinating async tasks across services."*
> 
> **Your reaction:** *"Holy shit. I should build a unified async orchestration library. This is what I've been dancing around for months."*

**That's the value:** Seeing your own thinking from 10,000 feet.

---

## 🧠 What's Interesting Here

<details>
<summary>For the technically curious (click to expand)</summary>

### Engineering

| Aspect | What's Novel |
|--------|--------------|
| **Multi-Source Extraction** | Reverse-engineered Cursor's "Bubble" format (SQLite) and Claude Code's JSONL storage—both auto-detected with zero configuration |
| **Semantic Self-Search** | RAG over your *own* chat history for self-reflection (not documentation or StackOverflow) |
| **Dedup Before Presentation** | Generate N×1.5 items, deduplicate via embedding similarity before returning |
| **Hybrid Local/Cloud** | Local SQLite → Supabase Vector DB sync; works offline, scales to 2GB+ |

### Product

| Aspect | What's Interesting |
|--------|-------------------|
| **Library as Scoreboard** | The accumulated Library is the value prop—not each session. "Is my Library growing?" creates compound value |
| **Cross-Session Reflection** | Most dev tools focus on "do more"—this focuses on "learn from what you did" |
| **Introspection as Data Science** | Treating self-reflection as an analytics problem |

### What's NOT Groundbreaking

- **RAG pipeline:** Embed → vector search → retrieve → LLM synthesize (textbook pattern)
- **Item bank with clustering:** Cosine similarity grouping (standard knowledge management)
- **Multi-LLM fallback:** Anthropic → OpenAI → OpenRouter (standard resilience)

The innovation is **what** you're searching (your own AI coding conversations for meta-cognition), not **how** you're searching it.

</details>

---

## 🎙️ What's New

**Lenny's Podcast Integration!** Your themes are now enriched with wisdom from a growing 280+ expert episodes—top product leaders, engineers, and founders who've built iconic products. When you explore a theme, see what experts like **Claire Vo** (ChatPRD), **Graham Weaver** (Alpine Investors), **Dylan Field** (Figma), **Elena Verna** (Lovable, Miro), and **Sander Schulhoff** (Learn Prompting) have said about similar topics. Click through to YouTube timestamps for the exact moment.

**How it works:**
- 44,000+ searchable transcript segments indexed locally (~74MB embeddings)
- Auto-syncs new episodes when you refresh Memory (pulls from [ChatPRD's archive](https://github.com/ChatPRD/lennys-podcast-transcripts), curated by [Claire Vo](https://github.com/cvolawless))
- Expert perspectives surface in **Patterns** and **Counter-Intuitive** tabs
- No extra API cost—runs entirely on local embeddings

**Longitudinal Intelligence (3/3 complete):** Theme Explorer is fully operational with three tabs:
- **Patterns** — See what themes exist in your Library + expert validation
- **Unexplored** — Find topics you discuss frequently but haven't extracted yet
- **Counter-Intuitive** — LLM-generated reflection prompts + expert contrarian takes

---

## 📚 Going Deeper

See `ARCHITECTURE.md` for system design, data flow, and technical details.

---

## 💬 Support & Community

**Need help?**
- 📖 **Documentation:** See `ARCHITECTURE.md` for technical deep dive and `CLAUDE.md` for AI assistant context
- 🐛 **Bug reports:** [GitHub Issues](https://github.com/mostly-coherent/Inspiration/issues)
- 💡 **Feature requests:** [GitHub Issues](https://github.com/mostly-coherent/Inspiration/issues) (label: enhancement)
- 💬 **Discussions:** [GitHub Discussions](https://github.com/mostly-coherent/Inspiration/discussions)

**Contributing:**
- Pull requests welcome! See open issues tagged `good first issue`
- Share your experience: What patterns did Theme Explorer reveal? What did Unexplored Territory find?

---

**Status:** Active | **License:** MIT | **Author:** [@mostly-coherent](https://github.com/mostly-coherent)
