import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  // Check if credentials are configured
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({
      success: false,
      error: "Supabase credentials not configured",
      details: {
        url: !!supabaseUrl,
        anonKey: !!supabaseKey,
      },
    });
  }

  try {
    // Create client and test connection
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Try to query the cursor_messages table (or check if it exists)
    const { count, error } = await supabase
      .from("cursor_messages")
      .select("*", { count: "exact", head: true });

    if (error) {
      // Check if it's a "table doesn't exist" error
      if (error.code === "42P01" || error.message.includes("does not exist")) {
        return NextResponse.json({
          success: false,
          error: "Connection works but tables not initialized",
          details: {
            connected: true,
            tablesExist: false,
            hint: "Run the SQL script: engine/scripts/init_vector_db.sql",
          },
        });
      }
      
      return NextResponse.json({
        success: false,
        error: error.message,
        details: {
          code: error.code,
          hint: error.hint,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Connection successful",
      details: {
        connected: true,
        tablesExist: true,
        messageCount: count ?? 0,
      },
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

