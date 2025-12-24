import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import { GenerateRequest, GenerateResult, TOOL_CONFIG, PRESET_MODES, getToolPath } from "@/lib/types";

export const maxDuration = 300; // 5 minutes for long-running generation

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { tool, mode, days, bestOf, temperature, fromDate, toDate, dryRun } = body;

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
    
    // Build command arguments
    const args: string[] = [];
    
    if (mode !== "custom" && modeConfig) {
      // Use preset mode
      args.push(`--${mode}`);
    } else {
      // Custom mode - use explicit args
      if (fromDate && toDate) {
        args.push("--from", fromDate, "--to", toDate);
      } else if (days) {
        args.push("--days", days.toString());
      }
    }

    // Override with custom values if provided
    if (bestOf !== undefined) {
      args.push("--best-of", bestOf.toString());
    }
    if (temperature !== undefined) {
      args.push("--temperature", temperature.toString());
    }

    // Always use judge-only for cleaner output
    args.push("--judge-only");

    if (dryRun) {
      args.push("--dry-run");
    }

    // Get tool path dynamically
    const toolPath = getToolPath(tool);
    
    console.log(`[Inspiration] Running: python3 ${toolConfig.script} ${args.join(" ")}`);
    console.log(`[Inspiration] Working directory: ${toolPath}`);

    // Execute Python script
    const result = await runPythonScript(toolPath, toolConfig.script, args);

    // Check for script errors
    if (result.exitCode !== 0 && result.stderr) {
      console.error(`[Inspiration] Script error (exit ${result.exitCode}):`, result.stderr);
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
          console.log(`Could not read output file: ${fullPath}`);
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
    console.error("[Inspiration] Error:", error);
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
  args: string[]
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

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
      console.log(`[stdout] ${data.toString().trim()}`);
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
      console.error(`[stderr] ${data.toString().trim()}`);
    });

    proc.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 0,
      });
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

function parseStats(stdout: string): GenerateResult["stats"] {
  // Parse summary section from output
  const daysProcessedMatch = stdout.match(/Days processed:\s*(\d+)/);
  const daysWithActivityMatch = stdout.match(/Days with activity:\s*(\d+)/);
  const daysWithOutputMatch = stdout.match(/Days with (?:ideas|posts):\s*(\d+)/);
  const candidatesMatch = stdout.match(/best-of\s*(\d+)/i);

  return {
    daysProcessed: daysProcessedMatch ? parseInt(daysProcessedMatch[1]) : 0,
    daysWithActivity: daysWithActivityMatch ? parseInt(daysWithActivityMatch[1]) : 0,
    daysWithOutput: daysWithOutputMatch ? parseInt(daysWithOutputMatch[1]) : 0,
    candidatesGenerated: candidatesMatch ? parseInt(candidatesMatch[1]) : 1,
  };
}

