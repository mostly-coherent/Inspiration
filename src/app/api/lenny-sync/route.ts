import { NextResponse } from "next/server";
import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { getPythonPath } from "@/lib/pythonPath";

// 2 minutes timeout: sufficient for git clone (first time) or git pull + incremental indexing
// Typical: Clone ~30-60s, Pull ~5s, Indexing 2-3 new episodes ~30-60s API time
export const maxDuration = 120;

// Detect cloud environment
function isCloudEnvironment(): boolean {
  return !!(
    process.env.VERCEL || 
    process.env.RAILWAY_ENVIRONMENT || 
    process.env.RENDER ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}

interface LennySyncResponse {
  success: boolean;
  action: "up_to_date" | "pulled" | "indexed" | "cloned" | "error" | "cloud_mode";
  message: string;
  newEpisodes?: number;
  error?: string;
}

export async function POST(): Promise<NextResponse<LennySyncResponse>> {
  try {
    // Fast path: Cloud environment
    if (isCloudEnvironment()) {
      return NextResponse.json({
        success: false,
        action: "cloud_mode",
        message: "Cannot sync Lenny archive from cloud. Run locally to sync.",
      });
    }

    const dataDir = path.resolve(process.cwd(), "data");
    const lennyRepoPath = path.join(dataDir, "lenny-transcripts");
    const repoUrl = "https://github.com/ChatPRD/lennys-podcast-transcripts.git";

    // Step 0: Auto-clone if repo doesn't exist
    let wasCloned = false;
    if (!fs.existsSync(lennyRepoPath)) {
      try {
        console.log("Lenny repo not found. Auto-cloning...");
        
        // Ensure data directory exists
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }

        // Clone the repository
        execSync(`git clone ${repoUrl} lenny-transcripts`, {
          cwd: dataDir,
          encoding: "utf-8",
          timeout: 120000, // 2 minute timeout for clone
          stdio: "pipe", // Suppress output for cleaner logs
        });

        console.log("✅ Lenny repo cloned successfully");
        wasCloned = true;
        
        // Proceed to pull/index (fresh clone should be up-to-date, but we'll verify)
      } catch (cloneError: any) {
        console.error("Failed to clone Lenny repo:", cloneError);
        
        // Clean up partial clone if it exists
        if (fs.existsSync(lennyRepoPath)) {
          try {
            const gitDir = path.join(lennyRepoPath, ".git");
            if (!fs.existsSync(gitDir)) {
              // Partial clone - remove it
              console.log("Cleaning up partial clone...");
              fs.rmSync(lennyRepoPath, { recursive: true, force: true });
            }
          } catch (cleanupError) {
            console.error("Failed to clean up partial clone:", cleanupError);
          }
        }
        
        // Check for specific error cases
        if (cloneError.message?.includes("timeout") || cloneError.signal === "SIGTERM") {
          return NextResponse.json({
            success: false,
            action: "error",
            message: "Clone timed out. Check your internet connection and try again.",
            error: "Clone operation timed out",
          });
        }
        
        if (cloneError.message?.includes("command not found") || cloneError.code === "ENOENT") {
          return NextResponse.json({
            success: false,
            action: "error",
            message: "Git is not installed. Please install Git to sync Lenny archive.",
            error: "Git command not found",
          });
        }

        return NextResponse.json({
          success: false,
          action: "error",
          message: "Failed to clone Lenny archive. Check network connection and Git installation.",
          error: cloneError.message || "Clone failed",
        });
      }
    }

    // Verify it's a valid git repository
    const gitDir = path.join(lennyRepoPath, ".git");
    if (!fs.existsSync(gitDir)) {
      return NextResponse.json({
        success: false,
        action: "error",
        message: "Lenny archive directory exists but is not a git repository.",
        error: "Invalid repository structure",
      });
    }

    // Step 1: Git pull
    let pullOutput = "";
    try {
      pullOutput = execSync("git pull origin main", {
        cwd: lennyRepoPath,
        encoding: "utf-8",
        timeout: 30000, // 30 second timeout
      });
    } catch (gitError) {
      // Try without specifying branch
      console.error("Git pull with 'origin main' failed, trying without branch:", gitError);
      try {
        pullOutput = execSync("git pull", {
          cwd: lennyRepoPath,
          encoding: "utf-8",
          timeout: 30000,
        });
      } catch (gitError2) {
        console.error("Git pull failed:", gitError2);
        return NextResponse.json({
          success: false,
          action: "error",
          message: "Git pull failed. Check repository access and network connection.",
          error: "Git pull command failed",
        });
      }
    }

    // Check if already up to date
    if (pullOutput.includes("Already up to date")) {
      // If we just cloned, indicate that
      if (wasCloned) {
        return NextResponse.json({
          success: true,
          action: "cloned",
          message: "Repository cloned successfully. Archive is up to date.",
        });
      }
      return NextResponse.json({
        success: true,
        action: "up_to_date",
        message: "Lenny archive is up to date",
      });
    }

    // Step 2: Check if indexer needs to run
    // Parse git output to count new files
    const filesChanged = pullOutput.match(/(\d+)\s+files?\s+changed/);
    const insertions = pullOutput.match(/(\d+)\s+insertions?/);
    
    // If files were changed, we need to re-index
    if (filesChanged || insertions || pullOutput.includes("Updating") || pullOutput.includes("Fast-forward")) {
      // Run indexer in background
      const enginePath = path.resolve(process.cwd(), "engine");
      const pythonPath = getPythonPath();

      return new Promise<NextResponse<LennySyncResponse>>((resolve) => {
        const indexProcess = spawn(pythonPath, [
          "scripts/index_lenny_local.py",
          "--batch-size", "100"
        ], {
          cwd: enginePath,
          env: { ...process.env, PYTHONUNBUFFERED: "1" },
        });

        let stdout = "";
        let stderr = "";
        let resolved = false; // Prevent double resolution
        let timeout: NodeJS.Timeout | null = null;

        // Cleanup function to ensure process and timeout are cleaned up
        const cleanup = () => {
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
          if (!indexProcess.killed) {
            indexProcess.kill();
          }
        };

        indexProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        indexProcess.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        // Timeout after 90 seconds (sufficient for 2-3 new episodes/week)
        // Typical weekly sync: ~150-300 chunks = ~30-60 seconds API time
        timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve(NextResponse.json({
              success: true,
              action: "pulled",
              message: "New episodes pulled. Indexing is running in background.",
            }));
          }
        }, 90000);

        indexProcess.on("close", (code) => {
          if (resolved) return; // Already resolved by timeout
          resolved = true;
          cleanup();

          if (code !== 0) {
            console.error("Lenny indexing failed:", stderr);
            resolve(NextResponse.json({
              success: false,
              action: "error",
              message: "Indexing failed after pull",
              error: "Indexing process exited with error. Check logs for details.",
            }));
            return;
          }

          // Parse output for episode count
          const episodeMatch = stdout.match(/Episodes:\s+(\d+)/);
          const newEpisodes = episodeMatch ? parseInt(episodeMatch[1]) : 0;

          resolve(NextResponse.json({
            success: true,
            action: "indexed",
            message: `Synced and indexed ${newEpisodes} episodes`,
            newEpisodes,
          }));
        });

        // Handle process errors
        indexProcess.on("error", (error) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            console.error("Lenny indexing process error:", error);
            resolve(NextResponse.json({
              success: false,
              action: "error",
              message: "Failed to start indexing process",
              error: error.message || "Process spawn failed",
            }));
          }
        });
      });
    }

    return NextResponse.json({
      success: true,
      action: "pulled",
      message: "Pulled updates, checking for new episodes...",
    });

  } catch (error) {
    console.error("Lenny sync error:", error);
    return NextResponse.json({
      success: false,
      action: "error",
      message: "Sync failed. Check logs for details.",
      error: "Internal sync error",
    }, { status: 500 });
  }
}

// GET: Quick status check
export async function GET(): Promise<NextResponse> {
  try {
    const dataDir = path.resolve(process.cwd(), "data");
    const lennyRepoPath = path.join(dataDir, "lenny-transcripts");

    if (!fs.existsSync(lennyRepoPath)) {
      return NextResponse.json({
        available: false,
        reason: "Repository not cloned",
      });
    }

    // Check if git repo
    const gitDir = path.join(lennyRepoPath, ".git");
    if (!fs.existsSync(gitDir)) {
      return NextResponse.json({
        available: false,
        reason: "Not a git repository",
      });
    }

    // Get last commit date
    try {
      const lastCommit = execSync("git log -1 --format=%ci", {
        cwd: lennyRepoPath,
        encoding: "utf-8",
      }).trim();

      return NextResponse.json({
        available: true,
        lastCommit,
        repoPath: lennyRepoPath,
      });
    } catch {
      return NextResponse.json({
        available: true,
        lastCommit: null,
        repoPath: lennyRepoPath,
      });
    }

  } catch (error) {
    return NextResponse.json({
      available: false,
      error: String(error),
    });
  }
}
