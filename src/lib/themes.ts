/**
 * Theme/Mode Configuration Utilities
 * 
 * Loads themes.json and provides utilities for resolving theme/mode from tool names
 * and validating theme/mode combinations.
 */

import { Theme, Mode, ThemesConfig, ThemeType, ModeType } from "./types";

let themesCache: ThemesConfig | null = null;

/**
 * Load themes configuration from themes.json
 * Works in both server-side (Node.js) and client-side (browser) contexts
 */
export async function loadThemesAsync(): Promise<ThemesConfig> {
  if (themesCache) {
    return themesCache;
  }

  // Server-side (Node.js)
  if (typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { readFileSync } = require("fs");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { join } = require("path");
      const themesPath = join(process.cwd(), "data", "themes.json");
      const content = readFileSync(themesPath, "utf-8");
      themesCache = JSON.parse(content) as ThemesConfig;
      return themesCache;
    } catch (error) {
      console.error("[Themes] Failed to load themes.json:", error);
      return {
        version: 1,
        themes: [],
      };
    }
  }

  // Client-side (browser) - fetch from API
  try {
    const response = await fetch("/api/themes");
    if (!response.ok) {
      console.error(`[Themes] API returned ${response.status}: ${response.statusText}`);
      return {
        version: 1,
        themes: [],
      };
    }
    const data = await response.json();
    // Handle both formats: { success: true, themes: ThemesConfig } and direct ThemesConfig
    if (data.success && data.themes) {
      themesCache = data.themes as ThemesConfig;
      return themesCache;
    } else if (data.version && Array.isArray(data.themes)) {
      // Direct ThemesConfig format
      themesCache = data as ThemesConfig;
      return themesCache;
    } else {
      console.error("[Themes] Unexpected API response format:", data);
    }
  } catch (error) {
    console.error("[Themes] Failed to fetch themes:", error);
  }

  return {
    version: 1,
    themes: [],
  };
}

/**
 * Synchronous version (server-side only)
 */
export function loadThemes(): ThemesConfig {
  if (themesCache) {
    return themesCache;
  }

  if (typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { readFileSync } = require("fs");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { join } = require("path");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { existsSync } = require("fs");
      const themesPath = join(process.cwd(), "data", "themes.json");
      
      if (!existsSync(themesPath)) {
        console.error(`[Themes] themes.json not found at: ${themesPath}`);
        return {
          version: 1,
          themes: [],
        };
      }
      
      const content = readFileSync(themesPath, "utf-8");
      themesCache = JSON.parse(content) as ThemesConfig;
      
      // Validate that themes were loaded
      if (!themesCache.themes || themesCache.themes.length === 0) {
        console.error("[Themes] themes.json is empty or invalid");
        themesCache = null; // Reset cache so we can retry
        return {
          version: 1,
          themes: [],
        };
      }
      
      return themesCache;
    } catch (error) {
      console.error("[Themes] Failed to load themes.json:", error);
      // Reset cache on error so we can retry
      themesCache = null;
    }
  }

  return {
    version: 1,
    themes: [],
  };
}

/**
 * Get theme by ID
 */
export function getTheme(themeId: ThemeType): Theme | null {
  const config = loadThemes();
  return config.themes.find((t) => t.id === themeId) || null;
}

/**
 * Get mode by theme and mode ID
 */
export function getMode(themeId: ThemeType, modeId: ModeType): Mode | null {
  const theme = getTheme(themeId);
  if (!theme) return null;
  return theme.modes.find((m) => m.id === modeId) || null;
}

/**
 * Resolve theme and mode from tool name (backward compatibility)
 * Maps: "ideas" → theme: "generation", mode: "idea"
 *       "insights" → theme: "generation", mode: "insight"
 */
export function resolveThemeModeFromTool(tool: "ideas" | "insights"): {
  theme: ThemeType;
  mode: ModeType;
} | null {
  const mapping: Record<"ideas" | "insights", { theme: ThemeType; mode: ModeType }> = {
    ideas: { theme: "generation", mode: "idea" },
    insights: { theme: "generation", mode: "insight" },
  };

  return mapping[tool] || null;
}

/**
 * Validate theme/mode combination
 */
export function validateThemeMode(themeId: ThemeType, modeId: ModeType): boolean {
  const config = loadThemes();
  
  // Debug: Log if themes failed to load
  if (!config.themes || config.themes.length === 0) {
    console.error(`[Themes] Validation failed: themes.json not loaded or empty. Theme: ${themeId}, Mode: ${modeId}`);
    return false;
  }
  
  const theme = config.themes.find((t) => t.id === themeId);
  if (!theme) {
    console.error(`[Themes] Theme not found: ${themeId}. Available themes: ${config.themes.map(t => t.id).join(", ")}`);
    return false;
  }
  
  const mode = theme.modes.find((m) => m.id === modeId);
  if (!mode) {
    console.error(`[Themes] Mode not found: ${modeId} in theme ${themeId}. Available modes: ${theme.modes.map(m => m.id).join(", ")}`);
    return false;
  }
  
  return true;
}

/**
 * Get theme by ID (async version for client-side)
 */
export async function getThemeAsync(themeId: ThemeType): Promise<Theme | null> {
  const config = await loadThemesAsync();
  return config.themes.find((t) => t.id === themeId) || null;
}

/**
 * Get mode by theme and mode ID (async version for client-side)
 */
export async function getModeAsync(themeId: ThemeType, modeId: ModeType): Promise<Mode | null> {
  const theme = await getThemeAsync(themeId);
  if (!theme) return null;
  return theme.modes.find((m) => m.id === modeId) || null;
}

/**
 * Get all modes for a theme (async version for client-side)
 */
export async function getModesForThemeAsync(themeId: ThemeType): Promise<Mode[]> {
  const theme = await getThemeAsync(themeId);
  return theme?.modes || [];
}

/**
 * Get all modes for a theme (sync version for server-side)
 */
export function getModesForTheme(themeId: ThemeType): Mode[] {
  const theme = getTheme(themeId);
  return theme?.modes || [];
}

/**
 * Get default mode settings for a mode
 */
export function getModeSettings(themeId: ThemeType, modeId: ModeType): Mode["settings"] | null {
  const mode = getMode(themeId, modeId);
  return mode?.settings || null;
}

