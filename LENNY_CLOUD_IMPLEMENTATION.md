# Lenny Embeddings Cloud Implementation Plan

## Overview
Make Lenny embeddings (~250MB) available on Vercel/cloud deployments using Supabase Storage.

## Architecture

### Current Flow (Local Only)
1. User clicks "Download" → `/api/lenny-download`
2. API runs bash script → Downloads from GitHub Releases
3. Files saved to `data/lenny_embeddings.npz` and `data/lenny_metadata.json`
4. Python scripts read from local filesystem

### Proposed Flow (Cloud)
1. User clicks "Download" → `/api/lenny-download`
2. API checks Supabase Storage bucket `lenny-embeddings`
3. If not exists: Download from GitHub Releases → Upload to Supabase Storage
4. If exists: Return success (already cached)
5. Python scripts download from Supabase Storage to `/tmp` (ephemeral, but fast)

## Implementation Steps

### Step 1: Create Supabase Storage Bucket

**In Supabase Dashboard:**
1. Go to Storage → Create Bucket
2. Name: `lenny-embeddings`
3. Public: ✅ Yes (or use RLS with service role key)
4. File size limit: 500MB (embeddings are ~250MB)

### Step 2: One-Time Upload Script

Create `scripts/upload-lenny-to-supabase.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";
import { readFile } from "fs/promises";
import path from "path";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Need service role for uploads
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function uploadLennyEmbeddings() {
  const bucket = "lenny-embeddings";
  const embeddingsPath = path.join(process.cwd(), "data", "lenny_embeddings.npz");
  const metadataPath = path.join(process.cwd(), "data", "lenny_metadata.json");

  // Upload embeddings file
  const embeddingsData = await readFile(embeddingsPath);
  const { error: embeddingsError } = await supabase.storage
    .from(bucket)
    .upload("lenny_embeddings.npz", embeddingsData, {
      contentType: "application/octet-stream",
      upsert: true,
    });

  if (embeddingsError) {
    console.error("Failed to upload embeddings:", embeddingsError);
    return;
  }

  // Upload metadata file
  const metadataData = await readFile(metadataPath);
  const { error: metadataError } = await supabase.storage
    .from(bucket)
    .upload("lenny_metadata.json", metadataData, {
      contentType: "application/json",
      upsert: true,
    });

  if (metadataError) {
    console.error("Failed to upload metadata:", metadataError);
    return;
  }

  console.log("✅ Successfully uploaded Lenny embeddings to Supabase Storage");
}

uploadLennyEmbeddings();
```

**Run once locally:**
```bash
# After downloading embeddings locally
npm run upload-lenny-to-supabase
```

### Step 3: Update Download API Route

Modify `src/app/api/lenny-download/route.ts`:

```typescript
// Add Supabase Storage download logic
async function downloadFromSupabaseStorage(): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return { success: false, error: "Supabase not configured" };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const bucket = "lenny-embeddings";

  // Check if files exist in Supabase Storage
  const { data: embeddingsList } = await supabase.storage.from(bucket).list();
  const hasEmbeddings = embeddingsList?.some(f => f.name === "lenny_embeddings.npz");
  const hasMetadata = embeddingsList?.some(f => f.name === "lenny_metadata.json");

  if (!hasEmbeddings || !hasMetadata) {
    // Files not in Supabase - need to upload from GitHub first
    // This would trigger a one-time upload job (or manual upload)
    return { success: false, error: "Embeddings not available in Supabase Storage. Please upload first." };
  }

  // Files exist - download to /tmp (ephemeral but fast)
  const tmpDir = "/tmp/lenny-embeddings";
  await fs.mkdir(tmpDir, { recursive: true });

  const { data: embeddingsData, error: embeddingsError } = await supabase.storage
    .from(bucket)
    .download("lenny_embeddings.npz");

  if (embeddingsError) {
    return { success: false, error: `Failed to download embeddings: ${embeddingsError.message}` };
  }

  // Convert blob to buffer and save
  const embeddingsBuffer = Buffer.from(await embeddingsData.arrayBuffer());
  await fs.writeFile(path.join(tmpDir, "lenny_embeddings.npz"), embeddingsBuffer);

  const { data: metadataData, error: metadataError } = await supabase.storage
    .from(bucket)
    .download("lenny_metadata.json");

  if (metadataError) {
    return { success: false, error: `Failed to download metadata: ${metadataError.message}` };
  }

  const metadataBuffer = Buffer.from(await metadataData.arrayBuffer());
  await fs.writeFile(path.join(tmpDir, "lenny_metadata.json"), metadataBuffer);

  return { success: true };
}
```

### Step 4: Update Python Scripts to Use /tmp

Modify `engine/common/lenny_search.py`:

```python
import os
import json
import numpy as np

def get_lenny_embeddings_path():
    """Get path to Lenny embeddings, checking /tmp first (cloud), then data/ (local)"""
    # Cloud environment: check /tmp first
    tmp_path = "/tmp/lenny-embeddings/lenny_embeddings.npz"
    if os.path.exists(tmp_path):
        return tmp_path
    
    # Local environment: check data/
    local_path = os.path.join(os.path.dirname(__file__), "../../data/lenny_embeddings.npz")
    if os.path.exists(local_path):
        return local_path
    
    return None

def get_lenny_metadata_path():
    """Get path to Lenny metadata, checking /tmp first (cloud), then data/ (local)"""
    tmp_path = "/tmp/lenny-embeddings/lenny_metadata.json"
    if os.path.exists(tmp_path):
        return tmp_path
    
    local_path = os.path.join(os.path.dirname(__file__), "../../data/lenny_metadata.json")
    if os.path.exists(local_path):
        return local_path
    
    return None
```

### Step 5: Update Stats API

Modify `src/app/api/lenny-stats/route.ts` to check both locations:

```typescript
// Check /tmp first (cloud), then data/ (local)
const tmpMetadataPath = "/tmp/lenny-embeddings/lenny_metadata.json";
const localMetadataPath = path.join(process.cwd(), "data", "lenny_metadata.json");

const metadataPath = fs.existsSync(tmpMetadataPath) ? tmpMetadataPath : localMetadataPath;
```

## Alternative: On-Demand Streaming (Simpler, Slower)

If you don't want to manage Supabase Storage, you could stream directly from GitHub Releases:

```typescript
// In lenny-download route
const GITHUB_RELEASE_URL = "https://github.com/mostly-coherent/Inspiration/releases/download/v1.0.0-lenny";
const tmpDir = "/tmp/lenny-embeddings";

// Check if already downloaded in /tmp (persists during warm function invocations)
if (!fs.existsSync(path.join(tmpDir, "lenny_embeddings.npz"))) {
  // Download directly from GitHub to /tmp
  await fs.mkdir(tmpDir, { recursive: true });
  const response = await fetch(`${GITHUB_RELEASE_URL}/lenny_embeddings.npz`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(path.join(tmpDir, "lenny_embeddings.npz"), buffer);
}
```

**How it works:**
- User clicks "Download" button → Downloads from GitHub to `/tmp` (one-time per serverless instance)
- `/tmp` persists during **warm function invocations** (same serverless container reused)
- `/tmp` is cleared on **cold starts** (new container) or **deployments**
- Python scripts check `/tmp` first, download if missing

**When downloads happen:**
- ✅ **First time user clicks "Download"** → Downloads 250MB
- ✅ **After cold start** (new serverless container) → Downloads 250MB again
- ✅ **After deployment** → Downloads 250MB again
- ❌ **NOT on every app launch** → Only when `/tmp` is empty

**Pros:**
- No storage setup needed
- Always latest version
- No storage costs
- Cached in `/tmp` during warm invocations

**Cons:**
- Slower on cold starts (downloads 250MB)
- GitHub rate limits (60 requests/hour for unauthenticated)
- No persistent cache (cleared on cold starts/deployments)
- User experience: First search after cold start takes ~30-60 seconds

## Recommendation

**Primary: Supabase Storage** (Recommended for all users)
- Heavy users need Supabase anyway (for vector DB)
- Fast (CDN-backed, 5-10 seconds)
- Persistent (one-time upload)
- Cost-effective (free tier covers it)
- Better UX (instant availability after first download)

**Fallback: GitHub Releases** (For users without Supabase)
- No setup required
- Slower (30-60 seconds on cold starts)
- Ephemeral (`/tmp` cleared on cold starts)
- Good for light users who don't want Supabase

## Migration Path

1. **Phase 1**: Upload embeddings to Supabase Storage (one-time, manual)
2. **Phase 2**: Update download API to use Supabase Storage
3. **Phase 3**: Update Python scripts to check `/tmp` first
4. **Phase 4**: Test on Vercel deployment
5. **Phase 5**: Remove cloud detection blocking (make it work everywhere)

## Cost Estimate

- **Supabase Free Tier**: 1GB storage, 2GB bandwidth/month
- **Lenny Embeddings**: ~250MB storage
- **Monthly bandwidth**: ~2GB (assuming 8 downloads/month)
- **Cost**: $0/month (within free tier)

## Next Steps

1. Create Supabase Storage bucket
2. Run upload script locally (one-time)
3. Update API routes to download from Supabase
4. Update Python scripts to use `/tmp`
5. Test on Vercel
