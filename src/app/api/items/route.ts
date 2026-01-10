import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ItemsBank } from "@/lib/types";

export const maxDuration = 10; // 10 seconds (much faster than JSON parsing)

// GET /api/items?theme=generation&mode=idea&view=items|categories&page=1&pageSize=50
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const theme = searchParams.get("theme") as "generation" | "seek" | null;
    const mode = searchParams.get("mode");
    const view = searchParams.get("view") || "items"; // "items" or "categories"
    
    // Pagination parameters
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const paginateItems = searchParams.get("paginate") !== "false"; // Default to paginated
    
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
    
    // Build items query
    let itemsQuery = supabase
      .from("library_items")
      .select("*", { count: "exact" });
    
    // Apply filters
    if (theme) {
      itemsQuery = itemsQuery.eq("theme", theme);
    }
    if (mode) {
      itemsQuery = itemsQuery.eq("mode", mode);
    }
    
    // Apply sorting
    itemsQuery = itemsQuery.order("occurrence", { ascending: false });
    
    // Apply pagination if requested
    if (paginateItems) {
      const startIndex = (page - 1) * pageSize;
      itemsQuery = itemsQuery.range(startIndex, startIndex + pageSize - 1);
    }
    
    // Execute items query
    const { data: itemsData, count: totalItems, error: itemsError } = await itemsQuery;
    
    if (itemsError) {
      console.error("[Items Supabase] Error fetching items:", itemsError);
      return NextResponse.json({
        success: false,
        error: itemsError.message,
      }, { status: 500 });
    }
    
    // Transform Supabase data to match frontend Item type
    const items = (itemsData || []).map((item: any) => ({
      id: item.id,
      itemType: item.item_type,
      title: item.title,
      description: item.description,
      status: item.status || "active",
      sourceConversations: item.source_conversations,
      occurrence: item.occurrence,
      firstSeen: item.first_seen,
      lastSeen: item.last_seen,
      categoryId: item.category_id,
      sourceDates: item.source_dates || [],
    }));
    
    // Build categories query
    let categoriesQuery = supabase
      .from("library_categories")
      .select("*");
    
    // Apply filters
    if (theme) {
      categoriesQuery = categoriesQuery.eq("theme", theme);
    }
    if (mode) {
      categoriesQuery = categoriesQuery.eq("mode", mode);
    }
    
    // Sort by item count (derived from item_ids array length)
    categoriesQuery = categoriesQuery.order("created_date", { ascending: false });
    
    // Execute categories query
    const { data: categoriesData, error: categoriesError } = await categoriesQuery;
    
    if (categoriesError) {
      console.error("[Items Supabase] Error fetching categories:", categoriesError);
      return NextResponse.json({
        success: false,
        error: categoriesError.message,
      }, { status: 500 });
    }
    
    // Transform Supabase data to match frontend Category type
    const categories = (categoriesData || []).map((category: any) => ({
      id: category.id,
      name: category.name,
      theme: category.theme,
      mode: category.mode,
      itemIds: category.item_ids || [],
      itemCount: (category.item_ids || []).length,
      similarityThreshold: category.similarity_threshold,
      createdDate: category.created_date,
    }));
    
    // Sort categories by itemCount (descending)
    categories.sort((a, b) => b.itemCount - a.itemCount);
    
    // Calculate stats
    const stats = {
      totalItems: totalItems || 0,
      totalCategories: categories.length,
      byMode: {} as Record<string, number>,
      byTheme: {} as Record<string, number>,
    };
    
    // Count by mode and theme
    items.forEach((item) => {
      if (item.mode) {
        stats.byMode[item.mode] = (stats.byMode[item.mode] || 0) + 1;
      }
      if (item.theme) {
        stats.byTheme[item.theme] = (stats.byTheme[item.theme] || 0) + 1;
      }
    });
    
    // Calculate pagination metadata
    const totalPages = paginateItems ? Math.ceil((totalItems || 0) / pageSize) : 1;
    
    return NextResponse.json({
      success: true,
      items: view === "items" ? items : [],
      categories,
      stats,
      lastUpdated: new Date().toISOString(),
      // Pagination metadata
      currentPage: page,
      pageSize,
      totalItems: totalItems || 0,
      totalPages,
      hasNextPage: paginateItems && page < totalPages,
      hasPreviousPage: paginateItems && page > 1,
    });
  } catch (error) {
    console.error("[Items Supabase] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
