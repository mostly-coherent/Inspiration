"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { ThemeExplorerTabs, getTabFromSearchParams } from "@/components/ThemeExplorerTabs";
import { UnexploredTab } from "@/components/UnexploredTab";
import { ReflectTab } from "@/components/ReflectTab";

interface ThemePreview {
  id: string;
  name: string;
  itemCount: number;
  items: { id: string; title: string; description?: string }[];
}

interface OneOffItem {
  id: string;
  title: string;
  description?: string;
}

interface ThemePreviewData {
  success: boolean;
  threshold: number;
  totalItems: number;
  themeCount: number;
  themes: ThemePreview[];
  oneOffItems: OneOffItem[];
  stats: {
    avgItemsPerTheme: number;
    singleItemThemes: number;
  };
  sourceType?: "library" | "vectordb" | "combined" | "none"; // NEW: Indicates data source
  message?: string; // Optional message from API
}

interface SynthesisData {
  success: boolean;
  synthesis: string;
  themeName: string;
  itemCount: number;
}

interface ExpertQuote {
  guestName: string;
  speaker: string;
  timestamp: string;
  content: string;
  similarity: number;
  episodeFilename: string;
  // Rich metadata (v2, from GitHub format)
  episodeTitle?: string;
  youtubeUrl?: string;
  videoId?: string;
  duration?: string;
}

interface ExpertPerspectivesData {
  quotes: ExpertQuote[];
  indexed: boolean;
}

// Item type filter options
type ItemTypeFilter = "all" | "idea" | "insight" | "use_case";

const ITEM_TYPE_TABS: { id: ItemTypeFilter; label: string; icon: string; description: string }[] = [
  { id: "all", label: "Everything", icon: "🎨", description: "See patterns across all your saved items" },
  { id: "idea", label: "Ideas", icon: "💡", description: "Tools, projects, and things to build" },
  { id: "insight", label: "Insights", icon: "✨", description: "Lessons learned and observations" },
  { id: "use_case", label: "Use Cases", icon: "🔍", description: "Real-world examples and evidence" },
];

// Slider labels for user understanding - layman-friendly
const ZOOM_LABELS = [
  { value: 0.5, label: "Big Picture", description: "Just a few major themes" },
  { value: 0.6, label: "Overview", description: "Broad categories" },
  { value: 0.7, label: "Balanced", description: "Natural groupings" },
  { value: 0.8, label: "Detailed", description: "More specific patterns" },
  { value: 0.9, label: "Fine-Grained", description: "Many small themes" },
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
  // NEW: Theme Map regeneration state
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [themeMapFromFastStart, setThemeMapFromFastStart] = useState<any>(null); // Loaded from cache
  
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
  
  // Expert perspectives state
  const [expertPerspectives, setExpertPerspectives] = useState<ExpertPerspectivesData | null>(null);
  const [expertLoading, setExpertLoading] = useState(false);
  
  // One-off items expansion state
  const [oneOffExpanded, setOneOffExpanded] = useState(false);
  const [selectedOneOffId, setSelectedOneOffId] = useState<string | null>(null);
  
  // Prevent state updates after unmount
  const isMountedRef = useRef(true);
  
  // Tab-specific config
  const [unexploredConfig, setUnexploredConfig] = useState({
    daysBack: 90,
    minConversations: 5,
    includeLowSeverity: false,
  });
  // Counter-intuitive config kept for backward compatibility with settings
  const [counterIntuitiveConfig, setCounterIntuitiveConfig] = useState({
    enabled: true,
    minClusterSize: 5,
    maxSuggestions: 3,
  });
  
  // NEW: Load cached theme map from Fast Start on mount
  useEffect(() => {
    let cancelled = false;
    
    const loadCachedThemeMap = async () => {
      try {
        // Load most recent theme map (no time limit - patterns over all time)
        const res = await fetch(`/api/theme-map`);
        if (cancelled) return;
        
        if (res.ok) {
          const data = await res.json();
          if (data.exists && data.data) {
            setThemeMapFromFastStart(data.data);
          }
        }
      } catch (err) {
        console.error("Failed to load cached theme map:", err);
      }
    };
    
    loadCachedThemeMap();
    
    return () => {
      cancelled = true;
    };
  }, []);
  
  // NEW: Regenerate theme map function (no time limit - patterns over all time)
  const regenerateThemeMap = useCallback(async () => {
    setIsRegenerating(true);
    setError(null);
    
    try {
      const res = await fetch("/api/generate-themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: 3650, // ~10 years - effectively all available data
          maxConversations: 80,
          source: null, // Auto-detect (Vector DB or SQLite)
        }),
      });
      
      if (!res.ok) {
        throw new Error(`Generation failed: ${res.status}`);
      }
      
      const result = await res.json();
      
      if (result.success && result.result) {
        setThemeMapFromFastStart(result.result);
        
        // Save to cache
        try {
          const saveRes = await fetch("/api/theme-map", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              days: 3650, // ~10 years - effectively all available data
              themes: result.result.themes.map((t: any) => ({
                name: t.title,
                description: t.summary,
                evidence: t.evidence.map((e: any) => ({
                  conversation_id: e.chatId,
                  snippet: e.snippet,
                })),
              })),
              counter_intuitive: result.result.counterIntuitive || [],
              unexplored_territory: result.result.unexploredTerritory || [],
              generated_at: result.result.generatedAt,
              conversations_analyzed: result.result.analyzed?.conversationsUsed || 0,
              time_window_days: 3650, // ~10 years - effectively all available data
            }),
          });
          
          if (!saveRes.ok) {
            console.warn("Failed to save theme map to cache:", await saveRes.text());
          }
        } catch (saveError) {
          console.error("Failed to save theme map to cache:", saveError);
          // Don't throw - caching failure shouldn't break regeneration
        }
      } else {
        throw new Error(result.error || "Generation failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate");
      console.error("Theme map regeneration failed:", err);
    } finally {
      setIsRegenerating(false);
    }
  }, []); // setState functions are stable, don't need dependencies
  
  // Load config values on mount
  useEffect(() => {
    isMountedRef.current = true;
    const loadConfig = async () => {
      try {
        const res = await fetch("/api/config");
        if (!res.ok) {
          console.error("Failed to load config:", res.status);
          return;
        }
        const data = await res.json();
        if (!isMountedRef.current) return;
        
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
        if (isMountedRef.current) {
          setConfigLoaded(true);
        }
      }
    };
    loadConfig();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // P4: Pre-fetch clusters for Counter-Intuitive tab (runs once on page load)
  // This triggers clustering in background so it's cached when user switches tabs
  useEffect(() => {
    if (!configLoaded) return;
    
    let cancelled = false;
    
    // Fire-and-forget: prefetch clusters with max=0 (no LLM generation, just caching)
    const prefetchClusters = async () => {
      try {
        // Call with max=0 to only trigger clustering (cached via P2), no LLM calls
        await fetch(`/api/themes/counter-intuitive?minSize=${counterIntuitiveConfig.minClusterSize}&max=0`);
        if (!cancelled) {
          console.log("[P4] Clusters pre-fetched and cached");
        }
      } catch {
        // Silent fail - this is just a performance optimization
      }
    };
    
    prefetchClusters();
    
    return () => {
      cancelled = true;
    };
  }, [configLoaded, counterIntuitiveConfig.minClusterSize]);

  // Debounce threshold changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedThreshold(threshold);
    }, 300);
    return () => clearTimeout(timer);
  }, [threshold]);

  // Fetch theme preview when threshold or item type changes
  const fetchThemes = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    // Validate threshold before making request
    if (debouncedThreshold < sliderMin || debouncedThreshold > sliderMax) {
      setError(`Invalid threshold: ${debouncedThreshold}. Must be between ${sliderMin} and ${sliderMax}`);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const itemTypeParam = itemTypeFilter !== "all" ? `&itemType=${itemTypeFilter}` : "";
      // API endpoint automatically falls back to Vector DB if no library items found
      const response = await fetch(
        `/api/items/themes/preview?threshold=${debouncedThreshold}${itemTypeParam}`
      );
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`Failed to fetch themes: ${errorText}`);
      }
      
      const json = await response.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (!isMountedRef.current) return;
      
      // Validate response structure
      if (!json || typeof json !== 'object') {
        throw new Error("Invalid response format from server");
      }
      
      setData(json);
      setSelectedTheme(null);
      setSynthesis(null);
      setSynthesisError(null);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [debouncedThreshold, itemTypeFilter, sliderMin, sliderMax]);

  useEffect(() => {
    fetchThemes();
  }, [fetchThemes]);

  // Fetch synthesis when a theme is selected
  const fetchSynthesis = useCallback(async (theme: ThemePreview) => {
    if (!isMountedRef.current) return;
    
    // Validate theme has items before synthesizing
    if (!theme.items || theme.items.length === 0) {
      setSynthesisError("Cannot synthesize: theme has no items");
      setSynthesisLoading(false);
      return;
    }
    
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
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        let errorMessage = "Failed to synthesize theme";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If not JSON, use the text or status
          errorMessage = errorText.length > 100 ? `HTTP ${response.status}` : errorText;
        }
        throw new Error(errorMessage);
      }
      
      const json: SynthesisData = await response.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (!isMountedRef.current) return;
      
      // Validate response structure
      if (!json || typeof json !== 'object' || !json.success) {
        throw new Error("Synthesis failed");
      }
      
      setSynthesis(json);
    } catch (err) {
      if (!isMountedRef.current) return;
      setSynthesisError(err instanceof Error ? err.message : "Failed to generate insights");
    } finally {
      if (isMountedRef.current) {
        setSynthesisLoading(false);
      }
    }
  }, [itemTypeFilter]);

  // Fetch expert perspectives when a theme is selected
  const fetchExpertPerspectives = useCallback(async (themeName: string) => {
    if (!isMountedRef.current) return;
    
    // Validate theme name
    if (!themeName || themeName.trim().length === 0) {
      setExpertPerspectives({ quotes: [], indexed: false });
      return;
    }
    
    setExpertLoading(true);
    setExpertPerspectives(null);
    
    try {
      const encodedTheme = encodeURIComponent(themeName.trim());
      const response = await fetch(`/api/expert-perspectives?theme=${encodedTheme}&topK=3&minSimilarity=0.35`);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`API error: ${errorText.length > 100 ? response.status : errorText}`);
      }
      
      const json = await response.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (!isMountedRef.current) return;
      
      // Validate response structure
      if (!json || typeof json !== 'object') {
        setExpertPerspectives({ quotes: [], indexed: false });
        return;
      }
      
      if (json.success) {
        setExpertPerspectives({
          quotes: Array.isArray(json.quotes) ? json.quotes : [],
          indexed: json.indexed ?? false,
        });
      } else {
        // API returned success: false, handle gracefully
        setExpertPerspectives({ quotes: [], indexed: json.indexed ?? false });
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("Failed to fetch expert perspectives:", err);
      // Fail gracefully - expert perspectives are optional
      setExpertPerspectives({ quotes: [], indexed: false });
    } finally {
      if (isMountedRef.current) {
        setExpertLoading(false);
      }
    }
  }, []);

  // Handle theme selection
  const handleThemeClick = (theme: ThemePreview) => {
    if (!theme || !theme.id) {
      console.error("Invalid theme selected");
      return;
    }
    
    if (selectedTheme?.id === theme.id) {
      // Deselect
      setSelectedTheme(null);
      setSynthesis(null);
      setSynthesisError(null);
      setExpertPerspectives(null);
    } else {
      // Select and fetch synthesis + expert perspectives
      setSelectedTheme(theme);
      // Only fetch if theme has items
      if (theme.items && theme.items.length > 0) {
        fetchSynthesis(theme);
      } else {
        setSynthesisError("Cannot synthesize: theme has no items");
      }
      fetchExpertPerspectives(theme.name);
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
                    ? "See what you've been thinking about most"
                    : activeTab === "unexplored"
                      ? "Topics you chat about but haven't saved yet"
                      : "Probing questions about your patterns and blind spots"}
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
                  <div className="flex items-center gap-3 text-xs text-slate-400" title="Slide left to see fewer, broader themes. Slide right to see more, specific themes.">
                    <span>📦 Fewer themes</span>
                    <span>←</span>
                    <span>→</span>
                    <span>📂 More themes</span>
                  </div>
                </div>
                
                <div className="relative">
                  <input
                    type="range"
                    min={sliderMin}
                    max={sliderMax}
                    step="0.01"
                    value={threshold}
                    onChange={(e) => {
                      const newValue = parseFloat(e.target.value);
                      // Validate range before setting
                      if (!isNaN(newValue) && newValue >= sliderMin && newValue <= sliderMax) {
                        setThreshold(newValue);
                      }
                    }}
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
                  {loading ? "Finding patterns..." : "Your Patterns"}
                </h2>
                {data.stats && (
                  <div className="text-sm text-slate-400" title="Average number of items grouped into each pattern">
                    ~{data.stats.avgItemsPerTheme.toFixed(1)} items per pattern
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
                        <div className="flex flex-col items-center gap-3 py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-400"></div>
                          <span className="text-slate-300">Finding what connects these items...</span>
                          <span className="text-xs text-slate-500">⏱️ Usually takes 10-20 seconds</span>
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
                            <span className="font-medium">What Connects These Items</span>
                          </div>
                          
                          {/* Synthesis Narrative */}
                          <div className="prose prose-invert prose-slate max-w-none prose-headings:text-slate-200 prose-h3:text-lg prose-h3:font-semibold prose-p:text-slate-200 prose-strong:text-slate-100">
                            <ReactMarkdown
                              components={{
                                p: ({ children }) => (
                                  <p className="text-slate-200 leading-relaxed mb-4">{children}</p>
                                ),
                                h3: ({ children }) => (
                                  <h3 className="text-lg font-semibold text-slate-200 mt-6 mb-3">{children}</h3>
                                ),
                                strong: ({ children }) => (
                                  <strong className="font-semibold text-slate-100">{children}</strong>
                                ),
                              }}
                            >
                              {synthesis.synthesis || ''}
                            </ReactMarkdown>
                          </div>
                          
                          {/* Expert Perspectives from Lenny's Podcast */}
                          {expertPerspectives && expertPerspectives.indexed && expertPerspectives.quotes.length > 0 && (
                            <div className="pt-4 border-t border-slate-700/50">
                              <div className="flex items-center gap-2 mb-3 text-amber-400">
                                <span className="text-lg">🎙️</span>
                                <span className="text-sm font-medium">Expert Perspectives</span>
                                <span className="text-xs text-slate-500">from Lenny&apos;s Podcast</span>
                              </div>
                              <div className="space-y-3">
                                {expertPerspectives.quotes.map((quote, idx) => (
                                  <div 
                                    key={`${quote.episodeFilename}-${quote.timestamp}-${idx}`}
                                    className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-4"
                                  >
                                    <p className="text-slate-200 text-sm leading-relaxed italic mb-3">
                                      &quot;{quote.content.length > 400 ? quote.content.slice(0, 400) + '...' : quote.content}&quot;
                                    </p>
                                    <div className="flex flex-col gap-2 text-xs">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-amber-300">
                                          <span className="font-medium">— {quote.guestName}</span>
                                          {quote.speaker !== quote.guestName && (
                                            <span className="text-slate-500">({quote.speaker})</span>
                                          )}
                                        </div>
                                        <span className="text-slate-500" title="Relevance score">
                                          {Math.round(quote.similarity * 100)}% match
                                        </span>
                                      </div>
                                      {/* Episode title + YouTube link */}
                                      {quote.episodeTitle && (
                                        <div className="flex items-center gap-2 text-slate-400">
                                          <span className="truncate max-w-[300px]" title={quote.episodeTitle}>
                                            📺 {quote.episodeTitle}
                                          </span>
                                          {quote.youtubeUrl && (
                                            <a 
                                              href={quote.youtubeUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-amber-400 hover:text-amber-300 hover:underline flex-shrink-0"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              Watch →
                                            </a>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Expert Loading State */}
                          {expertLoading && (
                            <div className="pt-4 border-t border-slate-700/50">
                              <div className="flex items-center gap-2 text-amber-400">
                                <span className="animate-pulse">🎙️</span>
                                <span className="text-sm text-slate-400">Finding expert perspectives...</span>
                              </div>
                            </div>
                          )}

                          {/* Provenance: Item Titles */}
                          <div className="pt-4 border-t border-slate-700/50">
                            <div className="flex items-center gap-2 mb-3 text-slate-400">
                              <span className="text-sm">📚</span>
                              <span className="text-sm font-medium">Your items in this pattern ({theme.itemCount})</span>
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
                <div className="text-center py-16">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-700/30 mb-6">
                    <span className="text-4xl">🔭</span>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    No Patterns at This Zoom Level
                  </h3>
                  <p className="text-slate-400 max-w-md mx-auto mb-4">
                    Try sliding toward &quot;Big Picture&quot; to see broader themes, or add more items to your Library.
                  </p>
                  <p className="text-xs text-slate-500">
                    💡 Patterns emerge when you have related ideas saved in your Library
                  </p>
                </div>
              )}
            </div>

              {/* Stats & Insights Panel */}
            <div className="space-y-4">
              <div className="glass-card p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">📊</span> At a Glance
                </h3>
                
                <div className="space-y-4">
                  <div className="bg-slate-800/50 rounded-lg p-4">
                    <div className="text-3xl font-bold text-white">{data.themeCount}</div>
                    <div className="text-sm text-slate-400">Patterns found</div>
                  </div>
                  
                  {data.stats && data.stats.singleItemThemes > 0 && (
                    <div className="space-y-2">
                      {/* Clickable One-off items card */}
                      <button
                        onClick={() => {
                          setOneOffExpanded(!oneOffExpanded);
                          if (oneOffExpanded) setSelectedOneOffId(null); // Reset selection when collapsing
                        }}
                        className="w-full text-left bg-slate-800/50 rounded-lg p-4 hover:bg-slate-800/70 transition-colors border border-transparent hover:border-amber-500/30"
                        title="Click to explore these unique items — they might be unexplored territory!"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-3xl font-bold text-amber-400">
                              {data.stats.singleItemThemes}
                            </div>
                            <div className="text-sm text-slate-400 flex items-center gap-2">
                              One-off items
                              <span className="text-xs bg-amber-900/50 text-amber-400 px-1.5 py-0.5 rounded">
                                🧭 Explore
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Unique ideas that stand alone</div>
                          </div>
                          <svg
                            className={`w-5 h-5 text-slate-400 transition-transform ${oneOffExpanded ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      
                      {/* Expanded One-off items content */}
                      {oneOffExpanded && (
                        <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-4 space-y-4">
                          {/* WIP Banner */}
                          <div className="flex items-start gap-2">
                            <span className="text-lg">🚧</span>
                            <div>
                              <p className="text-amber-200 text-sm font-medium">Unexplored Territory?</p>
                              <p className="text-xs text-slate-400 mt-1">
                                These items don&apos;t cluster with anything else — they&apos;re either unique gems or topics you haven&apos;t explored enough yet.
                              </p>
                            </div>
                          </div>
                          
                          {/* List of one-off items */}
                          <div className="space-y-2">
                            {data.oneOffItems && data.oneOffItems.length > 0 ? (
                              <>
                                {/* Show clickable items if <= 20, otherwise just text */}
                                {data.stats.singleItemThemes <= 20 ? (
                                  // Clickable items with details
                                  data.oneOffItems.map((item) => (
                                    <div key={item.id}>
                                      <button
                                        onClick={() => setSelectedOneOffId(selectedOneOffId === item.id ? null : item.id)}
                                        className={`w-full text-left text-sm pl-3 border-l-2 py-1.5 transition-all ${
                                          selectedOneOffId === item.id
                                            ? "text-amber-200 border-amber-400 bg-amber-900/20"
                                            : "text-slate-300 border-amber-600/50 hover:text-amber-200 hover:border-amber-500/70"
                                        }`}
                                      >
                                        <span className="text-amber-400 mr-2">•</span>
                                        {item.title}
                                        {item.description && (
                                          <span className="ml-2 text-xs text-slate-500">
                                            {selectedOneOffId === item.id ? "▼" : "▶"}
                                          </span>
                                        )}
                                      </button>
                                      {/* Expanded details */}
                                      {selectedOneOffId === item.id && item.description && (
                                        <div className="ml-6 mt-1 mb-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                          <p className="text-sm text-slate-300">{item.description}</p>
                                        </div>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  // Non-clickable list for > 20 items (show first 10)
                                  <>
                                    {data.oneOffItems.slice(0, 10).map((item) => (
                                      <div
                                        key={item.id}
                                        className="text-sm text-slate-300 pl-3 border-l-2 border-amber-600/50 py-1"
                                      >
                                        <span className="text-amber-400 mr-2">•</span>
                                        {item.title}
                                      </div>
                                    ))}
                                    <div className="text-xs text-slate-500 pl-3">
                                      + {data.stats.singleItemThemes - 10} more...
                                    </div>
                                  </>
                                )}
                              </>
                            ) : (
                              <div className="text-sm text-slate-400 italic pl-3">
                                No one-off items at this zoom level
                              </div>
                            )}
                          </div>
                          
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Reflection Prompts */}
              <div className="glass-card p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">💭</span> Questions to Ask Yourself
                </h3>
                <div className="space-y-3 text-sm text-slate-300">
                  <p className="italic">
                    &quot;What am I thinking about the most?&quot;
                  </p>
                  <p className="italic">
                    &quot;Are there surprises in these patterns?&quot;
                  </p>
                  <p className="italic">
                    &quot;What themes should I explore more?&quot;
                  </p>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/30 rounded-xl p-4 border border-indigo-700/30">
                <h4 className="font-medium text-white mb-2">💡 How It Works</h4>
                <ul className="text-sm text-slate-300 space-y-2">
                  <li>→ <strong>Slide left</strong> — See fewer, broader themes</li>
                  <li>→ <strong>Slide right</strong> — See more, specific themes</li>
                  <li>→ <strong>Click a theme</strong> — AI explains what connects these items</li>
                  <li>→ <strong>Filter by type</strong> — Focus on Ideas, Insights, or Use Cases</li>
                </ul>
                <p className="text-xs text-slate-500 mt-3">
                  Patterns are computed fresh each time based on semantic similarity.
                </p>
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
          <ReflectTab />
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
