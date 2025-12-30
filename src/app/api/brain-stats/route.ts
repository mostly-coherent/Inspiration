import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export async function GET() {
  try {
    const enginePath = path.resolve(process.cwd(), "engine");
    const scriptPath = path.join(enginePath, "scripts", "get_brain_stats.py");

    return new Promise<NextResponse>((resolve) => {
      const process = spawn("python3", [scriptPath], {
        cwd: enginePath,
      });

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code !== 0) {
          console.error("Brain stats script failed:", stderr);
          // Check for cloud environment
          if (stderr.includes("Database not found") || stderr.includes("not found at")) {
            resolve(NextResponse.json(
              { 
                success: false, 
                error: "Cannot get stats from cloud environment",
                localSize: null,
                vectorSize: null,
              },
              { status: 200 } // Return 200 so UI can handle gracefully
            ));
          } else {
            resolve(NextResponse.json(
              { success: false, error: stderr || "Unknown error", localSize: null, vectorSize: null },
              { status: 500 }
            ));
          }
        } else {
          try {
            // Parse JSON output from script
            const stats = JSON.parse(stdout.trim());
            resolve(NextResponse.json({ 
              success: true, 
              localSize: stats.localSize,
              vectorSize: stats.vectorSize,
              localSizeBytes: stats.localSizeBytes,
              vectorSizeBytes: stats.vectorSizeBytes,
            }));
          } catch (parseError) {
            console.error("Failed to parse brain stats:", parseError);
            resolve(NextResponse.json(
              { success: false, error: "Failed to parse stats", localSize: null, vectorSize: null },
              { status: 500 }
            ));
          }
        }
      });
    });
  } catch (error) {
    console.error("Brain stats API error:", error);
    return NextResponse.json(
      { success: false, error: String(error), localSize: null, vectorSize: null },
      { status: 500 }
    );
  }
}

