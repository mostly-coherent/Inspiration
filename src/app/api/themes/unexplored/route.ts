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

      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
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

    // Parse JSON output
    const areas: UnexploredArea[] = JSON.parse(result);

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
