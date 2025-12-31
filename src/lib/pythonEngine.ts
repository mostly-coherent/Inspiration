/**
 * Python Engine HTTP Client
 * 
 * Handles communication with the Python engine service (deployed on Railway/Render/etc)
 * Falls back to local spawn() if PYTHON_ENGINE_URL is not set (local development)
 */

import { spawn } from "child_process";
import path from "path";
import { logger } from "./logger";

const PYTHON_ENGINE_URL = process.env.PYTHON_ENGINE_URL;
const USE_LOCAL_PYTHON = !PYTHON_ENGINE_URL;

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Call Python engine via HTTP (production) or spawn (local development)
 */
export async function callPythonEngine(
  endpoint: string,
  body: any,
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
  body: any,
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
    
    logger.error(`[Inspiration] HTTP error calling Python engine:`, error);
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
  body: any,
  signal?: AbortSignal
): Promise<ScriptResult> {
  const enginePath = path.resolve(process.cwd(), "engine");
  
  // Map endpoint to script
  let script: string;
  let args: string[] = [];
  
  if (endpoint === "generate") {
    script = "generate.py";
    args.push("--mode", body.mode || "ideas");
    
    if (body.preset === "daily") args.push("--daily");
    else if (body.preset === "sprint") args.push("--sprint");
    else if (body.preset === "month") args.push("--month");
    else if (body.preset === "quarter") args.push("--quarter");
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
    if (body.temperature !== undefined) args.push("--temperature", body.temperature.toString());
    if (body.dryRun) args.push("--dry-run");
  } else if (endpoint === "seek") {
    script = "seek.py";
    args.push("--query", body.query);
    args.push("--days", (body.daysBack || 90).toString());
    args.push("--top-k", (body.topK || 10).toString());
    args.push("--min-similarity", (body.minSimilarity || 0.0).toString());
    args.push("--json");
    
    if (body.workspaces) {
      for (const workspace of body.workspaces) {
        args.push("--workspace", workspace);
      }
    }
    if (body.temperature !== undefined) args.push("--temperature", body.temperature.toString());
    if (body.bestOf) args.push("--best-of", body.bestOf.toString());
    if (body.dryRun) args.push("--dry-run");
  } else if (endpoint === "sync") {
    script = path.join("scripts", "sync_messages.py");
  } else {
    throw new Error(`Unknown endpoint: ${endpoint}`);
  }
  
  const scriptPath = path.join(enginePath, script);
  
  logger.log(`[Inspiration] Running locally: python3 ${script} ${args.join(" ")}`);
  
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [scriptPath, ...args], {
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
          logger.error("[Inspiration] Error killing process:", err);
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

