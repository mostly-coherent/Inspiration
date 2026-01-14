#!/bin/bash
# Download pre-computed Lenny's Podcast embeddings from GitHub Releases
# This runs automatically on first app start if embeddings are missing

set -e

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
    echo "   - $EMBEDDINGS_FILE ($(du -h "$EMBEDDINGS_FILE" | cut -f1))"
    echo "   - $METADATA_FILE ($(du -h "$METADATA_FILE" | cut -f1))"
    exit 0
fi

echo ""
echo "📥 Downloading pre-computed embeddings (~250MB total)..."
echo "   This is a one-time download for zero-setup Lenny integration."
echo ""

# Create data directory if needed
mkdir -p "$DATA_DIR"

# Download embeddings file
if [ ! -f "$EMBEDDINGS_FILE" ]; then
    echo "⏬ Downloading lenny_embeddings.npz (219MB)..."
    curl -L --progress-bar "$BASE_URL/lenny_embeddings.npz" -o "$EMBEDDINGS_FILE"
    echo "✅ Downloaded: $EMBEDDINGS_FILE"
else
    echo "✅ Embeddings file already exists"
fi

# Download metadata file
if [ ! -f "$METADATA_FILE" ]; then
    echo "⏬ Downloading lenny_metadata.json (28MB)..."
    curl -L --progress-bar "$BASE_URL/lenny_metadata.json" -o "$METADATA_FILE"
    echo "✅ Downloaded: $METADATA_FILE"
else
    echo "✅ Metadata file already exists"
fi

echo ""
echo "🎉 Download complete!"
echo "   269 expert episodes ready for semantic search"
echo "   44,371 searchable transcript segments"
echo ""
