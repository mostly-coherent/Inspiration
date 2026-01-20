# Backbone & Satellite Architecture — Implementation Plan

> **Purpose:** Design document for dual-layered graph visualization (Episodes as Backbone, Conversations as Satellites)
> **Date:** 2026-01-19
> **Status:** 📋 Planning Phase

---

## Overview

Transform the Knowledge Graph visualization from a flat graph into a **dual-layered architecture** where:
- **Backbone (Stable):** Podcast episodes, guests, and topics — fixed layout anchors
- **Satellites (Transient):** AI conversations that orbit specific episodes/concepts they reference

This architecture addresses the "hairball problem" by separating stable knowledge (podcasts) from dynamic activity (conversations).

---

## Current State Analysis

### ✅ What We Have

1. **Episodes:** Stored in `kg_episode_metadata` table (metadata only, NOT entities)
   - `episode_slug`, `guest_name`, `episode_title`, `youtube_url`, `published_date`
   - Linked to mentions via `message_id` pattern matching: `"lenny-{episode_slug}-{number}"`

2. **Conversations:** Partially tracked via `get_or_create_conversation_entity()` for temporal chains
   - Not systematically stored as entities
   - Message IDs stored in `kg_entity_mentions.message_id`
   - Timestamps: `message_timestamp` (BIGINT, Unix milliseconds)

3. **Relations:** Current `kg_relations` table supports any relation type
   - No explicit Episode → Conversation linking yet

### ❌ What We Need

1. **Episode Entities:** Convert episodes from metadata to entities (or hybrid approach)
2. **Conversation Entities:** Systematic tracking of all conversations
3. **Episode → Conversation Relations:** Explicit linking via `REFERENCES_EPISODE` relation type
4. **Temporal Schema:** Date/month granularity for timeline scrubbing
5. **Semantic Matching:** Embedding-based concept overlay (user conversations ↔ episode concepts)

---

## Schema Design Recommendations

### Option A: Hybrid Approach (Recommended)

**Episodes:** Keep `kg_episode_metadata` for rich metadata, create `kg_entities` entries with `entity_type='episode'` for graph nodes.

**Pros:**
- Preserves existing metadata structure
- Episodes become first-class graph nodes
- Can link via standard `kg_relations` table

**Cons:**
- Requires migration to create episode entities
- Need to keep metadata and entities in sync

**Implementation:**
- Migration script creates episode entities from metadata
- Episodes get IDs like `"episode-{episode_slug}"`
- Relations: `episode-{slug} --[REFERENCES_EPISODE]--> conv-{message_id}`

### Option B: Pure Entity Approach

Convert all episode metadata into entity attributes, remove `kg_episode_metadata` table.

**Pros:**
- Single source of truth
- Simpler queries

**Cons:**
- Loses structured metadata (YouTube URLs, view counts, etc.)
- Requires significant refactoring

**Recommendation:** ❌ **Not recommended** — metadata table is valuable for provenance and UI display.

---

## Recommended Schema (Option A)

### 1. Episode Entities

```sql
-- Episodes become entities with type 'episode'
INSERT INTO kg_entities (id, canonical_name, entity_type, description, source_type)
SELECT 
    'episode-' || episode_slug,
    COALESCE(episode_title, guest_name || ' Episode'),
    'episode'::entity_type,
    COALESCE(description, 'Episode with ' || guest_name),
    'expert'
FROM kg_episode_metadata;
```

### 2. Conversation Entities Table

```sql
CREATE TABLE kg_conversations (
    id TEXT PRIMARY KEY,  -- 'conv-{message_id}'
    conversation_id TEXT UNIQUE,  -- Original message_id
    source_type TEXT,  -- 'user' or 'expert'
    
    -- Temporal (month/day granularity)
    date_month DATE,  -- First day of month
    date_day DATE,    -- Actual day (NULL if only month known)
    
    -- Summary
    message_count INTEGER,
    entity_count INTEGER,
    relation_count INTEGER,
    
    -- Synthesis (for summarization nodes)
    synthesis_text TEXT,
    synthesis_embedding vector(1536),
    
    -- Timestamps
    first_message_timestamp BIGINT,
    last_message_timestamp BIGINT
);
```

### 3. Episode → Conversation Relations

```sql
-- Link conversations to episodes via message_id pattern
INSERT INTO kg_relations (
    source_entity_id,  -- 'episode-{slug}'
    target_entity_id,  -- 'conv-{message_id}'
    relation_type,     -- 'REFERENCES_EPISODE'
    ...
)
```

### 4. Semantic Concept Matching

**Future Enhancement:** Use embeddings to match user conversation concepts to episode concepts.

```sql
-- Example: User discusses "Qubits" → Episode discusses "Quantum Computing"
-- Create relation: conv-{id} --[SEMANTIC_MATCH]--> concept-{id}
-- Strength based on embedding similarity
```

---

## Implementation Phases

### Phase 1: Foundation Schema (Week 1)

**Goal:** Create episode entities, conversation entities, and basic linking.

**Tasks:**
1. ✅ Create migration script (`005_backbone_satellite_schema.sql`)
2. Run migration in Supabase
3. Verify episode entities created
4. Verify conversation entities populated from mentions
5. Verify Episode → Conversation relations created

**Deliverables:**
- Episode entities in `kg_entities` (type='episode')
- Conversation entities in `kg_conversations` table
- `REFERENCES_EPISODE` relations in `kg_relations`

### Phase 2: Visualization Layers (Week 2)

**Goal:** Separate backbone and satellite layers in GraphView.

**Tasks:**
1. Add `layer` property to nodes (backbone vs satellite)
2. Implement fixed layout for backbone (Circular/Grid)
3. Implement force-directed layout for satellites
4. Add visual distinction (size, color, opacity)

**Deliverables:**
- GraphView supports dual-layer rendering
- Backbone nodes use fixed positions
- Satellite nodes orbit backbone nodes

### Phase 3: Temporal Navigation (Week 3)

**Goal:** Timeline slider for time-scrubbing.

**Tasks:**
1. Add timeline slider UI component
2. Implement date range filtering
3. Dynamic graph assembly/disassembly based on date
4. "Ghost" mode: Fade non-relevant episodes when clicking conversation

**Deliverables:**
- Timeline slider at bottom of graph view
- Graph updates dynamically based on date range
- Ghost mode for focused exploration

### Phase 4: Semantic Concept Overlay (Week 4)

**Goal:** Embedding-based concept matching.

**Tasks:**
1. Generate embeddings for conversation synthesis
2. Match user conversation concepts to episode concepts
3. Create `SEMANTIC_MATCH` relations
4. Visual "heat" or "glow" between matched concepts

**Deliverables:**
- Semantic matching algorithm
- Visual indicators for concept matches
- Concept overlay layer in graph

### Phase 5: Summarization Nodes (Week 5)

**Goal:** Collapse conversations into synthesis nodes.

**Tasks:**
1. Generate synthesis text for conversations (LLM)
2. Store synthesis embeddings
3. Collapse/expand UI for conversation nodes
4. Expand to message-level graph on double-click

**Deliverables:**
- Synthesis generation pipeline
- Collapsible conversation nodes
- Message-level detail view

---

## Technical Decisions

### 1. Episode → Conversation Linking

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

### 2. Temporal Granularity

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

### 3. Semantic Matching Strategy

**Decision:** Use embedding similarity for concept matching (automatic).

**Rationale:**
- User requested automatic embeddings-based matching
- Can match "Qubits" ↔ "Quantum Computing" without manual curation
- Similarity threshold can be tuned

**Implementation:**
- Generate embeddings for conversation synthesis
- Match to episode concept embeddings
- Create `SEMANTIC_MATCH` relations with similarity score

---

## Questions Answered

### 1. Schema for Episode → Chat Message Linking?

**Answer:** Use existing `kg_relations` table with `REFERENCES_EPISODE` relation type. Create episode entities and conversation entities, then link via relations.

**Migration:** `005_backbone_satellite_schema.sql` handles this.

### 2. Timestamp Granularity?

**Answer:** Month/day granularity (day can be NULL). Use `date_month` for timeline scrubbing, `date_day` for precise filtering.

**Implementation:** Helper functions `extract_date_from_timestamp()` and `extract_day_from_timestamp()` convert Unix milliseconds to DATE.

### 3. Are Episodes Already Entities?

**Answer:** ❌ No. Episodes are currently metadata only (`kg_episode_metadata`). Migration will create episode entities.

**Current State:** Episodes linked via `message_id` pattern matching, not explicit relations.

### 4. Semantic Matching Strategy?

**Answer:** ✅ Automatic embeddings-based matching. Generate embeddings for conversation synthesis, match to episode concept embeddings, create `SEMANTIC_MATCH` relations.

---

## Next Steps

1. **Review Migration Script:** `005_backbone_satellite_schema.sql`
2. **Run Migration:** Deploy to Supabase
3. **Verify Data:** Check episode entities, conversation entities, relations created
4. **Update GraphView:** Add layer support (backbone vs satellite)
5. **Implement Timeline:** Add date range filtering

---

**Last Updated:** 2026-01-19
