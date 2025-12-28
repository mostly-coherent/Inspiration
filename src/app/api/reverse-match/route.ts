import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { logger } from "@/lib/logger";

export const maxDuration = 120; // 2 minutes for semantic search

export interface ReverseMatchRequest {
  query: string;
  daysBack?: number;
  topK?: number;
  minSimilarity?: number;
  workspaces?: string[];
}

export interface ReverseMatchResult {
  success: boolean;
  query: string;
  matches: Array<{
    message: {
      type: "user" | "assistant";
      text: string;
      timestamp: number;
      workspace?: string;
      chat_id?: string;
      chat_type?: "composer" | "chat";
    };
    similarity: number;
    context: {
      before: Array<{
        type: "user" | "assistant";
        text: string;
        timestamp: number;
      }>;
      after: Array<{
        type: "user" | "assistant";
        text: string;
        timestamp: number;
      }>;
    };
  }>;
  stats: {
    totalMessages: number;
    matchesFound: number;
    daysSearched: number;
    startDate?: string;
    endDate?: string;
    conversationsExamined?: number;
  };
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ReverseMatchRequest = await request.json();
    const { query, daysBack = 90, topK = 10, minSimilarity = 0.0, workspaces } = body;
    
    // Maximum days allowed (90 days retention policy)
    const MAX_DAYS = 90;
    
    // Get abort signal from request
    const signal = request.signal;

    if (!query || !query.trim()) {
      return NextResponse.json(
        { success: false, error: "Query is required" },
        { status: 400 }
      );
    }
    
    // Validate: enforce 90-day maximum
    if (daysBack > MAX_DAYS) {
      return NextResponse.json(
        {
          success: false,
          query,
          matches: [],
          stats: {
            totalMessages: 0,
            matchesFound: 0,
            daysSearched: daysBack,
            conversationsExamined: 0,
          },
          error: `Days back (${daysBack}) exceeds maximum of ${MAX_DAYS} days. Please select ${MAX_DAYS} days or fewer.`,
        },
        { status: 400 }
      );
    }
    
    // Clamp daysBack to maximum if somehow it exceeds
    const effectiveDaysBack = Math.min(daysBack, MAX_DAYS);

    // Build command arguments
    const args: string[] = [
      "--query", query,
      "--days", effectiveDaysBack.toString(),
      "--top-k", topK.toString(),
      "--min-similarity", minSimilarity.toString(),
      "--json",
    ];

    if (workspaces && workspaces.length > 0) {
      for (const workspace of workspaces) {
        args.push("--workspace", workspace);
      }
    }

    // Get engine path
    const enginePath = path.resolve(process.cwd(), "engine");
    const scriptPath = path.join(enginePath, "reverse_match.py");

    logger.log(`[Inspiration] Running: python3 reverse_match.py ${args.join(" ")}`);
    logger.log(`[Inspiration] Working directory: ${enginePath}`);

    // Execute Python script with abort signal support
    const result = await runPythonScript(enginePath, scriptPath, args, signal);

    // Check for script errors
    if (result.exitCode !== 0) {
      logger.error(`[Inspiration] Script error (exit ${result.exitCode}):`, result.stderr);
      return NextResponse.json(
        {
          success: false,
          query,
          matches: [],
          stats: {
            totalMessages: 0,
            matchesFound: 0,
            daysSearched: effectiveDaysBack,
            conversationsExamined: 0,
          },
          error: `Script failed: ${result.stderr.slice(0, 500)}`,
        },
        { status: 500 }
      );
    }

    // Parse JSON output
    try {
      // Find JSON in stdout (may have stderr messages before it)
      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in script output");
      }
      const output = JSON.parse(jsonMatch[0]) as ReverseMatchResult;
      output.success = true;
      return NextResponse.json(output);
    } catch (parseError) {
      logger.error("[Inspiration] Failed to parse JSON output:", result.stdout);
      return NextResponse.json(
        {
          success: false,
          query,
          matches: [],
          stats: {
            totalMessages: 0,
            matchesFound: 0,
            daysSearched: effectiveDaysBack,
            conversationsExamined: 0,
          },
          error: `Failed to parse script output: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error("[Inspiration] Error:", error);
    return NextResponse.json(
      {
        success: false,
        query: "",
        matches: [],
        stats: {
          totalMessages: 0,
          matchesFound: 0,
          daysSearched: 0,
        },
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runPythonScript(
  cwd: string,
  script: string,
  args: string[],
  signal?: AbortSignal
): Promise<ScriptResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [script, ...args], {
      cwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
    });

    let stdout = "";
    let stderr = "";
    let isAborted = false;

    // Handle abort signal
    if (signal) {
      signal.addEventListener("abort", () => {
        isAborted = true;
        logger.log("[Inspiration] Request aborted, killing Python process...");
        try {
          proc.kill("SIGTERM");
          // Force kill after 2 seconds if still running
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill("SIGKILL");
            }
          }, 2000);
        } catch (err) {
          logger.error("[Inspiration] Error killing process:", err);
        }
        resolve({
          stdout,
          stderr,
          exitCode: 130, // SIGTERM exit code
        });
      });
    }

    proc.stdout.on("data", (data) => {
      if (!isAborted) {
        stdout += data.toString();
        logger.log(`[stdout] ${data.toString().trim()}`);
      }
    });

    proc.stderr.on("data", (data) => {
      if (!isAborted) {
        stderr += data.toString();
        logger.error(`[stderr] ${data.toString().trim()}`);
      }
    });

    proc.on("close", (code) => {
      if (!isAborted) {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      }
    });

    proc.on("error", (err) => {
      if (!isAborted) {
        reject(err);
      }
    });
  });
}

