# Testing Onboarding Flows (v2.1)

> **Purpose:** Guide for testing onboarding flows, even when already set up

---

## Quick Start: Reset Onboarding State

### Option 1: UI Button (Easiest)

1. Navigate to **Settings** → **Advanced** tab
2. Scroll to **"Testing & Development"** section
3. Click **"Reset Onboarding State"** button
4. Confirm the reset
5. You'll see a success message with details

**What it clears:**
- ✅ Theme map cache (all date ranges)
- ✅ Onboarding tracking state
- ❌ **Does NOT delete:** Vector DB data, library items, or configuration

### Option 2: API Endpoint (Programmatic)

```bash
# POST request to reset onboarding
curl -X POST http://localhost:3000/api/test/reset-onboarding
```

**Response:**
```json
{
  "success": true,
  "message": "Onboarding state reset",
  "details": [
    "✅ Cleared theme map cache from Supabase",
    "✅ Deleted 3 theme map cache files"
  ],
  "note": "Vector DB data was NOT deleted. Only cache and tracking were cleared."
}
```

**⚠️ Dev Mode Only:** This endpoint returns `403 Forbidden` in production.

---

## Testing Onboarding Flows

### 1. Test Choice Screen (>500MB)

**Prerequisites:**
- Reset onboarding state (see above)
- Mock API to return >500MB history

**Steps:**
1. Navigate to `/onboarding-choice`
2. Verify both options appear:
   - ⚡ Quick Start (90 seconds)
   - 🔧 Full Setup (15 min + indexing)
3. Click each button to verify navigation

**E2E Test:** `e2e/onboarding.spec.ts` → "Choice Screen (>500MB users)"

### 2. Test Quick Start Flow

**Steps:**
1. Navigate to `/onboarding-fast?mode=partial`
2. Verify partial mode banner appears:
   - "Quick Start Mode"
   - "Analyzing the most recent 500MB"
3. Complete onboarding flow
4. Verify Theme Map generates from recent 500MB only

**E2E Test:** `e2e/onboarding.spec.ts` → "Quick Start Flow"

### 3. Test Full Setup Flow

**Steps:**
1. Navigate to `/onboarding`
2. Enter API keys (Anthropic + OpenAI + Supabase)
3. Verify "Indexing Scope" step appears:
   - Slider (10-100%)
   - Real-time cost/time estimates
   - Date range coverage
4. Adjust slider and verify estimates update
5. Click "Start Indexing"
6. Verify indexing proceeds with selected percentage

**E2E Test:** `e2e/onboarding.spec.ts` → "Full Setup Flow"

### 4. Test "Index More History" Feature

**Prerequisites:**
- Vector DB must be initialized
- Some history already indexed (<100%)

**Steps:**
1. Navigate to **Settings** → **General** tab
2. Scroll to **"Vector Database (Memory)"** section
3. Verify **"Indexing Status"** card appears:
   - Current percentage (e.g., "60%")
   - Size breakdown (e.g., "1800MB of 3000MB")
   - Message counts
   - Date range coverage
   - Last sync date
4. Click **"Index More History →"** button
5. Verify modal opens:
   - Current status bar
   - Target slider (starts at current % + 20%)
   - Real-time estimates (time, cost, messages)
6. Adjust slider and verify estimates update
7. Click **"Index to X%"** button
8. Verify indexing starts

**E2E Test:** `e2e/onboarding.spec.ts` → "Settings - Index More History"

---

## Running E2E Tests

### Run All Onboarding Tests

```bash
npm test -- onboarding.spec.ts
```

### Run Specific Test Suite

```bash
# Choice screen tests only
npm test -- onboarding.spec.ts -g "Choice Screen"

# Quick Start tests only
npm test -- onboarding.spec.ts -g "Quick Start"

# Settings tests only
npm test -- onboarding.spec.ts -g "Settings"
```

### Run in UI Mode (Interactive)

```bash
npm run test:ui
```

Then select `onboarding.spec.ts` from the test list.

### Run in Headed Mode (Watch Browser)

```bash
npm run test:headed -- onboarding.spec.ts
```

---

## Observability & Debugging

### Enhanced Logger

The logger now provides structured logging with context:

```typescript
import { logger } from '@/lib/logger';

// Standard logging
logger.log("User started onboarding", {
  component: "OnboardingChoice",
  action: "start_onboarding",
  userId: "user123"
});

// Error logging (always logged, tracked)
logger.error("Failed to fetch metrics", error, {
  component: "OnboardingChoice",
  action: "fetch_metrics",
  phase: "onboarding",
  recoverable: true
});

// Performance metrics
logger.performance({
  operation: "theme_generation",
  duration: 1250,
  unit: "ms",
  metadata: {
    conversations: 60,
    themes: 12
  }
});
```

### Error Tracking

Recent errors are tracked in memory (last 100):

```typescript
import { logger } from '@/lib/logger';

// Get recent errors
const recentErrors = logger.getRecentErrors(10);

// Clear error log (for testing)
logger.clearErrors();
```

### Request ID Correlation

Each request gets a unique ID for tracing:

```typescript
import { setRequestId, getRequestId } from '@/lib/logger';

// Set request ID (e.g., from middleware)
setRequestId("req_1234567890_abc123");

// Get current request ID
const requestId = getRequestId();
```

All logs include the request ID for correlation across services.

---

## Common Testing Scenarios

### Scenario 1: Test as New User

1. Reset onboarding state
2. Navigate to `/onboarding-choice`
3. Follow Quick Start or Full Setup flow
4. Verify Theme Map generates correctly

### Scenario 2: Test Partial Indexing

1. Complete Full Setup with 60% indexing
2. Navigate to Settings
3. Click "Index More History"
4. Extend to 80%
5. Verify estimates update correctly
6. Start indexing and verify it extends coverage

### Scenario 3: Test Theme Map Regeneration

1. Generate Theme Map for 14 days
2. Navigate to `/themes`
3. Click "30 days" button
4. Verify Theme Map regenerates with new date range
5. Verify cache saves correctly

---

## Troubleshooting

### Reset Button Not Visible

**Issue:** Reset button doesn't appear in Settings

**Solution:** 
- Ensure `NODE_ENV=development` in `.env.local`
- Restart dev server: `npm run dev`

### Tests Fail with "Route not found"

**Issue:** E2E tests fail because routes don't exist

**Solution:**
- Ensure dev server is running: `npm run dev`
- Check that routes are properly mocked in test files

### Reset API Returns 403

**Issue:** Reset endpoint returns "Forbidden"

**Solution:**
- This is expected in production
- Only works in development mode (`NODE_ENV=development`)

---

## Next Steps

1. **Run E2E tests:** `npm test -- onboarding.spec.ts`
2. **Test manually:** Use reset button to test flows yourself
3. **Monitor logs:** Check browser console for structured logs
4. **Extend tests:** Add more test cases as needed

---

**Last Updated:** 2026-01-23
