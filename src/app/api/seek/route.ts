import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { logger } from "@/lib/logger";

export const maxDuration = 300; // 5 minutes for semantic search (embedding generation can take time)

export interface SeekRequest {
  query: string;
  daysBack?: number;
  topK?: number;
  minSimilarity?: number;
  workspaces?: string[];
}

export interface SeekResult {
  success: boolean;
  query: string;
  content?: string; // Synthesized use cases (markdown)
  items?: Array<{
    title: string;
    what?: string;
    how?: string;
    context?: string;
    similarity?: string;
    takeaways?: string;
  }>; // Parsed use case items
  stats: {
    conversationsAnalyzed: number;
    daysSearched: number;
    useCasesFound: number;
  };
  outputFile?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SeekRequest = await request.json();
    const { query, daysBack = 90, topK = 10, minSimilarity = 0.0, workspaces } = body;
    
    // Note: 90-day limit removed in v1 - Vector DB enables unlimited date ranges
    
    // Get abort signal from request
    const signal = request.signal;

    if (!query || !query.trim()) {
      return NextResponse.json(
        { success: false, error: "Query is required" },
        { status: 400 }
      );
    }
    
    // No 90-day limit - Vector DB enables unlimited ranges
    const effectiveDaysBack = daysBack;

    // Build command arguments (always use --json for structured output)
    const args: string[] = [
      "--query", query,
      "--days", effectiveDaysBack.toString(),
      "--top-k", topK.toString(),
      "--min-similarity", minSimilarity.toString(),
      "--json", // Always JSON for API
    ];

    if (workspaces && workspaces.length > 0) {
      for (const workspace of workspaces) {
        args.push("--workspace", workspace);
      }
    }

    // Get engine path
    const enginePath = path.resolve(process.cwd(), "engine");
    const scriptPath = path.join(enginePath, "seek.py");

    logger.log(`[Inspiration] Running: python3 seek.py ${args.join(" ")}`);
    logger.log(`[Inspiration] Working directory: ${enginePath}`);

    // Execute Python script with abort signal support
    const result = await runPythonScript(enginePath, scriptPath, args, signal);

    // Check for script errors
    if (result.exitCode !== 0) {
      logger.error(`[Inspiration] Script error (exit ${result.exitCode}):`, result.stderr);
      
      // Try to extract error message from JSON output if available
      let errorMessage = result.stderr.slice(0, 500);
      try {
        const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const output = JSON.parse(jsonMatch[0]) as SeekResult;
          if (output.error) {
            errorMessage = output.error;
          }
        }
      } catch {
        // Use stderr if JSON parsing fails
      }
      
      return NextResponse.json(
        {
          success: false,
          query,
          stats: {
            conversationsAnalyzed: 0,
            daysSearched: effectiveDaysBack,
            useCasesFound: 0,
          },
          error: `Script failed: ${errorMessage}`,
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
      const output = JSON.parse(jsonMatch[0]) as {
        query: string;
        content?: string;
        items?: Array<{
          title: string;
          what?: string;
          how?: string;
          context?: string;
          similarity?: string;
          takeaways?: string;
        }>;
        stats: {
          conversationsAnalyzed: number;
          daysSearched: number;
          useCasesFound: number;
        };
        outputFile?: string;
        error?: string;
      };
      
      const seekResult: SeekResult = {
        success: !output.error,
        query: output.query,
        content: output.content,
        items: output.items,
        stats: output.stats,
        outputFile: output.outputFile,
        error: output.error,
      };
      
      return NextResponse.json(seekResult);
    } catch (parseError) {
      logger.error("[Inspiration] Failed to parse JSON output:", result.stdout);
      return NextResponse.json(
        {
          success: false,
          query,
          stats: {
            conversationsAnalyzed: 0,
            daysSearched: effectiveDaysBack,
            useCasesFound: 0,
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
          stats: {
            conversationsAnalyzed: 0,
            daysSearched: 0,
            useCasesFound: 0,
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

