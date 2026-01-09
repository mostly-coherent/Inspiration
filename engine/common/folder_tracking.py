"""
Folder-Based Tracking — Scan folders and match items using cosine similarity.

Used for:
- Golden examples folder (mode-specific examples)
- Implemented items folder (mark items as implemented when found in files)
"""

import json
from pathlib import Path
from typing import Any, Optional
from datetime import datetime

from .semantic_search import get_embedding, cosine_similarity
from .items_bank import ItemsBank


def get_text_extensions_from_config() -> set[str]:
    """Get text file extensions from config or fallback to defaults."""
    try:
        from .config import get_text_extensions
        return set(get_text_extensions())
    except Exception:
        return {".md", ".txt", ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml"}


def scan_folder_for_files(folder_path: Path, extensions: list[str] = None) -> list[tuple[Path, str]]:
    """
    Scan a folder recursively for files and return their paths and content.
    
    Args:
        folder_path: Path to folder to scan
        extensions: Optional list of file extensions to include (e.g., [".md", ".py"])
                    If None, uses extensions from config (Settings → Advanced → File Tracking)
    
    Returns:
        List of (file_path, content) tuples
    """
    if not folder_path.exists() or not folder_path.is_dir():
        return []
    
    files: list[tuple[Path, str]] = []
    extensions_set = set(extensions) if extensions else None
    
    # Get text extensions from config (Settings → Advanced → File Tracking)
    text_extensions = get_text_extensions_from_config()
    
    for file_path in folder_path.rglob("*"):
        if not file_path.is_file():
            continue
        
        # Check extension filter
        if extensions_set:
            if file_path.suffix not in extensions_set:
                continue
        else:
            # Default: only text files
            if file_path.suffix not in text_extensions:
                continue
        
        try:
            content = file_path.read_text(encoding="utf-8")
            files.append((file_path, content))
        except (UnicodeDecodeError, IOError):
            # Skip binary files or files we can't read
            continue
    
    return files


def match_items_to_files(
    items: list[dict[str, Any]],
    files: list[tuple[Path, str]],
    similarity_threshold: float = 0.75,
    batch_size: int = 10,
) -> dict[str, tuple[Path, float]]:
    """
    Match items to files using cosine similarity.
    
    Args:
        items: List of items with embeddings
        files: List of (file_path, content) tuples
        similarity_threshold: Minimum similarity to consider a match
        batch_size: Number of files to process embeddings for at once
    
    Returns:
        Dict mapping item_id -> (matched_file_path, similarity_score)
    """
    matches: dict[str, tuple[Path, float]] = {}
    
    if not items or not files:
        return matches
    
    # Generate embeddings for files in batches
    print(f"📊 Generating embeddings for {len(files)} file(s)...")
    file_embeddings: list[tuple[Path, list[float]]] = []
    
    for i in range(0, len(files), batch_size):
        batch = files[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (len(files) + batch_size - 1) // batch_size
        
        if total_batches > 1:
            print(f"   Processing batch {batch_num}/{total_batches}...")
        
        for file_path, content in batch:
            try:
                # Use first 8000 chars to avoid token limits
                content_preview = content[:8000]
                embedding = get_embedding(content_preview)
                file_embeddings.append((file_path, embedding))
            except Exception as e:
                print(f"   ⚠️  Failed to generate embedding for {file_path.name}: {e}")
    
    # Match items to files
    print(f"🔍 Matching {len(items)} item(s) to {len(file_embeddings)} file(s)...")
    
    for item in items:
        if not item.get("embedding"):
            continue
        
        item_embedding = item["embedding"]
        best_match: Optional[tuple[Path, float]] = None
        best_similarity = 0.0
        
        for file_path, file_embedding in file_embeddings:
            similarity = cosine_similarity(item_embedding, file_embedding)
            if similarity > best_similarity and similarity >= similarity_threshold:
                best_similarity = similarity
                best_match = (file_path, similarity)
        
        if best_match:
            matches[item["id"]] = best_match
    
    return matches


def get_implemented_threshold_from_config() -> float:
    """Get implemented match threshold from config or fallback to default."""
    try:
        from .config import get_implemented_match_threshold
        return get_implemented_match_threshold()
    except Exception:
        return 0.75


def sync_implemented_status_from_folder(
    folder_path: Path,
    mode: str,
    similarity_threshold: float = None,  # If None, uses config value
    dry_run: bool = False,
) -> int:
    """
    Scan a folder and mark items as implemented if they match files in the folder.
    
    Args:
        folder_path: Path to folder containing implemented items
        mode: Mode to filter items (e.g., "idea", "insight")
        similarity_threshold: Minimum similarity to consider a match (uses config if None)
        dry_run: If True, don't actually update items
    
    Returns:
        Number of items marked as implemented
    """
    # Use config value if threshold not specified
    if similarity_threshold is None:
        similarity_threshold = get_implemented_threshold_from_config()
    
    if not folder_path.exists():
        print(f"⚠️  Folder not found: {folder_path}")
        return 0
    
    bank = ItemsBank()
    items = bank.get_items(mode=mode, implemented=False)
    
    if not items:
        print(f"📭 No {mode} items in bank to check")
        return 0
    
    print(f"\n🔍 Checking {len(items)} {mode} item(s) against folder: {folder_path}")
    
    # Scan folder for files
    files = scan_folder_for_files(folder_path)
    if not files:
        print(f"⚠️  No files found in {folder_path}")
        return 0
    
    print(f"📁 Found {len(files)} file(s) in folder")
    
    # Match items to files
    matches = match_items_to_files(items, files, similarity_threshold)
    
    if not matches:
        print("ℹ️  No matches found above similarity threshold")
        return 0
    
    # Update items
    updated_count = 0
    for item_id, (file_path, similarity) in matches.items():
        item = bank._get_item(item_id)
        if item:
            if not dry_run:
                bank.mark_implemented(item_id, source=str(file_path))
            # Support both new 'title' field and legacy 'name' field
            item_name = item.get("title") or item.get("name", "Unknown")
            print(f"   ✅ Matched '{item_name}' to {file_path.name} (similarity: {similarity:.2f})")
            updated_count += 1
    
    if not dry_run and updated_count > 0:
        bank.save()
    
    print(f"\n📄 Updated {updated_count} item(s) with implemented status")
    return updated_count


def load_golden_examples(folder_path: Path) -> list[str]:
    """
    Load golden examples from a folder.
    
    Args:
        folder_path: Path to folder containing golden example files
    
    Returns:
        List of example content strings
    """
    if not folder_path.exists():
        return []
    
    files = scan_folder_for_files(folder_path, extensions=[".md", ".txt"])
    examples = []
    
    for file_path, content in files:
        # Clean and add to examples
        content_clean = content.strip()
        if content_clean:
            examples.append(content_clean)
    
    return examples

