import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getPythonPath } from "@/lib/pythonPath";

export const maxDuration = 300; // 5 minutes

// Detect cloud environment (Vercel, Railway, etc.)
function isCloudEnvironment(): boolean {
  return !!(
    process.env.VERCEL || 
    process.env.RAILWAY_ENVIRONMENT || 
    process.env.RENDER ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}

export async function POST() {
  try {
    // Fast path: If running in cloud, return immediately (cannot sync from cloud)
    if (isCloudEnvironment()) {
      console.log("Cloud environment detected - skipping sync");
      return NextResponse.json({
        success: false,
        errorType: "cloud_environment",
        error: "Cannot sync from cloud environment. The app cannot access your local Cursor database when running on Vercel.",
        remediation: "Run the app locally (npm run dev) to sync your chat history.",
        cloudMode: true,
      }, { status: 400 });
    }

    // Local environment: spawn Python process as before
    const enginePath = path.resolve(process.cwd(), "engine");
    const scriptPath = path.join(enginePath, "scripts", "sync_messages.py");
    const pythonPath = getPythonPath();
    
    return new Promise<NextResponse>((resolve) => {
      const process = spawn(pythonPath, [scriptPath], {
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
          
          // Enhanced error detection and messaging
          
          // 1. Database not found (cloud environment)
          if (stderr.includes("Database not found") || stderr.includes("not found at")) {
            resolve(NextResponse.json(
              { 
                success: false,
                errorType: "database_not_found",
                error: "Cannot sync from cloud environment. The app cannot access your local Cursor database when running on Vercel. Please run the app locally to sync.",
                remediation: "Run 'npm run dev' locally to sync your chat history."
              },
              { status: 400 }
            ));
          }
          // 2. Schema compatibility issue
          else if (stderr.includes("CRITICAL: No known extraction strategy") || stderr.includes("schema may have changed")) {
            resolve(NextResponse.json(
              { 
                success: false,
                errorType: "schema_incompatible",
                error: "Cursor database schema has changed and is no longer compatible with this version of Inspiration.",
                remediation: "Please run 'python3 engine/common/db_health_check.py' to generate a diagnostic report, then report the issue at https://github.com/mostly-coherent/Inspiration/issues",
                diagnosticCommand: "python3 engine/common/db_health_check.py"
              },
              { status: 500 }
            ));
          }
          // 3. Extraction failed (partial compatibility)
          else if (stderr.includes("Extraction failed") || stderr.includes("Failed to parse")) {
            resolve(NextResponse.json(
              { 
                success: false,
                errorType: "extraction_failed",
                error: "Failed to extract messages from Cursor database. The database structure may have changed.",
                remediation: "Try updating Cursor to the latest version, or run diagnostic: 'python3 engine/common/db_health_check.py'",
                diagnosticCommand: "python3 engine/common/db_health_check.py"
              },
              { status: 500 }
            ));
          }
          // 4. Generic error
          else {
            resolve(NextResponse.json(
              { 
                success: false,
                errorType: "unknown",
                error: stderr || "Unknown error occurred during sync",
                remediation: "Check logs and try again. If issue persists, report at https://github.com/mostly-coherent/Inspiration/issues"
              },
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

