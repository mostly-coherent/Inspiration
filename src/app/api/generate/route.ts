import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import { GenerateRequest, GenerateResult, TOOL_CONFIG, PRESET_MODES, getToolPath, ThemeType, ModeType, ToolType } from "@/lib/types";
import { logger } from "@/lib/logger";
import { parseRankedItems, extractEstimatedCost } from "@/lib/resultParser";
import { resolveThemeModeFromTool, validateThemeMode, getModeSettings } from "@/lib/themes";

export const maxDuration = 300; // 5 minutes for long-running generation

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { tool, theme, modeId, mode, days, bestOf, temperature, fromDate, toDate, dryRun } = body;
    
    // Get abort signal from request
    const signal = request.signal;

    // Resolve theme and mode (support both v0 tool and v1 theme/mode)
    let resolvedTheme: ThemeType;
    let resolvedMode: ModeType;
    let resolvedTool: ToolType;

    if (theme && modeId) {
      // v1: Explicit theme/mode
      if (!validateThemeMode(theme, modeId)) {
        return NextResponse.json(
          { success: false, error: `Invalid theme/mode combination: ${theme}/${modeId}` },
          { status: 400 }
        );
      }
      resolvedTheme = theme;
      resolvedMode = modeId;
      // Map mode back to tool for backward compatibility with generate.py
      resolvedTool = modeId === "idea" ? "ideas" : modeId === "insight" ? "insights" : "ideas";
    } else if (tool) {
      // v0: Backward compatibility - resolve from tool
      const resolved = resolveThemeModeFromTool(tool);
      if (!resolved) {
        return NextResponse.json(
          { success: false, error: `Unknown tool: ${tool}` },
          { status: 400 }
        );
      }
      resolvedTheme = resolved.theme;
      resolvedMode = resolved.mode;
      resolvedTool = tool;
    } else {
      return NextResponse.json(
        { success: false, error: "Either 'tool' (v0) or 'theme' + 'modeId' (v1) must be provided" },
        { status: 400 }
      );
    }

    // Get tool config (for script path)
    const toolConfig = TOOL_CONFIG[resolvedTool];
    if (!toolConfig) {
      return NextResponse.json(
        { success: false, error: `Unknown tool: ${resolvedTool}` },
        { status: 400 }
      );
    }

    // Get mode config (for defaults)
    const modeConfig = PRESET_MODES.find((m) => m.id === mode);
    
    // Get mode settings from themes.json (v1)
    const modeSettings = getModeSettings(resolvedTheme, resolvedMode);
    
    // Note: 90-day limit removed in v1 - Vector DB enables unlimited date ranges
    
    // Build command arguments
    const args: string[] = [];
    
    // Add --mode parameter (required for unified generate.py)
    // Use resolvedMode which maps to generate.py's mode parameter
    args.push("--mode", resolvedMode === "idea" ? "ideas" : resolvedMode === "insight" ? "insights" : resolvedMode);
    
    if (mode !== "custom" && modeConfig) {
      // Use preset mode
      args.push(`--${mode}`);
    } else {
      // Custom mode - use explicit args
      // Note: generate.py only supports --days (last N days from today) or --date (single date)
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
              error: `End date cannot be in the future.`,
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
        
        // Python --days means "last N days from today", so we need to calculate
        // how many days back to go to include the start date
        // Since we're searching backwards from today, we use daysFromTodayToStart + 1
        // (to include both start and end dates)
        // Note: No 90-day limit in v1 - Vector DB enables unlimited ranges
        effectiveDays = daysFromTodayToStart + 1;
      } else if (days) {
        // Note: No 90-day limit in v1 - Vector DB enables unlimited ranges
        effectiveDays = days;
      }
      
      if (effectiveDays !== undefined) {
        args.push("--days", effectiveDays.toString());
      }
    }

    // Override with custom values if provided, or use mode defaults
    const effectiveBestOf = bestOf ?? modeConfig?.bestOf ?? 5;
    const effectiveTemperature = temperature ?? modeSettings?.temperature ?? modeConfig?.temperature ?? 0.2;
    
    args.push("--best-of", effectiveBestOf.toString());
    args.push("--temperature", effectiveTemperature.toString());

    if (dryRun) {
      args.push("--dry-run");
    }

    // Get tool path dynamically
    const toolPath = getToolPath(resolvedTool);
    
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
          tool: resolvedTool,
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

    // Parse ranked items from content
    const items = content ? parseRankedItems(content, resolvedTool) : undefined;
    
    // Extract estimated cost
    const estimatedCost = content ? extractEstimatedCost(content, stats.candidatesGenerated) : undefined;

    const response: GenerateResult = {
      success: true,
      tool: resolvedTool, // Return resolved tool for backward compatibility
      mode,
      outputFile, // Deprecated - kept for backward compatibility
      content,
      judgeContent,
      items, // v1: Ranked items
      estimatedCost, // Estimated LLM cost
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

