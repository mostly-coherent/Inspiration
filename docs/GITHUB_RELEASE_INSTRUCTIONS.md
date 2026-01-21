# Step-by-Step: Upload Lenny's KG to GitHub Release

> **Purpose:** Create a GitHub Release with Lenny's Knowledge Graph export files for distribution

---

## Prerequisites

✅ Export files ready in `exports/lenny-kg/`:
- `lenny_kg_entities.json` (271MB)
- `lenny_kg_mentions.json` (37MB)
- `lenny_kg_relations.json` (17MB)
- `lenny_kg_conversations.json` (8.4MB)
- `lenny_kg_manifest.json` (549B)

✅ GitHub account: `JMBeh` (mostly-coherent)
✅ Repository: `mostly-coherent/Inspiration`

---

## Method 1: GitHub Web UI (Recommended for Large Files)

### Step 1: Navigate to Releases

1. Go to: https://github.com/mostly-coherent/Inspiration
2. Click **"Releases"** (right sidebar, or go to `/releases`)
3. Click **"Create a new release"** (or "Draft a new release")

### Step 2: Create Release Tag

**Tag version:** `v1.0.0-lenny-kg`

**Release title:** `Lenny's Knowledge Graph v1.0.0`

**Description:**
```markdown
# Lenny's Knowledge Graph Export

Pre-computed Knowledge Graph from 303 Lenny's Podcast episodes.

## Contents

- **30,970 entities** (tools, patterns, concepts, people)
- **47,466 mentions** (entity references in episodes)
- **27,650 relations** (how entities connect)
- **16,791 conversations** (episode chunks/segments)

## Files

- `lenny_kg_entities.json` (271MB) - All entities
- `lenny_kg_mentions.json` (37MB) - Entity mentions
- `lenny_kg_relations.json` (17MB) - Entity relations
- `lenny_kg_conversations.json` (8.4MB) - Episode conversations
- `lenny_kg_manifest.json` (549B) - Export metadata

## Usage

See `docs/LENNY_KG_DISTRIBUTION.md` for import instructions.

**Export Date:** 2026-01-21
**Episodes:** 303
**Source:** Lenny's Podcast (open-sourced transcripts)
```

### Step 3: Upload Files

1. Scroll down to **"Attach binaries"** section
2. Drag and drop all 5 JSON files:
   - `lenny_kg_entities.json`
   - `lenny_kg_mentions.json`
   - `lenny_kg_relations.json`
   - `lenny_kg_conversations.json`
   - `lenny_kg_manifest.json`
3. Wait for uploads to complete (may take 5-10 minutes for large files)

**Note:** GitHub has a 2GB limit per file. All files are under this limit.

### Step 4: Publish Release

1. Click **"Publish release"** button
2. Wait for GitHub to process the release
3. Verify files are accessible at: https://github.com/mostly-coherent/Inspiration/releases/tag/v1.0.0-lenny-kg

---

## Method 2: GitHub CLI (Alternative)

If you prefer command-line:

### Step 1: Create Release Draft

```bash
cd "/Users/jmbeh/Personal Builder Lab/Inspiration"

gh release create v1.0.0-lenny-kg \
  --title "Lenny's Knowledge Graph v1.0.0" \
  --notes "Pre-computed Knowledge Graph from 303 Lenny's Podcast episodes.

## Contents
- 30,970 entities
- 47,466 mentions
- 27,650 relations
- 16,791 conversations

See docs/LENNY_KG_DISTRIBUTION.md for import instructions." \
  --draft
```

### Step 2: Upload Files

```bash
cd exports/lenny-kg

# Upload each file (GitHub CLI handles large files)
gh release upload v1.0.0-lenny-kg lenny_kg_manifest.json
gh release upload v1.0.0-lenny-kg lenny_kg_entities.json
gh release upload v1.0.0-lenny-kg lenny_kg_mentions.json
gh release upload v1.0.0-lenny-kg lenny_kg_relations.json
gh release upload v1.0.0-lenny-kg lenny_kg_conversations.json
```

**Note:** Large files may take several minutes to upload. GitHub CLI will show progress.

### Step 3: Publish Release

```bash
gh release edit v1.0.0-lenny-kg --draft=false
```

---

## Verification

After publishing, verify:

1. **Release URL:** https://github.com/mostly-coherent/Inspiration/releases/tag/v1.0.0-lenny-kg
2. **All 5 files visible** in "Assets" section
3. **File sizes match** expected sizes
4. **Download links work** (click to test)

### Test Download

```bash
# Test manifest download
curl -L https://github.com/mostly-coherent/Inspiration/releases/download/v1.0.0-lenny-kg/lenny_kg_manifest.json

# Should return JSON with version, counts, etc.
```

---

## File URLs (After Release)

Once published, files will be available at:

```
https://github.com/mostly-coherent/Inspiration/releases/download/v1.0.0-lenny-kg/lenny_kg_manifest.json
https://github.com/mostly-coherent/Inspiration/releases/download/v1.0.0-lenny-kg/lenny_kg_entities.json
https://github.com/mostly-coherent/Inspiration/releases/download/v1.0.0-lenny-kg/lenny_kg_mentions.json
https://github.com/mostly-coherent/Inspiration/releases/download/v1.0.0-lenny-kg/lenny_kg_relations.json
https://github.com/mostly-coherent/Inspiration/releases/download/v1.0.0-lenny-kg/lenny_kg_conversations.json
```

These URLs are used by:
- `scripts/download-lenny-kg.sh` (bash script)
- `src/app/api/lenny-kg-import/route.ts` (Next.js API)

---

## Troubleshooting

### Upload Fails (File Too Large)

**Issue:** GitHub web UI may timeout on very large files (>100MB)

**Solution:** Use GitHub CLI instead (handles large files better)

```bash
gh release upload v1.0.0-lenny-kg lenny_kg_entities.json
```

### Release Not Visible

**Issue:** Release created but not showing up

**Solution:** 
- Check if release is still in "Draft" status
- Go to Releases page → Click "Draft releases" tab
- Click "Edit" → Change to "Published"

### Files Missing After Upload

**Issue:** Uploaded files but they're not in release

**Solution:**
- Verify upload completed (check progress bar)
- Refresh release page
- Re-upload if needed (GitHub allows overwriting)

---

## Next Steps After Release

1. **Update download script** (`scripts/download-lenny-kg.sh`):
   - Verify `BASE_URL` points to correct release tag
   - Test download locally

2. **Update API endpoint** (`src/app/api/lenny-kg-import/route.ts`):
   - Verify `GITHUB_RELEASE_URL` matches release tag
   - Test import flow

3. **Documentation:**
   - Update `docs/LENNY_KG_DISTRIBUTION.md` with release URL
   - Add to README if needed

4. **Test Import:**
   - Run `bash scripts/download-lenny-kg.sh`
   - Run `python3 engine/scripts/import_lenny_kg.py`
   - Verify data imported correctly

---

## File Size Summary

| File | Size | Upload Time (Est.) |
|------|------|-------------------|
| `lenny_kg_manifest.json` | 549B | <1 second |
| `lenny_kg_conversations.json` | 8.4MB | ~5 seconds |
| `lenny_kg_relations.json` | 17MB | ~10 seconds |
| `lenny_kg_mentions.json` | 37MB | ~20 seconds |
| `lenny_kg_entities.json` | 271MB | ~2-3 minutes |

**Total:** ~333MB uncompressed

**Note:** GitHub may compress files automatically, reducing download size.

---

**Last Updated:** 2026-01-21
