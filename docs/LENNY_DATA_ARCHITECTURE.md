# Lenny's Podcast Data Architecture

> How Lenny's Podcast content is sourced, processed, and used across projects in this workspace.

## Source of Truth

### Upstream Repository

| Property | Value |
|----------|-------|
| **Repository** | [ChatPRD/lennys-podcast-transcripts](https://github.com/ChatPRD/lennys-podcast-transcripts) |
| **Episodes** | **303+** (README says 269, but actual count is 303+) |
| **Format** | Markdown with YAML frontmatter |
| **Structure** | `episodes/{guest-name}/transcript.md` |
| **Index** | `index/` folder with topic-based episode lists |

### Local Clone

| Property | Value |
|----------|-------|
| **Location** | `Production_Clones/lennys-podcast-transcripts/` |
| **Fork** | `github.com/<your-username>/lennys-podcast-transcripts` |
| **Upstream** | `github.com/ChatPRD/lennys-podcast-transcripts` |
| **Episodes** | 303 |

**Update Process:**
```bash
cd Production_Clones/lennys-podcast-transcripts
git fetch upstream
git merge upstream/main
```

---

## Data Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SOURCE OF TRUTH                               │
│         ChatPRD/lennys-podcast-transcripts (303+ episodes)          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         LOCAL CLONE                                  │
│      Production_Clones/lennys-podcast-transcripts (303 episodes)    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
            ┌─────────────────────┴─────────────────────┐
            ▼                                           ▼
┌───────────────────────────┐             ┌───────────────────────────┐
│      pm-research          │             │       Inspiration         │
│   Import Pipeline         │             │    Indexing Pipeline      │
│                           │             │                           │
│ • Chunk transcripts       │             │ • Parse transcripts       │
│ • Generate embeddings     │             │ • Generate embeddings     │
│   (OpenAI text-embed-3)   │             │   (OpenAI text-embed-3)   │
│ • Extract structured data │             │ • Build Knowledge Graph   │
│   (Claude Haiku)          │             │   (Claude)                │
└─────────────┬─────────────┘             └─────────────┬─────────────┘
              │                                         │
              ▼                                         ▼
┌───────────────────────────┐             ┌───────────────────────────┐
│     SUPABASE DATABASE     │             │       LOCAL FILES         │
│                           │             │    (Inspiration/data/)    │
│ Tables:                   │             │                           │
│ • lenny_chunks (51,288)   │             │ • lenny_metadata.json     │
│ • lenny_lessons (82,288)  │             │ • lenny_embeddings.npz    │
│ • lenny_frameworks(11,809)│             │ • lenny-kg/*.json         │
│ • lenny_books (1,134)     │             │                           │
│ • lenny_media (921)       │             │ Uploaded to:              │
│                           │             │ Supabase Storage bucket   │
│ Episodes: 305             │             │ (lenny-embeddings)        │
│ (includes naming variants)│             │                           │
│                           │             │ Episodes: 303             │
└───────────────────────────┘             └───────────────────────────┘
```

---

## Data Stores

### 1. Supabase Database (Shared)

**URL:** `lefeqopprdhajweyzemz.supabase.co`

| Table | Rows | Description |
|-------|------|-------------|
| `lenny_chunks` | 51,288 | Chunked transcripts with vector embeddings |
| `lenny_lessons` | 82,288 | Extracted actionable lessons |
| `lenny_frameworks` | 11,809 | PM frameworks and methodologies |
| `lenny_books` | 1,134 | Book recommendations |
| `lenny_media` | 921 | Movie/TV/documentary mentions |
| `extraction_tracking` | 51,286 | Progress tracking for extraction |
| `kg_entities` | 30,970 | Knowledge graph entities (from Inspiration) |
| `kg_relations` | 25,639 | Knowledge graph relationships |

**RPC Functions:**
- `match_lenny_chunks(query_embedding, match_threshold, match_count)` - Vector similarity search

### 2. Supabase Storage

**Bucket:** `lenny-embeddings`

| File | Size | Description |
|------|------|-------------|
| `lenny_embeddings.npz` | 262 MB | NumPy archive of all embeddings |
| `lenny_metadata.json` | 33 MB | Episode metadata and chunk info |

### 3. Local Files (Inspiration)

**Location:** `Inspiration/data/`

| File/Folder | Description |
|-------------|-------------|
| `lenny_metadata.json` | Episode metadata (303 episodes, 50,815 chunks) |
| `lenny_embeddings.npz` | Embeddings in NumPy format |
| `lenny-kg/` | Knowledge Graph exports |
| `lenny-kg/lenny_kg_entities.json` | 30,970 entities |
| `lenny-kg/lenny_kg_mentions.json` | 39,332 mentions |
| `lenny-kg/lenny_kg_relations.json` | 25,639 relations |
| `lenny-kg/lenny_kg_manifest.json` | KG metadata |

---

## App-by-App Usage

### pm-research

**Purpose:** PM research assistant with RAG over Lenny's Podcast

| Environment | Data Source | Access Method |
|-------------|-------------|---------------|
| Local | Supabase `lenny_chunks` | Direct DB query |
| Cloud (Vercel) | Supabase `lenny_chunks` | Direct DB query |

**Features:**
- Vector search via `match_lenny_chunks` RPC
- Aggregation queries (books, frameworks, lessons, media)
- Query routing (aggregation vs Q&A)

**Scripts:**
- `scripts/migrate_lenny_to_supabase.py` - Import transcripts to Supabase
- `scripts/extract_structured_insights.py` - Extract books/frameworks/lessons
- `scripts/import_missing_episodes.py` - Add missing episodes

---

### Inspiration

**Purpose:** Personal knowledge management with AI synthesis

| Environment | Data Source | Access Method |
|-------------|-------------|---------------|
| Local | `data/lenny_*.json/npz` | Local file read |
| Cloud (Vercel) | Supabase Storage | Download to `/tmp` |
| Fallback | GitHub Releases | Download if storage unavailable |

**Features:**
- Expert perspectives search (via Python engine)
- Knowledge Graph visualization
- Cross-KG matching (user knowledge vs Lenny knowledge)

**Scripts:**
- `scripts/download-lenny-embeddings.sh` - Fetch embeddings
- `scripts/download-lenny-kg.sh` - Fetch KG data
- `engine/scripts/import_lenny_kg.py` - Import KG to Supabase

---

### pm-interview-prep

**Purpose:** PM interview preparation with framework suggestions

| Environment | Data Source | Access Method |
|-------------|-------------|---------------|
| Local | Supabase `lenny_chunks` | Direct DB query |
| Cloud (Vercel) | Supabase `lenny_chunks` | Direct DB query |

**Features:**
- Vector search for interview-relevant content
- Framework recommendations from `lenny_frameworks`
- Book suggestions from `lenny_books`

**Shared Data:** Uses same Supabase instance as pm-research

---

## Episode Count Summary

| Location | Count | Notes |
|----------|-------|-------|
| Upstream (ChatPRD) | 303+ | README outdated (says 269) |
| Local Clone | 303 | Synced with upstream |
| Supabase `lenny_chunks` | 305 | Includes naming variants |
| Inspiration metadata | 303 | From separate indexing |
| Supabase Storage | 303 | Mirror of Inspiration data |

**Why 305 vs 303?**

The Supabase database has 305 unique `episode_id` values due to naming variations during import (e.g., `elena-verna-2.0` vs `elena-verna-20`). These represent the same episodes with different naming conventions.

---

## Updating Lenny's Content

### 1. Sync from Upstream

```bash
cd Production_Clones/lennys-podcast-transcripts
git fetch upstream
git merge upstream/main
```

### 2. Update pm-research Database

```bash
cd pm-research
python3 scripts/import_missing_episodes.py  # Import new episodes
python3 scripts/extract_structured_insights.py --missing-only  # Extract insights
```

### 3. Update Inspiration Embeddings

```bash
cd Inspiration
# Re-index with Python engine (generates new embeddings)
python3 engine/scripts/index_lenny.py

# Or download pre-built from GitHub Releases
./scripts/download-lenny-embeddings.sh
./scripts/download-lenny-kg.sh
```

### 4. Update Supabase Storage (for cloud deployment)

```bash
cd Inspiration
./scripts/upload-to-supabase-storage.sh
```

---

## Knowledge Graph Details

The Lenny Knowledge Graph contains extracted entities and relationships:

| Entity Type | Count (sample) |
|-------------|----------------|
| person | 202 |
| concept | 264 |
| pattern | 189 |
| project | 115 |
| tool | 99 |
| workflow | 88 |
| problem | 43 |

**Total:** 30,970 entities, 39,332 mentions, 25,639 relations

---

## Related Documentation

- [LENNY_KG_DISTRIBUTION.md](./LENNY_KG_DISTRIBUTION.md) - KG export/import
- [LENNY_INCREMENTAL_INDEXING.md](./LENNY_INCREMENTAL_INDEXING.md) - Incremental updates
- [LENNY_KG_IMPORT_SUMMARY.md](./LENNY_KG_IMPORT_SUMMARY.md) - Import process
- [GITHUB_RELEASE_INSTRUCTIONS.md](./GITHUB_RELEASE_INSTRUCTIONS.md) - Release process

---

*Last updated: 2026-02-04*
