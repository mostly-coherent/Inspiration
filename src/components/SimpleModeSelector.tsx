"use client";

import { useState, useEffect } from "react";
import { Mode } from "@/lib/types";
import { loadThemesAsync } from "@/lib/themes";

interface SimpleModeSelectorProps {
  selectedModeId: string;
  onModeChange: (modeId: string, themeId: string) => void;
}

export function SimpleModeSelector({ selectedModeId, onModeChange }: SimpleModeSelectorProps) {
  const [allModes, setAllModes] = useState<Array<Mode & { themeId: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadThemesAsync()
      .then((themesConfig) => {
        // Collect all modes from all themes with their theme IDs
        const modesWithThemes: Array<Mode & { themeId: string }> = [];
        themesConfig.themes.forEach((t) => {
          t.modes.forEach((mode) => {
            modesWithThemes.push({ ...mode, themeId: t.id });
          });
        });
        setAllModes(modesWithThemes);
        
        // Auto-select first mode if none selected
        if (!selectedModeId && modesWithThemes.length > 0) {
          onModeChange(modesWithThemes[0].id, modesWithThemes[0].themeId);
        }
      })
      .catch((error) => {
        console.error("[SimpleModeSelector] Failed to load modes:", error);
        setAllModes([]);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  const handleModeClick = (mode: Mode & { themeId: string }) => {
    onModeChange(mode.id, mode.themeId);
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex items-center gap-2 text-adobe-gray-400">
          <div className="w-4 h-4 border-2 border-adobe-gray-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <span className="text-sm">Loading modes...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {allModes.map((mode) => {
            const isSelected = selectedModeId === mode.id;
            
            return (
              <button
                key={`${mode.themeId}-${mode.id}`}
                onClick={() => handleModeClick(mode)}
                aria-pressed={isSelected}
                className={`mode-card transition-all ${
                  isSelected ? "selected" : ""
                }`}
              >
                <span className="text-4xl" aria-hidden="true">{mode.icon}</span>
                <div>
                  <h3 className="font-semibold text-lg">
                    {mode.name}
                  </h3>
                  <p className="text-sm text-adobe-gray-400">
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

