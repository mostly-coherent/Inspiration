"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ThemeExplorerTabs, getTabFromSearchParams, type ThemeTab } from "@/components/ThemeExplorerTabs";
import { UnexploredTab } from "@/components/UnexploredTab";
import { CounterIntuitiveTab } from "@/components/CounterIntuitiveTab";

interface ThemePreview {
  id: string;
  name: string;
  itemCount: number;
  items: { id: string; title: string; description?: string }[];
}

interface ThemePreviewData {
  success: boolean;
  threshold: number;
  totalItems: number;
  themeCount: number;
  themes: ThemePreview[];
  stats: {
    avgItemsPerTheme: number;
    singleItemThemes: number;
  };
}

interface SynthesisData {
  success: boolean;
  synthesis: string;
  themeName: string;
  itemCount: number;
}

// Item type filter options
type ItemTypeFilter = "all" | "idea" | "insight" | "use_case";

const ITEM_TYPE_TABS: { id: ItemTypeFilter; label: string; icon: string; description: string }[] = [
  { id: "all", label: "All Items", icon: "🎨", description: "All ideas, insights, and use cases" },
  { id: "idea", label: "Ideas", icon: "💡", description: "Tools and things to build" },
  { id: "insight", label: "Insights", icon: "✨", description: "Observations and learnings" },
  { id: "use_case", label: "Use Cases", icon: "🔍", description: "Real examples and evidence" },
];

// Slider labels for user understanding
const ZOOM_LABELS = [
  { value: 0.5, label: "Very Broad", description: "See major patterns (few themes)" },
  { value: 0.6, label: "Broad", description: "High-level themes" },
  { value: 0.7, label: "Balanced", description: "Natural groupings" },
  { value: 0.8, label: "Specific", description: "Detailed themes" },
  { value: 0.9, label: "Granular", description: "Fine-grained (many themes)" },
];

function getZoomLabel(threshold: number): { label: string; description: string } {
  for (const zoom of ZOOM_LABELS) {
    if (threshold <= zoom.value) {
      return { label: zoom.label, description: zoom.description };
    }
  }
  return ZOOM_LABELS[ZOOM_LABELS.length - 1];
}

function ThemesPage() {
  // Item type filter
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>("all");
  
  // Separate thresholds per item type (stored in state, persisted could be added later)
  const [thresholds, setThresholds] = useState<Record<ItemTypeFilter, number>>({
    all: 0.7,
    idea: 0.7,
    insight: 0.7,
    use_case: 0.7,
  });
  
  // Current threshold based on selected filter
  const threshold = thresholds[itemTypeFilter];
  const setThreshold = (value: number) => {
    setThresholds(prev => ({ ...prev, [itemTypeFilter]: value }));
  };
  
  const [debouncedThreshold, setDebouncedThreshold] = useState(0.7);
  const [sliderMin, setSliderMin] = useState(0.45);
  const [sliderMax, setSliderMax] = useState(0.92);
  const [data, setData] = useState<ThemePreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<ThemePreview | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  
  // Synthesis state
  const [synthesis, setSynthesis] = useState<SynthesisData | null>(null);
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  
  // Tab-specific config
  const [unexploredConfig, setUnexploredConfig] = useState({
    daysBack: 90,
    minConversations: 5,
    includeLowSeverity: false,
  });
  const [counterIntuitiveConfig, setCounterIntuitiveConfig] = useState({
    enabled: true,
    minClusterSize: 5,
    maxSuggestions: 3,
  });
  
  // Load config values on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch("/api/config");
        const data = await res.json();
        if (data.success && data.config?.themeExplorer) {
          const { defaultZoom, sliderMin: min, sliderMax: max, unexplored, counterIntuitive } = data.config.themeExplorer;
          if (defaultZoom !== undefined) {
            // Set default zoom for all types
            setThresholds({
              all: defaultZoom,
              idea: defaultZoom,
              insight: defaultZoom,
              use_case: defaultZoom,
            });
            setDebouncedThreshold(defaultZoom);
          }
          if (min !== undefined) setSliderMin(min);
          if (max !== undefined) setSliderMax(max);
          
          // Load unexplored config
          if (unexplored) {
            setUnexploredConfig({
              daysBack: unexplored.daysBack ?? 90,
              minConversations: unexplored.minConversations ?? 5,
              includeLowSeverity: unexplored.includeLowSeverity ?? false,
            });
          }
          
          // Load counter-intuitive config
          if (counterIntuitive) {
            setCounterIntuitiveConfig({
              enabled: counterIntuitive.enabled ?? true,
              minClusterSize: counterIntuitive.minClusterSize ?? 5,
              maxSuggestions: counterIntuitive.maxSuggestions ?? 3,
            });
          }
        }
      } catch (err) {
        console.error("Failed to load theme explorer config:", err);
      } finally {
        setConfigLoaded(true);
      }
    };
    loadConfig();
  }, []);

  // Debounce threshold changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedThreshold(threshold);
    }, 300);
    return () => clearTimeout(timer);
  }, [threshold]);

  // Fetch theme preview when threshold or item type changes
  const fetchThemes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const itemTypeParam = itemTypeFilter !== "all" ? `&itemType=${itemTypeFilter}` : "";
      const response = await fetch(
        `/api/items/themes/preview?threshold=${debouncedThreshold}${itemTypeParam}`
      );
      if (!response.ok) throw new Error("Failed to fetch themes");
      const json = await response.json();
      setData(json);
      setSelectedTheme(null);
      setSynthesis(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [debouncedThreshold, itemTypeFilter]);

  useEffect(() => {
    fetchThemes();
  }, [fetchThemes]);

  // Fetch synthesis when a theme is selected
  const fetchSynthesis = useCallback(async (theme: ThemePreview) => {
    setSynthesisLoading(true);
    setSynthesisError(null);
    setSynthesis(null);
    
    try {
      const response = await fetch("/api/items/themes/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeName: theme.name,
          items: theme.items,
          itemType: itemTypeFilter, // Pass current filter to use appropriate prompt
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to synthesize theme");
      }
      
      const json: SynthesisData = await response.json();
      setSynthesis(json);
    } catch (err) {
      setSynthesisError(err instanceof Error ? err.message : "Failed to generate insights");
    } finally {
      setSynthesisLoading(false);
    }
  }, [itemTypeFilter]);

  // Handle theme selection
  const handleThemeClick = (theme: ThemePreview) => {
    if (selectedTheme?.id === theme.id) {
      // Deselect
      setSelectedTheme(null);
      setSynthesis(null);
      setSynthesisError(null);
    } else {
      // Select and fetch synthesis
      setSelectedTheme(theme);
      fetchSynthesis(theme);
    }
  };

  const zoomInfo = getZoomLabel(threshold);

  // Get active tab from URL
  const searchParams = useSearchParams();
  const activeTab = getTabFromSearchParams(searchParams);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  <span className="text-3xl">🔭</span> Theme Explorer
                </h1>
                <p className="text-slate-400 text-sm">
                  {activeTab === "patterns" 
                    ? "Discover patterns across your Library"
                    : activeTab === "unexplored"
                      ? "Find topics missing from your Library"
                      : "Explore counter-intuitive perspectives"}
                </p>
              </div>
            </div>
            {activeTab === "patterns" && (
              <div className="text-right">
                <div className="text-lg font-semibold text-white">{data?.themeCount || 0} Themes</div>
                <div className="text-sm text-slate-400">
                  {data?.totalItems || 0} {itemTypeFilter === "all" ? "items" : ITEM_TYPE_TABS.find(t => t.id === itemTypeFilter)?.label.toLowerCase()}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <ThemeExplorerTabs activeTab={activeTab} />

      {/* Tab-specific content */}
      {activeTab === "patterns" ? (
        <>
          {/* Item Type Tabs + Zoom Control - Fixed */}
          <div className="sticky top-[73px] z-10 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/30">
            <div className="max-w-7xl mx-auto px-6 py-4">
              {/* Item Type Filter Tabs */}
              <div className="flex flex-wrap gap-2 mb-4">
                {ITEM_TYPE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setItemTypeFilter(tab.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      itemTypeFilter === tab.id
                        ? "bg-indigo-600/40 text-indigo-200 border border-indigo-500/50 shadow-lg shadow-indigo-500/10"
                        : "bg-slate-800/40 text-slate-400 border border-slate-700/50 hover:bg-slate-800/60 hover:text-slate-300"
                    }`}
                  >
                    <span className="mr-1.5">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
              
              {/* Current filter description */}
              <div className="text-xs text-slate-500 mb-4">
                {ITEM_TYPE_TABS.find(t => t.id === itemTypeFilter)?.description}
              </div>
              
              {/* Zoom Slider */}
              <div className="glass-card p-4 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-xl mr-2">🔍</span>
                    <span className="text-base font-semibold text-white">{zoomInfo.label}</span>
                    <span className="text-slate-400 ml-2 text-sm">— {zoomInfo.description}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>🌳 Forest</span>
                    <span>←</span>
                    <span>→</span>
                    <span>🌲 Trees</span>
                  </div>
                </div>
                
                <div className="relative">
                  <input
                    type="range"
                    min={sliderMin}
                    max={sliderMax}
                    step="0.01"
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    aria-label={`Theme similarity threshold: ${(threshold * 100).toFixed(0)}%`}
                    aria-valuemin={sliderMin * 100}
                    aria-valuemax={sliderMax * 100}
                    aria-valuenow={Math.round(threshold * 100)}
                    aria-valuetext={`${zoomInfo.label}: ${zoomInfo.description}`}
                    className="w-full h-2 bg-gradient-to-r from-emerald-600 via-amber-500 to-rose-600 rounded-full appearance-none cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg
                      [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-slate-300
                      [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-transform"
                  />
                  <div className="flex justify-between mt-2 text-xs text-slate-500">
                    <span>Broad themes</span>
                    <span>Similarity: {(threshold * 100).toFixed(0)}%</span>
                    <span>Specific themes</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Themes List */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  {loading ? "Recomputing..." : "Your Themes"}
                </h2>
                {data.stats && (
                  <div className="text-sm text-slate-400">
                    Avg {data.stats.avgItemsPerTheme.toFixed(1)} items/theme
                  </div>
                )}
              </div>
              
              {data.themes.map((theme, index) => (
                <div key={theme.id}>
                  <button
                    onClick={() => handleThemeClick(theme)}
                    aria-expanded={selectedTheme?.id === theme.id}
                    aria-label={`Theme: ${theme.name} with ${theme.itemCount} items. ${selectedTheme?.id === theme.id ? 'Click to collapse' : 'Click to expand and see AI insights'}`}
                    className={`w-full text-left p-4 rounded-xl transition-all duration-200 ${
                      selectedTheme?.id === theme.id
                        ? "bg-indigo-600/30 border-2 border-indigo-500/50 shadow-lg shadow-indigo-500/10"
                        : "bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">
                          {index === 0 ? "🏔️" : index === 1 ? "🌊" : index === 2 ? "🌅" : "🌿"}
                        </span>
                        <div>
                          <h3 className="font-medium text-white text-lg">{theme.name}</h3>
                          <p className="text-sm text-slate-400">
                            {theme.itemCount} {theme.itemCount === 1 ? "item" : "items"}
                          </p>
                        </div>
                      </div>
                      <svg
                        className={`w-5 h-5 text-slate-400 transition-transform ${
                          selectedTheme?.id === theme.id ? "rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  
                  {/* Expanded content with synthesis */}
                  {selectedTheme?.id === theme.id && (
                    <div className="mt-2 ml-4 p-5 bg-slate-800/60 rounded-xl border border-slate-700/50">
                      {/* Synthesis Loading State */}
                      {synthesisLoading && (
                        <div className="flex items-center gap-3 py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-400"></div>
                          <span className="text-slate-300">Discovering patterns...</span>
                        </div>
                      )}
                      
                      {/* Synthesis Error */}
                      {synthesisError && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
                          <p className="text-red-400 text-sm">{synthesisError}</p>
                        </div>
                      )}
                      
                      {/* Synthesis Content */}
                      {synthesis && !synthesisLoading && (
                        <div className="space-y-6">
                          {/* AI Insights Header */}
                          <div className="flex items-center gap-2 text-indigo-300">
                            <span className="text-xl">✨</span>
                            <span className="font-medium">Pattern Insights</span>
                          </div>
                          
                          {/* Synthesis Narrative */}
                          <div className="prose prose-invert prose-slate max-w-none">
                            {(synthesis.synthesis || '').split('\n\n').filter(Boolean).map((paragraph, i) => (
                              <p key={i} className="text-slate-200 leading-relaxed mb-4">
                                {paragraph}
                              </p>
                            ))}
                          </div>
                          
                          {/* Provenance: Item Titles */}
                          <div className="pt-4 border-t border-slate-700/50">
                            <div className="flex items-center gap-2 mb-3 text-slate-400">
                              <span className="text-sm">📚</span>
                              <span className="text-sm font-medium">Items in this theme ({theme.itemCount})</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {theme.items.map((item) => (
                                <div
                                  key={item.id}
                                  className="text-sm text-slate-400 pl-3 border-l-2 border-slate-600/50 py-1 hover:text-slate-300 hover:border-indigo-500/50 transition-colors"
                                >
                                  {item.title}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              
              {data.themes.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <p className="text-lg">No themes found at this similarity level</p>
                  <p className="text-sm mt-2">Try adjusting the slider</p>
                </div>
              )}
            </div>

            {/* Stats & Insights Panel */}
            <div className="space-y-4">
              <div className="glass-card p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">📊</span> Insights
                </h3>
                
                <div className="space-y-4">
                  <div className="bg-slate-800/50 rounded-lg p-4">
                    <div className="text-3xl font-bold text-white">{data.themeCount}</div>
                    <div className="text-sm text-slate-400">Total Themes</div>
                  </div>
                  
                  {data.stats && (
                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <div className="text-3xl font-bold text-amber-400">
                        {data.stats.singleItemThemes}
                      </div>
                      <div className="text-sm text-slate-400">Unique outliers</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Reflection Prompts */}
              <div className="glass-card p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">💭</span> Reflect
                </h3>
                <div className="space-y-3 text-sm text-slate-300">
                  <p className="italic">
                    &quot;What patterns emerge when I zoom out?&quot;
                  </p>
                  <p className="italic">
                    &quot;Are there themes I didn&apos;t expect?&quot;
                  </p>
                  <p className="italic">
                    &quot;What&apos;s missing from my thinking?&quot;
                  </p>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/30 rounded-xl p-4 border border-indigo-700/30">
                <h4 className="font-medium text-white mb-2">How to use</h4>
                <ul className="text-sm text-slate-300 space-y-1">
                  <li>→ Slide left to see broad themes</li>
                  <li>→ Slide right for specific themes</li>
                  <li>→ Click a theme for AI insights</li>
                  <li>→ Themes are computed fresh each time</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
        </>
      ) : activeTab === "unexplored" ? (
        <main className="max-w-7xl mx-auto px-6 py-8">
          <UnexploredTab config={unexploredConfig} />
        </main>
      ) : (
        <main className="max-w-7xl mx-auto px-6 py-8">
          <CounterIntuitiveTab config={counterIntuitiveConfig} />
        </main>
      )}
    </div>
  );
}

// Wrap the page in Suspense for useSearchParams
export default function ThemesPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    }>
      <ThemesPage />
    </Suspense>
  );
}
