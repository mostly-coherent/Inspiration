import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { GenerateRequest, TOOL_CONFIG, PRESET_MODES, getToolPath, ThemeType, ModeType, ToolType, GenerationDefaults } from "@/lib/types";
import { logger } from "@/lib/logger";
import { resolveThemeModeFromTool, validateThemeMode, getModeSettings } from "@/lib/themes";
import { getPythonPath } from "@/lib/pythonPath";

// Default generation settings (fallback if config not found)
const DEFAULT_GENERATION: GenerationDefaults = {
  temperature: 0.5,
  deduplicationThreshold: 0.80,
  maxTokens: 4000,
  maxTokensJudge: 500,
  softCap: 50,
};

// Load generation defaults from config
async function loadGenerationDefaults(): Promise<GenerationDefaults> {
  try {
    const configPath = path.join(process.cwd(), "data", "config.json");
    if (existsSync(configPath)) {
      const content = await readFile(configPath, "utf-8");
      const config = JSON.parse(content);
      if (config.generationDefaults) {
        return { ...DEFAULT_GENERATION, ...config.generationDefaults };
      }
    }
  } catch (error) {
    logger.error("[Generate-Stream] Failed to load generation defaults:", error);
  }
  return DEFAULT_GENERATION;
}

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
        const { tool, theme, modeId, mode, days, temperature, fromDate, toDate, dryRun } = body;
        
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

        // Load global generation defaults from config
        const generationDefaults = await loadGenerationDefaults();
        
        // Override with custom values if provided, or use mode defaults, or use global defaults
        // Priority: per-request > per-mode > global config > hardcoded fallback
        // UX-1: itemCount is now softCap from config - Python extracts all quality items up to this limit
        const effectiveTemperature = temperature ?? modeSettings?.temperature ?? modeConfig?.temperature ?? generationDefaults.temperature;
        const effectiveSoftCap = generationDefaults.softCap ?? 50;
        
        args.push("--temperature", effectiveTemperature.toString());
        args.push("--item-count", effectiveSoftCap.toString());

        if (dryRun) {
          args.push("--dry-run");
        }

        const toolPath = getToolPath(resolvedTool);
        const pythonPath = getPythonPath();
        
        send({ type: "start", message: `Starting ${resolvedTool} generation...` });
        send({ type: "log", message: `Running: ${pythonPath} ${toolConfig.script} ${args.join(" ")}` });

        // Execute Python script with streaming output
        // The Python script emits [PHASE:complete] after harmonization is done
        // We track this to know when library items are actually saved
        let receivedComplete = false;
        const wrappedSend = (data: object) => {
          // Track if we received the complete phase from Python
          if ("type" in data && data.type === "phase" && "phase" in data && data.phase === "complete") {
            receivedComplete = true;
          }
          send(data);
        };
        
        await runPythonScriptStream(toolPath, toolConfig.script, args, signal, wrappedSend);

        // Only send our own complete if Python didn't emit one
        // (e.g., dry run or error cases)
        if (!receivedComplete) {
          send({ type: "complete", message: "Generation complete" });
        }
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

    let killTimeout: NodeJS.Timeout | null = null;

    // Handle abort signal
    if (signal) {
      signal.addEventListener("abort", async () => {
        isAborted = true;
        send({ type: "log", message: "Request cancelled, stopping..." });
        try {
          proc.kill("SIGTERM");
          // Clean up any existing timeout before setting new one
          if (killTimeout) {
            clearTimeout(killTimeout);
          }
          killTimeout = setTimeout(() => {
            if (!proc.killed) {
              proc.kill("SIGKILL");
            }
            killTimeout = null;
          }, 2000);
          
          // H7 FIX: Clean up partially written output files on abort
          // Files with .tmp suffix are incomplete writes
          const fs = await import("fs/promises");
          const path = await import("path");
          const outputDirs = [
            path.join(cwd, "data/output/ideas"),
            path.join(cwd, "data/output/insights"),
          ];
          for (const dir of outputDirs) {
            try {
              const files = await fs.readdir(dir);
              for (const file of files) {
                if (file.endsWith(".tmp")) {
                  await fs.unlink(path.join(dir, file));
                  logger.log(`[Abort Cleanup] Deleted incomplete file: ${file}`);
                }
              }
            } catch {
              // Directory may not exist - that's fine
            }
          }
        } catch (err) {
          logger.error("[Inspiration] Error during abort cleanup:", err);
        }
        resolve();
      });
    }

    proc.stdout.on("data", (data) => {
      if (!isAborted) {
        const text = data.toString();
        
        // Parse progress markers from Python output
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          // Parse [PHASE:xyz] markers
          const phaseMatch = trimmed.match(/^\[PHASE:(\w+)\]$/);
          if (phaseMatch) {
            send({ type: "phase", phase: phaseMatch[1] });
            continue;
          }
          
          // Parse [STAT:key=value] markers
          const statMatch = trimmed.match(/^\[STAT:(\w+)=(.+)\]$/);
          if (statMatch) {
            const key = statMatch[1];
            const value = statMatch[2];
            // Try to parse as number, otherwise keep as string
            const numValue = Number(value);
            send({ type: "stat", key, value: isNaN(numValue) ? value : numValue });
            continue;
          }
          
          // Parse [INFO:message=xyz] markers
          const infoMatch = trimmed.match(/^\[INFO:message=(.+)\]$/);
          if (infoMatch) {
            // Unescape = signs that were escaped as ≡
            const message = infoMatch[1].replace(/≡/g, '=');
            send({ type: "info", message });
            continue;
          }
          
          // Parse [ERROR:type=xyz,message=abc] markers
          const errorMatch = trimmed.match(/^\[ERROR:type=(\w+),message=(.+)\]$/);
          if (errorMatch) {
            const errorType = errorMatch[1];
            const message = errorMatch[2].replace(/≡/g, '=');
            send({ type: "error", errorType, message });
            continue;
          }
          
          // Parse [PROGRESS:current=X,total=Y,label=Z] markers (label can be empty)
          const progressMatch = trimmed.match(/^\[PROGRESS:current=(\d+),total=(\d+),label=(.*)\]$/);
          if (progressMatch) {
            send({ 
              type: "progress", 
              current: parseInt(progressMatch[1]),
              total: parseInt(progressMatch[2]),
              label: progressMatch[3] || "items"  // Default to "items" if empty
            });
            continue;
          }
          
          // Parse [COST:...] markers
          const costMatch = trimmed.match(/^\[COST:(.+)\]$/);
          if (costMatch) {
            const pairs = costMatch[1].split(',');
            const costData: Record<string, number> = {};
            for (const pair of pairs) {
              const [key, value] = pair.split('=');
              costData[key] = parseFloat(value);
            }
            send({ type: "cost", ...costData });
            continue;
          }
          
          // Parse [WARNING:phase=X,message=Y] markers
          const warningMatch = trimmed.match(/^\[WARNING:phase=(\w*),message=(.+)\]$/);
          if (warningMatch) {
            const phase = warningMatch[1];
            const message = warningMatch[2].replace(/≡/g, '=');
            send({ type: "warning", phase, message });
            continue;
          }
          
          // Parse [PERF:...] markers (end of run performance summary)
          const perfMatch = trimmed.match(/^\[PERF:(.+)\]$/);
          if (perfMatch) {
            const pairs = perfMatch[1].split(',');
            const perfData: Record<string, number> = {};
            for (const pair of pairs) {
              const [key, value] = pair.split('=');
              perfData[key] = parseFloat(value);
            }
            send({ type: "perf", ...perfData });
            continue;
          }
          
          // Regular log message (not a marker)
          send({ type: "log", message: trimmed });
        }
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
      // Clean up kill timeout if process completes naturally
      if (killTimeout) {
        clearTimeout(killTimeout);
        killTimeout = null;
      }
      
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
      // Clean up kill timeout on error
      if (killTimeout) {
        clearTimeout(killTimeout);
        killTimeout = null;
      }
      
      if (!isAborted) {
        send({ type: "error", error: err.message });
        reject(err);
      }
    });
  });
}

