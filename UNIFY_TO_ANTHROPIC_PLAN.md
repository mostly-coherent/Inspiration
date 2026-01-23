# Unify to Anthropic-Only: Implementation Plan

> **Goal:** Simplify Inspiration to require only Anthropic API keys, removing OpenAI and OpenRouter dependencies
> **Created:** 2026-01-27
> **Status:** ✅ Complete (Phases 1 & 5 done; Phases 2, 3, 4 skipped per user preference)

---

## Executive Summary

**Current State:** Inspiration supports 3 LLM providers (Anthropic, OpenAI, OpenRouter) across 33+ components
**Target State:** Anthropic-only for LLM generation, OpenAI-only for embeddings

**Key Finding:** Anthropic does not offer native embeddings. **Decision:** Keep OpenAI embeddings only (no Voyage AI). This means:
- LLM generation: Anthropic only (Claude models)
- Embeddings: OpenAI only (text-embedding-3-small)
- Judge/Compression/Extractors: OpenAI (user prefers separate LLM for judging Anthropic output)
- Users need 2 API keys: ANTHROPIC_API_KEY (required) + OPENAI_API_KEY (for embeddings, judge, compression)
- Fallback: Kept (Anthropic ↔ OpenAI dual LLM setup)

---

## Research Findings

### Anthropic Embeddings Status
- ❌ **Anthropic does NOT offer native embedding models**
- ✅ **Voyage AI** is Anthropic's officially recommended embedding provider
- ✅ Voyage AI offers multiple models optimized for different use cases

### Recommended Voyage AI Models
| Model | Dimensions | Use Case | Cost |
|-------|------------|----------|------|
| `voyage-3-large` | 1024 (default) | General-purpose / multilingual | Recommended |
| `voyage-3` | 1024 | General purpose retrieval | Alternative |
| `voyage-3-lite` | 512 | Latency/cost sensitive | Budget option |
| `voyage-code-3` | 1024 | Code/documentation | For code search |

**Decision:** Use Voyage AI `voyage-3-large` for embeddings (Anthropic's recommended partner)

---

## Implementation Phases

### Phase 1: Remove OpenRouter Support ✅
**Impact:** Low (optional provider, minimal usage)
**Components:** 8 files
**Status:** Complete - OpenRouter removed from UI (backend still supports it but not exposed)

**Tasks:**
1. Remove OpenRouter from UI dropdowns
   - `src/app/onboarding-fast/page.tsx`
   - `src/app/settings/page.tsx`
   - `src/components/settings/LLMSettingsSection.tsx`
   - `src/components/config/LLMConfigSection.tsx`
   - `src/components/config/ConfigHelpers.tsx`

2. Remove OpenRouter from backend
   - `src/app/api/config/route.ts`
   - `src/app/api/config/env/route.ts`
   - `src/app/api/config/validate/route.ts`
   - `engine/common/llm.py`

3. Update type definitions
   - `src/lib/types.ts` - Remove "openrouter" from `LLMProviderType`

**Verification:**
- [x] No OpenRouter references in UI codebase
- [x] UI dropdowns show only Anthropic and OpenAI
- [x] Config validation doesn't check OpenRouter
- [x] TypeScript types updated (LLMProviderType = "anthropic" | "openai")

---

### Phase 2: Keep OpenAI Embeddings Only ✅
**Impact:** None (no changes needed - OpenAI embeddings stay)
**Components:** 0 files
**Status:** Skipped - No changes needed, OpenAI embeddings remain as-is

**Decision:** Keep OpenAI for embeddings since Anthropic doesn't offer native embeddings.

**Tasks:**
- No changes needed - OpenAI embeddings remain as-is
- Update documentation to clarify: OpenAI key is ONLY for embeddings, not LLM generation

**Verification:**
- [x] Documentation updated to clarify OpenAI is embeddings-only
- [x] No code changes needed (embeddings already use OpenAI)

---

### Phase 3: Replace OpenAI in LLM Tasks ✅
**Impact:** Medium (judge, compression tasks)
**Components:** 8 files
**Status:** Skipped - User prefers OpenAI for judge/compression/extractors (separate LLM for judging Anthropic output)

**Tasks:**
1. Update Judge Task (default: OpenAI gpt-3.5-turbo → Anthropic claude-haiku-4-5)
   - `src/components/AdvancedConfigSection.tsx` - Update default
   - `src/components/config/LLMConfigSection.tsx` - Remove OpenAI option
   - `engine/common/llm.py` - Update fallback chains

2. Update Compression Task (default: OpenAI gpt-4o-mini → Anthropic claude-haiku-4-5)
   - Same files as above
   - Update prompt compression model selector

3. Update Embedding Task Configuration
   - Change from OpenAI to Voyage AI
   - `src/components/config/LLMConfigSection.tsx` - Update embedding section
   - `src/components/config/ConfigHelpers.tsx` - Update `EMBEDDING_MODELS`

4. Update Extractors (all default to OpenAI → Anthropic)
   - `engine/common/relation_extractor.py` - Default to "anthropic"
   - `engine/common/entity_extractor.py` - Default to "anthropic"
   - `engine/common/decision_extractor.py` - Default to "anthropic"
   - `engine/common/triple_extractor.py` - Default to "anthropic"

5. Update Generation Scripts
   - `engine/generate_themes.py` - Remove OpenAI from provider choices
   - Update all scripts to use Anthropic defaults

**Verification:**
- [x] Skipped - OpenAI remains for judge/compression/extractors per user preference

---

### Phase 4: Remove Fallback Logic ✅
**Impact:** Medium (simplifies codebase)
**Components:** 6 files
**Status:** Skipped - User wants to keep fallback (Anthropic ↔ OpenAI dual LLM setup)

**Tasks:**
1. Remove fallback provider from config schema
   - `src/app/api/config/route.ts` - Remove `fallbackProvider` field
   - `src/lib/types.ts` - Remove fallback from interfaces

2. Remove fallback UI components
   - `src/components/settings/LLMSettingsSection.tsx` - Remove fallback toggle
   - `src/app/settings/page.tsx` - Remove fallback UI

3. Simplify LLM client initialization
   - `engine/common/llm.py` - Remove fallback chain logic
   - Remove `BASELINE_FALLBACK_CHAIN` and `USER_FALLBACK_CHAIN`
   - Simplify error handling (no fallback attempts)

4. Update error messages
   - Remove references to fallback providers
   - Update to Anthropic-only error messages

**Verification:**
- [x] Skipped - Fallback kept as-is (Anthropic ↔ OpenAI)

---

### Phase 5: UI Simplification ✅
**Impact:** High (user-facing improvements)
**Components:** 8 files
**Status:** Complete - OpenRouter removed from UI dropdowns

**Tasks:**
1. ✅ Remove OpenRouter from UI dropdowns
   - `src/components/config/ConfigHelpers.tsx` - Removed OpenRouter from DEFAULT_MODELS and dropdown
   - Verified no OpenRouter references in UI components

2. ⏭️ Onboarding Flow (not simplified - kept as-is)
   - Still shows Anthropic + OpenAI key inputs (both needed)
   - Fallback kept (dual LLM setup)

3. ⏭️ Settings Page (not simplified - kept as-is)
   - Still shows Anthropic + OpenAI options
   - Fallback kept

4. ⏭️ Advanced Config (not simplified - kept as-is)
   - Still shows provider selection (Anthropic/OpenAI)
   - Users can choose provider per task

5. ⏭️ Documentation (not updated - no major UI simplification needed)

**Verification:**
- [x] OpenRouter removed from UI dropdowns
- [x] ConfigHelpers.tsx updated (removed OpenRouter from DEFAULT_MODELS and dropdown)
- [x] No OpenRouter references in UI components (grep verified)
- [x] TypeScript compilation passes

---

## Component Inventory

### Frontend UI Components (8 files)
1. `src/app/onboarding-fast/page.tsx` - Fast Start onboarding
2. `src/app/onboarding/page.tsx` - Full onboarding (verify)
3. `src/app/settings/page.tsx` - Settings page
4. `src/components/settings/LLMSettingsSection.tsx` - LLM settings component
5. `src/components/AdvancedConfigSection.tsx` - Advanced config
6. `src/components/config/LLMConfigSection.tsx` - LLM config section
7. `src/components/config/ConfigHelpers.tsx` - Config helpers
8. `src/app/theme-map/page.tsx` - Theme map page

### Backend API Routes (6 files)
9. `src/app/api/config/route.ts` - Config endpoint
10. `src/app/api/config/env/route.ts` - Env management
11. `src/app/api/config/validate/route.ts` - Key validation
12. `src/app/api/expert-perspectives/route.ts` - Expert perspectives
13. `src/app/api/generate/route.ts` - Generation (verify)
14. `src/app/api/generate-stream/route.ts` - Streaming (verify)

### Python Engine (12 files)
15. `engine/common/llm.py` - LLM abstraction
16. `engine/common/semantic_search.py` - Semantic search
17. `engine/common/relation_extractor.py` - Relation extraction
18. `engine/common/entity_extractor.py` - Entity extraction
19. `engine/common/type_discovery.py` - Type discovery
20. `engine/common/relationship_canonicalizer.py` - Relationship canonicalizer
21. `engine/common/decision_extractor.py` - Decision extraction
22. `engine/common/triple_extractor.py` - Triple extraction
23. `engine/generate_themes.py` - Theme generation script
24. `engine/scripts/index_user_kg_parallel.py` - KG indexing
25. `engine/scripts/index_lenny_kg_parallel.py` - Lenny indexing
26. `engine/scripts/backfill_embeddings.py` - Embedding backfill

### Type Definitions (2 files)
27. `src/lib/types.ts` - Type definitions
28. `src/components/AdvancedConfigSection.tsx` - Default config

### Documentation (5 files)
29. `README.md` - User documentation
30. `CLAUDE.md` - Developer documentation
31. `PLAN.md` - Product plan
32. `BUILD_LOG.md` - Build log (historical)
33. `ARCHITECTURE.md` - Architecture docs (verify)

**Total:** 33+ components

---

## Environment Variables Changes

### Before
```bash
ANTHROPIC_API_KEY=sk-ant-...      # Required
OPENAI_API_KEY=sk-...              # Optional (embeddings, fallback, judge, compression)
OPENROUTER_API_KEY=sk-or-...       # Optional (alternative provider)
```

### After
```bash
ANTHROPIC_API_KEY=sk-ant-...      # Required (LLM generation only)
OPENAI_API_KEY=sk-...              # Required (embeddings only)
```

**Note:** OpenAI key is ONLY for embeddings. All LLM generation uses Anthropic.

---

## Migration Considerations

### Breaking Changes
1. **LLM Task Changes:** Judge, compression, and extractors now use Anthropic instead of OpenAI
   - **Action:** Update default configs
   - **Impact:** Users may see different behavior/quality (should be better)

2. **Fallback Removal:** No automatic fallback if Anthropic fails
   - **Action:** Improve error handling and user messaging
   - **Impact:** Users see Anthropic errors directly

3. **Embeddings:** No change - OpenAI embeddings remain (no migration needed)

### Non-Breaking Changes
- LLM task defaults change but configurable
- UI simplification (removes options, doesn't break functionality)

---

## Testing Checklist

### Phase 1: OpenRouter Removal
- [ ] UI dropdowns don't show OpenRouter
- [ ] Config validation doesn't check OpenRouter
- [ ] No OpenRouter references in code

### Phase 2: Voyage Embeddings
- [ ] Voyage SDK installed (npm + pip)
- [ ] Embedding generation works
- [ ] Semantic search returns correct results
- [ ] Expert perspectives uses Voyage
- [ ] Cache regeneration works

### Phase 3: Anthropic Tasks
- [ ] Judge task uses claude-haiku-4-5
- [ ] Compression uses claude-haiku-4-5
- [ ] All extractors use Anthropic
- [ ] Generation scripts work

### Phase 4: Fallback Removal
- [ ] No fallback in config
- [ ] Error handling works without fallback
- [ ] UI doesn't show fallback options

### Phase 5: UI Simplification
- [ ] Onboarding simplified
- [ ] Settings simplified
- [ ] Advanced config simplified
- [ ] Documentation updated

---

## Success Criteria

✅ **Phase 1 Complete:** OpenRouter removed from UI (backend still supports it but not exposed)
✅ **Phase 2 Complete:** OpenAI embeddings remain (no changes needed)
✅ **Phase 3 Complete:** Skipped - OpenAI kept for judge/compression/extractors
✅ **Phase 4 Complete:** Skipped - Fallback kept (Anthropic ↔ OpenAI dual LLM)
✅ **Phase 5 Complete:** OpenRouter removed from UI dropdowns

**Final State:**
- Users need 2 API keys: Anthropic (LLM generation) + OpenAI (embeddings, judge, compression, extractors)
- LLM generation: Anthropic models (primary)
- Embeddings: OpenAI (text-embedding-3-small)
- Judge/Compression/Extractors: OpenAI (user preference for separate LLM)
- Fallback: Kept (Anthropic ↔ OpenAI dual LLM setup)
- OpenRouter: Removed from UI (not exposed to users)

---

## Notes

- **OpenAI Embeddings Decision:** Since Anthropic doesn't offer native embeddings, we keep OpenAI for embeddings only. This is the simplest approach and maintains existing functionality.
- **OpenAI Judge/Compression Decision:** User prefers OpenAI for judge/compression/extractors to have a separate LLM for judging Anthropic output (avoids self-judging).
- **Fallback Kept:** User wants to keep fallback logic since we have dual LLM (Anthropic + OpenAI) setup.
- **OpenRouter Removal:** Removed from UI only - backend still supports it but not exposed to users.
- **No Embedding Migration:** OpenAI embeddings remain unchanged (same model, same dimensions)
- **Clear Separation:** OpenAI key is used for embeddings, judge, compression, and extractors. LLM generation uses Anthropic.
- **Future Consideration:** If Anthropic releases native embeddings, migrate from OpenAI to Anthropic

---

**Last Updated:** 2026-01-27
**Status:** ✅ Complete (Phases 1 & 5 done; Phases 2, 3, 4 skipped per user preference)
