import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 10; // 10 seconds

function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * GET /api/coverage/runs
 * 
 * Get coverage runs (filtered by status).
 * Query params:
 * - status: "pending" | "history" | "all" (default: "pending")
 * - limit: number (default: 20)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Supabase not configured" },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") || "pending";
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    let query = supabase.from("coverage_runs").select("*");

    if (status === "pending") {
      query = query.in("status", ["queued", "processing"]).order("created_at", { ascending: true });
    } else if (status === "history") {
      query = query
        .in("status", ["completed", "failed", "cancelled"])
        .order("completed_at", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data, error } = await query.limit(limit);

    if (error) {
      console.error("Error fetching runs:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      runs: data || [],
    });
  } catch (error) {
    console.error("[Coverage Runs GET] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/coverage/runs
 * 
 * Create a new coverage run.
 * Body: SuggestedRun data
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Supabase not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      weekLabel,
      startDate,
      endDate,
      itemType = "idea",
      expectedItems,
      conversationCount,
      messageCount,
      existingItems,
      priority,
      reason,
      estimatedCost,
    } = body;

    // Validate required fields
    if (!weekLabel || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: weekLabel, startDate, endDate" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.from("coverage_runs").insert({
      week_label: weekLabel,
      start_date: startDate,
      end_date: endDate,
      item_type: itemType,
      expected_items: expectedItems || 5,
      conversation_count: conversationCount || 0,
      message_count: messageCount || 0,
      existing_items: existingItems || 0,
      priority: priority || "medium",
      reason: reason || "",
      estimated_cost: estimatedCost || 0,
      status: "queued",
    }).select().single();

    if (error) {
      console.error("Error creating run:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      run: data,
    });
  } catch (error) {
    console.error("[Coverage Runs POST] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/coverage/runs
 * 
 * Update a coverage run's status.
 * Body: { id, status, progress?, actualItems?, actualCost?, error? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Supabase not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { id, status, progress, actualItems, actualCost, error: runError } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: id, status" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = { status };

    if (status === "processing") {
      updateData.started_at = new Date().toISOString();
    }

    if (["completed", "failed", "cancelled"].includes(status)) {
      updateData.completed_at = new Date().toISOString();
    }

    if (progress !== undefined) {
      updateData.progress = progress;
    }

    if (actualItems !== undefined) {
      updateData.actual_items = actualItems;
    }

    if (actualCost !== undefined) {
      updateData.actual_cost = actualCost;
    }

    if (runError !== undefined) {
      updateData.error = runError;
    }

    const { data, error } = await supabase
      .from("coverage_runs")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating run:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      run: data,
    });
  } catch (error) {
    console.error("[Coverage Runs PATCH] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/coverage/runs
 * 
 * Delete a coverage run.
 * Query params: id
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Supabase not configured" },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing required param: id" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("coverage_runs")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting run:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("[Coverage Runs DELETE] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
