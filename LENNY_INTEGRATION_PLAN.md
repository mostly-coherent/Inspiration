# Lenny's Podcast Expert Integration — Build Plan

> **Feature:** Expert Perspectives from Lenny's Podcast Archive
> **Created:** 2026-01-13
> **Status:** Phase 1-4 Complete (Indexing in progress with v2 source)

---

## Overview

| Aspect | Detail |
|--------|--------|
| **Feature Name** | Expert Perspectives (Lenny's Podcast Integration) |
| **Core Value** | Complement user's unique work patterns with expert validation/challenges |
| **Storage** | Local pre-computed embeddings (~74MB .npz file) |
| **Trigger** | Syncs alongside Memory refresh |
| **Source** | [ChatPRD/lennys-podcast-transcripts](https://github.com/ChatPRD/lennys-podcast-transcripts) (GitHub) |
| **Rich Metadata** | Guest name, episode title, YouTube URL, duration, view count |

---

## Why This Feature?

**Current Inspiration App:**
- **Memory** = Your personal coding conversations (private, unique to you)
- **Library** = Ideas/insights extracted from YOUR work

**What Lenny's Archive Adds:**
- **Expert Knowledge** = Industry-proven frameworks, mental models, and hard-won lessons
- **Validation Layer** = Cross-reference your ideas against expert opinions
- **Challenge Layer** = Expert contrarian takes that question your patterns

**The magic:** Your personal insights (unique to you) + expert validation/expansion (proven by others) = **richer, more robust ideas**

---

## What We're NOT Building

| ❌ NOT Building | Why |
|-----------------|-----|
| Lenny search engine | Commoditized — Google/Perplexity does this better |
| Framework library | Anyone can build this in one-shot, low value |
| "What would expert say?" standalone mode | Requires user to know what to search |

**We ARE building:** Expert perspectives that **complement YOUR themes** — integrated into Theme Explorer and Counter-Intuitive.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Inspiration App                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Memory    │    │   Library   │    │   Theme Explorer    │ │
│  │ (Supabase)  │    │   (Local)   │    │                     │ │
│  │             │    │             │    │  ┌───────────────┐  │ │
│  │ Your chats  │    │ Your ideas  │    │  │   Patterns    │  │ │
│  │ 2GB+ scale  │    │ & insights  │    │  │ + Expert      │  │ │
│  └─────────────┘    └─────────────┘    │  │   Perspectives│  │ │
│         │                   │          │  └───────────────┘  │ │
│         │                   │          │  ┌───────────────┐  │ │
│         ▼                   ▼          │  │Counter-Intuit.│  │ │
│  ┌─────────────────────────────────┐   │  │ + Expert      │  │ │
│  │         Generation Engine       │   │  │   Challenges  │  │ │
│  │  (RAG from Memory + Lenny)      │   │  └───────────────┘  │ │
│  └─────────────────────────────────┘   └─────────────────────┘ │
│                   │                              ▲              │
│                   │                              │              │
│                   ▼                              │              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Lenny Archive (LOCAL)                       │   │
│  │  ┌─────────────────┐  ┌──────────────────────────────┐  │   │
│  │  │ .txt transcripts│  │ lenny_embeddings.npz (74MB)  │  │   │
│  │  │ (lossless)      │  │ + lenny_metadata.json        │  │   │
│  │  └─────────────────┘  └──────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Storage Decision: Local vs Supabase

| Corpus | Size | Storage | Rationale |
|--------|------|---------|-----------|
| **Memory** (Cursor chat) | 2GB+ | Supabase pgvector | Too large for local |
| **Lenny** (podcasts) | 25MB (~12K chunks) | **Local .npz** | Small enough for numpy search (<50ms) |

**Benefits of local storage:**
- No ongoing cloud costs
- Works offline
- Fast (12K vectors = <50ms search)
- One-time embedding cost (~$1.50)

---

## Phases

### Phase 1: Local Lenny Indexing Pipeline

**Goal:** Index 280 episodes into searchable local embeddings

| Task | Description | Files |
|------|-------------|-------|
| 1.1 | Create transcript parser (speaker turns, timestamps) | `engine/common/lenny_parser.py` |
| 1.2 | Create local embedding indexer | `engine/scripts/index_lenny_local.py` |
| 1.3 | Create local search function | `engine/common/lenny_search.py` |
| 1.4 | Add Lenny config to `config.json` | `data/config.json` |
| 1.5 | Test: Verify search returns relevant results | Manual test |

**Outputs:**
- `data/lenny_embeddings.npz` — Pre-computed embeddings (~74MB)
- `data/lenny_metadata.json` — Episode/chunk metadata

**Verification:**
```bash
# Index archive
python3 engine/scripts/index_lenny_local.py

# Test search
python3 -c "from engine.common.lenny_search import search; print(search('user onboarding activation'))"
```

**Effort:** 2-3 days

---

### Phase 2: Unified Sync (Memory + Lenny)

**Goal:** When user syncs Memory, also check for new Lenny episodes

| Task | Description | Files |
|------|-------------|-------|
| 2.1 | Add Lenny sync to existing sync flow | `engine/scripts/sync_messages.py` |
| 2.2 | Detect new/modified episodes (file hash) | `engine/scripts/index_lenny_local.py` |
| 2.3 | Update API to return Lenny sync status | `src/app/api/sync/route.ts` |
| 2.4 | Update Scoreboard to show episode count | `src/components/ScoreboardHeader.tsx` |

**Verification:**
- Add new .txt file to archive folder
- Click "Refresh Memory"
- Verify new episode is indexed
- Verify Scoreboard shows updated count

**Effort:** 1 day

---

### Phase 3: Theme Explorer — Expert Perspectives

**Goal:** For each theme, show relevant expert quotes + episode links

| Task | Description | Files |
|------|-------------|-------|
| 3.1 | Create API endpoint for expert perspectives | `src/app/api/expert-perspectives/route.ts` |
| 3.2 | Create Python function to find relevant expert quotes | `engine/common/expert_perspectives.py` |
| 3.3 | Update Theme card UI to show expert section | `src/components/ThemeCard.tsx` (or equivalent) |
| 3.4 | Add "Related Episodes" links | Theme Explorer UI |

**UI Mockup:**
```
┌─────────────────────────────────────────────────────────────┐
│ Theme: User Onboarding Friction                             │
├─────────────────────────────────────────────────────────────┤
│ Your Pattern: You frequently discuss activation dropoff...  │
│                                                             │
│ 12 items in Library                                         │
├─────────────────────────────────────────────────────────────┤
│ 💡 Expert Perspectives                              [v]     │
│ ─────────────────────────────────────────────────────────── │
│ "Growth can amplify great PMF but can't fix bad PMF.        │
│  If you have core product issues, growth team will not      │
│  be able to fix them for you."                              │
│  — Elena Verna                                              │
│                                                             │
│ "Superhuman's activation threshold is reaching 3 aha        │
│  moments in the first session."                             │
│  — Rahul Vohra                                              │
│                                                             │
│ 📎 Related Episodes: Elena Verna, Rahul Vohra, Bangaly Kaba │
└─────────────────────────────────────────────────────────────┘
```

**Verification:**
- Open Theme Explorer → Patterns tab
- Select a theme
- Verify "Expert Perspectives" section appears
- Verify quotes are relevant to theme
- Verify episode links are correct

**Effort:** 2-3 days

---

### Phase 4: Counter-Intuitive — Expert Challenges

**Goal:** Enhance counter-perspectives with actual expert contrarian takes

| Task | Description | Files |
|------|-------------|-------|
| 4.1 | Create function to find contrarian expert quotes | `engine/common/expert_challenges.py` |
| 4.2 | Update Counter-Intuitive API to include expert takes | `src/app/api/items/themes/route.ts` |
| 4.3 | Update Counter-Intuitive tab UI | `src/components/CounterIntuitiveTab.tsx` |

**UI Enhancement:**
```
┌─────────────────────────────────────────────────────────────┐
│ Counter-Intuitive                                           │
├─────────────────────────────────────────────────────────────┤
│ Your Pattern: "Always ship fast, iterate later"             │
│                                                             │
│ 🔄 Reflection Prompt (AI-generated):                        │
│ "What if shipping slower led to faster overall progress?"   │
│                                                             │
│ 🎯 Expert Challenge:                                        │
│ "If we AB test without a hypothesis and A beats B, we're    │
│  stuck with B forever. We had teams doing 80% running the   │
│  ball down the field and 20% passes. Now we do 80% passes." │
│  — Brian Chesky                                             │
│                                                             │
│ 📎 Episode: Brian Chesky on Running Airbnb                  │
└─────────────────────────────────────────────────────────────┘
```

**Verification:**
- Open Theme Explorer → Counter-Intuitive tab
- Select a pattern
- Verify "Expert Challenge" section appears with relevant quote
- Verify quote genuinely challenges (not just supports) the pattern

**Effort:** 1-2 days

---

## File Changes Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| **P1** | `engine/common/lenny_parser.py`<br>`engine/scripts/index_lenny_local.py`<br>`engine/common/lenny_search.py` | `data/config.json` |
| **P2** | — | `engine/scripts/sync_messages.py`<br>`src/app/api/sync/route.ts`<br>`src/components/ScoreboardHeader.tsx` |
| **P3** | `src/app/api/expert-perspectives/route.ts`<br>`engine/common/expert_perspectives.py` | Theme Explorer UI components |
| **P4** | `engine/common/expert_challenges.py` | `src/app/api/items/themes/route.ts`<br>`src/components/CounterIntuitiveTab.tsx` |

---

## Data Schema

### `data/lenny_metadata.json` (v2 with rich metadata)

```json
{
  "version": 2,
  "format": "github",
  "indexed_at": "2026-01-13T...",
  "source_path": "data/lenny-transcripts",
  "episodes": [
    {
      "id": "brian-chesky",
      "filename": "transcript.md",
      "guest_name": "Brian Chesky",
      "title": "Brian Chesky's new playbook",
      "youtube_url": "https://www.youtube.com/watch?v=4ef0juAMqoE",
      "video_id": "4ef0juAMqoE",
      "description": "Brian Chesky is the co-founder and CEO of Airbnb...",
      "duration_seconds": 4408.0,
      "duration": "1:13:28",
      "view_count": 381905,
      "word_count": 15234,
      "chunk_count": 47,
      "chunk_start_idx": 0,
      "file_hash": "abc123..."
    }
  ],
  "chunks": [
    {
      "idx": 0,
      "episode_id": "brian-chesky",
      "speaker": "Brian Chesky",
      "timestamp": "00:00:00",
      "content": "Way too many founders apologize..."
    }
  ],
  "stats": {
    "total_episodes": 269,
    "total_chunks": 44371,
    "total_words": 4071099,
    "with_rich_metadata": 269
  }
}
```

### `data/lenny_embeddings.npz`

```python
{
  "embeddings": np.array(shape=(12000, 1536)),  # All chunk embeddings
  "chunk_indices": np.array(shape=(12000,))     # Maps to metadata.chunks[idx]
}
```

### `data/config.json` addition

```json
{
  "lenny_archive": {
    "enabled": true,
    "path": "Lennys Podcast Public Archive ",
    "last_indexed": "2026-01-13T...",
    "episode_count": 280,
    "chunk_count": 12000
  }
}
```

---

## Chunking Strategy

The transcripts have natural structure:

```
Brian Chesky (00:00:00):
Way too many founders apologize for how they want to run the company...

Lenny (00:01:01):
Today my guest is Brian Chesky...
```

**Chunking rules:**
1. Split by speaker turn (regex: `^([\w\s\.]+?) \((\d{2}:\d{2}:\d{2})\):`)
2. If turn > 1000 tokens, split at paragraph boundaries
3. Each chunk includes speaker name + timestamp for attribution
4. Target chunk size: 500-800 tokens (optimal for embedding)
5. **Lossless:** Full transcript preserved in `lenny_metadata.json` chunks array

---

## Milestones & Estimates

| Phase | Milestone | Effort | Dependencies |
|-------|-----------|--------|--------------|
| **P1** | `lenny_embeddings.npz` exists, search works | 2-3 days | None |
| **P2** | Unified sync, Scoreboard shows episode count | 1 day | P1 |
| **P3** | Theme Explorer shows Expert Perspectives | 2-3 days | P1 |
| **P4** | Counter-Intuitive shows Expert Challenges | 1-2 days | P1, P3 |

**Total estimate:** 6-9 days

---

## Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| **Lossless** | Original .txt files preserved, full transcript recoverable from metadata |
| **Searchable** | Query returns relevant expert quotes in <100ms |
| **Unified sync** | New episodes auto-indexed on Memory refresh |
| **Expert relevance** | Expert perspectives match user's theme (manual QA) |
| **Challenge quality** | Expert challenges genuinely contrast user's pattern (manual QA) |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 74MB .npz file slow to load | Slow app startup | Lazy-load on first search; cache in memory |
| Expert quotes not relevant | Poor UX | Tune similarity threshold; add "not helpful" feedback |
| Embedding API costs | $1-2 for 12K chunks | One-time cost; only re-embed changed files |
| .docx files in archive | Some episodes missing | Convert .docx to .txt or skip (2 files) |

---

## Open Questions

1. **Episode linking:** Link to local file path, or to Lenny's Dropbox URL for full episode?
2. **Expert photo/avatar:** Show guest photos in UI? (Would need to source separately)
3. **Topic extraction:** Pre-tag episodes with topics? Or rely purely on semantic search?

---

## Archive Info

**Primary Source (v2):** [ChatPRD/lennys-podcast-transcripts](https://github.com/ChatPRD/lennys-podcast-transcripts) (GitHub)

**Original Source:** [Lenny's Public Dropbox Folder](https://www.dropbox.com/scl/fo/yxi4s2w998p1gvtpu4193/AMdNPR8AOw0lMklwtnC0TrQ?rlkey=mwwj2oygno72le23o6kvzq5wq&e=1&st=msd4xizs&dl=0)

**Lenny's words (from LinkedIn):**
> "Here are the full transcripts from all 320 of my podcast episodes. It's been super fun for me to play with AI to extract insights from this data. Now you can too. My only ask is that if you do something cool with it, just let me know. I'll keep this folder updated as each new episode comes out."

**Content characteristics:**
- 269 episodes (GitHub repo, and growing)
- Full transcripts with timestamps
- Speaker labels (guest name + "Lenny")
- High-signal, edited for clarity
- Guests: Founders, growth experts, product leaders, authors
- **v2 bonus:** YAML frontmatter with title, YouTube URL, duration, view count

---

## Progress Log

### 2026-01-13: Initial Implementation

**Completed:**
- ✅ Phase 1: Local Lenny Indexing Pipeline
  - `engine/common/lenny_parser.py` — Transcript parser (speaker turns, timestamps)
  - `engine/scripts/index_lenny_local.py` — Local embedding indexer
  - `engine/common/lenny_search.py` — Local search function
  - Config schema updated in `engine/common/config.py` and `data/config.json`
  - **Initial indexing:** 284 episodes from Dropbox .txt files

- ✅ Phase 2: Unified Sync + Scoreboard
  - `src/app/api/lenny-stats/route.ts` — API endpoint for Lenny stats
  - `src/components/ScoreboardHeader.tsx` — Shows "🎙️ X expert episodes" badge

- ✅ Phase 3: Theme Explorer — Expert Perspectives
  - `src/app/api/expert-perspectives/route.ts` — API endpoint
  - `src/app/themes/page.tsx` — Expert Perspectives section in theme expansion

- ✅ Phase 4: Counter-Intuitive — Expert Challenges
  - `src/components/CounterIntuitiveTab.tsx` — Expert Challenge section per suggestion

### 2026-01-13: Switched to GitHub Source (v2)

**Why switch?**
- GitHub repo has YAML frontmatter with rich metadata (guest, title, youtube_url, duration)
- Better UI: "Brian Chesky — 'The future of Airbnb'" + YouTube link
- Easier sync: `git pull` vs manual Dropbox download
- Same content, better structure

**Changes:**
- ✅ Cloned [ChatPRD/lennys-podcast-transcripts](https://github.com/ChatPRD/lennys-podcast-transcripts) to `data/lenny-transcripts/`
- ✅ Updated parser to handle YAML frontmatter + markdown format
- ✅ Updated metadata schema to include `title`, `youtube_url`, `video_id`, `duration`
- ✅ Updated search results to include rich metadata
- ✅ Updated API endpoints to return rich metadata
- ✅ Updated UI components to show episode title + YouTube link
- ⏳ Re-indexing with new source: 269 episodes, ~44K chunks, ~4.1M words

**Pending:**
- ⏳ Indexing completion (~44K chunks, estimated 30-45 min total)
- ⏳ End-to-end testing once indexing completes

### 2026-01-13: Unified Sync + Git Pull UI

**Completed:**
- ✅ `src/app/api/lenny-sync/route.ts` — New API endpoint for Lenny sync
  - `POST`: Git pull + re-index if changes detected
  - `GET`: Quick status check (repo exists, last commit date)
- ✅ `src/components/ScoreboardHeader.tsx` updated:
  - Auto-syncs Lenny archive when Memory sync completes
  - Manual 🔄 button next to "🎙️ X expert episodes" badge
  - Sync status indicator ("✓ Up to date", "✓ X episodes indexed")

**User Flow:**
1. Click "🔄 Sync" on Memory card → Memory syncs → Lenny auto-syncs
2. Or: Click 🔄 next to Lenny badge → Syncs just Lenny archive

## Next Steps

1. ✅ Build plan created
2. ✅ Phase 1-4 implemented
3. ✅ Switched to GitHub source (v2) with rich metadata
4. ✅ Unified Sync + Git Pull UI implemented
5. ⏳ Wait for indexing to complete
6. ⏳ Test Expert Perspectives in Theme Explorer (verify YouTube links)
7. ⏳ Test Expert Challenges in Counter-Intuitive tab

## Backlog (Saved to PLAN.md)

| ID | Feature | Priority |
|----|---------|----------|
| LENNY-1 | YouTube timestamp deep-links (00:15:30 → ?t=930) | HIGH |
| LENNY-2 | View count badge (🔥 for >500K views) | MEDIUM |
| LENNY-3 | "More from this guest" link | MEDIUM |
| LENNY-4 | Browse Experts page | LOW |
| LENNY-5 | RAG from Lenny during Generation | LOW |
| LENNY-6 | "Related Experts" for each theme | LOW |
| LENNY-7 | Last synced timestamp in UI | LOW |
