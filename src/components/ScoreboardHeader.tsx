"use client";

import { useState, useEffect, useCallback, memo } from "react";

interface MemoryStats {
  localSize: string | null;
  vectorSize: string | null;
  earliestDate: string | null;
  latestDate: string | null;
}

interface LibraryStats {
  totalItems: number;
  totalCategories: number;
  implemented: number;
  thisWeek: number;
  byMode: Record<string, number>;
}

interface ScoreboardHeaderProps {
  onSyncClick: () => void;
  isSyncing: boolean;
  syncStatus: string | null;
}

export const ScoreboardHeader = memo(function ScoreboardHeader({
  onSyncClick,
  isSyncing,
  syncStatus,
}: ScoreboardHeaderProps) {
  const [memoryStats, setMemoryStats] = useState<MemoryStats>({
    localSize: null,
    vectorSize: null,
    earliestDate: null,
    latestDate: null,
  });
  const [libraryStats, setLibraryStats] = useState<LibraryStats>({
    totalItems: 0,
    totalCategories: 0,
    implemented: 0,
    thisWeek: 0,
    byMode: {},
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch Memory stats
  const fetchMemoryStats = useCallback(async () => {
    try {
      const res = await fetch("/api/brain-stats");
      const data = await res.json();
      if (data.success) {
        setMemoryStats({
          localSize: data.localSize,
          vectorSize: data.vectorSize,
          earliestDate: data.earliestDate,
          latestDate: data.latestDate,
        });
      }
    } catch (e) {
      console.error("Failed to fetch memory stats:", e);
    }
  }, []);

  // Fetch Library stats
  const fetchLibraryStats = useCallback(async () => {
    try {
      const res = await fetch("/api/items?view=items");
      const data = await res.json();
      if (data.success) {
        // Calculate items added this week
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const thisWeek = (data.items || []).filter((item: { lastSeen?: string; firstSeen?: string }) => {
          const itemDate = new Date(item.lastSeen || item.firstSeen || "");
          return itemDate >= oneWeekAgo;
        }).length;

        setLibraryStats({
          totalItems: data.stats?.totalItems || 0,
          totalCategories: data.stats?.totalCategories || 0,
          implemented: data.stats?.implemented || 0,
          thisWeek,
          byMode: data.stats?.byMode || {},
        });
      }
    } catch (e) {
      console.error("Failed to fetch library stats:", e);
    }
  }, []);

  // Fetch all stats on mount
  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      await Promise.all([fetchMemoryStats(), fetchLibraryStats()]);
      setIsLoading(false);
    };
    fetchAll();
  }, [fetchMemoryStats, fetchLibraryStats]);

  // Refresh library stats after sync completes
  useEffect(() => {
    if (syncStatus?.startsWith("✓")) {
      fetchLibraryStats();
      fetchMemoryStats();
    }
  }, [syncStatus, fetchLibraryStats, fetchMemoryStats]);

  const isCloudMode = syncStatus === "☁️ Cloud Mode (Read-only)";

  return (
    <div className="w-full bg-gradient-to-r from-white/5 to-white/10 border border-white/10 rounded-2xl p-4 mb-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Memory Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧠</span>
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
              Memory
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {/* Size */}
            {(memoryStats.localSize || memoryStats.vectorSize) ? (
              <div className="flex items-center gap-2">
                {memoryStats.localSize && (
                  <span className="text-white font-medium">{memoryStats.localSize}</span>
                )}
                {memoryStats.localSize && memoryStats.vectorSize && (
                  <span className="text-slate-500">→</span>
                )}
                {memoryStats.vectorSize && (
                  <span className="text-emerald-400 font-medium">{memoryStats.vectorSize}</span>
                )}
                <span className="text-slate-500 text-xs">indexed</span>
              </div>
            ) : (
              <span className="text-slate-500">—</span>
            )}

            {/* Date Coverage */}
            {memoryStats.earliestDate && memoryStats.latestDate && (
              <>
                <span className="text-slate-600">|</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400">{memoryStats.earliestDate}</span>
                  <span className="text-slate-500">→</span>
                  <span className="text-slate-400">{memoryStats.latestDate}</span>
                </div>
              </>
            )}

            {/* Sync Button */}
            <button
              onClick={onSyncClick}
              disabled={isSyncing}
              className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                isSyncing
                  ? "bg-amber-500/20 text-amber-300 animate-pulse cursor-wait"
                  : isCloudMode
                  ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                  : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
              title={
                isCloudMode
                  ? "Running in cloud. Cannot sync from local disk."
                  : "Sync Memory with latest Cursor history"
              }
            >
              <span className={isSyncing ? "animate-spin" : ""}>
                {isCloudMode ? "☁️" : "🔄"}
              </span>
              {isSyncing ? "Syncing..." : isCloudMode ? "Cloud Mode" : "Sync"}
            </button>
          </div>

          {/* Sync Status */}
          {syncStatus && !isCloudMode && (
            <p className="text-xs text-slate-500">{syncStatus}</p>
          )}
        </div>

        {/* Library Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">📚</span>
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
              Library
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {/* Total Items */}
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-bold text-white">
                {isLoading ? "—" : libraryStats.totalItems}
              </span>
              <span className="text-slate-500 text-xs">items</span>
            </div>

            {/* This Week */}
            {libraryStats.thisWeek > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-emerald-400 font-medium">
                  +{libraryStats.thisWeek}
                </span>
                <span className="text-slate-500 text-xs">this week</span>
              </div>
            )}

            {/* Categories */}
            {libraryStats.totalCategories > 0 && (
              <>
                <span className="text-slate-600">|</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-300">{libraryStats.totalCategories}</span>
                  <span className="text-slate-500 text-xs">categories</span>
                </div>
              </>
            )}

            {/* Implemented */}
            {libraryStats.implemented > 0 && (
              <>
                <span className="text-slate-600">|</span>
                <div className="flex items-center gap-1">
                  <span className="text-purple-400">{libraryStats.implemented}</span>
                  <span className="text-slate-500 text-xs">implemented ✓</span>
                </div>
              </>
            )}

            {/* View Library Link */}
            <a
              href="#library-section"
              className="ml-auto text-xs text-inspiration-ideas hover:text-inspiration-ideas/80 transition-colors"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("library-section")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              View All →
            </a>
          </div>

          {/* Mode Breakdown (subtle) */}
          {Object.keys(libraryStats.byMode).length > 0 && (
            <div className="flex gap-3 text-xs text-slate-500">
              {Object.entries(libraryStats.byMode).map(([mode, count]) => (
                <span key={mode}>
                  {mode}: {count}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

