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
        console.log("[SimpleModeSelector] Loaded themes config:", themesConfig);
        
        // Validate themes config structure
        if (!themesConfig || !themesConfig.themes || !Array.isArray(themesConfig.themes)) {
          console.error("[SimpleModeSelector] Invalid themes config structure:", themesConfig);
          setAllModes([]);
          setLoading(false);
          return;
        }
        
        // Collect all modes from all themes with their theme IDs
        const modesWithThemes: Array<Mode & { themeId: string }> = [];
        themesConfig.themes.forEach((t) => {
          if (!t.modes || !Array.isArray(t.modes)) {
            console.warn(`[SimpleModeSelector] Theme ${t.id} has no modes array`);
            return;
          }
          t.modes.forEach((mode) => {
            modesWithThemes.push({ ...mode, themeId: t.id });
          });
        });
        
        console.log(`[SimpleModeSelector] Found ${modesWithThemes.length} modes:`, modesWithThemes.map(m => `${m.themeId}/${m.id}`));
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
      ) : allModes.length === 0 ? (
        <div className="text-center py-8 text-adobe-gray-400">
          <p className="text-sm mb-2">No modes available. Please check:</p>
          <ul className="text-xs space-y-1 text-left max-w-md mx-auto">
            <li>• Browser console for errors</li>
            <li>• That themes.json exists at <code className="bg-adobe-gray-800 px-1 rounded">data/themes.json</code></li>
            <li>• That the /api/themes endpoint is working</li>
          </ul>
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

