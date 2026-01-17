# Supabase Storage Setup Guide for Lenny Embeddings

## Step-by-Step Instructions

### Prerequisites
- ✅ Supabase project created (you already have this)
- ✅ `SUPABASE_URL` and `SUPABASE_ANON_KEY` configured in your app
- ✅ Lenny embeddings downloaded locally (`data/lenny_embeddings.npz` and `data/lenny_metadata.json`)

---

## Step 1: Create Storage Bucket

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project (the one used by Inspiration app)

2. **Open Storage**
   - Click **"Storage"** in the left sidebar
   - You'll see a list of existing buckets (if any)

3. **Create New Bucket**
   - Click **"New bucket"** button (top right)
   - Fill in the form:
     - **Name**: `lenny-embeddings` (exact name, lowercase, hyphens only)
     - **Public bucket**: ✅ **Check this box** (makes it accessible without auth)
     - **File size limit**: `500` MB (embeddings are ~250MB)
     - **Allowed MIME types**: Leave empty (allows all types)
   - Click **"Create bucket"**

4. **Verify Bucket Created**
   - You should see `lenny-embeddings` in the buckets list
   - Status should show as "Public" (if you checked the box)

---

## Step 2: Set Up Permissions (If Using RLS Instead of Public)

**Skip this step if you made the bucket public** (recommended for simplicity).

If you want to use RLS (Row Level Security) instead:

1. **Go to Storage Policies**
   - Click on `lenny-embeddings` bucket
   - Click **"Policies"** tab
   - Click **"New policy"**

2. **Create Download Policy**
   - **Policy name**: `Allow public downloads`
   - **Allowed operation**: `SELECT` (downloads)
   - **Policy definition**: 
     ```sql
     true
     ```
   - Click **"Save policy"**

3. **Create Upload Policy** (if you want API to upload)
   - **Policy name**: `Allow service role uploads`
   - **Allowed operation**: `INSERT` (uploads)
   - **Policy definition**:
     ```sql
     auth.role() = 'service_role'
     ```
   - Click **"Save policy"**

**Note**: For now, we'll upload manually via dashboard, so upload policy is optional.

---

## Step 3: Upload Embeddings Files

### Option A: Upload via Supabase Dashboard (Easiest)

1. **Open the Bucket**
   - Click on `lenny-embeddings` bucket
   - You'll see an empty file list

2. **Upload `lenny_embeddings.npz`**
   - Click **"Upload file"** button
   - Navigate to: `Inspiration/data/lenny_embeddings.npz`
   - Select the file
   - **File path**: Leave as `lenny_embeddings.npz` (root of bucket)
   - Click **"Upload"**
   - Wait for upload to complete (~219MB, may take 1-2 minutes)

3. **Upload `lenny_metadata.json`**
   - Click **"Upload file"** button again
   - Navigate to: `Inspiration/data/lenny_metadata.json`
   - Select the file
   - **File path**: Leave as `lenny_metadata.json` (root of bucket)
   - Click **"Upload"**
   - Should complete quickly (~28KB)

4. **Verify Files**
   - You should see both files in the bucket:
     - `lenny_embeddings.npz` (~219MB)
     - `lenny_metadata.json` (~28KB)

### Option B: Upload via Script (Automated)

If you prefer automation, create `scripts/upload-lenny-to-supabase.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";
import { readFile } from "fs/promises";
import path from "path";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Need service role for uploads

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("   Set these in your .env.local file");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const bucket = "lenny-embeddings";

async function uploadLennyEmbeddings() {
  console.log("📤 Uploading Lenny embeddings to Supabase Storage...");
  console.log(`   Bucket: ${bucket}`);
  console.log(`   URL: ${supabaseUrl}\n`);

  const embeddingsPath = path.join(process.cwd(), "data", "lenny_embeddings.npz");
  const metadataPath = path.join(process.cwd(), "data", "lenny_metadata.json");

  // Check if files exist locally
  try {
    await readFile(embeddingsPath);
    await readFile(metadataPath);
  } catch (error) {
    console.error("❌ Files not found locally!");
    console.error(`   Expected: ${embeddingsPath}`);
    console.error(`   Expected: ${metadataPath}`);
    console.error("\n   Run 'npm run dev' locally first to download embeddings.");
    process.exit(1);
  }

  // Upload embeddings file
  console.log("📤 Uploading lenny_embeddings.npz (~219MB)...");
  const embeddingsData = await readFile(embeddingsPath);
  const { error: embeddingsError } = await supabase.storage
    .from(bucket)
    .upload("lenny_embeddings.npz", embeddingsData, {
      contentType: "application/octet-stream",
      upsert: true, // Overwrite if exists
    });

  if (embeddingsError) {
    console.error("❌ Failed to upload embeddings:", embeddingsError);
    process.exit(1);
  }
  console.log("✅ Uploaded lenny_embeddings.npz\n");

  // Upload metadata file
  console.log("📤 Uploading lenny_metadata.json (~28KB)...");
  const metadataData = await readFile(metadataPath);
  const { error: metadataError } = await supabase.storage
    .from(bucket)
    .upload("lenny_metadata.json", metadataData, {
      contentType: "application/json",
      upsert: true, // Overwrite if exists
    });

  if (metadataError) {
    console.error("❌ Failed to upload metadata:", metadataError);
    process.exit(1);
  }
  console.log("✅ Uploaded lenny_metadata.json\n");

  console.log("🎉 Successfully uploaded Lenny embeddings to Supabase Storage!");
  console.log(`   Bucket: ${bucket}`);
  console.log("   Files are now available for cloud deployments.");
}

uploadLennyEmbeddings().catch(console.error);
```

**Run the script:**
```bash
cd Inspiration
# Make sure you have SUPABASE_SERVICE_ROLE_KEY in .env.local
npx tsx scripts/upload-lenny-to-supabase.ts
```

**Note**: You'll need `SUPABASE_SERVICE_ROLE_KEY` (not `SUPABASE_ANON_KEY`) for uploads. Find it in:
- Supabase Dashboard → Settings → API → `service_role` key (keep this secret!)

---

## Step 4: Verify Setup

### Test via Supabase Dashboard

1. **Check Files**
   - Go to Storage → `lenny-embeddings`
   - Verify both files are listed:
     - `lenny_embeddings.npz` (~219MB)
     - `lenny_metadata.json` (~28KB)

2. **Test Public URL** (if bucket is public)
   - Click on `lenny_metadata.json`
   - Copy the **Public URL**
   - Open in browser → Should show JSON content
   - If you get 404 or access denied, bucket is not public

### Test via API

1. **Deploy to Vercel** (or test locally with cloud env vars)
2. **Click "Download" button** in Inspiration app
3. **Check browser console** for logs:
   - Should see: `"Downloaded from Supabase Storage"`
   - Should see: `"source": "supabase"`
4. **Check Vercel function logs**:
   - Should see: `"[Lenny Download] Downloading from Supabase Storage..."`
   - Should NOT see: `"falling back to GitHub"`

---

## Step 5: Troubleshooting

### Issue: "Embeddings not found in Supabase Storage"

**Check:**
- ✅ Bucket name is exactly `lenny-embeddings` (lowercase, hyphen)
- ✅ Files are named exactly `lenny_embeddings.npz` and `lenny_metadata.json`
- ✅ Files are in the root of the bucket (not in a subfolder)
- ✅ `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set correctly

### Issue: "Failed to download embeddings" (403 Forbidden)

**Check:**
- ✅ Bucket is set to **Public** (recommended)
- ✅ OR RLS policies allow `SELECT` operation
- ✅ Using `SUPABASE_ANON_KEY` (not service role key) for downloads

### Issue: "Failed to upload" (403 Forbidden)

**Check:**
- ✅ Using `SUPABASE_SERVICE_ROLE_KEY` (not anon key) for uploads
- ✅ Service role key is correct (from Settings → API)
- ✅ RLS policies allow `INSERT` operation (if using RLS)

### Issue: Upload fails with "File too large"

**Check:**
- ✅ Bucket file size limit is set to **500MB** or higher
- ✅ Default limit is 50MB, you need to increase it

---

## Summary Checklist

- [ ] Created bucket `lenny-embeddings`
- [ ] Set bucket to **Public** (or configured RLS policies)
- [ ] Set file size limit to **500MB**
- [ ] Uploaded `lenny_embeddings.npz` (~219MB)
- [ ] Uploaded `lenny_metadata.json` (~28KB)
- [ ] Verified files appear in bucket
- [ ] Tested download via API (deployed app)
- [ ] Confirmed `source: "supabase"` in API response

---

## Next Steps

Once setup is complete:
1. ✅ Cloud users will automatically use Supabase Storage (fast, 5-10 seconds)
2. ✅ Users without Supabase will fall back to GitHub Releases (slower, 30-60 seconds)
3. ✅ No code changes needed - it's already implemented!

---

## Cost Estimate

- **Storage**: ~250MB (within free tier: 1GB)
- **Bandwidth**: ~2GB/month (within free tier: 2GB)
- **Cost**: **$0/month** ✅

---

## Reference

- Supabase Storage Docs: https://supabase.com/docs/guides/storage
- Implementation Plan: See `LENNY_CLOUD_IMPLEMENTATION.md`
