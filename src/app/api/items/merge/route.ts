import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { ItemsBank, Item } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const ITEMS_BANK_PATH = path.join(DATA_DIR, "items_bank.json");

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

    if (!existsSync(ITEMS_BANK_PATH)) {
      return NextResponse.json(
        { success: false, error: "Items bank not found" },
        { status: 404 }
      );
    }

    const content = await readFile(ITEMS_BANK_PATH, "utf-8");
    const bank: ItemsBank = JSON.parse(content);

    const idSet = new Set(ids);
    const itemsToMerge: RuntimeItem[] = [];

    for (const item of bank.items) {
      if (idSet.has(item.id)) {
        itemsToMerge.push(item as RuntimeItem);
      }
    }

    if (itemsToMerge.length < 2) {
      return NextResponse.json(
        { success: false, error: "Could not find enough items to merge" },
        { status: 400 }
      );
    }

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

    // Update primary item
    if (allSourceDates.size > 0) {
      primary.sourceDates = Array.from(allSourceDates).sort();
    }
    primary.tags = Array.from(allTags);
    primary.occurrence = totalOccurrence;
    primary.sourceConversations = totalSourceConversations;
    primary.firstSeen = earliestFirstSeen.toISOString();
    primary.lastSeen = latestLastSeen.toISOString();

    // Remove merged items (keep primary)
    const otherIds = new Set(others.map((i) => i.id));
    bank.items = bank.items.filter((item) => !otherIds.has(item.id));

    // Update category itemIds
    for (const category of bank.categories) {
      if (category.itemIds) {
        category.itemIds = category.itemIds.filter((id) => !otherIds.has(id));
      }
    }

    // Remove empty categories
    bank.categories = bank.categories.filter(
      (cat) => cat.itemIds && cat.itemIds.length > 0
    );

    bank.last_updated = new Date().toISOString();
    await writeFile(ITEMS_BANK_PATH, JSON.stringify(bank, null, 2));

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
