import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getPythonPath } from "@/lib/pythonPath";

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
  provider?: "anthropic" | "openai" | "openrouter";
  model?: string;
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
      days = 14, 
      maxConversations = 80, 
      provider = "anthropic",
      model 
    } = body;

    // Validate days
    if (days < 1 || days > 365) {
      return NextResponse.json(
        { success: false, error: "Days must be between 1 and 365" },
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
    
    if (model) {
      args.push("--model", model);
    }

    console.log(`[GenerateThemes] Running: ${pythonPath} ${args.join(" ")}`);

    // Run Python script
    const result = await new Promise<ThemeMapResult>((resolve, reject) => {
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
 * - provider=anthropic|openai|openrouter: LLM provider (for cost estimate)
 * - model=string: Model override (for cost estimate)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const estimateCost = searchParams.get("estimateCost") === "true";
    const daysParam = searchParams.get("days") || "14";
    const provider = searchParams.get("provider") || "anthropic";
    const model = searchParams.get("model");

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
