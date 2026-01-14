/**
 * Theme Map Persistence API
 * 
 * GET: Load saved Theme Map from data/theme_map.json
 * POST: Save Theme Map to data/theme_map.json
 * DELETE: Clear saved Theme Map
 */

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const THEME_MAP_FILE = path.join(DATA_DIR, "theme_map.json");

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Theme Map interface (matches generate_themes.py output)
interface ThemeMapTheme {
  name: string;
  description: string;
  evidence: Array<{
    conversation_id: string;
    snippet: string;
  }>;
}

interface CounterIntuitive {
  title: string;
  perspective: string;
  reasoning: string;
}

interface UnexploredTerritory {
  title: string;
  why: string;
}

interface ThemeMapData {
  themes: ThemeMapTheme[];
  counter_intuitive?: CounterIntuitive[];
  unexplored_territory: (string | UnexploredTerritory)[];  // Support both legacy and new format
  generated_at: string;
  conversations_analyzed: number;
  conversations_considered?: number;  // Total found before capping at 60
  time_window_days: number;
  tech_stack_detected?: string[];
  meta?: {
    llm_provider?: string;
    generation_time_seconds?: number;
  };
}

interface SavedThemeMap {
  data: ThemeMapData;
  savedAt: string;
  version: string;
}

/**
 * GET /api/theme-map
 * Load saved Theme Map
 */
export async function GET() {
  try {
    ensureDataDir();
    
    if (!fs.existsSync(THEME_MAP_FILE)) {
      return NextResponse.json({
        success: true,
        exists: false,
        data: null,
      });
    }
    
    const content = fs.readFileSync(THEME_MAP_FILE, "utf-8");
    let saved: SavedThemeMap;
    try {
      saved = JSON.parse(content);
    } catch (parseError) {
      console.error("[theme-map] Failed to parse Theme Map file:", parseError);
      return NextResponse.json(
        { success: false, error: "Theme Map file is corrupted" },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      exists: true,
      data: saved.data,
      savedAt: saved.savedAt,
      version: saved.version,
    });
  } catch (error) {
    console.error("[theme-map] Error loading:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load Theme Map" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/theme-map
 * Save Theme Map
 */
export async function POST(request: Request) {
  try {
    ensureDataDir();
    
    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch (parseError) {
      console.error("Failed to parse request JSON:", parseError);
      return NextResponse.json(
        { success: false, error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }
    
    // Validate required fields
    if (!body.themes || !Array.isArray(body.themes)) {
      return NextResponse.json(
        { success: false, error: "Invalid Theme Map: missing themes array" },
        { status: 400 }
      );
    }
    
    const themeMapData: ThemeMapData = {
      themes: body.themes as ThemeMapTheme[],
      counter_intuitive: body.counter_intuitive as CounterIntuitive[] | undefined,
      unexplored_territory: (body.unexplored_territory as string[]) || [],
      generated_at: (body.generated_at as string) || new Date().toISOString(),
      conversations_analyzed: (body.conversations_analyzed as number) || 0,
      conversations_considered: body.conversations_considered as number | undefined,
      time_window_days: (body.time_window_days as number) || 0,
      tech_stack_detected: body.tech_stack_detected as string[] | undefined,
      meta: body.meta as ThemeMapData["meta"],
    };
    
    const saved: SavedThemeMap = {
      data: themeMapData,
      savedAt: new Date().toISOString(),
      version: "1.0",
    };
    
    fs.writeFileSync(THEME_MAP_FILE, JSON.stringify(saved, null, 2), "utf-8");
    
    return NextResponse.json({
      success: true,
      savedAt: saved.savedAt,
    });
  } catch (error) {
    console.error("[theme-map] Error saving:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save Theme Map" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/theme-map
 * Clear saved Theme Map
 */
export async function DELETE() {
  try {
    if (fs.existsSync(THEME_MAP_FILE)) {
      fs.unlinkSync(THEME_MAP_FILE);
    }
    
    return NextResponse.json({
      success: true,
      message: "Theme Map cleared",
    });
  } catch (error) {
    console.error("[theme-map] Error deleting:", error);
    return NextResponse.json(
      { success: false, error: "Failed to clear Theme Map" },
      { status: 500 }
    );
  }
}
