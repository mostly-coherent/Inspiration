import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { ItemsBank, Item } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const ITEMS_BANK_PATH = path.join(DATA_DIR, "items_bank.json");

// Scoring function for item relevance
function scoreItem(item: Item): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  
  // Base score from occurrence (1-10 points)
  const occurrenceScore = Math.min(item.occurrence * 2, 10);
  score += occurrenceScore;
  if (item.occurrence >= 3) {
    reasons.push(`Appeared ${item.occurrence}× (recurring pattern)`);
  }
  
  // Quality boost (A = +20, B = +10, C = +5, unrated = 0)
  if (item.quality === "A") {
    score += 20;
    reasons.push("⭐ A-tier quality");
  } else if (item.quality === "B") {
    score += 10;
  } else if (item.quality === "C") {
    score += 5;
  }
  
  // Recency boost (last 7 days = +15, 30 days = +10, 90 days = +5)
  const daysSinceLastSeen = Math.floor(
    (Date.now() - new Date(item.lastSeen).getTime()) / (24 * 60 * 60 * 1000)
  );
  if (daysSinceLastSeen <= 7) {
    score += 15;
    reasons.push("Recent (last 7 days)");
  } else if (daysSinceLastSeen <= 30) {
    score += 10;
    reasons.push("Recent (last 30 days)");
  } else if (daysSinceLastSeen <= 90) {
    score += 5;
  }
  
  // Idea type slight boost (actionable)
  if (item.itemType === "idea") score += 3;
  
  // If no specific reasons, add a generic one
  if (reasons.length === 0) {
    reasons.push("Good potential");
  }
  
  return { score, reasons };
}

interface ScoredItem extends Item {
  score: number;
  reasons: string[];
}

// GET /api/items/top - Get top recommendations split by type
export async function GET() {
  try {
    if (!existsSync(ITEMS_BANK_PATH)) {
      return NextResponse.json({ 
        success: true, 
        items: [], 
        buildNext: [],
        shareNext: [],
      });
    }

    const content = await readFile(ITEMS_BANK_PATH, "utf-8");
    const bank: ItemsBank = JSON.parse(content);

    // Filter to active items only (not implemented, posted, or archived)
    const activeItems = bank.items.filter(
      (item) => item.status === "active"
    );

    // Score items
    const scoredItems: ScoredItem[] = activeItems.map((item) => {
      const { score, reasons } = scoreItem(item);
      return { ...item, score, reasons };
    });

    scoredItems.sort((a, b) => b.score - a.score);

    // Split by type
    const ideas = scoredItems.filter((item) => item.itemType === "idea");
    const insights = scoredItems.filter((item) => item.itemType === "insight");

    // Format item for response
    const formatItem = (item: ScoredItem) => ({
      id: item.id,
      title: item.title,
      description: item.description.substring(0, 150) + (item.description.length > 150 ? "..." : ""),
      itemType: item.itemType,
      quality: item.quality,
      occurrence: item.occurrence,
      lastSeen: item.lastSeen,
      score: item.score,
      reasons: item.reasons,
      tags: item.tags?.slice(0, 3) || [],
    });

    // Top 3 Today - mixed ideas and insights, ranked by score
    const top3Today = scoredItems.slice(0, 3).map(formatItem);

    // Legacy support: Build Next = top 2 ideas, Share Next = top 2 insights
    const buildNext = ideas.slice(0, 2).map(formatItem);
    const shareNext = insights.slice(0, 2).map(formatItem);

    return NextResponse.json({
      success: true,
      items: top3Today, // Primary: Top 3 Today (mixed types)
      top3Today,        // Explicit alias
      buildNext,        // Legacy: separated by type
      shareNext,        // Legacy: separated by type
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
