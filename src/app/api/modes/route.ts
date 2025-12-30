import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

const THEMES_PATH = path.join(process.cwd(), "data", "themes.json");

interface Mode {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  promptTemplate: string | null;
  settings: {
    temperature: number | null;
    minSimilarity: number | null;
    goldenExamplesFolder: string | null;
    implementedItemsFolder: string | null;
  };
  defaultBestOf: number;
  createdBy: string;
  createdDate: string;
}

interface Theme {
  id: string;
  label: string;
  description: string;
  modes: Mode[];
}

interface ThemesConfig {
  version: number;
  themes: Theme[];
}

async function loadThemes(): Promise<ThemesConfig> {
  if (existsSync(THEMES_PATH)) {
    try {
      const content = await readFile(THEMES_PATH, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error("[Modes] Failed to load themes:", error);
    }
  }
  
  // Return default structure if file doesn't exist
  return {
    version: 1,
    themes: [],
  };
}

async function saveThemes(config: ThemesConfig): Promise<boolean> {
  try {
    const dataDir = path.dirname(THEMES_PATH);
    if (!existsSync(dataDir)) {
      await mkdir(dataDir, { recursive: true });
    }
    await writeFile(THEMES_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error("[Modes] Failed to save themes:", error);
    return false;
  }
}

// GET /api/modes - Get all themes and modes
export async function GET() {
  try {
    const config = await loadThemes();
    return NextResponse.json({ success: true, config });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/modes - Create a new mode
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { themeId, mode } = body;
    
    if (!themeId || !mode || !mode.id || !mode.name) {
      return NextResponse.json(
        { success: false, error: "themeId and mode (with id, name) are required" },
        { status: 400 }
      );
    }
    
    const config = await loadThemes();
    const theme = config.themes.find((t) => t.id === themeId);
    
    if (!theme) {
      return NextResponse.json(
        { success: false, error: `Theme '${themeId}' not found` },
        { status: 404 }
      );
    }
    
    // Check if mode ID already exists
    if (theme.modes.some((m) => m.id === mode.id)) {
      return NextResponse.json(
        { success: false, error: `Mode '${mode.id}' already exists in theme '${themeId}'` },
        { status: 400 }
      );
    }
    
    // Add mode
    const newMode: Mode = {
      id: mode.id,
      name: mode.name,
      description: mode.description || "",
      icon: mode.icon || "📝",
      color: mode.color || "inspiration-ideas",
      promptTemplate: mode.promptTemplate || null,
      settings: {
        temperature: mode.settings?.temperature ?? null,
        minSimilarity: mode.settings?.minSimilarity ?? null,
        goldenExamplesFolder: mode.settings?.goldenExamplesFolder || null,
        implementedItemsFolder: mode.settings?.implementedItemsFolder || null,
      },
      defaultBestOf: mode.defaultBestOf || 5,
      createdBy: "user",
      createdDate: new Date().toISOString().split("T")[0],
    };
    
    theme.modes.push(newMode);
    
    const saved = await saveThemes(config);
    if (saved) {
      return NextResponse.json({ success: true, mode: newMode });
    } else {
      return NextResponse.json(
        { success: false, error: "Failed to save mode" },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/modes - Update an existing mode
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { themeId, modeId, updates } = body;
    
    if (!themeId || !modeId) {
      return NextResponse.json(
        { success: false, error: "themeId and modeId are required" },
        { status: 400 }
      );
    }
    
    const config = await loadThemes();
    const theme = config.themes.find((t) => t.id === themeId);
    
    if (!theme) {
      return NextResponse.json(
        { success: false, error: `Theme '${themeId}' not found` },
        { status: 404 }
      );
    }
    
    const mode = theme.modes.find((m) => m.id === modeId);
    if (!mode) {
      return NextResponse.json(
        { success: false, error: `Mode '${modeId}' not found in theme '${themeId}'` },
        { status: 404 }
      );
    }
    
    // Prevent modifying system modes
    if (mode.createdBy === "system") {
      return NextResponse.json(
        { success: false, error: "Cannot modify system modes. Create a custom mode instead." },
        { status: 403 }
      );
    }
    
    // Update mode
    if (updates.name) mode.name = updates.name;
    if (updates.description !== undefined) mode.description = updates.description;
    if (updates.icon) mode.icon = updates.icon;
    if (updates.color) mode.color = updates.color;
    if (updates.promptTemplate !== undefined) mode.promptTemplate = updates.promptTemplate;
    if (updates.settings) {
      mode.settings = { ...mode.settings, ...updates.settings };
    }
    if (updates.defaultBestOf !== undefined) mode.defaultBestOf = updates.defaultBestOf;
    
    const saved = await saveThemes(config);
    if (saved) {
      return NextResponse.json({ success: true, mode });
    } else {
      return NextResponse.json(
        { success: false, error: "Failed to save mode" },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/modes - Delete a mode
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const themeId = searchParams.get("themeId");
    const modeId = searchParams.get("modeId");
    
    if (!themeId || !modeId) {
      return NextResponse.json(
        { success: false, error: "themeId and modeId query parameters are required" },
        { status: 400 }
      );
    }
    
    const config = await loadThemes();
    const theme = config.themes.find((t) => t.id === themeId);
    
    if (!theme) {
      return NextResponse.json(
        { success: false, error: `Theme '${themeId}' not found` },
        { status: 404 }
      );
    }
    
    const modeIndex = theme.modes.findIndex((m) => m.id === modeId);
    if (modeIndex === -1) {
      return NextResponse.json(
        { success: false, error: `Mode '${modeId}' not found in theme '${themeId}'` },
        { status: 404 }
      );
    }
    
    const mode = theme.modes[modeIndex];
    
    // Prevent deleting system modes
    if (mode.createdBy === "system") {
      return NextResponse.json(
        { success: false, error: "Cannot delete system modes" },
        { status: 403 }
      );
    }
    
    // Remove mode
    theme.modes.splice(modeIndex, 1);
    
    const saved = await saveThemes(config);
    if (saved) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { success: false, error: "Failed to delete mode" },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

