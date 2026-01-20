import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getPythonPath } from "@/lib/pythonPath";

export const maxDuration = 10; // 10 seconds max (fail fast on cloud)

// Detect cloud environment (Vercel, Railway, etc.)
function isCloudEnvironment(): boolean {
  return !!(
    process.env.VERCEL || 
    process.env.RAILWAY_ENVIRONMENT || 
    process.env.RENDER ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}

export async function GET() {
  try {
    // Fast path: If running in cloud, return immediately (no 8s wait)
    if (isCloudEnvironment()) {
      console.log("Cloud environment detected - skipping local DB access");
      
      // Try to get Vector DB stats from Supabase
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey);
          
          // Get earliest and latest message dates
          const { data: messages } = await supabase
            .from("cursor_messages")
            .select("timestamp")
            .order("timestamp", { ascending: true })
            .limit(1);
            
          const { data: latestMessages } = await supabase
            .from("cursor_messages")
            .select("timestamp")
            .order("timestamp", { ascending: false })
            .limit(1);
          
          // Get table size via RPC
          const { data: sizeData } = await supabase
            .rpc("get_table_size", { table_name: "cursor_messages" });
          
          // Get library size via RPC (if function exists)
          let librarySize = null;
          let librarySizeBytes = null;
          try {
            const { data: librarySizeData } = await supabase
              .rpc("get_library_size");
            if (librarySizeData) {
              librarySize = librarySizeData.total_size || null;
              librarySizeBytes = librarySizeData.total_size_bytes || null;
            }
          } catch {
            // Function might not exist yet
          }
          
          const earliestDate = messages?.[0]?.timestamp 
            ? new Date(messages[0].timestamp).toISOString().slice(0, 10) 
            : null;
          const latestDate = latestMessages?.[0]?.timestamp 
            ? new Date(latestMessages[0].timestamp).toISOString().slice(0, 10) 
            : null;
          
          return NextResponse.json({
            success: true,
            localSize: null,
            vectorSize: sizeData?.total_size || null,
            vectorSizeBytes: sizeData?.total_size_bytes || null,
            librarySize,
            librarySizeBytes,
            earliestDate,
            latestDate,
            cloudMode: true,
          });
        }
      } catch (supabaseError) {
        console.error("Failed to get Supabase stats:", supabaseError);
      }
      
      // Fallback: return cloud mode with null stats
      return NextResponse.json({
        success: true,
        localSize: null,
        vectorSize: null,
        earliestDate: null,
        latestDate: null,
        cloudMode: true,
      }, { status: 200 });
    }

    // Local environment: spawn Python process as before
    const enginePath = path.resolve(process.cwd(), "engine");
    const scriptPath = path.join(enginePath, "scripts", "get_brain_stats.py");
    const pythonPath = getPythonPath();

    return new Promise<NextResponse>((resolve) => {
      const process = spawn(pythonPath, [scriptPath], {
        cwd: enginePath,
      });

      let stdout = "";
      let stderr = "";
      let resolved = false;

      // Timeout after 5 seconds (reduced from 8s)
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          process.kill("SIGTERM");
          // Force kill after 1 second if still running
          setTimeout(() => {
            if (!process.killed) {
              process.kill("SIGKILL");
            }
          }, 1000);
          console.error("Brain stats timeout - likely no local DB");
          resolve(NextResponse.json(
            { 
              success: false, 
              error: "Cannot access local Cursor database",
              localSize: null,
              vectorSize: null,
              earliestDate: null,
              latestDate: null,
            },
            { status: 200 } // Return 200 so UI can handle gracefully
          ));
        }
      }, 5000);

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        clearTimeout(timeout);
        if (resolved) return; // Already handled by timeout
        resolved = true;
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
            // Validate stdout is not empty before parsing
            if (!stdout || !stdout.trim()) {
              throw new Error("Python script returned empty output");
            }
            
            // Parse JSON output from script
            const stats = JSON.parse(stdout.trim());
            
            // Validate stats structure
            if (typeof stats !== "object" || stats === null) {
              throw new Error("Python script returned invalid JSON format (expected object)");
            }
            
            resolve(NextResponse.json({ 
              success: true, 
              localSize: stats.localSize,
              vectorSize: stats.vectorSize,
              localSizeBytes: stats.localSizeBytes,
              vectorSizeBytes: stats.vectorSizeBytes,
              librarySize: stats.librarySize || null,
              librarySizeBytes: stats.librarySizeBytes || null,
              earliestDate: stats.earliestDate,
              latestDate: stats.latestDate,
            }));
          } catch (parseError) {
            console.error("Failed to parse brain stats:", parseError);
            resolve(NextResponse.json(
              { success: false, error: `Failed to parse stats: ${parseError instanceof Error ? parseError.message : "Invalid JSON"}`, localSize: null, vectorSize: null, earliestDate: null, latestDate: null },
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

