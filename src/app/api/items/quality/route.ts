import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ItemQuality } from "@/lib/types";

export const maxDuration = 10; // 10 seconds

// PATCH /api/items/quality - Set quality for a single item
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, quality } = body as { id: string; quality: ItemQuality };

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Item ID required" },
        { status: 400 }
      );
    }

    if (quality !== null && !["A", "B", "C"].includes(quality)) {
      return NextResponse.json(
        { success: false, error: "Invalid quality value (must be A, B, C, or null)" },
        { status: 400 }
      );
    }

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

    // Update quality in Supabase
    const { error: updateError } = await supabase
      .from("library_items")
      .update({ quality: quality })
      .eq("id", id);
    
    if (updateError) {
      console.error("Error updating quality in Supabase:", updateError);
      return NextResponse.json({
        success: false,
        error: "Failed to update item quality",
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: quality ? `Set quality to ${quality}` : "Removed quality rating",
    });
  } catch (error) {
    console.error("[Items Quality] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
