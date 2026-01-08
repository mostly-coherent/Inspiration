import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { ItemsBank } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const ITEMS_BANK_PATH = path.join(DATA_DIR, "items_bank.json");

const STALE_DAYS = 90;

// GET /api/items/cleanup - Get count of stale items
export async function GET() {
  try {
    if (!existsSync(ITEMS_BANK_PATH)) {
      return NextResponse.json({ success: true, staleCount: 0, staleItems: [] });
    }

    const content = await readFile(ITEMS_BANK_PATH, "utf-8");
    const bank: ItemsBank = JSON.parse(content);

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);

    const staleItems = bank.items.filter((item) => {
      // Skip already archived items
      if (item.status === "archived") return false;
      // Skip implemented/posted items (they're done)
      if (item.status === "implemented" || item.status === "posted") return false;
      // Skip A-tier items (user marked as valuable)
      if (item.quality === "A") return false;
      // Check if last seen is older than cutoff
      const lastSeen = new Date(item.lastSeen);
      return lastSeen < cutoffDate;
    });

    return NextResponse.json({
      success: true,
      staleCount: staleItems.length,
      staleItems: staleItems.map((item) => ({
        id: item.id,
        title: item.title,
        lastSeen: item.lastSeen,
        daysSinceLastSeen: Math.floor((now.getTime() - new Date(item.lastSeen).getTime()) / (24 * 60 * 60 * 1000)),
      })),
      cutoffDays: STALE_DAYS,
    });
  } catch (error) {
    console.error("[Items Cleanup GET] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/items/cleanup - Archive stale items
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { dryRun = false } = body as { dryRun?: boolean };

    if (!existsSync(ITEMS_BANK_PATH)) {
      return NextResponse.json({
        success: true,
        archivedCount: 0,
        message: "No items bank found",
      });
    }

    const content = await readFile(ITEMS_BANK_PATH, "utf-8");
    const bank: ItemsBank = JSON.parse(content);

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);

    let archivedCount = 0;
    const archivedItems: string[] = [];

    for (const item of bank.items) {
      // Skip already archived items
      if (item.status === "archived") continue;
      // Skip implemented/posted items (they're done)
      if (item.status === "implemented" || item.status === "posted") continue;
      // Skip A-tier items (user marked as valuable)
      if (item.quality === "A") continue;
      // Check if last seen is older than cutoff
      const lastSeen = new Date(item.lastSeen);
      if (lastSeen < cutoffDate) {
        if (!dryRun) {
          item.status = "archived";
        }
        archivedItems.push(item.title);
        archivedCount++;
      }
    }

    if (!dryRun && archivedCount > 0) {
      bank.last_updated = new Date().toISOString();
      await writeFile(ITEMS_BANK_PATH, JSON.stringify(bank, null, 2));
    }

    return NextResponse.json({
      success: true,
      archivedCount,
      archivedItems: archivedItems.slice(0, 10), // Preview first 10
      dryRun,
      message: dryRun
        ? `Would archive ${archivedCount} stale items`
        : `Archived ${archivedCount} stale items`,
    });
  } catch (error) {
    console.error("[Items Cleanup POST] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
