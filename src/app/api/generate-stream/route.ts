import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { GenerateRequest, TOOL_CONFIG, PRESET_MODES, getToolPath, ThemeType, ModeType, ToolType } from "@/lib/types";
import { logger } from "@/lib/logger";
import { resolveThemeModeFromTool, validateThemeMode, getModeSettings } from "@/lib/themes";
import { getPythonPath } from "@/lib/pythonPath";

export const maxDuration = 300; // 5 minutes for long-running generation

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  // Create a ReadableStream for Server-Sent Events
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

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
            send({ type: "error", error: `Invalid theme/mode combination: ${theme}/${modeId}` });
            controller.close();
            return;
          }
          resolvedTheme = theme;
          resolvedMode = modeId;
          resolvedTool = modeId === "idea" ? "ideas" : modeId === "insight" ? "insights" : "ideas";
        } else if (tool) {
          // v0: Backward compatibility - resolve from tool
          const resolved = resolveThemeModeFromTool(tool);
          if (!resolved) {
            send({ type: "error", error: `Unknown tool: ${tool}` });
            controller.close();
            return;
          }
          resolvedTheme = resolved.theme;
          resolvedMode = resolved.mode;
          resolvedTool = tool;
        } else {
          send({ type: "error", error: "Either 'tool' (v0) or 'theme' + 'modeId' (v1) must be provided" });
          controller.close();
          return;
        }

        // Get tool config (for script path)
        const toolConfig = TOOL_CONFIG[resolvedTool];
        if (!toolConfig) {
          send({ type: "error", error: `Unknown tool: ${resolvedTool}` });
          controller.close();
          return;
        }

        // Get mode config (for defaults)
        const modeConfig = PRESET_MODES.find((m) => m.id === mode);
        
        // Get mode settings from themes.json (v1)
        const modeSettings = getModeSettings(resolvedTheme, resolvedMode);
        
        // Build command arguments
        const args: string[] = [];
        
        // Add --mode parameter (required for unified generate.py)
        args.push("--mode", resolvedMode === "idea" ? "ideas" : resolvedMode === "insight" ? "insights" : resolvedMode);
        
        if (mode !== "custom" && modeConfig) {
          args.push(`--${mode}`);
        } else {
          // Custom mode - use explicit args
          // Note: generate.py only supports --days (last N days from today) or --date (single date)
          // For date ranges, we calculate the number of days and use --days
          if (fromDate && toDate) {
            // Calculate days between dates (inclusive)
            const from = new Date(fromDate);
            const to = new Date(toDate);
            const diffTime = Math.abs(to.getTime() - from.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive
            args.push("--days", diffDays.toString());
          } else if (days) {
            args.push("--days", days.toString());
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

        const toolPath = getToolPath(resolvedTool);
        const pythonPath = getPythonPath();
        
        send({ type: "start", message: `Starting ${resolvedTool} generation...` });
        send({ type: "log", message: `Running: ${pythonPath} ${toolConfig.script} ${args.join(" ")}` });

        // Execute Python script with streaming output
        await runPythonScriptStream(toolPath, toolConfig.script, args, signal, send);

        // Parse output file
        // This would need to be passed from the Python script or parsed from logs
        send({ type: "complete", message: "Generation complete" });
        controller.close();
      } catch (error) {
        send({ 
          type: "error", 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

async function runPythonScriptStream(
  cwd: string,
  script: string,
  args: string[],
  signal: AbortSignal | undefined,
  send: (data: object) => void
): Promise<void> {
  const pythonPath = getPythonPath();
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonPath, [script, ...args], {
      cwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
    });

    let isAborted = false;

    // Handle abort signal
    if (signal) {
      signal.addEventListener("abort", () => {
        isAborted = true;
        send({ type: "log", message: "Request cancelled, stopping..." });
        try {
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill("SIGKILL");
            }
          }, 2000);
        } catch (err) {
          logger.error("[Inspiration] Error killing process:", err);
        }
        resolve();
      });
    }

    proc.stdout.on("data", (data) => {
      if (!isAborted) {
        const text = data.toString();
        send({ type: "log", message: text.trim() });
        logger.log(`[stdout] ${text.trim()}`);
      }
    });

    proc.stderr.on("data", (data) => {
      if (!isAborted) {
        const text = data.toString();
        send({ type: "log", message: text.trim(), isError: true });
        logger.error(`[stderr] ${text.trim()}`);
      }
    });

    proc.on("close", (code) => {
      if (!isAborted) {
        if (code === 0) {
          send({ type: "log", message: "Process completed successfully" });
          resolve();
        } else {
          send({ type: "error", error: `Process exited with code ${code}` });
          reject(new Error(`Process exited with code ${code}`));
        }
      }
    });

    proc.on("error", (err) => {
      if (!isAborted) {
        send({ type: "error", error: err.message });
        reject(err);
      }
    });
  });
}

