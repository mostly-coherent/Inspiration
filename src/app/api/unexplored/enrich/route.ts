/**
 * Unexplored Territory → Enrich Library API
 * 
 * Purpose: Generate ideas/insights for a specific topic from Unexplored Territory
 * Uses the existing generate.py engine with --topic filter
 * 
 * Flow:
 * 1. User sees unexplored topic in Theme Explorer
 * 2. Clicks "Enrich Library"
 * 3. This API calls generate.py with --topic filter
 * 4. New items added to Library
 * 5. Topic appears in Patterns tab
 */

import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getPythonPath } from "@/lib/pythonPath";

export const maxDuration = 300; // 5 minutes for long-running generation

interface EnrichRequest {
  areaId: string;           // Unexplored area ID (for tracking)
  topic: string;            // Topic to filter conversations by
  modes: ("idea" | "insight")[];  // What to generate
  days?: number;            // How many days back to search (default: 90)
}

interface EnrichResult {
  ideas: number;
  insights: number;
  totalAdded: number;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        const body: EnrichRequest = await request.json();
        const { areaId, topic, modes, days = 90 } = body;
        
        // Validation
        if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
          send({ type: "error", error: "Topic is required and must be a non-empty string" });
          controller.close();
          return;
        }

        if (!modes || !Array.isArray(modes) || modes.length === 0) {
          send({ type: "error", error: "At least one mode (idea/insight) is required" });
          controller.close();
          return;
        }

        // Validate modes are valid
        const validModes = ["idea", "insight"];
        const invalidModes = modes.filter(m => !validModes.includes(m));
        if (invalidModes.length > 0) {
          send({ type: "error", error: `Invalid modes: ${invalidModes.join(", ")}. Must be "idea" or "insight"` });
          controller.close();
          return;
        }

        // Validate days parameter
        if (days !== undefined && (typeof days !== "number" || days < 1 || days > 365)) {
          send({ type: "error", error: "Days must be a number between 1 and 365" });
          controller.close();
          return;
        }

        // Sanitize topic to prevent command injection (basic check)
        const sanitizedTopic = topic.trim();
        if (sanitizedTopic.includes("\n") || sanitizedTopic.includes("\r") || sanitizedTopic.includes("\0")) {
          send({ type: "error", error: "Topic contains invalid characters" });
          controller.close();
          return;
        }

        const signal = request.signal;
        
        send({ 
          type: "start", 
          message: `Enriching Library with: ${sanitizedTopic}`,
          areaId,
          topic: sanitizedTopic,
          modes,
        });

        const results: EnrichResult = {
          ideas: 0,
          insights: 0,
          totalAdded: 0,
        };

        // Run generation for each mode
        for (const mode of modes) {
          const modeLabel = mode === "idea" ? "ideas" : "insights";
          
          send({ 
            type: "phase", 
            phase: `generating_${modeLabel}`,
            message: `Generating ${modeLabel} about "${sanitizedTopic}"...`,
          });

          try {
            const count = await runGenerateWithTopic(sanitizedTopic, mode, days, signal, send);
            
            if (mode === "idea") {
              results.ideas = count;
            } else {
              results.insights = count;
            }
            results.totalAdded += count;

            send({ 
              type: "progress", 
              phase: `${modeLabel}_complete`,
              message: `Generated ${count} ${modeLabel}`,
              count,
            });
          } catch (error) {
            send({ 
              type: "warning", 
              message: `Failed to generate ${modeLabel}: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
          }
        }

        send({ 
          type: "complete", 
          message: `Library enriched with ${results.totalAdded} items about "${sanitizedTopic}"`,
          results,
          areaId,
          topic: sanitizedTopic,
        });
        
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

/**
 * Run generate.py with topic filter and return count of items created
 */
async function runGenerateWithTopic(
  topic: string,
  mode: "idea" | "insight",
  days: number,
  signal: AbortSignal | undefined,
  send: (data: object) => void
): Promise<number> {
  const pythonPath = getPythonPath();
  const scriptPath = path.join(process.cwd(), "engine");
  
  // Build command arguments
  const modeArg = mode === "idea" ? "ideas" : "insights";
  const args = [
    "generate.py",
    "--mode", modeArg,
    "--days", days.toString(),
    "--topic", topic,           // NEW: Topic filter
    "--item-count", "10",       // Reasonable limit for topic-based generation
    "--source-tracking",        // Track source for transparency
  ];

  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>;
    let hasResolved = false;

    try {
      proc = spawn(pythonPath, args, {
        cwd: scriptPath,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",  // Force unbuffered output for real-time streaming
        },
      });
    } catch (spawnError) {
      reject(new Error(`Failed to spawn generate script: ${spawnError instanceof Error ? spawnError.message : "Unknown error"}`));
      return;
    }

    let itemCount = 0;
    let buffer = "";

    // Handle abort signal
    if (signal) {
      signal.addEventListener("abort", () => {
        if (!proc.killed) {
          proc.kill("SIGTERM");
        }
      });
    }

    // Parse stdout for progress markers
    if (!proc.stdout) {
      reject(new Error("Process stdout is not available"));
      return;
    }

    proc.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
      
      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";  // Keep incomplete line in buffer
      
      for (const line of lines) {
        // Parse progress markers from Python
        if (line.startsWith("[PHASE:")) {
          const match = line.match(/\[PHASE:(\w+)\]/);
          if (match) {
            send({ type: "phase", phase: match[1], message: line });
          }
        } else if (line.startsWith("[STAT:")) {
          const match = line.match(/\[STAT:(\w+)=(.+)\]/);
          if (match) {
            send({ type: "stat", key: match[1], value: match[2] });
          }
        } else if (line.startsWith("[INFO:")) {
          const match = line.match(/\[INFO:message=(.+)\]/);
          if (match) {
            send({ type: "info", message: match[1] });
          }
        } else if (line.includes("new items added") || line.includes("items merged")) {
          // Parse item counts from output
          const newMatch = line.match(/(\d+)\s+new\s+items?\s+added/i);
          const mergedMatch = line.match(/(\d+)\s+items?\s+merged/i);
          if (newMatch) {
            itemCount += parseInt(newMatch[1], 10);
          }
          if (mergedMatch) {
            itemCount += parseInt(mergedMatch[1], 10);
          }
        } else if (line.startsWith("🎯")) {
          // Topic filter confirmation
          send({ type: "info", message: line });
        }
      }
    });

    // Log stderr for debugging (but don't fail)
    if (proc.stderr) {
      proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      // Only send non-debug messages to client
      if (!text.includes("[DEBUG]") && !text.includes("file=sys.stderr")) {
        send({ type: "log", message: text.trim() });
      }
      });
    }

    proc.on("close", (code) => {
      if (hasResolved) return;
      hasResolved = true;
      
      if (code === 0 || code === 120) {
        // 120 = no messages found (not an error for topic-based search)
        resolve(itemCount);
      } else {
        reject(new Error(`Generate script exited with code ${code}`));
      }
    });

    proc.on("error", (error) => {
      if (hasResolved) return;
      hasResolved = true;
      reject(new Error(`Process spawn error: ${error.message}`));
    });
  });
}
