"use client";

import { ThemeExplorerConfig } from "@/lib/types";
import { CollapsibleSection, ThresholdSlider, InfoBox } from "./ConfigHelpers";

export const DEFAULT_THEME_EXPLORER: ThemeExplorerConfig = {
  defaultZoom: 0.7,
  sliderMin: 0.45,
  sliderMax: 0.92,
  maxThemesToDisplay: 20,
  // Unexplored Territory defaults (LIB-10)
  unexplored: {
    daysBack: 90,
    minConversations: 5,
    includeLowSeverity: false,
  },
  // Counter-Intuitive defaults (LIB-11)
  counterIntuitive: {
    enabled: true,
    minClusterSize: 5,
    maxSuggestions: 3,
  },
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
    const unexplored = themeExplorer.unexplored || DEFAULT_THEME_EXPLORER.unexplored;
    const counterIntuitive = themeExplorer.counterIntuitive || DEFAULT_THEME_EXPLORER.counterIntuitive;
    
    return (
      themeExplorer.defaultZoom !== DEFAULT_THEME_EXPLORER.defaultZoom ||
      themeExplorer.sliderMin !== DEFAULT_THEME_EXPLORER.sliderMin ||
      themeExplorer.sliderMax !== DEFAULT_THEME_EXPLORER.sliderMax ||
      themeExplorer.maxThemesToDisplay !== DEFAULT_THEME_EXPLORER.maxThemesToDisplay ||
      unexplored.daysBack !== DEFAULT_THEME_EXPLORER.unexplored.daysBack ||
      unexplored.minConversations !== DEFAULT_THEME_EXPLORER.unexplored.minConversations ||
      unexplored.includeLowSeverity !== DEFAULT_THEME_EXPLORER.unexplored.includeLowSeverity ||
      counterIntuitive.enabled !== DEFAULT_THEME_EXPLORER.counterIntuitive.enabled ||
      counterIntuitive.minClusterSize !== DEFAULT_THEME_EXPLORER.counterIntuitive.minClusterSize ||
      counterIntuitive.maxSuggestions !== DEFAULT_THEME_EXPLORER.counterIntuitive.maxSuggestions
    );
  };
  
  // Ensure nested objects exist
  const unexplored = themeExplorer.unexplored || DEFAULT_THEME_EXPLORER.unexplored;
  const counterIntuitive = themeExplorer.counterIntuitive || DEFAULT_THEME_EXPLORER.counterIntuitive;

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

      {/* Unexplored Territory Settings */}
      <div className="p-4 bg-amber-900/10 border border-amber-700/30 rounded-lg mt-4">
        <h4 className="text-sm font-medium text-amber-200 mb-1 flex items-center gap-2">
          🧭 Unexplored Territory
        </h4>
        <p className="text-xs text-slate-500 mb-3">
          Find topics you discuss frequently but haven&apos;t extracted to your Library yet.
        </p>
        
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Days to analyze</label>
            <select
              value={unexplored.daysBack}
              onChange={(e) =>
                setThemeExplorer((prev) => ({
                  ...prev,
                  unexplored: { ...unexplored, daysBack: parseInt(e.target.value) },
                }))
              }
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200"
            >
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
              <option value={365}>Last year</option>
            </select>
          </div>
          
          <div>
            <label className="text-xs text-slate-400 block mb-1">Min conversations per topic</label>
            <select
              value={unexplored.minConversations}
              onChange={(e) =>
                setThemeExplorer((prev) => ({
                  ...prev,
                  unexplored: { ...unexplored, minConversations: parseInt(e.target.value) },
                }))
              }
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200"
            >
              <option value={3}>3+ conversations (more results)</option>
              <option value={5}>5+ conversations (balanced)</option>
              <option value={8}>8+ conversations (fewer, stronger)</option>
              <option value={10}>10+ conversations (high confidence)</option>
            </select>
          </div>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={unexplored.includeLowSeverity}
              onChange={(e) =>
                setThemeExplorer((prev) => ({
                  ...prev,
                  unexplored: { ...unexplored, includeLowSeverity: e.target.checked },
                }))
              }
              className="w-4 h-4 rounded bg-slate-800 border-slate-600"
            />
            <span className="text-sm text-slate-300">Include low severity topics (3-7 conversations)</span>
          </label>
        </div>
      </div>

      {/* Counter-Intuitive Settings */}
      <div className="p-4 bg-purple-900/10 border border-purple-700/30 rounded-lg mt-4">
        <h4 className="text-sm font-medium text-purple-200 mb-1 flex items-center gap-2">
          🔄 Counter-Intuitive Insights
        </h4>
        <p className="text-xs text-slate-500 mb-3">
          AI-generated &quot;good opposite&quot; perspectives to challenge your assumptions. Reflection prompts only — doesn&apos;t create Library items.
        </p>
        
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={counterIntuitive.enabled}
              onChange={(e) =>
                setThemeExplorer((prev) => ({
                  ...prev,
                  counterIntuitive: { ...counterIntuitive, enabled: e.target.checked },
                }))
              }
              className="w-4 h-4 rounded bg-slate-800 border-slate-600"
            />
            <span className="text-sm text-slate-300">Enable Counter-Intuitive tab</span>
          </label>
          
          {counterIntuitive.enabled && (
            <>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Min theme size to analyze</label>
                <select
                  value={counterIntuitive.minClusterSize}
                  onChange={(e) =>
                    setThemeExplorer((prev) => ({
                      ...prev,
                      counterIntuitive: { ...counterIntuitive, minClusterSize: parseInt(e.target.value) },
                    }))
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200"
                >
                  <option value={3}>3+ items (more suggestions)</option>
                  <option value={5}>5+ items (balanced)</option>
                  <option value={10}>10+ items (only strong themes)</option>
                </select>
              </div>
              
              <div>
                <label className="text-xs text-slate-400 block mb-1">Max suggestions</label>
                <select
                  value={counterIntuitive.maxSuggestions}
                  onChange={(e) =>
                    setThemeExplorer((prev) => ({
                      ...prev,
                      counterIntuitive: { ...counterIntuitive, maxSuggestions: parseInt(e.target.value) },
                    }))
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200"
                >
                  <option value={1}>1 (minimal)</option>
                  <option value={3}>3 (default)</option>
                  <option value={5}>5 (more options)</option>
                </select>
              </div>
              
              <div className="text-xs text-slate-500 bg-slate-800/30 p-2 rounded">
                ⚡ LLM cost: ~$0.05-0.10 per theme analyzed. Suggestions are cached.
              </div>
            </>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}
