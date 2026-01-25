#!/usr/bin/env node
/**
 * Verify Lenny embeddings from GitHub Releases vs Supabase Storage
 * Compares file sizes and SHA256 checksums to ensure they're identical
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const GITHUB_URL = 'https://github.com/mostly-coherent/Inspiration/releases/download/v1.0.0-lenny';
const TMP_DIR = '/tmp/lenny-verification-' + Date.now();

// Ensure tmp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// Cleanup on exit
process.on('exit', () => {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

function checksum(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

function fileSize(filePath) {
  return fs.statSync(filePath).size;
}

function formatBytes(bytes) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + 'GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + 'MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + 'KB';
  return bytes + 'B';
}

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    const request = https.get(url, (response) => {
      // Follow redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        fs.unlinkSync(outputPath);
        return downloadFile(response.headers.location, outputPath)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        fs.unlinkSync(outputPath);
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });
    
    request.on('error', (err) => {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(err);
    });
  });
}

async function main() {
  console.log('🔍 Verifying Lenny Embeddings Sources');
  console.log('======================================\n');

  // Step 1: Download from GitHub Releases
  console.log('📥 Step 1: Downloading from GitHub Releases...\n');

  const githubEmbeddingsPath = path.join(TMP_DIR, 'github_embeddings.npz');
  const githubMetadataPath = path.join(TMP_DIR, 'github_metadata.json');

  try {
    await downloadFile(`${GITHUB_URL}/lenny_embeddings.npz`, githubEmbeddingsPath);
    const githubEmbeddingsSize = fileSize(githubEmbeddingsPath);
    const githubEmbeddingsChecksum = checksum(githubEmbeddingsPath);
    console.log(`✅ GitHub embeddings: ${formatBytes(githubEmbeddingsSize)}`);
    console.log(`   SHA256: ${githubEmbeddingsChecksum.substring(0, 16)}...\n`);

    await downloadFile(`${GITHUB_URL}/lenny_metadata.json`, githubMetadataPath);
    const githubMetadataSize = fileSize(githubMetadataPath);
    const githubMetadataChecksum = checksum(githubMetadataPath);
    console.log(`✅ GitHub metadata: ${formatBytes(githubMetadataSize)}`);
    console.log(`   SHA256: ${githubMetadataChecksum.substring(0, 16)}...\n`);
  } catch (error) {
    console.error('❌ Failed to download from GitHub:', error.message);
    process.exit(1);
  }

  // Step 2: Check Supabase Storage
  console.log('📥 Step 2: Checking Supabase Storage...\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('⚠️  Supabase not configured (SUPABASE_URL or SUPABASE_KEY missing)');
    console.log('   Skipping Supabase verification\n');
    console.log('📊 Summary:');
    console.log('   GitHub Releases: ✅ Available');
    console.log('   Supabase Storage: ⚠️  Not configured\n');
    console.log('💡 To verify Supabase Storage, ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    console.log('   are set in environment variables or .env.local');
    process.exit(0);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const bucket = 'lenny-embeddings';

  // Check if files exist
  let filesExist = false;
  try {
    const { data: files, error } = await supabase.storage.from(bucket).list();
    if (error) {
      console.error('❌ Supabase Storage check failed:', error.message);
      console.log('\n📊 Summary:');
      console.log('   GitHub Releases: ✅ Available');
      console.log('   Supabase Storage: ❌ Error accessing');
      process.exit(0);
    }

    const hasEmbeddings = files?.some(f => f.name === 'lenny_embeddings.npz');
    const hasMetadata = files?.some(f => f.name === 'lenny_metadata.json');

    if (!hasEmbeddings || !hasMetadata) {
      console.log('⚠️  Files not found in Supabase Storage bucket "lenny-embeddings"\n');
      console.log('📊 Summary:');
      console.log('   GitHub Releases: ✅ Available');
      console.log('   Supabase Storage: ⚠️  Files not uploaded\n');
      console.log('💡 To upload files to Supabase Storage:');
      console.log('   1. Create bucket "lenny-embeddings" (public)');
      console.log('   2. Upload lenny_embeddings.npz and lenny_metadata.json');
      console.log('   3. See ARCHITECTURE.md for setup instructions');
      process.exit(0);
    }

    filesExist = true;
    console.log('✅ Files found in Supabase Storage\n');
  } catch (error) {
    console.error('❌ Error checking Supabase Storage:', error.message);
    process.exit(1);
  }

  // Step 3: Download from Supabase
  if (filesExist) {
    console.log('📥 Step 3: Downloading from Supabase Storage...\n');

    const supabaseEmbeddingsPath = path.join(TMP_DIR, 'supabase_embeddings.npz');
    const supabaseMetadataPath = path.join(TMP_DIR, 'supabase_metadata.json');

    try {
      // Download embeddings
      const { data: embeddingsData, error: embError } = await supabase.storage
        .from(bucket)
        .download('lenny_embeddings.npz');

      if (embError) {
        throw new Error(`Embeddings download failed: ${embError.message}`);
      }

      const embeddingsBuffer = Buffer.from(await embeddingsData.arrayBuffer());
      fs.writeFileSync(supabaseEmbeddingsPath, embeddingsBuffer);

      const supabaseEmbeddingsSize = fileSize(supabaseEmbeddingsPath);
      const supabaseEmbeddingsChecksum = checksum(supabaseEmbeddingsPath);
      console.log(`✅ Supabase embeddings: ${formatBytes(supabaseEmbeddingsSize)}`);
      console.log(`   SHA256: ${supabaseEmbeddingsChecksum.substring(0, 16)}...\n`);

      // Download metadata
      const { data: metadataData, error: metaError } = await supabase.storage
        .from(bucket)
        .download('lenny_metadata.json');

      if (metaError) {
        throw new Error(`Metadata download failed: ${metaError.message}`);
      }

      const metadataBuffer = Buffer.from(await metadataData.arrayBuffer());
      fs.writeFileSync(supabaseMetadataPath, metadataBuffer);

      const supabaseMetadataSize = fileSize(supabaseMetadataPath);
      const supabaseMetadataChecksum = checksum(supabaseMetadataPath);
      console.log(`✅ Supabase metadata: ${formatBytes(supabaseMetadataSize)}`);
      console.log(`   SHA256: ${supabaseMetadataChecksum.substring(0, 16)}...\n`);

      // Step 4: Compare
      console.log('🔍 Step 4: Comparing files...\n');

      const embeddingsMatch = githubEmbeddingsChecksum === supabaseEmbeddingsChecksum;
      const metadataMatch = githubMetadataChecksum === supabaseMetadataChecksum;
      const embeddingsSizeMatch = githubEmbeddingsSize === supabaseEmbeddingsSize;
      const metadataSizeMatch = githubMetadataSize === supabaseMetadataSize;

      if (embeddingsMatch) {
        console.log('✅ Embeddings: IDENTICAL (SHA256 match)');
      } else {
        console.log('❌ Embeddings: DIFFERENT');
        console.log(`   GitHub:   ${githubEmbeddingsChecksum.substring(0, 16)}...`);
        console.log(`   Supabase: ${supabaseEmbeddingsChecksum.substring(0, 16)}...`);
      }

      if (metadataMatch) {
        console.log('✅ Metadata: IDENTICAL (SHA256 match)');
      } else {
        console.log('❌ Metadata: DIFFERENT');
        console.log(`   GitHub:   ${githubMetadataChecksum.substring(0, 16)}...`);
        console.log(`   Supabase: ${supabaseMetadataChecksum.substring(0, 16)}...`);
      }

      if (embeddingsSizeMatch) {
        console.log(`✅ Embeddings size: MATCH (${formatBytes(githubEmbeddingsSize)})`);
      } else {
        console.log('⚠️  Embeddings size: MISMATCH');
        console.log(`   GitHub:   ${formatBytes(githubEmbeddingsSize)}`);
        console.log(`   Supabase: ${formatBytes(supabaseEmbeddingsSize)}`);
      }

      if (metadataSizeMatch) {
        console.log(`✅ Metadata size: MATCH (${formatBytes(githubMetadataSize)})`);
      } else {
        console.log('⚠️  Metadata size: MISMATCH');
        console.log(`   GitHub:   ${formatBytes(githubMetadataSize)}`);
        console.log(`   Supabase: ${formatBytes(supabaseMetadataSize)}`);
      }

      console.log('\n📊 Final Summary:');
      console.log('==================');

      if (embeddingsMatch && metadataMatch) {
        console.log('✅ VERIFIED: Files are IDENTICAL between GitHub Releases and Supabase Storage');
        process.exit(0);
      } else {
        console.log('❌ WARNING: Files DIFFER between sources\n');
        console.log('💡 Recommendation:');
        console.log('   - Re-upload files from GitHub Releases to Supabase Storage');
        console.log('   - Ensure you\'re uploading the exact files from the GitHub release');
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Failed to download from Supabase:', error.message);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
