import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getPythonPath } from "@/lib/pythonPath";

export const maxDuration = 120; // 120 seconds for LLM calls

interface CounterIntuitiveSuggestion {
  id: string;
  clusterTitle: string;
  clusterSize: number;
  counterPerspective: string;
  reasoning: string;
  suggestedAngles: string[];
  reflectionPrompt: string;
  isSaved: boolean;
  savedAt?: string;
  dismissed: boolean;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const minSize = parseInt(searchParams.get("minSize") || "5");
  const max = parseInt(searchParams.get("max") || "3");

  try {
    const pythonPath = getPythonPath();
    const scriptPath = path.join(
      process.cwd(),
      "engine",
      "common",
      "counter_intuitive.py"
    );

    const args = [
      scriptPath,
      "--json",
      "--min-size", minSize.toString(),
      "--max", max.toString(),
    ];

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
        // Log progress messages
        console.log(data.toString());
      });

      python.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          console.error("Python stderr:", stderr);
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        }
      });

      python.on("error", (err) => {
        reject(err);
      });
    });

    const suggestions: CounterIntuitiveSuggestion[] = JSON.parse(result);

    return NextResponse.json({
      success: true,
      suggestions,
      count: suggestions.length,
    });
  } catch (error) {
    console.error("Error generating counter-perspectives:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        suggestions: [],
      },
      { status: 500 }
    );
  }
}
