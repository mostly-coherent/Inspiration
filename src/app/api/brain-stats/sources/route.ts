import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Get message count breakdown by source (Cursor vs Claude Code).
 *
 * Returns:
 *   { cursor: number, claudeCode: number }
 */
export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ cursor: 0, claudeCode: 0 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Count Cursor messages
    const { count: cursorCount, error: cursorError } = await supabase
      .from("cursor_messages")
      .select("*", { count: "exact", head: true })
      .eq("source", "cursor");

    if (cursorError) {
      console.error("Error counting Cursor messages:", cursorError);
    }

    // Count Claude Code messages
    const { count: claudeCodeCount, error: claudeError } = await supabase
      .from("cursor_messages")
      .select("*", { count: "exact", head: true })
      .eq("source", "claude_code");

    if (claudeError) {
      console.error("Error counting Claude Code messages:", claudeError);
    }

    return NextResponse.json({
      cursor: cursorCount || 0,
      claudeCode: claudeCodeCount || 0,
    });
  } catch (error) {
    console.error("Error fetching source breakdown:", error);
    return NextResponse.json({ cursor: 0, claudeCode: 0 });
  }
}
