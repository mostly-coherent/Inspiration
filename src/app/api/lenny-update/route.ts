import { NextResponse } from "next/server";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

// 3 minutes timeout for downloading 280MB from GitHub
export const maxDuration = 180;

// Detect cloud environment
function isCloudEnvironment(): boolean {
  return !!(
    process.env.VERCEL || 
    process.env.RAILWAY_ENVIRONMENT || 
    process.env.RENDER ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}

interface LennyUpdateResponse {
  success: boolean;
  action: "updated" | "already_latest" | "error" | "cloud_mode";
  message: string;
  oldEpisodes?: number;
  newEpisodes?: number;
  error?: string;
}

export async function POST(): Promise<NextResponse<LennyUpdateResponse>> {
  try {
    // Fast path: Cloud environment
    if (isCloudEnvironment()) {
      return NextResponse.json({
        success: false,
        action: "cloud_mode",
        message: "Cannot update embeddings from cloud. Run locally to update.",
      });
    }

    const dataDir = path.resolve(process.cwd(), "data");
    const embeddingsPath = path.join(dataDir, "lenny_embeddings.npz");
    const metadataPath = path.join(dataDir, "lenny_metadata.json");
    
    // Check current version
    let oldEpisodeCount = 0;
    if (fs.existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
        oldEpisodeCount = metadata.stats?.total_episodes || 0;
      } catch {
        // If metadata is corrupted, we'll re-download anyway
      }
    }

    // Delete existing files
    if (fs.existsSync(embeddingsPath)) {
      fs.unlinkSync(embeddingsPath);
    }
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }

    // Run download script
    const scriptsDir = path.resolve(process.cwd(), "scripts");
    const downloadScript = path.join(scriptsDir, "download-lenny-embeddings.sh");

    if (!fs.existsSync(downloadScript)) {
      return NextResponse.json({
        success: false,
        action: "error",
        message: "Download script not found",
        error: "scripts/download-lenny-embeddings.sh missing",
      }, { status: 500 });
    }

    try {
      // Run the download script
      execSync(`bash "${downloadScript}"`, {
        cwd: process.cwd(),
        encoding: "utf-8",
        timeout: 180000, // 3 minute timeout
        stdio: "pipe",
      });

      // Check if download succeeded
      if (!fs.existsSync(embeddingsPath) || !fs.existsSync(metadataPath)) {
        return NextResponse.json({
          success: false,
          action: "error",
          message: "Download failed. Files not created.",
          error: "Embeddings or metadata file missing after download",
        }, { status: 500 });
      }

      // Get new episode count
      let newEpisodeCount = 0;
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
        newEpisodeCount = metadata.stats?.total_episodes || 0;
      } catch {
        // Continue even if we can't read new metadata
      }

      return NextResponse.json({
        success: true,
        action: "updated",
        message: `Updated to ${newEpisodeCount} episodes`,
        oldEpisodes: oldEpisodeCount,
        newEpisodes: newEpisodeCount,
      });

    } catch (downloadError: any) {
      console.error("Download script error:", downloadError);
      
      // Check for specific error cases
      if (downloadError.message?.includes("timeout") || downloadError.signal === "SIGTERM") {
        return NextResponse.json({
          success: false,
          action: "error",
          message: "Download timed out. Check your internet connection.",
          error: "Download operation timed out",
        }, { status: 500 });
      }
      
      return NextResponse.json({
        success: false,
        action: "error",
        message: "Download failed. See logs for details.",
        error: downloadError.message || "Download script failed",
      }, { status: 500 });
    }

  } catch (error) {
    console.error("Lenny update error:", error);
    return NextResponse.json({
      success: false,
      action: "error",
      message: "Update failed. Check logs for details.",
      error: String(error),
    }, { status: 500 });
  }
}

// GET: Check if update is available
export async function GET(): Promise<NextResponse> {
  try {
    const dataDir = path.resolve(process.cwd(), "data");
    const metadataPath = path.join(dataDir, "lenny_metadata.json");

    if (!fs.existsSync(metadataPath)) {
      return NextResponse.json({
        updateAvailable: false,
        reason: "No embeddings installed",
      });
    }

    // Read current version
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
      const currentEpisodes = metadata.stats?.total_episodes || 0;

      // For now, we assume GitHub Release always has the latest
      // In future, could check GitHub API for release metadata
      return NextResponse.json({
        updateAvailable: true, // Always suggest checking
        currentEpisodes,
        message: "Check GitHub Release for latest version",
      });
    } catch {
      // Corrupted metadata file
      return NextResponse.json({
        updateAvailable: false,
        error: "Failed to read metadata file",
      });
    }

  } catch (error) {
    return NextResponse.json({
      updateAvailable: false,
      error: String(error),
    });
  }
}
