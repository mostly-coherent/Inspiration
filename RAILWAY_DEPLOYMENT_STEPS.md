# Railway Deployment - Quick Steps

## ✅ Prerequisites (Already Done)
- [x] Railway CLI installed (`railway --version` works)
- [x] Flask API wrapper created (`engine/api.py`)
- [x] Procfile created (`engine/Procfile`)
- [x] Requirements updated (`engine/requirements.txt` includes Flask)
- [x] Next.js routes updated to use HTTP

## 🚀 Deployment Steps

### Step 1: Login to Railway

```bash
cd "/Users/jmbeh/Personal Builder Lab/Inspiration/engine"
railway login
```

This will open your browser to authenticate with Railway.

### Step 2: Initialize Railway Project

```bash
# Make sure you're in the engine directory
cd "/Users/jmbeh/Personal Builder Lab/Inspiration/engine"

# Initialize Railway project
railway init
```

When prompted:
- **Create new project** (or link to existing if you have one)
- **Project name**: `inspiration-engine` (or your preferred name)
- **Region**: Choose closest to you (e.g., `us-west`)

### Step 3: Set Environment Variables

**Recommended: Via Railway Dashboard** (easiest method)

1. Go to https://railway.app
2. Select your project (`inspiration-engine`)
3. Click on your service (or create one if needed)
4. Go to the **"Variables"** tab
5. Click **"New Variable"** and add each variable:

   - `ANTHROPIC_API_KEY` = `sk-ant-...`
   - `OPENAI_API_KEY` = `sk-...` (optional)
   - `SUPABASE_URL` = `https://...`
   - `SUPABASE_KEY` = `sb_publishable_...`

6. Railway will automatically redeploy when you add variables

**Alternative: Via CLI** (if you prefer command line)
```bash
railway variables --set "ANTHROPIC_API_KEY=sk-ant-..." --set "SUPABASE_URL=https://..."
```
Note: Use `--set "KEY=value"` syntax, not `set KEY=value`

### Step 4: Deploy

```bash
# Still in engine directory
railway up
```

This will:
1. Build your Python app
2. Install dependencies from `requirements.txt`
3. Start the Flask API server
4. Give you a public URL (e.g., `https://inspiration-engine.railway.app`)

### Step 5: Get Your Deployment URL

After deployment completes, get your URL:

```bash
railway domain
```

Or check the Railway dashboard:
- Go to your project → your service
- Click "Settings" → "Networking"
- Copy the public domain (e.g., `https://inspiration-engine-production.up.railway.app`)

**Note:** Railway may take 1-2 minutes to build and deploy. Check build logs in the Railway dashboard or with:
```bash
railway logs
```

### Step 6: Configure Vercel

1. Go to your Vercel project dashboard
2. Go to "Settings" → "Environment Variables"
3. Add:
   ```
   PYTHON_ENGINE_URL=https://your-railway-url.railway.app
   ```
4. Redeploy your Next.js app

### Step 7: Test

1. Visit your Vercel app
2. Try generating ideas/insights
3. Check Railway logs: `railway logs` (or in Railway dashboard)

## 🔍 Troubleshooting

### Check Railway Logs
```bash
railway logs
```

### Check Railway Status
```bash
railway status
```

### Redeploy
```bash
railway up
```

### View Railway Dashboard
```bash
railway open
```

## 📝 Notes

- **Local Development**: If `PYTHON_ENGINE_URL` is not set, the app will use local `spawn()` (works for local dev)
- **Production**: Set `PYTHON_ENGINE_URL` in Vercel to use Railway service
- **Sync Endpoint**: The `/sync` endpoint requires local Cursor DB access, so it won't work on Railway (expected - sync should be done locally)

## 🎯 Next Steps After Deployment

1. ✅ **Test `/health` endpoint:**
   ```bash
   curl https://inspiration-production-6eaf.up.railway.app/health
   ```
   Should return: `{"status":"ok","engine":"inspiration","version":"1.0.0"}`

2. ✅ **Add to Vercel:**
   - Go to Vercel dashboard → Your project → Settings → Environment Variables
   - Add: `PYTHON_ENGINE_URL=https://inspiration-production-6eaf.up.railway.app`
   - Redeploy your Vercel app

3. **Test end-to-end:**
   - Visit your Vercel app
   - Try generating ideas/insights
   - Check Railway logs if issues: `railway logs` (or Railway dashboard)

4. **Monitor Railway:**
   - Check Railway dashboard for deployment status
   - Monitor logs for any errors

