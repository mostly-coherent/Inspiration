import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getPythonPath } from "@/lib/pythonPath";
import { isCloudEnvironment, getCloudErrorMessage } from "@/lib/vercel";

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

  // Check if running in cloud environment
  if (isCloudEnvironment()) {
    return NextResponse.json(
      {
        success: false,
        error: getCloudErrorMessage("Counter-Intuitive Perspectives"),
        suggestions: [],
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
      let resolved = false;

      // Timeout after maxDuration (120 seconds)
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          python.kill("SIGTERM");
          // Force kill after 2 seconds if still running
          setTimeout(() => {
            if (!python.killed) {
              python.kill("SIGKILL");
            }
          }, 2000);
          reject(new Error("Python script timed out"));
        }
      }, 115000); // 115 seconds (5 seconds before maxDuration)

      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
        // Log progress messages
        console.log(data.toString());
      });

      python.on("close", (code) => {
        clearTimeout(timeout);
        if (resolved) return; // Already handled by timeout
        resolved = true;
        if (code === 0) {
          resolve(stdout);
        } else {
          console.error("Python stderr:", stderr);
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        }
      });

      python.on("error", (err) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
    });

    // Validate stdout is not empty before parsing
    if (!result || !result.trim()) {
      throw new Error("Python script returned empty output");
    }

    let suggestions: CounterIntuitiveSuggestion[];
    try {
      suggestions = JSON.parse(result);
      if (!Array.isArray(suggestions)) {
        throw new Error("Python script returned invalid JSON format (expected array)");
      }
    } catch (parseError) {
      console.error("Failed to parse Python output:", parseError);
      throw new Error(`Failed to parse Python output: ${parseError instanceof Error ? parseError.message : "Invalid JSON"}`);
    }

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
