"use client";

import { useState, useEffect } from "react";
import { ThemesConfig } from "@/lib/types";
import { loadThemesAsync } from "@/lib/themes";

interface ThemeSelectorProps {
  selectedTheme: string;
  onThemeChange: (themeId: string) => void;
}

export function ThemeSelector({ selectedTheme, onThemeChange }: ThemeSelectorProps) {
  const [themes, setThemes] = useState<ThemesConfig>({ version: 1, themes: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadThemesAsync()
      .then(setThemes)
      .catch((error) => {
        console.error("[ThemeSelector] Failed to load themes:", error);
        setThemes({ version: 1, themes: [] });
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-adobe-gray-300">
        Theme
      </label>
      {loading ? (
        <div className="flex items-center gap-2 text-adobe-gray-400">
          <div className="w-4 h-4 border-2 border-adobe-gray-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <span className="text-sm">Loading themes...</span>
        </div>
      ) : (
        <div className="flex gap-3">
          {themes.themes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => onThemeChange(theme.id)}
            aria-pressed={selectedTheme === theme.id}
            className={`px-4 py-2 rounded-lg border-2 transition-colors ${
              selectedTheme === theme.id
                ? "border-inspiration-ideas bg-inspiration-ideas/20 text-white"
                : "border-adobe-gray-600 bg-black/20 text-adobe-gray-300 hover:border-adobe-gray-500"
            }`}
          >
            <div className="text-sm font-medium">{theme.label}</div>
            <div className="text-xs text-adobe-gray-400 mt-1">{theme.description}</div>
          </button>
        ))}
        </div>
      )}
    </div>
  );
}

