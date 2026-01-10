"use client";

import { ThemeExplorerConfig } from "@/lib/types";
import { CollapsibleSection, ThresholdSlider, InfoBox } from "./ConfigHelpers";

export const DEFAULT_THEME_EXPLORER: ThemeExplorerConfig = {
  defaultZoom: 0.7,
  sliderMin: 0.45,
  sliderMax: 0.92,
  maxThemesToDisplay: 20,
  largeThemeThreshold: 5,
};

interface ThemeExplorerSectionProps {
  themeExplorer: ThemeExplorerConfig;
  setThemeExplorer: React.Dispatch<React.SetStateAction<ThemeExplorerConfig>>;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ThemeExplorerSection({
  themeExplorer,
  setThemeExplorer,
  isExpanded,
  onToggle,
}: ThemeExplorerSectionProps) {
  const isModified = () => {
    return (
      themeExplorer.defaultZoom !== DEFAULT_THEME_EXPLORER.defaultZoom ||
      themeExplorer.sliderMin !== DEFAULT_THEME_EXPLORER.sliderMin ||
      themeExplorer.sliderMax !== DEFAULT_THEME_EXPLORER.sliderMax ||
      themeExplorer.maxThemesToDisplay !== DEFAULT_THEME_EXPLORER.maxThemesToDisplay ||
      themeExplorer.largeThemeThreshold !== DEFAULT_THEME_EXPLORER.largeThemeThreshold
    );
  };

  return (
    <CollapsibleSection
      id="themeExplorer"
      icon="🔭"
      title="Theme Explorer"
      description="Pattern discovery and grouping settings"
      isExpanded={isExpanded}
      isModified={isModified()}
      onToggle={onToggle}
    >
      <div className="flex items-start justify-between">
        <InfoBox title="Job to be done" color="indigo">
          Discover patterns across your ideas and insights.
          Theme Explorer groups similar items together dynamically — &quot;zoom out&quot; to see big-picture themes, &quot;zoom in&quot; for specific clusters.
          <div className="mt-2 text-slate-500">
            💡 <strong>How to use:</strong> Open Theme Explorer → Drag the zoom slider → Click a theme to see its items → Synthesize insights with AI.
          </div>
        </InfoBox>
        {isModified() && (
          <button
            onClick={() => setThemeExplorer(DEFAULT_THEME_EXPLORER)}
            className="ml-3 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors flex items-center gap-1"
          >
            ↺ Reset All
          </button>
        )}
      </div>

      {/* Default Zoom */}
      <ThresholdSlider
        label="Default Zoom Level"
        description="Where the slider starts. Lower = fewer, broader themes. Higher = more, specific themes."
        value={themeExplorer.defaultZoom}
        defaultValue={DEFAULT_THEME_EXPLORER.defaultZoom}
        min={0.4}
        max={0.95}
        step={0.05}
        format={(v) => `${(v * 100).toFixed(0)}%`}
        onChange={(value) =>
          setThemeExplorer((prev) => ({ ...prev, defaultZoom: value }))
        }
      />
      <div className="text-xs text-slate-500 -mt-2 ml-3">
        💡 <strong>Recommendation:</strong> 70% (default) shows a balanced mix. Start lower (50%) for big-picture view. Start higher (85%) for detailed clusters.
      </div>

      {/* Slider Range */}
      <div className="p-3 bg-slate-800/30 rounded-lg">
        <h4 className="text-sm font-medium text-slate-300 mb-2">Zoom Slider Range</h4>
        <p className="text-xs text-slate-500 mb-3">Controls how far you can zoom in/out. Wider range = more flexibility.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Min (Broadest themes)</label>
            <input
              type="number"
              value={themeExplorer.sliderMin}
              onChange={(e) =>
                setThemeExplorer((prev) => ({ ...prev, sliderMin: parseFloat(e.target.value) || 0.3 }))
              }
              step="0.05"
              min="0.3"
              max="0.6"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Max (Most specific)</label>
            <input
              type="number"
              value={themeExplorer.sliderMax}
              onChange={(e) =>
                setThemeExplorer((prev) => ({ ...prev, sliderMax: parseFloat(e.target.value) || 0.95 }))
              }
              step="0.05"
              min="0.7"
              max="0.99"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200"
            />
          </div>
        </div>
      </div>

      {/* Max Themes to Display */}
      <ThresholdSlider
        label="Max Themes to Show"
        description="Limit how many theme cards appear. More = comprehensive view. Fewer = cleaner, focused display."
        value={themeExplorer.maxThemesToDisplay}
        defaultValue={DEFAULT_THEME_EXPLORER.maxThemesToDisplay}
        min={5}
        max={50}
        step={5}
        format={(v) => `${v} themes`}
        onChange={(value) =>
          setThemeExplorer((prev) => ({ ...prev, maxThemesToDisplay: value }))
        }
      />
      <div className="text-xs text-slate-500 -mt-2 ml-3">
        💡 <strong>Recommendation:</strong> 20 (default) is scannable. Increase to 30-50 if you have many items. Decrease to 10 if you prefer simplicity.
      </div>

      {/* Large Theme Threshold */}
      <ThresholdSlider
        label="Large Theme Threshold"
        description="Themes with at least this many items get highlighted as 'important'. Helps identify significant patterns."
        value={themeExplorer.largeThemeThreshold}
        defaultValue={DEFAULT_THEME_EXPLORER.largeThemeThreshold}
        min={2}
        max={20}
        step={1}
        format={(v) => `${v} items`}
        onChange={(value) =>
          setThemeExplorer((prev) => ({ ...prev, largeThemeThreshold: value }))
        }
      />
      <div className="text-xs text-slate-500 -mt-2 ml-3">
        💡 <strong>Recommendation:</strong> 5 (default) highlights meaningful clusters. Lower if you have few items. Raise if you want only the biggest themes highlighted.
      </div>
    </CollapsibleSection>
  );
}
