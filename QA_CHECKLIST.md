# QA Checklist for Inspiration App

> **Purpose:** Mandatory checks before marking any feature "done"
> **Applies to:** All code changes, especially UI/UX changes

---

## Pre-Commit Checklist

### 1. Code Quality
- [ ] No linter errors: `npm run lint`
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] Code compiles: `npm run build`

### 2. Automated Tests
- [ ] E2E tests pass: `npm test`
- [ ] New E2E test added if new feature
- [ ] Test covers the bug if bug fix

### 3. Manual Testing (CRITICAL - Don't Skip!)
- [ ] **Actually run the app:** `npm run dev`
- [ ] **Use the feature you just built/changed**
- [ ] **Look at the UI with user eyes** - does it make sense?
- [ ] **Check the stats/numbers** - do they tell a coherent story?
- [ ] **Test edge cases:**
  - Empty state (no data)
  - Error state (API fails)
  - Success state (happy path)
  - Partial success (some data)

### 4. User Perspective
- [ ] **Labels are clear** - would a non-technical user understand them?
- [ ] **Numbers make sense together** - do the stats relate logically?
- [ ] **Error messages are helpful** - not just "failed"
- [ ] **Success feedback is clear** - what actually happened?

### 5. Data Flow Verification
- [ ] **Frontend ↔ API:** Does UI display what API returns?
- [ ] **API ↔ Python:** Does API parse Python output correctly?
- [ ] **Python ↔ Database:** Does Python save/load data correctly?
- [ ] **End-to-end:** Does data flow correctly from generation → harmonization → Library?

---

## Specific to Stats Display Changes

When changing stats display:
- [ ] Print Python script output and verify format
- [ ] Check API route parser regex patterns
- [ ] Verify TypeScript types match API response
- [ ] Look at UI and verify all stats show correctly
- [ ] Test with: no data, some data, all data
- [ ] Verify harmonization stats match generation stats

---

## Example: Testing "Generate Insights"

1. **Run the app:** `npm run dev`
2. **Click "Generate Insights"** with 7-day preset
3. **Wait for completion**
4. **Check the "Generated Insights" panel:**
   - ✅ "Conversations Analyzed" shows a number
   - ✅ "Days with Activity" shows "X of Y" format
   - ✅ "Items Generated" shows a number (or 0, not blank)
   - ✅ "Items in Output File" shows Yes/No
   - ✅ If harmonization ran, "New Items Added" makes sense
   - ✅ Numbers are coherent (e.g., if 14 items added, can't show "0 output")
5. **Check terminal output:**
   - ✅ Python script printed stats in expected format
   - ✅ No errors in API parsing
6. **Check Library:**
   - ✅ Item count increased by expected amount
   - ✅ Can view the new items

---

## When You're Tempted to Skip Testing

**DON'T.**

The time you save by skipping manual testing is **always** exceeded by:
- User finding bugs
- Debugging later
- Lost trust
- Context switching cost

If you're too tired to test properly, **stop and test tomorrow**.

---

## For AI Assistants

**Before marking TODO "Test end-to-end" as complete:**
1. Use browser MCP tools to navigate and test the UI
2. Take screenshots of before/after
3. Verify stats make sense from user perspective
4. Check that changes work in context of full app

**Red flags that mean you MUST test:**
- Changed stats display
- Modified API parsing
- Updated data flow
- Changed user-facing labels
- Refactored anything that touches multiple layers

---

**Last Updated:** 2026-01-08
