import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { existsSync, readdirSync } from "fs";
import { getPythonPath } from "@/lib/pythonPath";

export const maxDuration = 120; // 2 minutes

interface HarmonizeResult {
  success: boolean;
  mode: string;
  filesProcessed: number;
  itemsAdded: number;
  itemsUpdated: number;
  error?: string;
}

// GET: Check for pending files
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "insights";
  
  try {
    const outputDir = path.resolve(
      process.cwd(),
      "data",
      mode === "ideas" ? "ideas_output" : "insights_output"
    );
    
    if (!existsSync(outputDir)) {
      return NextResponse.json({
        success: true,
        mode,
        pendingFiles: 0,
        files: [],
      });
    }
    
    const files = readdirSync(outputDir).filter((f) => f.endsWith(".md"));
    
    return NextResponse.json({
      success: true,
      mode,
      pendingFiles: files.length,
      files: files.slice(0, 10), // Return first 10 filenames
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST: Run harmonization
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => {
      throw new Error("Invalid JSON in request body");
    });
    const mode = body.mode || "insights";
    
    if (!["insights", "ideas"].includes(mode)) {
      return NextResponse.json(
        { success: false, error: `Invalid mode: ${mode}` },
        { status: 400 }
      );
    }
    
    const enginePath = path.resolve(process.cwd(), "engine");
    const scriptPath = path.join(enginePath, "scripts", "harmonize.py");
    const pythonPath = getPythonPath();
    
    const result = await runHarmonize(pythonPath, scriptPath, enginePath, mode);
    
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

async function runHarmonize(
  pythonPath: string,
  scriptPath: string,
  cwd: string,
  mode: string
): Promise<HarmonizeResult> {
  return new Promise((resolve) => {
    const proc = spawn(pythonPath, [scriptPath, "--mode", mode], {
      cwd,
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
      if (code === 0) {
        // Parse stats from output
        const filesMatch = stdout.match(/Processed (\d+) file/);
        const addedMatch = stdout.match(/Added (\d+) new/);
        const updatedMatch = stdout.match(/Updated (\d+) existing/);
        
        resolve({
          success: true,
          mode,
          filesProcessed: filesMatch ? parseInt(filesMatch[1]) : 0,
          itemsAdded: addedMatch ? parseInt(addedMatch[1]) : 0,
          itemsUpdated: updatedMatch ? parseInt(updatedMatch[1]) : 0,
        });
      } else {
        resolve({
          success: false,
          mode,
          filesProcessed: 0,
          itemsAdded: 0,
          itemsUpdated: 0,
          error: stderr || stdout || `Script exited with code ${code}`,
        });
      }
    });

    proc.on("error", (error) => {
      resolve({
        success: false,
        mode,
        filesProcessed: 0,
        itemsAdded: 0,
        itemsUpdated: 0,
        error: String(error),
      });
    });
  });
}

