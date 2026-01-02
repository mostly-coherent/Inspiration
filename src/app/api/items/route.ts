import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { ItemsBank } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const ITEMS_BANK_PATH = path.join(DATA_DIR, "items_bank.json");

// GET /api/items?theme=generation&mode=idea&view=items|categories&implemented=false
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const theme = searchParams.get("theme") as "generation" | "seek" | null;
    const mode = searchParams.get("mode");
    const view = searchParams.get("view") || "items"; // "items" or "categories"
    const implemented = searchParams.get("implemented");
    
    if (!existsSync(ITEMS_BANK_PATH)) {
      return NextResponse.json({
        success: true,
        items: [],
        categories: [],
        stats: {
          totalItems: 0,
          totalCategories: 0,
          byMode: {},
          byTheme: {},
          implemented: 0,
        },
      });
    }
    
    const content = await readFile(ITEMS_BANK_PATH, "utf-8");
    const bank: ItemsBank = JSON.parse(content);
    
    // Filter items
    let items = bank.items || [];
    if (theme) {
      items = items.filter((item) => item.theme === theme);
    }
    if (mode) {
      items = items.filter((item) => item.mode === mode);
    }
    if (implemented !== null) {
      const isImplemented = implemented === "true";
      items = items.filter((item) => item.implemented === isImplemented);
    }
    
    // Sort by occurrence (highest first)
    items.sort((a, b) => (b.occurrence || 0) - (a.occurrence || 0));
    
    // Filter categories
    let categories = bank.categories || [];
    if (theme) {
      categories = categories.filter((cat) => cat.theme === theme);
    }
    if (mode) {
      categories = categories.filter((cat) => cat.mode === mode);
    }
    
    // Sort categories by number of items (largest first)
    categories.sort((a, b) => (b.itemIds?.length || 0) - (a.itemIds?.length || 0));
    
    // Calculate stats
    const allItems = bank.items || [];
    const stats = {
      totalItems: allItems.length,
      totalCategories: bank.categories?.length || 0,
      byMode: {} as Record<string, number>,
      byTheme: {} as Record<string, number>,
      implemented: allItems.filter((item) => item.implemented).length,
    };
    
    // Count by mode
    for (const item of allItems) {
      const mode = item.mode || "unknown";
      stats.byMode[mode] = (stats.byMode[mode] || 0) + 1;
    }
    
    // Count by theme
    for (const item of allItems) {
      const theme = item.theme || "unknown";
      stats.byTheme[theme] = (stats.byTheme[theme] || 0) + 1;
    }
    
    return NextResponse.json({
      success: true,
      items: view === "items" ? items : [],
      categories: view === "categories" ? categories : [],
      stats,
      lastUpdated: bank.last_updated || null,
    });
    
  } catch (error) {
    console.error("[Items] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

