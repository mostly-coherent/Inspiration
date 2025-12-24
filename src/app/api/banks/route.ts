import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

const DATA_DIR = path.join(process.cwd(), "data");

interface BankEntry {
  id: string;
  title: string;
  [key: string]: unknown;
}

interface Bank {
  version: number;
  type?: "idea" | "insight";
  entries?: BankEntry[];
  ideas?: BankEntry[];      // Legacy format
  insights?: BankEntry[];   // Legacy format
  last_updated: string;
}

// GET /api/banks?type=idea|insight
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bankType = searchParams.get("type") || "insight";
    
    if (bankType !== "idea" && bankType !== "insight") {
      return NextResponse.json(
        { success: false, error: "Invalid bank type. Use 'idea' or 'insight'" },
        { status: 400 }
      );
    }
    
    const jsonPath = path.join(DATA_DIR, `${bankType}_bank.json`);
    const mdPath = path.join(DATA_DIR, `${bankType.toUpperCase()}_BANK.md`);
    
    let bank: Bank | null = null;
    let markdown: string | null = null;
    
    // Load JSON bank
    if (existsSync(jsonPath)) {
      try {
        const content = await readFile(jsonPath, "utf-8");
        bank = JSON.parse(content);
      } catch {
        console.log(`[Banks] Could not parse ${bankType}_bank.json`);
      }
    }
    
    // Load markdown view
    if (existsSync(mdPath)) {
      try {
        markdown = await readFile(mdPath, "utf-8");
      } catch {
        console.log(`[Banks] Could not read ${bankType.toUpperCase()}_BANK.md`);
      }
    }
    
    // Calculate stats - support both new format (entries) and legacy (ideas/insights)
    const entries = bank?.entries || (bankType === "idea" ? bank?.ideas : bank?.insights) || [];
    let stats: Record<string, number> = {};
    
    if (bankType === "idea") {
      const unsolved = entries.filter(e => !e.solved_score || e.solved_score === "unsolved").length;
      const partial = entries.filter(e => e.solved_score === "partially_solved").length;
      const solved = entries.filter(e => e.solved_score === "fully_solved").length;
      stats = { total: entries.length, unsolved, partial, solved };
    } else {
      const unshared = entries.filter(e => !e.shared_score || e.shared_score === "unshared").length;
      const partial = entries.filter(e => e.shared_score === "partially_shared").length;
      const shared = entries.filter(e => e.shared_score === "fully_shared").length;
      stats = { total: entries.length, unshared, partial, shared };
    }
    
    return NextResponse.json({
      success: true,
      type: bankType,
      bank,
      markdown,
      stats,
      lastUpdated: bank?.last_updated || null,
    });
    
  } catch (error) {
    console.error("[Banks] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// GET /api/banks/summary - Get summary of both banks
export async function POST(request: NextRequest) {
  try {
    const summaries: Record<string, { total: number; pending: number; done: number }> = {};
    
    for (const bankType of ["idea", "insight"] as const) {
      const jsonPath = path.join(DATA_DIR, `${bankType}_bank.json`);
      
      if (existsSync(jsonPath)) {
        try {
          const content = await readFile(jsonPath, "utf-8");
          const bank: Bank = JSON.parse(content);
          const entries = bank.entries || (bankType === "idea" ? bank.ideas : bank.insights) || [];
          
          if (bankType === "idea") {
            const pending = entries.filter(e => !e.solved_score || e.solved_score === "unsolved" || e.solved_score === "partially_solved").length;
            const done = entries.filter(e => e.solved_score === "fully_solved").length;
            summaries[bankType] = { total: entries.length, pending, done };
          } else {
            const pending = entries.filter(e => !e.shared_score || e.shared_score === "unshared" || e.shared_score === "partially_shared").length;
            const done = entries.filter(e => e.shared_score === "fully_shared").length;
            summaries[bankType] = { total: entries.length, pending, done };
          }
        } catch {
          summaries[bankType] = { total: 0, pending: 0, done: 0 };
        }
      } else {
        summaries[bankType] = { total: 0, pending: 0, done: 0 };
      }
    }
    
    return NextResponse.json({ success: true, summaries });
    
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

