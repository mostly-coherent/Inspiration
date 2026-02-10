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

export async function POST(request: Request) {
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

    // Parse request body for partial indexing parameters
    let maxSizeMb: number | undefined;
    let percentage: number | undefined;
    
    try {
      const body = await request.json();
      maxSizeMb = body.maxSizeMb;
      percentage = body.percentage;
    } catch {
      // No body or invalid JSON - use default full sync
    }

    // Local environment: spawn Python process
    const enginePath = path.resolve(process.cwd(), "engine");
    const pythonPath = getPythonPath();
    
    // Choose script based on whether this is partial indexing or full sync
    let scriptPath: string;
    let args: string[] = [];
    
    if (maxSizeMb !== undefined && maxSizeMb > 0) {
      // Partial indexing with size limit
      scriptPath = path.join(enginePath, "scripts", "index_all_messages.py");
      args = ["--batch-size", "200", "--max-size-mb", maxSizeMb.toString()];
      console.log(`Starting partial indexing: ${maxSizeMb}MB (${percentage}%)`);
    } else {
      // Full incremental sync (default)
      scriptPath = path.join(enginePath, "scripts", "sync_messages.py");
      console.log("Starting full incremental sync");
    }
    
    return new Promise<NextResponse>((resolve, reject) => {
      const proc = spawn(pythonPath, [scriptPath, ...args], {
        cwd: enginePath,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("error", (err) => {
        console.error("Sync process spawn error:", err);
        reject(NextResponse.json(
          {
            success: false,
            errorType: "spawn_failed",
            error: `Failed to start sync process: ${err.message}`,
            remediation: "Check that Python is installed and accessible."
          },
          { status: 500 }
        ));
      });

      proc.on("close", (code) => {
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
          // Parse stdout for multi-source stats
          const cursorMatch = stdout.match(/Cursor:\s+(\d+)\s+indexed,\s+(\d+)\s+skipped,\s+(\d+)\s+failed/);
          const claudeMatch = stdout.match(/Claude:\s+(\d+)\s+indexed,\s+(\d+)\s+skipped,\s+(\d+)\s+failed/);
          const workspaceDocsMatch = stdout.match(/Workspace Docs:\s+(\d+)\s+indexed,\s+(\d+)\s+skipped,\s+(\d+)\s+failed/);

          const stats: any = {};

          if (cursorMatch) {
            stats.cursor = {
              indexed: parseInt(cursorMatch[1]),
              skipped: parseInt(cursorMatch[2]),
              failed: parseInt(cursorMatch[3]),
            };
          }

          if (claudeMatch) {
            stats.claudeCode = {
              indexed: parseInt(claudeMatch[1]),
              skipped: parseInt(claudeMatch[2]),
              failed: parseInt(claudeMatch[3]),
            };
          }

          if (workspaceDocsMatch) {
            stats.workspaceDocs = {
              indexed: parseInt(workspaceDocsMatch[1]),
              skipped: parseInt(workspaceDocsMatch[2]),
              failed: parseInt(workspaceDocsMatch[3]),
            };
          }

          const totalIndexed =
            (stats.cursor?.indexed || 0) +
            (stats.claudeCode?.indexed || 0) +
            (stats.workspaceDocs?.indexed || 0);
          
          const totalSkipped =
            (stats.cursor?.skipped || 0) +
            (stats.claudeCode?.skipped || 0) +
            (stats.workspaceDocs?.skipped || 0);

          // Check if there were no new messages
          if (totalIndexed === 0) {
            resolve(NextResponse.json({
              success: true,
              message: "Brain is up to date",
              stats: {
                ...stats,
                indexed: totalIndexed,
                skipped: totalSkipped,
              },
            }));
          } else {
            resolve(NextResponse.json({
              success: true,
              message: `Synced ${totalIndexed} new message${totalIndexed === 1 ? '' : 's'}`,
              stats: {
                ...stats,
                indexed: totalIndexed,
                skipped: totalSkipped,
              },
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

