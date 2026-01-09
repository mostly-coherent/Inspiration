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
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* MEMORY CARD — The Source of Inspiration */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-800/60 to-slate-900/80 border border-slate-700/50 rounded-2xl p-5">
        {/* Subtle glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl" />
        
        <div className="relative z-10 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🧠</span>
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                Memory
              </h2>
            </div>
            
            {/* Sync Button */}
            <button
              onClick={onSyncClick}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isSyncing
                  ? "bg-amber-500/20 text-amber-300 animate-pulse cursor-wait"
                  : isCloudMode
                  ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                  : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30"
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
              {isSyncing ? "Syncing..." : isCloudMode ? "Cloud" : "Sync"}
            </button>
          </div>

          {/* Size Transformation: GB → MB */}
          <div className="flex items-center gap-3">
            {(memoryStats.localSize || memoryStats.vectorSize) ? (
              <>
                {/* Raw size */}
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-300">
                    {memoryStats.localSize || "—"}
                  </div>
                  <div className="text-xs text-slate-500">raw chats</div>
                </div>
                
                {/* Arrow transformation */}
                <div className="flex flex-col items-center">
                  <span className="text-emerald-400 text-lg">→</span>
                  <span className="text-[10px] text-slate-500">distilled</span>
                </div>
                
                {/* Indexed size */}
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-400">
                    {memoryStats.vectorSize || "—"}
                  </div>
                  <div className="text-xs text-slate-500">indexed</div>
                </div>
              </>
            ) : (
              <div className="text-slate-500 text-sm">Loading...</div>
            )}
          </div>

          {/* Date Coverage & Sync Status */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {memoryStats.earliestDate && memoryStats.latestDate && (
              <div className="flex items-center gap-1 text-slate-400 bg-slate-800/50 px-2 py-1 rounded-full">
                <span>📅</span>
                <span>{memoryStats.earliestDate}</span>
                <span className="text-slate-600">→</span>
                <span>{memoryStats.latestDate}</span>
              </div>
            )}
            
            {syncStatus && !isCloudMode && (
              <span className={`px-2 py-1 rounded-full ${
                syncStatus.startsWith("✓") 
                  ? "bg-emerald-500/10 text-emerald-400" 
                  : "bg-amber-500/10 text-amber-400"
              }`}>
                {syncStatus}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* LIBRARY CARD — Growing Repository */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-800/60 to-slate-900/80 border border-slate-700/50 rounded-2xl p-5">
        {/* Subtle glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl" />
        
        <div className="relative z-10 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📚</span>
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                Library
              </h2>
            </div>
            
            {/* View All Link */}
            <a
              href="#library-section"
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("library-section")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Browse →
            </a>
          </div>

          {/* Main Stats */}
          <div className="flex items-end gap-4">
            {/* Total Items - Big Number */}
            <div>
              <div className="text-4xl font-bold text-white">
                {isLoading ? "—" : libraryStats.totalItems}
              </div>
              <div className="text-xs text-slate-500">total items</div>
            </div>
            
            {/* This Week Delta */}
            {libraryStats.thisWeek > 0 && (
              <div className="pb-1">
                <div className="text-lg font-semibold text-emerald-400">
                  +{libraryStats.thisWeek}
                </div>
                <div className="text-xs text-slate-500">this week</div>
              </div>
            )}
          </div>

          {/* Secondary Stats */}
          <div className="flex flex-wrap gap-3 text-xs">
            {libraryStats.totalCategories > 0 && (
              <div className="flex items-center gap-1 text-slate-400 bg-slate-800/50 px-2 py-1 rounded-full">
                <span>🏷️</span>
                <span>{libraryStats.totalCategories} themes</span>
              </div>
            )}
            
            {libraryStats.implemented > 0 && (
              <div className="flex items-center gap-1 text-purple-400 bg-purple-500/10 px-2 py-1 rounded-full">
                <span>✓</span>
                <span>{libraryStats.implemented} implemented</span>
              </div>
            )}
            
            {/* Mode Breakdown */}
            {Object.keys(libraryStats.byMode).length > 0 && (
              <div className="flex items-center gap-2 text-slate-500">
                {Object.entries(libraryStats.byMode).map(([mode, count]) => (
                  <span key={mode} className="capitalize">
                    {mode}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

