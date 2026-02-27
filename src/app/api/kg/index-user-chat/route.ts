import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { writeFile, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

/**
 * POST /api/kg/index-user-chat
 *
 * Triggers user chat KG indexing process.
 *
 * Request body:
 * {
 *   withRelations?: boolean,    // Extract relations (default: true)
 *   withDecisions?: boolean,    // Extract decisions (default: true)
 *   workers?: number,           // Number of parallel workers (default: 4)
 *   dryRun?: boolean            // Dry run mode (default: false)
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   jobId: string,
 *   message: string
 * }
 */

const PROGRESS_FILE = join(process.cwd(), "data", "kg_indexing_progress.json");
const PROCESS_FILE = join(process.cwd(), "data", "kg_indexing_process.json"); // Store process PID for stop/pause

interface IndexingProgress {
  jobId: string;
  status: "running" | "completed" | "failed" | "stopped" | "paused";
  startTime: number;
  endTime?: number;
  totalConversations: number;
  processedConversations: number;
  entitiesCreated: number;
  entitiesDeduplicated: number;
  relationsCreated: number;
  decisionsCreated: number;
  errors: number;
  skipped: number;
  error?: string;
  phase?: string;
  pid?: number; // Process ID for stop/pause
}

interface ProcessInfo {
  jobId: string;
  pid: number;
}

async function ensureProgressDir() {
  const { mkdir } = await import("fs/promises");
  const progressDir = join(process.cwd(), "data");
  if (!existsSync(progressDir)) {
    await mkdir(progressDir, { recursive: true });
  }
}

async function saveProgress(progress: IndexingProgress) {
  try {
    await ensureProgressDir();
    let allProgress: Record<string, IndexingProgress> = {};
    if (existsSync(PROGRESS_FILE)) {
      const content = await readFile(PROGRESS_FILE, "utf-8");
      allProgress = JSON.parse(content);
    }
    allProgress[progress.jobId] = progress;
    await writeFile(PROGRESS_FILE, JSON.stringify(allProgress, null, 2));
  } catch (error) {
    console.error("Failed to save progress:", error);
  }
}

async function saveProcessInfo(jobId: string, pid: number) {
  try {
    await ensureProgressDir();
    const processInfo: ProcessInfo = { jobId, pid };
    await writeFile(PROCESS_FILE, JSON.stringify(processInfo, null, 2));
  } catch (error) {
    console.error("Failed to save process info:", error);
  }
}

async function getProcessInfo(): Promise<ProcessInfo | null> {
  try {
    if (!existsSync(PROCESS_FILE)) {
      return null;
    }
    const content = await readFile(PROCESS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function parseProgressLine(line: string, progress: IndexingProgress): void {
  // Parse structured progress markers from Python script
  // Format: [PROGRESS:current=8,total=10]
  const progressMatch = line.match(/\[PROGRESS:current=(\d+),total=(\d+)\]/);
  if (progressMatch) {
    progress.processedConversations = parseInt(progressMatch[1], 10);
    progress.totalConversations = parseInt(progressMatch[2], 10);
    progress.phase = "indexing";
    return;
  }

  // Format: [STAT:key=entitiesCreated,value=42]
  const statMatch = line.match(/\[STAT:key=(\w+),value=(\d+)\]/);
  if (statMatch) {
    const key = statMatch[1];
    const value = parseInt(statMatch[2], 10);
    if (key === "entitiesCreated") progress.entitiesCreated = value;
    else if (key === "entitiesDeduplicated") progress.entitiesDeduplicated = value;
    else if (key === "relationsCreated") progress.relationsCreated = value;
    else if (key === "decisionsExtracted") progress.decisionsCreated = value;
    else if (key === "errors") progress.errors = value;
    else if (key === "skipped") progress.skipped = value;
    return;
  }

  // Format: [PHASE:name=extracting,message=Extracting entities...]
  const phaseMatch = line.match(/\[PHASE:name=(\w+),message=(.+?)\]/);
  if (phaseMatch) {
    progress.phase = phaseMatch[1];
    return;
  }

  // Fallback: Parse unstructured progress messages
  if (line.includes("Processing") && line.includes("conversations")) {
    const match = line.match(/(\d+)\s+conversations/);
    if (match) {
      progress.totalConversations = parseInt(match[1], 10);
      progress.phase = "indexing";
    }
  }

  if (line.includes("Progress:") && line.includes("/")) {
    const match = line.match(/Progress:\s*(\d+)\/(\d+)/);
    if (match) {
      progress.processedConversations = parseInt(match[1], 10);
      progress.totalConversations = parseInt(match[2], 10);
      progress.phase = "indexing";
    }
  }

  // Parse entity stats
  if (line.includes("Entities:")) {
    const entitiesMatch = line.match(/(\d+)\s+new,\s*(\d+)\s+deduplicated/);
    if (entitiesMatch) {
      progress.entitiesCreated = parseInt(entitiesMatch[1], 10);
      progress.entitiesDeduplicated = parseInt(entitiesMatch[2], 10);
    }
  }

  // Parse relation stats
  if (line.includes("Relations:")) {
    const relationsMatch = line.match(/Relations:\s*(\d+)/);
    if (relationsMatch) {
      progress.relationsCreated = parseInt(relationsMatch[1], 10);
    }
  }

  // Parse decision stats
  if (line.includes("Decisions:")) {
    const decisionsMatch = line.match(/Decisions:\s*(\d+)/);
    if (decisionsMatch) {
      progress.decisionsCreated = parseInt(decisionsMatch[1], 10);
    }
  }

  // Parse skipped count
  if (line.includes("Skipped:")) {
    const skippedMatch = line.match(/Skipped:\s*(\d+)/);
    if (skippedMatch) {
      progress.skipped = parseInt(skippedMatch[1], 10);
    }
  }
}

function translateErrorToLayman(error: string): string {
  const lowerError = error.toLowerCase();

  // API/Budget errors
  if (lowerError.includes("rate limit") || lowerError.includes("429")) {
    return "The AI service is temporarily busy. We'll automatically retry in a few seconds.";
  }
  if (lowerError.includes("quota") || lowerError.includes("budget") || lowerError.includes("insufficient")) {
    return "Your AI API budget has been exhausted. Please add more credits to your API account and try again.";
  }
  if (lowerError.includes("unauthorized") || lowerError.includes("401") || lowerError.includes("invalid api key")) {
    return "Your AI API key is invalid or expired. Please check your API key in Settings.";
  }

  // Network errors
  if (lowerError.includes("timeout") || lowerError.includes("timed out")) {
    return "The request took too long to complete. This might be due to slow internet or a busy AI service. We'll retry automatically.";
  }
  if (lowerError.includes("network") || lowerError.includes("connection") || lowerError.includes("econnrefused")) {
    return "Couldn't connect to the AI service. Please check your internet connection and try again.";
  }

  // Database errors
  if (lowerError.includes("database") || lowerError.includes("supabase") || lowerError.includes("postgres")) {
    return "There was a problem saving data to the database. Please try again in a moment.";
  }
  if (lowerError.includes("duplicate") || lowerError.includes("unique constraint")) {
    return "Some conversations were already indexed. This is normal—we'll skip them and continue.";
  }

  // File system errors
  if (lowerError.includes("file") || lowerError.includes("directory") || lowerError.includes("enoent")) {
    return "Couldn't find the chat history files. Please make sure Cursor or Claude Code is installed and has chat history.";
  }

  // Permission errors
  if (lowerError.includes("permission") || lowerError.includes("eacces") || lowerError.includes("access denied")) {
    return "Don't have permission to read chat history files. Please check file permissions.";
  }

  // Generic fallback
  if (lowerError.includes("error") || lowerError.includes("failed") || lowerError.includes("exception")) {
    return "Something went wrong during indexing. The error has been logged. Please try again or contact support if the problem persists.";
  }

  return error; // Return original if no match
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      withRelations = true,
      withDecisions = true,
      workers = 4,
      dryRun = false,
      incremental: _incremental = true, // Default to incremental; Python script handles skip logic
      daysBack = 90,
    } = body;

    // Check if indexing is already running
    await ensureProgressDir();
    if (existsSync(PROGRESS_FILE)) {
      const content = await readFile(PROGRESS_FILE, "utf-8");
      const allProgress: Record<string, IndexingProgress> = JSON.parse(content);
      const runningJob = Object.values(allProgress).find(
        (p) => p.status === "running"
      );
      if (runningJob) {
        return NextResponse.json(
          {
            success: false,
            error: "Indexing already in progress",
            jobId: runningJob.jobId,
          },
          { status: 409 }
        );
      }
    }

    // Generate job ID
    const jobId = `kg-index-${Date.now()}`;

    // Initialize progress
    const progress: IndexingProgress = {
      jobId,
      status: "running",
      startTime: Date.now(),
      totalConversations: 0,
      processedConversations: 0,
      entitiesCreated: 0,
      entitiesDeduplicated: 0,
      relationsCreated: 0,
      decisionsCreated: 0,
      errors: 0,
      skipped: 0,
      phase: "initializing",
    };
    await saveProgress(progress);

    // Spawn Python script
    const scriptPath = join(
      process.cwd(),
      "engine",
      "scripts",
      "index_user_kg_parallel.py"
    );

    const args: string[] = [];
    if (withRelations) args.push("--with-relations");
    if (withDecisions) args.push("--with-decisions");
    if (dryRun) args.push("--dry-run");
    args.push("--workers", workers.toString());
    args.push("--days-back", daysBack.toString());
    
    // Note: Incremental indexing is handled by the Python script itself
    // (checks kg_entity_mentions.message_id before processing)
    // The `incremental` flag is for future enhancement (timestamp-based filtering)

    const pythonProcess = spawn("python3", [scriptPath, ...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Save process ID for stop/pause functionality
    if (pythonProcess.pid) {
      progress.pid = pythonProcess.pid;
      await saveProcessInfo(jobId, pythonProcess.pid);
    }

    let stdout = "";
    let stderr = "";
    let lastSavedProgress = Date.now();

    pythonProcess.stdout?.on("data", (data) => {
      stdout += data.toString();
      const lines = stdout.split("\n");
      
      // Parse each line for progress markers
      for (const line of lines) {
        parseProgressLine(line, progress);
      }
      
      // Throttle progress saves (every 2 seconds)
      const now = Date.now();
      if (now - lastSavedProgress > 2000) {
        saveProgress(progress).catch((err) => {
          console.error("Failed to save progress in stdout handler:", err);
        });
        lastSavedProgress = now;
      }
    });

    pythonProcess.stderr?.on("data", (data) => {
      stderr += data.toString();
      // Count errors from stderr
      if (data.toString().includes("⚠️") || data.toString().includes("ERROR") || data.toString().includes("Failed")) {
        progress.errors += 1;
      }
    });

    pythonProcess.on("close", async (code) => {
      progress.status = code === 0 ? "completed" : "failed";
      progress.endTime = Date.now();
      if (code !== 0) {
        const errorMessage = stderr || stdout || "Process exited with non-zero code";
        progress.error = translateErrorToLayman(errorMessage);
      }
      await saveProgress(progress);
      
      // Clean up process info file
      try {
        if (existsSync(PROCESS_FILE)) {
          const processInfo = await getProcessInfo();
          if (processInfo?.jobId === jobId) {
            await import("fs/promises").then((fs) => fs.unlink(PROCESS_FILE));
          }
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    pythonProcess.on("error", async (error) => {
      progress.status = "failed";
      progress.endTime = Date.now();
      progress.error = translateErrorToLayman(error.message);
      await saveProgress(progress);
    });

    // Don't wait for process to complete (async execution)
    return NextResponse.json({
      success: true,
      jobId,
      message: "Indexing started",
    });
  } catch (error) {
    console.error("Error starting indexing:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
