# Unexplored Territory → Enrich Library Build Plan

> **Purpose:** Eliminate Coverage Intelligence, invest in Unexplored Territory with "Enrich Library" action
> **Created:** 2026-01-13
> **Status:** In Progress

---

## Vision

Transform "Unexplored Territory" from a passive display into an actionable feature:
- **Current:** "Here are topics you discuss but haven't captured" (informational)
- **New:** "Want me to enrich your Library with these topics?" (actionable)

**User Outcome:**
1. See unexplored topics (topics in Memory but not Library)
2. One-click "Enrich Library" → system auto-generates ideas/insights
3. Or "Dismiss" → mark as noise, don't surface again
4. Come back later → new items in Library, visible in Patterns tab

---

## Architecture: Reusing Generate Engine

**Key Decision:** Topic-based extraction (not time-period based)

```
Unexplored Area: "prompt engineering"
         │
         ▼
User clicks "Enrich Library"
         │
         ▼
┌─────────────────────────────────────────┐
│ EXISTING Generate Engine (reused)       │
│                                         │
│ 1. Topic Filter (NEW)                   │
│    └─ Semantic search: find convos      │
│       about "prompt engineering"        │
│                                         │
│ 2. LLM Synthesis (existing)             │
│    └─ Extract ideas/insights            │
│                                         │
│ 3. Harmonization (existing)             │
│    └─ Dedupe, add to Library            │
│                                         │
│ 4. Progress Streaming (existing)        │
│    └─ Real-time UI updates              │
└─────────────────────────────────────────┘
         │
         ▼
New items in Library → Patterns tab
```

---

## Implementation Phases

### Phase 1: Topic Filter in Generate Engine
**Goal:** Add `--topic` parameter to `generate.py` for semantic pre-filtering

**Files to modify:**
- [ ] `engine/generate.py` — Add topic filter logic
- [ ] `engine/common/semantic_search.py` — Reuse existing search (if needed)

**Changes:**
```python
# generate.py CLI addition
parser.add_argument("--topic", help="Topic to filter conversations by (semantic search)")

# In main():
if args.topic:
    # Semantic search to find relevant conversations
    relevant_convos = semantic_search_conversations(args.topic, limit=50)
    # Filter conversations to only those IDs
    conversations = [c for c in conversations if c["chat_id"] in relevant_convos]
```

**Acceptance Criteria:**
- [ ] `python3 engine/generate.py --mode ideas --topic "prompt engineering"` works
- [ ] Only generates from conversations semantically related to topic
- [ ] Progress markers show "Found X relevant conversations"

---

### Phase 2: Enrich API Endpoint
**Goal:** Create `/api/unexplored/enrich` endpoint that calls Generate with topic filter

**Files to create/modify:**
- [ ] `src/app/api/unexplored/enrich/route.ts` — New endpoint
- [ ] Reuse existing `generate-stream` pattern for progress

**API Contract:**
```typescript
// POST /api/unexplored/enrich
// Request:
{
  areaId: string;           // Unexplored area ID
  topic: string;            // Topic description for semantic search
  modes: ("idea" | "insight")[];  // What to generate
}

// Response (streaming):
{
  phase: "searching" | "generating_ideas" | "generating_insights" | "complete";
  progress: number;         // 0-100
  details: string;          // Human-readable status
  results?: {
    ideas: number;
    insights: number;
    totalAdded: number;
  };
}
```

**Acceptance Criteria:**
- [ ] Endpoint accepts topic and modes
- [ ] Calls generate.py with --topic flag
- [ ] Streams progress to client
- [ ] Returns summary of items added

---

### Phase 3: Dismiss/Ignore Functionality
**Goal:** Allow users to dismiss unexplored areas as "noise"

**Files to create/modify:**
- [ ] `src/app/api/unexplored/dismiss/route.ts` — New endpoint
- [ ] `data/dismissed_topics.json` — Storage for dismissed topics
- [ ] `engine/common/unexplored_territory.py` — Filter out dismissed topics

**API Contract:**
```typescript
// POST /api/unexplored/dismiss
{
  areaId: string;
  topic: string;
  reason?: string;  // Optional: "not relevant", "already covered", etc.
}
```

**Acceptance Criteria:**
- [ ] Dismissed topics don't appear in future Unexplored Territory scans
- [ ] User can see/manage dismissed topics in Settings (optional, phase 4)

---

### Phase 4: Enhanced Unexplored Tab UI
**Goal:** Add "Enrich Library" and "Dismiss" buttons with progress feedback

**Files to modify:**
- [ ] `src/components/UnexploredTab.tsx` — Add action buttons and progress UI

**UI States:**

1. **Default (unexplored area card):**
```
┌─────────────────────────────────────────────────────────────┐
│ 🧭 Prompt Engineering                                       │
│ You've discussed this 18 times but haven't captured any     │
│ ideas or insights about it yet.                             │
│                                                             │
│ [🔮 Enrich Library]  [👋 Dismiss]                           │
│                                                             │
│ ℹ️ "Enrich Library" will scan your chats about this topic  │
│    and extract ideas + insights. Takes ~30 seconds.         │
└─────────────────────────────────────────────────────────────┘
```

2. **Enriching (in progress):**
```
┌─────────────────────────────────────────────────────────────┐
│ 🔮 Enriching Library: Prompt Engineering                    │
│                                                             │
│ ████████████░░░░░░░░ 60%                                   │
│                                                             │
│ ✅ Found 23 relevant conversations                          │
│ ✅ Generated 5 ideas                                        │
│ ⏳ Generating insights...                                   │
│                                                             │
│ You can leave this page — we'll notify you when done.      │
└─────────────────────────────────────────────────────────────┘
```

3. **Complete:**
```
┌─────────────────────────────────────────────────────────────┐
│ ✅ Library Enriched: Prompt Engineering                     │
│                                                             │
│ Added to your Library:                                      │
│ • 5 new Ideas                                               │
│ • 3 new Insights                                            │
│                                                             │
│ [View in Patterns →]                                        │
└─────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] "Enrich Library" button triggers API call
- [ ] Progress shows real-time updates
- [ ] "Dismiss" removes area from list
- [ ] Success state shows items added with link to Patterns

---

### Phase 5: Remove Coverage Intelligence
**Goal:** Clean up deprecated Coverage Intelligence code

**Files to remove:**
- [ ] `src/app/explore-coverage/` — Entire page
- [ ] `src/components/CoverageSuggestions.tsx`
- [ ] `src/components/CoverageVisualization.tsx`
- [ ] `src/app/api/coverage/` — All coverage APIs
- [ ] `engine/common/coverage.py`

**Files to modify:**
- [ ] `src/app/page.tsx` — Remove coverage score from scoreboard
- [ ] `src/components/ScoreboardHeader.tsx` — Remove coverage references
- [ ] Navigation — Remove "Explore Coverage" link

**Acceptance Criteria:**
- [ ] No coverage-related code remains
- [ ] App still functions correctly
- [ ] No dead links or broken imports

---

### Phase 6: Documentation & Polish
**Goal:** Update docs, add tooltips, improve UX copy

**Files to update:**
- [ ] `CLAUDE.md` — Remove Coverage Intelligence, document Enrich feature
- [ ] `PLAN.md` — Update roadmap status
- [ ] `BUILD_LOG.md` — Document completion
- [ ] `README.md` — Update feature list

**UX Polish:**
- [ ] Add tooltips explaining each action
- [ ] Ensure layman-friendly language throughout
- [ ] Test empty states and error handling

---

## Implementation Checklist

### Phase 1: Topic Filter in Generate Engine ✅
- [x] Add `--topic` argument to CLI
- [x] Implement semantic search pre-filter
- [x] Add progress marker for "Found X conversations"
- [x] Test: `generate.py --mode ideas --topic "test topic"`

### Phase 2: Enrich API Endpoint ✅
- [x] Create `/api/unexplored/enrich/route.ts`
- [x] Implement streaming response
- [x] Call generate.py with topic filter
- [x] Test: POST to endpoint, verify streaming

### Phase 3: Dismiss/Ignore Functionality ✅
- [x] Create `/api/unexplored/dismiss/route.ts`
- [x] Create `dismissed_topics.json` storage
- [x] Filter dismissed topics in `unexplored_territory.py`
- [x] Test: Dismiss topic, verify it doesn't reappear

### Phase 4: Enhanced Unexplored Tab UI ✅
- [x] Add "Enrich Library" button
- [x] Add "Dismiss" button
- [x] Implement progress UI
- [x] Implement success state
- [x] Test: Full user flow

### Phase 5: Remove Coverage Intelligence ✅
- [x] Delete coverage pages and components
- [x] Delete coverage APIs
- [x] Delete coverage engine code
- [x] Update imports and navigation
- [x] Test: App still works

### Phase 6: Documentation & Polish ✅
- [x] Update CLAUDE.md
- [x] Update PLAN.md
- [x] Update README.md
- [x] Add BUILD_LOG.md entry
- [x] Final UX review (layman-friendly copy)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| "Enrich Library" works end-to-end | ✅ |
| Progress streaming is real-time | ✅ |
| Dismissed topics don't reappear | ✅ |
| Coverage Intelligence fully removed | ✅ |
| No regressions in existing features | ✅ |
| Layman-friendly UX copy | ✅ |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Generate takes too long | Show "you can leave" message, async processing |
| Topic filter finds no conversations | Show helpful message, suggest broader topic |
| User dismisses important topics | Allow "restore dismissed" in Settings |
| Breaking changes during Coverage removal | Test thoroughly before deleting |

---

## Timeline Estimate

| Phase | Effort | Status |
|-------|--------|--------|
| Phase 1: Topic Filter | 1-2 hours | ⬜ Not started |
| Phase 2: Enrich API | 1-2 hours | ⬜ Not started |
| Phase 3: Dismiss | 30 min | ⬜ Not started |
| Phase 4: UI | 1-2 hours | ⬜ Not started |
| Phase 5: Cleanup | 30 min | ⬜ Not started |
| Phase 6: Docs | 30 min | ⬜ Not started |
| **Total** | **5-7 hours** | |

---

**Version:** 1.0
**Last Updated:** 2026-01-13
**Status:** ✅ All Phases Complete
