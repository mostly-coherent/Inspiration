# Unexplored Territory — Build Plan (LIB-10)

> **Purpose:** Help users discover what domains they haven't explored yet but would benefit from investigating
> **Philosophy:** Nurturing discovery, not deficit criticism. "Here's something exciting you haven't tried" vs. "You're missing this"

---

## Vision

**One-liner:** Surface domains that are conspicuously absent from your Library but relevant to your existing work.

**User Need:** 
- "What should I explore next?"
- "What am I not seeing?"
- "Are there related topics I've overlooked?"

**Value Proposition:**
- **Actionable:** Direct suggestions for next exploration ("Generate Ideas about X")
- **Immediate:** Works with existing data (no waiting 6-12 months for trajectory)
- **Non-judgmental:** Discovery framing, not deficiency framing

---

## Why LIB-10 Before LIB-9?

| Factor | LIB-10 (Unexplored Territory) | LIB-9 (Learning Trajectory) |
|--------|-------------------------------|----------------------------|
| **Data Required** | Current Library + Memory (already have) | 6-12 months of timestamped data |
| **Time to Value** | Immediate (works with existing data) | Months/year to see meaningful trends |
| **Actionability** | High ("Explore X next") | Low (retrospective reflection) |
| **User Need** | "What am I missing?" (blind spots) | "How did I evolve?" (nostalgia) |
| **Impact** | Shapes future exploration direction | Validates past journey |

**Conclusion:** Unexplored Territory drives action; Learning Trajectory drives reflection. Start with action.

---

## Three-Layer Detection System

### **Layer 1: Memory vs. Library Mismatch** (MVP — Week 1)

**Concept:** Topics you discuss frequently but never extracted items about.

**Algorithm:**
1. Cluster conversations by topic (Vector DB embeddings)
2. Cluster Library items by topic (existing embeddings)
3. Find topics with high conversation count but low Library coverage

**Threshold Rules:**
| Conversations | Library Items | Severity | Display? |
|--------------|---------------|----------|----------|
| 20+ | 0-1 | 🔴 High | Yes |
| 10-19 | 0-1 | 🟡 Medium | Yes |
| 5-9 | 0 | 🟢 Low | Optional (Settings toggle) |
| < 5 | Any | None | No |

**UI Example:**
```
🧭 Unexplored Territory (3 areas detected)

┌─────────────────────────────────────────────────────┐
│ 🔴 Testing & QA Strategies                          │
│ 18 conversations • 0 Library items                  │
│                                                     │
│ You discuss testing frequently in your chats but   │
│ haven't extracted ideas about it yet.              │
│                                                     │
│ [🔍 Explore This →] [Generate Ideas] [Dismiss]     │
└─────────────────────────────────────────────────────┘
```

**Implementation:**
- File: `engine/common/unexplored_territory.py`
- Function: `detect_memory_library_mismatch()`
- Cost: Zero (uses existing embeddings, just cosine similarity)

---

### **Layer 2: Adjacency Analysis** (Week 2-3)

**Concept:** Topics mentioned in passing across items but never explored deeply.

**Algorithm:**
1. For each Library item, LLM extracts "mentioned-but-not-primary" topics
   - Example: Item about React hooks mentions "testing hooks is tricky" → extract "hook testing"
2. Aggregate mentioned topics across all items
3. Find topics mentioned 5+ times but with 0 dedicated items

**UI Example:**
```
📊 Frequently Mentioned, Never Explored

These topics keep coming up across your items but you've 
never made them the focus:

• DevOps/CI/CD (mentioned 12× across 8 items)
• Performance profiling (mentioned 8× across 5 items)
• Accessibility (mentioned 6× across 4 items)

💡 Worth exploring deeper?
```

**Implementation:**
- File: `engine/common/unexplored_territory.py`
- Function: `detect_adjacency_gaps(items)`
- Cost: Low (1 LLM call per item, one-time analysis, cache results)

---

### **Layer 3: LLM-Powered Strategic Analysis** (Week 3-4)

**Concept:** AI identifies "expected neighbors" that are missing based on theme patterns.

**Prompt Template:**
```
You are analyzing a user's Library to help them discover unexplored territory.

Their Library contains {item_count} items across these themes:
{theme_summary}

Based on this exploration pattern, identify 3-5 domains they'd benefit from 
exploring but haven't yet. These should be:
1. Relevant to their existing work (not random suggestions)
2. Natural adjacencies (topics that complement what they've explored)
3. Actionable (specific enough to generate ideas about)

For each unexplored territory:
1. Name the domain (2-5 words)
2. Explain why it's relevant (connect to existing themes)
3. Suggest a specific exploration direction

Return as JSON array:
[
  {
    "domain": "Observability & Debugging",
    "relevance": "You build AI agents and CLI tools but don't have items about monitoring or debugging them",
    "connected_themes": ["AI Agents", "CLI Tools"],
    "connected_item_count": 12,
    "suggestion": "Explore: How to add observability to agentic workflows"
  }
]
```

**UI Example:**
```
🧭 Strategic Unexplored Territory

Based on your themes (AI agents, CLI tools, productivity), 
areas worth exploring:

┌─────────────────────────────────────────────────────┐
│ 1. Observability & Debugging                        │
│    Why: You build tools but don't explore           │
│    monitoring/debugging them                        │
│    Related to: 12 items about AI agents             │
│                                                     │
│    💡 Suggested: "How to add observability to       │
│       agentic workflows"                            │
│                                                     │
│    [Explore This →]                                 │
└─────────────────────────────────────────────────────┘
```

**Implementation:**
- File: `engine/common/unexplored_territory.py`
- Function: `synthesize_strategic_territory(library_summary, themes)`
- Cost: 1 LLM call per analysis (run weekly or on-demand)

---

## Implementation Roadmap

### **Phase 1: MVP — Memory vs. Library Mismatch** (Week 1)

**Goal:** Ship Layer 1 — highest ROI, zero LLM cost, immediate value.

**Files to Create:**
```
engine/
  common/
    unexplored_territory.py      # Core detection logic
  scripts/
    detect_unexplored.py         # CLI for testing

src/
  app/
    unexplored/
      page.tsx                   # Dedicated page
    api/
      unexplored/
        analyze/route.ts         # Analysis API
  components/
    UnexploredCard.tsx           # Card for each territory
    UnexploredDashboard.tsx      # Full dashboard view
```

**Database Changes (Optional):**
```sql
-- Track dismissed territories (user feedback)
CREATE TABLE IF NOT EXISTS dismissed_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  dismissed_at TIMESTAMP DEFAULT NOW(),
  reason TEXT -- "not_interested", "already_know", "not_relevant"
);
```

**Algorithm (Pseudocode):**
```python
def detect_memory_library_mismatch():
    """
    Find topics with high conversation frequency but low Library coverage.
    """
    # 1. Get all conversation embeddings from Vector DB
    conversations = vector_db.get_all_conversations()
    
    # 2. Cluster conversations by topic (DBSCAN or k-means)
    conversation_clusters = cluster_by_similarity(
        embeddings=[c.embedding for c in conversations],
        threshold=0.75  # Configurable in Settings
    )
    
    # 3. Name each cluster (use most common words from conversations)
    for cluster in conversation_clusters:
        cluster.name = extract_topic_name(cluster.conversations)
        cluster.conversation_count = len(cluster.conversations)
    
    # 4. Get all Library items
    library_items = library_db.get_all_items()
    
    # 5. For each conversation cluster, count matching Library items
    unexplored = []
    for cluster in conversation_clusters:
        # Find Library items similar to this cluster's conversations
        matching_items = find_similar_items(
            query_embedding=cluster.centroid_embedding,
            items=library_items,
            threshold=0.70
        )
        
        # Apply rules
        if cluster.conversation_count >= 20 and len(matching_items) <= 1:
            unexplored.append({
                "domain": cluster.name,
                "severity": "high",
                "conversations": cluster.conversation_count,
                "library_items": len(matching_items),
                "sample_conversations": cluster.conversations[:3]
            })
        elif cluster.conversation_count >= 10 and len(matching_items) <= 1:
            unexplored.append({
                "domain": cluster.name,
                "severity": "medium",
                "conversations": cluster.conversation_count,
                "library_items": len(matching_items),
                "sample_conversations": cluster.conversations[:3]
            })
    
    return sorted(unexplored, key=lambda x: x["conversations"], reverse=True)
```

**API Response:**
```json
{
  "success": true,
  "timestamp": "2026-01-12T10:30:00Z",
  "unexplored": [
    {
      "domain": "Testing & QA Strategies",
      "severity": "high",
      "conversations": 18,
      "library_items": 0,
      "sample_conversations": [
        { "id": "conv-123", "date": "2026-01-05", "snippet": "How to test async workflows..." },
        { "id": "conv-456", "date": "2025-12-20", "snippet": "Unit testing AI agents..." }
      ]
    }
  ],
  "stats": {
    "total_conversations": 450,
    "total_library_items": 275,
    "territories_detected": 3
  }
}
```

---

### **Phase 2: Adjacency Analysis** (Week 2-3)

**Goal:** Add Layer 2 — find topics mentioned frequently but never primary focus.

**New Function:**
```python
def detect_adjacency_gaps(items, min_mentions=5):
    """
    Find topics mentioned across items but never explored deeply.
    """
    mentioned_topics = defaultdict(list)
    
    # Extract mentioned topics from each item
    for item in items:
        # LLM call: "Extract 3-5 topics mentioned in this item"
        topics = llm_extract_mentioned_topics(item.content)
        for topic in topics:
            mentioned_topics[topic].append(item.id)
    
    # Find frequently mentioned but no dedicated items
    gaps = []
    for topic, item_ids in mentioned_topics.items():
        if len(item_ids) >= min_mentions:
            # Check if any Library items are ABOUT this topic
            primary_items = search_library_for_topic(topic, threshold=0.80)
            if len(primary_items) == 0:
                gaps.append({
                    "domain": topic,
                    "mentions": len(item_ids),
                    "mentioning_items": item_ids[:5],  # Top 5 for provenance
                    "type": "adjacency"
                })
    
    return sorted(gaps, key=lambda x: x["mentions"], reverse=True)
```

**LLM Prompt for Topic Extraction:**
```
Extract 3-5 topics mentioned in this item (not the primary topic).

Item: "{item_content}"

Return as JSON array of strings. Each topic should be 2-5 words.
Example: ["testing strategies", "performance monitoring", "error handling"]
```

**UI Addition:**
```
📊 Frequently Mentioned Territory

These topics appear across multiple items but you've never 
explored them as the main focus:

┌─────────────────────────────────────────────────────┐
│ DevOps & CI/CD                                      │
│ Mentioned 12× across 8 items                        │
│                                                     │
│ Related items:                                      │
│ • "AI agent deployment patterns"                    │
│ • "CLI tool distribution strategies"                │
│ • "Automating code review workflows"                │
│                                                     │
│ [Explore This →]                                    │
└─────────────────────────────────────────────────────┘
```

---

### **Phase 3: LLM Strategic Analysis** (Week 3-4)

**Goal:** Add Layer 3 — AI-powered strategic recommendations.

**Implementation in `unexplored_territory.py`:**
```python
def synthesize_strategic_territory(library_items, themes):
    """
    Use LLM to identify strategic unexplored territory based on theme patterns.
    """
    # Prepare Library summary
    theme_summary = "\n".join([
        f"- {theme.name} ({theme.item_count} items)"
        for theme in themes
    ])
    
    prompt = f"""
You are analyzing a user's Library to help them discover unexplored territory.

Their Library contains {len(library_items)} items across these themes:
{theme_summary}

Based on this exploration pattern, identify 3-5 domains they'd benefit from 
exploring but haven't yet. These should be:
1. Relevant to their existing work (not random suggestions)
2. Natural adjacencies (topics that complement what they've explored)
3. Actionable (specific enough to generate ideas about)

For each unexplored territory:
1. Name the domain (2-5 words)
2. Explain why it's relevant (connect to existing themes)
3. Suggest a specific exploration direction

Return as JSON array:
[
  {{
    "domain": "Observability & Debugging",
    "relevance": "You build AI agents and CLI tools but don't have items about monitoring or debugging them",
    "connected_themes": ["AI Agents", "CLI Tools"],
    "connected_item_count": 12,
    "suggestion": "Explore: How to add observability to agentic workflows"
  }}
]
"""
    
    response = llm_call(prompt, model="claude-sonnet-4")
    return json.loads(response)
```

---

## UI/UX Design

### **Main Page Integration**

Add to homepage (below Coverage Suggestions):

```
┌─────────────────────────────────────────────────────┐
│ 🧭 Unexplored Territory                             │
│ 3 areas worth exploring                             │
│                                                     │
│ • Testing & QA Strategies (18 conversations)        │
│ • DevOps/CI/CD (12 conversations)                   │
│ • Performance Profiling (8 conversations)           │
│                                                     │
│ [View All →]                                        │
└─────────────────────────────────────────────────────┘
```

---

### **Dedicated `/unexplored` Page**

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ 🧭 Unexplored Territory                             │
│ Discover what's around the corner                   │
│                                                     │
│ [Layer 1: Memory] [Layer 2: Adjacency] [Layer 3: Strategic] │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 📊 3 Areas Detected                                 │
│                                                     │
│ ┌─────────────────────────────────────────────┐     │
│ │ 🔴 Testing & QA Strategies                  │     │
│ │ 18 conversations • 0 Library items          │     │
│ │                                             │     │
│ │ You discuss testing frequently but haven't  │     │
│ │ extracted ideas about it yet.               │     │
│ │                                             │     │
│ │ Recent mentions:                            │     │
│ │ • Jan 5: "How to test async workflows..."   │     │
│ │ • Dec 20: "Unit testing AI agents..."       │     │
│ │                                             │     │
│ │ [Generate Ideas →] [Seek Examples →]        │     │
│ │ [Dismiss] [Not Interested]                  │     │
│ └─────────────────────────────────────────────┘     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

### **One-Click Actions**

When user clicks "Generate Ideas →":
1. Navigate to main page with Generate tab active
2. Pre-fill Advanced Settings:
   - Query: "testing strategies and workflows"
   - Preset: Last 90 days
   - Mode: Ideas
3. Show banner: "🧭 Exploring: Testing & QA Strategies"
4. User clicks Generate → Library grows in unexplored territory

When user clicks "Seek Examples →":
1. Navigate to Seek tab
2. Pre-fill query: "examples of testing strategies I've used"
3. Show banner: "🔍 Seeking examples in: Testing & QA Strategies"

---

### **Settings Configuration**

Add to Settings → Advanced:

```
🧭 Unexplored Territory

Detection Sensitivity:
[●────────────] High (5+ conversations)
              Medium (10+ conversations)
              Low (20+ conversations)

☐ Include low-severity territories
☐ Show adjacency analysis (mentioned topics)
☐ Enable strategic AI recommendations (1 LLM call/week)

Clustering Threshold: [75%]
(How similar conversations must be to group as same topic)
```

---

## Performance & Cost

### **Layer 1: Memory vs. Library**
- **Computation:** Clustering (local, fast)
- **Cost:** $0 (uses existing embeddings)
- **Frequency:** On-demand or daily cache refresh

### **Layer 2: Adjacency Analysis**
- **Computation:** 1 LLM call per item (one-time, cache results)
- **Cost:** ~$0.50 for 275 items (assuming $0.002 per call)
- **Frequency:** Run when Library grows by 25+ items

### **Layer 3: Strategic Synthesis**
- **Computation:** 1 LLM call with theme summary
- **Cost:** ~$0.05 per analysis
- **Frequency:** Weekly or on-demand

**Total Cost:** < $1/month for active user with 500 items.

---

## Success Metrics

**Engagement:**
- % of users who click "View Unexplored Territory"
- % who take action (Generate/Seek) from suggestions
- Average territories explored per user per month

**Value:**
- Do suggested territories lead to new Library items?
- User feedback: "Was this suggestion helpful?" (Yes/No/Not Relevant)

**Quality:**
- Dismissed territory rate (if >50% dismissed → detection is off)
- User feedback scores

---

## Edge Cases

| Case | Behavior |
|------|----------|
| **New user (< 50 conversations)** | Show message: "Not enough data yet — come back after generating more" |
| **Very sparse Library (< 10 items)** | Don't show (focus on building Library first) |
| **User dismisses all suggestions** | Ask: "What would be more helpful?" + Disable feature |
| **No unexplored territory found** | Show: "🎉 You've explored widely! Check back after more conversations" |
| **User clicks "Not Interested"** | Store dismissal → never suggest this domain again |

---

## Future Enhancements

**Post-MVP Ideas:**

1. **User Feedback Loop**
   - "Was this suggestion helpful?" → train better detection
   - "Add custom territory to explore" → manual input

2. **Proactive Notifications**
   - "New unexplored territory detected: [X]" (weekly digest)

3. **Territory Depth Tracking**
   - Once explored, show: "✅ Testing & QA: 5 items (well-covered)"

4. **Cross-User Patterns** (if multi-user)
   - "Users who explore [AI Agents] also explore [Prompt Engineering]"

5. **Temporal Analysis**
   - "You explored [X] 3 months ago but haven't returned — revisit?"

---

## Implementation Checklist

### **Phase 1: MVP (Layer 1)**
- [ ] Create `engine/common/unexplored_territory.py`
- [ ] Implement `detect_memory_library_mismatch()`
- [ ] Create `/api/unexplored/analyze` endpoint
- [ ] Create `/unexplored` page with UI
- [ ] Add UnexploredCard component
- [ ] Add main page integration (3-territory preview)
- [ ] Add Settings configuration (sensitivity, threshold)
- [ ] Add dismissed_territories table (optional)
- [ ] Test with real data (JM's 2.1GB history)
- [ ] E2E tests (navigation, actions, dismiss)

### **Phase 2: Adjacency (Layer 2)**
- [ ] Implement `detect_adjacency_gaps()`
- [ ] Add LLM topic extraction
- [ ] Cache adjacency results
- [ ] Add Layer 2 tab to `/unexplored` page
- [ ] Update UI to show "mentioned across X items"
- [ ] Test with 275-item Library

### **Phase 3: Strategic (Layer 3)**
- [ ] Implement `synthesize_strategic_territory()`
- [ ] Design strategic synthesis prompt
- [ ] Add Layer 3 tab to `/unexplored` page
- [ ] Add weekly refresh cron job
- [ ] Test synthesis quality with real themes

---

## Open Questions

1. **Clustering Algorithm:** DBSCAN vs. k-means vs. hierarchical?
   - **Recommendation:** Start with k-means (simpler), migrate to DBSCAN if needed

2. **Topic Naming:** Use LLM or extract keywords?
   - **Recommendation:** Extract keywords first (cheap), fallback to LLM for unclear clusters

3. **Integration Point:** Dedicated page vs. inline in Library?
   - **Recommendation:** Both — preview on main page, full analysis on dedicated page

4. **Refresh Frequency:** Real-time, daily, weekly?
   - **Recommendation:** Daily cache (Layer 1), weekly refresh (Layer 2/3)

---

**Status:** Ready to implement | **DRI:** AI Agent | **Start Date:** 2026-01-12

**Next Step:** Implement Phase 1 MVP (Layer 1) — detect_memory_library_mismatch()
