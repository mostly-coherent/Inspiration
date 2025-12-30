# How "Refresh Brain" Works

## Overview

The "Refresh Brain" feature syncs your local Cursor chat history to the cloud Vector DB, making it searchable for AI-powered insights and ideas.

## Two Ways to Trigger

### 1. Automatic (On First Load)
- **When**: App loads for the first time
- **What happens**: Automatically runs sync in the background
- **Status**: Shows "Syncing..." then updates to show results
- **Works**: ✅ Local app only | ❌ Vercel (shows "Cloud Mode")

### 2. Manual (Click Button)
- **When**: User clicks "🔄 Refresh Brain" button
- **What happens**: Immediately starts sync
- **Status**: Shows "Syncing..." then updates to show results
- **Works**: ✅ Local app only | ❌ Vercel (shows "Cloud Mode")

## How It Detects Cloud vs Local

### Local App (Works ✅)
- Can access local file system
- Can read Cursor database at: `~/Library/Application Support/Cursor/...`
- Sync works perfectly

### Vercel/Cloud (Read-only ❌)
- Cannot access local file system
- Database file doesn't exist
- Shows: "☁️ Cloud Mode (Read-only)"
- Sync button is disabled/read-only

## Detection Logic

1. **API tries to run sync script**
2. **Script tries to find Cursor database**
3. **If database not found** → Returns "Cannot sync from cloud environment"
4. **Frontend shows**: "☁️ Cloud Mode (Read-only)"

## What Happens During Sync

1. **Reads local database** (SQLite file)
2. **Finds new messages** (since last sync timestamp)
3. **Checks Vector DB** for duplicates
4. **Processes only new messages**:
   - Creates embeddings (AI search format)
   - Indexes into Vector DB
5. **Updates sync state** (saves latest timestamp)
6. **Refreshes brain size** display

## Status Messages

- **"Syncing..."** - Currently syncing
- **"✓ Synced X new items"** - Successfully added new messages
- **"✓ Synced X new items (Y already indexed)"** - Some were duplicates
- **"✓ Brain up to date"** - Everything is synced
- **"☁️ Cloud Mode (Read-only)"** - Running on Vercel, can't sync

## Summary

- ✅ **Auto-sync on load**: Yes, runs automatically
- ✅ **Manual sync**: Yes, click "Refresh Brain" button
- ✅ **Local app**: Full sync functionality
- ❌ **Vercel app**: Read-only mode (can't access local database)

