import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ItemStatus } from "@/lib/types";

export const maxDuration = 10; // 10 seconds

// PATCH /api/items/bulk - Bulk status change
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, status } = body as { ids: string[]; status: ItemStatus };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "No item IDs provided" },
        { status: 400 }
      );
    }

    // Limit bulk operations to prevent database overload
    if (ids.length > 1000) {
      return NextResponse.json(
        { success: false, error: "Too many items. Maximum 1000 items per bulk operation." },
        { status: 400 }
      );
    }

    if (!status || !["active", "archived"].includes(status)) {
      return NextResponse.json(
        { success: false, error: "Invalid status" },
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

    // Update status for all items in Supabase
    const { error: updateError } = await supabase
      .from("library_items")
      .update({ status: status })
      .in("id", ids);
    
    if (updateError) {
      console.error("Error bulk updating items in Supabase:", updateError);
      return NextResponse.json({
        success: false,
        error: "Failed to update items",
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updatedCount: ids.length,
      message: `Updated ${ids.length} items to status: ${status}`,
    });
  } catch (error) {
    console.error("[Items Bulk PATCH] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/items/bulk - Bulk delete
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "No item IDs provided" },
        { status: 400 }
      );
    }

    // Limit bulk operations to prevent database overload
    if (ids.length > 1000) {
      return NextResponse.json(
        { success: false, error: "Too many items. Maximum 1000 items per bulk operation." },
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

    // Delete items from Supabase
    const { error: deleteError } = await supabase
      .from("library_items")
      .delete()
      .in("id", ids);
    
    if (deleteError) {
      console.error("Error bulk deleting items from Supabase:", deleteError);
      return NextResponse.json({
        success: false,
        error: "Failed to delete items",
      }, { status: 500 });
    }

    // Update category itemIds (remove deleted items)
    // Note: Items are already deleted above, so we clean up category references
    // If category updates fail, items are still deleted (partial success)
    const { data: categories, error: categoriesError } = await supabase
      .from("library_categories")
      .select("*");
    
    const categoryUpdateErrors: string[] = [];
    
    if (!categoriesError && categories) {
      const idSet = new Set(ids);
      for (const category of categories) {
        if (category.item_ids && category.item_ids.length > 0) {
          const updatedItemIds = category.item_ids.filter((id: string) => !idSet.has(id));
          if (updatedItemIds.length !== category.item_ids.length) {
            const { error: updateError } = await supabase
              .from("library_categories")
              .update({ item_ids: updatedItemIds })
              .eq("id", category.id);
            
            if (updateError) {
              console.error(`Error updating category ${category.id}:`, updateError);
              categoryUpdateErrors.push(`Category "${category.name || category.id}": ${updateError.message}`);
            }
          }
        }
      }
    }

    // Items are deleted successfully, but category cleanup may have had issues
    const response: {
      success: boolean;
      deletedCount: number;
      message: string;
      warnings?: string[];
    } = {
      success: true,
      deletedCount: ids.length,
      message: `Deleted ${ids.length} items`,
    };
    
    if (categoryUpdateErrors.length > 0) {
      response.warnings = categoryUpdateErrors;
      console.warn("[Items Bulk DELETE] Category cleanup had errors:", categoryUpdateErrors);
    }
    
    return NextResponse.json(response);
  } catch (error) {
    console.error("[Items Bulk DELETE] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
