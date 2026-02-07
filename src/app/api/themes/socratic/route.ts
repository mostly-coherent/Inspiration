import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getPythonPath } from "@/lib/pythonPath";
import { isCloudEnvironment, getCloudErrorMessage } from "@/lib/vercel";

export const maxDuration = 120; // 120 seconds for LLM calls

interface SocraticQuestion {
  id: string;
  question: string;
  category: "pattern" | "gap" | "tension" | "temporal" | "expert" | "alignment";
  evidence: string;
  difficulty: "comfortable" | "uncomfortable" | "confrontational";
}

/**
 * GET /api/themes/socratic
 * 
 * Generate or return cached Socratic reflection questions.
 * Query params:
 *   - force=true  → Force regeneration (ignore cache)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  if (isCloudEnvironment()) {
    return NextResponse.json(
      {
        success: false,
        error: getCloudErrorMessage("Socratic Reflection"),
        questions: [],
        cloudMode: true,
      },
      { status: 400 }
    );
  }

  try {
    const pythonPath = getPythonPath();
    const scriptPath = path.join(
      process.cwd(),
      "engine",
      "common",
      "socratic_engine.py"
    );

    const args = [scriptPath, "--json"];
    if (force) {
      args.push("--force");
    }

    const result = await new Promise<string>((resolve, reject) => {
      const python = spawn(pythonPath, args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PYTHONPATH: path.join(process.cwd(), "engine"),
        },
      });

      let stdout = "";
      let stderr = "";

      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Socratic engine stderr:", stderr);
          reject(new Error(stderr || `Process exited with code ${code}`));
        } else {
          resolve(stdout);
        }
      });

      python.on("error", (err) => {
        reject(err);
      });
    });

    // Parse the JSON output from stdout
    // The script outputs progress to stderr and JSON to stdout via --json flag
    const lines = result.trim().split("\n");
    let jsonStr = "";
    
    // Find the JSON array in stdout (skip progress lines)
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("[") || jsonStr) {
        jsonStr += trimmed;
      }
    }

    if (!jsonStr) {
      return NextResponse.json({
        success: true,
        questions: [],
        message: "No questions generated. Ensure you have Library items and indexed Memory.",
      });
    }

    const questions: SocraticQuestion[] = JSON.parse(jsonStr);

    return NextResponse.json({
      success: true,
      questions,
      count: questions.length,
      cached: !force,
    });
  } catch (error) {
    console.error("Socratic API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: String(error),
        questions: [],
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/themes/socratic
 * 
 * Handle question interactions (dismiss, resonate).
 * Body: { action: "dismiss" | "resonate", questionId: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, questionId } = body;

    if (!action || !questionId) {
      return NextResponse.json(
        { success: false, error: "Missing action or questionId" },
        { status: 400 }
      );
    }

    const pythonPath = getPythonPath();
    const scriptCode = action === "dismiss"
      ? `from common.socratic_engine import dismiss_question; dismiss_question("${questionId}")`
      : `from common.socratic_engine import mark_resonated; mark_resonated("${questionId}")`;

    const result = await new Promise<string>((resolve, reject) => {
      const python = spawn(pythonPath, ["-c", scriptCode], {
        cwd: path.join(process.cwd(), "engine"),
        env: {
          ...process.env,
          PYTHONPATH: path.join(process.cwd(), "engine"),
        },
      });

      let stdout = "";
      let stderr = "";

      python.stdout.on("data", (data) => { stdout += data.toString(); });
      python.stderr.on("data", (data) => { stderr += data.toString(); });

      python.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `Process exited with code ${code}`));
        } else {
          resolve(stdout);
        }
      });

      python.on("error", (err) => { reject(err); });
    });

    return NextResponse.json({
      success: true,
      action,
      questionId,
    });
  } catch (error) {
    console.error("Socratic POST error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
