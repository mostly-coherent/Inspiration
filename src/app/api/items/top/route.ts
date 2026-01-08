import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { ItemsBank, Item } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const ITEMS_BANK_PATH = path.join(DATA_DIR, "items_bank.json");

// Scoring function for item relevance
function scoreItem(item: Item): number {
  let score = 0;
  
  // Base score from occurrence (1-10 points)
  score += Math.min(item.occurrence * 2, 10);
  
  // Quality boost (A = +20, B = +10, C = +5, unrated = 0)
  if (item.quality === "A") score += 20;
  else if (item.quality === "B") score += 10;
  else if (item.quality === "C") score += 5;
  
  // Recency boost (last 7 days = +15, 30 days = +10, 90 days = +5)
  const daysSinceLastSeen = Math.floor(
    (Date.now() - new Date(item.lastSeen).getTime()) / (24 * 60 * 60 * 1000)
  );
  if (daysSinceLastSeen <= 7) score += 15;
  else if (daysSinceLastSeen <= 30) score += 10;
  else if (daysSinceLastSeen <= 90) score += 5;
  
  // Idea type slight boost (actionable)
  if (item.itemType === "idea") score += 3;
  
  return score;
}

// GET /api/items/top - Get top 3 recommended items
export async function GET() {
  try {
    if (!existsSync(ITEMS_BANK_PATH)) {
      return NextResponse.json({ success: true, items: [] });
    }

    const content = await readFile(ITEMS_BANK_PATH, "utf-8");
    const bank: ItemsBank = JSON.parse(content);

    // Filter to active items only (not implemented, posted, or archived)
    const activeItems = bank.items.filter(
      (item) => item.status === "active"
    );

    // Score and sort
    const scoredItems = activeItems.map((item) => ({
      ...item,
      score: scoreItem(item),
    }));

    scoredItems.sort((a, b) => b.score - a.score);

    // Take top 3
    const top3 = scoredItems.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description.substring(0, 150) + (item.description.length > 150 ? "..." : ""),
      itemType: item.itemType,
      quality: item.quality,
      occurrence: item.occurrence,
      lastSeen: item.lastSeen,
      score: item.score,
      tags: item.tags?.slice(0, 3) || [],
    }));

    return NextResponse.json({
      success: true,
      items: top3,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Items Top] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
