import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 10; // 10 seconds

interface ThemeSummary {
  name: string;
  itemCount: number;
  categories: string[];
  topTags: string[];
  recentActivity: string; // ISO date
}

// GET /api/items/themes - Get theme synthesis summary
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

    // Fetch active items from Supabase
    const { data: itemsData, error: itemsError } = await supabase
      .from("library_items")
      .select("*")
      .neq("status", "archived");
    
    if (itemsError) {
      console.error("Error fetching items from Supabase:", itemsError);
      return NextResponse.json({
        success: false,
        error: "Failed to fetch items from database",
      }, { status: 500 });
    }
    
    // Fetch categories from Supabase
    const { data: categoriesData, error: categoriesError } = await supabase
      .from("library_categories")
      .select("*");
    
    if (categoriesError) {
      console.error("Error fetching categories from Supabase:", categoriesError);
      return NextResponse.json({
        success: false,
        error: "Failed to fetch categories from database",
      }, { status: 500 });
    }

    // Transform Supabase data
    const activeItems = (itemsData || []).map((item: any) => ({
      id: item.id,
      itemType: item.item_type,
      title: item.title,
      description: item.description,
      tags: item.tags || [],
      status: item.status,
      occurrence: item.occurrence,
      lastSeen: item.last_seen,
      categoryId: item.category_id,
    }));

    const categories = (categoriesData || []).map((cat: any) => ({
      id: cat.id,
      name: cat.name,
    }));

    // Group by category
    const categoryMap = new Map<string, {
      name: string;
      items: typeof activeItems;
    }>();

    for (const item of activeItems) {
      const catId = item.categoryId || "uncategorized";
      const category = categories.find((c: any) => c.id === catId);
      const catName = category?.name || "Uncategorized";
      
      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, { name: catName, items: [] });
      }
      categoryMap.get(catId)!.items.push(item);
    }

    // Build theme summaries from categories (sorted by item count)
    const themes: ThemeSummary[] = Array.from(categoryMap.entries())
      .map(([, data]) => {
        const items = data.items;
        
        // Collect all tags
        const tagCounts = new Map<string, number>();
        for (const item of items) {
          (item.tags || []).forEach((tag: string) => {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          });
        }
        
        // Top 5 tags
        const topTags = Array.from(tagCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([tag]) => tag);

        // Most recent activity
        const recentActivity = items.reduce((latest, item) => {
          const itemDate = new Date(item.lastSeen);
          return itemDate > new Date(latest) ? item.lastSeen : latest;
        }, items[0]?.lastSeen || new Date().toISOString());

        return {
          name: data.name,
          itemCount: items.length,
          categories: [data.name],
          topTags,
          recentActivity,
        };
      })
      .filter((theme) => theme.itemCount > 0)
      .sort((a, b) => b.itemCount - a.itemCount);

    // Overall stats
    const stats = {
      totalItems: activeItems.length,
      totalThemes: themes.length,
      topTheme: themes[0]?.name || null,
      typeDistribution: {
        ideas: activeItems.filter((i) => i.itemType === "idea").length,
        insights: activeItems.filter((i) => i.itemType === "insight").length,
        useCases: activeItems.filter((i) => i.itemType === "use_case").length,
      },
    };

    return NextResponse.json({
      success: true,
      themes: themes.slice(0, 10), // Top 10 themes
      stats,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Items Themes] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
