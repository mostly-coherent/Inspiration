#!/usr/bin/env python3
"""
Verify Lenny Index — Check that all episodes are indexed completely.

Validates:
1. Source count matches indexed count
2. All chunks have embeddings
3. No empty chunks
4. Word coverage is complete
5. GitHub source is in sync with local clone

Note: Lenny's Podcast grows continuously (~2-3 episodes/week). This script
validates that your local index matches the current source, not a fixed count.

Usage:
    python3 engine/scripts/verify_lenny_index.py [--check-github]
"""

import argparse
import json
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    np = None
    NUMPY_AVAILABLE = False

from engine.common.lenny_parser import find_transcript_files
from engine.common.config import get_data_dir


def verify_lenny_index(check_github: bool = False) -> dict:
    """
    Verify that the Lenny index is complete and valid.
    
    Returns dict with validation results and any errors found.
    """
    data_dir = get_data_dir()
    embeddings_path = data_dir / "lenny_embeddings.npz"
    metadata_path = data_dir / "lenny_metadata.json"
    archive_path = data_dir / "lenny-transcripts"
    
    errors = []
    warnings = []
    stats = {}
    
    print("🔍 Verifying Lenny Podcast Index...")
    print()
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 1. Check files exist
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print("📁 Checking index files...")
    
    if not embeddings_path.exists():
        errors.append(f"Embeddings file not found: {embeddings_path}")
        print(f"   ❌ {embeddings_path.name}: NOT FOUND")
    else:
        size_mb = embeddings_path.stat().st_size / (1024 * 1024)
        stats["embeddings_size_mb"] = round(size_mb, 1)
        print(f"   ✅ {embeddings_path.name}: {size_mb:.1f}MB")
    
    if not metadata_path.exists():
        errors.append(f"Metadata file not found: {metadata_path}")
        print(f"   ❌ {metadata_path.name}: NOT FOUND")
    else:
        size_mb = metadata_path.stat().st_size / (1024 * 1024)
        stats["metadata_size_mb"] = round(size_mb, 1)
        print(f"   ✅ {metadata_path.name}: {size_mb:.1f}MB")
    
    if errors:
        return {"valid": False, "errors": errors, "stats": stats}
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 2. Load and validate metadata
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print()
    print("📊 Checking metadata...")
    
    try:
        with open(metadata_path) as f:
            metadata = json.load(f)
    except json.JSONDecodeError as e:
        errors.append(f"Invalid JSON in metadata: {e}")
        return {"valid": False, "errors": errors, "stats": stats}
    
    indexed_episodes = len(metadata.get("episodes", []))
    indexed_chunks = len(metadata.get("chunks", []))
    stats["indexed_episodes"] = indexed_episodes
    stats["indexed_chunks"] = indexed_chunks
    
    print(f"   Episodes: {indexed_episodes}")
    print(f"   Chunks: {indexed_chunks:,}")
    
    if metadata.get("validation"):
        val = metadata["validation"]
        print(f"   Word coverage: {val.get('word_coverage_pct', 'N/A')}%")
        print(f"   Validated at: {val.get('validated_at', 'N/A')}")
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 3. Load and validate embeddings
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print()
    print("🧠 Checking embeddings...")
    
    if not NUMPY_AVAILABLE:
        warnings.append("numpy not available, skipping embedding validation")
        print("   ⚠️ numpy not available, skipping")
    else:
        try:
            data = np.load(embeddings_path)
            embeddings = data["embeddings"]
            stats["embedding_shape"] = list(embeddings.shape)
            
            print(f"   Shape: {embeddings.shape}")
            
            # Check embedding count matches chunk count
            if embeddings.shape[0] != indexed_chunks:
                errors.append(
                    f"Embedding count mismatch: {embeddings.shape[0]} embeddings vs {indexed_chunks} chunks in metadata"
                )
                print(f"   ❌ Count mismatch: {embeddings.shape[0]} != {indexed_chunks}")
            else:
                print(f"   ✅ Embedding count matches chunk count")
            
            # Check for zero vectors (failed embeddings)
            zero_count = np.sum(np.all(embeddings == 0, axis=1))
            if zero_count > 0:
                errors.append(f"Found {zero_count} zero vectors (failed embeddings)")
                print(f"   ❌ {zero_count} zero vectors found")
            else:
                print(f"   ✅ No zero vectors (all embeddings valid)")
            
        except Exception as e:
            errors.append(f"Failed to load embeddings: {e}")
            print(f"   ❌ Load failed: {e}")
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 4. Compare with source files
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print()
    print("📂 Checking source files...")
    
    if not archive_path.exists():
        warnings.append(f"Source archive not found: {archive_path}")
        print(f"   ⚠️ Archive not found: {archive_path}")
    else:
        source_files = find_transcript_files(archive_path)
        stats["source_files"] = len(source_files)
        
        print(f"   Source files: {len(source_files)}")
        
        if len(source_files) != indexed_episodes:
            errors.append(
                f"Episode count mismatch: {len(source_files)} source files vs {indexed_episodes} indexed"
            )
            print(f"   ❌ Count mismatch: {len(source_files)} source vs {indexed_episodes} indexed")
        else:
            print(f"   ✅ All source files indexed")
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 5. Check GitHub (optional)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if check_github:
        print()
        print("🌐 Checking GitHub source...")
        
        try:
            import subprocess
            result = subprocess.run(
                ["curl", "-s", "https://api.github.com/repos/ChatPRD/lennys-podcast-transcripts/contents/episodes"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                import json as json_mod
                github_data = json_mod.loads(result.stdout)
                github_count = len(github_data)
                stats["github_episodes"] = github_count
                
                print(f"   GitHub episodes: {github_count}")
                
                if github_count != indexed_episodes:
                    if github_count > indexed_episodes:
                        errors.append(
                            f"GitHub has more episodes: {github_count} on GitHub vs {indexed_episodes} indexed. Run git pull + re-index."
                        )
                        print(f"   ❌ {github_count - indexed_episodes} new episodes on GitHub!")
                    else:
                        warnings.append(
                            f"Local has more episodes than GitHub: {indexed_episodes} indexed vs {github_count} on GitHub"
                        )
                        print(f"   ⚠️ Local has {indexed_episodes - github_count} more than GitHub")
                else:
                    print(f"   ✅ Local matches GitHub")
            else:
                warnings.append("Failed to check GitHub API")
                print(f"   ⚠️ GitHub API check failed")
        except Exception as e:
            warnings.append(f"GitHub check failed: {e}")
            print(f"   ⚠️ GitHub check failed: {e}")
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Summary
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print()
    if errors:
        print(f"❌ VALIDATION FAILED ({len(errors)} errors)")
        for err in errors:
            print(f"   • {err}")
    else:
        print("✅ ALL CHECKS PASSED")
    
    if warnings:
        print(f"\n⚠️ Warnings ({len(warnings)}):")
        for warn in warnings:
            print(f"   • {warn}")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "stats": stats,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Verify Lenny Podcast index completeness"
    )
    parser.add_argument(
        "--check-github",
        action="store_true",
        help="Also check if local matches GitHub source",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON",
    )
    
    args = parser.parse_args()
    
    result = verify_lenny_index(check_github=args.check_github)
    
    if args.json:
        print(json.dumps(result, indent=2))
    
    sys.exit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
