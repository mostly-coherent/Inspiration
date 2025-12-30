import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export async function GET() {
  try {
    const enginePath = path.resolve(process.cwd(), "engine");
    const scriptPath = path.join(enginePath, "scripts", "diagnose_vector_db.py");

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
          console.error("Diagnostics script failed:", stderr);
          resolve(NextResponse.json(
            { 
              success: false, 
              error: stderr || "Unknown error",
            },
            { status: 500 }
          ));
        } else {
          try {
            // Parse JSON output from script (it outputs both human-readable and JSON)
            // Extract JSON part (after "📊 JSON Output:")
            const jsonMatch = stdout.match(/📊 JSON Output:\s*\n([\s\S]*)$/);
            if (jsonMatch) {
              const diagnostics = JSON.parse(jsonMatch[1].trim());
              resolve(NextResponse.json({ 
                success: true,
                diagnostics,
                output: stdout, // Include full output for debugging
              }));
            } else {
              // Fallback: try to parse entire stdout as JSON
              const diagnostics = JSON.parse(stdout.trim());
              resolve(NextResponse.json({ 
                success: true,
                diagnostics,
                output: stdout,
              }));
            }
          } catch (parseError) {
            console.error("Failed to parse diagnostics:", parseError);
            resolve(NextResponse.json(
              { 
                success: false, 
                error: "Failed to parse diagnostics output",
                output: stdout,
              },
              { status: 500 }
            ));
          }
        }
      });
    });
  } catch (error) {
    console.error("Brain diagnostics API error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

