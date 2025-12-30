import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export const maxDuration = 300; // 5 minutes

export async function POST() {
  try {
    const enginePath = path.resolve(process.cwd(), "engine");
    const scriptPath = path.join(enginePath, "scripts", "sync_messages.py");

    // Check if running on Vercel (simplified check: if local cursor DB path is missing)
    // We'll let the script fail if it can't find the DB, and handle the error output.
    
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
          console.error("Sync script failed:", stderr);
          // Check for specific "Database not found" error
          if (stderr.includes("Database not found") || stderr.includes("not found at")) {
             resolve(NextResponse.json(
              { 
                success: false, 
                error: "Cannot sync from cloud environment. The app cannot access your local Cursor database when running on Vercel. Please run the app locally to sync." 
              },
              { status: 400 }
            ));
          } else {
            resolve(NextResponse.json(
              { success: false, error: stderr || "Unknown error occurred during sync" },
              { status: 500 }
            ));
          }
        } else {
          // Parse stdout for stats
          const indexedMatch = stdout.match(/Indexed: (\d+)/);
          const failedMatch = stdout.match(/Failed: (\d+)/);
          const skippedMatch = stdout.match(/Already indexed.*?(\d+)/);
          const indexed = indexedMatch ? parseInt(indexedMatch[1]) : 0;
          const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
          const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;
          
          // Check if there were no new messages
          if (stdout.includes("No new messages to sync")) {
            resolve(NextResponse.json({ 
              success: true, 
              message: "Brain is up to date",
              stats: { indexed: 0, skipped, failed }
            }));
          } else {
            resolve(NextResponse.json({ 
              success: true, 
              message: "Sync completed successfully",
              stats: { indexed, skipped, failed }
            }));
          }
        }
      });
    });
  } catch (error) {
    console.error("Sync API error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

