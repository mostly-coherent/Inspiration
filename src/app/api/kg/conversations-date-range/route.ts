import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/kg/conversations-date-range
 *
 * Returns the date range of all conversations in the knowledge graph.
 * Used for timeline slider initialization.
 *
 * Returns:
 * {
 *   minDate: "YYYY-MM-DD",
 *   maxDate: "YYYY-MM-DD",
 *   totalConversations: number
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase not configured", minDate: null, maxDate: null, totalConversations: 0 },
        { status: 200 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get date range from kg_conversations table
    const { data, error } = await supabase
      .from("kg_conversations")
      .select("date_month, date_day")
      .order("date_month", { ascending: true });

    if (error) {
      console.error("Error fetching conversation date range:", error);
      return NextResponse.json(
        { error: error.message, minDate: null, maxDate: null, totalConversations: 0 },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { minDate: null, maxDate: null, totalConversations: 0 },
        { status: 200 }
      );
    }

    // Find min and max dates
    // Use date_day if available, otherwise use date_month
    const dates = data
      .map((conv) => conv.date_day || conv.date_month)
      .filter((date): date is string => date !== null)
      .sort();

    const minDate = dates[0] || null;
    const maxDate = dates[dates.length - 1] || null;

    return NextResponse.json({
      minDate,
      maxDate,
      totalConversations: data.length,
    });
  } catch (error) {
    console.error("Error in /api/kg/conversations-date-range:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        minDate: null,
        maxDate: null,
        totalConversations: 0,
      },
      { status: 500 }
    );
  }
}
