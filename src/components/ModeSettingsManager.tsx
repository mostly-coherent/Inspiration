"use client";

import { useState, useEffect } from "react";
import { Theme, Mode, ThemeType, ModeType } from "@/lib/types";
import { loadThemesAsync, getModesForThemeAsync } from "@/lib/themes";
import { ModeSettingsEditor } from "./ModeSettingsEditor";
import { ModeForm } from "./ModeForm";

export function ModeSettingsManager() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<ThemeType | null>(null);
  const [selectedMode, setSelectedMode] = useState<ModeType | null>(null);
  const [modes, setModes] = useState<Mode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingMode, setEditingMode] = useState<Mode | null>(null);

  useEffect(() => {
    loadThemes();
  }, []);

  useEffect(() => {
    if (selectedTheme) {
      loadModes(selectedTheme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTheme]); // loadModes is stable, only re-run when theme changes

  const loadThemes = async () => {
    setLoading(true);
    try {
      const config = await loadThemesAsync();
      setThemes(config.themes);
      if (config.themes.length > 0) {
        setSelectedTheme(config.themes[0].id);
      }
    } catch (error) {
      console.error("Failed to load themes:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadModes = async (themeId: ThemeType) => {
    try {
      const themeModes = await getModesForThemeAsync(themeId);
      setModes(themeModes);
      if (themeModes.length > 0 && !selectedMode) {
        setSelectedMode(themeModes[0].id);
      }
    } catch (error) {
      console.error("Failed to load modes:", error);
    }
  };

  if (loading) {
    return <div className="text-adobe-gray-400">Loading modes...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Theme Selector */}
      <div>
        <label className="block text-sm font-medium text-adobe-gray-300 mb-2">
          Theme
        </label>
        <div className="flex gap-2">
          {themes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => {
                setSelectedTheme(theme.id);
                setSelectedMode(null);
              }}
              className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                selectedTheme === theme.id
                  ? "border-inspiration-ideas bg-inspiration-ideas/20 text-white"
                  : "border-adobe-gray-600 bg-black/20 text-adobe-gray-300 hover:border-adobe-gray-500"
              }`}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode Selector */}
      {selectedTheme && modes.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-adobe-gray-300 mb-2">
            Mode
          </label>
          <div className="flex flex-wrap gap-2">
            {modes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setSelectedMode(mode.id)}
                className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                  selectedMode === mode.id
                    ? "border-inspiration-ideas bg-inspiration-ideas/20 text-white"
                    : "border-adobe-gray-600 bg-black/20 text-adobe-gray-300 hover:border-adobe-gray-500"
                }`}
              >
                <span className="mr-2">{mode.icon}</span>
                {mode.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create/Edit Mode Form */}
      {(showCreateForm || editingMode) && selectedTheme && (
        <div className="mt-6 p-4 bg-black/20 rounded-lg border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-adobe-gray-300">
              {editingMode ? "Edit Mode" : "Create New Mode"}
            </h3>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setEditingMode(null);
              }}
              className="text-adobe-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <ModeForm
            theme={selectedTheme}
            mode={editingMode || undefined}
            onSave={() => {
              setShowCreateForm(false);
              setEditingMode(null);
              loadModes(selectedTheme);
            }}
            onCancel={() => {
              setShowCreateForm(false);
              setEditingMode(null);
            }}
          />
        </div>
      )}

      {/* Mode List with Actions */}
      {selectedTheme && modes.length > 0 && !showCreateForm && !editingMode && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-adobe-gray-300">Modes</h3>
            <button
              onClick={() => setShowCreateForm(true)}
              className="text-sm text-inspiration-ideas hover:text-inspiration-ideas/80 transition-colors"
            >
              + Create Mode
            </button>
          </div>
          <div className="space-y-2">
            {modes.map((mode) => (
              <div
                key={mode.id}
                className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/10"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{mode.icon}</span>
                  <div>
                    <div className="font-medium text-white">{mode.name}</div>
                    <div className="text-xs text-adobe-gray-400">
                      {mode.description}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {mode.createdBy === "user" && (
                    <>
                      <button
                        onClick={() => setEditingMode(mode)}
                        className="px-3 py-1 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (
                            confirm(
                              `Delete mode "${mode.name}"? This cannot be undone.`
                            )
                          ) {
                            try {
                              const response = await fetch(
                                `/api/modes?themeId=${selectedTheme}&modeId=${mode.id}`,
                                { method: "DELETE" }
                              );
                              if (response.ok) {
                                loadModes(selectedTheme);
                                if (selectedMode === mode.id) {
                                  setSelectedMode(null);
                                }
                              } else {
                                const data = await response.json();
                                alert(`Failed to delete: ${data.error}`);
                              }
                            } catch {
                              alert("Failed to delete mode");
                            }
                          }
                        }}
                        className="px-3 py-1 text-sm bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mode Settings Editor */}
      {selectedTheme && selectedMode && !showCreateForm && !editingMode && (
        <div className="mt-6 p-4 bg-black/20 rounded-lg border border-white/10">
          <ModeSettingsEditor
            theme={selectedTheme}
            mode={selectedMode}
            onSave={() => {
              // Reload modes to get updated settings
              if (selectedTheme) {
                loadModes(selectedTheme);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

