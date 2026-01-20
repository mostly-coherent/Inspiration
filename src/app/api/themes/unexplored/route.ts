import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getPythonPath } from "@/lib/pythonPath";
import { isCloudEnvironment, getCloudErrorMessage } from "@/lib/vercel";

export const maxDuration = 60; // 60 seconds for analysis

interface UnexploredArea {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  stats: {
    conversationCount: number;
    libraryItemCount: number;
  };
  sampleConversations: string[];
  layer: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "90");
  const includeLow = searchParams.get("includeLow") === "true";

  // Check if running in cloud environment
  if (isCloudEnvironment()) {
    return NextResponse.json(
      {
        success: false,
        error: getCloudErrorMessage("Unexplored Territory Detection"),
        areas: [],
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
      "unexplored_territory.py"
    );

    // Build command args
    const args = [scriptPath, "--json", "--days", days.toString()];
    if (includeLow) {
      args.push("--include-low");
    }

    // Run Python script
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

      // Timeout after maxDuration (60 seconds)
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
      }, 55000); // 55 seconds (5 seconds before maxDuration)

      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
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

    let areas: UnexploredArea[];
    try {
      areas = JSON.parse(result);
      if (!Array.isArray(areas)) {
        throw new Error("Python script returned invalid JSON format (expected array)");
      }
    } catch (parseError) {
      console.error("Failed to parse Python output:", parseError);
      throw new Error(`Failed to parse Python output: ${parseError instanceof Error ? parseError.message : "Invalid JSON"}`);
    }

    return NextResponse.json({
      success: true,
      areas,
      count: areas.length,
      analyzedDays: days,
    });
  } catch (error) {
    console.error("Error detecting unexplored areas:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        areas: [],
      },
      { status: 500 }
    );
  }
}
