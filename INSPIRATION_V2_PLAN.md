# Inspiration v2.0+ — Future Roadmap

> **Version:** 2.1 (Simplicity Pivot)
> **Last Updated:** 2026-01-20 (Updated: Strategic Pivot to Search-First Explorer)
> **Status:** 🏗️ In Progress (Refactoring for Simplicity)
> **Philosophy:** Less is More. High Signal, Low Noise.

> **CRITICAL UPDATE (2026-01-20):** We are pivoting away from the "Backbone & Satellite" visualization (which created a "hairball" graph) to a **"Search-First Explorer"** model. The goal is to start clean and let users "browse" connections, rather than overwhelming them with a map of everything.

---

## 🎯 Strategic Pivot: Search-First Explorer

**The Problem:** The previous "Map of Everything" approach (Backbone & Satellite) tried to render too much. 15,000+ nodes created a "hairball" that was visually impressive but practically useless. Users couldn't find signal amidst the noise.

**The Solution:** Pivot to a **"Search-First Explorer"** model.
1.  **Default View:** Empty or "Top 20 Galaxy" (clean, inviting).
2.  **Interaction:** User searches for a topic (e.g., "React").
3.  **Expansion:** System renders *only* that node and its direct neighbors (1-hop).
4.  **Browsing:** User clicks a neighbor to expand *its* connections.
5.  **Result:** User builds their own mental map path-by-path.

---

## 🎯 Recommended Priorities (Revised)

Based on the simplification plan, here are the new priorities:

### Tier 1: Simplification & Usability (Immediate)

| Priority | Feature | Rationale | Effort | Status |
|----------|---------|-----------|--------|--------|
| **P0** | **Graph Visualization Simplification** | Remove 2.5D/Layers, remove complex controls. Implement "Galaxy" default view. | 1-2 days | 🏗️ **In Progress** |
| **P1** | **Schema Simplification (Strict Whitelist)** | Restrict relations to 5 high-value predicates (USES, SOLVES, etc.). Drop free-text relations. | 2-3 days | ⏳ Pending |
| **P2** | **Entity Noise Reduction** | Update extraction prompts to aggressively filter "other" types. Reduce 5,000+ entities to high-signal core. | 2-3 days | ⏳ Pending |

### Tier 2: Search & Exploration (Follow-up)

| Priority | Feature | Rationale | Effort |
|----------|---------|-----------|--------|
| **P3** | **Interactive Expansion** | Clicking a node fetches and adds its neighbors to the graph (progressive loading). | 3-4 days |
| **P4** | **Search UI Integration** | Prominent search bar that drives the graph state. | 2-3 days |

---

## 🛑 Deprecated Architecture

### ❌ Backbone & Satellite Architecture (Deprecated)
*Replaced by Search-First Explorer.* The distinction between "Backbone" (Episodes) and "Satellites" (Conversations) added visual complexity without sufficient semantic value. We now treat all nodes equally in a unified graph.

### ❌ 2.5D Layered View (Deprecated)
*Removed for clarity.* The 3D/layered effect made interaction difficult and obscured connections. We revert to a clean, standard 2D force-directed layout.

---

## 🎯 Recommended Priorities (Old - For Reference)
*(Previous roadmap preserved below for historical context)*

Based on the current implementation state (15,449 entities, 10,898+ relations), here are the **recommended priorities** for future work:

### Tier 1: High Impact, Medium Effort (Build First)

| Priority | Feature | Rationale | Effort | Status |
|----------|---------|-----------|--------|--------|
| **P1** | **User Chat Indexing UX** (Iteration 2) | Let users build personal KG with progress UI, cost estimation, incremental sync | 6-8 hours | ✅ **COMPLETE** (2026-01-19) |
| **P1.5** | **Backbone & Satellite Architecture** (Phase 1-5) | Dual-layered graph visualization: Episodes as stable backbone, conversations as satellites | 2-3 weeks | ✅ **Complete** (2026-01-20) |
| **P1.6** | **User KG Quality Improvement** | Re-do user chat indexing with improved quality filters (current output is "useless") | 1-2 weeks | ⏳ **Pending** |
| **P2** | **Schema Evolution** (Phase 3) | Discover new entity types from 5,038 "other" entities without re-indexing | 2-3 weeks | ✅ **Complete** (2026-01-20) |

### Tier 2: High Value, Requires Volume (Build After Tier 1)

| Priority | Feature | Rationale | Effort |
|----------|---------|-----------|--------|
| **P3** | **Relationship Grouping** (Phase 4) | Canonicalize 10,898+ relations to prevent predicate explosion, improve queryability | 3-4 weeks | ✅ **Complete** (2026-01-20) |
| **P4** | **Cross-KG Semantic Matching** | Embedding-based similarity across User ↔ Lenny KGs (since string overlap = 0) | 4-6 weeks | ✅ **Complete** (2026-01-20) |

### Tier 3: Long-term Research (Defer Until Demand)

| Priority | Feature | Rationale | Effort |
|----------|---------|-----------|--------|
| **P5** | **Open-Schema Extraction** (Phase 5) | Extract without type constraints, discover types from clusters | 4-6 weeks |
| **P6** | **Fully Dynamic Schema** (Phase 6) | Automatic schema evolution with ML-based type classification | 8-12 weeks |

### ⏸️ Deferred (No String Overlap Found)

- **Cross-KG Connection (Phase 2)** — String-based deduplication found 0 overlaps. User and Lenny entities are named differently. Future alternative: semantic matching (P4 above).

---

## TL;DR — Future Features Only

> **Note:** v2.0 foundation is complete. See `PLAN.md` Knowledge Graph section for what's currently implemented.

**v2.0+ Future Features (⏳ NOT YET IMPLEMENTED):**
- ⏳ Open-Schema Extraction (extract without type constraints, discover types from content)
- ⏳ Fully Dynamic Schema (automatic schema evolution with minimal human intervention)

**v2.0+ Recently Completed (✅ IMPLEMENTED):**
- ✅ Cross-Source Semantic Matching (embedding-based entity similarity across User KG ↔ Lenny KG) — P4 Complete
- ✅ Schema Evolution (discover new entity types from "other" category) — P2 Complete
- ✅ Relationship Grouping (Dynamic Ontology - canonicalize relation predicates) — P3 Complete
- ⏳ Open-Schema Extraction (extract without type constraints, discover types from content)
- ⏳ Fully Dynamic Schema (automatic schema evolution with minimal human intervention)

---

## What Are Knowledge Graphs? (Background)

**Knowledge Graphs (KGs)** extract and connect **entities** (people, tools, concepts) and **relations** (how they interact) from text.

**Current Status:** ✅ **v2.0 Foundation Complete** — Knowledge Graph system operational with 15,449 entities (1,571 user + 13,878 expert) and 10,898+ relations. See `PLAN.md` Knowledge Graph section for complete implementation details.

**This Document:** Describes **future enhancements** (Phases 3-6) that are not yet implemented.

---

## v2.0+ Future Features

> **Note:** All features below are **NOT YET IMPLEMENTED**. They represent future enhancements to the existing v2.0 Knowledge Graph foundation.

> **For current implementation status, see `PLAN.md` Knowledge Graph section.**

**⏳ Future Enhancements (This Document):**

---

## Future User Flows (Not Yet Implemented)

> **Note:** These flows describe future enhancements. Current v2.0 implementation supports basic entity exploration and graph visualization.

### Future Flow: Semantic Cross-Referencing

```
1. User views their entity "multi-agent systems" in Entity Explorer
2. System uses embedding similarity to find related Lenny entities
3. Shows: "Related Expert Insights: 'AI agents' (similarity: 0.87)"
4. Clicks → Sees Lenny episodes discussing AI agents
5. Learns: How experts approach similar concepts
```

**Status:** ⏳ Future — Requires embedding-based similarity matching across sources

---

## Recommended Architecture: Dual-KG System with Hybrid Schema Evolution

**Core Strategy:** Build **two Knowledge Graphs** (User's Chat KG + Lenny's Expert KG) and connect them for cross-exploration, using a **Hybrid Schema Evolution** approach with triple-based foundation.

### Overview: Dual-KG System

| KG | Source | Purpose | Schema Strategy | Status |
|----|--------|---------|----------------|--------|
| **Lenny's Expert KG** | 303 podcast episodes | Knowledge discovery, expert insights | Entity-focused, wide/flat schema | ✅ Complete (13,878 entities) |
| **User's Chat KG** | Cursor + Claude Code chats | Context retrieval, decision tracking | Hierarchical & temporal schema | ✅ Complete (1,571 entities) |
| **Cross-KG Connection** | Both sources | Cross-exploration, validation | Unified entities via deduplication | ⏸️ Deferred (semantic matching future) |

**Key Principle:** Both KGs share the same base schema (7 types + "other") but use different extraction strategies based on content type.

### Recommended Approach: Hybrid Schema Evolution with Triple-Based Foundation

**Core Finding:** Start with triple-based extraction (Subject-Predicate-Object) as foundation, add fixed schema (7 types + "other"), explicitly canonicalize entities (CRITICAL), group relationships into dynamic ontology, periodically discover new types from content using 2025 methods, incrementally expand without full re-index.

**Why Triple-Based?**
- **LLM Native Language:** LLMs are trained on subject-verb-object structure, resulting in higher extraction accuracy
- **Machine Reasonability:** Enables multi-hop reasoning (e.g., "Brian Chesky → CEO of → Airbnb" + "Airbnb → uses → referral loops")
- **Interoperability:** Standard formats like RDF use triples, enabling easy data movement between tools
- **Industry Validation:** Neo4j's LLM Knowledge Graph Builder uses LangChain's `llm-graph-transformer` (triple-based), confirming this is the right foundation approach

### GraphRAG Pattern: Combining Vector Search + KG Reasoning

**Industry Trend:** Moving toward **GraphRAG (Graph-based Retrieval Augmented Generation)** — combining both approaches.

**How It Works:**
1. **Vector DB:** Find relevant starting point in podcast/chat logs (semantic search)
2. **Knowledge Graph:** Traverse related concepts, decisions, and code files (structured reasoning)
3. **Result:** AI that doesn't just "search" history, but understands evolution

**For Our Project:**
- **Current:** Using Supabase for both vector search (semantic search) and graph storage (KG)
- **Future:** Implement GraphRAG pattern — use vector search to find starting points, then traverse KG for reasoning
- **Benefit:** Best of both worlds — fast retrieval + structured reasoning

**Industry Validation:** Neo4j's GraphRAG Builder implements this exact pattern (vector search → KG traversal → RAG agent), confirming our architectural approach aligns with industry best practices.

---

## Future Build Timeline

> **Note:** Phases 0-1 (Foundation) are complete. See `PLAN.md` Knowledge Graph section for implementation details. This document describes Phases 3-6 (future enhancements).

---

### ⏸️ Phase 2: Cross-KG Connection (DEFERRED)

**Status:** ⏸️ **DEFERRED** (2026-01-19)

**Investigation Results:**
- Analyzed cross-source overlap: **0 exact matches**, **0 case-insensitive matches**
- User and Lenny entities are named differently (e.g., "multi-agent systems" vs "AI agents")
- String-based deduplication has **NO VALUE** (0 overlaps found)

**Decision:** Skip traditional cross-source deduplication. Keep KGs separate.

**Future Alternative:**
- ⏳ **Semantic Cross-Referencing** — Use embedding similarity to find related entities across sources
  - "You discussed X → Lenny talked about similar concept Y"
  - Requires embedding-based similarity matching (not string matching)
  - Higher value, significant effort

**See `PIVOT_LOG.md` for detailed decision rationale.**

---

## Backbone & Satellite Architecture (Dual-Layered Graph Visualization)

> **Purpose:** Transform Knowledge Graph visualization from flat graph into dual-layered architecture (Episodes as Backbone, Conversations as Satellites)
> **Status:** ✅ **Complete** (2026-01-20) — All phases implemented including 2.5D/Layered View
> **Rationale:** Addresses "hairball problem" by separating stable knowledge (podcasts) from dynamic activity (conversations)

### Overview

Transform the Knowledge Graph visualization from a flat graph into a **dual-layered architecture** where:
- **Backbone (Stable):** Podcast episodes, guests, and topics — fixed layout anchors
- **Satellites (Transient):** AI conversations that orbit specific episodes/concepts they reference

This architecture addresses the "hairball problem" by separating stable knowledge (podcasts) from dynamic activity (conversations).

### Current State Analysis

#### ✅ What We Have (After Phase 1)

1. **Episode Entities:** ✅ Created in `kg_entities` table (type='episode')
   - IDs: `"episode-{episode_slug}"`
   - Linked to `kg_episode_metadata` for rich metadata (YouTube URLs, guest names, etc.)

2. **Conversation Entities:** ✅ Created in both `kg_conversations` table (metadata) and `kg_entities` table (graph nodes)
   - IDs: `"conv-{message_id}"`
   - Stored as 'project' type entities in `kg_entities` for foreign key constraints
   - Temporal data: `date_month` (YYYY-MM-01), `date_day` (YYYY-MM-DD, nullable)

3. **Episode → Conversation Relations:** ✅ Created via `REFERENCES_EPISODE` relation type
   - Pattern: `episode-{slug} --[REFERENCES_EPISODE]--> conv-{message_id}`

#### ✅ What's Implemented (Phase 2)

1. **Layer Detection:** ✅ Automatic detection of backbone (episodes) vs satellite (conversations) vs regular nodes
2. **Circular Layout:** ✅ Backbone nodes arranged in fixed circular layout
3. **Visual Distinction:** ✅ Size (backbone 50% larger, satellites 30% smaller) and color (violet for episodes, cyan for conversations)
4. **Force-Directed Satellites:** ✅ Conversations orbit backbone nodes via force-directed layout

### Schema Design (Implemented)

**Decision:** Hybrid Approach (Option A) — Keep `kg_episode_metadata` for rich metadata, create `kg_entities` entries with `entity_type='episode'` for graph nodes.

**Rationale:**
- Preserves existing metadata structure
- Episodes become first-class graph nodes
- Can link via standard `kg_relations` table

**Migration:** `005_backbone_satellite_schema.sql` (✅ Complete)

### Implementation Phases

#### ✅ Phase 1: Foundation Schema (COMPLETE — 2026-01-19)

**Goal:** Create episode entities, conversation entities, and basic linking.

**Status:** ✅ **COMPLETE**

**Deliverables:**
- ✅ Episode entities in `kg_entities` (type='episode')
- ✅ Conversation entities in `kg_conversations` table
- ✅ Conversation entities in `kg_entities` (type='project', IDs: `conv-{message_id}`)
- ✅ `REFERENCES_EPISODE` relations in `kg_relations`
- ✅ Helper functions: `extract_date_from_timestamp()`, `extract_day_from_timestamp()`
- ✅ RPC functions: `get_conversations_by_date_range()`, `get_episodes_for_conversation()`

**Migration:** `005_backbone_satellite_schema.sql` deployed and verified

#### ✅ Phase 2: Visualization Layers (COMPLETE — 2026-01-19)

**Goal:** Separate backbone and satellite layers in GraphView.

**Status:** ✅ **COMPLETE**

**Deliverables:**
- ✅ Layer detection (`backbone`, `satellite`, `regular`)
- ✅ Circular layout for backbone nodes (episodes)
- ✅ Force-directed layout for satellites (conversations orbit backbone)
- ✅ Visual distinction: Size (backbone 50% larger, satellites 30% smaller) and color (violet for episodes, cyan for conversations)

**Implementation:**
- `GraphView.tsx`: Added `detectNodeLayers()`, `applyBackboneCircularLayout()`, layer-based rendering
- Automatic activation when backbone nodes (episodes) are present

**Enhancement Complete:**
- ✅ **2.5D/Layered View:** True layered rendering with podcasts on "base plate" (background layer) and conversations floating above (foreground layer) with render order separation. Includes shadows on backbone nodes, opacity adjustments, and layer-based sorting for visual depth.

#### ✅ Phase 3: Temporal Navigation (COMPLETE — 2026-01-20)

**Goal:** Timeline slider for time-scrubbing.

**Status:** ✅ **COMPLETE**

**Deliverables:**
- ✅ Timeline slider at bottom of graph view
- ✅ Date range filtering (min/max date detection, range selection)
- ✅ Dynamic graph assembly/disassembly based on date
- ✅ "Ghost" mode: Fade non-relevant episodes when clicking conversation
- ✅ API endpoints: `/api/kg/conversations-date-range`, `/api/kg/nodes-dates`

**Implementation:**
- `GraphView.tsx`: Added timeline slider UI, date range state, ghost mode toggle
- Date-based filtering in `applyFilters()` function
- Visual opacity changes based on ghost mode and date relevance

#### ✅ Phase 4: Semantic Concept Overlay (COMPLETE — 2026-01-20)

**Goal:** Embedding-based concept matching.

**Status:** ✅ **COMPLETE**

**Deliverables:**
- ✅ Semantic matching algorithm (RPC functions: `find_semantic_matches()`, `create_semantic_matches()`)
- ✅ Visual indicators for concept matches (amber/yellow gradient based on similarity)
- ✅ Concept overlay layer in graph (toggle to show/hide semantic matches)
- ✅ Synthesis generation pipeline (`generate_conversation_synthesis.py`)
- ✅ Match creation script (`create_semantic_matches.py`)

**Implementation:**
- Migration: `006_semantic_match_schema.sql` — Adds `SEMANTIC_MATCH` relation type and RPC functions
- Backend: Synthesis generation from context snippets, entity names, and relation types
- Frontend: `GraphView.tsx` — Visual styling for semantic match links (color, thickness based on similarity)
- API: `/api/kg/semantic-matches` — Returns semantic matches for visualization

**Note:** Requires episode entities to have embeddings for matching to work. Synthesis generation works with existing KG data (no full message content needed).

#### ✅ Phase 5: Summarization Nodes (COMPLETE — 2026-01-20)

**Goal:** Collapse conversations into synthesis nodes.

**Status:** ✅ **COMPLETE**

**Deliverables:**
- ✅ Synthesis generation pipeline (basic version complete, uses context snippets + entity names + relation types)
- ✅ Synthesis embeddings stored in `kg_conversations.synthesis_embedding`
- ✅ Collapsible conversation nodes (double-click to collapse/expand)
- ✅ Message-level detail view (double-click expands to fetch and display message-level subgraph)
- ✅ Visual indicators: Collapsed nodes show "S" indicator in detailed/metadata zoom modes
- ✅ Size reduction: Collapsed nodes are 50% of base size for visual distinction

**Implementation:**
- `GraphView.tsx`: Added `handleNodeDoubleClick` for collapse/expand toggle
- State management: `collapsedNodes`, `expandedMessageNodes`, `messageLevelData` track node states
- Message-level expansion: Fetches subgraph data via `/api/kg/subgraph` when expanding
- Visual rendering: Collapsed nodes render smaller with synthesis indicator
- UI controls: Info panel explains double-click interaction

**Note:** Synthesis generation currently uses context snippets + entity names + relation types. LLM-based synthesis can be added for richer summaries in future iterations.

### Technical Decisions

#### 1. Episode → Conversation Linking

**Decision:** Use `REFERENCES_EPISODE` relation type in `kg_relations` table.

**Rationale:**
- Leverages existing relation infrastructure
- No schema changes needed (relation_type is TEXT)
- Can add strength/confidence scores later

**Alternatives Considered:**
- Separate `kg_episode_conversations` junction table
- Store episode_slug directly in conversation entity

**Why Rejected:**
- Junction table adds complexity without benefit
- Direct storage limits to one episode per conversation (conversations can reference multiple episodes)

#### 2. Temporal Granularity

**Decision:** Store both `date_month` (DATE, first of month) and `date_day` (DATE, actual day).

**Rationale:**
- Month granularity for timeline scrubbing (less noise)
- Day granularity for precise filtering when needed
- NULL `date_day` indicates only month known

**Implementation:**
```sql
date_month DATE,  -- Always set (YYYY-MM-01)
date_day DATE,    -- NULL if only month known
```

#### 3. Semantic Matching Strategy

**Decision:** Use embedding similarity for concept matching (automatic).

**Rationale:**
- User requested automatic embeddings-based matching
- Can match "Qubits" ↔ "Quantum Computing" without manual curation
- Similarity threshold can be tuned

**Implementation:**
- Generate embeddings for conversation synthesis
- Match to episode concept embeddings
- Create `SEMANTIC_MATCH` relations with similarity score

### Questions Answered

#### 1. Schema for Episode → Chat Message Linking?

**Answer:** Use existing `kg_relations` table with `REFERENCES_EPISODE` relation type. Create episode entities and conversation entities, then link via relations.

**Migration:** `005_backbone_satellite_schema.sql` handles this. ✅ Complete

#### 2. Timestamp Granularity?

**Answer:** Month/day granularity (day can be NULL). Use `date_month` for timeline scrubbing, `date_day` for precise filtering.

**Implementation:** Helper functions `extract_date_from_timestamp()` and `extract_day_from_timestamp()` convert Unix milliseconds to DATE. ✅ Complete

#### 3. Are Episodes Already Entities?

**Answer:** ✅ Yes (after Phase 1). Episodes are now entities in `kg_entities` (type='episode'), created from `kg_episode_metadata` via migration.

**Previous State:** Episodes were metadata only, linked via `message_id` pattern matching.

#### 4. Semantic Matching Strategy?

**Answer:** ✅ Automatic embeddings-based matching. Generate embeddings for conversation synthesis, match to episode concept embeddings, create `SEMANTIC_MATCH` relations. ✅ **Complete** (Phase 4 — 2026-01-20)

---

### ⏳ Phase 3: Hybrid Schema Evolution (Medium-term, Week 6-8)

**Goal:** Allow schema to evolve while maintaining quality across both KGs

**Implementation:**
1. **Periodic analysis:** Cluster "unknown" entities monthly (from both KGs)
2. **Type discovery:** Use LLM to propose new types from clusters
3. **Validation:** Human review before adding types
4. **Incremental re-classification:** Re-classify "unknown" entities only (both KGs)
5. **Cross-KG type validation:** New types should work for both user and expert content

**Tools:**
- Current LLM extraction
- Sentence-transformers for entity canonicalization and clustering
- LLM for type proposal and entity resolution
- Supabase for storage

**2025 Enhancements:**
- Use **GraphOracle** approach for cross-domain reasoning with unseen entities
- Apply **CoDe-KG** sentence complexity modeling for better extraction
- Integrate **OL-KGC** ontology enhancement for validation

**New Files:**
- `engine/scripts/discover_entity_types.py`
- `engine/common/type_discovery.py`
- `src/app/api/kg/type-discovery/route.ts`

**Timeline:** 2-3 weeks

**Status:** ✅ **Complete** (2026-01-20)

**Implementation:**
- ✅ Entity clustering using DBSCAN on embeddings (`type_discovery.py`)
- ✅ LLM-based type proposal from clusters (`discover_entity_types.py`)
- ✅ Re-classification script (`reclassify_entities.py`)
- ✅ API endpoint for type discovery (`/api/kg/type-discovery`)
- ⏳ Validation UI (pending - can be added to Entity Explorer)

**Files Created:**
- `engine/common/type_discovery.py` - Clustering and LLM-based type proposal
- `engine/scripts/discover_entity_types.py` - Script to run type discovery
- `engine/scripts/reclassify_entities.py` - Script to re-classify entities
- `src/app/api/kg/type-discovery/route.ts` - API endpoint

---

### ⏳ Phase 4: Relationship Grouping & Dynamic Ontology (Medium-term, Week 9-12)

**Goal:** Group extracted relationships into canonical relations, building a "Dynamic Ontology" to prevent predicate explosion and improve queryability.

**Why This Matters:**
- Prevents predicate explosion: "talked about," "discussed," "mentioned," "brought up" → one canonical relation
- Makes graph queryable: Instead of searching for 20+ variations, query one canonical relation
- Improves consistency: All similar relationships use the same canonical form

**Implementation:**
1. **Extract relationships freely** from triples (foundation already implemented): "talked about," "discussed," "mentioned," "founder of," "started by"
2. **Periodically group similar relationships** using LLM analysis
3. **Build "Dynamic Ontology"** of canonical relations:
   - "founder of" + "started by" + "created by" → "FOUNDED_BY"
   - "talked about" + "discussed" + "mentioned" → "MENTIONED"
   - "works at" + "employed by" + "part of" → "WORKS_AT"
4. **Merge relationships** to canonical forms
5. **Validation loop:** Human review of relationship groupings

**Tools:**
- LLM for relationship grouping and canonicalization
- Embedding-based similarity for relationship clustering
- Supabase for relationship storage

**2025 Enhancements:**
- Use **SAT (Structure-Aware Alignment-Tuning)** for LLM-KG alignment in relationship extraction
- Apply **GraphOracle** for cross-domain relationship reasoning
- Integrate **Agentic-KGR** for co-evolutionary relationship discovery

**New Files:**
- `engine/scripts/group_relationships.py`
- `engine/common/relationship_canonicalizer.py`
- `src/app/api/kg/relationship-grouping/route.ts`

**Timeline:** 3-4 weeks

**Status:** ✅ **Complete** (2026-01-20)

**Implementation:**
- ✅ LLM-based predicate grouping (`relationship_canonicalizer.py`)
- ✅ Dynamic Ontology builder (`group_relationships.py`)
- ✅ Merge relationships to canonical forms (API endpoint)
- ✅ API endpoint for relationship grouping (`/api/kg/relationship-grouping`)

**Files Created:**
- `engine/common/relationship_canonicalizer.py` - LLM-based predicate grouping
- `engine/scripts/group_relationships.py` - Script to run grouping
- `src/app/api/kg/relationship-grouping/route.ts` - API endpoint

---

### 💭 Phase 5: Open-Schema Extraction (Long-term, Week 13-18)

**Goal:** Extract entities without type constraints, discover types from content

**Implementation:**
1. **OpenIE extraction:** Extract (entity, relation, entity) triples (foundation already implemented)
2. **Entity clustering:** Cluster entities by similarity
3. **Type inference:** Use LLM to infer types from clusters
4. **Schema building:** Build type hierarchy from discovered types
5. **Validation loop:** Human review of discovered types

**Tools:**
- LangChain OpenIE
- Sentence-transformers
- LLM (Claude/GPT-4) for type inference
- Supabase for graph storage (Neo4j optional if scale exceeds 100k entities)

**2025 Enhancements:**
- Use **QuARK** schema-free approach for domain-agnostic extraction
- Apply **TOBUGraph** dynamic KG construction methods
- Integrate **GraphMERT** neurosymbolic approach for factuality
- Use **Agentic-KGR** co-evolutionary schema expansion

**New Files:**
- `engine/common/open_schema_extractor.py`
- `engine/common/type_hierarchy.py`

**Timeline:** 4-6 weeks

**Status:** ⏳ Future

---

### 💭 Phase 6: Fully Dynamic Schema (Long-term, Week 19-30)

**Goal:** Schema evolves automatically with minimal human intervention

**Implementation:**
1. **Continuous extraction:** OpenIE + entity extraction
2. **Real-time clustering:** Update clusters as new content arrives
3. **Automatic type discovery:** ML model learns type patterns
4. **Confidence-based validation:** Auto-validate high-confidence types
5. **Human review:** Only for low-confidence or novel types

**Tools:**
- LangChain + LlamaIndex
- Real-time clustering (streaming)
- ML model for type classification
- Supabase with versioned schema

**2025 Enhancements:**
- Use **SAT (Structure-Aware Alignment-Tuning)** for LLM-KG alignment
- Apply **MED (Croppable Embeddings)** for efficient embedding updates
- Integrate **GraphOracle** foundation model for cross-domain reasoning
- Use **Taxonomy-Driven** approach for domain-agnostic validation

**Timeline:** 8-12 weeks

**Status:** ⏳ Future

---

### ✅ Iteration 2: User Chat Indexing UX (COMPLETE — 2026-01-19)

**Goal:** Let users build personal KG

**Status:** ✅ **COMPLETE** — All core features implemented

**Features Implemented:**
1. ✅ **Incremental Indexing** (COMPLETE)
   - `daysBack` parameter for date range control
   - Message ID check to skip already-indexed conversations
   - Fast subsequent syncs (only processes new conversations)
   - Note: Timestamp-based tracking (full incremental) can be enhanced later

2. ✅ **Cost/Time Estimator** (COMPLETE)
   - Pre-run cost estimation modal
   - Shows conversation count, estimated cost, estimated time
   - API endpoints: `/api/kg/conversation-count`, `/api/kg/estimate-cost`

3. ✅ **Progress UI** (COMPLETE)
   - Real-time progress bar with percentage
   - Entity/relation/decision counts
   - ETA calculation and display
   - Phase indicators
   - API endpoint: `/api/kg/index-progress`

4. ✅ **Stop Functionality** (COMPLETE)
   - Stop button to cancel running jobs
   - API endpoint: `/api/kg/index-user-chat/stop`
   - Process cleanup on stop

**Ship:** ✅ Users can index chat history with full UX support

**⚠️ Known Issue (2026-01-20):**
- **User KG Quality:** Current user chat indexing produces low-quality KG output (1,571 entities but quality is "useless")
- **Possible Causes:**
  - Quality filter may be too permissive for user chat (designed for Lenny's podcast)
  - User's own AI conversations may be inherently lower quality than expert content
  - Extraction prompts may not be optimized for user chat context
- **Action Required:** Re-do user chat indexing with improved quality filters and extraction strategies
- **Future Work:** Investigate quality differences between user chat vs expert content, adjust quality thresholds, improve extraction prompts for user chat context

---

### ✅ Iteration 3: Better UX (PARTIALLY COMPLETE — 2026-01-19)

**Goal:** Make indexing less scary

**Status:** ✅ **PARTIALLY COMPLETE** — Error handling done, pause/resume pending

**Features Implemented:**
1. ✅ **User-Friendly Errors** (COMPLETE)
   - `translateErrorToLayman()` function transforms technical errors
   - User-friendly messages for API errors, rate limits, network issues, database errors
   - Examples: "Indexing paused due to rate limits. It will automatically retry soon."

2. ✅ **Better Progress Messages** (COMPLETE)
   - Structured progress markers from Python script (`[PROGRESS]`, `[STAT]`, `[PHASE]`)
   - Friendly status updates in UI
   - Clear feedback with phase names and progress percentages

**Features Pending:**
- ⏳ **Pause/Resume** — Only stop exists, pause/resume not yet implemented (see Iteration 4)

**Ship:** ✅ Error handling and progress messages polished

---

### 💭 Iteration 4: Background Processing (Month 2, 10-12 hours)

**Goal:** Let users close browser during indexing

**Only if users complain:**
- "Can't close laptop for 2 hours"
- "Browser crashed mid-indexing"

**Features:**
- Job queue (Inngest/BullMQ)
- Status polling API
- Pause/resume

**Ship:** If user demand exists

---

## Technical Architecture

### Database Schema

```sql
-- Entities (people, tools, concepts)
CREATE TABLE kg_entities (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- tool, concept, person, pattern, etc.
  mention_count INT DEFAULT 0,
  source_type TEXT NOT NULL, -- 'user', 'expert', 'both'
  source_breakdown JSONB, -- {'user': 5, 'expert': 10}
  confidence FLOAT DEFAULT 0.5, -- 0-1.0 confidence score
  aliases TEXT[], -- ['NextJS', 'next.js']
  embedding VECTOR(1536), -- For similarity search
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relations (how entities connect)
CREATE TABLE kg_relations (
  id TEXT PRIMARY KEY,
  source_entity_id TEXT REFERENCES kg_entities(id),
  target_entity_id TEXT REFERENCES kg_entities(id),
  relation_type TEXT NOT NULL, -- SOLVES, ENABLES, USED_WITH, etc.
  confidence FLOAT, -- Optional confidence
  evidence_snippet TEXT, -- Context for relation
  source_message_id TEXT -- Where this relation came from
);

-- Mentions (provenance/evidence)
CREATE TABLE kg_entity_mentions (
  id TEXT PRIMARY KEY,
  entity_id TEXT REFERENCES kg_entities(id),
  message_id TEXT NOT NULL, -- 'lenny-{episode}-{chunk}' or 'user-{chat}-{chunk}'
  context_snippet TEXT, -- Surrounding text
  message_timestamp BIGINT -- Unix timestamp (ms)
);
```

### Indexing Pipeline (Triple-Based Foundation)

```
Raw Text (Lenny transcripts OR user chat)
    ↓
Chunking (200-300 tokens per chunk)
    ↓
Quality Filter (domain-agnostic, 0.35 threshold)
    ↓ (only 44% pass)
Triple Extraction (OpenIE: Subject-Predicate-Object)
    ↓
Store Raw Triples (foundation for all extraction)
    ↓
Entity Extraction from Triples (Claude Haiku 4.5)
    ↓
Post-Filter Validation (reject generic entities)
    ↓
Entity Canonicalization (CRITICAL)
    - Merge semantically identical entities ("PM" → "Product Manager")
    - Embedding-based similarity (0.85 threshold)
    - Alias tracking ("Next.js" = "NextJS" = "next.js")
    ↓
Fuzzy Deduplication (merge "Next.js" = "NextJS")
    ↓
Confidence Scoring (calculate 0-1.0 score)
    ↓
Relation Extraction from Triples
    ↓
Relationship Grouping (Dynamic Ontology)
    - Group similar predicates ("talked about" + "discussed" → "MENTIONED")
    - Build canonical relation types
    ↓
Save to Supabase KG tables
```

### Quality Filter (Domain-Agnostic)

**Signals (universal, works for ANY domain):**
1. **Named entities** (30%): Capitalized proper nouns
2. **Problem + Solution** (35%): Describes both
3. **Comparative analysis** (20%): "X vs Y", "pros/cons"
4. **Metrics/Data** (15%): "50%", "10x", "$100M"
5. **Technical terms** (15%): camelCase, kebab-case
6. **Framework indicators** (10%): "RICE framework", "Design Thinking"

**Threshold:** 0.35 (44% pass rate for Lenny's podcast)

**Why domain-agnostic:** Works for PM, engineering, design, marketing, AI/ML, psychology, leadership, etc.

---

## Future Success Metrics

> **Note:** These metrics are for future features, not current implementation.

### Future: Schema Evolution (Phase 3)
- ⏳ Monthly type discovery from "other" entities
- ⏳ Human validation workflow operational
- ⏳ Incremental re-classification working

### Future: Relationship Grouping (Phase 4)
- ⏳ Dynamic Ontology reduces predicate explosion
- ⏳ Canonical relations improve queryability
- ⏳ Human validation loop operational

---

## Cost & Performance

### Lenny's Baseline (One-Time)

| Metric | Value |
|--------|-------|
| **Chunks** | 50,815 total |
| **Quality Pass** | 22,404 (44%) |
| **Cost** | $94.10 |
| **Time** | 18.9 hours (4 workers) |
| **Rate** | 19.8 chunks/min |

**User Cost:** $0 (download pre-built baseline)

### User Chat Indexing (Per User)

| Chat Size | Chunks | Cost | Time |
|-----------|--------|------|------|
| Small (10MB) | ~2,000 | $0.40 | 10 min |
| Medium (100MB) | ~20,000 | $4.00 | 1.5 hours |
| Large (500MB) | ~100,000 | $20.00 | 8 hours |
| Huge (1GB+) | ~200,000+ | $40.00+ | 16+ hours |

**Incremental updates:** $0.10 - $2.00 (only new messages)

---

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| **Baseline quality poor** | Manual review before release |
| **Cost too high for users** | Show warning, let users decide |
| **Indexing too slow** | Incremental updates, background processing |
| **Entities too noisy** | Confidence filter, raise threshold |
| **Users don't trust data** | Provenance tracking (show sources) |
| **Duplicates persist** | Improved deduplication, manual merge tool |

---

## Tool Recommendations (2025 Updated)

### For Entity Extraction
- **LangChain OpenIE** — Triple-based extraction (foundation)
- **Sentence-transformers** — Entity canonicalization and clustering
- **LLM (Claude/GPT-4)** — Type inference, entity resolution, relationship grouping

### For Schema Discovery
- **Embedding Clustering** — Use `sentence-transformers` for entity embeddings, cluster with DBSCAN/HDBSCAN
- **Graph Embeddings** — Node2vec or DeepWalk for entity similarity
- **Zero-shot Classification** — LLM to classify entities into new types

### For Storage & Querying
- **Supabase (Current)** — PostgreSQL CTEs sufficient for current scale (~12k entities), handles both vector search + graph
- **Neo4j (Optional, Future)** — Only if scale exceeds 100k entities or complex queries become slow (>1s)
- **GraphRAG Pattern** — Combine vector search (starting point) + KG traversal (reasoning)

### For Visualization
- **Cytoscape.js** — Custom embedded viewers (best for embedding in website/app)
- **GraphXR by Kineviz** — Web-based 3D visualization (advanced 3D networks)
- **Neo4j Bloom** — Business visualization (if migrating to Neo4j)

### 💭 Future: Neo4j Export Path (For Advanced Exploration)

**Idea:** Keep Supabase as source of truth, periodically export to Neo4j for advanced exploration.

**Why Consider This:**
- **Neo4j Bloom** has excellent pre-built graph visualization (zoom, filter, search, path finding)
- **Cypher queries** are native for graph traversals (shortest path, community detection)
- **No data migration needed** — Supabase remains primary, Neo4j is read-only exploration layer

**When It Makes Sense:**
- KG exceeds 50k entities (diminishing returns on custom viz)
- Users need multi-hop path queries ("How does X connect to Y through Z?")
- Community detection / clustering becomes important

**Implementation Path:**
1. Create `export_kg_to_neo4j.py` script
2. Map Supabase schema → Neo4j nodes/edges
3. Schedule nightly export (or on-demand)
4. Use Neo4j Aura free tier ($0) or self-hosted
5. Link from Inspiration UI to Neo4j Bloom for deep exploration

**Cost:** Neo4j Aura free tier (50k nodes) or ~$65/mo for AuraDB Professional

**Status:** 💭 Future consideration (not blocking current work)

### 2025 Research Enhancements
- **CoDe-KG** — Improved triple extraction accuracy
- **GraphMERT** — Factuality checks on triples
- **GraphOracle** — Cross-domain reasoning with unseen entities
- **Agentic-KGR** — Co-evolutionary schema expansion
- **SAT (Structure-Aware Alignment-Tuning)** — LLM-KG alignment
- **QuARK** — Schema-free approach for flexibility
- **TOBUGraph** — Dynamic KG construction

---

## What's NOT in v2.0

❌ **Real-time extraction during chat** — Too slow  
❌ **Graph database (Neo4j)** — PostgreSQL sufficient for current scale (~12k entities)  
❌ **Multi-hop inference** — Too complex (Phase 5-6)  
❌ **Entity hierarchies** — Wait for user demand  
❌ **External linking (Wikipedia)** — Low ROI  
❌ **Custom entity types** — 7 types + "other" cover 95% of cases (schema evolves in Phase 3)

---

## Future Rollout Considerations

> **Note:** v2.0 foundation is complete. Future phases will be rolled out incrementally based on user feedback.

**Considerations for Future Phases:**
- Schema Evolution (Phase 3): Start with monthly analysis, human validation required
- Relationship Grouping (Phase 4): Requires significant entity/relation volume for meaningful grouping
- Open-Schema (Phase 5): Long-term research direction, not immediate priority

---

## Documentation References

**For Current Implementation:**
- **PLAN.md** — Knowledge Graph section (current features)
- **ARCHITECTURE.md** — KG architecture details
- **BUILD_LOG.md** — Implementation history
- **PIVOT_LOG.md** — Design decisions

**For Future Features:**
- **INSPIRATION_V2_PLAN.md** — This document (future roadmap)

---

## Current Implementation Status

> **For current implementation details, see `PLAN.md` Knowledge Graph section.**

**✅ Recently Completed (This Document):**
- ✅ Phase 3: Schema Evolution (discover types from "other" entities) — P2 Complete (2026-01-20)
- ✅ Phase 4: Relationship Grouping (Dynamic Ontology) — P3 Complete (2026-01-20)
- ✅ Cross-KG Semantic Matching — P4 Complete (2026-01-20)

**⏳ Future Features (This Document):**
- Phase 5: Open-Schema Extraction
- Phase 6: Fully Dynamic Schema

**⏸️ Deferred:**
- Phase 2: Cross-KG Connection (0 string overlap found, semantic matching future consideration)

---

## Contact & Support

**For Current Features:** See `PLAN.md` Knowledge Graph section  
**For Future Features:** See this document (INSPIRATION_V2_PLAN.md)  
**For Issues:** [GitHub Issues](https://github.com/mostly-coherent/Inspiration/issues)

---

## Key Research Papers & Resources

### 2025 Research (Latest)

1. **TOBUGraph: Knowledge Graph-Based Retrieval for Enhanced LLM Performance**
   - Paper: [ACL 2025 Industry](https://aclanthology.org/2025.emnlp-industry.93/)
   - Method: Dynamic KGs from unstructured data, improves retrieval beyond RAG
   - **Relevance:** Dynamic KG construction, better than text-chunk similarity

2. **Structure-Aware Alignment-Tuning (SAT) for Knowledge Graph Completion**
   - Paper: [EMNLP 2025](https://aclanthology.org/2025.emnlp-main.1061/)
   - Method: Aligns LLM output with KG structure via contrastive learning
   - **Relevance:** Better link prediction, LLM-KG alignment

3. **GraphOracle: Cross-Domain KG Reasoning**
   - Paper: [arXiv:2505.11125](https://arxiv.org/abs/2505.11125)
   - Method: Foundation model for cross-domain KG reasoning, excels with unseen entities/relations
   - **Relevance:** Domain-agnostic reasoning, handles new entities

4. **CoDe-KG: Automated KG Construction with Sentence Complexity Modelling**
   - Paper: [EMNLP 2025](https://aclanthology.org/2025.emnlp-main.783/)
   - Method: High accuracy via decomposition, coreference resolution, better prompting
   - **Relevance:** Improved extraction accuracy

5. **Agentic-KGR: Co-evolutionary Knowledge Graph Construction**
   - Paper: [arXiv:2510.09156](https://arxiv.org/abs/2510.09156)
   - Method: Schema expansion dynamically via reinforcement learning
   - **Relevance:** Dynamic schema evolution, co-evolutionary approach

6. **QuARK: Schema-Free KGs for Domain-Specific QA**
   - Paper: [RANLP 2025](https://aclanthology.org/2025.ranlp-1.25/)
   - Method: Schema-free KGs + RAG frameworks, reduces LLM reliance
   - **Relevance:** Schema-free approach, domain-specific

7. **GraphMERT (Oct 2025)**
   - Paper: [arXiv:2510.09580](https://arxiv.org/abs/2510.09580)
   - Method: Neurosymbolic model for reliable domain-specific KGs, focuses on factuality
   - **Relevance:** Factuality, ontology consistency

**Research:** 2025 KG research papers referenced above (CoDe-KG, GraphMERT, GraphOracle, Agentic-KGR, SAT, QuARK, TOBUGraph)

### Industry Tools & Validation

**Neo4j LLM Knowledge Graph Builder:**
- **Reference:** [Neo4j Blog Post](https://neo4j.com/blog/developer/graphrag-llm-knowledge-graph-builder/)
- **Key Insights:** Validates triple-based extraction approach, GraphRAG pattern (vector search + KG traversal), schema-free extraction
- **Decision:** Stick with Supabase (see `NEO4J_VS_SUPABASE_ANALYSIS.md` for detailed rationale)
- **Takeaway:** Our architecture aligns with industry best practices; no pivot needed

---

**Version:** v2.0+ (Future Roadmap)  
**Last Updated:** 2026-01-20 (Updated: Backbone & Satellite Architecture Complete)  
**Status:** 🔮 Future Features (v2.0 Foundation Complete, Backbone & Satellite Architecture Complete)  
**Purpose:** Roadmap for future KG enhancements, not current implementation

**See `PLAN.md` for completed v2.0 Knowledge Graph features.**  
**See "Backbone & Satellite Architecture" section in this document for Phase 1-5 implementation details.**