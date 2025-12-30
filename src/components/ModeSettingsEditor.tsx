"use client";

import { useState, useEffect } from "react";
import { Theme, Mode, ThemeType, ModeType } from "@/lib/types";
import { loadThemesAsync, getModeAsync } from "@/lib/themes";

interface ModeSettingsEditorProps {
  theme: ThemeType;
  mode: ModeType;
  onSave?: () => void;
}

export function ModeSettingsEditor({ theme, mode, onSave }: ModeSettingsEditorProps) {
  const [modeData, setModeData] = useState<Mode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [goldenExamplesFolder, setGoldenExamplesFolder] = useState("");
  const [implementedItemsFolder, setImplementedItemsFolder] = useState("");
  const [temperature, setTemperature] = useState<number | null>(null);
  const [minSimilarity, setMinSimilarity] = useState<number | null>(null);

  useEffect(() => {
    loadMode();
  }, [theme, mode]);

  const loadMode = async () => {
    setLoading(true);
    try {
      const modeData = await getModeAsync(theme, mode);
      if (modeData) {
        setModeData(modeData);
        setGoldenExamplesFolder(modeData.settings.goldenExamplesFolder || "");
        setImplementedItemsFolder(modeData.settings.implementedItemsFolder || "");
        setTemperature(modeData.settings.temperature);
        setMinSimilarity(modeData.settings.minSimilarity);
      }
    } catch (error) {
      console.error("Failed to load mode:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!modeData) return;

    setSaving(true);
    try {
      const updates = {
        settings: {
          ...modeData.settings,
          goldenExamplesFolder: goldenExamplesFolder || null,
          implementedItemsFolder: implementedItemsFolder || null,
          temperature: temperature,
          minSimilarity: minSimilarity,
        },
      };

      const response = await fetch("/api/modes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeId: theme,
          modeId: mode,
          updates,
        }),
      });

      if (response.ok) {
        await loadMode();
        onSave?.();
      } else {
        const data = await response.json();
        alert(`Failed to save: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to save mode settings:", error);
      alert("Failed to save mode settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-adobe-gray-400">Loading mode settings...</div>;
  }

  if (!modeData) {
    return <div className="text-adobe-gray-400">Mode not found</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-adobe-gray-300 mb-2">
          {modeData.name} Settings
        </h3>
        <p className="text-xs text-adobe-gray-400 mb-4">{modeData.description}</p>
      </div>

      {/* Temperature (for generation modes) */}
      {modeData.settings.temperature !== null && (
        <div>
          <label className="block text-sm text-adobe-gray-400 mb-1">
            Temperature
          </label>
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={temperature ?? ""}
            onChange={(e) =>
              setTemperature(e.target.value ? parseFloat(e.target.value) : null)
            }
            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
          />
        </div>
      )}

      {/* Min Similarity (for seek modes) */}
      {modeData.settings.minSimilarity !== null && (
        <div>
          <label className="block text-sm text-adobe-gray-400 mb-1">
            Minimum Similarity
          </label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={minSimilarity ?? ""}
            onChange={(e) =>
              setMinSimilarity(e.target.value ? parseFloat(e.target.value) : null)
            }
            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
          />
        </div>
      )}

      {/* Golden Examples Folder */}
      <div>
        <label className="block text-sm text-adobe-gray-400 mb-1">
          Golden Examples Folder
        </label>
        <input
          type="text"
          value={goldenExamplesFolder}
          onChange={(e) => setGoldenExamplesFolder(e.target.value)}
          placeholder="/path/to/golden/examples"
          className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white font-mono text-sm"
        />
        <p className="text-xs text-adobe-gray-500 mt-1">
          Folder containing example outputs for this mode
        </p>
      </div>

      {/* Implemented Items Folder */}
      {(mode === "idea" || mode === "insight") && (
        <div>
          <label className="block text-sm text-adobe-gray-400 mb-1">
            Implemented Items Folder
          </label>
          <input
            type="text"
            value={implementedItemsFolder}
            onChange={(e) => setImplementedItemsFolder(e.target.value)}
            placeholder={
              mode === "idea"
                ? "/path/to/implemented/projects"
                : "/path/to/published/posts"
            }
            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white font-mono text-sm"
          />
          <p className="text-xs text-adobe-gray-500 mt-1">
            {mode === "idea"
              ? "Folder containing implemented projects (items will be marked as implemented if found)"
              : "Folder containing published posts (items will be marked as implemented if found)"}
          </p>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-inspiration-ideas/20 text-inspiration-ideas border border-inspiration-ideas/30 rounded-lg hover:bg-inspiration-ideas/30 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

