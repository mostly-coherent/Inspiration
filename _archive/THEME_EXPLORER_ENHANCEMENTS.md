# Theme Explorer Enhancements — Build Plan (LIB-10)

> **Purpose:** Unified pattern discovery for exploration  
> **Philosophy:** One place to discover what's worth exploring — whether it exists, is missing, or counter-intuitive

---

## Vision

**Mental Model:** "Go to Theme Explorer to discover patterns/themes worth exploring"

**Three Discovery Modes:**

| Tab | What It Finds | User Question |
|-----|--------------|---------------|
| **Patterns** | Cluster what EXISTS (similarity) | "What themes exist in my Library?" |
| **Unexplored** | Find what's MISSING from Library but in Memory | "What haven't I extracted yet?" |
| **Counter-Intuitive** | Generate GOOD OPPOSITE of what's in Library & Memory | "What counter-perspectives should I consider?" |

**Value Proposition:**
- **Single destination:** All pattern discovery in one place
- **Actionable:** Patterns & Unexplored lead to item generation; Counter-Intuitive provides reflection prompts
- **Progressive:** Natural flow from existing → missing (empirical) → counter-perspectives (awareness)

---

## Why Unified Theme Explorer?

| Approach | Cognitive Load | User Goal | Discoverability |
|----------|----------------|-----------|-----------------|
| **Unified (3 tabs)** | ✅ Low — one place | Same: "What to explore?" | ✅ High — single entry point |
| **Separate pages** | ❌ High — 3 places | Same goal, scattered | ❌ Low — hard to find |

**Conclusion:** Same user goal deserves unified experience.

---

## Tab 1: Patterns (Existing Functionality)

**What it does:** Cluster existing Library items by similarity (current Theme Explorer behavior)

**Controls:**
- Zoom slider: 0.5 → 0.9 (broad → specific themes)
- Filter: All / Ideas / Insights / Use Cases

**Implementation:** Already complete — no changes needed

**UI:**
```
🎨 12 themes found

┌────────────────────────────────┐
│ AI Development Tools           │
│ 8 ideas, 3 insights            │
│ [Synthesize] [View Items]      │
└────────────────────────────────┘
```

---

## Tab 2: Unexplored Territory (NEW)

**What it does:** Find topics discussed in Memory but missing from Library

### Layer 1: Memory vs. Library Mismatch (MVP)

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

**UI:**
```
🧭 3 unexplored areas detected

┌────────────────────────────────────────────┐
│ 🔴 Testing & QA Strategies                 │
│ 18 conversations • 0 Library items         │
│                                            │
│ You discuss testing frequently but haven't │
│ extracted ideas about it yet.              │
│                                            │
│ [Generate Ideas] [Generate Insights]       │
└────────────────────────────────────────────┘
```

**Filters:**
- Severity: High (20+ convs) / Medium (10-19) / Low (5-9)
- Item type: All / Ideas / Insights / Use Cases

**Implementation:**
- File: `engine/common/unexplored_territory.py`
- Function: `detect_memory_library_mismatch()`
- Cost: Zero (uses existing embeddings, just cosine similarity)

---

### Layer 2: Adjacency Analysis (Optional Enhancement)

**Concept:** Topics mentioned in passing across items but never explored deeply.

**Algorithm:**
1. For each Library item, LLM extracts "mentioned-but-not-primary" topics
2. Aggregate mentioned topics across all items
3. Find topics mentioned 5+ times but with 0 dedicated items

**UI:**
```
📊 Frequently mentioned, never explored:

• DevOps/CI/CD (mentioned 12× across 8 items)
• Performance profiling (mentioned 8× across 5 items)

[Generate Ideas] [Generate Insights]
```

**Cost:** 1 LLM call per item (one-time, cached)

---

### Layer 3: Strategic Gap Analysis (Optional Enhancement)

**Concept:** LLM analyzes Library holistically to suggest "expected neighbors" that are missing.

**Algorithm:**
1. Feed LLM Library summary
2. Prompt: "Given these interests, what related domains are absent?"
3. Cache result (recalculate when Library grows 10+ items)

**UI:**
```
🧠 Strategic gaps:

• State Management Patterns
  (Your React items rarely discuss state architecture)
  
[Generate Ideas] [Generate Insights]
```

**Cost:** ~$0.10-$0.20 per analysis

---

## Tab 3: Counter-Intuitive (NEW)

**What it does:** Suggest GOOD OPPOSITE perspectives to Library themes via LLM projection (reflection prompts, not Library items)

**Why:** Help users question assumptions by raising awareness of counter-perspectives they haven't considered

**Important:** Counter-Intuitive does NOT generate Library items. Library remains pure (chat-only). This tab provides reflection prompts to plant seeds for future thinking.

### Algorithm

1. **Find strong beliefs:** Cluster Library → Keep clusters with 5+ items (strong themes)
2. **Generate counter-angle:** LLM analyzes cluster → Suggests valuable counter-perspective
3. **Check novelty:** Verify counter-angle doesn't exist in Memory or Library
4. **Surface if novel:** Show as exploration suggestion

### Example Flow

**User has cluster:** "Ship Fast" (10 items about rapid iteration)

**LLM generates:**
```
Counter-perspective: "When Slowing Down Creates More Value"

Suggested angles to explore:
• Quality compounds over time (technical debt costs)
• When perfection matters (mission-critical systems)
• Strategic patience (timing market entry)
```

**Verification:** Check if these angles exist in Memory/Library
- If NOT → Surface as suggestion
- If YES → Skip (user already explored this)

### UI

```
🔄 4 counter-intuitive angles detected

┌────────────────────────────────────────────┐
│ Counter to: "Ship Fast" (10 items)         │
│                                            │
│ Your Library emphasizes rapid iteration.  │
│ Have you considered: When does slowing    │
│ down create more value?                   │
│                                            │
│ Angles to explore:                         │
│ • Quality compounds over time             │
│ • Technical debt costs                     │
│ • When perfection matters                  │
│                                            │
│ 💡 Reflection Prompt — Think about this   │
│    next time you're making speed/quality  │
│    trade-offs.                             │
│                                            │
│ [Keep in Mind] [Dismiss]                   │
└────────────────────────────────────────────┘
```

**Actions:**
- **Keep in Mind:** Saves as reflection prompt (shows in a "Saved Reflections" section)
- **Dismiss:** Hides this suggestion permanently
- **No generation:** Does not create Library items

### Implementation

**Files:**
- `engine/common/counter_intuitive.py` — Core detection logic
- `engine/prompts/counter_intuitive.md` — LLM prompt template

**Function signature:**
```python
def detect_counter_intuitive(
    library_items: list[Item],
    min_cluster_size: int = 5,
    threshold: float = 0.8
) -> list[CounterIntuitiveSuggestion]:
    """
    Find strong Library clusters and generate counter-perspectives.
    
    Returns suggestions where counter-angle doesn't exist in Memory/Library.
    """
```

**Cost:** ~$0.05-$0.10 per cluster (Claude Haiku)

**Filters:**
- Min cluster size: 3+ / 5+ / 10+ items (only strong beliefs worth questioning)
- Saved reflections: Show / Hide

---

## UI/UX Design

### Tab Navigation (in Theme Explorer)

**Location:** `/themes` page

**Tab Bar:**
```
┌──────────────────────────────────────────────────┐
│ Theme Explorer                                    │
│                                                   │
│ [Patterns] [Unexplored] [Counter-Intuitive]      │
│  (active)                                         │
│                                                   │
│ Filter: [All ▼] [Ideas] [Insights] [Use Cases]  │
│                                                   │
│ [Tab-specific content below...]                   │
└──────────────────────────────────────────────────┘
```

**Tab: Patterns** (existing Theme Explorer)
- Zoom slider
- Cluster display
- [Synthesize] actions

**Tab: Unexplored**
- Severity filter: High / Medium / Low
- Layer toggle: Memory Gaps / Adjacency / Strategic
- [Generate Ideas/Insights] actions

**Tab: Counter-Intuitive**
- Min cluster size: 3+ / 5+ / 10+ items
- [Keep in Mind] [Dismiss] actions
- "Saved Reflections" section (view past prompts)

---

### Actions by Tab

**Patterns & Unexplored Tabs:**

1. **Generate Ideas:** 
   - Opens Generate panel
   - Pre-fills topic/theme
   - Suggests date range (for Unexplored only)
   
2. **Generate Insights:**
   - Opens Generate panel
   - Pre-fills topic/theme
   - Suggests date range (for Unexplored only)

3. **Dismiss:**
   - Hides suggestion (persistent)

**Counter-Intuitive Tab:**

1. **Keep in Mind:**
   - Saves as reflection prompt
   - Shows in "Saved Reflections" section
   - Can be reviewed later

2. **Dismiss:**
   - Hides suggestion (persistent)

---

## Implementation Details

### Frontend Components

**Modified Files:**
- `src/app/themes/page.tsx` — Add tab navigation (Patterns / Unexplored / Counter-Intuitive)
- `src/components/ThemeExplorerTabs.tsx` — NEW: Tab switcher component
- `src/components/UnexploredCard.tsx` — NEW: Display unexplored areas
- `src/components/CounterIntuitiveCard.tsx` — NEW: Display reflection prompts
- `src/components/SavedReflections.tsx` — NEW: Display saved reflection prompts

---

### Backend API

**New Endpoints:**
- `GET /api/themes/unexplored` — Get unexplored areas (Layer 1-3)
- `GET /api/themes/counter-intuitive` — Get counter-perspective prompts
- `POST /api/themes/counter-intuitive/save` — Save reflection prompt ("Keep in Mind")
- `GET /api/themes/counter-intuitive/saved` — Get saved reflection prompts
- `POST /api/themes/dismiss` — Dismiss a suggestion

**Response Schemas:**
```typescript
interface UnexploredArea {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  stats: {
    conversationCount: number;
    libraryItemCount: number;
  };
  layer: 1 | 2 | 3;
}

interface CounterIntuitiveSuggestion {
  id: string;
  clusterTitle: string;
  clusterSize: number;
  counterPerspective: string;
  suggestedAngles: string[];
  reasoning: string;
  isSaved: boolean;  // User clicked "Keep in Mind"
  savedAt?: string;  // ISO timestamp
}

interface SavedReflection {
  id: string;
  suggestion: CounterIntuitiveSuggestion;
  savedAt: string;
  viewedCount: number;
}
```

---

### Python Engine

**New Files:**
- `engine/common/unexplored_territory.py` — Unexplored detection (Layers 1-3)
- `engine/common/counter_intuitive.py` — Counter-perspective generation

**New Prompts:**
- `engine/prompts/adjacency_extraction.md` — Extract mentioned topics (Layer 2)
- `engine/prompts/strategic_gaps.md` — Strategic gap analysis (Layer 3)
- `engine/prompts/counter_intuitive.md` — Generate counter-perspectives

---

## Settings Configuration

**New Section:** Settings → Theme Explorer

```
┌──────────────────────────────────────────────┐
│ Theme Explorer Settings                      │
│                                              │
│ Unexplored Territory:                        │
│ ☑ Layer 1: Memory vs. Library              │
│ ☑ Layer 2: Adjacency Analysis              │
│ ☐ Layer 3: Strategic Gaps (LLM)            │
│                                              │
│ Thresholds:                                  │
│ High: [20+] convs | Medium: [10-19] | Low: [5-9] │
│                                              │
│ Counter-Intuitive:                           │
│ ☑ Enable counter-perspective suggestions   │
│ Min cluster size: [5] items                 │
│                                              │
│ Display:                                     │
│ ☑ Show low priority areas                  │
│                                              │
│ [Save Settings]                              │
└──────────────────────────────────────────────┘
```

---

## Implementation Checklist

### Phase 1: Tab Navigation — ✅ COMPLETE (2026-01-13)

**Frontend:**
- [x] Add tab navigation to `src/app/themes/page.tsx`
- [x] Create `src/components/ThemeExplorerTabs.tsx`
- [x] Update routing to support `/themes?tab=patterns|unexplored|counterIntuitive`
- [x] Preserve existing Patterns tab functionality

---

### Phase 2: Unexplored Tab — Layer 1 — ✅ COMPLETE (2026-01-13)

**Backend:**
- [x] Create `engine/common/unexplored_territory.py`
- [x] Implement `detect_memory_library_mismatch()`
- [x] Add clustering logic (reuse from Theme Explorer)
- [x] Create endpoint: `GET /api/themes/unexplored`

**Frontend:**
- [x] Create `src/components/UnexploredTab.tsx` (full implementation)
- [x] Wire up "Generate Ideas/Insights" actions
- [x] Add severity filter (All / High / Medium / Low)

**Testing:**
- [x] E2E test 28 passing

---

### Phase 3: Counter-Intuitive Tab — ✅ COMPLETE (2026-01-13)

**Backend:**
- [x] Create `engine/common/counter_intuitive.py`
- [x] Create `engine/prompts/counter_intuitive.md`
- [x] Implement cluster → counter-angle → LLM generation
- [x] Create endpoints: `GET /api/themes/counter-intuitive`, `POST/GET/DELETE /api/themes/counter-intuitive/save`

**Frontend:**
- [x] Create `src/components/CounterIntuitiveTab.tsx` (full implementation)
- [x] Wire up "Keep in Mind" action (saves to `data/saved_reflections.json`)
- [x] Wire up "Dismiss" action (saves to `data/dismissed_reflections.json`)
- [x] Add min cluster size filter (3+/5+/10+)
- [x] Add "Saved Reflections" toggle view

**Testing:**
- [x] E2E test 29 passing
- [x] CLI test: `python3 engine/common/counter_intuitive.py --min-size 5 --max 1`
- [ ] **Validate value:** If users don't engage after 2 weeks, remove feature

---

### Phase 4: Settings & Docs — ✅ COMPLETE (2026-01-13)

- [x] Add Settings → Theme Explorer section (Unexplored + Counter-Intuitive settings)
- [x] Update ThemeExplorerConfig type with nested settings
- [x] Update CLAUDE.md with new features
- [x] Update README.md with new features
- [x] E2E tests passing

### Phase 5: Optional Enhancements (Future)

**Unexplored Layer 2 (Adjacency):**
- [ ] Implement `detect_adjacency_gaps()`
- [ ] Add layer toggle to UI

**Unexplored Layer 3 (Strategic):**
- [ ] Implement `llm_strategic_gap_analysis()`
- [ ] Add caching (invalidate on +10 items)

### Phase 6: Polish (Future)

- [ ] Add keyboard shortcuts
- [ ] Performance optimization (target: < 3s per tab)
- [x] Dismiss functionality (Counter-Intuitive) — done in Phase 3

---

## Success Metrics

**Engagement:**
- Users visit all 3 tabs within first week
- 30%+ of suggestions lead to "Generate" action
- Average 2+ explorations per week (any tab)

**Quality:**
- Unexplored: < 10% false positives
- Counter-Intuitive: > 50% "Keep in Mind" rate (if lower, consider removing)
- < 20% dismiss rate overall

**Kill Criteria (Counter-Intuitive only):**
- < 20% engagement after 2 weeks → Remove tab
- > 80% dismiss rate → Feature doesn't resonate
- Zero saved reflections → No value delivered

**Performance:**
- Tab switch: < 500ms
- Unexplored Layer 1: < 3s
- Counter-Intuitive: < 5s

**Cost:**
- Unexplored Layer 1: $0 (uses existing embeddings)
- Counter-Intuitive: < $0.10 per analysis (cached)

---

**Last Updated:** 2026-01-12  
**Status:** Ready for implementation
