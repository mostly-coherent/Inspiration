import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";

const execAsync = promisify(exec);

export const maxDuration = 300; // 5 minutes for large download

interface DownloadResponse {
  success: boolean;
  message: string;
  error?: string;
  cloudMode?: boolean;
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

/**
 * POST /api/lenny-download
 * 
 * Triggers download of Lenny embeddings from GitHub Releases.
 * Idempotent: skips if files already exist.
 * 
 * NOTE: Lenny embeddings (~250MB) are NOT available on Vercel/cloud deployments:
 * - Vercel has read-only filesystem (except /tmp)
 * - Serverless functions have 50MB limit (embeddings are 250MB)
 * - Files would be lost on next deployment (ephemeral storage)
 * 
 * Solution: Run locally to download embeddings, or use Supabase Storage for cloud deployments.
 */
export async function POST(): Promise<NextResponse<DownloadResponse>> {
  try {
    // Cloud environment: Cannot download embeddings
    if (isCloudEnvironment()) {
      return NextResponse.json({
        success: false,
        cloudMode: true,
        message: "Lenny embeddings are not available on cloud deployments",
        error: "Vercel/serverless environments have read-only filesystems and 50MB function limits. Lenny embeddings (~250MB) must be downloaded locally. Run 'npm run dev' locally to download embeddings, or use Supabase Storage for cloud deployments.",
      }, { status: 400 });
    }
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
