"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// Entity type colors matching EntityExplorer
const ENTITY_TYPE_COLORS: Record<string, string> = {
  tool: "#60a5fa", // blue-400
  pattern: "#c084fc", // purple-400
  problem: "#fbbf24", // amber-400
  concept: "#34d399", // emerald-400
  person: "#f472b6", // pink-400
  project: "#22d3ee", // cyan-400
  workflow: "#fb923c", // orange-400
};

interface EvolutionDataPoint {
  period: string;
  periodStart: string;
  mentionCount: number;
}

interface EntityEvolution {
  entityId: string;
  entityName: string;
  entityType: string;
  data: EvolutionDataPoint[];
}

interface TrendingEntity {
  entityId: string;
  entityName: string;
  entityType: string;
  recentMentions: number;
  historicalMentions: number;
  trendScore: number;
  trendDirection: "rising" | "stable" | "declining";
}

interface ActivityTimeline {
  period: string;
  periodStart: string;
  totalMentions: number;
  uniqueEntities: number;
  newEntities: number;
}

type ViewMode = "trending" | "activity" | "entity";
type Granularity = "day" | "week" | "month";

interface EvolutionTimelineProps {
  entityId?: string;
  entityIds?: string[];
  initialMode?: ViewMode;
  onEntityClick?: (entityId: string, entityName: string) => void;
  className?: string;
}

export default function EvolutionTimeline({
  entityId,
  entityIds,
  initialMode = "trending",
  onEntityClick,
  className = "",
}: EvolutionTimelineProps) {
  const [mode, setMode] = useState<ViewMode>(entityId ? "entity" : initialMode);
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [trending, setTrending] = useState<TrendingEntity[]>([]);
  const [activity, setActivity] = useState<ActivityTimeline[]>([]);
  const [evolution, setEvolution] = useState<EntityEvolution | null>(null);
  const [evolutions, setEvolutions] = useState<EntityEvolution[]>([]);

  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch data based on mode
  const fetchData = useCallback(async () => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("granularity", granularity);
      params.set("limit", "12");

      if (entityId) {
        params.set("mode", "entity");
        params.set("entity_id", entityId);
      } else if (entityIds && entityIds.length > 0) {
        params.set("mode", "compare");
        params.set("entity_ids", entityIds.join(","));
      } else {
        params.set("mode", mode);
      }

      const res = await fetch(`/api/kg/evolution?${params}`, {
        signal: abortControllerRef.current.signal,
      });

      if (!isMountedRef.current) return;

      if (!res.ok) {
        // Try to get error message from response
        let errorMessage = `Failed to fetch evolution data: ${res.status}`;
        try {
          const errorData = await res.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // If JSON parse fails, use status code message
        }
        throw new Error(errorMessage);
      }

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Invalid JSON response");
      }

      if (!isMountedRef.current) return;

      // Set appropriate data based on response
      if (data.trending) {
        setTrending(data.trending);
      }
      if (data.activity) {
        setActivity(data.activity);
      }
      if (data.evolution) {
        setEvolution(data.evolution);
      }
      if (data.evolutions) {
        setEvolutions(data.evolutions);
      }
      } catch (err) {
        if (!isMountedRef.current) return;
        if (err instanceof Error && err.name === "AbortError") return;

        console.error("Evolution fetch error:", err);
        
        // Check if error is about missing RPC functions
        const errorMessage = err instanceof Error ? err.message : "Failed to load data";
        if (errorMessage.includes("Could not find the function") || errorMessage.includes("function") && errorMessage.includes("not found")) {
          setError("Evolution features require SQL functions. Run add_evolution_schema.sql in Supabase SQL Editor.");
        } else {
          setError(errorMessage);
        }
      } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [entityId, entityIds, mode, granularity]);

  // Initial fetch and cleanup
  useEffect(() => {
    isMountedRef.current = true;
    fetchData();
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  // Update mode when entityId changes
  useEffect(() => {
    if (entityId) {
      setMode("entity");
    }
  }, [entityId]);

  // Trend icon
  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case "rising":
        return <span className="text-emerald-400">↑</span>;
      case "declining":
        return <span className="text-red-400">↓</span>;
      default:
        return <span className="text-slate-500">→</span>;
    }
  };

  // Simple bar chart for single entity
  const renderEntityChart = (data: EvolutionDataPoint[]) => {
    if (!data || data.length === 0) return null;

    const counts = data.map((d) => d.mentionCount || 0);
    const maxCount = counts.length > 0 ? Math.max(...counts, 1) : 1;

    return (
      <div className="space-y-2">
        {data.map((point) => (
          <div key={point.period} className="flex items-center gap-2">
            <div className="w-20 text-xs text-slate-500 text-right shrink-0">
              {point.period}
            </div>
            <div className="flex-1 h-5 bg-slate-800 rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded transition-all duration-500"
                style={{
                  width: `${(point.mentionCount / maxCount) * 100}%`,
                }}
              />
            </div>
            <div className="w-8 text-xs text-slate-400 text-right shrink-0">
              {point.mentionCount}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Multi-entity comparison chart
  const renderComparisonChart = () => {
    if (!evolutions || evolutions.length === 0) return null;

    // Get all unique periods across all entities
    const allPeriods = new Set<string>();
    evolutions.forEach((e) => {
      if (e.data && Array.isArray(e.data)) {
        e.data.forEach((d) => {
          if (d.period) allPeriods.add(String(d.period));
        });
      }
    });
    const periods = Array.from(allPeriods).sort();

    // Build data matrix - safely calculate max
    const allCounts = evolutions.flatMap((e) =>
      (e.data || []).map((d) => d.mentionCount || 0)
    );
    const maxCount = allCounts.length > 0 ? Math.max(...allCounts, 1) : 1;

    return (
      <div className="space-y-4">
        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs">
          {evolutions.map((e) => (
            <div
              key={e.entityId}
              className="flex items-center gap-1 cursor-pointer hover:opacity-80"
              onClick={() => onEntityClick?.(e.entityId, e.entityName)}
            >
              <span
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: ENTITY_TYPE_COLORS[e.entityType] || "#94a3b8",
                }}
              />
              <span className="text-slate-300">{e.entityName}</span>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="space-y-1">
          {periods.map((period) => (
            <div key={period} className="flex items-center gap-2">
              <div className="w-16 text-xs text-slate-500 text-right shrink-0">
                {period}
              </div>
              <div className="flex-1 flex gap-1">
                {evolutions.map((e) => {
                  const point = e.data.find((d) => d.period === period);
                  const count = point?.mentionCount || 0;
                  return (
                    <div
                      key={e.entityId}
                      className="h-4 rounded transition-all duration-300"
                      style={{
                        width: `${(count / maxCount) * 100}%`,
                        minWidth: count > 0 ? "4px" : "0",
                        backgroundColor:
                          ENTITY_TYPE_COLORS[e.entityType] || "#94a3b8",
                        opacity: count > 0 ? 1 : 0.2,
                      }}
                      title={`${e.entityName}: ${count}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Activity timeline chart
  const renderActivityChart = () => {
    if (!activity || activity.length === 0) return null;

    const mentions = activity.map((a) => a.totalMentions || 0);
    const maxMentions = mentions.length > 0 ? Math.max(...mentions, 1) : 1;

    return (
      <div className="space-y-2">
        {activity.map((point) => (
          <div key={point.period} className="flex items-center gap-2">
            <div className="w-20 text-xs text-slate-500 text-right shrink-0">
              {point.period}
            </div>
            <div className="flex-1 h-6 bg-slate-800 rounded overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-slate-600 to-slate-500 rounded transition-all duration-500"
                style={{
                  width: `${(point.totalMentions / maxMentions) * 100}%`,
                }}
              />
              {/* Overlay for unique entities */}
              <div className="absolute inset-0 flex items-center px-2">
                <span className="text-[10px] text-slate-300">
                  {point.totalMentions} mentions • {point.uniqueEntities} entities
                  {point.newEntities > 0 && (
                    <span className="text-emerald-400 ml-1">
                      (+{point.newEntities} new)
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Trending entities list
  const renderTrendingList = () => {
    if (trending.length === 0) {
      return (
        <div className="text-center py-8 text-slate-500">
          <p>No trending data available yet.</p>
          <p className="text-sm mt-1">Index more messages to see trends.</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {trending.map((entity, index) => (
          <div
            key={entity.entityId}
            className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
            onClick={() => onEntityClick?.(entity.entityId, entity.entityName)}
          >
            {/* Rank */}
            <div className="w-6 text-center text-slate-500 text-sm font-medium">
              {index + 1}
            </div>

            {/* Trend indicator */}
            <div className="text-lg">{getTrendIcon(entity.trendDirection)}</div>

            {/* Entity info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      ENTITY_TYPE_COLORS[entity.entityType] || "#94a3b8",
                  }}
                />
                <span className="text-slate-200 font-medium truncate">
                  {entity.entityName}
                </span>
              </div>
              <div className="text-xs text-slate-500 capitalize">
                {entity.entityType}
              </div>
            </div>

            {/* Stats */}
            <div className="text-right shrink-0">
              <div className="text-sm text-slate-300">
                {entity.recentMentions} recent
              </div>
              <div
                className={`text-xs ${
                  entity.trendScore > 0
                    ? "text-emerald-400"
                    : entity.trendScore < 0
                    ? "text-red-400"
                    : "text-slate-500"
                }`}
              >
                {entity.trendScore > 0 ? "+" : ""}
                {entity.trendScore.toFixed(0)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <div className="text-slate-400 flex items-center gap-2">
          <span className="animate-spin">⚡</span>
          Loading evolution data...
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center py-8 ${className}`}>
        <div className="text-red-400 mb-2">❌ {error}</div>
        <button
          onClick={fetchData}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Experimental Feature Banner */}
      <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <span className="text-lg">🚧</span>
          <div className="text-xs">
            <p className="text-amber-200 font-medium mb-1">Experimental Feature</p>
            <p className="text-slate-400">
              Evolution tracking and trend analysis are experimental. Data accuracy may vary.
            </p>
          </div>
        </div>
      </div>

      {/* Controls - only show if not in single entity mode */}
      {!entityId && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Mode tabs */}
          <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg">
            <button
              onClick={() => setMode("trending")}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                mode === "trending"
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              📈 Trending
            </button>
            <button
              onClick={() => setMode("activity")}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                mode === "activity"
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              📊 Activity
            </button>
          </div>

          {/* Granularity selector - only for activity mode */}
          {mode === "activity" && (
            <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg">
              {(["day", "week", "month"] as Granularity[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`px-2 py-1 text-xs rounded transition-colors capitalize ${
                    granularity === g
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content based on mode */}
      {entityId && evolution ? (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor:
                  ENTITY_TYPE_COLORS[evolution.entityType] || "#94a3b8",
              }}
            />
            <span className="text-slate-200 font-medium">
              {evolution.entityName}
            </span>
            <span className="text-slate-500 text-sm capitalize">
              ({evolution.entityType})
            </span>
          </div>
          {evolution.data.length > 0 ? (
            renderEntityChart(evolution.data)
          ) : (
            <div className="text-center py-8 text-slate-500">
              No timeline data for this entity yet.
            </div>
          )}
        </div>
      ) : entityIds && evolutions.length > 0 ? (
        renderComparisonChart()
      ) : mode === "trending" ? (
        renderTrendingList()
      ) : mode === "activity" ? (
        renderActivityChart()
      ) : null}
    </div>
  );
}
