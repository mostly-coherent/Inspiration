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

import { useState, useEffect, useCallback } from "react";
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

export function UnexploredTab({ config }: UnexploredTabProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [areas, setAreas] = useState<UnexploredArea[]>([]);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>(
    config?.includeLowSeverity ? "all" : "high"
  );
  const [analyzedDays, setAnalyzedDays] = useState(config?.daysBack || 90);

  const fetchUnexploredAreas = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const includeLow = severityFilter === "all" || severityFilter === "low";
      const response = await fetch(
        `/api/themes/unexplored?days=${analyzedDays}&includeLow=${includeLow}`
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch unexplored areas");
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Unknown error");
      }
      
      setAreas(data.areas || []);
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
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Topics you discuss frequently but haven&apos;t extracted to Library
          </p>
        </div>
        
        {/* Severity Filter */}
        <div className="flex gap-2">
          {(["all", "high", "medium", "low"] as SeverityFilter[]).map((severity) => (
            <button
              key={severity}
              onClick={() => setSeverityFilter(severity)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${severity === severityFilter
                  ? "bg-amber-600/30 text-amber-200 border border-amber-500/50"
                  : "bg-slate-800/40 text-slate-400 border border-slate-700/50 hover:bg-slate-800/60 hover:text-slate-300"
                }
              `}
            >
              {severity === "all" ? "All" : (
                <>
                  {severityIcon(severity)} {severity.charAt(0).toUpperCase() + severity.slice(1)}
                </>
              )}
            </button>
          ))}
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
              ? "No Unexplored Territories Found!"
              : `No ${severityFilter} priority areas found`}
          </h3>
          <p className="text-slate-400 max-w-md mx-auto">
            {severityFilter === "all"
              ? "Your Library covers your discussions well. Keep exploring!"
              : `Try selecting a different severity level or \"All\" to see more.`}
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && filteredAreas.length > 0 && (
        <div className="space-y-4">
          {/* Stats Header */}
          <div className="text-sm text-slate-400">
            Found {filteredAreas.length} unexplored {filteredAreas.length === 1 ? "area" : "areas"} 
            {severityFilter !== "all" && ` (${severityFilter} severity)`}
          </div>

          {/* Area Cards */}
          {filteredAreas.map((area) => (
            <div
              key={area.id}
              className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 hover:bg-slate-800/60 transition-colors"
            >
              <div className="flex items-start gap-4">
                {/* Severity Indicator */}
                <div className={`w-3 h-3 rounded-full mt-2 flex-shrink-0 ${
                  area.severity === "high" ? "bg-red-500" :
                  area.severity === "medium" ? "bg-yellow-500" : "bg-green-500"
                }`}></div>
                
                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <h3 className="font-medium text-white text-lg">{area.title}</h3>
                  
                  {/* Stats */}
                  <p className="text-sm text-slate-400 mt-1">
                    {area.stats.conversationCount} conversations • {area.stats.libraryItemCount} Library items
                  </p>
                  
                  {/* Description */}
                  <p className="text-sm text-slate-500 mt-2 italic">
                    {area.description}
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
                  
                  {/* Actions */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => handleGenerate(area, "idea")}
                      className="px-3 py-1.5 bg-indigo-600/30 text-indigo-300 text-sm rounded-lg border border-indigo-500/30 hover:bg-indigo-600/40 transition-colors"
                    >
                      💡 Generate Ideas
                    </button>
                    <button
                      onClick={() => handleGenerate(area, "insight")}
                      className="px-3 py-1.5 bg-slate-700/30 text-slate-300 text-sm rounded-lg border border-slate-600/30 hover:bg-slate-700/50 transition-colors"
                    >
                      ✨ Generate Insights
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Footer */}
      <div className="mt-8 text-xs text-slate-500 text-center">
        Analyzed last {analyzedDays} days of conversations
      </div>
    </div>
  );
}
