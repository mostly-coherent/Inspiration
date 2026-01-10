import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import path from "path";
import { getPythonPath } from "@/lib/pythonPath";

export const maxDuration = 300; // 5 minutes for generation

function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * POST /api/coverage/runs/execute
 * 
 * Execute a coverage run (start generation for a specific date range).
 * Body: { id } - the run ID to execute
 * 
 * This endpoint:
 * 1. Updates run status to "processing"
 * 2. Calls the Python engine with the date range
 * 3. Updates run with results
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: "Supabase not configured" },
      { status: 500 }
    );
  }

  let runId: string | null = null;

  try {
    const body = await request.json();
    runId = body.id;

    if (!runId) {
      return NextResponse.json(
        { success: false, error: "Missing required field: id" },
        { status: 400 }
      );
    }

    // Get the run details
    const { data: run, error: fetchError } = await supabase
      .from("coverage_runs")
      .select("*")
      .eq("id", runId)
      .single();

    if (fetchError || !run) {
      return NextResponse.json(
        { success: false, error: "Run not found" },
        { status: 404 }
      );
    }

    // Check if already processing/completed
    if (run.status === "processing") {
      return NextResponse.json(
        { success: false, error: "Run is already processing" },
        { status: 400 }
      );
    }

    if (run.status === "completed") {
      return NextResponse.json(
        { success: false, error: "Run is already completed" },
        { status: 400 }
      );
    }

    // Update status to processing
    await supabase
      .from("coverage_runs")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        progress: 0,
      })
      .eq("id", runId);

    // Build generation command
    const enginePath = path.resolve(process.cwd(), "engine");
    const pythonPath = getPythonPath();

    // Calculate days from date range
    const startDate = new Date(run.start_date);
    const endDate = new Date(run.end_date);
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Build args for generate.py
    // Using --start-date and --end-date for precise coverage
    const args = [
      "generate.py",
      "--mode", run.item_type || "idea",
      "--start-date", run.start_date,
      "--end-date", run.end_date,
      "--items", String(run.expected_items || 5),
      "--source-tracking", // Enable source date tracking for coverage
    ];

    console.log(`[Coverage Execute] Running: python3 ${args.join(" ")}`);

    // Execute generation
    const result = await new Promise<{ success: boolean; output: string; items: number }>((resolve) => {
      const proc = spawn(pythonPath, args, {
        cwd: enginePath,
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
        
        // Try to extract progress from output
        const progressMatch = stdout.match(/Progress:\s*(\d+)%/);
        if (progressMatch) {
          const progress = parseInt(progressMatch[1], 10);
          // Update progress in background (fire and forget)
          supabase
            .from("coverage_runs")
            .update({ progress })
            .eq("id", runId)
            .then(() => {});
        }
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          console.error(`[Coverage Execute] Python process failed: ${stderr}`);
          resolve({ success: false, output: stderr || "Unknown error", items: 0 });
        } else {
          // Try to parse the output for item count
          let items = 0;
          try {
            // Look for JSON output
            const jsonMatch = stdout.match(/\{[\s\S]*"items_added":\s*(\d+)[\s\S]*\}/);
            if (jsonMatch) {
              items = parseInt(jsonMatch[1], 10);
            } else {
              // Fallback: look for "Added X items" pattern
              const addedMatch = stdout.match(/Added\s+(\d+)\s+items?/i);
              if (addedMatch) {
                items = parseInt(addedMatch[1], 10);
              }
            }
          } catch {
            // Ignore parsing errors
          }
          resolve({ success: true, output: stdout, items });
        }
      });

      // Timeout after 4.5 minutes
      setTimeout(() => {
        proc.kill();
        resolve({ success: false, output: "Generation timed out", items: 0 });
      }, 270000);
    });

    // Update run with results
    if (result.success) {
      await supabase
        .from("coverage_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          progress: 100,
          actual_items: result.items,
        })
        .eq("id", runId);

      return NextResponse.json({
        success: true,
        items: result.items,
        message: `Generated ${result.items} items for ${run.week_label}`,
      });
    } else {
      await supabase
        .from("coverage_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: result.output.slice(0, 1000), // Truncate error
        })
        .eq("id", runId);

      return NextResponse.json(
        { success: false, error: result.output },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[Coverage Execute] Error:", error);

    // Try to update run status to failed
    if (runId && supabase) {
      await supabase
        .from("coverage_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: String(error).slice(0, 1000),
        })
        .eq("id", runId);
    }

    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
