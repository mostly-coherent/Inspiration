/**
 * Debug Report API
 * 
 * Generates a diagnostic report for troubleshooting without exposing sensitive data.
 * Used by the "Copy Debug Report" button in Settings or error screens.
 */

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

const DATA_DIR = path.join(process.cwd(), "data");

interface DebugReport {
  // System info
  timestamp: string;
  platform: string;
  nodeVersion: string;
  
  // Python info (populated async)
  pythonVersion: string | null;
  pythonEngineStatus: "local" | "remote" | "unavailable";
  
  // Database info
  cursorDbDetected: boolean;
  cursorDbSizeMB: number | null;
  cursorDbPath: string | null; // Just filename, not full path
  
  // Config status (not values!)
  configExists: boolean;
  setupComplete: boolean;
  fastStartComplete: boolean;
  hasVectorDb: boolean;
  hasLlmKey: boolean;
  llmProvider: string | null;
  
  // Theme Map status
  themeMapExists: boolean;
  themeMapGeneratedAt: string | null;
  themeMapThemeCount: number | null;
  
  // Performance (last run if available)
  lastRunDuration: number | null;
  
  // Errors (sanitized - no message content)
  recentErrors: string[];
}

async function getPythonVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const python = spawn("python3", ["--version"]);
    let output = "";
    
    python.stdout.on("data", (data) => {
      output += data.toString();
    });
    
    python.stderr.on("data", (data) => {
      output += data.toString();
    });
    
    python.on("close", () => {
      const match = output.match(/Python (\d+\.\d+\.\d+)/);
      resolve(match ? match[1] : null);
    });
    
    python.on("error", () => {
      resolve(null);
    });
    
    // Timeout after 5 seconds
    setTimeout(() => resolve(null), 5000);
  });
}

async function getDbMetrics(): Promise<{ detected: boolean; sizeMB: number | null; filename: string | null }> {
  return new Promise((resolve) => {
    const python = spawn("python3", ["-c", `
import sys
sys.path.insert(0, 'engine')
try:
    from common.cursor_db import auto_detect_cursor_db_path
    import os
    db_path = auto_detect_cursor_db_path()
    if db_path and os.path.exists(db_path):
        size_mb = os.path.getsize(db_path) / (1024 * 1024)
        print(f"FOUND|{size_mb:.1f}|{os.path.basename(db_path)}")
    else:
        print("NOT_FOUND")
except Exception as e:
    print(f"ERROR|{e}")
`]);
    
    let output = "";
    python.stdout.on("data", (data) => {
      output += data.toString();
    });
    
    python.on("close", (code) => {
      if (code !== 0) {
        resolve({ detected: false, sizeMB: null, filename: null });
        return;
      }
      
      const lines = output.trim().split("\n");
      const lastLine = lines[lines.length - 1];
      
      if (lastLine.startsWith("FOUND|")) {
        const parts = lastLine.split("|");
        if (parts.length >= 3) {
          resolve({
            detected: true,
            sizeMB: parseFloat(parts[1]) || null,
            filename: parts[2] || null,
          });
        } else {
          resolve({ detected: false, sizeMB: null, filename: null });
        }
      } else {
        resolve({ detected: false, sizeMB: null, filename: null });
      }
    });
    
    python.on("error", () => {
      resolve({ detected: false, sizeMB: null, filename: null });
    });
    
    setTimeout(() => resolve({ detected: false, sizeMB: null, filename: null }), 10000);
  });
}

/**
 * GET /api/debug-report
 * Generate diagnostic report
 */
export async function GET() {
  try {
    const report: DebugReport = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      nodeVersion: process.version,
      pythonVersion: null,
      pythonEngineStatus: "unavailable",
      cursorDbDetected: false,
      cursorDbSizeMB: null,
      cursorDbPath: null,
      configExists: false,
      setupComplete: false,
      fastStartComplete: false,
      hasVectorDb: false,
      hasLlmKey: false,
      llmProvider: null,
      themeMapExists: false,
      themeMapGeneratedAt: null,
      themeMapThemeCount: null,
      lastRunDuration: null,
      recentErrors: [],
    };
    
    // Get Python version
    report.pythonVersion = await getPythonVersion();
    report.pythonEngineStatus = report.pythonVersion ? "local" : "unavailable";
    
    // Check if using remote engine
    if (process.env.PYTHON_ENGINE_URL) {
      report.pythonEngineStatus = "remote";
    }
    
    // Get DB metrics
    const dbMetrics = await getDbMetrics();
    report.cursorDbDetected = dbMetrics.detected;
    report.cursorDbSizeMB = dbMetrics.sizeMB;
    report.cursorDbPath = dbMetrics.filename;
    
    // Check config
    const configPath = path.join(DATA_DIR, "config.json");
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        report.configExists = true;
        report.setupComplete = config.setupComplete || false;
        report.fastStartComplete = config.fastStartComplete || false;
        report.hasVectorDb = !!(config.vectordb?.url && config.vectordb?.anonKey);
        report.llmProvider = config.llm?.provider || null;
      } catch (e) {
        report.recentErrors.push("Config file parse error");
      }
    }
    
    // Check for LLM keys in environment
    report.hasLlmKey = !!(
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.OPENROUTER_API_KEY
    );
    
    // Check Theme Map
    const themeMapPath = path.join(DATA_DIR, "theme_map.json");
    if (fs.existsSync(themeMapPath)) {
      try {
        const themeMap = JSON.parse(fs.readFileSync(themeMapPath, "utf-8"));
        report.themeMapExists = true;
        report.themeMapGeneratedAt = themeMap.savedAt || null;
        report.themeMapThemeCount = themeMap.data?.themes?.length || null;
      } catch (e) {
        report.recentErrors.push("Theme map file parse error");
      }
    }
    
    // Get last performance run
    const perfLogsDir = path.join(DATA_DIR, "performance_logs");
    if (fs.existsSync(perfLogsDir)) {
      try {
        const files = fs.readdirSync(perfLogsDir)
          .filter(f => f.endsWith(".json"))
          .sort()
          .reverse();
        
        if (files.length > 0) {
          const lastLog = JSON.parse(fs.readFileSync(path.join(perfLogsDir, files[0]), "utf-8"));
          report.lastRunDuration = lastLog.totals?.total_seconds || null;
        }
      } catch (e) {
        // Ignore perf log errors
      }
    }
    
    return NextResponse.json({
      success: true,
      report,
      // Pre-formatted for easy copying
      formatted: formatReportForCopy(report),
    });
  } catch (error) {
    console.error("[debug-report] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate debug report" },
      { status: 500 }
    );
  }
}

function formatReportForCopy(report: DebugReport): string {
  const lines = [
    "# Inspiration Debug Report",
    `Generated: ${report.timestamp}`,
    "",
    "## System",
    `- Platform: ${report.platform}`,
    `- Node: ${report.nodeVersion}`,
    `- Python: ${report.pythonVersion || "not found"}`,
    `- Engine: ${report.pythonEngineStatus}`,
    "",
    "## Cursor Database",
    `- Detected: ${report.cursorDbDetected ? "yes" : "no"}`,
    `- Size: ${report.cursorDbSizeMB ? `${report.cursorDbSizeMB} MB` : "n/a"}`,
    "",
    "## Configuration",
    `- Config exists: ${report.configExists ? "yes" : "no"}`,
    `- Setup complete: ${report.setupComplete ? "yes" : "no"}`,
    `- Fast Start complete: ${report.fastStartComplete ? "yes" : "no"}`,
    `- Vector DB: ${report.hasVectorDb ? "configured" : "not configured"}`,
    `- LLM key: ${report.hasLlmKey ? "present" : "missing"}`,
    `- LLM provider: ${report.llmProvider || "none"}`,
    "",
    "## Theme Map",
    `- Exists: ${report.themeMapExists ? "yes" : "no"}`,
    `- Generated: ${report.themeMapGeneratedAt || "never"}`,
    `- Theme count: ${report.themeMapThemeCount ?? "n/a"}`,
    "",
    "## Performance",
    `- Last run duration: ${report.lastRunDuration ? `${report.lastRunDuration}s` : "n/a"}`,
  ];
  
  if (report.recentErrors.length > 0) {
    lines.push("");
    lines.push("## Errors");
    report.recentErrors.forEach(e => lines.push(`- ${e}`));
  }
  
  return lines.join("\n");
}
