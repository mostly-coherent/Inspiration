"use client";

import { useState, useEffect } from "react";
import { Mode, ThemeType } from "@/lib/types";
import { getModesForThemeAsync } from "@/lib/themes";

interface ModeSelectorProps {
  theme: ThemeType;
  selectedMode: string;
  onModeChange: (modeId: string) => void;
}

export function ModeSelector({ theme, selectedMode, onModeChange }: ModeSelectorProps) {
  const [modes, setModes] = useState<Mode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getModesForThemeAsync(theme)
      .then((themeModes) => {
        setModes(themeModes);
        
        // Auto-select first mode if none selected or selected mode not in theme
        if (!selectedMode || !themeModes.find((m) => m.id === selectedMode)) {
          if (themeModes.length > 0) {
            onModeChange(themeModes[0].id);
          }
        }
      })
      .catch((error) => {
        console.error("[ModeSelector] Failed to load modes:", error);
        setModes([]);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, selectedMode]); // onModeChange is stable from useState, but removed to prevent unnecessary re-runs

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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {modes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            aria-pressed={selectedMode === mode.id}
            className={`mode-card ${selectedMode === mode.id ? "selected" : ""}`}
          >
            <span className="text-3xl" aria-hidden="true">{mode.icon}</span>
            <div>
              <h3 className="font-semibold text-lg">{mode.name}</h3>
              <p className="text-adobe-gray-400 text-sm">{mode.description}</p>
            </div>
          </button>
        ))}
        </div>
      )}
    </div>
  );
}

