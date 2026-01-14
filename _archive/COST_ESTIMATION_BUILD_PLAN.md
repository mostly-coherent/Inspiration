# FAST-2: Cost Estimation — Build Plan

> **Goal:** Show "This will cost ~$0.12" before Theme Map generation to address cost anxiety

---

## Overview

**Problem:** Users hesitate to click "Generate Theme Map" without knowing the cost.

**Solution:** Display estimated cost before generation based on:
- Conversation count
- Provider (Anthropic, OpenAI, OpenRouter)
- Model (Claude Sonnet 4, GPT-4, etc.)

**User Experience:**
```
┌─────────────────────────────────────────────┐
│ Step 3: Generate Your Theme Map             │
│                                             │
│ We'll analyze 47 recent conversations       │
│                                             │
│ 💰 Estimated cost: ~$0.12                  │
│    (Anthropic Claude Sonnet 4)             │
│                                             │
│ [Generate Theme Map] ←─ Clear, confident   │
└─────────────────────────────────────────────┘
```

**Success Criteria:**
- ✅ Accurate cost estimate (within ±20% of actual)
- ✅ Shown before generation starts
- ✅ Updates when user changes provider/model
- ✅ Explains what drives the cost

---

## Phases

### Phase 0: Cost Calculation Logic (Python)

**Build:**
1. Create `engine/common/cost_estimator.py` with pricing data and estimation logic
2. Add cost estimation to `engine/generate_themes.py` CLI
3. Test estimation accuracy against actual runs

**Acceptance Criteria:**
- [ ] Pricing table for all supported providers/models (as of Jan 2026)
- [ ] Token estimation based on conversation count + avg message length
- [ ] CLI flag: `--estimate-cost` returns cost without running generation
- [ ] Returns: `{ "estimated_cost_usd": 0.12, "input_tokens": 8000, "output_tokens": 2500, "breakdown": {...} }`

**Effort:** ~2 hours

---

### Phase 1: API Integration

**Build:**
1. Update `/api/generate-themes` GET endpoint to accept `?estimateCost=true`
2. Return cost estimate along with DB metrics
3. Handle errors gracefully (unknown model, missing pricing data)

**Acceptance Criteria:**
- [ ] GET `/api/generate-themes?estimateCost=true&days=7&provider=anthropic&model=claude-sonnet-4-20250514` returns cost estimate
- [ ] Response format: `{ "dbMetrics": {...}, "costEstimate": {...} }`
- [ ] Error handling for unsupported models

**Effort:** ~1 hour

---

### Phase 2: Frontend Display

**Build:**
1. Update `onboarding-fast/page.tsx` to fetch cost estimate after API key is validated
2. Display cost prominently in Step 3 (before "Generate Theme Map" button)
3. Show breakdown on hover/click: "Input: $0.08 + Output: $0.04"
4. Handle loading state and errors

**Acceptance Criteria:**
- [ ] Cost estimate fetched automatically after Step 2 (API key entry)
- [ ] Displayed as: "💰 Estimated cost: ~$0.12"
- [ ] Updates when user changes days/provider/model (if we add those controls later)
- [ ] Graceful fallback if estimation fails: "Cost: ~$0.10-0.30 (typical)"

**Effort:** ~2 hours

---

### Phase 3: Pricing Data Maintenance

**Build:**
1. Document pricing sources and update cadence
2. Add comments in `cost_estimator.py` with source URLs and last updated date
3. Create `engine/scripts/update_pricing.py` helper to check current pricing

**Acceptance Criteria:**
- [ ] Comments in code: "Source: https://anthropic.com/pricing (Last updated: 2026-01-13)"
- [ ] Script to verify pricing is still accurate
- [ ] Reminder to check pricing quarterly

**Effort:** ~30 minutes

---

### Phase 4: Testing & Validation

**Build:**
1. Run 5 Theme Map generations with different conversation counts
2. Compare estimated vs actual costs
3. Adjust estimation logic if error > ±20%
4. Add E2E test for cost display

**Acceptance Criteria:**
- [ ] Estimation accuracy: within ±20% for 5 test runs
- [ ] E2E test: `/onboarding-fast` shows cost estimate in Step 3
- [ ] Manual testing: Try all 3 providers (Anthropic, OpenAI, OpenRouter)

**Effort:** ~1.5 hours

---

## Technical Details

### Cost Estimation Logic

**Input Token Calculation:**
```python
# Per-conversation estimate
avg_message_length = 200  # characters
avg_messages_per_conversation = 15
chars_per_conversation = avg_message_length * avg_messages_per_conversation
tokens_per_conversation = chars_per_conversation / 3.5  # rough char-to-token ratio

# Total input tokens
total_input_tokens = conversation_count * tokens_per_conversation + system_prompt_tokens
```

**Output Token Estimate:**
```python
# Theme Map output is fairly consistent
estimated_output_tokens = 2500  # Based on actual Theme Map JSON size
```

**Cost Calculation:**
```python
pricing = {
    "anthropic": {
        "claude-sonnet-4-20250514": {
            "input": 3.00 / 1_000_000,   # $3/MTok
            "output": 15.00 / 1_000_000  # $15/MTok
        }
    },
    "openai": {
        "gpt-4o": {
            "input": 2.50 / 1_000_000,   # $2.50/MTok
            "output": 10.00 / 1_000_000  # $10/MTok
        }
    }
}

input_cost = total_input_tokens * pricing[provider][model]["input"]
output_cost = estimated_output_tokens * pricing[provider][model]["output"]
total_cost = input_cost + output_cost
```

### Pricing Data (as of 2026-01-13)

| Provider | Model | Input ($/MTok) | Output ($/MTok) | Source |
|----------|-------|----------------|-----------------|--------|
| Anthropic | claude-sonnet-4-20250514 | $3.00 | $15.00 | [anthropic.com/pricing](https://www.anthropic.com/pricing) |
| Anthropic | claude-3-5-sonnet-20241022 | $3.00 | $15.00 | [anthropic.com/pricing](https://www.anthropic.com/pricing) |
| OpenAI | gpt-4o | $2.50 | $10.00 | [openai.com/pricing](https://openai.com/pricing) |
| OpenAI | gpt-4o-mini | $0.15 | $0.60 | [openai.com/pricing](https://openai.com/pricing) |
| OpenRouter | (varies) | N/A | N/A | Use fallback estimate or API lookup |

**Note:** For OpenRouter, we can either:
1. Use a conservative fallback estimate (~$0.20-0.30)
2. Call OpenRouter's model listing API to get real-time pricing

### API Contract

**Request:**
```
GET /api/generate-themes?estimateCost=true&days=7&provider=anthropic&model=claude-sonnet-4-20250514
```

**Response:**
```json
{
  "dbMetrics": {
    "estimatedConversations": 47,
    "dbSizeMB": 120,
    "suggestedDays": 7
  },
  "costEstimate": {
    "estimatedCostUSD": 0.12,
    "inputTokens": 8000,
    "outputTokens": 2500,
    "breakdown": {
      "inputCostUSD": 0.024,
      "outputCostUSD": 0.0375
    },
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "disclaimer": "Estimate may vary ±20% based on actual conversation length"
  }
}
```

### Frontend Display

**Step 3 UI (Updated):**
```tsx
<div className="space-y-4">
  <div className="text-sm text-gray-600">
    We'll analyze <strong>{dbMetrics.estimatedConversations} recent conversations</strong>
  </div>

  {costEstimate && (
    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <span className="text-2xl">💰</span>
      <div>
        <div className="font-medium text-blue-900">
          Estimated cost: ~${costEstimate.estimatedCostUSD.toFixed(2)}
        </div>
        <div className="text-xs text-blue-700">
          {costEstimate.provider} {costEstimate.model}
        </div>
      </div>
      <button
        onClick={() => setShowBreakdown(!showBreakdown)}
        className="ml-auto text-xs text-blue-600 hover:underline"
      >
        Details
      </button>
    </div>
  )}

  {showBreakdown && costEstimate && (
    <div className="text-xs text-gray-600 space-y-1">
      <div>Input: {costEstimate.inputTokens.toLocaleString()} tokens (~${costEstimate.breakdown.inputCostUSD.toFixed(3)})</div>
      <div>Output: {costEstimate.outputTokens.toLocaleString()} tokens (~${costEstimate.breakdown.outputCostUSD.toFixed(3)})</div>
      <div className="text-gray-500 italic">{costEstimate.disclaimer}</div>
    </div>
  )}

  <button
    onClick={generateThemeMap}
    disabled={isGenerating}
    className="..."
  >
    {isGenerating ? 'Generating...' : 'Generate Theme Map'}
  </button>
</div>
```

---

## Summary: Total Effort

| Phase | Tasks | Hours |
|-------|-------|-------|
| 0. Cost Logic (Python) | Pricing data + token estimation + CLI integration | 2.0 |
| 1. API Integration | Update `/api/generate-themes` endpoint | 1.0 |
| 2. Frontend Display | Fetch + display cost estimate in Step 3 | 2.0 |
| 3. Pricing Maintenance | Document sources + update script | 0.5 |
| 4. Testing & Validation | Compare estimated vs actual + E2E tests | 1.5 |
| **TOTAL** | | **7 hours** |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Pricing changes | Estimate becomes inaccurate | Document update cadence + quarterly review |
| Token estimation off | User sees surprise cost | Add ±20% disclaimer + test against real runs |
| OpenRouter pricing varies | Can't estimate accurately | Use conservative fallback (~$0.20-0.30) |
| API latency | Cost fetch delays Step 3 | Show loading state + allow proceeding without estimate |

---

## Future Enhancements

1. **Real-time model picker:** Let user select model in onboarding, show cost update live
2. **Cost history:** Track actual costs over time, show in Settings
3. **Budget warnings:** "You've spent $5 this month" notification
4. **Batch discount estimation:** If Anthropic offers batch API pricing

---

**Status:** ✅ **COMPLETE**  
**Priority:** HIGH (Tier 1)  
**Actual Timeline:** ~3 hours (faster than estimated)

---

## Implementation Summary

**Completed 2026-01-14:**
- Phase 0: `engine/common/cost_estimator.py` + CLI flag ✅
- Phase 1: API endpoint `?estimateCost=true` ✅
- Phase 2: Frontend UI in onboarding-fast ✅
- Phase 3: `engine/scripts/check_pricing.py` ✅
- Phase 4: E2E tests (03b, 08b, 08c) ✅

**Files Created/Modified:**
- `engine/common/cost_estimator.py` (new)
- `engine/generate_themes.py` (modified)
- `engine/scripts/check_pricing.py` (new)
- `src/app/api/generate-themes/route.ts` (modified)
- `src/app/onboarding-fast/page.tsx` (modified)
- `e2e/fast-start.spec.ts` (modified)

**Test Results:** 14/14 Fast Start E2E tests pass

---

**Last Updated:** 2026-01-14
