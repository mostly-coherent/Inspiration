"use client";

/**
 * Unexplored Territory Tab (LIB-10)
 * 
 * Purpose: Find what's MISSING from Library but exists in Memory (chat history)
 * 
 * Layer 1 (MVP): Memory vs Library mismatch detection
 * - Cluster Memory conversations by topic
 * - Cluster Library items by topic
 * - Find conversation clusters with high activity but low Library coverage
 * - Surface these as "unexplored territories"
 * 
 * Actions: [Generate Ideas] [Generate Insights] → Creates Library items from chat
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

interface UnexploredArea {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  stats: {
    conversationCount: number;
    libraryItemCount: number;
  };
  sampleConversations: string[];
  layer: number;
}

type SeverityFilter = "all" | "high" | "medium" | "low";

interface UnexploredTabProps {
  config?: {
    daysBack: number;
    minConversations: number;
    includeLowSeverity: boolean;
  };
}

// Enrich progress state
interface EnrichProgress {
  areaId: string;
  status: "enriching" | "complete" | "error";
  message: string;
  results?: {
    ideas: number;
    insights: number;
    totalAdded: number;
  };
}

export function UnexploredTab({ config }: UnexploredTabProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [areas, setAreas] = useState<UnexploredArea[]>([]);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>(
    config?.includeLowSeverity ? "all" : "high"
  );
  const [analyzedDays] = useState(config?.daysBack || 90);
  const [enrichProgress, setEnrichProgress] = useState<EnrichProgress | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const enrichAbortControllerRef = useRef<AbortController | null>(null);
  const enrichTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const isMountedRef = useRef(true);

  const fetchUnexploredAreas = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const includeLow = severityFilter === "all" || severityFilter === "low";
      const response = await fetch(
        `/api/themes/unexplored?days=${analyzedDays}&includeLow=${includeLow}`
      );
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`Failed to fetch unexplored areas: ${errorText.length > 100 ? response.status : errorText}`);
      }
      
      const data = await response.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (!(data && typeof data === 'object' && data.success)) {
        throw new Error((data && typeof data === 'object' && data.error) || "Unknown error");
      }
      
      setAreas(Array.isArray(data.areas) ? data.areas : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setAreas([]);
    } finally {
      setLoading(false);
    }
  }, [analyzedDays, severityFilter]);

  useEffect(() => {
    fetchUnexploredAreas();
  }, [fetchUnexploredAreas]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      // Abort any in-flight enrich requests
      if (enrichAbortControllerRef.current) {
        enrichAbortControllerRef.current.abort();
      }
      // Clear any pending timeouts
      enrichTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      enrichTimeoutsRef.current = [];
    };
  }, []);

  // Filter areas by severity
  const filteredAreas = severityFilter === "all"
    ? areas
    : areas.filter(a => a.severity === severityFilter);

  // Handle generate action - navigate to home with prefilled topic
  const handleGenerate = (area: UnexploredArea, mode: "idea" | "insight") => {
    // Navigate to home page with query params to prefill generation
    const params = new URLSearchParams({
      mode,
      topic: area.title,
      days: "30", // Suggest last 30 days for focused generation
    });
    router.push(`/?${params.toString()}`);
  };

  // Handle "Enrich Library" - auto-generate both ideas and insights
  const handleEnrichLibrary = async (area: UnexploredArea) => {
    // Prevent multiple simultaneous enrichments for the same area
    if (enrichProgress?.areaId === area.id && enrichProgress.status === "enriching") {
      return;
    }

    // Abort any previous enrichment
    if (enrichAbortControllerRef.current) {
      enrichAbortControllerRef.current.abort();
    }

    setEnrichProgress({
      areaId: area.id,
      status: "enriching",
      message: `Scanning conversations about "${area.title}"...`,
    });

    const abortController = new AbortController();
    enrichAbortControllerRef.current = abortController;

    try {
      const response = await fetch("/api/unexplored/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaId: area.id,
          topic: area.title,
          modes: ["idea", "insight"],
          days: analyzedDays,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        // Try to parse error message from response body
        let errorMessage = "Failed to enrich library";
        try {
          const errorText = await response.text().catch(() => `HTTP ${response.status}`);
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = (errorData && typeof errorData === 'object' && errorData.error) || errorMessage;
          } catch {
            // If JSON parse fails, use text as error message (if not too long)
            errorMessage = errorText.length > 100 ? `HTTP ${response.status}` : errorText;
          }
        } catch {
          // If text extraction fails, use default message
        }
        throw new Error(errorMessage);
      }

      // Parse streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === "phase" || data.type === "progress") {
                setEnrichProgress((prev) => prev && prev.areaId === area.id ? {
                  ...prev,
                  message: data.message,
                } : prev);
              } else if (data.type === "complete") {
                setEnrichProgress({
                  areaId: area.id,
                  status: "complete",
                  message: data.message,
                  results: data.results,
                });
                
                // Remove the area from the list after successful enrichment
                const cleanupTimeoutId = setTimeout(() => {
                  setAreas((prev) => prev.filter((a) => a.id !== area.id));
                  setEnrichProgress(null);
                }, 3000);
                enrichTimeoutsRef.current.push(cleanupTimeoutId);
              } else if (data.type === "error") {
                throw new Error(data.error);
              }
            } catch {
              // Ignore JSON parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (err) {
      // Don't update state if request was aborted (component unmounted)
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      setEnrichProgress({
        areaId: area.id,
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
      
      const timeoutId = setTimeout(() => {
        setEnrichProgress(null);
      }, 5000);
      enrichTimeoutsRef.current.push(timeoutId);
    } finally {
      // Clear abort controller reference when done
      if (enrichAbortControllerRef.current === abortController) {
        enrichAbortControllerRef.current = null;
      }
    }
  };

  // Handle "Dismiss" - mark topic as noise
  const handleDismiss = async (area: UnexploredArea) => {
    setDismissingId(area.id);

    try {
      const response = await fetch("/api/unexplored/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaId: area.id,
          topic: area.title,
          reason: "user_dismissed",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`Failed to dismiss topic: ${errorText.length > 100 ? response.status : errorText}`);
      }

      const data = await response.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });

      // Validate response before removing from list
      if (data && typeof data === 'object' && data.success !== false) {
        // Remove from list
        setAreas((prev) => prev.filter((a) => a.id !== area.id));
      } else {
        throw new Error((data && typeof data === 'object' && data.error) || "Failed to dismiss topic");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dismiss");
    } finally {
      setDismissingId(null);
    }
  };

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "high": return "🔴";
      case "medium": return "🟡";
      case "low": return "🟢";
      default: return "⚪";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <span className="text-2xl">🧭</span> Unexplored Territory
            <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1">
              🚧 Experimental
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Topics you chat about a lot but haven&apos;t saved to your Library yet
          </p>
        </div>
        
        {/* Discussion Frequency Filter */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {(["all", "high", "medium", "low"] as SeverityFilter[]).map((severity) => {
              const labels = {
                all: "All Frequencies",
                high: "Very Often",
                medium: "Regularly",
                low: "Occasionally"
              };
              const descriptions = {
                all: "Show all discussion frequencies",
                high: "15+ conversations - topics you discuss very frequently",
                medium: "8-14 conversations - topics you discuss regularly",
                low: "3-7 conversations - topics mentioned occasionally"
              };
              
              return (
                <button
                  key={severity}
                  onClick={() => setSeverityFilter(severity)}
                  title={descriptions[severity as keyof typeof descriptions]}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${severity === severityFilter
                      ? "bg-amber-600/30 text-amber-200 border border-amber-500/50"
                      : "bg-slate-800/40 text-slate-400 border border-slate-700/50 hover:bg-slate-800/60 hover:text-slate-300"
                    }
                  `}
                >
                  {severity !== "all" && severityIcon(severity)} {labels[severity as keyof typeof labels]}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">
            {severityFilter === "all" && "Showing all topics regardless of discussion frequency"}
            {severityFilter === "high" && "Showing topics discussed 15+ times"}
            {severityFilter === "medium" && "Showing topics discussed 8-14 times"}
            {severityFilter === "low" && "Showing topics discussed 3-7 times"}
          </p>
        </div>
      </div>

      {/* Experimental Feature Banner */}
      <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">🚧</span>
          <div className="text-sm">
            <p className="text-amber-200 font-medium mb-1">Experimental Feature</p>
            <p className="text-slate-400">
              We scan your chat history to find topics you talk about a lot but haven&apos;t saved any ideas or insights about yet.
              <strong className="text-slate-300"> If nothing shows up, that could mean:</strong>
            </p>
            <ul className="mt-2 text-slate-400 space-y-1 list-disc list-inside">
              <li>✅ <span className="text-green-400">You&apos;re already capturing well</span> — your Library covers your key topics</li>
              <li>❓ <span className="text-amber-400">Chat history might be incomplete</span> — check Settings → Memory to see what&apos;s indexed</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchUnexploredAreas}
            className="mt-2 px-3 py-1 bg-red-500/20 text-red-300 rounded-lg text-sm hover:bg-red-500/30"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
            <span className="text-slate-300">Analyzing your conversations...</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredAreas.length === 0 && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-emerald-900/30 to-green-900/30 border border-emerald-700/30 mb-6">
            <span className="text-4xl">✅</span>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            {severityFilter === "all" 
              ? "Nice! You're All Caught Up"
              : severityFilter === "high"
                ? "No Major Gaps Found"
                : severityFilter === "medium"
                  ? "No Regular Topics Missing"
                  : "No Occasional Topics Missing"}
          </h3>
          <p className="text-slate-400 max-w-md mx-auto mb-4">
            {severityFilter === "all"
              ? "You've already captured ideas and insights from the topics you discuss most. Great job!"
              : severityFilter === "high"
                ? "The topics you chat about most often (15+ conversations) are already in your Library."
                : severityFilter === "medium"
                  ? "Topics you discuss regularly (8-14 conversations) are already saved."
                  : "Topics you mention occasionally (3-7 conversations) are already covered."}
          </p>
          <div className="text-sm text-slate-500 max-w-lg mx-auto">
            <p className="text-left px-6">
              {severityFilter === "all"
                ? "💡 This means you're doing a great job capturing ideas from your conversations. Nothing major is slipping through!"
                : "💡 Try a different filter to explore other patterns, or take this as good news — the important stuff is already saved!"}
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && !error && filteredAreas.length > 0 && (
        <div className="space-y-4">
          {/* Stats Header */}
          <div className="text-sm text-slate-400">
            Found {filteredAreas.length} {filteredAreas.length === 1 ? "topic" : "topics"} you chat about
            {severityFilter === "high" && " a lot (15+ conversations)"}
            {severityFilter === "medium" && " regularly (8-14 conversations)"}
            {severityFilter === "low" && " sometimes (3-7 conversations)"}
            {severityFilter === "all" && " frequently"}
            {" "}but haven&apos;t saved to your Library yet
          </div>

          {/* Area Cards */}
          {filteredAreas.map((area) => {
            const isEnriching = enrichProgress?.areaId === area.id && enrichProgress.status === "enriching";
            const isComplete = enrichProgress?.areaId === area.id && enrichProgress.status === "complete";
            const isError = enrichProgress?.areaId === area.id && enrichProgress.status === "error";
            const isDismissing = dismissingId === area.id;
            
            return (
              <div
                key={area.id}
                className={`bg-slate-800/40 border rounded-xl p-5 transition-all ${
                  isComplete 
                    ? "border-green-500/50 bg-green-900/10" 
                    : isError
                      ? "border-red-500/50 bg-red-900/10"
                      : "border-slate-700/50 hover:bg-slate-800/60"
                }`}
              >
                {/* Enriching Progress Overlay */}
                {isEnriching && (
                  <div className="mb-4 p-3 bg-indigo-900/30 rounded-lg border border-indigo-500/30">
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-400"></div>
                      <span className="text-indigo-300 text-sm">{enrichProgress.message}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      ⏱️ This usually takes 30-60 seconds. Feel free to leave — new items will appear in your Library.
                    </p>
                  </div>
                )}

                {/* Complete State */}
                {isComplete && enrichProgress.results && (
                  <div className="mb-4 p-3 bg-green-900/30 rounded-lg border border-green-500/30">
                    <div className="flex items-center gap-2 text-green-300">
                      <span className="text-xl">✅</span>
                      <span className="font-medium">Done!</span>
                    </div>
                    <p className="text-sm text-slate-300 mt-1">
                      {enrichProgress.results.totalAdded > 0 
                        ? `Saved ${enrichProgress.results.ideas} ${enrichProgress.results.ideas === 1 ? "idea" : "ideas"} and ${enrichProgress.results.insights} ${enrichProgress.results.insights === 1 ? "insight" : "insights"} to your Library`
                        : `No new items found — you may have already captured the key ideas from this topic`}
                    </p>
                    {enrichProgress.results.totalAdded > 0 && (
                      <button
                        onClick={() => router.push("/themes?tab=patterns")}
                        className="mt-2 text-sm text-green-400 hover:text-green-300 underline"
                      >
                        See them in Patterns →
                      </button>
                    )}
                  </div>
                )}

                {/* Error State */}
                {isError && (
                  <div className="mb-4 p-3 bg-red-900/30 rounded-lg border border-red-500/30">
                    <div className="flex items-center gap-2 text-red-300">
                      <span className="text-xl">❌</span>
                      <span className="font-medium">Something went wrong</span>
                    </div>
                    <p className="text-sm text-slate-400 mt-1">{enrichProgress.message}</p>
                    <p className="text-xs text-slate-500 mt-2">Try again, or use the &quot;Ideas Only&quot; / &quot;Insights Only&quot; buttons for more control.</p>
                  </div>
                )}

                <div className="flex items-start gap-4">
                  {/* Severity Indicator */}
                  <div className={`w-3 h-3 rounded-full mt-2 flex-shrink-0 ${
                    area.severity === "high" ? "bg-red-500" :
                    area.severity === "medium" ? "bg-yellow-500" : "bg-green-500"
                  }`}></div>
                  
                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    <h3 className="font-medium text-white text-lg">{area.title}</h3>
                    
                    {/* Stats - Layman Friendly */}
                    <p className="text-sm text-slate-400 mt-1">
                      {area.stats.conversationCount} conversations about this topic, but only {area.stats.libraryItemCount === 0 ? "no" : area.stats.libraryItemCount} {area.stats.libraryItemCount === 1 ? "idea/insight" : "ideas/insights"} saved
                    </p>
                    
                    {/* Description */}
                    <p className="text-sm text-slate-500 mt-2">
                      💡 Looks like there&apos;s more to capture here!
                    </p>
                    
                    {/* Sample Conversations */}
                    {area.sampleConversations && area.sampleConversations.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <div className="text-xs text-slate-500 font-medium">Sample discussions:</div>
                        {area.sampleConversations.slice(0, 2).map((sample, idx) => (
                          <div
                            key={idx}
                            className="text-xs text-slate-400 pl-3 border-l-2 border-slate-600/50 truncate"
                          >
                            &quot;{sample}&quot;
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Actions - NEW Enrich Library UX */}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {/* Primary Action: Enrich Library */}
                      <button
                        onClick={() => handleEnrichLibrary(area)}
                        disabled={isEnriching || isComplete}
                        title="Automatically scan your chats about this topic and save any ideas + insights found"
                        className={`px-4 py-2 text-sm rounded-lg font-medium transition-all flex items-center gap-2 ${
                          isEnriching || isComplete
                            ? "bg-slate-700/30 text-slate-500 cursor-not-allowed"
                            : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-900/30"
                        }`}
                      >
                        <span>🔮</span>
                        <span>{isEnriching ? "Working..." : isComplete ? "Done!" : "Extract Ideas & Insights"}</span>
                      </button>
                      
                      {/* Secondary: Manual generation options */}
                      <button
                        onClick={() => handleGenerate(area, "idea")}
                        disabled={isEnriching}
                        title="Extract tool/app ideas you mentioned in chats about this topic"
                        className="px-3 py-2 bg-slate-700/30 text-slate-300 text-sm rounded-lg border border-slate-600/30 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                      >
                        💡 Ideas Only
                      </button>
                      <button
                        onClick={() => handleGenerate(area, "insight")}
                        disabled={isEnriching}
                        title="Extract learnings and shareable insights from chats about this topic"
                        className="px-3 py-2 bg-slate-700/30 text-slate-300 text-sm rounded-lg border border-slate-600/30 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                      >
                        ✨ Insights Only
                      </button>
                      
                      {/* Dismiss */}
                      <button
                        onClick={() => handleDismiss(area)}
                        disabled={isEnriching || isDismissing}
                        className="px-3 py-2 text-slate-500 text-sm rounded-lg hover:text-slate-300 hover:bg-slate-700/30 transition-colors disabled:opacity-50 ml-auto"
                        title="Not interested in this topic? Click to hide it from future suggestions."
                      >
                        {isDismissing ? "Hiding..." : "👋 Not Interested"}
                      </button>
                    </div>
                    
                    {/* Helper text */}
                    <p className="text-xs text-slate-600 mt-2">
                      💎 <strong>Enrich Library</strong> scans your chats about this topic and saves any ideas + insights it finds. Usually takes 30-60 seconds.
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info Footer */}
      <div className="mt-8 text-xs text-slate-500 text-center">
        📅 Looking at the last {analyzedDays} days of your conversations
      </div>
    </div>
  );
}
