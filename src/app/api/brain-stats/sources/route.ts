import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Get conversation and message count breakdown by source (Cursor vs Claude Code).
 *
 * Returns:
 *   {
 *     cursor: { conversations: number, messages: number },
 *     claudeCode: { conversations: number, messages: number }
 *   }
 */
export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({
      cursor: { conversations: 0, messages: 0 },
      claudeCode: { conversations: 0, messages: 0 },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Use RPC function for efficient counting (single query instead of pagination)
    const { data, error } = await supabase.rpc("get_source_stats");

    if (error) {
      console.error("Error fetching source stats via RPC:", error);
      // Fallback to zero counts on error
      return NextResponse.json({
        cursor: { conversations: 0, messages: 0 },
        claudeCode: { conversations: 0, messages: 0 },
      });
    }

    // RPC function returns JSON matching our response format
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching source breakdown:", error);
    return NextResponse.json({
      cursor: { conversations: 0, messages: 0 },
      claudeCode: { conversations: 0, messages: 0 },
    });
  }
}
