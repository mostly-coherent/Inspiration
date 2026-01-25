# Onboarding Workflow Audit Guide

**Purpose:** Comprehensive guide for auditing and testing Inspiration's onboarding flows  
**Last Updated:** 2026-01-24

---

## 🎯 Quick Start Methods

### Method 1: Preview Mode (Fastest - No Reset Needed)
**Best for:** Quick visual checks, UI testing, flow verification

```bash
# Navigate directly to onboarding flows with preview mode
http://localhost:3000/onboarding-fast?preview=true
http://localhost:3000/onboarding-choice?preview=true  # (if you mock >500MB)
http://localhost:3000/onboarding?preview=true
```

**What Preview Mode Does:**
- ✅ Simulates DB detection (150MB, 450 conversations)
- ✅ Simulates cost estimates
- ✅ Simulates theme map generation
- ✅ **No data is saved** (config, theme maps, etc.)
- ✅ Skips API key validation
- ✅ Fast iteration (no real API calls)

**Limitations:**
- Doesn't test real API integrations
- Doesn't test actual DB detection
- Doesn't verify config persistence

---

### Method 2: Reset Onboarding Button (Full Reset)
**Best for:** Testing complete flows with real data

**Steps:**
1. Navigate to Settings → Advanced → Testing & Development
2. Click "Reset Onboarding State" button
3. Confirm reset
4. Navigate to `/` or `/onboarding-fast`
5. Test the flow

**What Gets Reset:**
- ✅ Theme map cache (Supabase + local files)
- ✅ `setupComplete` flag → `false`
- ✅ `fastStartComplete` flag → `false`
- ✅ Config tracking reset

**What Doesn't Get Reset:**
- ❌ Vector DB data (messages remain indexed)
- ❌ Library items (ideas/insights remain)
- ❌ API keys in `.env.local` (still configured)
- ❌ Environment variables

**Note:** If you have API keys in `.env.local`, you'll skip the API key step. To test that step, temporarily rename `.env.local` to `.env.local.backup`.

---

### Method 3: API Reset (Programmatic)
**Best for:** Automated testing, CI/CD, scripted audits

```bash
# Reset onboarding state via API
curl -X POST http://localhost:3000/api/test/reset-onboarding

# Or use fetch in browser console
fetch('/api/test/reset-onboarding', { method: 'POST' })
  .then(r => r.json())
  .then(console.log);
```

**Response:**
```json
{
  "success": true,
  "message": "Onboarding state reset",
  "details": [
    "✅ Cleared theme map cache from Supabase",
    "✅ Reset Supabase config flags",
    "✅ Deleted 2 theme map cache files",
    "✅ Reset local config.json flags"
  ],
  "note": "Vector DB data was NOT deleted. Only cache and tracking were cleared."
}
```

---

### Method 4: Manual Config Reset (Full Control)
**Best for:** Testing specific states, debugging config issues

**Steps:**
1. Edit `data/config.json`:
   ```json
   {
     "setupComplete": false,
     "fastStartComplete": false,
     ...
   }
   ```
2. If using Supabase, update `app_config` table:
   ```sql
   UPDATE app_config 
   SET value = jsonb_set(value, '{setupComplete}', 'false')
   WHERE key = 'user_config';
   ```
3. Clear theme map cache:
   ```bash
   rm -rf data/theme_maps/*.json
   rm -f data/theme_map.json  # Legacy file
   ```
4. Restart dev server (if needed)

---

## 🧪 Automated Testing (Playwright E2E)

### Run All Onboarding Tests

```bash
# Run all onboarding-related tests
npm test

# Run only Fast Start tests
npx playwright test e2e/fast-start.spec.ts

# Run only Full Onboarding tests
npx playwright test e2e/onboarding.spec.ts

# Run with UI (interactive)
npm run test:ui

# Run in headed mode (watch browser)
npm run test:headed
```

### Test Coverage

**Fast Start Tests** (`e2e/fast-start.spec.ts`):
- ✅ Page loads and shows welcome screen
- ✅ Preview mode shows simulated data
- ✅ Time window selection (1/2/4/6 weeks)
- ✅ Cost estimate display and breakdown
- ✅ API key step navigation
- ✅ Theme map generation (preview)
- ✅ Results display (themes, counter-intuitive, unexplored)
- ✅ Progress indicator updates
- ✅ Back navigation

**Full Onboarding Tests** (`e2e/onboarding.spec.ts`):
- ✅ Choice screen for >500MB users
- ✅ Quick Start navigation
- ✅ Full Setup navigation
- ✅ Indexing scope slider
- ✅ Cost/time estimates
- ✅ Settings "Index More History"

---

## 📋 Manual Audit Checklist

### Scenario 1: New User with <500MB History

**Setup:**
1. Reset onboarding state (Method 2 or 3)
2. Ensure `.env.local` has no API keys (or rename it)
3. Navigate to `/`

**Expected Flow:**
```
/ → /onboarding-fast (auto-redirect)
  ↓
Welcome Screen
  - Shows DB detection
  - Shows time window selector (1/2/4/6 weeks)
  - Shows cost estimate
  ↓
API Key Screen
  - Shows Anthropic API Key input
  - Optional OpenAI key for Lenny's Podcast
  ↓
Generate Theme Map
  - Shows generating progress
  - Displays theme map results
  - Shows "Start Using Inspiration" button
  ↓
/ (Home page - should NOT redirect)
```

**Checklist:**
- [ ] Home page redirects to `/onboarding-fast` when not set up
- [ ] DB detection shows correct size
- [ ] Time window selector works (1/2/4/6 weeks)
- [ ] Cost estimate appears and updates when days change
- [ ] Cost breakdown expands/collapses
- [ ] API key validation works (shows ✅/❌)
- [ ] Can proceed with valid API key
- [ ] Theme map generation shows progress
- [ ] Theme map results display correctly
- [ ] "Start Using Inspiration" button works
- [ ] After completion, visiting `/` does NOT redirect
- [ ] Config flags are set correctly (`setupComplete: true`)

---

### Scenario 2: New User with >500MB History

**Setup:**
1. Reset onboarding state
2. Mock API response to return >500MB (or use real large DB)
3. Navigate to `/onboarding-fast`

**Expected Flow:**
```
/onboarding-fast
  ↓
Detects >500MB → Redirects to /onboarding-choice
  ↓
Choice Screen
  - Shows Quick Start option (~90 seconds)
  - Shows Full Setup option (15 min + indexing)
  ↓
[User chooses Quick Start]
  ↓
/onboarding-fast?mode=partial
  - Shows "Quick Start Mode" banner
  - Analyzes only recent 500MB
  ↓
[User chooses Full Setup]
  ↓
/onboarding
  - Welcome → API Keys → Indexing Scope → Sync
```

**Checklist:**
- [ ] Detects large history (>500MB)
- [ ] Redirects to `/onboarding-choice` (not `/onboarding`)
- [ ] Choice screen shows both options
- [ ] Quick Start button navigates to `/onboarding-fast?mode=partial`
- [ ] Partial mode shows banner about 500MB limit
- [ ] Full Setup button navigates to `/onboarding`
- [ ] Full Setup shows indexing scope slider
- [ ] Slider shows real-time estimates

---

### Scenario 3: Existing User (Has Setup Complete)

**Setup:**
1. Complete onboarding (any method)
2. Navigate to `/`

**Expected Flow:**
```
/ → Shows app (no redirect)
```

**Checklist:**
- [ ] Home page loads normally (no redirect)
- [ ] Can access all features
- [ ] Visiting `/onboarding-fast` shows existing user state (if implemented)
- [ ] Visiting `/onboarding` redirects to `/` (if `setupComplete: true`)

---

### Scenario 4: Fast Start Complete, Full Setup Not Done

**Setup:**
1. Complete Fast Start only
2. Verify `fastStartComplete: true`, `setupComplete: true` (after our fix)
3. Navigate to `/`

**Expected Flow:**
```
/ → Shows app (no redirect)
```

**Checklist:**
- [ ] Home page recognizes Fast Start completion
- [ ] No redirect loop
- [ ] Can access app features
- [ ] Can still access Full Setup if desired

---

### Scenario 5: Error Scenarios

**Test Each Error Case:**

1. **API Key Invalid:**
   - [ ] Shows error message with emoji (🔑)
   - [ ] Provides actionable guidance
   - [ ] Can retry after fixing

2. **DB Detection Fails:**
   - [ ] Shows Python version error (if applicable)
   - [ ] Shows "Cursor database not found" message
   - [ ] Provides installation instructions

3. **Theme Generation Fails:**
   - [ ] Shows user-friendly error message
   - [ ] Categorizes error (API key, rate limit, timeout, etc.)
   - [ ] Provides retry button
   - [ ] Does NOT retry infinitely

4. **Choice Screen API Fails:**
   - [ ] Shows error message
   - [ ] Shows retry button
   - [ ] Handles gracefully

5. **Config Save Fails:**
   - [ ] Shows warning message
   - [ ] Verifies config was saved
   - [ ] Provides retry option

---

## 🔍 Specific Bug Checks (From Audit)

### Bug #1: Redirect Loop (CRITICAL) ✅ FIXED
**Test:**
1. Complete Fast Start
2. Navigate to `/`
3. **Expected:** Should show app, NOT redirect to `/onboarding-fast`

**How to Verify:**
- Check browser console for redirects
- Check network tab for multiple `/api/config` calls
- Verify `setupComplete` or `fastStartComplete` is `true` in config

### Bug #11: Partial Mode Redirect Loop (CRITICAL) ✅ FIXED
**Test:**
1. User has >500MB history → redirected to `/onboarding-choice`
2. Click "Start Quick Analysis" → navigates to `/onboarding-fast?mode=partial`
3. **Expected:** Should stay on `/onboarding-fast?mode=partial`, NOT redirect back to `/onboarding-choice`

**How to Verify:**
- Navigate to `/onboarding-choice` (mock >500MB)
- Click "Start Quick Analysis"
- Verify URL stays as `/onboarding-fast?mode=partial`
- Verify "Quick Start Mode" banner appears
- Verify no redirect loop occurs

---

### Bug #2: Race Condition
**Test:**
1. Navigate to `/`
2. Quickly navigate to `/settings` before setup check completes
3. **Expected:** Should NOT redirect after navigating away

**How to Verify:**
- Check browser console for redirect attempts
- Verify pathname checks happen before async operations

---

### Bug #3: Auto-Generation Loop
**Test:**
1. Navigate to `/onboarding-fast?preview=true`
2. Go to generate step
3. Mock API to return error
4. **Expected:** Should NOT retry generation automatically

**How to Verify:**
- Check network tab for multiple `/api/generate-themes` calls
- Verify error message appears
- Verify no infinite retry loop

---

### Bug #4: Choice Screen Error Handling
**Test:**
1. Navigate to `/onboarding-choice`
2. Mock `/api/generate-themes` to return error
3. **Expected:** Should show error message with retry button

**How to Verify:**
- Error message appears
- Retry button works
- Metrics don't show "0MB" forever

---

## 🛠️ Testing Tools & Helpers

### Browser DevTools

**Console Commands:**
```javascript
// Check current config state
fetch('/api/config').then(r => r.json()).then(console.log);

// Check environment variables (doesn't return values, just status)
fetch('/api/config/env').then(r => r.json()).then(console.log);

// Reset onboarding
fetch('/api/test/reset-onboarding', { method: 'POST' })
  .then(r => r.json())
  .then(console.log);

// Check theme map cache
fetch('/api/theme-map').then(r => r.json()).then(console.log);
```

**Network Tab:**
- Monitor `/api/config` calls (should not loop)
- Monitor `/api/generate-themes` calls (should not retry infinitely)
- Check redirects (should be intentional, not loops)

**Application Tab:**
- Check localStorage (if any onboarding state stored)
- Check sessionStorage (if any)

---

### Mock API Responses (For Testing)

**Mock Large History (>500MB):**
```javascript
// In browser console or Playwright
await page.route('**/api/generate-themes', async (route) => {
  if (route.request().method() === 'GET') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        metrics: {
          size_mb: 3000,
          estimated_conversations_total: 750000,
          recent_500mb: {
            estimated_days: 90,
            coverage: 'Recent 3 months'
          }
        }
      }),
    });
  } else {
    await route.continue();
  }
});
```

**Mock Small History (<500MB):**
```javascript
await page.route('**/api/generate-themes', async (route) => {
  if (route.request().method() === 'GET') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        metrics: {
          size_mb: 150,
          estimated_conversations_total: 450,
          suggested_days: 14
        }
      }),
    });
  } else {
    await route.continue();
  }
});
```

**Mock API Key Missing:**
```javascript
// Temporarily rename .env.local
mv .env.local .env.local.backup

// Or mock the API response
await page.route('**/api/config/env', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      configured: {
        anthropic: false,
        openai: false,
        supabase: false
      },
      allRequired: false
    }),
  });
});
```

---

## 📊 Test Scenarios Matrix

| Scenario | DB Size | API Keys | Expected Flow | Test Method |
|----------|---------|----------|---------------|-------------|
| **New User (Small)** | <500MB | None | Fast Start → Theme Map | Preview Mode or Reset |
| **New User (Large)** | >500MB | None | Choice → Quick Start OR Full Setup | Mock API or Real DB |
| **Existing User** | Any | Configured | Home page (no redirect) | Complete onboarding |
| **Fast Start Only** | <500MB | Anthropic | Fast Start → Complete | Reset + Complete Fast Start |
| **Partial Mode** | >500MB | Anthropic | Choice → Quick Start (500MB) | Mock >500MB + `?mode=partial` |
| **Full Setup** | >500MB | All | Choice → Full Setup → Index → Complete | Mock >500MB + Complete Full Setup |
| **Error: Invalid Key** | Any | Invalid | Shows error, can retry | Enter invalid key |
| **Error: DB Not Found** | N/A | Any | Shows Python/DB error | No Cursor installed |
| **Error: Generation Fails** | Any | Valid | Shows error, no infinite retry | Mock API error |

---

## 🎬 Step-by-Step Audit Workflow

### Complete End-to-End Audit

**1. Reset State**
```bash
# Option A: Use Settings UI
# Navigate to Settings → Advanced → Reset Onboarding State

# Option B: Use API
curl -X POST http://localhost:3000/api/test/reset-onboarding

# Option C: Manual (if needed)
# Edit data/config.json, clear theme maps, etc.
```

**2. Test Small History Flow (<500MB)**
```bash
# Navigate to preview mode (fastest)
http://localhost:3000/onboarding-fast?preview=true

# Or use real data (after reset)
http://localhost:3000/
```

**3. Test Large History Flow (>500MB)**
```bash
# Mock API response for >500MB
# Or use real large DB
http://localhost:3000/onboarding-fast
# Should redirect to /onboarding-choice
```

**4. Test Error Scenarios**
- Invalid API key
- Missing API key
- DB detection failure
- Theme generation failure
- Config save failure

**5. Test Edge Cases**
- Navigate away during detection
- Navigate away during generation
- Refresh during onboarding
- Browser back/forward buttons
- Multiple tabs open

**6. Verify Fixes**
- ✅ No redirect loops
- ✅ No infinite retry loops
- ✅ Error messages are user-friendly
- ✅ Config verification works
- ✅ Race conditions handled

---

## 🐛 Debugging Tips

### If Redirect Loop Occurs

1. **Check Config State:**
   ```javascript
   fetch('/api/config').then(r => r.json()).then(d => console.log(d.config.setupComplete, d.config.fastStartComplete));
   ```

2. **Check Home Page Logic:**
   - Open `src/app/page.tsx`
   - Check line 134: Should check `fastStartComplete || setupComplete`
   - Verify pathname checks happen before redirects

3. **Check Browser Console:**
   - Look for multiple redirects
   - Check network tab for repeated `/api/config` calls

### If Generation Retries Infinitely

1. **Check Auto-Generation Effect:**
   - Open `src/app/onboarding-fast/page.tsx`
   - Check line 847-860: Should have `hasAttemptedGeneration` ref
   - Verify it only runs once per step

2. **Check Error Handling:**
   - Verify error state prevents retry
   - Check that `generating` flag is set correctly

### If Choice Screen Shows "0MB"

1. **Check API Response:**
   ```javascript
   fetch('/api/generate-themes').then(r => r.json()).then(console.log);
   ```

2. **Check Error Handling:**
   - Open `src/app/onboarding-choice/page.tsx`
   - Verify try/catch shows error message
   - Check retry button works

---

## 📝 Audit Report Template

After completing audit, document findings:

```markdown
# Onboarding Audit Report - [Date]

## Test Environment
- Node version: [version]
- Python version: [version]
- DB size: [size]
- API keys configured: [yes/no]

## Scenarios Tested
- [ ] New user <500MB (Fast Start)
- [ ] New user >500MB (Choice Screen)
- [ ] Quick Start flow
- [ ] Full Setup flow
- [ ] Error scenarios
- [ ] Edge cases

## Issues Found
1. [Issue description]
   - Steps to reproduce
   - Expected vs actual
   - Screenshot/logs

## Fixes Verified
- [ ] Bug #1: Redirect loop - FIXED
- [ ] Bug #2: Race condition - FIXED
- [ ] Bug #3: Infinite retry - FIXED
- [ ] Bug #4: Error handling - FIXED

## Recommendations
- [Any improvements or follow-ups]
```

---

## 🚀 Quick Reference

### URLs for Testing

| Flow | URL | Preview Mode |
|------|-----|--------------|
| **Fast Start** | `/onboarding-fast` | `?preview=true` |
| **Choice Screen** | `/onboarding-choice` | (Mock >500MB) |
| **Full Setup** | `/onboarding` | `?preview=true` |
| **Home** | `/` | N/A |
| **Settings** | `/settings` | N/A |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/config` | GET | Check setup status |
| `/api/config/env` | GET | Check API keys configured |
| `/api/generate-themes` | GET | Get DB metrics |
| `/api/generate-themes` | POST | Generate theme map |
| `/api/test/reset-onboarding` | POST | Reset onboarding state |
| `/api/config` | POST | Save config |

### Key Config Flags

| Flag | Purpose | Set When |
|------|---------|----------|
| `setupComplete` | Full setup done | After Full Setup sync |
| `fastStartComplete` | Fast Start done | After Fast Start theme map |

**Note:** After our fixes, Fast Start also sets `setupComplete: true` to prevent redirect loops.

---

## ✅ Success Criteria

After audit, onboarding workflow should:

- ✅ **No redirect loops** - Users don't get stuck bouncing between pages
- ✅ **No infinite retries** - Failed operations don't retry forever
- ✅ **Clear error messages** - Users understand what went wrong and how to fix it
- ✅ **Proper state management** - Config flags are set correctly and verified
- ✅ **Race condition handling** - Navigation doesn't cause stale redirects
- ✅ **Graceful degradation** - Errors don't crash the app
- ✅ **User-friendly feedback** - Loading states, progress messages, helpful guidance

---

**Need Help?** Check `ONBOARDING_AUDIT.md` for detailed bug descriptions and fixes.
