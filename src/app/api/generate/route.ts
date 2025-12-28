import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import { GenerateRequest, GenerateResult, TOOL_CONFIG, PRESET_MODES, getToolPath } from "@/lib/types";
import { logger } from "@/lib/logger";

export const maxDuration = 300; // 5 minutes for long-running generation

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { tool, mode, days, bestOf, temperature, fromDate, toDate, dryRun } = body;
    
    // Get abort signal from request
    const signal = request.signal;

    // Get tool config
    const toolConfig = TOOL_CONFIG[tool];
    if (!toolConfig) {
      return NextResponse.json(
        { success: false, error: `Unknown tool: ${tool}` },
        { status: 400 }
      );
    }

    // Get mode config (for defaults)
    const modeConfig = PRESET_MODES.find((m) => m.id === mode);
    
    // Maximum days allowed (90 days retention policy)
    const MAX_DAYS = 90;
    
    // Build command arguments
    const args: string[] = [];
    
    if (mode !== "custom" && modeConfig) {
      // Use preset mode - presets are already validated (max 90 days)
      args.push(`--${mode}`);
    } else {
      // Custom mode - use explicit args
      // Note: insights.py only supports --days (last N days from today) or --date (single date)
      // For date ranges, we calculate the number of days and use --days
      let effectiveDays: number | undefined;
      
      if (fromDate && toDate) {
        // Calculate days between dates (inclusive)
        const from = new Date(fromDate);
        const to = new Date(toDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day
        from.setHours(0, 0, 0, 0);
        to.setHours(0, 0, 0, 0);
        
        // Validate: end date cannot be in the future
        if (to > today) {
          return NextResponse.json(
            {
              success: false,
              tool,
              mode,
              error: `End date cannot be in the future. Please select dates within the last ${MAX_DAYS} days.`,
              stats: { daysProcessed: 0, daysWithActivity: 0, daysWithOutput: 0, candidatesGenerated: 0 },
              timestamp: new Date().toISOString(),
            },
            { status: 400 }
          );
        }
        
        // Validate: start date must be before or equal to end date
        if (from > to) {
          return NextResponse.json(
            {
              success: false,
              tool,
              mode,
              error: `Start date must be before or equal to end date.`,
              stats: { daysProcessed: 0, daysWithActivity: 0, daysWithOutput: 0, candidatesGenerated: 0 },
              timestamp: new Date().toISOString(),
            },
            { status: 400 }
          );
        }
        
        // Calculate days from today to start date
        const daysFromTodayToStart = Math.ceil((today.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
        
        // Validate: start date must be within last 90 days
        if (daysFromTodayToStart >= MAX_DAYS) {
          return NextResponse.json(
            {
              success: false,
              tool,
              mode,
              error: `Start date is ${daysFromTodayToStart} days ago (more than ${MAX_DAYS} days). Please select dates within the last ${MAX_DAYS} days from today.`,
              stats: { daysProcessed: 0, daysWithActivity: 0, daysWithOutput: 0, candidatesGenerated: 0 },
              timestamp: new Date().toISOString(),
            },
            { status: 400 }
          );
        }
        
        // Calculate range span
        const diffTime = Math.abs(to.getTime() - from.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive
        
        // Validate: range span cannot exceed 90 days
        if (diffDays > MAX_DAYS) {
          return NextResponse.json(
            {
              success: false,
              tool,
              mode,
              error: `Date range spans ${diffDays} days (exceeds maximum of ${MAX_DAYS} days). Please select a range within ${MAX_DAYS} days.`,
              stats: { daysProcessed: 0, daysWithActivity: 0, daysWithOutput: 0, candidatesGenerated: 0 },
              timestamp: new Date().toISOString(),
            },
            { status: 400 }
          );
        }
        
        // Python --days means "last N days from today", so we need to calculate
        // how many days back to go to include the start date
        // Since we're searching backwards from today, we use daysFromTodayToStart + 1
        // (to include both start and end dates)
        effectiveDays = Math.min(daysFromTodayToStart + 1, MAX_DAYS);
      } else if (days) {
        // Validate: enforce 90-day maximum
        if (days > MAX_DAYS) {
          return NextResponse.json(
            {
              success: false,
              tool,
              mode,
              error: `Days value (${days}) exceeds maximum of ${MAX_DAYS} days. Please select ${MAX_DAYS} days or fewer.`,
              stats: { daysProcessed: 0, daysWithActivity: 0, daysWithOutput: 0, candidatesGenerated: 0 },
              timestamp: new Date().toISOString(),
            },
            { status: 400 }
          );
        }
        effectiveDays = days;
      }
      
      if (effectiveDays !== undefined) {
        args.push("--days", effectiveDays.toString());
      }
    }

    // Override with custom values if provided
    if (bestOf !== undefined) {
      args.push("--best-of", bestOf.toString());
    }
    if (temperature !== undefined) {
      args.push("--temperature", temperature.toString());
    }

    if (dryRun) {
      args.push("--dry-run");
    }

    // Get tool path dynamically
    const toolPath = getToolPath(tool);
    
    logger.log(`[Inspiration] Running: python3 ${toolConfig.script} ${args.join(" ")}`);
    logger.log(`[Inspiration] Working directory: ${toolPath}`);

    // Execute Python script with abort signal support
    const result = await runPythonScript(toolPath, toolConfig.script, args, signal);

    // Check for script errors
    if (result.exitCode !== 0 && result.stderr) {
      logger.error(`[Inspiration] Script error (exit ${result.exitCode}):`, result.stderr);
      return NextResponse.json(
        {
          success: false,
          tool,
          mode,
          error: `Script failed: ${result.stderr.slice(0, 500)}`,
          stats: { daysProcessed: 0, daysWithActivity: 0, daysWithOutput: 0, candidatesGenerated: 0 },
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    // Parse output to find generated file
    // Matches both daily (output/2025-12-19.judge.md) and aggregated (output/sprint_2025-12-05_to_2025-12-19.judge.md)
    const outputFileMatch = result.stdout.match(/output\/(?:[\w]+_)?[\d-]+(?:_to_[\d-]+)?\.judge(?:-no-(?:idea|post))?\.md/);
    const outputFile = outputFileMatch ? outputFileMatch[0] : undefined;

    // Read the generated file content if available
    let content: string | undefined;
    let judgeContent: string | undefined;
    if (outputFile) {
      // Output files are now in data/ directory
      const fullPath = path.join(toolPath, '..', 'data', outputFile.replace('output/', ''));
      try {
        content = await readFile(fullPath, "utf-8");
        judgeContent = content; // Judge file is the main output now
      } catch {
        // Try legacy path for backwards compatibility
        const legacyPath = path.join(toolPath, outputFile);
        try {
          content = await readFile(legacyPath, "utf-8");
          judgeContent = content;
        } catch {
          logger.log(`Could not read output file: ${fullPath}`);
        }
      }
    }

    // Parse stats from output
    const stats = parseStats(result.stdout);

    const response: GenerateResult = {
      success: true,
      tool,
      mode,
      outputFile,
      content,
      judgeContent,
      stats,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error("[Inspiration] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
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

function parseStats(stdout: string): GenerateResult["stats"] {
  // Parse summary section from output
  const daysProcessedMatch = stdout.match(/Days processed:\s*(\d+)/);
  const daysWithActivityMatch = stdout.match(/Days with activity:\s*(\d+)/);
  const daysWithOutputMatch = stdout.match(/Days with (?:ideas|posts):\s*(\d+)/);
  const candidatesMatch = stdout.match(/best-of\s*(\d+)/i);
  const conversationsMatch = stdout.match(/(\d+)\s+conversations/i);
  
  // Parse harmonization stats
  const harmonizationMatch = stdout.match(/Harmonization Stats:\s*(\d+)\s+processed,\s*(\d+)\s+added,\s*(\d+)\s+updated,\s*(\d+)\s+deduplicated/);
  
  return {
    daysProcessed: daysProcessedMatch ? parseInt(daysProcessedMatch[1]) : 0,
    daysWithActivity: daysWithActivityMatch ? parseInt(daysWithActivityMatch[1]) : 0,
    daysWithOutput: daysWithOutputMatch ? parseInt(daysWithOutputMatch[1]) : 0,
    candidatesGenerated: candidatesMatch ? parseInt(candidatesMatch[1]) : 1,
    conversationsAnalyzed: conversationsMatch ? parseInt(conversationsMatch[1]) : 0,
    harmonization: harmonizationMatch ? {
      itemsProcessed: parseInt(harmonizationMatch[1]),
      itemsAdded: parseInt(harmonizationMatch[2]),
      itemsUpdated: parseInt(harmonizationMatch[3]),
      itemsDeduplicated: parseInt(harmonizationMatch[4]),
    } : undefined,
  };
}

