# Vercel Deployment Strategy

## Problem

The Inspiration app spawns Python scripts from Node.js API routes, which doesn't work on Vercel's serverless platform:
- Vercel doesn't have Python installed by default
- Process spawning from serverless functions isn't supported
- Python dependencies can't be installed during build

## Recommended Solution: Hybrid Deployment

**Deploy Python engine as separate service + Next.js frontend on Vercel**

### Architecture

```
┌─────────────────┐         HTTP         ┌──────────────────┐
│  Next.js App    │ ───────────────────▶ │  Python Engine   │
│  (Vercel)       │                       │  (Railway/etc)   │
│                 │ ◀─────────────────── │                  │
│  - Frontend UI  │      JSON Response   │  - generate.py   │
│  - API Routes   │                       │  - seek.py       │
│  (HTTP proxy)   │                       │  - sync_messages │
└─────────────────┘                       └──────────────────┘
```

### Option 1: Railway (Recommended - Easiest)

**Pros:**
- ✅ One-click Python deployment
- ✅ Automatic HTTPS
- ✅ Free tier available
- ✅ Simple environment variable management
- ✅ Built-in PostgreSQL (if needed)

**Steps:**

1. **Deploy Python Engine to Railway:**
   ```bash
   # Create Railway project
   railway init
   
   # Add Python runtime
   # Railway auto-detects Python from requirements.txt
   
   # Set environment variables in Railway dashboard:
   # - ANTHROPIC_API_KEY
   # - OPENAI_API_KEY (optional)
   # - SUPABASE_URL
   # - SUPABASE_KEY
   ```

2. **Create Python HTTP API wrapper:**
   Create `engine/api.py` (Flask/FastAPI) that wraps your existing scripts:
   ```python
   # engine/api.py
   from flask import Flask, request, jsonify
   import subprocess
   import json
   
   app = Flask(__name__)
   
   @app.route('/generate', methods=['POST'])
   def generate():
       data = request.json
       # Call generate.py with args
       result = subprocess.run(['python3', 'generate.py', ...], capture_output=True)
       return jsonify({'stdout': result.stdout, 'stderr': result.stderr})
   
   @app.route('/seek', methods=['POST'])
   def seek():
       # Similar wrapper for seek.py
       pass
   ```

3. **Update Next.js API routes:**
   Replace `spawn('python3', ...)` with `fetch(process.env.PYTHON_ENGINE_URL + '/generate', ...)`

4. **Set environment variable in Vercel:**
   ```
   PYTHON_ENGINE_URL=https://your-app.railway.app
   ```

### Option 2: Render (Similar to Railway)

**Pros:**
- ✅ Free tier
- ✅ Auto-deploy from GitHub
- ✅ Simple setup

**Steps:** Similar to Railway, but uses Render's dashboard for deployment.

### Option 3: Fly.io (More Control)

**Pros:**
- ✅ More control over runtime
- ✅ Global edge deployment
- ✅ Good for production

**Cons:**
- ⚠️ More setup complexity

### Option 4: Convert API Routes to Vercel Python Functions

**Pros:**
- ✅ Everything on Vercel
- ✅ No separate service

**Cons:**
- ⚠️ Requires refactoring API routes to Python
- ⚠️ Need to rewrite spawn logic
- ⚠️ More complex migration

**Steps:**

1. Create Python API routes in `api/` directory:
   ```
   api/
   ├── generate/
   │   └── index.py  # Vercel Python function
   └── seek/
       └── index.py
   ```

2. Move Python engine code to be importable
3. Update Vercel config to use Python runtime

## Quick Start: Railway Deployment

### Prerequisites

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway:**
   ```bash
   railway login
   ```
   This will open your browser to authenticate.

### 1. Create Railway Project

```bash
# Navigate to the Inspiration project root
cd "/Users/jmbeh/Personal Builder Lab/Inspiration"

# Initialize Railway project in the engine directory
cd engine
railway init

# This will prompt you to:
# - Create a new project or link to existing
# - Name your project (e.g., "inspiration-engine")
# - Select a region

# Deploy to Railway
railway up
```

### 2. Create Minimal API Wrapper

Create `engine/api.py`:

```python
#!/usr/bin/env python3
"""HTTP API wrapper for Inspiration engine scripts."""

from flask import Flask, request, jsonify
import subprocess
import sys
import os
from pathlib import Path

app = Flask(__name__)

ENGINE_DIR = Path(__file__).parent

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

@app.route('/generate', methods=['POST'])
def generate():
    """Wrapper for generate.py"""
    data = request.json
    args = ['python3', str(ENGINE_DIR / 'generate.py')]
    
    # Map request to CLI args
    if 'mode' in data:
        args.extend(['--mode', data['mode']])
    if 'days' in data:
        args.extend(['--days', str(data['days'])])
    # ... map other params
    
    result = subprocess.run(
        args,
        cwd=str(ENGINE_DIR),
        capture_output=True,
        text=True,
        env={**os.environ, 'PYTHONUNBUFFERED': '1'}
    )
    
    return jsonify({
        'stdout': result.stdout,
        'stderr': result.stderr,
        'exitCode': result.returncode
    })

@app.route('/seek', methods=['POST'])
def seek():
    """Wrapper for seek.py"""
    # Similar implementation
    pass

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
```

### 3. Add Flask to requirements.txt

```bash
echo "flask>=3.0.0" >> engine/requirements.txt
```

### 4. Create Railway Procfile

Create `engine/Procfile`:
```
web: python api.py
```

### 5. Update Next.js API Routes

Replace `runPythonScript()` with HTTP call:

```typescript
// src/app/api/generate/route.ts
const PYTHON_ENGINE_URL = process.env.PYTHON_ENGINE_URL || 'http://localhost:5000';

async function callPythonEngine(endpoint: string, body: any) {
  const response = await fetch(`${PYTHON_ENGINE_URL}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}
```

## Migration Checklist

- [ ] Deploy Python engine to Railway/Render/Fly.io
- [ ] Create HTTP API wrapper (`api.py`)
- [ ] Test Python service endpoints locally
- [ ] Update Next.js API routes to use HTTP instead of spawn
- [ ] Set `PYTHON_ENGINE_URL` in Vercel environment variables
- [ ] Test end-to-end: Vercel → Python service
- [ ] Update BUILD_LOG.md with deployment details

## Cost Estimate

- **Railway:** Free tier (500 hours/month), then $5/month
- **Render:** Free tier available
- **Fly.io:** Free tier (3 VMs), then pay-as-you-go
- **Vercel:** Free tier sufficient for frontend

## Recommendation

**Start with Railway** - it's the fastest path to deployment with minimal code changes. You can always migrate to a different platform later if needed.

