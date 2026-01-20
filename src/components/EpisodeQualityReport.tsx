"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface EpisodeStat {
  episodeSlug: string;
  guestName: string;
  episodeTitle: string | null;
  youtubeUrl: string | null;
  totalChunks: number;
  indexedChunks: number;
  qualityPercent: number;
}

interface EpisodeStatsSummary {
  totalEpisodes: number;
  totalChunks: number;
  totalIndexed: number;
  avgQualityPercent: number;
}

interface EpisodeQualityReportProps {
  onEpisodeClick?: (episodeSlug: string, guestName: string) => void;
  className?: string;
}

type SortField = "guestName" | "indexedChunks" | "qualityPercent";
type SortDirection = "asc" | "desc";

export default function EpisodeQualityReport({
  onEpisodeClick,
  className = "",
}: EpisodeQualityReportProps) {
  const [episodes, setEpisodes] = useState<EpisodeStat[]>([]);
  const [summary, setSummary] = useState<EpisodeStatsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("guestName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch episode stats
  const fetchStats = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/kg/episode-stats", {
        signal: abortControllerRef.current.signal,
      });

      if (!isMountedRef.current) return;

      if (!res.ok) {
        throw new Error(`Failed to fetch episode stats: ${res.status}`);
      }

      const data = await res.json();

      if (!isMountedRef.current) return;

      setEpisodes(data.episodes || []);
      setSummary(data.summary || null);
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return;

      console.error("Episode stats fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Initial fetch and cleanup
  useEffect(() => {
    isMountedRef.current = true;
    fetchStats();
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchStats]);

  // Sort episodes
  const sortedEpisodes = [...episodes]
    .filter((ep) =>
      ep.guestName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ep.episodeTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    )
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "guestName":
          comparison = a.guestName.localeCompare(b.guestName);
          break;
        case "indexedChunks":
          comparison = a.indexedChunks - b.indexedChunks;
          break;
        case "qualityPercent":
          comparison = a.qualityPercent - b.qualityPercent;
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

  // Toggle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "guestName" ? "asc" : "desc");
    }
  };

  // Get quality color
  const getQualityColor = (percent: number): string => {
    if (percent >= 50) return "text-emerald-400";
    if (percent >= 30) return "text-yellow-400";
    return "text-red-400";
  };

  // Get quality bar color
  const getQualityBarColor = (percent: number): string => {
    if (percent >= 50) return "bg-emerald-500";
    if (percent >= 30) return "bg-yellow-500";
    return "bg-red-500";
  };

  // Sort indicator
  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-slate-600 ml-1">↕</span>;
    return (
      <span className="text-slate-400 ml-1">
        {sortDirection === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <div className="text-slate-400 flex items-center gap-2">
          <span className="animate-spin">⚡</span>
          Loading episode stats...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center py-8 ${className}`}>
        <div className="text-red-400 mb-2">❌ {error}</div>
        <button
          onClick={fetchStats}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 rounded-lg p-4 text-center">
            <div className="text-2xl font-semibold text-slate-100">
              {summary.totalEpisodes}
            </div>
            <div className="text-xs text-slate-400">Episodes</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 text-center">
            <div className="text-2xl font-semibold text-slate-100">
              {summary.totalChunks.toLocaleString()}
            </div>
            <div className="text-xs text-slate-400">Total Chunks</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 text-center">
            <div className="text-2xl font-semibold text-emerald-400">
              {summary.totalIndexed.toLocaleString()}
            </div>
            <div className="text-xs text-slate-400">Indexed Chunks</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 text-center">
            <div className={`text-2xl font-semibold ${getQualityColor(summary.avgQualityPercent)}`}>
              {summary.avgQualityPercent}%
            </div>
            <div className="text-xs text-slate-400">Avg Quality</div>
          </div>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Search episodes..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600"
      />

      {/* Episodes Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th
                className="text-left py-3 px-4 text-slate-400 font-medium cursor-pointer hover:text-slate-200"
                onClick={() => handleSort("guestName")}
              >
                Guest / Episode <SortIndicator field="guestName" />
              </th>
              <th
                className="text-right py-3 px-4 text-slate-400 font-medium cursor-pointer hover:text-slate-200"
                onClick={() => handleSort("indexedChunks")}
              >
                Indexed <SortIndicator field="indexedChunks" />
              </th>
              <th
                className="text-right py-3 px-4 text-slate-400 font-medium cursor-pointer hover:text-slate-200 w-[200px]"
                onClick={() => handleSort("qualityPercent")}
              >
                Quality % <SortIndicator field="qualityPercent" />
              </th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {sortedEpisodes.map((episode) => (
              <tr
                key={episode.episodeSlug}
                className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors"
                onClick={() => onEpisodeClick?.(episode.episodeSlug, episode.guestName)}
              >
                <td className="py-3 px-4">
                  <div className="font-medium text-slate-200">
                    {episode.guestName}
                  </div>
                  {episode.episodeTitle && (
                    <div className="text-xs text-slate-500 truncate max-w-[300px]">
                      {episode.episodeTitle}
                    </div>
                  )}
                </td>
                <td className="text-right py-3 px-4 text-slate-300">
                  {episode.indexedChunks}
                  <span className="text-slate-500"> / ~{episode.totalChunks}</span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${getQualityBarColor(episode.qualityPercent)}`}
                        style={{ width: `${Math.min(episode.qualityPercent, 100)}%` }}
                      />
                    </div>
                    <span className={`text-sm font-medium ${getQualityColor(episode.qualityPercent)}`}>
                      {episode.qualityPercent}%
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4">
                  {episode.youtubeUrl && (
                    <a
                      href={episode.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-400 hover:text-blue-300"
                      title="Watch on YouTube"
                    >
                      📺
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sortedEpisodes.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            {searchQuery
              ? "No episodes match your search"
              : "No episode data available"}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-slate-500 pt-4 border-t border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500" />
          <span>&gt;50% high quality</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-yellow-500" />
          <span>30-50% medium</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          <span>&lt;30% low coverage</span>
        </div>
      </div>
    </div>
  );
}
