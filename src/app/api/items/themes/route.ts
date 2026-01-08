import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { ItemsBank } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const ITEMS_BANK_PATH = path.join(DATA_DIR, "items_bank.json");

interface ThemeSummary {
  name: string;
  itemCount: number;
  categories: string[];
  topTags: string[];
  recentActivity: string; // ISO date
  qualityBreakdown: { A: number; B: number; C: number; unrated: number };
}

// GET /api/items/themes - Get theme synthesis summary
export async function GET() {
  try {
    if (!existsSync(ITEMS_BANK_PATH)) {
      return NextResponse.json({ success: true, themes: [], stats: null });
    }

    const content = await readFile(ITEMS_BANK_PATH, "utf-8");
    const bank: ItemsBank = JSON.parse(content);

    // Get active items only
    const activeItems = bank.items.filter(
      (item) => item.status !== "archived"
    );

    // Group by category
    const categoryMap = new Map<string, {
      name: string;
      items: typeof activeItems;
    }>();

    for (const item of activeItems) {
      const catId = item.categoryId || "uncategorized";
      const category = bank.categories.find((c) => c.id === catId);
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
          (item.tags || []).forEach((tag) => {
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

        // Quality breakdown
        const qualityBreakdown = { A: 0, B: 0, C: 0, unrated: 0 };
        for (const item of items) {
          if (item.quality === "A") qualityBreakdown.A++;
          else if (item.quality === "B") qualityBreakdown.B++;
          else if (item.quality === "C") qualityBreakdown.C++;
          else qualityBreakdown.unrated++;
        }

        return {
          name: data.name,
          itemCount: items.length,
          categories: [data.name],
          topTags,
          recentActivity,
          qualityBreakdown,
        };
      })
      .filter((theme) => theme.itemCount > 0)
      .sort((a, b) => b.itemCount - a.itemCount);

    // Overall stats
    const stats = {
      totalItems: activeItems.length,
      totalThemes: themes.length,
      topTheme: themes[0]?.name || null,
      qualityDistribution: {
        A: activeItems.filter((i) => i.quality === "A").length,
        B: activeItems.filter((i) => i.quality === "B").length,
        C: activeItems.filter((i) => i.quality === "C").length,
        unrated: activeItems.filter((i) => !i.quality).length,
      },
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
