/**
 * Theme Map Persistence API
 * 
 * GET: Load saved Theme Map from Supabase (or data/theme_map.json fallback)
 * POST: Save Theme Map to Supabase (or data/theme_map.json fallback)
 * DELETE: Clear saved Theme Map
 */

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { isCloudEnvironment } from "@/lib/vercel";

const DATA_DIR = path.join(process.cwd(), "data");
const THEME_MAPS_DIR = path.join(DATA_DIR, "theme_maps"); // Size-based Theme Maps (~500MB)

// Initialize Supabase client (if available)
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (supabaseUrl && supabaseKey) {
    return createClient(supabaseUrl, supabaseKey);
  }
  return null;
}

// Ensure data directories exist (local only)
function ensureDataDir() {
  if (!isCloudEnvironment()) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(THEME_MAPS_DIR)) {
      fs.mkdirSync(THEME_MAPS_DIR, { recursive: true });
    }
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
  time_window_days: number | null; // null = size-based Theme Map
  max_size_mb?: number; // Size-based Theme Map context (~500MB)
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
 * Load saved Theme Map (size-based, most recent ~500MB)
 */
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseClient();
    const cacheKey = "theme_map_latest"; // Always use "latest" for size-based Theme Maps
    
    // Try Supabase first (works on Vercel)
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', cacheKey)
          .single();
        
        if (!error && data?.value) {
          const saved = data.value as SavedThemeMap;
          if (saved && typeof saved === 'object' && saved.data && typeof saved.savedAt === 'string') {
            return NextResponse.json({
              success: true,
              exists: true,
              data: saved.data,
              savedAt: saved.savedAt,
              version: saved.version,
            });
          }
        }
      } catch (supabaseError) {
        console.error("[theme-map] Supabase load error:", supabaseError);
        // Fall through to file system fallback
      }
    }
    
    // Fallback to file system (local development only)
    if (!isCloudEnvironment()) {
      ensureDataDir();
      
      const cacheFile = path.join(THEME_MAPS_DIR, `${cacheKey}.json`);
      if (fs.existsSync(cacheFile)) {
        try {
          const content = fs.readFileSync(cacheFile, "utf-8");
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === 'object' && parsed.data && typeof parsed.savedAt === 'string') {
            const saved = parsed as SavedThemeMap;
            return NextResponse.json({
              success: true,
              exists: true,
              data: saved.data,
              savedAt: saved.savedAt,
              version: saved.version,
            });
          }
        } catch (err) {
          console.error("[theme-map] Failed to parse Theme Map file:", err);
        }
      }
    }
    
    // Cloud environment but no Supabase config
    return NextResponse.json({
      success: true,
      exists: false,
      data: null,
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
 * Save Theme Map (size-based, most recent ~500MB)
 */
export async function POST(request: Request) {
  try {
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
    
    // Always use "latest" cache key for size-based Theme Maps (~500MB)
    const cacheKey = "theme_map_latest";
    const maxSizeMb = body.maxSizeMb as number | undefined;
    
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
      time_window_days: null, // Always null - Theme Maps are size-based, not time-based
      max_size_mb: maxSizeMb || 500, // Store size context (defaults to 500MB)
      tech_stack_detected: body.tech_stack_detected as string[] | undefined,
      meta: body.meta as ThemeMapData["meta"],
    };
    
    const saved: SavedThemeMap = {
      data: themeMapData,
      savedAt: new Date().toISOString(),
      version: "1.0",
    };
    
    const supabase = getSupabaseClient();
    let success = false;
    
    // Try Supabase first (works on Vercel)
    if (supabase) {
      try {
        const configKey = cacheKey; // Always "theme_map_latest" for size-based Theme Maps
        const { error } = await supabase
          .from('app_config')
          .upsert({ 
            key: configKey, 
            value: saved,
            updated_at: new Date().toISOString()
          });
        
        if (error) {
          console.error("[theme-map] Failed to save to Supabase:", error);
        } else {
          success = true;
        }
      } catch (supabaseError) {
        console.error("[theme-map] Supabase save error:", supabaseError);
        // Fall through to file system fallback
      }
    }
    
    // Fallback to file system (local development only)
    if (!isCloudEnvironment()) {
      ensureDataDir();
      const cacheFile = path.join(THEME_MAPS_DIR, `${cacheKey}.json`);
      try {
        fs.writeFileSync(cacheFile, JSON.stringify(saved, null, 2), "utf-8");
        success = true;
      } catch (writeError) {
        console.error("[theme-map] Failed to write Theme Map file:", writeError);
        if (!success) {
          return NextResponse.json(
            { success: false, error: "Failed to save Theme Map file" },
            { status: 500 }
          );
        }
      }
    }
    
    if (!success && isCloudEnvironment()) {
      return NextResponse.json(
        { success: false, error: "Supabase not configured. Cannot save Theme Map on Vercel without Supabase." },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      savedAt: saved.savedAt,
      path: !isCloudEnvironment() ? path.join(THEME_MAPS_DIR, `${cacheKey}.json`) : undefined,
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
 * Clear saved Theme Map (size-based, most recent ~500MB)
 */
export async function DELETE(request: Request) {
  try {
    const supabase = getSupabaseClient();
    const cacheKey = "theme_map_latest";
    let success = false;
    
    // Try Supabase first
    if (supabase) {
      try {
        const { error } = await supabase
          .from('app_config')
          .delete()
          .eq('key', cacheKey);
        
        if (error) {
          console.error("[theme-map] Failed to delete from Supabase:", error);
        } else {
          success = true;
        }
      } catch (supabaseError) {
        console.error("[theme-map] Supabase delete error:", supabaseError);
      }
    }
    
    // Fallback to file system (local development only)
    if (!isCloudEnvironment()) {
      const cacheFile = path.join(THEME_MAPS_DIR, `${cacheKey}.json`);
      if (fs.existsSync(cacheFile)) {
        try {
          fs.unlinkSync(cacheFile);
          success = true;
        } catch (unlinkError) {
          console.error("[theme-map] Failed to delete Theme Map file:", unlinkError);
          if (!success) {
            return NextResponse.json(
              { success: false, error: "Failed to delete Theme Map file" },
              { status: 500 }
            );
          }
        }
      }
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
