# Testing Supabase Storage Download on Vercel

## Step 3-2: Test the Download

### Where to Test

1. **Open your Vercel deployment**
   - Go to your Vercel dashboard: https://vercel.com/dashboard
   - Find your Inspiration project
   - Click on the deployment URL (e.g., `inspiration.vercel.app` or your custom domain)
   - **OR** if you know your deployment URL, just go directly there

2. **Find the Download Button**
   - Scroll down to the **"Wisdom from Lenny's"** section
   - Look for a **"Download"** button (purple/indigo button with 📥 icon)
   - It should be next to the text "Not downloaded yet"

3. **Click the Download Button**
   - Click the **"Download"** button
   - You should see:
     - Button changes to "Downloading..." with spinning icon ⏳
     - Status message appears: "📥 Downloading embeddings (~250MB)..."
   - Wait 5-10 seconds (if using Supabase) or 30-60 seconds (if falling back to GitHub)

4. **Check the Result**
   - **Success**: You'll see "✓ Download complete!" message
   - **Failure**: You'll see an error message

### How to Verify It's Using Supabase Storage

#### Option A: Check Browser Console (Easiest)

1. **Open Browser Developer Tools**
   - Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
   - Go to **"Console"** tab

2. **Click Download Button**

3. **Look for these logs:**
   - ✅ **Success**: Should see API response with `"source": "supabase"`
   - ❌ **Fallback**: If you see `"source": "github"`, it's falling back (Supabase not working)

#### Option B: Check Vercel Function Logs (More Detailed)

1. **Go to Vercel Dashboard**
   - https://vercel.com/dashboard
   - Click on your Inspiration project
   - Click **"Deployments"** tab
   - Click on the latest deployment
   - Click **"Functions"** tab

2. **Find the Function**
   - Look for `/api/lenny-download`
   - Click on it

3. **Click Download Button** (in your app)

4. **Check Logs**
   - Refresh the logs view
   - Look for:
     - ✅ `"[Lenny Download] Downloading from Supabase Storage..."`
     - ✅ `"Downloaded from Supabase Storage"`
     - ❌ If you see `"falling back to GitHub"`, Supabase isn't working

#### Option C: Check Network Tab (Most Detailed)

1. **Open Browser Developer Tools**
   - Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
   - Go to **"Network"** tab

2. **Click Download Button**

3. **Find the API Call**
   - Look for `/api/lenny-download` request
   - Click on it
   - Go to **"Response"** tab

4. **Check Response JSON**
   - Should see:
     ```json
     {
       "success": true,
       "message": "Downloaded from Supabase Storage. Embeddings ready for use.",
       "source": "supabase",
       "cloudMode": true
     }
     ```
   - If `"source": "github"`, it's falling back

### Expected Behavior

#### ✅ Success (Using Supabase Storage)
- Download completes in **5-10 seconds**
- Status message: "✓ Download complete!"
- Console shows: `"source": "supabase"`
- Vercel logs show: "Downloaded from Supabase Storage"

#### ⚠️ Fallback (Using GitHub Releases)
- Download takes **30-60 seconds**
- Status message: "✓ Download complete!" (but slower)
- Console shows: `"source": "github"`
- Vercel logs show: "Downloading from GitHub Releases..."

#### ❌ Error (Something Wrong)
- Status message: "⚠️ [error message]"
- Check error message for clues:
  - "Supabase not configured" → Missing env vars
  - "Embeddings not found in Supabase Storage" → Files not uploaded correctly
  - "Failed to download embeddings" → Permission issue

### Troubleshooting

#### Issue: Button doesn't appear
**Check:**
- Is the app showing "Not downloaded yet"?
- If it shows "☁️ Local only", you're on cloud but `cloudMode` flag is wrong
- Check browser console for errors

#### Issue: "Supabase not configured"
**Fix:**
- Go to Vercel Dashboard → Your Project → Settings → Environment Variables
- Make sure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set
- Redeploy after adding env vars

#### Issue: "Embeddings not found in Supabase Storage"
**Fix:**
- Go back to Supabase Dashboard → Storage → `lenny-embeddings`
- Verify both files are there:
  - `lenny_embeddings.npz` (~219MB)
  - `lenny_metadata.json` (~28KB)
- Check file names are exact (lowercase, underscores)

#### Issue: Download works but shows "github" source
**Check:**
- Supabase bucket exists and files are uploaded
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in Vercel
- Bucket is public (or RLS policies allow downloads)
- Check Vercel logs for error messages

### Quick Test Checklist

- [ ] Opened Vercel deployment URL
- [ ] Found "Wisdom from Lenny's" section
- [ ] Saw "Download" button (not "☁️ Local only")
- [ ] Clicked Download button
- [ ] Saw "Downloading..." status
- [ ] Completed in 5-10 seconds (Supabase) or 30-60 seconds (GitHub)
- [ ] Saw "✓ Download complete!" message
- [ ] Checked browser console → `"source": "supabase"` ✅

---

## Alternative: Test Locally First (Optional)

If you want to test before deploying:

1. **Set environment variables locally**
   ```bash
   # In Inspiration/.env.local
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_anon_key
   VERCEL=1  # Simulate cloud environment
   ```

2. **Run dev server**
   ```bash
   npm run dev
   ```

3. **Test same way** (but locally)

**Note**: Local test might not work perfectly because `/tmp` behaves differently locally vs Vercel, but it's good for testing the Supabase connection.
