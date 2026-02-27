# Inspiration — Plan

> **Vision:** A thinking partner for builders who use AI coding tools. Turns your Cursor/Claude Code conversations into a mirror that shows patterns, surfaces blind spots, and asks uncomfortable questions.

---

## What's Been Built (v1–v6)

All core infrastructure is operational. Here's the stack of completed capabilities:

| Version | What It Added | Status |
|---------|--------------|--------|
| **v1** | Idea/Insight generation from chat history, Library system, cross-platform Cursor DB extraction, LLM support (Anthropic/OpenAI/OpenRouter) | ✅ Done |
| **v2** | Item-centric generation, configurable dedup, Vector DB (Supabase pgvector) for large histories | ✅ Done |
| **v3** | Library-centric UI, Scoreboard Header, two-panel layout, full config exposure in Settings | ✅ Done |
| **v3.1** | Dedicated Library View for 100+ items | ✅ Done |
| **v4** | Library declutter (merge similar, auto-archive), Theme Explorer (Patterns, Unexplored, Counter-Intuitive) | ✅ Done |
| **v5** | Coverage Intelligence — gap detection, suggested runs, cost estimation | ✅ Done |
| **v2.0 KG** | Knowledge Graph extraction (entities + relations), Entity Explorer, Graph View — **Note:** User KG quality was poor; expert KG (Lenny) is useful | ✅ Done |
| **v2.1** | Smart Onboarding — Quick Start (90s for >500MB), Full Setup with scope slider | ✅ Done |
| **v6** | Multi-Source Memory (workspace docs, TODOs), Socratic Mode (Reflect tab), removed user KG from scoreboard | ✅ Done |
| **v7** | Builder Assessment — cross-project awareness, evidence-backed weakness analysis, response tracking | ✅ Done |

**Current Theme Explorer tabs:** Patterns | Reflect | Unexplored

---

## What to Build Next

### Quick Wins (< 1 hour each)

| ID | Feature | Why | Effort | Status |
|----|---------|-----|--------|--------|
| LENNY-1 | **YouTube timestamp deep-links** — Convert `00:15:30` → `?t=930` for exact moment links | One click → exact podcast moment. High value. | LOW | ✅ Done |
| FAST-2 | **Cost estimation before Theme Map** — Show "This will cost ~$0.12" before generation | Builds trust. Already specced. | LOW | ✅ Done |
| ~~FAST-3~~ | ~~**Share Theme Map** — One-click export to PNG/PDF~~ | ~~Enables viral loop.~~ Deprioritized. | LOW | Removed |

### v7: Builder Assessment — Critical Thought Partner

**Tagline:** "See what you're avoiding, where you're blind, and what the evidence says about you as a builder."

**Status:** Done
**Created:** 2026-02-23
**Completed:** 2026-02-26

**Problem:** Inspiration is a retrospective museum curator, not a sparring partner. It finds what you thought about (themes, clusters) but doesn't challenge what you're *doing* — your weaknesses, blind spots, and behavioral patterns. The Socratic Mode asks gentle probing questions cached for 24 hours. A real thought partner should be direct, evidence-backed, and confrontational when warranted.

**What it does:** Three phases that progressively deepen Inspiration's ability to surface builder weaknesses:

**Phase 1: Expand Socratic Engine's Vision** — Scan all projects in the workspace for PLAN.md, BUILD_LOG.md, README.md and feed project state (what's planned, what's done, what's stale) into the Socratic engine alongside existing data sources. This immediately makes Socratic questions sharper because they can reference actual project state.

**Phase 2: Builder Assessment Mode** — A new intentionally-triggered feature that generates a deep, evidence-backed assessment of the builder's weaknesses and blind spots. Not questions — direct assertions with specific evidence. Uses all available data: Library clusters, temporal shifts, expert matches, unexplored areas, AND project context from Phase 1. The LLM prompt is fundamentally different from Socratic: "Identify their top 3-5 weaknesses as a builder. Each must be backed by specific evidence."

**Phase 3: Response Tracking + Longitudinal Comparison** — After seeing an assessment, the builder can respond ("I agree, here's my plan" or "I disagree, here's why"). Responses are stored. The next assessment includes prior responses so the LLM can say: "Last time you acknowledged X. Here's what actually happened since then."

**Design principles:**
- Let the LLM discover patterns organically — no pre-defined behavioral archetypes
- No new metrics dashboards — the assessment IS the output, in prose
- Read project docs at generation time — no new database schemas for workspace metrics
- User-triggered, not auto-generated — this is a deliberate act of self-examination

| ID | Feature | Phase | Status |
|----|---------|-------|--------|
| BA-1 | **Project Context Scanner** — Walk workspace dirs, parse PLAN.md/BUILD_LOG.md/README.md, return project snapshots | 1 | ✅ Done |
| BA-2 | **Enrich Socratic Context** — Add `projectContext` to SocraticContext, feed into existing question generation | 1 | ✅ Done |
| BA-3 | **Builder Assessment API** — `GET /api/themes/builder-assessment` with assessment-specific LLM prompt | 2 | ✅ Done |
| BA-4 | **Builder Assessment Prompt** — Direct, evidence-backed weakness identification (assertions, not questions) | 2 | ✅ Done |
| BA-5 | **Builder Assessment UI** — Section in Reflect tab with "Run Builder Assessment" trigger + rendered results | 2 | ✅ Done |
| BA-6 | **Assessment Storage** — `builder_assessments` Supabase table for results + user responses | 3 | ✅ Done |
| BA-7 | **Response UI** — User can respond to each weakness; responses stored for next assessment | 3 | ✅ Done |
| BA-8 | **Longitudinal Comparison** — Next assessment includes prior assessment + responses as LLM context | 3 | ✅ Done |

**Key Files (new):**
- `src/lib/projectScanner.ts` — Workspace project doc scanner
- `src/app/api/themes/builder-assessment/route.ts` — Builder Assessment API
- `src/components/BuilderAssessment.tsx` — Assessment results UI

**Key Files (modified):**
- `src/lib/socratic.ts` — Add projectContext to SocraticContext + aggregation
- `src/components/ReflectTab.tsx` — Add Builder Assessment section

---

### LIB-9: Learning Trajectory (Deferred)

**Problem:** Theme Explorer shows your thinking as a snapshot. None of the three tabs (Patterns, Unexplored, Reflect) show how your thinking has *changed over time*. That's the missing dimension.

**What it does:** Tracks how interests shift over time — "Your interests shifted from X → Y → Z over 6 months."

**Why it matters:**
- Completes the temporal dimension that Socratic Mode's `temporal` questions already reference
- The data is already there (Library items have `first_seen` and `last_seen` dates)
- Feeds directly into sharper Socratic questions ("X disappeared from your thinking 3 months ago — why?")

**Requirements:**
- Analyze Library item clusters ACROSS time periods (not just current snapshot)
- Plot themes on a timeline showing emergence, peak, and decline
- Surface which topics grew, shrank, or disappeared entirely
- Integrate with Socratic engine as a data source for `temporal` category questions

**Dependencies:**
- Requires 3-6 months of data to be meaningful (vs. 1 month for other features)
- Library must have 50+ items with date metadata
- The temporal shift detection in `socratic_engine.py` (`aggregate_temporal_shifts()`) is currently keyword-based — Learning Trajectory would upgrade this to proper embedding-based clustering over time windows

**Implementation approach:**
1. Time-window clustering: Divide Library items into monthly buckets, cluster each bucket
2. Track cluster evolution: Which clusters appear, grow, shrink, or vanish across windows
3. Visualization: Timeline chart in Theme Explorer (or new tab)
4. Socratic integration: Feed trajectory data into `aggregate_socratic_context()` for richer temporal questions

**Estimated effort:** MEDIUM (1-2 weeks)

---

## Deprioritized (Not Building)

These existed in the old backlog. Explicitly parking them with rationale:

| Area | Why Deprioritized |
|------|-------------------|
| **User Knowledge Graph improvements** (graph simplification, schema cleanup, entity noise reduction) | User KG produced useless results. Investing more before fixing signal-to-noise doesn't make sense. Pages still accessible via direct URL. |
| **Cross-KG Intelligence** (XKG-1 through XKG-19) | Ambitious vision but depends on user KG quality. Socratic Mode already provides expert-vs-user comparison through Lenny semantic search without needing KG. |
| **Coverage Intelligence enhancements** (auto-queue, smart batching, priority weighting) | Optimization of a working feature. Not impactful for thinking partner direction. |
| **Performance backlog** (pagination, bundle analysis, token counting, log rotation) | Only worth touching when real performance problems emerge with real users. |
| **Demo Mode** (ONB-7) | Only matters for adoption growth. Not a thinking partner improvement. |
| **Ollama Support** (FAST-1) | Quality < frontier LLMs. First impression matters more than offline capability. |
| **Prompt editing risk mitigation** (validation, preview, version history) | Low risk, low impact. |

---

## v6: Socratic Mode + Multi-Source Memory

**Tagline:** "A mirror that asks questions instead of just showing answers"

**Status:** Implementation Complete
**Created:** 2026-02-06

### Overview

Two features that deepen Inspiration's role as a thinking partner:

1. **Multi-Source Memory Enrichment** — Expand Memory beyond chat history to include workspace documents (markdown files, code comments, TODOs)
2. **Socratic Mode (Reflect Tab)** — Generate probing reflection questions from Theme Explorer data that challenge patterns, surface blind spots, and prompt self-reflection

### Design Decisions

**Ideas evaluated and killed:**

| Idea | Verdict | Rationale |
|------|---------|-----------|
| Real-time nudges in Cursor | **Killed** | Risk of annoyance too high. Can't know user's cognitive state. Even pull-based adds cognitive load. |
| Conversational dialogue about patterns | **Killed** | Chat fatigue. Thinkers value tranquility for deep reflection, not another chatbot. |
| Accountability/follow-through tracking | **Killed** | Not everything needs follow-through. High annoyance risk at wrong moments. |
| Energy/quality signal tracking | **Killed** | Interesting for some, not valuable enough for most users. |

**Key architectural decision:** Build Socratic mode on **themes** (which work well), not the **user KG** (which produced useless results). The user's side is represented by Library clusters and Unexplored topics. Expert side uses Lenny semantic search.

### Phase 1: Multi-Source Memory Enrichment

| ID | Feature | Status |
|----|---------|--------|
| MS-1 | **Workspace Scanner** — Scan workspaces for .md files, TODO/FIXME comments | ✅ Done |
| MS-2 | **Ingestion Adapter** — Feed workspace docs into Vector DB pipeline (`source="workspace_docs"`) | ✅ Done |
| MS-3 | **Sync Integration** — `sync_workspace_docs()` added to `sync_new_messages()` | ✅ Done |
| MS-4 | **Source Stats API** — `/api/brain-stats/sources` returns workspace docs count | ✅ Done |
| MS-5 | **Scoreboard UI** — Memory source breakdown shows "Docs: N files" | ✅ Done |

### Phase 2: Socratic Mode (Reflect Tab)

| ID | Feature | Status |
|----|---------|--------|
| SOC-1 | **Data Aggregation** — Patterns, unexplored, counter-intuitive, library stats, expert matches, temporal shifts | ✅ Done |
| SOC-2 | **Question Generation** — LLM prompt generates 8-12 probing questions with evidence | ✅ Done |
| SOC-3 | **API Route** — `GET/POST /api/themes/socratic` with 24h cache | ✅ Done |
| SOC-4 | **Reflect Tab UI** — Question cards with category badges, difficulty, actions | ✅ Done |
| SOC-5 | **Cross-Source Expert Matching** — Top patterns matched against Lenny's archive | ✅ Done |
| SOC-6 | **Counter-Intuitive Merge** — Absorbed into Reflect tab | ✅ Done |

**Question Categories:** Pattern, Gap, Tension, Temporal, Expert, Alignment
**Difficulty levels:** Comfortable (4-5), Uncomfortable (3-4), Confrontational (1-2)

**Key Files:**
- `engine/common/workspace_scanner.py` — Workspace file scanner
- `engine/common/socratic_engine.py` — Data aggregation + question generation
- `engine/prompts/socratic_questions.md` — LLM prompt template
- `src/app/api/themes/socratic/route.ts` — API route
- `src/components/ReflectTab.tsx` — Reflect tab UI

### UI Changes

| Change | Description |
|--------|-------------|
| Removed user KG from scoreboard | "Your Knowledge Graph" section removed entirely |
| Folded Lenny KG into Archive | Expert KG stats within "Wisdom from Lenny's Podcasts" section |
| Memory source breakdown | Shows "Docs: N files" alongside Cursor and Claude Code counts |
| Counter-Intuitive → Reflect tab | Theme Explorer now: Patterns, Unexplored, Reflect |
| Backward compatibility | Old `?tab=counterIntuitive` URLs redirect to `?tab=reflect` |

---

**Last Updated:** 2026-02-23 (v7 Builder Assessment in progress; LIB-9 deferred)
