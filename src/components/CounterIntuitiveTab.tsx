"use client";

/**
 * Counter-Intuitive Tab (LIB-11)
 * 
 * Purpose: Generate "GOOD OPPOSITE" perspectives via LLM projection
 * 
 * IMPORTANT: This generates REFLECTION PROMPTS, not Library items.
 * Library remains pure (chat-only). These are seeds for future thinking.
 * 
 * Actions:
 * - [Keep in Mind] → Saves as reflection prompt
 * - [Dismiss] → Hides suggestion
 * 
 * Kill Criteria:
 * - < 20% engagement after 2 weeks → Remove feature
 * - > 80% dismiss rate → Feature doesn't resonate
 * - Zero saved reflections → No value delivered
 */

import { useState, useEffect, useCallback } from "react";

interface CounterIntuitiveSuggestion {
  id: string;
  clusterTitle: string;
  clusterSize: number;
  counterPerspective: string;
  reasoning: string;
  suggestedAngles: string[];
  reflectionPrompt: string;
  isSaved: boolean;
  savedAt?: string;
  dismissed: boolean;
}

interface ExpertChallenge {
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

interface SavedReflection {
  id: string;
  clusterTitle: string;
  clusterSize: number;
  counterPerspective: string;
  reasoning: string;
  suggestedAngles: string[];
  reflectionPrompt: string;
  savedAt: string;
  viewedCount: number;
}

interface CounterIntuitiveTabProps {
  config?: {
    enabled: boolean;
    minClusterSize: number;
    maxSuggestions: number;
  };
}

// P5: localStorage cache helpers
const CACHE_KEY_PREFIX = "ci-suggestions-";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedSuggestions(minSize: number): CounterIntuitiveSuggestion[] | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${minSize}`);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    // Validate structure to prevent errors from malformed data
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.suggestions) || typeof parsed.timestamp !== "number") {
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${minSize}`);
      return null;
    }
    const { suggestions, timestamp } = parsed;
    // Check if cache is still valid
    if (Date.now() - timestamp < CACHE_TTL) {
      return suggestions;
    }
    // Cache expired, remove it
    localStorage.removeItem(`${CACHE_KEY_PREFIX}${minSize}`);
  } catch {
    // Ignore localStorage errors (malformed JSON, quota exceeded, etc.)
  }
  return null;
}

function setCachedSuggestions(minSize: number, suggestions: CounterIntuitiveSuggestion[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${CACHE_KEY_PREFIX}${minSize}`,
      JSON.stringify({ suggestions, timestamp: Date.now() })
    );
  } catch {
    // Ignore localStorage errors (e.g., quota exceeded)
  }
}

export function CounterIntuitiveTab({ config }: CounterIntuitiveTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CounterIntuitiveSuggestion[]>([]);
  const [savedReflections, setSavedReflections] = useState<SavedReflection[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [minClusterSize, setMinClusterSize] = useState(config?.minClusterSize || 5);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false); // P5: Track background refresh
  
  // Expert challenges state (per suggestion)
  const [expertChallenges, setExpertChallenges] = useState<Record<string, ExpertChallenge[]>>({});
  const [expertLoading, setExpertLoading] = useState<Record<string, boolean>>({});
  
  // Check if feature is enabled
  const isEnabled = config?.enabled !== false; // Default to true if config not provided

  const fetchSuggestions = useCallback(async () => {
    // P5: Check localStorage cache first (stale-while-revalidate)
    const cached = getCachedSuggestions(minClusterSize);
    const hasCachedData = cached && cached.length > 0;
    
    if (hasCachedData) {
      // Show cached data immediately
      setSuggestions(cached);
      setLoading(false);
      // Refresh in background
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    
    try {
      const response = await fetch(
        `/api/themes/counter-intuitive?minSize=${minClusterSize}&max=5`
      );
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`Failed to fetch counter-perspectives: ${errorText.length > 100 ? response.status : errorText}`);
      }
      
      const data = await response.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (!(data && typeof data === 'object' && data.success)) {
        throw new Error((data && typeof data === 'object' && data.error) || "Unknown error");
      }
      
      const newSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      setSuggestions(newSuggestions);
      
      // P5: Update cache
      setCachedSuggestions(minClusterSize, newSuggestions);
    } catch (err) {
      // Only show error if we don't have cached data
      // Use hasCachedData flag instead of cached variable to avoid stale closure
      if (!hasCachedData) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setSuggestions([]);
      }
      // If we have cached data, silently fail the refresh
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [minClusterSize]);

  const fetchSavedReflections = useCallback(async () => {
    try {
      const response = await fetch("/api/themes/counter-intuitive/save");
      if (response.ok) {
        const data = await response.json().catch((parseError) => {
          throw new Error(`Invalid response format: ${parseError.message}`);
        });
        if (data && typeof data === 'object' && Array.isArray(data.reflections)) {
          setSavedReflections(data.reflections);
        } else {
          setSavedReflections([]);
        }
      } else {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        console.warn("Failed to fetch saved reflections:", errorText.length > 100 ? response.status : errorText);
      }
    } catch (err) {
      // Silently fail - saved reflections are optional
      console.warn("Failed to fetch saved reflections:", err);
    }
  }, []);

  // Fetch expert challenge for a specific suggestion
  const fetchExpertChallenge = useCallback(async (suggestionId: string, clusterTitle: string) => {
    // Skip if already loaded or loading
    if (expertChallenges[suggestionId] || expertLoading[suggestionId]) return;
    
    setExpertLoading(prev => ({ ...prev, [suggestionId]: true }));
    
    try {
      // Search for contrarian perspectives on this topic
      const searchQuery = `contrarian view ${clusterTitle} challenge assumption`;
      const response = await fetch(
        `/api/expert-perspectives?theme=${encodeURIComponent(searchQuery)}&topK=1&minSimilarity=0.3`
      );
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        console.warn("Failed to fetch expert challenge:", errorText.length > 100 ? response.status : errorText);
        setExpertChallenges(prev => ({ ...prev, [suggestionId]: [] }));
        return;
      }
      
      const data = await response.json().catch((parseError) => {
        console.warn("Failed to parse expert challenge response:", parseError);
        setExpertChallenges(prev => ({ ...prev, [suggestionId]: [] }));
        return;
      });
      
      if (data && typeof data === 'object' && data.success && Array.isArray(data.quotes) && data.quotes.length > 0) {
        setExpertChallenges(prev => ({ ...prev, [suggestionId]: data.quotes }));
      } else {
        setExpertChallenges(prev => ({ ...prev, [suggestionId]: [] }));
      }
    } catch {
      setExpertChallenges(prev => ({ ...prev, [suggestionId]: [] }));
    } finally {
      setExpertLoading(prev => ({ ...prev, [suggestionId]: false }));
    }
  }, [expertChallenges, expertLoading]);

  useEffect(() => {
    fetchSuggestions();
    fetchSavedReflections();
  }, [fetchSuggestions, fetchSavedReflections]);

  // Fetch expert challenges for all visible suggestions
  useEffect(() => {
    if (suggestions.length > 0 && !showSaved) {
      suggestions.forEach(suggestion => {
        fetchExpertChallenge(suggestion.id, suggestion.clusterTitle);
      });
    }
  }, [suggestions, showSaved, fetchExpertChallenge]);

  const handleKeepInMind = async (suggestion: CounterIntuitiveSuggestion) => {
    setActionInProgress(suggestion.id);
    
    try {
      const response = await fetch("/api/themes/counter-intuitive/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion }),
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`Failed to save reflection: ${errorText.length > 100 ? response.status : errorText}`);
      }
      
      const data = await response.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (data && typeof data === 'object' && data.success !== false) {
        // Update UI to show saved state
        setSuggestions(prev => 
          prev.map(s => 
            s.id === suggestion.id ? { ...s, isSaved: true } : s
          )
        );
        // Refresh saved reflections
        fetchSavedReflections();
      } else {
        throw new Error((data && typeof data === 'object' && data.error) || "Failed to save reflection");
      }
    } catch (err) {
      console.error("Failed to save reflection:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDismiss = async (suggestionId: string) => {
    setActionInProgress(suggestionId);
    
    try {
      const response = await fetch(
        `/api/themes/counter-intuitive/save?id=${suggestionId}`,
        { method: "DELETE" }
      );
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`Failed to dismiss suggestion: ${errorText.length > 100 ? response.status : errorText}`);
      }
      
      const data = await response.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (data && typeof data === 'object' && data.success !== false) {
        // Remove from UI
        setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
      } else {
        throw new Error((data && typeof data === 'object' && data.error) || "Failed to dismiss suggestion");
      }
    } catch (err) {
      console.error("Failed to dismiss suggestion:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  // Show disabled state if feature is disabled
  if (!isEnabled) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-700/30 mb-6">
            <span className="text-4xl">🔄</span>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            This Feature is Turned Off
          </h3>
          <p className="text-slate-400 max-w-md mx-auto">
            Counter-Intuitive Thinking is currently disabled. You can turn it on in{" "}
            <a href="/settings" className="text-purple-400 hover:text-purple-300 underline">
              Settings → Theme Explorer
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <span className="text-2xl">🔄</span> Counter-Intuitive Thinking
            <span className="text-xs bg-purple-900/50 text-purple-400 px-2 py-0.5 rounded-full flex items-center gap-1">
              🚧 Experimental
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            What if the opposite of what you believe is also true?
          </p>
        </div>
        
        {/* Saved Reflections Button */}
        <button
          onClick={() => setShowSaved(!showSaved)}
          title="View prompts you've saved for later reflection"
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            showSaved
              ? "bg-purple-600/30 text-purple-200 border border-purple-500/50"
              : "bg-slate-800/40 text-slate-400 border border-slate-700/50 hover:bg-slate-800/60"
          }`}
        >
          📚 My Reflections ({savedReflections.length})
        </button>
      </div>

      {/* Conviction Filter - Prominent & Self-Explanatory */}
      <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🎯</span>
          <span className="text-sm font-medium text-white">Which of my beliefs should I question?</span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            onClick={() => setMinClusterSize(3)}
            className={`p-3 rounded-lg text-left transition-all ${
              minClusterSize === 3
                ? "bg-amber-600/20 border-2 border-amber-500/50 shadow-lg shadow-amber-500/10"
                : "bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🌱</span>
              <span className={`font-medium ${minClusterSize === 3 ? "text-amber-200" : "text-slate-200"}`}>
                New Ideas
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Topics I&apos;ve talked about 3+ times. Catch assumptions before they harden.
            </p>
          </button>

          <button
            onClick={() => setMinClusterSize(5)}
            className={`p-3 rounded-lg text-left transition-all ${
              minClusterSize === 5
                ? "bg-indigo-600/20 border-2 border-indigo-500/50 shadow-lg shadow-indigo-500/10"
                : "bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🌿</span>
              <span className={`font-medium ${minClusterSize === 5 ? "text-indigo-200" : "text-slate-200"}`}>
                Strong Opinions
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Topics I&apos;ve explored 5+ times. The sweet spot for meaningful challenges.
            </p>
          </button>

          <button
            onClick={() => setMinClusterSize(10)}
            className={`p-3 rounded-lg text-left transition-all ${
              minClusterSize === 10
                ? "bg-purple-600/20 border-2 border-purple-500/50 shadow-lg shadow-purple-500/10"
                : "bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🌳</span>
              <span className={`font-medium ${minClusterSize === 10 ? "text-purple-200" : "text-slate-200"}`}>
                Deep Convictions
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Topics I return to constantly (10+). Question your core assumptions.
            </p>
          </button>
        </div>

        <p className="text-xs text-slate-500 mt-3 text-center">
          💡 The more you talk about something, the more entrenched your view may be. Challenging it could unlock new perspectives.
        </p>
        
        {/* P5: Background refresh indicator */}
        {isRefreshing && (
          <div className="flex items-center justify-center gap-2 mt-2 text-xs text-slate-500">
            <div className="animate-spin rounded-full h-3 w-3 border-b border-slate-400"></div>
            <span>Checking for updates...</span>
          </div>
        )}
      </div>

      {/* Info Banner */}
      <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">🚧</span>
          <div className="text-sm">
            <p className="text-purple-200 font-medium mb-1">Experimental Feature</p>
            <p className="text-slate-400">
              These are <strong className="text-slate-300">thinking prompts</strong>, not items for your Library.
              Your Library only contains ideas from your actual conversations — these are AI-generated &quot;what if&quot; questions to spark new thinking.
            </p>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchSuggestions}
            className="mt-2 px-3 py-1 bg-red-500/20 text-red-300 rounded-lg text-sm hover:bg-red-500/30"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
            <span className="text-slate-300">Looking for beliefs to challenge...</span>
            <span className="text-slate-500 text-xs">⏱️ Usually takes 30-60 seconds</span>
          </div>
        </div>
      )}

      {/* Saved Reflections View */}
      {showSaved && !loading && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            📚 My Saved Reflections
          </h3>
          
          {savedReflections.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400">No saved reflections yet.</p>
              <p className="text-slate-500 text-sm mt-1">
                When you see a thought-provoking prompt, click &quot;Save for Later&quot; to keep it here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedReflections.map((reflection) => (
                <div
                  key={reflection.id}
                  className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-4"
                >
                  <div className="text-sm text-purple-300 mb-1">
                    Challenging: &quot;{reflection.clusterTitle}&quot;
                  </div>
                  <p className="text-white font-medium">{reflection.counterPerspective}</p>
                  <p className="text-slate-400 text-sm mt-2 italic">
                    💭 {reflection.reflectionPrompt}
                  </p>
                  <div className="text-xs text-slate-500 mt-2">
                    Saved {new Date(reflection.savedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <button
            onClick={() => setShowSaved(false)}
            className="text-slate-400 text-sm hover:text-slate-300"
          >
            ← Back to new suggestions
          </button>
        </div>
      )}

      {/* Suggestions View */}
      {!showSaved && !loading && !error && (
        <>
          {/* Empty State */}
          {suggestions.length === 0 && (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-700/30 mb-6">
                <span className="text-4xl">🤔</span>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                No Beliefs Strong Enough to Challenge Yet
              </h3>
              <p className="text-slate-400 max-w-md mx-auto mb-4">
                This works best when you have topics with {minClusterSize}+ saved ideas/insights.
              </p>
              <div className="text-sm text-slate-500 max-w-lg mx-auto">
                <p className="text-left px-6">
                  💡 Try selecting &quot;New Ideas&quot; (3+ items) above, or keep using the app — as your Library grows, you&apos;ll have more beliefs worth questioning.
                </p>
              </div>
            </div>
          )}

          {/* Suggestion Cards */}
          {suggestions.length > 0 && (
            <div className="space-y-4">
              <div className="text-sm text-slate-400">
                Found {suggestions.length} {suggestions.length === 1 ? "belief" : "beliefs"} worth questioning
              </div>

              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className={`bg-slate-800/40 border rounded-xl p-5 transition-colors ${
                    suggestion.isSaved
                      ? "border-purple-500/50 bg-purple-900/10"
                      : "border-slate-700/50 hover:bg-slate-800/60"
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="text-sm text-slate-400 mb-1">
                        Your belief: &quot;{suggestion.clusterTitle}&quot;
                        <span className="text-slate-500 ml-1">({suggestion.clusterSize} items in Library)</span>
                      </div>
                      <p className="text-lg font-medium text-white">
                        🔄 What if... {suggestion.counterPerspective}
                      </p>
                    </div>
                    {suggestion.isSaved && (
                      <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded">
                        ✓ Saved
                      </span>
                    )}
                  </div>

                  {/* Reasoning */}
                  <p className="text-sm text-slate-400 mb-3">
                    {suggestion.reasoning}
                  </p>

                  {/* Suggested Angles */}
                  <div className="mb-4">
                    <div className="text-xs text-slate-500 font-medium mb-2">
                      Ways to explore this:
                    </div>
                    <ul className="space-y-1">
                      {suggestion.suggestedAngles.map((angle, idx) => (
                        <li
                          key={idx}
                          className="text-sm text-slate-300 flex items-start gap-2"
                        >
                          <span className="text-slate-500">→</span>
                          {angle}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Reflection Prompt */}
                  <div className="bg-slate-900/50 border border-slate-700/30 rounded-lg p-3 mb-4">
                    <div className="text-xs text-slate-500 mb-1">💭 Question to sit with</div>
                    <p className="text-sm text-slate-300 italic">
                      &quot;{suggestion.reflectionPrompt}&quot;
                    </p>
                  </div>

                  {/* Expert Challenge from Lenny's Podcast */}
                  {expertLoading[suggestion.id] && (
                    <div className="bg-amber-900/10 border border-amber-700/20 rounded-lg p-3 mb-4">
                      <div className="flex items-center gap-2 text-xs text-amber-400">
                        <span className="animate-pulse">🎙️</span>
                        <span>Finding expert perspective...</span>
                      </div>
                    </div>
                  )}
                  
                  {expertChallenges[suggestion.id] && expertChallenges[suggestion.id].length > 0 && (
                    <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-2 mb-3 text-amber-400">
                        <span className="text-lg">🎙️</span>
                        <span className="text-xs font-medium">Expert Challenge</span>
                        <span className="text-xs text-slate-500">from Lenny&apos;s Podcast</span>
                      </div>
                      {expertChallenges[suggestion.id].map((quote, idx) => (
                        <div key={idx}>
                          <p className="text-slate-200 text-sm leading-relaxed italic mb-2">
                            &quot;{quote.content.length > 350 ? quote.content.slice(0, 350) + '...' : quote.content}&quot;
                          </p>
                          <div className="flex flex-col gap-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-amber-300 font-medium">— {quote.guestName}</span>
                              <span className="text-slate-500">{Math.round(quote.similarity * 100)}% relevant</span>
                            </div>
                            {/* Episode title + YouTube link */}
                            {quote.episodeTitle && (
                              <div className="flex items-center gap-2 text-slate-400">
                                <span className="truncate max-w-[280px]" title={quote.episodeTitle}>
                                  📺 {quote.episodeTitle}
                                </span>
                                {quote.youtubeUrl && (
                                  <a 
                                    href={quote.youtubeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-amber-400 hover:text-amber-300 hover:underline flex-shrink-0"
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
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    {!suggestion.isSaved && (
                      <button
                        onClick={() => handleKeepInMind(suggestion)}
                        disabled={actionInProgress === suggestion.id}
                        title="Save this prompt to revisit later"
                        className="px-4 py-2 bg-purple-600/30 text-purple-300 text-sm rounded-lg border border-purple-500/30 hover:bg-purple-600/40 transition-colors disabled:opacity-50"
                      >
                        {actionInProgress === suggestion.id ? "Saving..." : "💾 Save for Later"}
                      </button>
                    )}
                    <button
                      onClick={() => handleDismiss(suggestion.id)}
                      disabled={actionInProgress === suggestion.id}
                      title="Not interesting? Hide this suggestion."
                      className="px-4 py-2 bg-slate-700/30 text-slate-400 text-sm rounded-lg border border-slate-600/30 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                    >
                      {actionInProgress === suggestion.id ? "..." : "👋 Not Interesting"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div className="mt-8 text-xs text-slate-500 text-center">
        <p>
          🤖 These prompts are AI-generated based on patterns in your saved ideas and insights.
        </p>
        <p className="mt-1">
          They&apos;re thinking tools — your Library only contains ideas from your actual conversations.
        </p>
      </div>
    </div>
  );
}
