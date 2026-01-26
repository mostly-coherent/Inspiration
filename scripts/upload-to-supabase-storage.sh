#!/bin/bash
# Upload Lenny embeddings to Supabase Storage for cloud deployments
# This script uses Supabase CLI to upload files

set -e

echo "🚀 Uploading Lenny embeddings to Supabase Storage..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found"
    echo ""
    echo "Install with: npm install -g supabase"
    echo "Or manually upload via Supabase Dashboard:"
    echo "  1. Go to Storage → lenny-embeddings bucket"
    echo "  2. Upload data/lenny_embeddings.npz (~250MB)"
    echo "  3. Upload data/lenny_metadata.json (~32MB)"
    exit 1
fi

# Check if bucket exists (requires supabase link)
echo "📦 Checking Supabase connection..."

# Check if files exist locally
if [ ! -f "data/lenny_embeddings.npz" ]; then
    echo "❌ File not found: data/lenny_embeddings.npz"
    echo "Run: scripts/download-lenny-embeddings.sh first"
    exit 1
fi

if [ ! -f "data/lenny_metadata.json" ]; then
    echo "❌ File not found: data/lenny_metadata.json"
    echo "Run: scripts/download-lenny-embeddings.sh first"
    exit 1
fi

echo "✅ Local files found"
echo "   - lenny_embeddings.npz: $(du -h data/lenny_embeddings.npz | cut -f1)"
echo "   - lenny_metadata.json: $(du -h data/lenny_metadata.json | cut -f1)"
echo ""

# Upload embeddings
echo "📤 Uploading lenny_embeddings.npz..."
supabase storage upload lenny-embeddings lenny_embeddings.npz --from data/lenny_embeddings.npz

# Upload metadata
echo "📤 Uploading lenny_metadata.json..."
supabase storage upload lenny-embeddings lenny_metadata.json --from data/lenny_metadata.json

echo ""
echo "✅ Upload complete!"
echo ""
echo "Next steps:"
echo "  1. Verify files in Supabase Dashboard: Storage → lenny-embeddings"
echo "  2. Check Vercel environment variables have:"
echo "     - SUPABASE_URL"
echo "     - SUPABASE_ANON_KEY"
echo "  3. Deploy to Vercel or wait for next deployment"
echo "  4. Visit cloud app and click '🔄 Sync' button"
