"use client";

import { useState, useEffect } from "react";
import { Mode, ThemeType } from "@/lib/types";
import { loadThemesAsync } from "@/lib/themes";

interface ModeSelectorProps {
  theme: ThemeType;
  selectedMode: string;
  onModeChange: (modeId: string) => void;
  onThemeChange?: (themeId: ThemeType) => void;
}

export function ModeSelector({ theme, selectedMode, onModeChange, onThemeChange }: ModeSelectorProps) {
  const [allModes, setAllModes] = useState<Array<Mode & { themeId: ThemeType }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadThemesAsync()
      .then((themesConfig) => {
        // Collect all modes from all themes with their theme IDs
        const modesWithThemes: Array<Mode & { themeId: ThemeType }> = [];
        themesConfig.themes.forEach((t) => {
          t.modes.forEach((mode) => {
            modesWithThemes.push({ ...mode, themeId: t.id });
          });
        });
        setAllModes(modesWithThemes);
        
        // Auto-select first mode from current theme if none selected or selected mode not in theme
        const currentThemeModes = modesWithThemes.filter((m) => m.themeId === theme);
        if (!selectedMode || !currentThemeModes.find((m) => m.id === selectedMode)) {
          if (currentThemeModes.length > 0) {
            onModeChange(currentThemeModes[0].id);
          }
        }
      })
      .catch((error) => {
        console.error("[ModeSelector] Failed to load modes:", error);
        setAllModes([]);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, selectedMode]); // onModeChange is stable from useState, but removed to prevent unnecessary re-runs

  const handleModeClick = (mode: Mode & { themeId: ThemeType }) => {
    // If mode belongs to different theme, switch theme first
    if (mode.themeId !== theme && onThemeChange) {
      onThemeChange(mode.themeId);
    }
    onModeChange(mode.id);
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-adobe-gray-300">
        Mode
      </label>
      {loading ? (
        <div className="flex items-center gap-2 text-adobe-gray-400">
          <div className="w-4 h-4 border-2 border-adobe-gray-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <span className="text-sm">Loading modes...</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl mx-auto">
          {allModes.map((mode) => {
            const isFromSelectedTheme = mode.themeId === theme;
            const isSelected = selectedMode === mode.id;
            
            return (
              <button
                key={`${mode.themeId}-${mode.id}`}
                onClick={() => handleModeClick(mode)}
                aria-pressed={isSelected}
                disabled={false} // Allow clicking to switch themes
                className={`mode-card transition-all ${
                  isSelected ? "selected" : ""
                } ${
                  isFromSelectedTheme
                    ? "opacity-100"
                    : "opacity-30 hover:opacity-50"
                }`}
                title={!isFromSelectedTheme ? `Switch to ${mode.themeId} theme to use this mode` : undefined}
              >
                <span className="text-3xl" aria-hidden="true">{mode.icon}</span>
                <div>
                  <h3 className={`font-semibold text-lg ${isFromSelectedTheme ? "" : "text-adobe-gray-500"}`}>
                    {mode.name}
                  </h3>
                  <p className={`text-sm ${isFromSelectedTheme ? "text-adobe-gray-400" : "text-adobe-gray-600"}`}>
                    {mode.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

