import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";

const execAsync = promisify(exec);

export const maxDuration = 300; // 5 minutes for large download

interface DownloadResponse {
  success: boolean;
  message: string;
  error?: string;
  cloudMode?: boolean;
  source?: "supabase" | "github" | "local";
}

// Detect cloud environment (Vercel, Railway, etc.)
function isCloudEnvironment(): boolean {
  return !!(
    process.env.VERCEL || 
    process.env.RAILWAY_ENVIRONMENT || 
    process.env.RENDER ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}

// Check if Supabase is configured
function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

/**
 * Download from Supabase Storage (Primary - Recommended)
 */
async function downloadFromSupabaseStorage(): Promise<{ success: boolean; message: string; error?: string }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return { success: false, message: "Supabase not configured", error: "SUPABASE_URL and SUPABASE_ANON_KEY required" };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const bucket = "lenny-embeddings";
  const tmpDir = "/tmp/lenny-embeddings";

  try {
    // Create /tmp directory
    await fs.promises.mkdir(tmpDir, { recursive: true });

    // Check if files exist in Supabase Storage
    const { data: files, error: listError } = await supabase.storage.from(bucket).list();
    
    if (listError) {
      return { success: false, message: "Failed to check Supabase Storage", error: listError.message };
    }

    const hasEmbeddings = files?.some(f => f.name === "lenny_embeddings.npz");
    const hasMetadata = files?.some(f => f.name === "lenny_metadata.json");

    if (!hasEmbeddings || !hasMetadata) {
      return { 
        success: false, 
        message: "Embeddings not found in Supabase Storage", 
        error: "Please upload embeddings to Supabase Storage bucket 'lenny-embeddings' first. See LENNY_CLOUD_IMPLEMENTATION.md" 
      };
    }

    // Download embeddings file
    const { data: embeddingsData, error: embeddingsError } = await supabase.storage
      .from(bucket)
      .download("lenny_embeddings.npz");

    if (embeddingsError) {
      return { success: false, message: "Failed to download embeddings", error: embeddingsError.message };
    }

    const embeddingsBuffer = Buffer.from(await embeddingsData.arrayBuffer());
    await fs.promises.writeFile(path.join(tmpDir, "lenny_embeddings.npz"), embeddingsBuffer);

    // Download metadata file
    const { data: metadataData, error: metadataError } = await supabase.storage
      .from(bucket)
      .download("lenny_metadata.json");

    if (metadataError) {
      return { success: false, message: "Failed to download metadata", error: metadataError.message };
    }

    const metadataBuffer = Buffer.from(await metadataData.arrayBuffer());
    await fs.promises.writeFile(path.join(tmpDir, "lenny_metadata.json"), metadataBuffer);

    return { success: true, message: "Downloaded from Supabase Storage. Embeddings ready for use." };
  } catch (error: any) {
    return { success: false, message: "Supabase download failed", error: error.message || String(error) };
  }
}

/**
 * Download from GitHub Releases (Fallback)
 */
async function downloadFromGitHubReleases(): Promise<{ success: boolean; message: string; error?: string }> {
  const GITHUB_RELEASE_URL = "https://github.com/mostly-coherent/Inspiration/releases/download/v1.0.0-lenny";
  const tmpDir = "/tmp/lenny-embeddings";

  try {
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const embeddingsPath = path.join(tmpDir, "lenny_embeddings.npz");
    const metadataPath = path.join(tmpDir, "lenny_metadata.json");

    // Check if already downloaded
    if (fs.existsSync(embeddingsPath) && fs.existsSync(metadataPath)) {
      return { success: true, message: "Embeddings already downloaded from GitHub (cached in /tmp)" };
    }

    // Download embeddings
    console.log("[Lenny Download] Downloading embeddings from GitHub Releases...");
    const embeddingsResponse = await fetch(`${GITHUB_RELEASE_URL}/lenny_embeddings.npz`);
    if (!embeddingsResponse.ok) {
      return { success: false, message: "Failed to download embeddings from GitHub", error: `HTTP ${embeddingsResponse.status}` };
    }
    const embeddingsBuffer = Buffer.from(await embeddingsResponse.arrayBuffer());
    await fs.promises.writeFile(embeddingsPath, embeddingsBuffer);

    // Download metadata
    console.log("[Lenny Download] Downloading metadata from GitHub Releases...");
    const metadataResponse = await fetch(`${GITHUB_RELEASE_URL}/lenny_metadata.json`);
    if (!metadataResponse.ok) {
      return { success: false, message: "Failed to download metadata from GitHub", error: `HTTP ${metadataResponse.status}` };
    }
    const metadataBuffer = Buffer.from(await metadataResponse.arrayBuffer());
    await fs.promises.writeFile(metadataPath, metadataBuffer);

    return { success: true, message: "Downloaded from GitHub Releases. Embeddings ready for use." };
  } catch (error: any) {
    return { success: false, message: "GitHub download failed", error: error.message || String(error) };
  }
}

/**
 * POST /api/lenny-download
 * 
 * Downloads Lenny embeddings with fallback strategy:
 * 1. Supabase Storage (Primary - Recommended for cloud deployments)
 * 2. GitHub Releases (Fallback - For users without Supabase)
 * 3. Local filesystem (Local development only)
 * 
 * Idempotent: skips if files already exist.
 */
export async function POST(): Promise<NextResponse<DownloadResponse>> {
  try {
    const isCloud = isCloudEnvironment();
    const hasSupabase = isSupabaseConfigured();

    // Cloud environment: Try Supabase first, then GitHub fallback
    if (isCloud) {
      // Primary: Try Supabase Storage
      if (hasSupabase) {
        const result = await downloadFromSupabaseStorage();
        if (result.success) {
          return NextResponse.json({ ...result, source: "supabase", cloudMode: true });
        }
        // If Supabase fails, fall through to GitHub
        console.warn("[Lenny Download] Supabase download failed, falling back to GitHub:", result.error);
      }

      // Fallback: Download from GitHub Releases to /tmp
      const result = await downloadFromGitHubReleases();
      return NextResponse.json({ 
        ...result, 
        source: "github", 
        cloudMode: true,
        ...(hasSupabase ? { error: "Supabase Storage not available, using GitHub fallback. Consider uploading to Supabase for faster downloads." } : {})
      });
    }

    // Local environment: Use local filesystem (existing logic)
    const dataDir = path.resolve(process.cwd(), "data");
    const embeddingsPath = path.join(dataDir, "lenny_embeddings.npz");
    const metadataPath = path.join(dataDir, "lenny_metadata.json");
    const scriptPath = path.resolve(process.cwd(), "scripts", "download-lenny-embeddings.sh");

    // Check if already downloaded
    if (fs.existsSync(embeddingsPath) && fs.existsSync(metadataPath)) {
      return NextResponse.json({
        success: true,
        message: "Embeddings already exist. Skipping download.",
      });
    }

    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json(
        {
          success: false,
          message: "Download script not found",
          error: `Script not found at: ${scriptPath}`,
        },
        { status: 404 }
      );
    }

    // Check if script is executable
    try {
      await execAsync(`chmod +x "${scriptPath}"`);
    } catch {
      // Ignore chmod errors (may already be executable)
    }

    // Run download script
    try {
      const { stdout, stderr } = await execAsync(`"${scriptPath}"`, {
        cwd: process.cwd(),
        timeout: 300000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for output
      });

      // Check for error messages in stderr (script may exit 0 but have warnings)
      if (stderr && stderr.includes("❌")) {
        console.error("Download script reported errors:", stderr);
        return NextResponse.json(
          {
            success: false,
            message: "Download failed",
            error: stderr.split("❌")[1]?.trim() || "Script reported errors",
          },
          { status: 500 }
        );
      }

      // Verify download succeeded
      if (fs.existsSync(embeddingsPath) && fs.existsSync(metadataPath)) {
        return NextResponse.json({
          success: true,
          message: "Download complete. Embeddings ready for use.",
          source: "local",
        });
      } else {
        return NextResponse.json(
          {
            success: false,
            message: "Download completed but files not found",
            error: stderr || stdout || "Files missing after download",
          },
          { status: 500 }
        );
      }
    } catch (execError: any) {
      // execAsync throws if exit code !== 0
      console.error("Download script execution failed:", execError);
      return NextResponse.json(
        {
          success: false,
          message: "Download script failed",
          error: execError.stderr || execError.message || "Script execution failed",
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Lenny download API error:", error);
    
    // Handle timeout
    if (error.code === "ETIMEDOUT" || error.signal === "SIGTERM") {
      return NextResponse.json(
        {
          success: false,
          message: "Download timed out",
          error: "Download took too long. Please try again or download manually.",
        },
        { status: 408 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Download failed",
        error: error.message || String(error),
      },
      { status: 500 }
    );
  }
}
