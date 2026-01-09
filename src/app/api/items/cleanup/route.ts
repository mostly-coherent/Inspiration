import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 10; // 10 seconds

const STALE_DAYS = 90;

// GET /api/items/cleanup - Get count of stale items
export async function GET() {
  try {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({
        success: false,
        error: "Supabase not configured",
      }, { status: 500 });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);
    const cutoffISO = cutoffDate.toISOString();

    // Fetch stale items from Supabase
    // Criteria: status NOT archived/implemented/posted, quality NOT A, lastSeen older than cutoff
    const { data: staleData, error: staleError } = await supabase
      .from("library_items")
      .select("id, title, last_seen")
      .neq("status", "archived")
      .neq("status", "implemented")
      .neq("status", "posted")
      .or("quality.is.null,quality.neq.A")
      .lt("last_seen", cutoffISO);
    
    if (staleError) {
      console.error("Error fetching stale items from Supabase:", staleError);
      return NextResponse.json({
        success: false,
        error: "Failed to fetch items from database",
      }, { status: 500 });
    }

    const staleItems = (staleData || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      lastSeen: item.last_seen,
      daysSinceLastSeen: Math.floor((now.getTime() - new Date(item.last_seen).getTime()) / (24 * 60 * 60 * 1000)),
    }));

    return NextResponse.json({
      success: true,
      staleCount: staleItems.length,
      staleItems,
      cutoffDays: STALE_DAYS,
    });
  } catch (error) {
    console.error("[Items Cleanup GET] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/items/cleanup - Archive stale items
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { dryRun = false } = body as { dryRun?: boolean };

    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({
        success: false,
        error: "Supabase not configured",
      }, { status: 500 });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);
    const cutoffISO = cutoffDate.toISOString();

    // Fetch stale items (same criteria as GET)
    const { data: staleData, error: staleError } = await supabase
      .from("library_items")
      .select("id, title, last_seen")
      .neq("status", "archived")
      .neq("status", "implemented")
      .neq("status", "posted")
      .or("quality.is.null,quality.neq.A")
      .lt("last_seen", cutoffISO);
    
    if (staleError) {
      console.error("Error fetching stale items from Supabase:", staleError);
      return NextResponse.json({
        success: false,
        error: "Failed to fetch items from database",
      }, { status: 500 });
    }

    const staleItems = staleData || [];
    const archivedItems = staleItems.map((item: any) => item.title);
    const itemIds = staleItems.map((item: any) => item.id);

    // Archive items in Supabase
    if (!dryRun && itemIds.length > 0) {
      const { error: updateError } = await supabase
        .from("library_items")
        .update({ status: "archived" })
        .in("id", itemIds);
      
      if (updateError) {
        console.error("Error archiving items in Supabase:", updateError);
        return NextResponse.json({
          success: false,
          error: "Failed to archive items",
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      archivedCount: staleItems.length,
      archivedItems: archivedItems.slice(0, 10), // Preview first 10
      dryRun,
      message: dryRun
        ? `Would archive ${staleItems.length} stale items`
        : `Archived ${staleItems.length} stale items`,
    });
  } catch (error) {
    console.error("[Items Cleanup POST] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
