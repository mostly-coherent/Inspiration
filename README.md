# ✨ Inspiration

> **Your Cursor conversations are a goldmine.** Stop losing those "aha" moments buried in months of AI chats.

![Type](https://img.shields.io/badge/Type-Tool-purple)
![Status](https://img.shields.io/badge/Status-Active-green)
![Stack](https://img.shields.io/badge/Stack-Next.js%2015%20%7C%20Python%20%7C%20Claude%20%7C%20Supabase-orange)

<img src="public/screenshots/homepage.png" alt="Inspiration - Main Interface" width="800">

---

## 💡 What You Get

| Mode | What It Does |
|------|-------------|
| **🔭 Theme Explorer** | See patterns in your thinking—zoom out to "forest" view, zoom in for details |
| **💡 Ideas** | Surface recurring pain points worth building solutions for |
| **✨ Insights** | Extract learnings worth sharing (blogs, tweets, research sparks) |
| **🔍 Seek** | "I want to build X"—find similar examples from your own history |

**The more you use Cursor, the more valuable this becomes.**

---

## 🚀 Quick Start (2 minutes)

```bash
# Clone & install
git clone https://github.com/mostly-coherent/Inspiration.git
cd Inspiration
npm install
pip install -r engine/requirements.txt

# Run
npm run dev
```

**→ Open http://localhost:3000**

That's it. The **onboarding wizard** handles everything else:

| Step | What Happens | You Need |
|------|-------------|----------|
| 1. Welcome | Detects your chat history size | Nothing |
| 2. API Keys | Enter your Anthropic key | [Get one free](https://console.anthropic.com/) |
| 3. Sync | Indexes your chats (< 1 min for most users) | Nothing |
| **Done!** | → Theme Explorer shows patterns in your thinking | 🎉 |

> **Supabase?** Only needed if your history is > 500MB. Most Cursor users don't need it.

> **Preview the wizard:** Visit `/onboarding?preview=true` to test without affecting data.

---

## ✨ Features

- **📚 Library System** — Accumulated ideas/insights with automatic deduplication and categorization
- **⚙️ Time Presets** — Daily (24h), Sprint (14d), Month (30d), Quarter (90d) scans
- **🧠 Vector Memory** — Scale to 2GB+ chat history with Supabase pgvector (optional)
- **🔄 Cross-Platform** — Auto-detects Cursor DB on macOS and Windows
- **🎨 Voice Matching** — Golden examples + voice guides for authentic style

---

## 🎯 How It Works

1. **Extract** — Reads your local Cursor database, handling the complex "Bubble" message format
2. **Index** — Optionally sync to Vector DB for massive histories
3. **Search** — Semantic queries find relevant conversations across months
4. **Synthesize** — Claude distills patterns into structured ideas or shareable insights
5. **Accumulate** — Library grows over time—value compounds
6. **Reflect** — Theme Explorer groups items dynamically for self-reflection

---

## 🧠 What's Interesting Here

<details>
<summary>For the technically curious (click to expand)</summary>

### Engineering

| Aspect | What's Novel |
|--------|--------------|
| **Cursor DB Extraction** | Reverse-engineered Cursor's internal "Bubble" format—messages fragmented across `composerData` and `bubbleId` keys (not publicly documented) |
| **Semantic Self-Search** | RAG over your *own* chat history for self-reflection |
| **Dedup Before Presentation** | Generate N×1.5 items, deduplicate via embedding similarity before returning |
| **Hybrid Local/Cloud** | Local SQLite → Supabase Vector DB sync; works offline, scales to 2GB+ |

### Product

| Aspect | What's Interesting |
|--------|-------------------|
| **Library as Scoreboard** | The accumulated Library is the value prop—not each session. "Is my Library growing?" creates compound value |
| **Cross-Session Reflection** | Most dev tools focus on "do more"—this focuses on "learn from what you did" |

### What's NOT Groundbreaking

- **RAG pipeline:** Embed → vector search → retrieve → LLM synthesize (textbook pattern)
- **Item bank with clustering:** Cosine similarity grouping (standard knowledge management)
- **Multi-LLM fallback:** Anthropic → OpenAI → OpenRouter (standard resilience)

The innovation is **what** you're searching (your own Cursor conversations for self-reflection), not **how** you're searching it.

</details>

---

## 🔮 What's Next

Active development focused on moving beyond single-session extraction toward longitudinal intelligence across your entire Cursor history.

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Technical context for AI assistants |
| `PLAN.md` | Product requirements and roadmap |
| `ARCHITECTURE.md` | System architecture and workflows |
| `BUILD_LOG.md` | Development progress |

---

**Status:** Active | **Author:** [@mostly-coherent](https://github.com/mostly-coherent)
