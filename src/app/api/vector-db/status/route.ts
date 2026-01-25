import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import path from "path";
import { getPythonPath } from "@/lib/pythonPath";

export const dynamic = "force-dynamic";

// Initialize Supabase client
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (supabaseUrl && supabaseKey) {
    return createClient(supabaseUrl, supabaseKey);
  }
  return null;
}

/**
 * GET /api/vector-db/status
 * Get current Vector DB indexing status
 */
export async function GET() {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({
        success: false,
        error: "Supabase not configured",
      }, { status: 400 });
    }

    // Get indexed message count and date range
    const { data: latestMessage, error: latestError } = await supabase
      .from("cursor_messages")
      .select("timestamp, indexed_at")
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    if (latestError && latestError.code !== "PGRST116") {
      // PGRST116 = no rows returned (empty table)
      throw new Error(`Failed to query latest message: ${latestError.message}`);
    }

    const { count, error: countError } = await supabase
      .from("cursor_messages")
      .select("*", { count: "exact", head: true });

    if (countError) {
      throw new Error(`Failed to count messages: ${countError.message}`);
    }

    // Get total message count from local SQLite using Python script
    let totalMetrics: any = { total_size_mb: 0, total_messages: 0 };
    
    try {
      const scriptPath = path.join(process.cwd(), "engine", "common", "cursor_db.py");
      const pythonPath = getPythonPath();
      
      // Call estimate_history_metrics function
      const python = spawn(pythonPath, ["-c", 
        `import sys; sys.path.insert(0, "${path.join(process.cwd(), "engine")}"); from common.cursor_db import estimate_history_metrics; import json; print(json.dumps(estimate_history_metrics()))`
      ]);

      let output = "";
      python.stdout.on("data", (data: Buffer) => {
        output += data.toString();
      });

      await new Promise<void>((resolve) => {
        python.on("close", () => resolve());
      });

      if (output.trim()) {
        try {
          totalMetrics = JSON.parse(output.trim());
        } catch (parseError) {
          console.error("Failed to parse Python output:", parseError);
          // Continue with default values
        }
      }
    } catch (pythonError) {
      console.error("Failed to get total metrics from Python:", pythonError);
      // Continue with 0 values
    }

    const currentPercentage = totalMetrics.total_messages > 0
      ? Math.round(((count || 0) / totalMetrics.total_messages) * 100)
      : 0;

    // Format date range
    let dateRange = "N/A";
    if (latestMessage && latestMessage.timestamp) {
      const latestDate = new Date(latestMessage.timestamp);
      dateRange = `Up to ${latestDate.toLocaleDateString()}`;
    }

    // Format last sync date
    let lastSyncDate = "N/A";
    if (latestMessage && latestMessage.indexed_at) {
      lastSyncDate = new Date(latestMessage.indexed_at).toLocaleString();
    }

    return NextResponse.json({
      success: true,
      currentPercentage,
      indexedSizeMb: Math.round((count || 0) * 0.006), // ~6KB per message
      totalSizeMb: totalMetrics.total_size_mb,
      messageCount: count || 0,
      totalMessages: totalMetrics.total_messages,
      dateRange,
      lastSyncDate,
    });
  } catch (error) {
    console.error("Vector DB status API error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
