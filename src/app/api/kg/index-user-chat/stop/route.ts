import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

/**
 * POST /api/kg/index-user-chat/stop
 *
 * Stops a running indexing job.
 *
 * Request body:
 * {
 *   jobId?: string  // Optional: specific job ID, otherwise stops any running job
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   message: string
 * }
 */

const PROGRESS_FILE = join(process.cwd(), "data", "kg_indexing_progress.json");
const PROCESS_FILE = join(process.cwd(), "data", "kg_indexing_process.json");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { jobId } = body;

    // Get process info
    if (!existsSync(PROCESS_FILE)) {
      return NextResponse.json({
        success: false,
        error: "No indexing job is currently running.",
      });
    }

    const processInfoContent = await readFile(PROCESS_FILE, "utf-8");
    const processInfo: { jobId: string; pid: number } = JSON.parse(processInfoContent);

    // Check if jobId matches (if provided)
    if (jobId && processInfo.jobId !== jobId) {
      return NextResponse.json({
        success: false,
        error: "Job ID doesn't match the running job.",
      });
    }

    // Kill the process
    try {
      // Use platform-specific kill command
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const platform = process.platform;
      if (platform === "win32") {
        await execAsync(`taskkill /PID ${processInfo.pid} /F`);
      } else {
        await execAsync(`kill -TERM ${processInfo.pid}`);
      }
    } catch (killError) {
      // Process might already be dead, continue anyway
      console.warn("Failed to kill process:", killError);
    }

    // Update progress status
    if (existsSync(PROGRESS_FILE)) {
      const progressContent = await readFile(PROGRESS_FILE, "utf-8");
      const allProgress: Record<string, any> = JSON.parse(progressContent);
      
      if (allProgress[processInfo.jobId]) {
        allProgress[processInfo.jobId].status = "stopped";
        allProgress[processInfo.jobId].endTime = Date.now();
        allProgress[processInfo.jobId].error = "Indexing stopped by user.";
        
        await writeFile(PROGRESS_FILE, JSON.stringify(allProgress, null, 2));
      }
    }

    // Clean up process info
    if (existsSync(PROCESS_FILE)) {
      await unlink(PROCESS_FILE);
    }

    return NextResponse.json({
      success: true,
      message: "Indexing stopped successfully.",
    });
  } catch (error) {
    console.error("Error stopping indexing:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
