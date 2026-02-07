import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Get conversation and message count breakdown by source (Cursor, Claude Code, Workspace Docs).
 *
 * Returns:
 *   {
 *     cursor: { conversations: number, messages: number },
 *     claudeCode: { conversations: number, messages: number },
 *     workspaceDocs: { documents: number }
 *   }
 */
export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({
      cursor: { conversations: 0, messages: 0 },
      claudeCode: { conversations: 0, messages: 0 },
      workspaceDocs: { documents: 0 },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Fetch chat source stats and workspace doc count in parallel
    const [rpcResult, docsResult] = await Promise.all([
      supabase.rpc("get_source_stats"),
      supabase
        .from("cursor_messages")
        .select("message_id", { count: "exact", head: true })
        .eq("source", "workspace_docs"),
    ]);

    const chatStats = rpcResult.error
      ? { cursor: { conversations: 0, messages: 0 }, claudeCode: { conversations: 0, messages: 0 } }
      : rpcResult.data;

    if (rpcResult.error) {
      console.error("Error fetching source stats via RPC:", rpcResult.error);
    }

    const docsCount = docsResult.error ? 0 : (docsResult.count ?? 0);

    return NextResponse.json({
      ...chatStats,
      workspaceDocs: { documents: docsCount },
    });
  } catch (error) {
    console.error("Error fetching source breakdown:", error);
    return NextResponse.json({
      cursor: { conversations: 0, messages: 0 },
      claudeCode: { conversations: 0, messages: 0 },
      workspaceDocs: { documents: 0 },
    });
  }
}
