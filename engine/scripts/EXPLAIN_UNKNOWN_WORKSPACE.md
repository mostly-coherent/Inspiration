# Why "Unknown" Workspace Messages Exist

## Root Cause

Messages get `workspace = "Unknown"` when the workspace hash cannot be resolved to an actual workspace path. This happens in `cursor_db.py` when:

1. **Workspace was deleted/moved**: The workspaceStorage entry no longer exists, so the hash can't be mapped to a path
2. **Workspace hash mismatch**: The hash format in the chat data doesn't match what's in workspaceStorage
3. **Missing workspace data**: The chat data doesn't contain workspace hash information

## Code Locations

In `cursor_db.py`:

- **Line 579**: Default value set to "Unknown"
- **Line 600**: If `workspace_hash` is found in `workspace_mapping`, use the path; otherwise stays "Unknown"
- **Line 607, 611**: For ItemTable format, if hash not in mapping, defaults to "Unknown"

## How Workspace Mapping Works

1. `get_workspace_mapping()` reads from `workspaceStorage` directory
2. Each workspace folder contains a `workspace.json` with the folder path
3. The folder name is the workspace hash
4. If a hash isn't found in this mapping → "Unknown"

## Solutions

### Option 1: Keep "Unknown" (Current)
- Acceptable if old/deleted workspaces don't need to be identified
- Messages are still searchable by timestamp and content

### Option 2: Store Original Hash
- When indexing, store both `workspace` (path) and `workspace_hash` (original hash)
- Allows later resolution if workspace is re-added

### Option 3: Manual Mapping
- Create a mapping table of hash → path for historical workspaces
- Update during sync if workspace is found

## Current Behavior

- Messages with "Unknown" workspace are still indexed and searchable
- They just can't be filtered by workspace path
- This is expected for old/deleted workspaces

