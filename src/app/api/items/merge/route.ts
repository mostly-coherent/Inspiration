import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Item } from "@/lib/types";

export const maxDuration = 10; // 10 seconds

// Extended item type for runtime data that may have additional fields
type RuntimeItem = Item & { sourceDates?: string[] };

// POST /api/items/merge - Merge multiple items into one
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length < 2) {
      return NextResponse.json(
        { success: false, error: "At least 2 item IDs required for merge" },
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

    // Fetch items to merge from Supabase
    const { data: itemsData, error: itemsError } = await supabase
      .from("library_items")
      .select("*")
      .in("id", ids);
    
    if (itemsError) {
      console.error("Error fetching items from Supabase:", itemsError);
      return NextResponse.json({
        success: false,
        error: "Failed to fetch items from database",
      }, { status: 500 });
    }

    if (!itemsData || itemsData.length < 2) {
      return NextResponse.json(
        { success: false, error: "Could not find enough items to merge" },
        { status: 400 }
      );
    }

    // Transform Supabase data to Item format
    const itemsToMerge: RuntimeItem[] = itemsData.map((item: any) => ({
      id: item.id,
      itemType: item.item_type,
      title: item.title,
      description: item.description,
      tags: item.tags || [],
      status: item.status,
      quality: item.quality,
      occurrence: item.occurrence,
      sourceConversations: item.source_conversations,
      firstSeen: item.first_seen,
      lastSeen: item.last_seen,
      categoryId: item.category_id,
      sourceDates: item.source_dates || [],
      // Legacy fields
      mode: item.mode,
      theme: item.theme,
    }));

    // Sort by occurrence (highest first) to pick the "primary" item
    itemsToMerge.sort((a, b) => (b.occurrence || 0) - (a.occurrence || 0));
    const primary = itemsToMerge[0];
    const others = itemsToMerge.slice(1);

    // Aggregate data from other items into primary
    const allSourceDates = new Set<string>(primary.sourceDates || []);
    const allTags = new Set<string>(primary.tags || []);
    let totalOccurrence = primary.occurrence || 1;
    let earliestFirstSeen = new Date(primary.firstSeen);
    let latestLastSeen = new Date(primary.lastSeen);
    let totalSourceConversations = primary.sourceConversations || 0;

    for (const item of others) {
      // Aggregate source dates (if present)
      (item.sourceDates || []).forEach((d) => allSourceDates.add(d));
      
      // Aggregate tags
      (item.tags || []).forEach((t) => allTags.add(t));
      
      // Sum occurrences
      totalOccurrence += item.occurrence || 1;
      
      // Sum source conversations
      totalSourceConversations += item.sourceConversations || 0;
      
      // Expand date range
      const itemFirstSeen = new Date(item.firstSeen);
      const itemLastSeen = new Date(item.lastSeen);
      if (itemFirstSeen < earliestFirstSeen) earliestFirstSeen = itemFirstSeen;
      if (itemLastSeen > latestLastSeen) latestLastSeen = itemLastSeen;
    }

    // Update primary item in Supabase
    const { error: updateError } = await supabase
      .from("library_items")
      .update({
        source_dates: Array.from(allSourceDates).sort(),
        tags: Array.from(allTags),
        occurrence: totalOccurrence,
        source_conversations: totalSourceConversations,
        first_seen: earliestFirstSeen.toISOString(),
        last_seen: latestLastSeen.toISOString(),
      })
      .eq("id", primary.id);
    
    if (updateError) {
      console.error("Error updating primary item in Supabase:", updateError);
      return NextResponse.json({
        success: false,
        error: "Failed to merge items",
      }, { status: 500 });
    }

    // Remove merged items (keep primary)
    const otherIds = others.map((i) => i.id);
    const { error: deleteError } = await supabase
      .from("library_items")
      .delete()
      .in("id", otherIds);
    
    if (deleteError) {
      console.error("Error deleting merged items from Supabase:", deleteError);
      return NextResponse.json({
        success: false,
        error: "Failed to delete merged items",
      }, { status: 500 });
    }

    // Update category itemIds (remove deleted items)
    const { data: categories, error: categoriesError } = await supabase
      .from("library_categories")
      .select("*");
    
    if (!categoriesError && categories) {
      const otherIdSet = new Set(otherIds);
      for (const category of categories) {
        if (category.item_ids && category.item_ids.length > 0) {
          const updatedItemIds = category.item_ids.filter((id: string) => !otherIdSet.has(id));
          if (updatedItemIds.length !== category.item_ids.length) {
            if (updatedItemIds.length > 0) {
              // Update category with new itemIds
              await supabase
                .from("library_categories")
                .update({ item_ids: updatedItemIds })
                .eq("id", category.id);
            } else {
              // Delete empty category
              await supabase
                .from("library_categories")
                .delete()
                .eq("id", category.id);
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      primaryId: primary.id,
      mergedCount: others.length,
      message: `Merged ${others.length} items into "${primary.title}"`,
    });
  } catch (error) {
    console.error("[Items Merge] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
