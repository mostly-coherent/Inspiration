"use client";

import { useState, useEffect, useCallback, memo, useRef } from "react";

interface MemoryStats {
  localSize: string | null;
  vectorSize: string | null;
  librarySize: string | null;
  earliestDate: string | null;
  latestDate: string | null;
}

interface SourceBreakdown {
  cursor: number;
  claudeCode: number;
}

interface LibraryStats {
  totalItems: number;
  totalCategories: number;
  thisWeek: number;
  byMode: Record<string, number>;
}

interface LennyStats {
  indexed: boolean;
  episodeCount: number;
  chunkCount: number;
}

type LennySyncStatus = "idle" | "syncing" | "success" | "error";

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
    librarySize: null,
    earliestDate: null,
    latestDate: null,
  });
  const [libraryStats, setLibraryStats] = useState<LibraryStats>({
    totalItems: 0,
    totalCategories: 0,
    thisWeek: 0,
    byMode: {},
  });
  const [sourceBreakdown, setSourceBreakdown] = useState<SourceBreakdown | null>(null);
  const [lennyStats, setLennyStats] = useState<LennyStats>({
    indexed: false,
    episodeCount: 0,
    chunkCount: 0,
  });
  const [lennySyncStatus, setLennySyncStatus] = useState<LennySyncStatus>("idle");
  const [lennySyncMessage, setLennySyncMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lennySyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch Memory stats
  const fetchMemoryStats = useCallback(async () => {
    try {
      const res = await fetch("/api/brain-stats");
      const data = await res.json();
      if (data.success) {
        setMemoryStats({
          localSize: data.localSize,
          vectorSize: data.vectorSize,
          librarySize: data.librarySize,
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
          thisWeek,
          byMode: data.stats?.byMode || {},
        });
      }
    } catch (e) {
      console.error("Failed to fetch library stats:", e);
    }
  }, []);

  // Fetch source breakdown
  const fetchSourceBreakdown = useCallback(async () => {
    try {
      const res = await fetch("/api/brain-stats/sources");
      const data = await res.json();
      setSourceBreakdown(data);
    } catch (e) {
      console.error("Failed to fetch source breakdown:", e);
    }
  }, []);

  // Fetch Lenny archive stats
  const fetchLennyStats = useCallback(async () => {
    try {
      const res = await fetch("/api/lenny-stats");
      const data = await res.json();
      if (data.success) {
        setLennyStats({
          indexed: data.indexed,
          episodeCount: data.episodeCount,
          chunkCount: data.chunkCount,
        });
      }
    } catch (e) {
      console.error("Failed to fetch Lenny stats:", e);
    }
  }, []);

  // Sync Lenny archive (git pull + re-index if needed)
  const syncLennyArchive = useCallback(async () => {
    if (lennySyncStatus === "syncing") return;
    
    setLennySyncStatus("syncing");
    setLennySyncMessage("Checking for new episodes...");
    
    try {
      const res = await fetch("/api/lenny-sync", { method: "POST" });
      const data = await res.json();
      
      if (data.success) {
        if (data.action === "up_to_date") {
          setLennySyncMessage("✓ Up to date");
        } else if (data.action === "indexed") {
          setLennySyncMessage(`✓ ${data.newEpisodes || "New"} episodes indexed`);
        } else if (data.action === "pulled") {
          setLennySyncMessage("✓ Updates pulled");
        }
        setLennySyncStatus("success");
        // Refresh stats after sync
        fetchLennyStats().catch((e) => {
          console.error("Failed to refresh Lenny stats:", e);
        });
      } else {
        if (data.action === "cloud_mode") {
          setLennySyncMessage("☁️ Cloud mode");
        } else {
          setLennySyncMessage("⚠️ Sync failed");
        }
        setLennySyncStatus("error");
      }
    } catch (e) {
      console.error("Lenny sync error:", e);
      setLennySyncMessage("⚠️ Sync failed");
      setLennySyncStatus("error");
    }
    
    // Clear message after 5 seconds
    if (lennySyncTimeoutRef.current) {
      clearTimeout(lennySyncTimeoutRef.current);
    }
    lennySyncTimeoutRef.current = setTimeout(() => {
      setLennySyncMessage(null);
      setLennySyncStatus("idle");
      lennySyncTimeoutRef.current = null;
    }, 5000);
  }, [lennySyncStatus, fetchLennyStats]);

  // Fetch all stats on mount
  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      await Promise.all([fetchMemoryStats(), fetchLibraryStats(), fetchSourceBreakdown(), fetchLennyStats()]);
      setIsLoading(false);
    };
    fetchAll();
  }, [fetchMemoryStats, fetchLibraryStats, fetchSourceBreakdown, fetchLennyStats]);

  // Refresh library stats after sync completes + auto-sync Lenny
  useEffect(() => {
    if (syncStatus?.startsWith("✓")) {
      fetchLibraryStats();
      fetchMemoryStats();
      fetchSourceBreakdown();
      // Auto-sync Lenny archive when Memory sync completes
      syncLennyArchive().catch((e) => {
        console.error("Auto-sync Lenny archive failed:", e);
      });
    }
  }, [syncStatus, fetchLibraryStats, fetchMemoryStats, fetchSourceBreakdown, syncLennyArchive]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (lennySyncTimeoutRef.current) {
        clearTimeout(lennySyncTimeoutRef.current);
      }
    };
  }, []);

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

          {/* Size Transformation: Raw → Memory → Library */}
          <div className="flex items-center gap-2">
            {(memoryStats.localSize || memoryStats.vectorSize) ? (
              <>
                {/* Raw chats size */}
                <div className="text-center min-w-[60px]">
                  <div className="text-xl font-bold text-slate-400">
                    {memoryStats.localSize || "—"}
                  </div>
                  <div className="text-[10px] text-slate-500">raw chats</div>
                </div>
                
                {/* Arrow: Raw → Memory */}
                <div className="flex flex-col items-center px-1">
                  <span className="text-emerald-500 text-sm">→</span>
                </div>
                
                {/* Memory (indexed) size */}
                <div className="text-center min-w-[60px]">
                  <div className="text-xl font-bold text-emerald-400">
                    {memoryStats.vectorSize || "—"}
                  </div>
                  <div className="text-[10px] text-slate-500">memory</div>
                </div>
                
                {/* Arrow: Memory → Library */}
                <div className="flex flex-col items-center px-1">
                  <span className="text-indigo-400 text-sm">→</span>
                </div>
                
                {/* Library (distilled) size */}
                <div className="text-center min-w-[60px]">
                  <div className="text-xl font-bold text-indigo-400">
                    {memoryStats.librarySize || "—"}
                  </div>
                  <div className="text-[10px] text-slate-500">library</div>
                </div>
              </>
            ) : (
              <div className="text-slate-500 text-sm">Loading...</div>
            )}
          </div>
          
          {/* Distillation ratio label */}
          {memoryStats.localSize && memoryStats.librarySize && (
            <div className="text-[10px] text-slate-500 text-center">
              📊 Distillation: {memoryStats.localSize} → {memoryStats.librarySize}
            </div>
          )}

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

            {/* Source Breakdown */}
            {sourceBreakdown && (sourceBreakdown.cursor > 0 || sourceBreakdown.claudeCode > 0) && (
              <div className="flex items-center gap-1.5 text-slate-400 bg-slate-800/50 px-2 py-1 rounded-full">
                {sourceBreakdown.cursor > 0 && (
                  <>
                    <span className="text-blue-400">Cursor</span>
                    <span className="font-medium text-slate-300">{sourceBreakdown.cursor.toLocaleString()}</span>
                  </>
                )}
                {sourceBreakdown.cursor > 0 && sourceBreakdown.claudeCode > 0 && (
                  <span className="text-slate-600">|</span>
                )}
                {sourceBreakdown.claudeCode > 0 && (
                  <>
                    <span className="text-purple-400">Claude Code</span>
                    <span className="font-medium text-slate-300">{sourceBreakdown.claudeCode.toLocaleString()}</span>
                  </>
                )}
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

            {/* Lenny Expert Archive */}
            {lennyStats.indexed && lennyStats.episodeCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div 
                  className="flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full"
                  title={`${lennyStats.chunkCount.toLocaleString()} searchable segments from Lenny's Podcast`}
                >
                  <span>🎙️</span>
                  <span>{lennyStats.episodeCount} expert episodes</span>
                </div>
                
                {/* Lenny Sync Button */}
                <button
                  onClick={syncLennyArchive}
                  disabled={lennySyncStatus === "syncing"}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all ${
                    lennySyncStatus === "syncing"
                      ? "bg-amber-500/20 text-amber-300 animate-pulse cursor-wait"
                      : "bg-slate-700/50 text-slate-400 hover:bg-slate-700/80 hover:text-amber-400"
                  }`}
                  title="Sync Lenny archive (git pull + re-index)"
                >
                  <span className={lennySyncStatus === "syncing" ? "animate-spin" : ""}>
                    🔄
                  </span>
                </button>
                
                {/* Lenny Sync Status */}
                {lennySyncMessage && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    lennySyncMessage.startsWith("✓")
                      ? "bg-emerald-500/10 text-emerald-400"
                      : lennySyncMessage.startsWith("☁️")
                      ? "bg-blue-500/10 text-blue-400"
                      : "bg-amber-500/10 text-amber-400"
                  }`}>
                    {lennySyncMessage}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

