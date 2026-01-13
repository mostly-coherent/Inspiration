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

export function CounterIntuitiveTab({ config }: CounterIntuitiveTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CounterIntuitiveSuggestion[]>([]);
  const [savedReflections, setSavedReflections] = useState<SavedReflection[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [minClusterSize, setMinClusterSize] = useState(config?.minClusterSize || 5);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  
  // Check if feature is enabled
  const isEnabled = config?.enabled !== false; // Default to true if config not provided

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `/api/themes/counter-intuitive?minSize=${minClusterSize}&max=5`
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch counter-perspectives");
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Unknown error");
      }
      
      setSuggestions(data.suggestions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [minClusterSize]);

  const fetchSavedReflections = useCallback(async () => {
    try {
      const response = await fetch("/api/themes/counter-intuitive/save");
      if (response.ok) {
        const data = await response.json();
        setSavedReflections(data.reflections || []);
      }
    } catch {
      // Silently fail - saved reflections are optional
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
    fetchSavedReflections();
  }, [fetchSuggestions, fetchSavedReflections]);

  const handleKeepInMind = async (suggestion: CounterIntuitiveSuggestion) => {
    setActionInProgress(suggestion.id);
    
    try {
      const response = await fetch("/api/themes/counter-intuitive/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion }),
      });
      
      if (response.ok) {
        // Update UI to show saved state
        setSuggestions(prev => 
          prev.map(s => 
            s.id === suggestion.id ? { ...s, isSaved: true } : s
          )
        );
        // Refresh saved reflections
        fetchSavedReflections();
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
      
      if (response.ok) {
        // Remove from UI
        setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
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
            Feature Disabled
          </h3>
          <p className="text-slate-400 max-w-md mx-auto">
            Counter-Intuitive insights are currently disabled. Enable them in{" "}
            <a href="/settings" className="text-indigo-400 hover:text-indigo-300 underline">
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
            <span className="text-2xl">🔄</span> Counter-Intuitive Insights
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Challenge your assumptions with &quot;good opposite&quot; perspectives
          </p>
        </div>
        
        {/* Controls */}
        <div className="flex gap-2 items-center">
          <label className="text-xs text-slate-400">Min theme size:</label>
          <select
            value={minClusterSize}
            onChange={(e) => setMinClusterSize(parseInt(e.target.value))}
            className="px-2 py-1 rounded bg-slate-800/60 border border-slate-700/50 text-slate-300 text-xs"
          >
            <option value={3}>3+ items</option>
            <option value={5}>5+ items</option>
            <option value={10}>10+ items</option>
          </select>
          
          <button
            onClick={() => setShowSaved(!showSaved)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              showSaved
                ? "bg-purple-600/30 text-purple-200 border border-purple-500/50"
                : "bg-slate-800/40 text-slate-400 border border-slate-700/50 hover:bg-slate-800/60"
            }`}
          >
            📚 Saved ({savedReflections.length})
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-indigo-900/20 border border-indigo-700/30 rounded-lg p-3 text-sm">
        <p className="text-indigo-300">
          💡 <strong>Reflection prompts only</strong> — These don&apos;t create Library items. 
          Your Library stays pure (chat-derived only). Use these to seed future thinking.
        </p>
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
            <span className="text-slate-300">Analyzing your Library themes...</span>
            <span className="text-slate-500 text-xs">This may take 30-60 seconds (LLM generation)</span>
          </div>
        </div>
      )}

      {/* Saved Reflections View */}
      {showSaved && !loading && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            📚 Saved Reflections
          </h3>
          
          {savedReflections.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              No saved reflections yet. Click &quot;Keep in Mind&quot; on suggestions to save them.
            </div>
          ) : (
            <div className="space-y-3">
              {savedReflections.map((reflection) => (
                <div
                  key={reflection.id}
                  className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-4"
                >
                  <div className="text-sm text-purple-300 mb-1">
                    Counter to: &quot;{reflection.clusterTitle}&quot;
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
            ← Back to suggestions
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
                No Strong Themes Found
              </h3>
              <p className="text-slate-400 max-w-md mx-auto">
                Counter-intuitive insights work best with strong Library themes ({minClusterSize}+ items).
                Try lowering the threshold or adding more items to your Library.
              </p>
            </div>
          )}

          {/* Suggestion Cards */}
          {suggestions.length > 0 && (
            <div className="space-y-4">
              <div className="text-sm text-slate-400">
                Found {suggestions.length} counter-perspective{suggestions.length !== 1 && "s"}
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
                        Counter to: &quot;{suggestion.clusterTitle}&quot; ({suggestion.clusterSize} items)
                      </div>
                      <p className="text-lg font-medium text-white">
                        {suggestion.counterPerspective}
                      </p>
                    </div>
                    {suggestion.isSaved && (
                      <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded">
                        Saved
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
                      Angles to explore:
                    </div>
                    <ul className="space-y-1">
                      {suggestion.suggestedAngles.map((angle, idx) => (
                        <li
                          key={idx}
                          className="text-sm text-slate-300 flex items-start gap-2"
                        >
                          <span className="text-slate-500">•</span>
                          {angle}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Reflection Prompt */}
                  <div className="bg-slate-900/50 border border-slate-700/30 rounded-lg p-3 mb-4">
                    <div className="text-xs text-slate-500 mb-1">💭 Reflection Prompt</div>
                    <p className="text-sm text-slate-300 italic">
                      {suggestion.reflectionPrompt}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {!suggestion.isSaved && (
                      <button
                        onClick={() => handleKeepInMind(suggestion)}
                        disabled={actionInProgress === suggestion.id}
                        className="px-4 py-2 bg-purple-600/30 text-purple-300 text-sm rounded-lg border border-purple-500/30 hover:bg-purple-600/40 transition-colors disabled:opacity-50"
                      >
                        {actionInProgress === suggestion.id ? "Saving..." : "🧠 Keep in Mind"}
                      </button>
                    )}
                    <button
                      onClick={() => handleDismiss(suggestion.id)}
                      disabled={actionInProgress === suggestion.id}
                      className="px-4 py-2 bg-slate-700/30 text-slate-400 text-sm rounded-lg border border-slate-600/30 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                    >
                      Dismiss
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
          Counter-intuitive insights are generated by AI based on your Library themes.
        </p>
        <p className="mt-1">
          They&apos;re reflection prompts — not Library items. Your Library stays pure.
        </p>
      </div>
    </div>
  );
}
