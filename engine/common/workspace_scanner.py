"""
Workspace Scanner — Extract thinking artifacts from workspace files.

Scans configured workspace directories for:
- Markdown files (.md) — READMEs, plans, architecture docs, build logs
- Code comments — TODO/FIXME/HACK/NOTE markers with surrounding context
- Block comments — Docstrings, JSDoc, multi-line comments

These artifacts enrich Memory beyond chat history, capturing the user's
written plans, decisions, and in-code thinking.
"""

import os
import re
import hashlib
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from .config import get_workspaces


# Directories to skip (not useful for thinking artifacts)
SKIP_DIRS = {
    "node_modules", ".next", "dist", "build", ".git", "__pycache__",
    ".cache", ".turbo", "coverage", ".nyc_output", "vendor",
    ".venv", "venv", "env", ".env", ".tox", "eggs", "*.egg-info",
    ".mypy_cache", ".pytest_cache", ".ruff_cache",
    "e2e-results", "test-results", "playwright-report",
    ".vercel", ".netlify", ".amplify",
    "data",  # Inspiration's own data directory
}

# File extensions for code comment extraction
CODE_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx",  # JavaScript/TypeScript
    ".py",                          # Python
    ".rs",                          # Rust
    ".go",                          # Go
    ".java",                        # Java
    ".swift",                       # Swift
    ".rb",                          # Ruby
}

# Maximum text length per artifact (matches chat message limit)
MAX_TEXT_LENGTH = 6000

# Minimum text length to be useful for embedding
MIN_TEXT_LENGTH = 20

# TODO/FIXME pattern (case-insensitive, captures the marker and context)
TODO_PATTERN = re.compile(
    r'(?://|#|<!--|/\*)\s*(?:TODO|FIXME|HACK|NOTE|XXX|OPTIMIZE|WARNING)\b[:\s]*(.*)',
    re.IGNORECASE
)


def should_skip_dir(dir_name: str) -> bool:
    """Check if a directory should be skipped."""
    return dir_name in SKIP_DIRS or dir_name.startswith(".")


def scan_markdown_files(workspace_path: str) -> list[dict]:
    """
    Scan workspace for markdown files and extract content.
    
    Each .md file becomes one artifact with:
    - Full content (truncated at MAX_TEXT_LENGTH)
    - File path as identifier
    - File modification time as timestamp
    """
    artifacts = []
    workspace = Path(workspace_path)
    
    if not workspace.exists():
        return artifacts
    
    for root, dirs, files in os.walk(workspace):
        # Filter directories in-place to skip irrelevant ones
        dirs[:] = [d for d in dirs if not should_skip_dir(d)]
        
        for filename in files:
            if not filename.endswith(".md"):
                continue
            
            filepath = Path(root) / filename
            
            try:
                content = filepath.read_text(encoding="utf-8", errors="replace")
            except (OSError, PermissionError):
                continue
            
            # Skip empty or trivially small files
            content = content.strip()
            if len(content) < MIN_TEXT_LENGTH:
                continue
            
            # Truncate if needed
            if len(content) > MAX_TEXT_LENGTH:
                content = _truncate_at_boundary(content, MAX_TEXT_LENGTH)
            
            # Use file modification time as timestamp (milliseconds)
            mtime_ms = int(filepath.stat().st_mtime * 1000)
            rel_path = str(filepath.relative_to(workspace))
            
            artifacts.append({
                "text": content,
                "file_path": str(filepath),
                "relative_path": rel_path,
                "file_type": "markdown",
                "timestamp": mtime_ms,
                "workspace": str(workspace),
                "file_name": filename,
            })
    
    return artifacts


def scan_code_comments(workspace_path: str) -> list[dict]:
    """
    Scan workspace code files for TODO/FIXME/NOTE markers.
    
    Extracts the marker line plus 2 lines of context above and below.
    Groups all TODOs from a single file into one artifact.
    """
    artifacts = []
    workspace = Path(workspace_path)
    
    if not workspace.exists():
        return artifacts
    
    for root, dirs, files in os.walk(workspace):
        dirs[:] = [d for d in dirs if not should_skip_dir(d)]
        
        for filename in files:
            ext = Path(filename).suffix
            if ext not in CODE_EXTENSIONS:
                continue
            
            filepath = Path(root) / filename
            
            try:
                lines = filepath.read_text(encoding="utf-8", errors="replace").splitlines()
            except (OSError, PermissionError):
                continue
            
            # Find all TODO-like markers in this file
            todo_blocks = []
            for i, line in enumerate(lines):
                match = TODO_PATTERN.search(line)
                if match:
                    # Extract context: 2 lines above, the TODO line, 2 lines below
                    start = max(0, i - 2)
                    end = min(len(lines), i + 3)
                    context = lines[start:end]
                    
                    todo_blocks.append({
                        "line_number": i + 1,
                        "marker_text": match.group(0).strip(),
                        "context": "\n".join(context),
                    })
            
            if not todo_blocks:
                continue
            
            # Combine all TODOs from this file into one artifact
            rel_path = str(filepath.relative_to(workspace))
            combined_text = f"# TODOs in {rel_path}\n\n"
            for block in todo_blocks:
                combined_text += f"## Line {block['line_number']}: {block['marker_text']}\n"
                combined_text += f"```\n{block['context']}\n```\n\n"
            
            combined_text = combined_text.strip()
            if len(combined_text) < MIN_TEXT_LENGTH:
                continue
            
            if len(combined_text) > MAX_TEXT_LENGTH:
                combined_text = _truncate_at_boundary(combined_text, MAX_TEXT_LENGTH)
            
            mtime_ms = int(filepath.stat().st_mtime * 1000)
            
            artifacts.append({
                "text": combined_text,
                "file_path": str(filepath),
                "relative_path": rel_path,
                "file_type": "todo",
                "timestamp": mtime_ms,
                "workspace": str(workspace),
                "file_name": filename,
                "todo_count": len(todo_blocks),
            })
    
    return artifacts


def scan_workspace(workspace_path: str) -> list[dict]:
    """
    Scan a single workspace for all thinking artifacts.
    
    Returns list of artifacts ready for embedding and indexing.
    """
    artifacts = []
    artifacts.extend(scan_markdown_files(workspace_path))
    artifacts.extend(scan_code_comments(workspace_path))
    return artifacts


def scan_all_workspaces() -> list[dict]:
    """
    Scan all configured workspaces for thinking artifacts.
    
    Uses workspace paths from Inspiration's config.
    """
    workspaces = get_workspaces()
    if not workspaces:
        print("⚠️  No workspaces configured. Add workspaces in Settings.")
        return []
    
    all_artifacts = []
    for ws_path in workspaces:
        print(f"📂 Scanning workspace: {ws_path}")
        artifacts = scan_workspace(ws_path)
        print(f"   Found {len(artifacts)} artifacts ({_count_by_type(artifacts)})")
        all_artifacts.extend(artifacts)
    
    print(f"\n📊 Total: {len(all_artifacts)} artifacts from {len(workspaces)} workspace(s)")
    return all_artifacts


def generate_workspace_doc_id(file_path: str, content: str) -> str:
    """
    Generate a unique message ID for a workspace document.
    
    Uses file path + content hash so re-indexing only happens
    when the file content actually changes.
    """
    content_hash = hashlib.sha256(content.encode()).hexdigest()[:16]
    path_hash = hashlib.sha256(file_path.encode()).hexdigest()[:8]
    return f"workspace_docs:{path_hash}_{content_hash}"


def _truncate_at_boundary(text: str, max_chars: int) -> str:
    """Truncate text at a natural boundary (paragraph, sentence, or line)."""
    if len(text) <= max_chars:
        return text
    
    truncated = text[:max_chars]
    
    # Try paragraph boundary first
    last_double_newline = truncated.rfind("\n\n")
    if last_double_newline > max_chars * 0.7:
        return truncated[:last_double_newline] + "\n\n[Document truncated due to length]"
    
    # Try sentence boundary
    last_period = truncated.rfind(".")
    if last_period > max_chars * 0.8:
        return truncated[:last_period + 1] + "\n\n[Document truncated due to length]"
    
    # Try line boundary
    last_newline = truncated.rfind("\n")
    if last_newline > max_chars * 0.8:
        return truncated[:last_newline] + "\n\n[Document truncated due to length]"
    
    return truncated + "\n\n[Document truncated due to length]"


def _count_by_type(artifacts: list[dict]) -> str:
    """Format artifact counts by type for display."""
    counts = {}
    for a in artifacts:
        t = a.get("file_type", "unknown")
        counts[t] = counts.get(t, 0) + 1
    
    parts = []
    if counts.get("markdown", 0) > 0:
        parts.append(f"{counts['markdown']} docs")
    if counts.get("todo", 0) > 0:
        total_todos = sum(a.get("todo_count", 0) for a in artifacts if a.get("file_type") == "todo")
        parts.append(f"{total_todos} TODOs in {counts['todo']} files")
    
    return ", ".join(parts) if parts else "none"


if __name__ == "__main__":
    """CLI for testing workspace scanning."""
    import argparse
    import json
    
    parser = argparse.ArgumentParser(description="Scan workspaces for thinking artifacts")
    parser.add_argument("--workspace", type=str, help="Scan a specific workspace path")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--stats-only", action="store_true", help="Only show stats, not content")
    args = parser.parse_args()
    
    if args.workspace:
        artifacts = scan_workspace(args.workspace)
    else:
        artifacts = scan_all_workspaces()
    
    if args.stats_only:
        print(f"\nTotal artifacts: {len(artifacts)}")
        print(f"By type: {_count_by_type(artifacts)}")
        for a in artifacts:
            print(f"  [{a['file_type']}] {a['relative_path']} ({len(a['text'])} chars)")
    elif args.json:
        # Output without full text for readability
        summary = [{
            "file_path": a["file_path"],
            "relative_path": a["relative_path"],
            "file_type": a["file_type"],
            "text_length": len(a["text"]),
            "workspace": a["workspace"],
        } for a in artifacts]
        print(json.dumps(summary, indent=2))
    else:
        for a in artifacts:
            print(f"\n{'='*60}")
            print(f"[{a['file_type']}] {a['relative_path']}")
            print(f"{'='*60}")
            print(a["text"][:500] + ("..." if len(a["text"]) > 500 else ""))
