#!/bin/bash
# Download pre-computed Lenny's Podcast embeddings from GitHub Releases
# This runs automatically on first app start if embeddings are missing

set -euo pipefail  # Exit on error, undefined vars, pipe failures

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../data"
EMBEDDINGS_FILE="$DATA_DIR/lenny_embeddings.npz"
METADATA_FILE="$DATA_DIR/lenny_metadata.json"

# GitHub Release URL (update version as needed)
RELEASE_VERSION="v1.0.0-lenny"
REPO="mostly-coherent/Inspiration"
BASE_URL="https://github.com/$REPO/releases/download/$RELEASE_VERSION"

echo "🎙️ Lenny's Podcast Embeddings Downloader"
echo "========================================="

# Check if already downloaded
if [ -f "$EMBEDDINGS_FILE" ] && [ -f "$METADATA_FILE" ]; then
    echo "✅ Embeddings already exist. Skipping download."
    echo "   - $EMBEDDINGS_FILE ($(du -h "$EMBEDDINGS_FILE" 2>/dev/null | cut -f1 || echo 'unknown'))"
    echo "   - $METADATA_FILE ($(du -h "$METADATA_FILE" 2>/dev/null | cut -f1 || echo 'unknown'))"
    exit 0
fi

echo ""
echo "📥 Downloading pre-computed embeddings (~250MB total)..."
echo "   This is a one-time download for zero-setup Lenny integration."
echo ""

# Create data directory if needed
mkdir -p "$DATA_DIR"

# Check if curl is available
if ! command -v curl >/dev/null 2>&1; then
    echo "❌ curl is not installed. Please install curl to download embeddings."
    echo "   macOS: curl is pre-installed"
    echo "   Linux: sudo apt-get install curl (Debian/Ubuntu) or sudo yum install curl (RHEL/CentOS)"
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
        echo "   Check your internet connection and try again."
        rm -f "$output_file"  # Clean up partial download
        return 1
    fi
    
    # Verify file exists and has reasonable size (> 1MB)
    if [ ! -f "$output_file" ] || [ "$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null || echo 0)" -lt 1048576 ]; then
        echo "❌ Downloaded file is too small or missing: $output_file"
        rm -f "$output_file"
        return 1
    fi
    
    echo "✅ Downloaded: $output_file ($(du -h "$output_file" 2>/dev/null | cut -f1 || echo 'unknown'))"
    return 0
}

# Download embeddings file
if [ ! -f "$EMBEDDINGS_FILE" ]; then
    if ! download_file "$BASE_URL/lenny_embeddings.npz" "$EMBEDDINGS_FILE" "lenny_embeddings.npz" "219"; then
        echo ""
        echo "❌ Download failed. Please try again later."
        exit 1
    fi
else
    echo "✅ Embeddings file already exists"
fi

# Download metadata file
if [ ! -f "$METADATA_FILE" ]; then
    if ! download_file "$BASE_URL/lenny_metadata.json" "$METADATA_FILE" "lenny_metadata.json" "28"; then
        echo ""
        echo "❌ Download failed. Please try again later."
        # Clean up partial embeddings if metadata failed
        rm -f "$EMBEDDINGS_FILE"
        exit 1
    fi
else
    echo "✅ Metadata file already exists"
fi

# Verify both files exist
if [ ! -f "$EMBEDDINGS_FILE" ] || [ ! -f "$METADATA_FILE" ]; then
    echo ""
    echo "❌ Download incomplete. Missing required files."
    exit 1
fi

echo ""
echo "🎉 Download complete!"
echo "   269 expert episodes ready for semantic search"
echo "   44,371 searchable transcript segments"
echo ""
