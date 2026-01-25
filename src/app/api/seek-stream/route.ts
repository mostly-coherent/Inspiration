import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { logger } from "@/lib/logger";
import { getPythonPath } from "@/lib/pythonPath";

export const maxDuration = 300; // 5 minutes for semantic search

export interface SeekStreamRequest {
  query: string;
  daysBack?: number;
  minSimilarity?: number;
  workspaces?: string[];
}

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
        const body: SeekStreamRequest = await request.json();
        const { query, daysBack = 90, minSimilarity = 0.0 } = body;
        
        // Get abort signal from request
        const signal = request.signal;

        if (!query || !query.trim()) {
          send({ type: "error", error: "Query is required" });
          controller.close();
          return;
        }

        // Build command arguments
        // UX-1: top-k removed - seek.py returns all matching results with soft cap
        const args: string[] = [
          "--query", query.trim(),
          "--days", daysBack.toString(),
          "--min-similarity", minSimilarity.toString(),
          "--json", // Always JSON for API
        ];

        const scriptPath = path.join(process.cwd(), "engine", "seek.py");
        const pythonPath = getPythonPath();
        
        send({ type: "start", message: `Starting use case search...` });
        send({ type: "log", message: `Running: ${pythonPath} seek.py ${args.join(" ")}` });

        // Execute Python script with streaming output
        await runPythonScriptStream(scriptPath, args, signal, send);

        // Send complete marker
        send({ type: "complete" });
        controller.close();
      } catch (error) {
        logger.error("[Seek-Stream] Error:", error instanceof Error ? error : String(error));
        send({ type: "error", error: error instanceof Error ? error.message : "Unknown error" });
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

/**
 * Run Python script with streaming output, parsing progress markers
 */
async function runPythonScriptStream(
  scriptPath: string,
  args: string[],
  signal: AbortSignal | null,
  send: (data: object) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath();
    const proc = spawn(pythonPath, [scriptPath, ...args], {
      cwd: path.join(process.cwd(), "engine"),
      env: { ...process.env },
    });

    let isAborted = false;
    let jsonOutput = "";
    let killTimeout: NodeJS.Timeout | null = null;

    // Handle abort signal
    if (signal) {
      signal.addEventListener("abort", () => {
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
        } catch (err) {
          logger.error("[Seek-Stream] Error killing process:", err instanceof Error ? err : String(err));
        }
        
        // S7 Fix: Clean up temporary output files on abort
        try {
          const useCasesDir = path.join(process.cwd(), "data", "output", "use_cases_output");
          if (fs.existsSync(useCasesDir)) {
            const files = fs.readdirSync(useCasesDir);
            for (const file of files) {
              // Delete .tmp files (incomplete writes from atomic save)
              if (file.endsWith(".tmp")) {
                const filePath = path.join(useCasesDir, file);
                try {
                  fs.unlinkSync(filePath);
                  logger.log(`[Seek-Stream] Cleaned up temp file: ${file}`);
                } catch (e) {
                  logger.error(`[Seek-Stream] Failed to clean up ${file}:`, e instanceof Error ? e : String(e));
                }
              }
            }
          }
          send({ type: "info", message: "Cleaned up temporary files" });
        } catch (cleanupErr) {
          logger.error("[Seek-Stream] Cleanup error:", cleanupErr instanceof Error ? cleanupErr : String(cleanupErr));
        }
        
        resolve();
      });
    }

    proc.stdout.on("data", (data) => {
      if (!isAborted) {
        const text = data.toString();
        
        // Accumulate JSON chunks (Python may output JSON in multiple chunks)
        // Python prints JSON with print(json.dumps(...)) which may arrive in chunks via Node.js spawn
        // Start accumulating when we see content starting with { (JSON begins)
        // Continue accumulating until we have complete JSON (ends with })
        if (text.trim().startsWith("{") || jsonOutput.length > 0) {
          // Accumulate chunks that contain JSON
          jsonOutput += text;
          
          // Try to parse accumulated JSON (may be complete now)
          const trimmed = jsonOutput.trim();
          // Check if we have complete JSON (starts with { and ends with })
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
              const result = JSON.parse(trimmed);
              send({ type: "result", result });
              // Clear after successful parse
              jsonOutput = "";
            } catch (parseErr) {
              // JSON might still be incomplete, keep accumulating
              // Only log if we've accumulated a lot (likely a real parse error)
              if (trimmed.length > 10000) {
                logger.error(`[Seek-Stream] JSON parse error after accumulating ${trimmed.length} chars: ${parseErr}`);
                logger.error(`[Seek-Stream] Problematic JSON (first 500 chars): ${trimmed.slice(0, 500)}`);
                // Reset to prevent infinite accumulation
                jsonOutput = "";
              }
            }
          }
          // If we're accumulating JSON, skip progress marker parsing for this chunk
          // (to avoid parsing JSON content as progress markers)
          if (jsonOutput.length > 0) {
            // Still accumulating, don't parse as progress markers yet
            return;
          }
        }
        
        // Parse progress markers from Python output
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          // Skip JSON output lines (they start with { or end with })
          // But only if we're not currently accumulating (to avoid false positives)
          if (jsonOutput.length === 0 && trimmed.startsWith("{") && trimmed.endsWith("}")) continue;
          
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
              label: progressMatch[3] || "items"
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
          
          // Regular log message (not a marker and not JSON)
          if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
            send({ type: "log", message: trimmed });
          }
        }
        logger.log(`[stdout] ${text.trim()}`);
      }
    });

    proc.stderr.on("data", (data) => {
      if (!isAborted) {
        const text = data.toString();
        // stderr often contains progress info, so also try to parse markers
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          // Parse markers from stderr too (Python prints to stderr by default)
          const phaseMatch = trimmed.match(/^\[PHASE:(\w+)\]$/);
          if (phaseMatch) {
            send({ type: "phase", phase: phaseMatch[1] });
            continue;
          }
          
          const statMatch = trimmed.match(/^\[STAT:(\w+)=(.+)\]$/);
          if (statMatch) {
            const key = statMatch[1];
            const value = statMatch[2];
            const numValue = Number(value);
            send({ type: "stat", key, value: isNaN(numValue) ? value : numValue });
            continue;
          }
          
          const infoMatch = trimmed.match(/^\[INFO:message=(.+)\]$/);
          if (infoMatch) {
            send({ type: "info", message: infoMatch[1].replace(/≡/g, '=') });
            continue;
          }
          
          const progressMatch = trimmed.match(/^\[PROGRESS:current=(\d+),total=(\d+),label=(.*)\]$/);
          if (progressMatch) {
            send({ 
              type: "progress", 
              current: parseInt(progressMatch[1]),
              total: parseInt(progressMatch[2]),
              label: progressMatch[3] || "items"
            });
            continue;
          }
          
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
          
          // Regular stderr message
          send({ type: "log", message: trimmed, isError: true });
        }
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
