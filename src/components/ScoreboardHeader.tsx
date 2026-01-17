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
  embeddingsSizeMB: number | null;
  cloudMode?: boolean;
}

type LennyUpdateStatus = "idle" | "updating" | "success" | "error";
type LennyDownloadStatus = "idle" | "downloading" | "success" | "error";

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
    embeddingsSizeMB: null,
  });
  const [lennyUpdateStatus, setLennyUpdateStatus] = useState<LennyUpdateStatus>("idle");
  const [lennyUpdateMessage, setLennyUpdateMessage] = useState<string | null>(null);
  const [lennyDownloadStatus, setLennyDownloadStatus] = useState<LennyDownloadStatus>("idle");
  const [lennyDownloadMessage, setLennyDownloadMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lennyUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lennyDownloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Fetch Memory stats
  const fetchMemoryStats = useCallback(async () => {
    try {
      const res = await fetch("/api/brain-stats");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success && isMountedRef.current) {
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
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success && isMountedRef.current) {
        // Calculate items added this week
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const thisWeek = (data.items || []).filter((item: { lastSeen?: string; firstSeen?: string }) => {
          const dateStr = item.lastSeen || item.firstSeen;
          if (!dateStr) return false; // Skip items without dates
          const itemDate = new Date(dateStr);
          // Check if date is valid
          if (isNaN(itemDate.getTime())) return false;
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
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (isMountedRef.current) {
        setSourceBreakdown(data);
      }
    } catch (e) {
      console.error("Failed to fetch source breakdown:", e);
    }
  }, []);

  // Fetch Lenny archive stats
  const fetchLennyStats = useCallback(async () => {
    try {
      const res = await fetch("/api/lenny-stats");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success && isMountedRef.current) {
        setLennyStats({
          indexed: data.indexed,
          episodeCount: data.episodeCount,
          chunkCount: data.chunkCount,
          embeddingsSizeMB: data.embeddingsSizeMB || null,
          cloudMode: data.cloudMode || false,
        });
      }
    } catch (e) {
      console.error("Failed to fetch Lenny stats:", e);
    }
  }, []);

  // Download Lenny embeddings from GitHub Releases
  const downloadLennyEmbeddings = useCallback(async () => {
    // Prevent concurrent downloads
    if (lennyDownloadStatus === "downloading" || !isMountedRef.current) return;
    
    setLennyDownloadStatus("downloading");
    setLennyDownloadMessage("📥 Downloading embeddings (~250MB)...");
    
    try {
      const res = await fetch("/api/lenny-download", { method: "POST" });
      
      if (!isMountedRef.current) return;
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (isMountedRef.current) {
          setLennyDownloadMessage(`⚠️ ${errorData.error || "Download failed"}`);
          setLennyDownloadStatus("error");
        }
        return;
      }
      
      const data = await res.json();
      
      if (!isMountedRef.current) return;
      
      if (data.success) {
        if (data.message.includes("already exist")) {
          setLennyDownloadMessage("✓ Already downloaded");
        } else {
          setLennyDownloadMessage("✓ Download complete!");
        }
        setLennyDownloadStatus("success");
        // Refresh stats after download
        await fetchLennyStats();
      } else {
        // Handle cloud mode error message
        if (data.cloudMode) {
          setLennyDownloadMessage("☁️ Cloud mode - not available");
        } else {
          setLennyDownloadMessage(`⚠️ ${data.error || "Download failed"}`);
        }
        setLennyDownloadStatus("error");
      }
    } catch (e) {
      if (!isMountedRef.current) return;
      console.error("Lenny download error:", e);
      const errorMessage = e instanceof Error ? e.message : "Network error";
      setLennyDownloadMessage(`⚠️ ${errorMessage}`);
      setLennyDownloadStatus("error");
    }
    
    // Clear message after 5 seconds
    if (lennyDownloadTimeoutRef.current) {
      clearTimeout(lennyDownloadTimeoutRef.current);
    }
    lennyDownloadTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setLennyDownloadMessage(null);
        setLennyDownloadStatus("idle");
      }
      lennyDownloadTimeoutRef.current = null;
    }, 5000);
  }, [lennyDownloadStatus, fetchLennyStats]);

  // Update Lenny embeddings from GitHub Release (delete + re-download)
  const updateLennyEmbeddings = useCallback(async () => {
    // Prevent concurrent updates
    if (lennyUpdateStatus === "updating" || !isMountedRef.current) return;
    
    setLennyUpdateStatus("updating");
    setLennyUpdateMessage("Downloading from GitHub...");
    
    try {
      const res = await fetch("/api/lenny-update", { method: "POST" });
      
      if (!isMountedRef.current) return;
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (isMountedRef.current) {
          setLennyUpdateMessage(`⚠️ ${errorData.error || "Update failed"}`);
          setLennyUpdateStatus("error");
        }
        return;
      }
      
      const data = await res.json();
      
      if (!isMountedRef.current) return;
      
      if (data.success) {
        if (data.action === "updated") {
          const message = data.oldEpisodes && data.newEpisodes 
            ? `✓ Updated: ${data.oldEpisodes}→${data.newEpisodes} episodes`
            : `✓ ${data.message}`;
          setLennyUpdateMessage(message);
        }
        setLennyUpdateStatus("success");
        // Refresh stats after update
        fetchLennyStats().catch((e) => {
          console.error("Failed to refresh Lenny stats:", e);
        });
      } else {
        if (data.action === "cloud_mode") {
          setLennyUpdateMessage("☁️ Cloud mode");
        } else {
          setLennyUpdateMessage("⚠️ Update failed");
        }
        setLennyUpdateStatus("error");
      }
    } catch (e) {
      if (!isMountedRef.current) return;
      console.error("Lenny update error:", e);
      const errorMessage = e instanceof Error ? e.message : "Network error";
      setLennyUpdateMessage(`⚠️ ${errorMessage}`);
      setLennyUpdateStatus("error");
    }
    
    // Clear message after 5 seconds
    if (lennyUpdateTimeoutRef.current) {
      clearTimeout(lennyUpdateTimeoutRef.current);
    }
    lennyUpdateTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setLennyUpdateMessage(null);
        setLennyUpdateStatus("idle");
      }
      lennyUpdateTimeoutRef.current = null;
    }, 5000);
  }, [lennyUpdateStatus, fetchLennyStats]);

  // Fetch all stats on mount
  useEffect(() => {
    isMountedRef.current = true;
    const fetchAll = async () => {
      setIsLoading(true);
      await Promise.all([fetchMemoryStats(), fetchLibraryStats(), fetchSourceBreakdown(), fetchLennyStats()]);
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    };
    fetchAll();
    
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchMemoryStats, fetchLibraryStats, fetchSourceBreakdown, fetchLennyStats]);

  // Refresh library stats after sync completes
  useEffect(() => {
    if (syncStatus?.startsWith("✓") && isMountedRef.current) {
      fetchLibraryStats();
      fetchMemoryStats();
      fetchSourceBreakdown();
    }
  }, [syncStatus, fetchLibraryStats, fetchMemoryStats, fetchSourceBreakdown]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (lennyDownloadTimeoutRef.current) {
        clearTimeout(lennyDownloadTimeoutRef.current);
      }
      if (lennyUpdateTimeoutRef.current) {
        clearTimeout(lennyUpdateTimeoutRef.current);
      }
    };
  }, []);

  const isCloudMode = syncStatus === "☁️ Cloud Mode (Read-only)";

  return (
    <div className="w-full">
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* UNIFIED INSPIRATION PANEL                                         */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-800/60 to-slate-900/80 border border-slate-700/50 rounded-2xl p-5">
        {/* Subtle gradient glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-emerald-500/5 via-indigo-500/5 to-transparent rounded-full blur-3xl" />
        
        <div className="relative z-10 space-y-4">
          {/* ─────────────────────────────────────────────────────────────── */}
          {/* YOUR THINKING — Memory + Library unified                       */}
          {/* ─────────────────────────────────────────────────────────────── */}
          <div className="space-y-3">
            {/* Header with Sync */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🧠</span>
                  <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                    Your Thinking
                  </h2>
                </div>
                <p className="text-xs text-slate-500 ml-8">
                  Patterns from AI conversations
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Sync Status */}
                {syncStatus && !isCloudMode && (
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    syncStatus.startsWith("✓")
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-amber-500/10 text-amber-400"
                  }`}>
                    {syncStatus}
                  </span>
                )}
                
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
            </div>

            {/* Main Content Row */}
            <div className="flex flex-wrap items-center gap-6">
              {/* Size Transformation: Raw → Indexed → Library */}
              <div className="flex items-center gap-2">
                {(memoryStats.localSize || memoryStats.vectorSize) ? (
                  <>
                    <div className="text-center">
                      <div className="text-lg font-bold text-slate-400">
                        {memoryStats.localSize || "—"}
                      </div>
                      <div className="text-[10px] text-slate-500">raw</div>
                    </div>
                    <span className="text-slate-600">→</span>
                    <div className="text-center">
                      <div className="text-lg font-bold text-emerald-400">
                        {memoryStats.vectorSize || "—"}
                      </div>
                      <div className="text-[10px] text-slate-500">indexed</div>
                    </div>
                    <span className="text-slate-600">→</span>
                    <div className="text-center">
                      <div className="text-lg font-bold text-indigo-400">
                        {memoryStats.librarySize || "—"}
                      </div>
                      <div className="text-[10px] text-slate-500">extracted</div>
                    </div>
                  </>
                ) : (
                  <div className="text-slate-500 text-sm">Loading...</div>
                )}
              </div>

              {/* Divider */}
              <div className="hidden md:block w-px h-8 bg-slate-700/50" />

              {/* Library Stats */}
              <div className="flex items-end gap-3">
                <div>
                  <div className="text-2xl font-bold text-white">
                    {isLoading ? "—" : libraryStats.totalItems}
                  </div>
                  <div className="text-[10px] text-slate-500">items</div>
                </div>
                {libraryStats.totalCategories > 0 && (
                  <div>
                    <div className="text-lg font-semibold text-indigo-400">
                      {libraryStats.totalCategories}
                    </div>
                    <div className="text-[10px] text-slate-500">themes</div>
                  </div>
                )}
                {libraryStats.thisWeek > 0 && (
                  <div>
                    <div className="text-lg font-semibold text-emerald-400">
                      +{libraryStats.thisWeek}
                    </div>
                    <div className="text-[10px] text-slate-500">this week</div>
                  </div>
                )}
                
                {/* View All link */}
                <a
                  href="#library-section"
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors ml-2 self-center"
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById("library-section")?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  View All →
                </a>

                {/* Knowledge Graph links */}
                <a
                  href="/entities"
                  className="text-xs text-purple-400 hover:text-purple-300 transition-colors ml-2 self-center"
                >
                  📋 Entities
                </a>
                <a
                  href="/graph"
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors ml-2 self-center"
                >
                  🔮 Graph
                </a>
              </div>
            </div>

            {/* Metadata Row */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Date Coverage */}
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
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────── */}
          {/* WISDOM FROM LENNY'S — Always visible, shows indexing status   */}
          {/* ─────────────────────────────────────────────────────────────── */}
          <div className="border-t border-slate-700/50" />
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎙️</span>
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                  Wisdom from Lenny&apos;s
                </h2>
              </div>
              
              {/* Stats */}
              <div className="flex items-center gap-3">
                {lennyStats.indexed && lennyStats.episodeCount > 0 ? (
                  <>
                    <div 
                      className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full"
                      title={`${lennyStats.chunkCount.toLocaleString()} searchable segments`}
                    >
                      <span className="font-semibold">{lennyStats.episodeCount}</span>
                      <span className="text-amber-300/70 text-xs">episodes</span>
                    </div>
                    {lennyStats.embeddingsSizeMB && (
                      <div className="flex items-center gap-1.5 text-slate-400 bg-slate-800/50 px-2.5 py-1 rounded-full">
                        <span className="font-medium text-slate-300">{lennyStats.embeddingsSizeMB} MB</span>
                        <span className="text-slate-500 text-xs">indexed</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-500 bg-slate-800/50 px-2.5 py-1 rounded-full">
                    <span className="text-xs">Not downloaded yet</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Lenny Status Messages */}
              {(lennyDownloadMessage || lennyUpdateMessage) && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  (lennyDownloadMessage || lennyUpdateMessage)?.startsWith("✓")
                    ? "bg-emerald-500/10 text-emerald-400"
                    : (lennyDownloadMessage || lennyUpdateMessage)?.startsWith("☁️")
                    ? "bg-blue-500/10 text-blue-400"
                    : (lennyDownloadMessage || lennyUpdateMessage)?.startsWith("📥")
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-amber-500/10 text-amber-400"
                }`}>
                  {lennyDownloadMessage || lennyUpdateMessage}
                </span>
              )}
              
              {/* Lenny Download Button (when not indexed) */}
              {/* Show button on cloud too - Supabase Storage makes it available */}
              {!lennyStats.indexed && (
                <button
                  onClick={downloadLennyEmbeddings}
                  disabled={lennyDownloadStatus === "downloading"}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all ${
                    lennyDownloadStatus === "downloading"
                      ? "bg-blue-500/20 text-blue-300 animate-pulse cursor-wait"
                      : "bg-indigo-600/80 text-white hover:bg-indigo-500"
                  }`}
                  title={
                    lennyStats.cloudMode
                      ? "Download embeddings from Supabase Storage (fast) or GitHub Releases (fallback)"
                      : "Download pre-computed embeddings from GitHub Releases (~250MB, one-time)"
                  }
                >
                  <span className={lennyDownloadStatus === "downloading" ? "animate-spin" : ""}>
                    {lennyDownloadStatus === "downloading" ? "⏳" : "📥"}
                  </span>
                  <span>{lennyDownloadStatus === "downloading" ? "Downloading..." : "Download"}</span>
                </button>
              )}
              
              {/* Lenny Update Button (when indexed) */}
              {lennyStats.indexed && (
                <button
                  onClick={updateLennyEmbeddings}
                  disabled={lennyUpdateStatus === "updating"}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all ${
                    lennyUpdateStatus === "updating"
                      ? "bg-indigo-500/20 text-indigo-300 animate-pulse cursor-wait"
                      : "bg-indigo-600/80 text-white hover:bg-indigo-500"
                  }`}
                  title="Update from GitHub Release (free, fast ~2 min)"
                >
                  <span className={lennyUpdateStatus === "updating" ? "animate-spin" : ""}>
                    {lennyUpdateStatus === "updating" ? "⏳" : "⬇️"}
                  </span>
                  <span>{lennyUpdateStatus === "updating" ? "Updating..." : "Update"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

