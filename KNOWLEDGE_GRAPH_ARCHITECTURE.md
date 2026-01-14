# Knowledge Graph Architecture — v6-v7 Vision

> **Purpose:** Transform Inspiration from "find patterns in conversations" to "understand connections in your thinking"
> **Status:** Planning Phase (2026-01-14)

---

## Vision

**Current State:** Inspiration excels at extracting discrete items (ideas, insights) and grouping them by similarity (Theme Explorer). But it treats each item as independent—missing the rich web of connections between concepts, tools, patterns, and problems you discuss.

**Future State:** A personal knowledge graph that reveals:
- **Entities:** Tools, patterns, problems, concepts, people you discuss
- **Relationships:** How entities connect (tool SOLVES problem, pattern ENABLES concept)
- **Evolution:** How your focus shifts over time
- **Gaps:** What's missing from your thinking

**Shift:** From "what's similar?" to "how does it connect?"

---

## Core Concepts

| Concept | Definition | Example |
|---------|------------|---------|
| **Entity** | A distinct concept extracted from conversations | "React Server Components", "caching", "auth flow" |
| **Entity Type** | Category of entity | tool, pattern, problem, concept, person, project |
| **Relation** | Named connection between entities | SOLVES, CAUSES, ENABLES, PART_OF, USED_WITH |
| **Mention** | Instance where entity appears in conversation | Message ID + timestamp + context snippet |
| **Entity Cluster** | Group of semantically similar entities (deduplication) | "RSC", "React Server Components", "server components" → single entity |

---

## Data Model

### Schema Design (PostgreSQL with pgvector)

```sql
-- ============================================================================
-- Entity Types Enum
-- ============================================================================

CREATE TYPE entity_type AS ENUM (
    'tool',       -- Technologies, frameworks, libraries (React, Supabase, Prisma)
    'pattern',    -- Design patterns, architectural patterns (caching, retry logic)
    'problem',    -- Issues, bugs, challenges (auth timeout, race condition)
    'concept',    -- Abstract ideas, principles (DRY, composition over inheritance)
    'person',     -- People mentioned (Lenny, Dan Abramov, team members)
    'project',    -- Projects, codebases, repos (Inspiration, dad-aura)
    'workflow'    -- Processes, methodologies (TDD, code review, pair programming)
);

-- ============================================================================
-- Relation Types Enum  
-- ============================================================================

CREATE TYPE relation_type AS ENUM (
    'SOLVES',         -- tool/pattern SOLVES problem
    'CAUSES',         -- problem CAUSES problem (cascade)
    'ENABLES',        -- pattern/tool ENABLES capability
    'PART_OF',        -- entity is component of larger entity
    'USED_WITH',      -- entities commonly used together
    'ALTERNATIVE_TO', -- entities serve similar purpose
    'REQUIRES',       -- entity depends on another
    'IMPLEMENTS',     -- pattern/tool IMPLEMENTS concept
    'MENTIONED_BY'    -- person MENTIONED entity (expert attribution)
);

-- ============================================================================
-- Entities Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_entities (
    id TEXT PRIMARY KEY,                              -- UUID
    canonical_name TEXT NOT NULL,                     -- Display name ("React Server Components")
    entity_type entity_type NOT NULL,
    aliases TEXT[] DEFAULT ARRAY[]::TEXT[],          -- Alternative names ["RSC", "server components"]
    description TEXT,                                 -- AI-generated summary of what this entity is
    embedding extensions.vector(1536),                -- For semantic deduplication
    
    -- Frequency & temporal data
    mention_count INTEGER NOT NULL DEFAULT 0,         -- How often mentioned
    first_seen TIMESTAMP WITH TIME ZONE,              -- First mention timestamp
    last_seen TIMESTAMP WITH TIME ZONE,               -- Last mention timestamp
    
    -- Confidence & provenance
    confidence FLOAT NOT NULL DEFAULT 1.0,            -- 0.0-1.0 extraction confidence
    source TEXT NOT NULL DEFAULT 'llm',               -- 'llm', 'user_created', 'user_corrected'
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kg_entities_type ON kg_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_kg_entities_mention_count ON kg_entities(mention_count DESC);
CREATE INDEX IF NOT EXISTS idx_kg_entities_last_seen ON kg_entities(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_kg_entities_embedding ON kg_entities 
USING hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- Relations Table (Edges)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_relations (
    id TEXT PRIMARY KEY,                              -- UUID
    source_entity_id TEXT NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    target_entity_id TEXT NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    relation_type relation_type NOT NULL,
    
    -- Frequency & confidence
    occurrence_count INTEGER NOT NULL DEFAULT 1,      -- How often this relationship observed
    confidence FLOAT NOT NULL DEFAULT 1.0,            -- 0.0-1.0 extraction confidence
    
    -- Provenance
    source TEXT NOT NULL DEFAULT 'llm',               -- 'llm', 'user_created', 'user_corrected'
    evidence_snippet TEXT,                            -- Example text showing relationship
    
    -- Timestamps
    first_seen TIMESTAMP WITH TIME ZONE,
    last_seen TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate edges
    UNIQUE(source_entity_id, target_entity_id, relation_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kg_relations_source ON kg_relations(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_relations_target ON kg_relations(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_relations_type ON kg_relations(relation_type);

-- ============================================================================
-- Entity Mentions (Links entities to source messages)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_entity_mentions (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,                         -- References cursor_messages.message_id
    
    -- Context
    context_snippet TEXT NOT NULL,                    -- Surrounding text (50-100 chars each side)
    mention_start INTEGER,                            -- Character offset in message
    mention_end INTEGER,
    
    -- Timestamps
    message_timestamp BIGINT NOT NULL,                -- From cursor_messages.timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kg_mentions_entity ON kg_entity_mentions(entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_mentions_message ON kg_entity_mentions(message_id);
CREATE INDEX IF NOT EXISTS idx_kg_mentions_timestamp ON kg_entity_mentions(message_timestamp DESC);

-- ============================================================================
-- Entity-Item Links (Links entities to Library items)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_entity_items (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,                            -- References library_items.id
    relevance_score FLOAT NOT NULL DEFAULT 1.0,       -- How central is entity to this item
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kg_entity_items_entity ON kg_entity_items(entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_entity_items_item ON kg_entity_items(item_id);

-- ============================================================================
-- User Corrections (Learning from user feedback)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_user_corrections (
    id TEXT PRIMARY KEY,
    correction_type TEXT NOT NULL,                    -- 'merge', 'split', 'retype', 'rename', 'delete'
    target_entity_id TEXT,
    target_relation_id TEXT,
    
    -- Correction data
    old_value JSONB,                                  -- What was before
    new_value JSONB,                                  -- What user changed to
    reason TEXT,                                      -- Optional user explanation
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## Entity Type Definitions

| Type | Description | Examples | Extraction Signals |
|------|-------------|----------|-------------------|
| **tool** | Technologies, frameworks, libraries, services | React, Supabase, Cursor, Prisma, pgvector | Capitalized names, import statements, "using X", "X library" |
| **pattern** | Design patterns, architectural approaches | caching, retry logic, error boundaries, pub/sub | "pattern", "approach", "strategy", "technique" |
| **problem** | Issues, bugs, challenges, pain points | auth timeout, race condition, N+1 query, memory leak | "error", "bug", "issue", "problem", "failing", "broken" |
| **concept** | Abstract principles, mental models | DRY, composition, idempotency, eventual consistency | "principle", "concept", "idea that", explanatory context |
| **person** | People mentioned (experts, colleagues) | Lenny Rachitsky, Dan Abramov, Kent Beck | Names, "said", "suggests", "according to" |
| **project** | Repos, codebases, apps | Inspiration, dad-aura, Allegro | Folder names, repo references, "in X project" |
| **workflow** | Processes, methodologies | TDD, code review, pair programming, standup | "process", "workflow", "how we", "methodology" |

---

## Relation Type Definitions

| Relation | Meaning | Example |
|----------|---------|---------|
| **SOLVES** | X addresses/fixes Y | `React Query SOLVES caching problem` |
| **CAUSES** | X leads to Y | `N+1 query CAUSES slow response` |
| **ENABLES** | X makes Y possible | `pgvector ENABLES semantic search` |
| **PART_OF** | X is component of Y | `Auth middleware PART_OF API layer` |
| **USED_WITH** | X commonly paired with Y | `Prisma USED_WITH Supabase` |
| **ALTERNATIVE_TO** | X serves similar purpose as Y | `React Query ALTERNATIVE_TO SWR` |
| **REQUIRES** | X depends on Y | `pgvector REQUIRES PostgreSQL` |
| **IMPLEMENTS** | X realizes/embodies Y | `Retry logic IMPLEMENTS resilience pattern` |
| **MENTIONED_BY** | Expert Y discusses X | `Caching MENTIONED_BY Lenny Rachitsky` |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA SOURCES                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  cursor_messages (Vector DB)    │    library_items    │    lenny_metadata   │
│  - Chat history                 │    - Ideas          │    - Expert quotes  │
│  - Embeddings                   │    - Insights       │    - Episodes       │
└──────────────────┬──────────────┴──────────┬─────────┴──────────┬──────────┘
                   │                         │                     │
                   ▼                         ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EXTRACTION LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  entity_extractor.py           │    relation_extractor.py                   │
│  - LLM-based NER               │    - LLM-based relation extraction         │
│  - Structured output (Zod)     │    - Co-occurrence analysis                │
│  - Confidence scoring          │    - Evidence snippet capture              │
└──────────────────┬──────────────┴──────────────────┬────────────────────────┘
                   │                                  │
                   ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DEDUPLICATION LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  entity_deduplicator.py                                                      │
│  - Embedding similarity (cosine > 0.85 → candidate merge)                   │
│  - Alias detection ("RSC" → "React Server Components")                       │
│  - User correction learning                                                  │
└──────────────────┬──────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        KNOWLEDGE GRAPH (Supabase)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  kg_entities          │    kg_relations         │    kg_entity_mentions     │
│  kg_entity_items      │    kg_user_corrections  │                           │
└──────────────────┬────┴─────────────────────────┴───────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        QUERY LAYER                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  graph_queries.py (PostgreSQL CTEs)                                          │
│  - Path finding (A → ? → B)                                                 │
│  - Subgraph extraction                                                       │
│  - Temporal aggregation                                                      │
│  - Pattern detection                                                         │
└──────────────────┬──────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        UI LAYER (Next.js)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  /entities          │    /graph              │    /evolution                 │
│  Entity Explorer    │    Interactive Graph   │    Timeline View             │
└─────────────────────┴────────────────────────┴───────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation (KG-1, KG-2) — HIGH Priority

**Goal:** Extract entities and relations from existing chat history.

| Task | Description | Effort |
|------|-------------|--------|
| KG-1a | Create SQL schema (tables, indexes, RLS) | LOW |
| KG-1b | Build `entity_extractor.py` with LLM extraction | MEDIUM |
| KG-1c | Build `entity_deduplicator.py` with embedding similarity | MEDIUM |
| KG-2a | Build `relation_extractor.py` with LLM extraction | MEDIUM |
| KG-2b | Create `/api/kg/extract` endpoint for on-demand extraction | LOW |
| KG-2c | Create `scripts/backfill_kg.py` for bulk historical extraction | MEDIUM |

**Extraction Prompt Strategy:**

```python
# Entity Extraction Prompt
ENTITY_EXTRACTION_PROMPT = """
Analyze this conversation excerpt and extract entities.

For each entity, provide:
- name: Canonical name (proper capitalization)
- type: One of [tool, pattern, problem, concept, person, project, workflow]
- aliases: Other names used for this entity in the text
- confidence: 0.0-1.0 how certain you are

Conversation:
{conversation_text}

Output as JSON array:
[{"name": "...", "type": "...", "aliases": [...], "confidence": 0.9}, ...]
"""

# Relation Extraction Prompt
RELATION_EXTRACTION_PROMPT = """
Given these entities extracted from a conversation, identify relationships.

Entities: {entities}

For each relationship, provide:
- source: Entity name
- target: Entity name  
- relation: One of [SOLVES, CAUSES, ENABLES, PART_OF, USED_WITH, ALTERNATIVE_TO, REQUIRES, IMPLEMENTS, MENTIONED_BY]
- evidence: Quote from text showing this relationship
- confidence: 0.0-1.0

Conversation:
{conversation_text}

Output as JSON array:
[{"source": "...", "target": "...", "relation": "...", "evidence": "...", "confidence": 0.85}, ...]
"""
```

### Phase 2: Entity Explorer (KG-3) — MEDIUM Priority

**Goal:** Browse all entities with frequency, first/last seen dates.

| Task | Description | Effort |
|------|-------------|--------|
| KG-3a | Create `/api/kg/entities` endpoint with filtering/sorting | LOW |
| KG-3b | Build `EntityExplorer.tsx` component | MEDIUM |
| KG-3c | Add entity detail view with related entities + mentions | MEDIUM |

**UI Mockup:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔮 ENTITY EXPLORER                                          [Filter ▾]     │
├─────────────────────────────────────────────────────────────────────────────┤
│  [All] [Tools] [Patterns] [Problems] [Concepts] [People] [Projects]         │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │ 🔧 React Server Components                              47 mentions     │
│  │ tool • First: Jul 2025 • Last: Jan 2026                                │
│  │ Aliases: RSC, server components                                         │
│  │ Related: Next.js, streaming, hydration                                  │
│  └─────────────────────────────────────────────────────────────────────────┘
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │ ⚠️ N+1 Query Problem                                    12 mentions     │
│  │ problem • First: Aug 2025 • Last: Dec 2025                             │
│  │ Related: Prisma, DataLoader, caching                                    │
│  └─────────────────────────────────────────────────────────────────────────┘
│  ...                                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 3: Graph View (KG-4) — MEDIUM Priority

**Goal:** Interactive visualization of entity connections in Theme Explorer.

| Task | Description | Effort |
|------|-------------|--------|
| KG-4a | Evaluate graph viz libraries (react-force-graph, vis-network, D3) | LOW |
| KG-4b | Create `/api/kg/subgraph` endpoint for localized graph data | MEDIUM |
| KG-4c | Build `GraphView.tsx` with zoom/pan/click interactions | HIGH |
| KG-4d | Integrate into Theme Explorer as new tab | MEDIUM |

**Library Recommendation:** `react-force-graph` (3D optional, good performance, active maintenance)

### Phase 4: Evolution Timeline (KG-5) — MEDIUM Priority

**Goal:** See how focus has shifted over months.

| Task | Description | Effort |
|------|-------------|--------|
| KG-5a | Create RPC function for temporal aggregation | MEDIUM |
| KG-5b | Build `EvolutionTimeline.tsx` with month-by-month view | MEDIUM |
| KG-5c | Add "rising" and "declining" entity indicators | LOW |

**Query Pattern:**

```sql
-- Entity frequency by month
SELECT 
    date_trunc('month', to_timestamp(m.message_timestamp / 1000)) as month,
    e.canonical_name,
    e.entity_type,
    COUNT(*) as mention_count
FROM kg_entity_mentions m
JOIN kg_entities e ON m.entity_id = e.id
WHERE m.message_timestamp >= extract(epoch from now() - interval '6 months') * 1000
GROUP BY month, e.id, e.canonical_name, e.entity_type
ORDER BY month, mention_count DESC;
```

### Phase 5: Intelligence Features (KG-6, KG-7, KG-8) — LOW Priority

**Goal:** Pattern detection, gap analysis, connection discovery.

| Feature | Task | Effort |
|---------|------|--------|
| **KG-6: Pattern Alerts** | Detect repeated problem+solution pairs | MEDIUM |
| **KG-7: Missing Links** | Find entities that should connect but don't | HIGH |
| **KG-8: Connect the Dots** | Multi-hop path finding between selected entities | HIGH |

---

## Graph Query Patterns (PostgreSQL CTEs)

### Find Path Between Entities

```sql
-- Find shortest path from entity A to entity B (max 3 hops)
WITH RECURSIVE paths AS (
    -- Base case: direct connections from source
    SELECT 
        r.source_entity_id,
        r.target_entity_id,
        r.relation_type,
        ARRAY[r.source_entity_id, r.target_entity_id] as path,
        1 as depth
    FROM kg_relations r
    WHERE r.source_entity_id = 'entity_a_id'
    
    UNION ALL
    
    -- Recursive case: extend paths
    SELECT 
        p.source_entity_id,
        r.target_entity_id,
        r.relation_type,
        p.path || r.target_entity_id,
        p.depth + 1
    FROM paths p
    JOIN kg_relations r ON r.source_entity_id = p.target_entity_id
    WHERE p.depth < 3
    AND NOT r.target_entity_id = ANY(p.path)  -- Prevent cycles
)
SELECT * FROM paths
WHERE target_entity_id = 'entity_b_id'
ORDER BY depth
LIMIT 5;
```

### Find Entity Clusters (Communities)

```sql
-- Find entities that share many relations (co-occur)
SELECT 
    e1.canonical_name as entity_a,
    e2.canonical_name as entity_b,
    COUNT(*) as shared_relations
FROM kg_relations r1
JOIN kg_relations r2 ON r1.target_entity_id = r2.target_entity_id
JOIN kg_entities e1 ON r1.source_entity_id = e1.id
JOIN kg_entities e2 ON r2.source_entity_id = e2.id
WHERE e1.id != e2.id
GROUP BY e1.id, e2.id, e1.canonical_name, e2.canonical_name
HAVING COUNT(*) >= 3
ORDER BY shared_relations DESC;
```

---

## Deduplication Strategy

### Problem
LLM extraction produces variations: "RSC", "React Server Components", "server components", "Server Components" → should be ONE entity.

### Solution: Multi-Stage Deduplication

1. **Exact Match:** Lowercase + strip whitespace comparison
2. **Alias Match:** Check if extracted name matches existing alias
3. **Embedding Similarity:** If cosine > 0.85, flag as candidate merge
4. **User Confirmation:** Show merge suggestions, learn from corrections

```python
def find_or_create_entity(name: str, entity_type: str, embedding: list[float]) -> str:
    """Find existing entity or create new one with deduplication."""
    
    # 1. Exact match
    existing = db.query(
        "SELECT id FROM kg_entities WHERE LOWER(canonical_name) = LOWER(%s)",
        [name]
    )
    if existing:
        return existing.id
    
    # 2. Alias match
    existing = db.query(
        "SELECT id FROM kg_entities WHERE LOWER(%s) = ANY(LOWER(aliases::text)::text[])",
        [name]
    )
    if existing:
        return existing.id
    
    # 3. Embedding similarity
    similar = db.query("""
        SELECT id, canonical_name, 1 - (embedding <=> %s::vector) as similarity
        FROM kg_entities
        WHERE entity_type = %s
        AND 1 - (embedding <=> %s::vector) > 0.85
        ORDER BY similarity DESC
        LIMIT 1
    """, [embedding, entity_type, embedding])
    
    if similar and similar.similarity > 0.85:
        # Add as alias, don't create new
        db.execute(
            "UPDATE kg_entities SET aliases = array_append(aliases, %s) WHERE id = %s",
            [name, similar.id]
        )
        return similar.id
    
    # 4. Create new entity
    new_id = str(uuid.uuid4())
    db.execute("""
        INSERT INTO kg_entities (id, canonical_name, entity_type, embedding)
        VALUES (%s, %s, %s, %s)
    """, [new_id, name, entity_type, embedding])
    return new_id
```

---

## Integration with Existing Features

### Theme Explorer Integration
- New "Graph" tab alongside Patterns, Unexplored, Counter-Intuitive
- Click theme → see entity subgraph for that theme
- Entities linked to Library items via `kg_entity_items`

### Generate Flow Integration (Future)
- After generation, auto-extract entities from new items
- Link entities to source conversations
- Build graph incrementally

### Lenny Integration
- Extract entities from Lenny transcripts
- `MENTIONED_BY` relations to attribute expert perspectives
- "Lenny discussed X 5 times across 3 episodes"

---

## Cost Estimation

| Operation | Estimated Cost | Frequency |
|-----------|---------------|-----------|
| Entity extraction (per message) | ~$0.001 (GPT-4o-mini) | One-time backfill |
| Relation extraction (per conversation) | ~$0.005 (GPT-4o-mini) | One-time backfill |
| Full backfill (2000 conversations) | ~$10-15 | Once |
| Incremental extraction (per sync) | ~$0.50 | Weekly |

**Recommendation:** Use GPT-4o-mini for extraction (good structured output, low cost).

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Entity coverage | 80% of messages have ≥1 entity | `COUNT(DISTINCT message_id) / total_messages` |
| Deduplication quality | <5% duplicate entities | User correction rate |
| Relation density | Avg 2+ relations per entity | `COUNT(relations) / COUNT(entities)` |
| User engagement | 50% of Theme Explorer users visit Graph | Analytics |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM extraction quality varies | HIGH | MEDIUM | Confidence scores, user corrections |
| Graph becomes too dense | MEDIUM | MEDIUM | Filtering by confidence, recency |
| PostgreSQL CTEs too slow at scale | LOW | HIGH | Index optimization, consider Neo4j at 100k+ entities |
| Users don't understand graph UI | MEDIUM | HIGH | Start with Entity Explorer (list view), graph optional |

---

## Decision Log

| Decision | Rationale | Alternatives Considered | Date |
|----------|-----------|------------------------|------|
| PostgreSQL over Neo4j | Unified with existing Supabase, CTEs sufficient for expected scale | Neo4j (better graph queries, more complexity) | 2026-01-14 |
| GPT-4o-mini for extraction | Best cost/quality for structured output | Claude (better reasoning, higher cost) | 2026-01-14 |
| Entity types as enum | Constrained vocabulary, easier filtering | Free-form tags (more flexible, noisier) | 2026-01-14 |
| Embedding deduplication | Catches semantic duplicates missed by string matching | String similarity only (misses "RSC" = "React Server Components") | 2026-01-14 |

---

## Next Steps

1. **Validate schema:** Review with fresh eyes, adjust entity/relation types
2. **Prototype extraction:** Test LLM extraction on 10 sample conversations
3. **Measure quality:** Manually review extraction results, tune prompts
4. **Build incrementally:** Entity Explorer first (list view), then Graph

---

**Last Updated:** 2026-01-14
**Author:** AI Assistant + JM Beh
