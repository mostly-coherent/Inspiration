#!/bin/bash
# Verify Lenny embeddings from GitHub Releases vs Supabase Storage
# Compares file sizes and checksums to ensure they're identical

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."
TMP_DIR="/tmp/lenny-verification-$$"
GITHUB_URL="https://github.com/mostly-coherent/Inspiration/releases/download/v1.0.0-lenny"

mkdir -p "$TMP_DIR"
trap "rm -rf $TMP_DIR" EXIT

echo "🔍 Verifying Lenny Embeddings Sources"
echo "======================================"
echo ""

# Check if Supabase is configured
if [ -f "$PROJECT_DIR/.env.local" ]; then
    source "$PROJECT_DIR/.env.local"
fi

SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_ANON_KEY:-}}"

# Function to calculate checksum
checksum() {
    local file="$1"
    if [ -f "$file" ]; then
        shasum -a 256 "$file" | cut -d' ' -f1
    else
        echo "FILE_NOT_FOUND"
    fi
}

# Function to get file size
file_size() {
    local file="$1"
    if [ -f "$file" ]; then
        stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# Function to format bytes
format_bytes() {
    local bytes="$1"
    if [ "$bytes" -gt 1073741824 ]; then
        echo "$(echo "scale=2; $bytes/1073741824" | bc)GB"
    elif [ "$bytes" -gt 1048576 ]; then
        echo "$(echo "scale=2; $bytes/1048576" | bc)MB"
    elif [ "$bytes" -gt 1024 ]; then
        echo "$(echo "scale=2; $bytes/1024" | bc)KB"
    else
        echo "${bytes}B"
    fi
}

echo "📥 Step 1: Downloading from GitHub Releases..."
echo ""

# Download embeddings from GitHub
GITHUB_EMBEDDINGS="$TMP_DIR/github_embeddings.npz"
if curl -L -f -s "$GITHUB_URL/lenny_embeddings.npz" -o "$GITHUB_EMBEDDINGS" 2>/dev/null; then
    GITHUB_EMBEDDINGS_SIZE=$(file_size "$GITHUB_EMBEDDINGS")
    GITHUB_EMBEDDINGS_CHECKSUM=$(checksum "$GITHUB_EMBEDDINGS")
    echo "✅ GitHub embeddings: $(format_bytes $GITHUB_EMBEDDINGS_SIZE)"
    echo "   SHA256: ${GITHUB_EMBEDDINGS_CHECKSUM:0:16}..."
else
    echo "❌ Failed to download embeddings from GitHub"
    exit 1
fi

# Download metadata from GitHub
GITHUB_METADATA="$TMP_DIR/github_metadata.json"
if curl -L -f -s "$GITHUB_URL/lenny_metadata.json" -o "$GITHUB_METADATA" 2>/dev/null; then
    GITHUB_METADATA_SIZE=$(file_size "$GITHUB_METADATA")
    GITHUB_METADATA_CHECKSUM=$(checksum "$GITHUB_METADATA")
    echo "✅ GitHub metadata: $(format_bytes $GITHUB_METADATA_SIZE)"
    echo "   SHA256: ${GITHUB_METADATA_CHECKSUM:0:16}..."
else
    echo "❌ Failed to download metadata from GitHub"
    exit 1
fi

echo ""
echo "📥 Step 2: Checking Supabase Storage..."
echo ""

# Check Supabase Storage
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
    echo "⚠️  Supabase not configured (SUPABASE_URL or SUPABASE_KEY missing)"
    echo "   Skipping Supabase verification"
    echo ""
    echo "📊 Summary:"
    echo "   GitHub Releases: ✅ Available"
    echo "   Supabase Storage: ⚠️  Not configured"
    echo ""
    echo "💡 To verify Supabase Storage, ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    echo "   are set in .env.local"
    exit 0
fi

# Use Node.js to check Supabase Storage (since we have the API route logic)
SUPABASE_CHECK=$(node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bucket = 'lenny-embeddings';

(async () => {
  try {
    const { data: files, error } = await supabase.storage.from(bucket).list();
    if (error) {
      console.log('ERROR:', error.message);
      process.exit(1);
    }
    const hasEmbeddings = files?.some(f => f.name === 'lenny_embeddings.npz');
    const hasMetadata = files?.some(f => f.name === 'lenny_metadata.json');
    if (hasEmbeddings && hasMetadata) {
      console.log('FOUND');
    } else {
      console.log('NOT_FOUND');
    }
  } catch (e) {
    console.log('ERROR:', e.message);
    process.exit(1);
  }
})();
" 2>&1)

if echo "$SUPABASE_CHECK" | grep -q "ERROR"; then
    echo "❌ Supabase Storage check failed:"
    echo "   $(echo "$SUPABASE_CHECK" | grep ERROR | cut -d: -f2-)"
    echo ""
    echo "📊 Summary:"
    echo "   GitHub Releases: ✅ Available"
    echo "   Supabase Storage: ❌ Error accessing"
    exit 0
elif echo "$SUPABASE_CHECK" | grep -q "NOT_FOUND"; then
    echo "⚠️  Files not found in Supabase Storage bucket 'lenny-embeddings'"
    echo ""
    echo "📊 Summary:"
    echo "   GitHub Releases: ✅ Available"
    echo "   Supabase Storage: ⚠️  Files not uploaded"
    echo ""
    echo "💡 To upload files to Supabase Storage:"
    echo "   1. Create bucket 'lenny-embeddings' (public)"
    echo "   2. Upload lenny_embeddings.npz and lenny_metadata.json"
    echo "   3. See ARCHITECTURE.md for setup instructions"
    exit 0
fi

echo "✅ Files found in Supabase Storage"
echo ""

# Download from Supabase using Node.js
echo "📥 Step 3: Downloading from Supabase Storage..."
echo ""

SUPABASE_DOWNLOAD=$(node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bucket = 'lenny-embeddings';
const tmpDir = '$TMP_DIR';

(async () => {
  try {
    // Download embeddings
    const { data: embeddingsData, error: embError } = await supabase.storage
      .from(bucket)
      .download('lenny_embeddings.npz');
    
    if (embError) {
      console.log('EMB_ERROR:', embError.message);
      process.exit(1);
    }
    
    const embeddingsBuffer = Buffer.from(await embeddingsData.arrayBuffer());
    fs.writeFileSync(path.join(tmpDir, 'supabase_embeddings.npz'), embeddingsBuffer);
    
    // Download metadata
    const { data: metadataData, error: metaError } = await supabase.storage
      .from(bucket)
      .download('lenny_metadata.json');
    
    if (metaError) {
      console.log('META_ERROR:', metaError.message);
      process.exit(1);
    }
    
    const metadataBuffer = Buffer.from(await metadataData.arrayBuffer());
    fs.writeFileSync(path.join(tmpDir, 'supabase_metadata.json'), metadataBuffer);
    
    console.log('SUCCESS');
  } catch (e) {
    console.log('ERROR:', e.message);
    process.exit(1);
  }
})();
" 2>&1)

if echo "$SUPABASE_DOWNLOAD" | grep -q "ERROR"; then
    echo "❌ Failed to download from Supabase:"
    echo "   $(echo "$SUPABASE_DOWNLOAD" | grep ERROR | cut -d: -f2-)"
    exit 1
fi

SUPABASE_EMBEDDINGS="$TMP_DIR/supabase_embeddings.npz"
SUPABASE_METADATA="$TMP_DIR/supabase_metadata.json"

if [ ! -f "$SUPABASE_EMBEDDINGS" ] || [ ! -f "$SUPABASE_METADATA" ]; then
    echo "❌ Supabase download incomplete"
    exit 1
fi

SUPABASE_EMBEDDINGS_SIZE=$(file_size "$SUPABASE_EMBEDDINGS")
SUPABASE_EMBEDDINGS_CHECKSUM=$(checksum "$SUPABASE_EMBEDDINGS")
SUPABASE_METADATA_SIZE=$(file_size "$SUPABASE_METADATA")
SUPABASE_METADATA_CHECKSUM=$(checksum "$SUPABASE_METADATA")

echo "✅ Supabase embeddings: $(format_bytes $SUPABASE_EMBEDDINGS_SIZE)"
echo "   SHA256: ${SUPABASE_EMBEDDINGS_CHECKSUM:0:16}..."
echo "✅ Supabase metadata: $(format_bytes $SUPABASE_METADATA_SIZE)"
echo "   SHA256: ${SUPABASE_METADATA_CHECKSUM:0:16}..."

echo ""
echo "🔍 Step 4: Comparing files..."
echo ""

# Compare embeddings
if [ "$GITHUB_EMBEDDINGS_CHECKSUM" = "$SUPABASE_EMBEDDINGS_CHECKSUM" ]; then
    echo "✅ Embeddings: IDENTICAL (SHA256 match)"
else
    echo "❌ Embeddings: DIFFERENT"
    echo "   GitHub:   ${GITHUB_EMBEDDINGS_CHECKSUM:0:16}..."
    echo "   Supabase: ${SUPABASE_EMBEDDINGS_CHECKSUM:0:16}..."
fi

# Compare metadata
if [ "$GITHUB_METADATA_CHECKSUM" = "$SUPABASE_METADATA_CHECKSUM" ]; then
    echo "✅ Metadata: IDENTICAL (SHA256 match)"
else
    echo "❌ Metadata: DIFFERENT"
    echo "   GitHub:   ${GITHUB_METADATA_CHECKSUM:0:16}..."
    echo "   Supabase: ${SUPABASE_METADATA_CHECKSUM:0:16}..."
fi

# Compare sizes
if [ "$GITHUB_EMBEDDINGS_SIZE" = "$SUPABASE_EMBEDDINGS_SIZE" ]; then
    echo "✅ Embeddings size: MATCH ($(format_bytes $GITHUB_EMBEDDINGS_SIZE))"
else
    echo "⚠️  Embeddings size: MISMATCH"
    echo "   GitHub:   $(format_bytes $GITHUB_EMBEDDINGS_SIZE)"
    echo "   Supabase: $(format_bytes $SUPABASE_EMBEDDINGS_SIZE)"
fi

if [ "$GITHUB_METADATA_SIZE" = "$SUPABASE_METADATA_SIZE" ]; then
    echo "✅ Metadata size: MATCH ($(format_bytes $GITHUB_METADATA_SIZE))"
else
    echo "⚠️  Metadata size: MISMATCH"
    echo "   GitHub:   $(format_bytes $GITHUB_METADATA_SIZE)"
    echo "   Supabase: $(format_bytes $SUPABASE_METADATA_SIZE)"
fi

echo ""
echo "📊 Final Summary:"
echo "=================="

if [ "$GITHUB_EMBEDDINGS_CHECKSUM" = "$SUPABASE_EMBEDDINGS_CHECKSUM" ] && \
   [ "$GITHUB_METADATA_CHECKSUM" = "$SUPABASE_METADATA_CHECKSUM" ]; then
    echo "✅ VERIFIED: Files are IDENTICAL between GitHub Releases and Supabase Storage"
    exit 0
else
    echo "❌ WARNING: Files DIFFER between sources"
    echo ""
    echo "💡 Recommendation:"
    echo "   - Re-upload files from GitHub Releases to Supabase Storage"
    echo "   - Ensure you're uploading the exact files from the GitHub release"
    exit 1
fi
