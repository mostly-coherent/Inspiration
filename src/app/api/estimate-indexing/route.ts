import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getPythonPath } from "@/lib/pythonPath";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }
    
    const { sizeMb } = body;

    if (!sizeMb || sizeMb <= 0) {
      return NextResponse.json(
        { error: "Invalid size parameter" },
        { status: 400 }
      );
    }

    // Call Python script to estimate
    const scriptPath = path.join(process.cwd(), "engine", "estimate_indexing.py");
    const pythonPath = getPythonPath();
    
    const python = spawn(pythonPath, [
      scriptPath,
      "--size-mb",
      sizeMb.toString(),
    ]);

    let output = "";
    let errorOutput = "";

    python.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });

    python.stderr.on("data", (data: Buffer) => {
      errorOutput += data.toString();
    });

    // Wait for script to complete with timeout (30 seconds)
    const exitCode = await Promise.race<number>([
      new Promise<number>((resolve) => {
        python.on("close", (code) => resolve(code || 0));
      }),
      new Promise<number>((resolve) => {
        setTimeout(() => {
          python.kill();
          resolve(-1); // Timeout exit code
        }, 30000);
      }),
    ]);

    if (exitCode === -1) {
      return NextResponse.json(
        { error: "Estimation script timed out after 30 seconds" },
        { status: 500 }
      );
    }
    
    if (exitCode !== 0) {
      console.error("Estimation script failed:", errorOutput);
      return NextResponse.json(
        { error: "Failed to estimate indexing", details: errorOutput },
        { status: 500 }
      );
    }

    // Parse result
    try {
      const result = JSON.parse(output);
      
      return NextResponse.json({
        timeMinutes: result.time_minutes || 0,
        costUsd: result.cost_usd || 0,
        messages: result.messages || 0,
        dateRange: result.date_range || "Unknown",
        coverageMonths: result.coverage_months || 0,
      });
    } catch (parseError) {
      console.error("Failed to parse estimation result:", parseError);
      return NextResponse.json(
        { error: "Invalid estimation result", details: output },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Estimation API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
