"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Theme Map Viewer
 * 
 * Displays the saved Theme Map from data/theme_map.json
 * Accessible from main app navigation
 */

interface ThemeEvidence {
  conversation_id: string;
  snippet: string;
}

interface ExpertQuote {
  guestName: string;
  speaker?: string;
  content: string;
  episodeTitle?: string;
  youtubeUrl?: string;
  timestamp?: string;
  similarity?: number;
}

interface Theme {
  name: string;
  description: string;
  evidence: ThemeEvidence[];
  expertPerspectives?: ExpertQuote[];
}

interface CounterIntuitive {
  title: string;
  perspective: string;
  reasoning: string;
  expertChallenge?: ExpertQuote;
}

interface UnexploredTerritory {
  title: string;
  why: string;
  expertInsight?: ExpertQuote;
}

interface ThemeMapData {
  themes: Theme[];
  counter_intuitive?: CounterIntuitive[];
  unexplored_territory: (string | UnexploredTerritory)[];  // Support both legacy and new format
  generated_at: string;
  conversations_analyzed: number;
  conversations_considered?: number;  // Total found before capping
  time_window_days: number | null; // null = size-based Theme Map
  max_size_mb?: number; // Size-based Theme Map context (~500MB)
  tech_stack_detected?: string[];
  lennyAvailable?: boolean;
  lennyUnlocked?: boolean;
  meta?: {
    llm_provider?: string;
    generation_time_seconds?: number;
  };
}

// Theme Maps are now size-based (~500MB), not days-based
// Removed days normalization - no longer needed

export default function ThemeMapPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [themeMap, setThemeMap] = useState<ThemeMapData | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [expandedUnexplored, setExpandedUnexplored] = useState<Set<number>>(new Set());
  
  // Load saved Theme Map
  useEffect(() => {
    const loadThemeMap = async () => {
      try {
        // Load most recent Theme Map (no days parameter = find most recent)
        const res = await fetch("/api/theme-map");
        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }
        const data = await res.json();
        
        if (data.success && data.exists) {
          setThemeMap(data.data);
          setSavedAt(data.savedAt);
        } else if (!data.exists) {
          // No saved Theme Map - don't redirect automatically
          // Show error state with option to generate, but let user stay on page
          setError("No Theme Map found. Click 'Generate Theme Map' below to create one.");
        } else {
          setError(data.error || "Failed to load Theme Map");
        }
      } catch (e) {
        console.error("Failed to load Theme Map:", e);
        setError("Failed to load Theme Map");
      } finally {
        setLoading(false);
      }
    };
    
    loadThemeMap();
  }, [router]);

  // Regenerate Theme Map
  const regenerate = useCallback(async () => {
    setRegenerating(true);
    setError(null);
    
    try {
      // Get config for provider
      const configRes = await fetch("/api/config");
      if (!configRes.ok) {
        throw new Error("Failed to load config");
      }
      const configData = await configRes.json();
      const provider = configData.config?.llm?.provider || "anthropic";
      
      const res = await fetch("/api/generate-themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxSizeMb: 500, // Size-based regeneration - analyze most recent ~500MB
          provider,
        }),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        let errorMsg = `API error: ${res.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMsg = errorData.error || errorMsg;
        } catch {
          // Use default error message
        }
        throw new Error(errorMsg);
      }
      
      const data = await res.json().catch((parseError) => {
        throw new Error(`Failed to parse generation response: ${parseError.message}`);
      });
      
      if (data.success && data.result) {
        // Persist Theme Map
        const saveRes = await fetch("/api/theme-map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            maxSizeMb: 500, // Size-based Theme Map (most recent ~500MB)
            themes: (data.result.themes || []).map((t: { title: string; summary: string; evidence?: Array<{ chatId: string; snippet: string }>; expertPerspectives?: ExpertQuote[] }) => ({
              name: t.title,
              description: t.summary,
              evidence: (t.evidence || []).map((e) => ({
                conversation_id: e.chatId,
                snippet: e.snippet,
              })),
              expertPerspectives: t.expertPerspectives || [], // Preserve Lenny's wisdom
            })),
            counter_intuitive: data.result.counterIntuitive || [],
            unexplored_territory: data.result.unexploredTerritory || [],
            generated_at: data.result.generatedAt,
            conversations_analyzed: data.result.analyzed.conversationsUsed,
            conversations_considered: data.result.analyzed.conversationsConsidered,
            meta: {
              llm_provider: provider,
            },
          }),
        });
        
        if (!saveRes.ok) {
          const saveErrorText = await saveRes.text().catch(() => `HTTP ${saveRes.status}`);
          throw new Error(`Failed to save Theme Map: ${saveErrorText}`);
        }
        const saveData = await saveRes.json().catch((parseError) => {
          throw new Error(`Failed to parse save response: ${parseError.message}`);
        });
        if (!saveData.success) {
          throw new Error(`Theme Map save failed: ${saveData.error || "Unknown error"}`);
        }
        
        // Reload Theme Map after save
        const reloadRes = await fetch("/api/theme-map");
        if (!reloadRes.ok) {
          throw new Error(`Failed to reload Theme Map: ${reloadRes.status}`);
        }
        const reloadData = await reloadRes.json().catch((parseError) => {
          throw new Error(`Failed to parse reload response: ${parseError.message}`);
        });
        if (reloadData.success && reloadData.exists) {
          setThemeMap(reloadData.data);
          setSavedAt(reloadData.savedAt);
        } else {
          throw new Error("Theme Map saved but reload failed");
        }
      } else {
        setError(data.error || "Failed to regenerate themes");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to regenerate");
    } finally {
      setRegenerating(false);
    }
  }, []); // No dependencies - always uses size-based regeneration

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading Theme Map...</p>
        </div>
      </div>
    );
  }

  if (error && !themeMap) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950 p-6">
        <div className="text-center space-y-6 max-w-2xl">
          <span className="text-6xl">🗺️</span>
          <h1 className="text-2xl font-bold text-white">No Theme Map Yet</h1>
          <p className="text-slate-400">{error}</p>
          <div className="flex gap-3 justify-center">
            <Link
              href="/"
              className="py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
            >
              ← Home
            </Link>
            <Link
              href="/onboarding-fast"
              className="py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors"
            >
              Generate Theme Map
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950 p-6">
      {/* Background decoration */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-slate-400 hover:text-white transition-colors"
            >
              ← Back
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <span>🗺️</span> Your Theme Map
              </h1>
              {savedAt && (
                <p className="text-sm text-slate-500">
                  Last generated: {formatDate(savedAt)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={regenerate}
            disabled={regenerating}
            className="py-2 px-4 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {regenerating ? (
              <>
                <span className="animate-spin">⏳</span> Regenerating...
              </>
            ) : (
              <>
                <span>🔄</span> Regenerate
              </>
            )}
          </button>
        </header>

        {/* Error banner */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Stats bar */}
        {themeMap && (
          <div className="flex items-center gap-6 text-sm text-slate-400 bg-slate-800/30 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <span>📊</span>
              <span>
                {themeMap.conversations_considered && themeMap.conversations_considered > themeMap.conversations_analyzed ? (
                  <>
                    Up to <strong className="text-white">{themeMap.conversations_considered}</strong> conversations fetched, <strong className="text-white">{themeMap.conversations_analyzed}</strong> analyzed
                  </>
                ) : (
                  <>
                    <strong className="text-white">{themeMap.conversations_analyzed}</strong> conversations analyzed
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>💾</span>
              <span>Most recent <strong className="text-white">~{themeMap.max_size_mb || 500}MB</strong> analyzed</span>
            </div>
          </div>
        )}

        {/* Themes */}
        {themeMap && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span>🎯</span> Top {themeMap.themes.length} {themeMap.themes.length === 1 ? 'Theme' : 'Themes'}
            </h2>
            {themeMap.themes.map((theme, i) => (
              <div key={(theme as any).id || (theme as any).name || (theme as any).title || `theme-${i}`} className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl font-bold text-indigo-400">{i + 1}</span>
                  <div>
                    {/* Handle both field name variations: name/description (saved) and title/summary (generated) */}
                    <h3 className="font-semibold text-white text-lg">{(theme as any).name || (theme as any).title}</h3>
                    <p className="text-slate-400 text-sm">{(theme as any).description || (theme as any).summary}</p>
                  </div>
                </div>
                
                {theme.evidence.length > 0 && (
                  <div className="pl-9 pt-2 border-t border-slate-700/50">
                    <div className="text-xs text-slate-500 mb-2">Evidence ({theme.evidence.length} conversations):</div>
                    {theme.evidence.slice(0, 3).map((ev, j) => (
                      <div key={ev.conversation_id || `evidence-${i}-${j}`} className="text-sm text-slate-400 bg-slate-900/50 rounded p-2 mb-2">
                        <div className="text-slate-300 italic">&quot;{ev.snippet}&quot;</div>
                      </div>
                    ))}
                    {theme.evidence.length > 3 && (
                      <p className="text-xs text-slate-500">+{theme.evidence.length - 3} more</p>
                    )}
                  </div>
                )}
                
                {/* Expert Perspectives from Lenny's Podcast */}
                {theme.expertPerspectives && theme.expertPerspectives.length > 0 && (
                  <div className="pl-9 pt-2 border-t border-amber-500/20">
                    <div className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                      <span>🎙️</span> Expert Perspective
                    </div>
                    {(theme.expertPerspectives || []).slice(0, 1).map((quote, j) => (
                      <div key={`expert-${i}-${j}`} className="text-sm bg-amber-500/5 rounded p-3 border border-amber-500/20">
                        <p className="text-slate-300 italic">&quot;{quote.content}&quot;</p>
                        <div className="flex items-center justify-between mt-2 text-xs">
                          <span className="text-amber-400 font-medium">— {quote.guestName}</span>
                          {quote.youtubeUrl && quote.episodeTitle && (
                            <a 
                              href={quote.youtubeUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-slate-500 hover:text-amber-400 transition-colors"
                            >
                              📺 {quote.episodeTitle}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        {/* Lenny Unlock Teaser */}
        {themeMap && themeMap.lennyAvailable && !themeMap.lennyUnlocked && (
          <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎙️</span>
              <div>
                <h3 className="font-semibold text-amber-300">Unlock Expert Perspectives</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Add an OpenAI API key to see what 300+ industry experts (from Lenny&apos;s Podcast, updated weekly) 
                  have said about your themes.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Counter-Intuitive */}
        {themeMap && themeMap.counter_intuitive && themeMap.counter_intuitive.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span>💭</span> Counter-Intuitive
            </h2>
            <div className="grid gap-3">
              {themeMap.counter_intuitive.map((item, i) => (
                <div key={item.title || `counter-intuitive-${i}`} className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl font-bold text-purple-400">{i + 1}</span>
                    <div>
                      <h3 className="font-semibold text-white text-lg">{item.title}</h3>
                      <p className="text-purple-300 text-sm italic mt-1">{item.perspective}</p>
                    </div>
                  </div>
                  <div className="pl-9">
                    <div className="text-xs text-slate-500 mb-1">Why consider this:</div>
                    <p className="text-sm text-slate-300">{item.reasoning}</p>
                  </div>
                  
                  {/* Expert Challenge from Lenny's Podcast */}
                  {item.expertChallenge && (
                    <div className="pl-9 pt-2 border-t border-purple-500/20">
                      <div className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                        <span>🎙️</span> Expert Challenge
                      </div>
                      <div className="text-sm bg-amber-500/5 rounded p-3 border border-amber-500/20">
                        <p className="text-slate-300 italic">&quot;{item.expertChallenge.content}&quot;</p>
                        <div className="flex items-center justify-between mt-2 text-xs">
                          <span className="text-amber-400 font-medium">— {item.expertChallenge.guestName}</span>
                          {item.expertChallenge.youtubeUrl && item.expertChallenge.episodeTitle && (
                            <a 
                              href={item.expertChallenge.youtubeUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-slate-500 hover:text-amber-400 transition-colors"
                            >
                              📺 {item.expertChallenge.episodeTitle}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unexplored Territory */}
        {themeMap && themeMap.unexplored_territory.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span>🔭</span> Unexplored Territory
            </h2>
            <div className="grid gap-3">
              {themeMap.unexplored_territory.map((item, i) => {
                // Support both legacy (string) and new format (object)
                const title = typeof item === 'string' ? item : item.title;
                const why = typeof item === 'string' ? null : item.why;
                const expertInsight = typeof item === 'string' ? null : item.expertInsight;
                const hasDetails = !!(why || expertInsight);
                const isExpanded = expandedUnexplored.has(i);
                
                return (
                  <div key={title || `unexplored-${i}`} className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl font-bold text-amber-400">{i + 1}</span>
                      <div className="flex-1">
                        <h3 className="font-semibold text-white text-lg">{title}</h3>
                        {hasDetails && (
                          <button
                            onClick={() => {
                              const newExpanded = new Set(expandedUnexplored);
                              if (isExpanded) {
                                newExpanded.delete(i);
                              } else {
                                newExpanded.add(i);
                              }
                              setExpandedUnexplored(newExpanded);
                            }}
                            className="mt-2 text-xs text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1"
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? (
                              <>
                                <span>▼</span> Hide details
                              </>
                            ) : (
                              <>
                                <span>▶</span> Show details
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <>
                        {why && (
                          <div className="pl-9">
                            <div className="text-xs text-slate-500 mb-1">Why this matters:</div>
                            <p className="text-sm text-slate-300">{why}</p>
                          </div>
                        )}
                        
                        {/* Expert Insight from Lenny's Podcast */}
                        {expertInsight && (
                          <div className="pl-9 pt-2 border-t border-amber-500/20">
                            <div className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                              <span>🎙️</span> Expert Insight
                            </div>
                            <div className="text-sm bg-amber-500/5 rounded p-3 border border-amber-500/20">
                              <p className="text-slate-300 italic">&quot;{expertInsight.content}&quot;</p>
                              <div className="flex items-center justify-between mt-2 text-xs">
                                <span className="text-amber-400 font-medium">— {expertInsight.guestName}</span>
                                {expertInsight.youtubeUrl && expertInsight.episodeTitle && (
                                  <a 
                                    href={expertInsight.youtubeUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-slate-500 hover:text-amber-400 transition-colors"
                                  >
                                    📺 {expertInsight.episodeTitle}
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4 justify-center pt-6 border-t border-slate-700">
          <Link
            href="/"
            className="py-3 px-6 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-lg transition-all"
          >
            🚀 Use Inspiration
          </Link>
          <Link
            href="/themes"
            className="py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
          >
            🔭 Full Theme Explorer
          </Link>
        </div>
      </div>
    </div>
  );
}
