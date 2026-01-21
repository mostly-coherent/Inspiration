#!/bin/bash
# Download Lenny's Knowledge Graph data from GitHub Releases
# This runs automatically when user clicks "Import Lenny's KG" in the app

set -euo pipefail  # Exit on error, undefined vars, pipe failures

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../data/lenny-kg"
MANIFEST_FILE="$DATA_DIR/lenny_kg_manifest.json"

# GitHub Release URL (update version as needed)
RELEASE_VERSION="v1.0.0-lenny-kg"
REPO="mostly-coherent/Inspiration"
BASE_URL="https://github.com/$REPO/releases/download/$RELEASE_VERSION"

echo "🔮 Lenny's Knowledge Graph Downloader"
echo "======================================"

# Create data directory
mkdir -p "$DATA_DIR"

# Check if already downloaded
if [ -f "$MANIFEST_FILE" ]; then
    echo "✅ KG data already downloaded. Skipping download."
    echo "   To re-download, delete: $DATA_DIR"
    exit 0
fi

echo ""
echo "📥 Downloading Lenny's Knowledge Graph (~50-100MB)..."
echo "   This includes entities, mentions, and relations extracted from 300+ episodes."
echo ""

# Check if curl is available
if ! command -v curl >/dev/null 2>&1; then
    echo "❌ curl is not installed. Please install curl to download KG data."
    exit 1
fi

# Download function with error handling
download_file() {
    local url="$1"
    local output_file="$2"
    local file_name="$3"
    local expected_size_mb="$4"
    
    echo "⏬ Downloading $file_name (${expected_size_mb}MB)..."
    
    if ! curl -L --progress-bar --fail --max-time 600 "$url" -o "$output_file"; then
        echo "❌ Failed to download $file_name"
        echo "   URL: $url"
        rm -f "$output_file"  # Clean up partial download
        return 1
    fi
    
    # Verify file exists and has reasonable size (> 1KB)
    if [ ! -f "$output_file" ] || [ "$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null || echo 0)" -lt 1024 ]; then
        echo "❌ Downloaded file is too small or missing: $output_file"
        rm -f "$output_file"
        return 1
    fi
    
    echo "✅ Downloaded: $file_name ($(du -h "$output_file" 2>/dev/null | cut -f1 || echo 'unknown'))"
    return 0
}

# Download required files
REQUIRED_FILES=(
    "lenny_kg_manifest.json:1"
    "lenny_kg_entities.json:20"
    "lenny_kg_mentions.json:30"
    "lenny_kg_relations.json:10"
)

for file_spec in "${REQUIRED_FILES[@]}"; do
    IFS=':' read -r file_name expected_size <<< "$file_spec"
    output_file="$DATA_DIR/$file_name"
    
    if [ ! -f "$output_file" ]; then
        if ! download_file "$BASE_URL/$file_name" "$output_file" "$file_name" "$expected_size"; then
            echo ""
            echo "❌ Download failed. Please try again later."
            exit 1
        fi
    else
        echo "✅ $file_name already exists"
    fi
done

# Download optional conversations file (if available)
CONVERSATIONS_FILE="$DATA_DIR/lenny_kg_conversations.json"
if [ ! -f "$CONVERSATIONS_FILE" ]; then
    if curl -L --progress-bar --fail --max-time 600 "$BASE_URL/lenny_kg_conversations.json" -o "$CONVERSATIONS_FILE" 2>/dev/null; then
        echo "✅ Downloaded optional: lenny_kg_conversations.json"
    else
        echo "ℹ️  Optional file not available: lenny_kg_conversations.json (skipping)"
        rm -f "$CONVERSATIONS_FILE"
    fi
fi

# Verify manifest exists
if [ ! -f "$MANIFEST_FILE" ]; then
    echo ""
    echo "❌ Download incomplete. Missing manifest file."
    exit 1
fi

echo ""
echo "🎉 Download complete!"
echo "   KG data ready for import into your Supabase instance."
echo "   Run: python3 engine/scripts/import_lenny_kg.py --data-dir $DATA_DIR"
echo ""
