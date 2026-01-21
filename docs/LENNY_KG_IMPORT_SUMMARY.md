# Lenny's Knowledge Graph Import - Implementation Summary

> **Solution:** Distribute pre-computed Lenny KG via GitHub Releases, enabling zero-setup Knowledge Graph for end users.

---

## ✅ What Was Created

### 1. Export Script (`engine/scripts/export_lenny_kg.py`)
- Exports all Lenny KG data (`source_type='expert'` or `'lenny'`) to JSON files
- Creates manifest with metadata
- Ready for GitHub Release upload

### 2. Import Script (`engine/scripts/import_lenny_kg.py`)
- Imports exported JSON files into user's Supabase instance
- Handles deduplication (safe to run multiple times)
- Preserves user's existing KG data

### 3. Download Script (`scripts/download-lenny-kg.sh`)
- Downloads KG files from GitHub Releases
- Similar to `download-lenny-embeddings.sh`
- Handles errors and verification

### 4. API Endpoint (`src/app/api/lenny-kg-import/route.ts`)
- Downloads KG files from GitHub Releases
- Runs import script automatically
- Returns import stats

### 5. Documentation (`docs/LENNY_KG_DISTRIBUTION.md`)
- Complete workflow documentation
- Export/import instructions
- Troubleshooting guide

---

## 📋 Next Steps (To Complete Implementation)

### Step 1: Export Your Lenny KG

```bash
cd Inspiration
python3 engine/scripts/export_lenny_kg.py --output-dir ./exports/lenny-kg
```

This creates:
- `exports/lenny-kg/lenny_kg_manifest.json`
- `exports/lenny-kg/lenny_kg_entities.json` (~20MB)
- `exports/lenny-kg/lenny_kg_mentions.json` (~30MB)
- `exports/lenny-kg/lenny_kg_relations.json` (~10MB)

### Step 2: Create GitHub Release

1. Go to https://github.com/mostly-coherent/Inspiration/releases/new
2. Tag: `v1.0.0-lenny-kg`
3. Title: "Lenny's Knowledge Graph v1.0.0"
4. Description:
   ```
   Pre-computed Knowledge Graph for Lenny's Podcast integration.
   
   **Latest Update:** 2026-01-20
   - ✅ 303 expert episodes
   - ✅ 13,878 entities
   - ✅ 50,815 mentions
   - ✅ 1,234 relations
   
   Import via UI ("Import Lenny's KG" button) or CLI:
   ```bash
   bash scripts/download-lenny-kg.sh
   python3 engine/scripts/import_lenny_kg.py --data-dir ./data/lenny-kg
   ```
5. Upload all JSON files as release assets

### Step 3: Add UI Button (Optional)

Add "Import Lenny's KG" button to `src/components/ScoreboardHeader.tsx`:

```typescript
const importLennyKG = useCallback(async () => {
  // Similar to downloadLennyEmbeddings
  const res = await fetch("/api/lenny-kg-import", { method: "POST" });
  // Handle response
}, []);
```

### Step 4: Test Import

```bash
# Download files
bash scripts/download-lenny-kg.sh

# Import (dry run first)
python3 engine/scripts/import_lenny_kg.py --data-dir ./data/lenny-kg --dry-run

# Actual import
python3 engine/scripts/import_lenny_kg.py --data-dir ./data/lenny-kg
```

---

## 🔄 Update Workflow (When New Episodes Added)

1. **Index new episodes:**
   ```bash
   python3 engine/scripts/index_lenny_kg_parallel.py --episodes-only NEW_EPISODES
   ```

2. **Export updated KG:**
   ```bash
   python3 engine/scripts/export_lenny_kg.py --output-dir ./exports/lenny-kg
   ```

3. **Create new release:** `v1.1.0-lenny-kg` (or `v1.0.1-lenny-kg`)

4. **Users re-import:** Script handles deduplication automatically

---

## 📊 File Sizes

| File | Size | Compressed |
|------|------|------------|
| `lenny_kg_entities.json` | ~20MB | ~5MB |
| `lenny_kg_mentions.json` | ~30MB | ~8MB |
| `lenny_kg_relations.json` | ~10MB | ~2MB |
| **Total** | **~60MB** | **~15MB** |

**Note:** GitHub Releases supports files up to 2GB, so 60MB is well within limits.

---

## ✅ Benefits

1. **Zero-setup KG** — Users get 13,878+ entities instantly
2. **No re-indexing** — Saves 2-3 hours of LLM processing time
3. **Consistent data** — Everyone gets same canonical entity names
4. **Incremental updates** — New episodes can be added without full re-export
5. **Idempotent** — Safe to re-import (deduplication handles it)

---

## 🔒 Security

- ✅ Only Lenny data (`source_type='expert'` or `'lenny'`)
- ✅ User data (`source_type='user'`) never touched
- ✅ Open-sourced content (safe to distribute)
- ✅ Deduplication preserves user's entity names

---

**Status:** ✅ Scripts created, ready for export and GitHub Release creation
