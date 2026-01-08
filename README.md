# ✨ Inspiration

> Turn your Cursor AI conversations into actionable ideas, shareable insights, and a searchable knowledge library.

![Type](https://img.shields.io/badge/Type-Tool-purple)
![Status](https://img.shields.io/badge/Status-Active-green)
![Stack](https://img.shields.io/badge/Stack-Next.js%2015%20%7C%20Python%20%7C%20Claude%20%7C%20Supabase-orange)

<img src="public/screenshots/homepage.png" alt="Inspiration - Main Interface" width="800">

*Extract ideas and insights from your Cursor chat history with AI-powered analysis*

---

## Why This Exists

Heavy Cursor users accumulate months of AI conversations—patterns emerge that are easy to miss in the moment. **Inspiration** turns that history into a searchable "second brain":

- **Ideas Mode:** Surface recurring pain points worth building solutions for
- **Insights Mode:** Extract learnings worth sharing (blogs, tweets, posts, deeper research)
- **Seek Mode:** "I want to build X—do I have similar examples from the past?"

The more you use Cursor, the more valuable this becomes.

---

## 🧠 What's Interesting Here

### Engineering

| Aspect | What's Novel | What's Standard |
|--------|--------------|-----------------|
| **Cursor DB Extraction** | Reverse-engineered Cursor's undocumented "Bubble" architecture—messages are fragmented across `composerData` and `bubbleId` keys with timestamps requiring interpolation | — |
| **Semantic Self-Search** | RAG over your own chat history for self-reflection ("Seek" mode) | Standard pgvector + OpenAI embeddings |
| **Dedup Before Presentation** | Generate N×1.5 items, deduplicate via embedding similarity before returning | Standard cosine similarity |
| **Hybrid Local/Cloud** | Local SQLite → Supabase Vector DB sync; works offline, scales to 2GB+ | Standard sync pattern |

### Product

| Aspect | What's Interesting | What's Straightforward |
|--------|-------------------|----------------------|
| **Library as Scoreboard** | The accumulated Library is the value prop—not each generation session. "Is my Library growing with quality items?" creates compound value | — |
| **Cross-Session Reflection** | Most dev tools focus on "do more"—this focuses on "learn from what you did" | Standard prompt templates |
| **Voice Matching** | Golden examples + voice guides for authentic style | Few-shot prompting |

### What's NOT Groundbreaking

- **RAG pipeline:** Embed → vector search → retrieve → LLM synthesize (textbook pattern)
- **Item bank with clustering:** Cosine similarity grouping (standard knowledge management)
- **Multi-LLM fallback:** Anthropic → OpenAI → OpenRouter (standard resilience)

The innovation is **what** you're searching (your own Cursor conversations for self-reflection), not **how** you're searching it.

---

## 🚀 Quick Start

```bash
# 1. Install
git clone https://github.com/mostly-coherent/Inspiration.git
cd Inspiration
npm install
pip install -r engine/requirements.txt

# 2. Configure
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
# Optional: Add SUPABASE_URL/KEY for massive history support (>100MB)

# 3. Run
npm run dev
```

**→ Open http://localhost:3000**

> **Note:** E2E tests are optional. See `playwright.config.ts.example` if you want to run them.

---

## ✨ Features

- **💡 Ideas Generation:** Extract prototype and tool ideas worth building from chat history
- **✨ Insights Generation:** Surface learnings worth sharing—blogs, tweets, posts, research sparks
- **🔍 Seek (Use Case Search):** "I want to build X"—find similar examples from your own history
- **📚 Library System:** Deduplicated, categorized storage with automatic grouping via semantic similarity
- **⚙️ Preset Modes:** Daily (24h), Sprint (14d), Month (30d), Quarter (90d) scans
- **🎯 Smart Deduplication:** Generate more items, deduplicate before returning
- **🧠 Vector Memory:** Index >2GB of chat history with Supabase pgvector for instant search
- **🔄 Cross-Platform:** Auto-detects Cursor DB on macOS and Windows

---

## 🎯 How It Works

1. **Extract:** Reads your local Cursor database (`state.vscdb`), handling the complex "Bubble" message architecture
2. **Index (optional):** Sync to Supabase Vector DB for massive histories and instant semantic search
3. **Search:** Semantic queries find relevant conversations across months of chats
4. **Synthesize:** Claude Sonnet 4 distills patterns into structured ideas or shareable insights
5. **Accumulate:** Items save to your Library with deduplication—value compounds over time

---

## 🔮 What's Next

Active development focused on moving beyond single-session extraction toward longitudinal intelligence across your entire Cursor history. More to come.

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Technical context for AI assistants |
| `PLAN.md` | Product requirements and roadmap |
| `ARCHITECTURE.md` | System architecture and workflows |
| `BUILD_LOG.md` | Chronological development progress |

---

**Status:** Active | **Author:** [@mostly-coherent](https://github.com/mostly-coherent)
