import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { ItemsBank, ItemQuality } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const ITEMS_BANK_PATH = path.join(DATA_DIR, "items_bank.json");

// PATCH /api/items/quality - Set quality for a single item
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, quality } = body as { id: string; quality: ItemQuality };

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Item ID required" },
        { status: 400 }
      );
    }

    if (quality !== null && !["A", "B", "C"].includes(quality)) {
      return NextResponse.json(
        { success: false, error: "Invalid quality value (must be A, B, C, or null)" },
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

    let found = false;
    for (const item of bank.items) {
      if (item.id === id) {
        item.quality = quality;
        found = true;
        break;
      }
    }

    if (!found) {
      return NextResponse.json(
        { success: false, error: "Item not found" },
        { status: 404 }
      );
    }

    bank.last_updated = new Date().toISOString();
    await writeFile(ITEMS_BANK_PATH, JSON.stringify(bank, null, 2));

    return NextResponse.json({
      success: true,
      message: quality ? `Set quality to ${quality}` : "Removed quality rating",
    });
  } catch (error) {
    console.error("[Items Quality] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
