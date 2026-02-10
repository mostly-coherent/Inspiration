import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { readFileSync, existsSync } from "fs";
import { getPythonPath, checkPythonVersion } from "@/lib/pythonPath";

/**
 * Fast Theme Map Generation API
 * 
 * Part of the "Fast Start" onboarding flow.
 * Generates themes from local SQLite (no Vector DB required).
 */

export const maxDuration = 120; // 2 minutes max

interface GenerateThemesRequest {
  days?: number;
  maxConversations?: number;
  maxSizeMb?: number; // NEW: Size-based limit (takes precedence over days/conversations)
  provider?: "anthropic" | "openai";
  model?: string;
  source?: "sqlite" | "vectordb"; // Force data source (defaults to "sqlite" for Theme Map generation)
}

interface ThemeEvidence {
  workspace: string;
  chatId: string;
  chatType: string;
  date: string;
  snippet: string;
}

interface Theme {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string[];
  evidence: ThemeEvidence[];
}

interface UnexploredTerritory {
  title: string;
  why: string;
}

interface ThemeMapResult {
  generatedAt?: string;
  suggestedDays: number;
  analyzed: {
    days: number;
    conversationsConsidered: number;
    conversationsUsed: number;
  };
  themes: Theme[];
  unexploredTerritory: UnexploredTerritory[];
  error?: string;
  raw_response?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateThemesRequest = await request.json();
    const { 
      days = 14, // Ignored when maxSizeMb is set (size-based takes precedence)
      maxConversations = 80,
      maxSizeMb, // Size-based Theme Map (most recent ~500MB) - takes precedence over days
      provider = "anthropic",
      model,
      source = "sqlite" // Force SQLite for Theme Map generation (local database, not Vector DB)
    } = body;

    // Validate days only if maxSizeMb is not set (for backward compatibility)
    // When maxSizeMb is set, days parameter is ignored
    if (!maxSizeMb && days < 1) {
      return NextResponse.json(
        { success: false, error: "Days must be at least 1" },
        { status: 400 }
      );
    }

    // Build command
    const pythonPath = getPythonPath();
    const scriptPath = path.join(process.cwd(), "engine", "generate_themes.py");
    
    const args = [
      scriptPath,
      "--days", String(days),
      "--max-conversations", String(maxConversations),
      "--provider", provider,
    ];
    
    if (maxSizeMb) {
      args.push("--max-size-mb", String(maxSizeMb));
    }
    
    if (model) {
      args.push("--model", model);
    }
    
    // Force SQLite source for Theme Map generation (always use local database, not Vector DB)
    if (source) {
      args.push("--force-source", source);
    }

    console.log(`[GenerateThemes] Running: ${pythonPath} ${args.join(" ")}`);

    // Load OpenAI API key from .env.local if it exists (for Lenny search)
    // Next.js doesn't auto-reload .env.local after it's written, so we read it explicitly
    const envLocalPath = path.join(process.cwd(), ".env.local");
    let openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiApiKey && existsSync(envLocalPath)) {
      try {
        const envContent = readFileSync(envLocalPath, "utf-8");
        // Match OPENAI_API_KEY=value (stop at whitespace or # comment)
        // Handle: OPENAI_API_KEY=sk-xxx  # comment
        const openaiMatch = envContent.match(/^OPENAI_API_KEY=([^\s#]+)/m);
        if (openaiMatch) {
          openaiApiKey = openaiMatch[1].trim();
          // Remove quotes if present
          openaiApiKey = openaiApiKey.replace(/^["']|["']$/g, "");
          console.log("[GenerateThemes] Loaded OPENAI_API_KEY from .env.local (length:", openaiApiKey.length, ")");
        } else {
          console.warn("[GenerateThemes] OPENAI_API_KEY not found in .env.local");
        }
      } catch (error) {
        console.warn("[GenerateThemes] Failed to read .env.local:", error);
      }
    }
    
    if (openaiApiKey) {
      console.log("[GenerateThemes] OPENAI_API_KEY will be passed to Python script");
    } else {
      console.warn("[GenerateThemes] No OPENAI_API_KEY found - Lenny search will be skipped");
    }

    // Run Python script
    const result = await new Promise<ThemeMapResult>((resolve, reject) => {
      const proc = spawn(pythonPath, args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          // Explicitly pass OpenAI key if found (for Lenny search)
          ...(openaiApiKey ? { OPENAI_API_KEY: openaiApiKey } : {}),
        },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        // Log progress messages
        console.log(`[GenerateThemes] ${data.toString().trim()}`);
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          console.error(`[GenerateThemes] Script exited with code ${code}`);
          console.error(`[GenerateThemes] stderr: ${stderr}`);
          reject(new Error(`Script failed with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (parseError) {
          console.error(`[GenerateThemes] Failed to parse output: ${stdout}`);
          reject(new Error(`Failed to parse script output: ${parseError}`));
        }
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn script: ${err.message}`));
      });
    });

    // Check for errors in result
    if (result.error) {
      return NextResponse.json(
        { 
          success: false, 
          error: result.error,
          result 
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (error) {
    console.error("[GenerateThemes] Error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

/**
 * GET: Estimate DB metrics and/or cost (for onboarding UI)
 * 
 * Query params:
 * - estimateCost=true: Include cost estimate
 * - days=N: Days to analyze (for cost estimate)
 * - provider=anthropic|openai: LLM provider (for cost estimate)
 * - model=string: Model override (for cost estimate)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const estimateCost = searchParams.get("estimateCost") === "true";
    const daysParam = searchParams.get("days") || "14";
    const maxSizeMbParam = searchParams.get("maxSizeMb");
    const provider = searchParams.get("provider") || "anthropic";
    const model = searchParams.get("model");

    // Check Python version first
    const pythonVersion = checkPythonVersion();
    if (!pythonVersion) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Python not found. Please install Python 3.10+ from https://python.org or via Homebrew (brew install python@3.11)",
          errorType: "python_not_found"
        },
        { status: 500 }
      );
    }
    
    if (!pythonVersion.meetsRequirement) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Python ${pythonVersion.version} detected, but Python 3.10+ is required. Please upgrade: macOS: brew install python@3.11 | Windows: Download from https://python.org`,
          errorType: "python_version_too_old",
          detectedVersion: pythonVersion.version
        },
        { status: 500 }
      );
    }

    // Validate days parameter (if provided)
    if (estimateCost) {
      const days = parseInt(daysParam, 10);
      if (isNaN(days) || days < 1 || days > 365) {
        return NextResponse.json(
          { success: false, error: "Days must be between 1 and 365" },
          { status: 400 }
        );
      }
    }

    const pythonPath = getPythonPath();
    const scriptPath = path.join(process.cwd(), "engine", "generate_themes.py");
    
    // Build args based on mode
    const args: string[] = [scriptPath];
    
    if (estimateCost) {
      // Cost estimation mode - includes both DB metrics and cost
      args.push("--estimate-cost");
      args.push("--days", daysParam);
      args.push("--provider", provider);
      if (maxSizeMbParam) {
        const maxSizeMb = parseInt(maxSizeMbParam, 10);
        if (!isNaN(maxSizeMb) && maxSizeMb > 0 && maxSizeMb <= 10000) {
          args.push("--max-size-mb", String(maxSizeMb));
        }
      }
      if (model) {
        args.push("--model", model);
      }
    } else {
      // DB metrics only mode
      args.push("--estimate-only");
    }

    console.log(`[GenerateThemes] Running: ${pythonPath} ${args.join(" ")}`);

    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const proc = spawn(pythonPath, args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
        },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Script failed with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (parseError) {
          reject(new Error(`Failed to parse script output: ${parseError}`));
        }
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn script: ${err.message}`));
      });
    });

    // Return format depends on mode
    if (estimateCost) {
      // Cost estimation mode returns both metrics and cost
      // Validate structure before returning
      if (!result.dbMetrics || !result.costEstimate) {
        return NextResponse.json(
          { 
            success: false, 
            error: "Invalid response structure from cost estimation script" 
          },
          { status: 500 }
        );
      }
      
      return NextResponse.json({
        success: true,
        dbMetrics: result.dbMetrics,
        costEstimate: result.costEstimate,
      });
    } else {
      // DB metrics only mode
      return NextResponse.json({
        success: true,
        metrics: result,
      });
    }

  } catch (error) {
    console.error("[GenerateThemes] Estimate error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}
