import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { ItemsBank, ItemStatus } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const ITEMS_BANK_PATH = path.join(DATA_DIR, "items_bank.json");

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

    if (!status || !["active", "implemented", "posted", "archived"].includes(status)) {
      return NextResponse.json(
        { success: false, error: "Invalid status" },
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

    let updatedCount = 0;
    const idSet = new Set(ids);

    for (const item of bank.items) {
      if (idSet.has(item.id)) {
        item.status = status;
        updatedCount++;
      }
    }

    bank.last_updated = new Date().toISOString();
    await writeFile(ITEMS_BANK_PATH, JSON.stringify(bank, null, 2));

    return NextResponse.json({
      success: true,
      updatedCount,
      message: `Updated ${updatedCount} items to status: ${status}`,
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

    if (!existsSync(ITEMS_BANK_PATH)) {
      return NextResponse.json(
        { success: false, error: "Items bank not found" },
        { status: 404 }
      );
    }

    const content = await readFile(ITEMS_BANK_PATH, "utf-8");
    const bank: ItemsBank = JSON.parse(content);

    const idSet = new Set(ids);
    const originalCount = bank.items.length;

    // Remove items
    bank.items = bank.items.filter((item) => !idSet.has(item.id));
    const deletedCount = originalCount - bank.items.length;

    // Update category itemIds
    for (const category of bank.categories) {
      if (category.itemIds) {
        category.itemIds = category.itemIds.filter((id) => !idSet.has(id));
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
      deletedCount,
      message: `Deleted ${deletedCount} items`,
    });
  } catch (error) {
    console.error("[Items Bulk DELETE] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
