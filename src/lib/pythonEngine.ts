/**
 * Python Engine HTTP Client
 * 
 * Handles communication with the Python engine service (deployed on Railway/Render/etc)
 * Falls back to local spawn() if PYTHON_ENGINE_URL is not set (local development)
 */

import { spawn } from "child_process";
import path from "path";
import { logger } from "./logger";
import { getPythonPath } from "./pythonPath";

const PYTHON_ENGINE_URL = process.env.PYTHON_ENGINE_URL;
const USE_LOCAL_PYTHON = !PYTHON_ENGINE_URL;

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Request body type for Python engine calls */
export interface PythonEngineRequest {
  query?: string;
  daysBack?: number;
  topK?: number;
  minSimilarity?: number;
  workspaces?: string[];
  hours?: number;
  mode?: string;
  theme?: string;
  limit?: number;
  // Generate endpoint specific
  preset?: string;
  days?: number;
  date?: string;
  fromDate?: string;
  toDate?: string;
  bestOf?: number;
  temperature?: number | null;
  dryRun?: boolean;
  [key: string]: unknown; // Allow additional properties
}

/**
 * Call Python engine via HTTP (production) or spawn (local development)
 */
export async function callPythonEngine(
  endpoint: string,
  body: PythonEngineRequest,
  signal?: AbortSignal
): Promise<ScriptResult> {
  if (USE_LOCAL_PYTHON) {
    // Local development: use spawn
    return callPythonEngineLocal(endpoint, body, signal);
  } else {
    // Production: use HTTP
    return callPythonEngineHTTP(endpoint, body, signal);
  }
}

/**
 * Call Python engine via HTTP (Railway/Render/etc)
 */
async function callPythonEngineHTTP(
  endpoint: string,
  body: PythonEngineRequest,
  signal?: AbortSignal
): Promise<ScriptResult> {
  const url = `${PYTHON_ENGINE_URL}/${endpoint}`;
  
  logger.log(`[Inspiration] Calling Python engine: ${url}`);
  
  try {
    const controller = signal ? new AbortController() : undefined;
    if (signal) {
      signal.addEventListener("abort", () => controller?.abort());
    }
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        stdout: data.stdout || "",
        stderr: data.stderr || data.error || `HTTP ${response.status}`,
        exitCode: response.status >= 500 ? 1 : 0,
      };
    }
    
    // Map HTTP response to ScriptResult format
    // For successful responses, include the full JSON in stdout for parsing
    return {
      stdout: JSON.stringify(data), // Full response as JSON string
      stderr: data.stderr || "",
      exitCode: data.success === false ? 1 : 0,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        stdout: "",
        stderr: "Request aborted",
        exitCode: 130,
      };
    }
    
    logger.error(`[Inspiration] HTTP error calling Python engine:`, error instanceof Error ? error : String(error));
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : "Unknown error",
      exitCode: 1,
    };
  }
}

/**
 * Call Python engine locally via spawn (for local development)
 */
async function callPythonEngineLocal(
  endpoint: string,
  body: PythonEngineRequest,
  signal?: AbortSignal
): Promise<ScriptResult> {
  // Safety check: prevent running from wrong directory (e.g., MyPrivateTools/Inspiration)
  const cwd = process.cwd();
  if (cwd.includes("MyPrivateTools") || cwd.includes("Production_Clones")) {
    logger.error(`[Inspiration] ERROR: Running from invalid directory: ${cwd}`);
    logger.error(`[Inspiration] This can create duplicate directories. Run from the Inspiration project root.`);
    return {
      stdout: "",
      stderr: `Invalid working directory: ${cwd}. Run from the Inspiration project root.`,
      exitCode: 1,
    };
  }
  
  const enginePath = path.resolve(process.cwd(), "engine");
  
  // Map endpoint to script
  let script: string;
  const args: string[] = [];
  
  if (endpoint === "generate") {
    script = "generate.py";
    args.push("--mode", body.mode || "ideas");
    
    if (body.preset === "daily") args.push("--daily");
    else if (body.preset === "week") args.push("--week");
    else if (body.preset === "sprint") args.push("--sprint");
    else {
      if (body.days) args.push("--days", body.days.toString());
      if (body.date) args.push("--date", body.date);
      if (body.fromDate && body.toDate) {
        // Calculate days from today to start date
        const from = new Date(body.fromDate);
        const today = new Date();
        const daysBack = Math.ceil((today.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        args.push("--days", daysBack.toString());
      }
    }
    
    if (body.bestOf) args.push("--best-of", body.bestOf.toString());
    if (body.temperature !== undefined && body.temperature !== null) args.push("--temperature", body.temperature.toString());
    if (body.dryRun) args.push("--dry-run");
  } else if (endpoint === "seek") {
    script = "seek.py";
    args.push("--query", body.query || "");
    args.push("--days", (body.daysBack || 90).toString());
    args.push("--top-k", (body.topK || 10).toString());
    args.push("--min-similarity", (body.minSimilarity || 0.0).toString());
    args.push("--json");
    
    if (body.workspaces) {
      for (const workspace of body.workspaces) {
        args.push("--workspace", workspace);
      }
    }
    if (body.temperature !== undefined && body.temperature !== null) args.push("--temperature", body.temperature.toString());
    if (body.bestOf) args.push("--best-of", body.bestOf.toString());
    if (body.dryRun) args.push("--dry-run");
  } else if (endpoint === "sync") {
    script = path.join("scripts", "sync_messages.py");
  } else {
    throw new Error(`Unknown endpoint: ${endpoint}`);
  }
  
  const scriptPath = path.join(enginePath, script);
  
  const pythonPath = getPythonPath();
  logger.log(`[Inspiration] Running locally: ${pythonPath} ${script} ${args.join(" ")}`);
  
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonPath, [scriptPath, ...args], {
      cwd: enginePath,
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
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill("SIGKILL");
            }
          }, 2000);
        } catch (err) {
          logger.error("[Inspiration] Error killing process:", err instanceof Error ? err : String(err));
        }
        resolve({
          stdout,
          stderr,
          exitCode: 130,
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

