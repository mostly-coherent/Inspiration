import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300; // 5 minutes for generation (match /api/generate)

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
 * Execute a coverage run by calling the existing /api/generate endpoint.
 * This reuses all optimizations (abort handling, progress, harmonization, etc.)
 * 
 * Body: { id } - the run ID to execute
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

    // Map item_type to modeId for /api/generate
    // Database: "idea" | "insight" | "use_case"
    // API expects: "idea" | "insight" (modeId)
    const modeIdMap: Record<string, string> = {
      idea: "idea",
      insight: "insight",
      use_case: "idea", // Fallback
    };
    const modeId = modeIdMap[run.item_type] || "idea";

    // Build request body for /api/generate (same format as main page)
    const generateBody = {
      theme: "generation",
      modeId: modeId,
      mode: "custom", // Use custom mode to specify date range
      fromDate: run.start_date,
      toDate: run.end_date,
      itemCount: run.expected_items || 10,
      // Source tracking is handled by generate.py automatically when using date ranges
    };

    console.log(`[Coverage Execute] Calling /api/generate with:`, generateBody);

    // Call the existing /api/generate endpoint (reuses all optimizations)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
                    "http://localhost:3000";
    
    const generateResponse = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(generateBody),
    });

    const generateResult = await generateResponse.json();

    console.log(`[Coverage Execute] /api/generate result:`, {
      success: generateResult.success,
      itemsReturned: generateResult.stats?.itemsReturned,
      harmonization: generateResult.stats?.harmonization,
      error: generateResult.error,
    });

    // Extract actual items added from harmonization stats
    const actualItems = generateResult.stats?.harmonization?.itemsAdded ?? 
                       generateResult.stats?.itemsReturned ?? 
                       0;

    // Update run with results
    if (generateResult.success) {
      await supabase
        .from("coverage_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          progress: 100,
          actual_items: actualItems,
        })
        .eq("id", runId);

      return NextResponse.json({
        success: true,
        items: actualItems,
        message: `Generated ${actualItems} items for ${run.week_label}`,
        stats: generateResult.stats,
      });
    } else {
      await supabase
        .from("coverage_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: (generateResult.error || "Unknown error").slice(0, 1000),
        })
        .eq("id", runId);

      return NextResponse.json(
        { success: false, error: generateResult.error },
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
