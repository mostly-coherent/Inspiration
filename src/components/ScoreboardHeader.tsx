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
  cursor: {
    conversations: number;
    messages: number;
  };
  claudeCode: {
    conversations: number;
    messages: number;
  };
  workspaceDocs?: {
    documents: number;
  };
}

interface LibraryStats {
  totalItems: number;
  totalCategories: number; // Persisted categories from database
  themeCount: number; // Dynamic themes from preview API (matches Theme Explorer)
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

interface KGStats {
  totalEntities: number;
  byType: Record<string, number>;
  totalMentions: number;
  totalRelations?: number; // Optional for backward compatibility
  indexed: boolean;
  sourceType?: string; // "user", "expert", "both", "all"
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
    themeCount: 0, // Dynamic theme count (matches Theme Explorer)
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
  const [lennyKgStats, setLennyKgStats] = useState<KGStats>({
    totalEntities: 0,
    byType: {},
    totalMentions: 0,
    indexed: false,
  });
  const [isLoadingLennyKgStats, setIsLoadingLennyKgStats] = useState(true);
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
      // Fetch both persisted categories and dynamic theme count
      const [itemsRes, themesRes] = await Promise.all([
        fetch("/api/items?view=items"),
        fetch("/api/items/themes/preview?threshold=0.7"), // Use default threshold to match Theme Explorer
      ]);
      
      if (!itemsRes.ok) {
        throw new Error(`HTTP ${itemsRes.status}`);
      }
      const itemsData = await itemsRes.json();
      
      // Get dynamic theme count (matches Theme Explorer)
      let themeCount = 0;
      if (themesRes.ok) {
        const themesData = await themesRes.json();
        themeCount = themesData.themeCount || 0;
      }
      
      if (itemsData.success && isMountedRef.current) {
        // Calculate items added this week
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const thisWeek = (itemsData.items || []).filter((item: { lastSeen?: string; firstSeen?: string }) => {
          const dateStr = item.lastSeen || item.firstSeen;
          if (!dateStr) return false; // Skip items without dates
          const itemDate = new Date(dateStr);
          // Check if date is valid
          if (isNaN(itemDate.getTime())) return false;
          return itemDate >= oneWeekAgo;
        }).length;

        setLibraryStats({
          totalItems: itemsData.stats?.totalItems || 0,
          totalCategories: itemsData.stats?.totalCategories || 0,
          themeCount, // Dynamic theme count (matches Theme Explorer)
          thisWeek,
          byMode: itemsData.stats?.byMode || {},
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

  // Fetch Lenny's Knowledge Graph stats
  const fetchLennyKGStats = useCallback(async () => {
    if (isMountedRef.current) {
      setIsLoadingLennyKgStats(true);
    }
    try {
      const res = await fetch("/api/kg/stats?sourceType=expert");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (isMountedRef.current) {
        // Debug log to verify API response
        console.log("Lenny KG Stats API Response:", data);
        setLennyKgStats({
          totalEntities: data.totalEntities || 0,
          byType: data.byType || {},
          totalMentions: data.totalMentions ?? 0, // Use ?? to distinguish 0 from undefined
          totalRelations: data.totalRelations ?? 0, // Use ?? to distinguish 0 from undefined
          indexed: data.indexed || false,
          sourceType: "expert",
        });
        setIsLoadingLennyKgStats(false);
      }
    } catch (e) {
      console.error("Failed to fetch Lenny KG stats:", e);
      if (isMountedRef.current) {
        setIsLoadingLennyKgStats(false);
      }
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
      console.log("[ScoreboardHeader] Lenny stats API response:", data);
      if (data.success && isMountedRef.current) {
        setLennyStats({
          indexed: data.indexed,
          episodeCount: data.episodeCount,
          chunkCount: data.chunkCount,
          embeddingsSizeMB: data.embeddingsSizeMB || null,
          cloudMode: data.cloudMode || false,
        });
        console.log("[ScoreboardHeader] Set lennyStats:", {
          indexed: data.indexed,
          episodeCount: data.episodeCount,
          chunkCount: data.chunkCount,
          cloudMode: data.cloudMode,
        });
      } else {
        console.warn("[ScoreboardHeader] Lenny stats API returned success=false or component unmounted");
      }
    } catch (e) {
      console.error("[ScoreboardHeader] Failed to fetch Lenny stats:", e);
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
        
        // Use stats from download response if available (avoids /tmp persistence issues on Vercel)
        if (data.stats) {
          console.log("[ScoreboardHeader] Using stats from download response:", data.stats);
          setLennyStats((prev) => ({
            indexed: data.stats!.indexed !== false, // Ensure indexed is true if stats exist (unless explicitly false)
            episodeCount: data.stats!.episodeCount || 0,
            chunkCount: data.stats!.chunkCount || 0,
            embeddingsSizeMB: data.stats!.embeddingsSizeMB || null,
            cloudMode: data.cloudMode !== undefined ? data.cloudMode : prev.cloudMode, // Use response cloudMode, fallback to prev
          }));
          console.log("[ScoreboardHeader] Updated lennyStats state:", {
            indexed: data.stats.indexed !== false,
            episodeCount: data.stats.episodeCount || 0,
            chunkCount: data.stats.chunkCount || 0,
            cloudMode: data.cloudMode,
          });
        } else {
          console.warn("[ScoreboardHeader] No stats in download response, falling back to stats API");
          // Fallback: refresh stats after download
          await fetchLennyStats();
        }
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

  // Update Lenny embeddings and Knowledge Graph from GitHub Releases
  const updateLennyEmbeddings = useCallback(async () => {
    // Prevent concurrent updates
    if (lennyUpdateStatus === "updating" || !isMountedRef.current) return;
    
    setLennyUpdateStatus("updating");
    setLennyUpdateMessage("Downloading embeddings & KG from GitHub...");
    
    try {
      const res = await fetch("/api/lenny-update-all", { method: "POST" });
      
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
        if (data.action === "updated" || data.action === "partial") {
          setLennyUpdateMessage(`✓ ${data.message}`);
        } else {
          setLennyUpdateMessage(`⚠️ ${data.message}`);
        }
        setLennyUpdateStatus("success");
        // Refresh stats after update
        await Promise.all([
          fetchLennyStats().catch((e) => {
            console.error("Failed to refresh Lenny stats:", e);
          }),
          fetchLennyKGStats().catch((e) => {
            console.error("Failed to refresh Lenny KG stats:", e);
          }),
        ]);
      } else {
        if (data.action === "cloud_mode") {
          setLennyUpdateMessage("☁️ Cloud mode");
        } else {
          setLennyUpdateMessage(`⚠️ ${data.message || "Update failed"}`);
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
  }, [lennyUpdateStatus, fetchLennyStats, fetchLennyKGStats]);

  // Fetch all stats on mount
  useEffect(() => {
    isMountedRef.current = true;
    const fetchAll = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchMemoryStats(),
        fetchLibraryStats(),
        fetchSourceBreakdown(),
        fetchLennyStats(),
        fetchLennyKGStats(),
      ]);
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    };
    fetchAll();
    
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchMemoryStats, fetchLibraryStats, fetchSourceBreakdown, fetchLennyStats, fetchLennyKGStats]);

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
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900/90 to-slate-950/95 border border-slate-700/70 rounded-2xl p-5">
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
                  <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">
                    Your Thinking
                  </h2>
                </div>
                <p className="text-xs text-slate-300 ml-8">
                  Themes, ideas & insights from your AI conversations
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
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all min-w-[85px] ${
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
              {/* Size Transformation: Raw → Indexed → Extracted → Themes → Items → View All */}
              <div className="flex items-center gap-2">
                {(memoryStats.localSize || memoryStats.vectorSize) ? (
                  <>
                    <div className="text-center">
                      <div className="text-lg font-bold text-slate-200">
                        {memoryStats.localSize || "—"}
                      </div>
                      <div className="text-[10px] text-slate-300">raw</div>
                    </div>
                    <span className="text-slate-400">→</span>
                    <div className="text-center">
                      <div className="text-lg font-bold text-emerald-300">
                        {memoryStats.vectorSize || "—"}
                      </div>
                      <div className="text-[10px] text-slate-300">indexed</div>
                    </div>
                    <span className="text-slate-400">→</span>
                    <div className="text-center">
                      <div className="text-lg font-bold text-indigo-300">
                        {memoryStats.librarySize || "—"}
                      </div>
                      <div className="text-[10px] text-slate-300">extracted</div>
                    </div>
                    <span className="text-slate-400">→</span>
                    {/* Themes */}
                    {libraryStats.themeCount > 0 && (
                      <>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-indigo-300">
                            {libraryStats.themeCount}
                          </div>
                          <div className="text-[10px] text-slate-300">themes</div>
                        </div>
                        <span className="text-slate-400">→</span>
                      </>
                    )}
                    {/* Items */}
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">
                        {isLoading ? "—" : libraryStats.totalItems}
                      </div>
                      <div className="text-[10px] text-slate-300">items</div>
                    </div>
                    {/* View All link */}
                    <a
                      href="#library-section"
                      className="text-xs text-indigo-300 hover:text-indigo-200 transition-colors ml-2 self-center"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById("library-section")?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      View All →
                    </a>
                  </>
                ) : (
                  <div className="text-slate-500 text-sm">Loading...</div>
                )}
              </div>

              {/* This Week indicator (if applicable) */}
              {libraryStats.thisWeek > 0 && (
                <>
                  <div className="hidden md:block w-px h-8 bg-slate-700/50" />
                  <div className="text-center">
                    <div className="text-lg font-semibold text-emerald-400">
                      +{libraryStats.thisWeek}
                    </div>
                    <div className="text-[10px] text-slate-500">this week</div>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* YOUR CURSOR & CLAUDE CODE USAGE                                     */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900/90 to-slate-950/95 border border-slate-700/70 rounded-2xl p-5 mt-4">
        {/* Subtle gradient glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-blue-500/5 via-purple-500/5 to-transparent rounded-full blur-3xl" />
        
        <div className="relative z-10 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">💬</span>
                <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">
                  Your Cursor & Claude Code Usage
                </h2>
              </div>
              <p className="text-xs text-slate-300 ml-8">
                Conversation history and message counts
              </p>
            </div>
          </div>

          {/* Metadata Row: Date Coverage and Source Breakdown */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Date Coverage: First → Most Recent */}
            {memoryStats.earliestDate && memoryStats.latestDate && (
              <div className="flex items-center gap-1 text-slate-200 bg-slate-800/70 px-2 py-1 rounded-full">
                <span>📅</span>
                <span>{memoryStats.earliestDate}</span>
                <span className="text-slate-400">→</span>
                <span>{memoryStats.latestDate}</span>
              </div>
            )}

            {/* Source Breakdown: Cursor | Claude Code | Workspace Docs */}
            {sourceBreakdown && 
              ((sourceBreakdown.cursor.conversations > 0 || sourceBreakdown.cursor.messages > 0) ||
               (sourceBreakdown.claudeCode.conversations > 0 || sourceBreakdown.claudeCode.messages > 0) ||
               (sourceBreakdown.workspaceDocs?.documents ?? 0) > 0) && (
              <div className="flex items-center gap-1.5 text-slate-200 bg-slate-800/70 px-2 py-1 rounded-full">
                {(sourceBreakdown.cursor.conversations > 0 || sourceBreakdown.cursor.messages > 0) && (
                  <>
                    <span className="text-blue-300">Cursor:</span>
                    <span className="font-medium text-slate-100">
                      {sourceBreakdown.cursor.conversations.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400">conv</span>
                    <span className="text-slate-400">|</span>
                    <span className="font-medium text-slate-100">
                      {sourceBreakdown.cursor.messages.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400">msgs</span>
                  </>
                )}
                {(sourceBreakdown.cursor.conversations > 0 || sourceBreakdown.cursor.messages > 0) &&
                 (sourceBreakdown.claudeCode.conversations > 0 || sourceBreakdown.claudeCode.messages > 0) && (
                  <span className="text-slate-400 mx-1">|</span>
                )}
                {(sourceBreakdown.claudeCode.conversations > 0 || sourceBreakdown.claudeCode.messages > 0) && (
                  <>
                    <span className="text-purple-300">Claude Code:</span>
                    <span className="font-medium text-slate-100">
                      {sourceBreakdown.claudeCode.conversations.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400">conv</span>
                    <span className="text-slate-400">|</span>
                    <span className="font-medium text-slate-100">
                      {sourceBreakdown.claudeCode.messages.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400">msgs</span>
                  </>
                )}
                {(sourceBreakdown.workspaceDocs?.documents ?? 0) > 0 && (
                  <>
                    {((sourceBreakdown.cursor.conversations > 0 || sourceBreakdown.cursor.messages > 0) ||
                      (sourceBreakdown.claudeCode.conversations > 0 || sourceBreakdown.claudeCode.messages > 0)) && (
                      <span className="text-slate-400 mx-1">|</span>
                    )}
                    <span className="text-emerald-300">Docs:</span>
                    <span className="font-medium text-slate-100">
                      {sourceBreakdown.workspaceDocs!.documents.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400">files</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* WISDOM FROM LENNY'S PODCASTS — Separate section                     */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900/90 to-slate-950/95 border border-slate-700/70 rounded-2xl p-5 mt-4">
        {/* Subtle gradient glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-amber-500/5 via-orange-500/5 to-transparent rounded-full blur-3xl" />
        
        <div className="relative z-10 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎙️</span>
                <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">
                  Wisdom from Lenny&apos;s Podcasts
                </h2>
              </div>
              <p className="text-xs text-slate-300 ml-8">
                300+ episodes indexed for semantic search with knowledge graph
              </p>
            </div>
              </div>
              
          {/* Episodes (left, centered) → Two branches (right) */}
          {lennyStats.indexed ? (
            <div className="flex flex-wrap items-center gap-4">
              {/* Episodes (leftmost, vertically centered between branches) */}
              <div className="text-center self-center">
                <div className="text-lg font-bold text-amber-300">
                  {lennyStats.episodeCount.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-300">episodes</div>
                <div className="text-[9px] text-slate-400 mt-0.5">raw transcript</div>
              </div>

              {/* Two branches side by side */}
              <div className="flex-1 flex flex-col gap-3">
                {/* Branch 1: Semantic Search */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-[10px] text-slate-400 font-medium w-[120px]">Semantic Search:</div>
                  {lennyStats.embeddingsSizeMB && (
                    <>
                      <div className="text-center min-w-[80px]">
                        <div className="text-lg font-bold text-emerald-300">
                          {lennyStats.embeddingsSizeMB} MB
                        </div>
                        <div className="text-[10px] text-slate-300">indexed</div>
                        <div className="text-[9px] text-slate-400 mt-0.5">embeddings</div>
                      </div>
                      {lennyStats.chunkCount > 0 && (
                        <>
                          <span className="text-slate-400">→</span>
                          <div className="text-center min-w-[70px]">
                            <div className="text-lg font-bold text-indigo-300">
                              {lennyStats.chunkCount.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-slate-300">segments</div>
                            <div className="text-[9px] text-slate-400 mt-0.5">searchable</div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Branch 2: Knowledge Graph */}
                <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-700/30">
                  <div className="text-[10px] text-slate-400 font-medium w-[120px]">Knowledge Graph:</div>
              {isLoadingLennyKgStats ? (
                // Loading skeleton - matches structure of actual data
                <>
                  <div className="text-center min-w-[80px]">
                    <div className="text-lg font-bold text-purple-300 animate-pulse">
                      <span className="inline-block w-16 h-5 bg-slate-700 rounded"></span>
                    </div>
                    <div className="text-[10px] text-slate-300">entities</div>
                  </div>
                  <span className="text-slate-400">→</span>
                  <div className="text-center min-w-[70px]">
                    <div className="text-lg font-bold text-indigo-300 animate-pulse">
                      <span className="inline-block w-16 h-5 bg-slate-700 rounded"></span>
                    </div>
                    <div className="text-[10px] text-slate-300">mentions</div>
                  </div>
                  {lennyKgStats.totalRelations !== undefined && lennyKgStats.totalRelations > 0 && (
                    <>
                      <span className="text-slate-400">→</span>
                      <div className="text-center">
                        <div className="text-lg font-bold text-emerald-300 animate-pulse">
                          <span className="inline-block w-16 h-5 bg-slate-700 rounded"></span>
                        </div>
                        <div className="text-[10px] text-slate-300">relations</div>
                      </div>
                    </>
                  )}
                  {/* Quick Links - show even during loading */}
                  <div className="flex items-center gap-2 ml-auto">
                    <a
                      href="/entities?sourceType=expert"
                      className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-sm font-medium text-purple-300 hover:bg-purple-500/20 hover:border-purple-500/50 hover:text-purple-200 transition-all"
                    >
                      📋 Entities
                    </a>
                    <a
                      href="/graph?sourceType=expert"
                      className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-sm font-medium text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/50 hover:text-indigo-200 transition-all"
                    >
                      🔮 Graph
                    </a>
                  </div>
                </>
              ) : lennyKgStats.indexed && lennyKgStats.totalEntities > 0 ? (
                // Actual data when loaded
                <>
                  <div className="text-center min-w-[80px]">
                    <div className="text-lg font-bold text-purple-300">
                      {lennyKgStats.totalEntities.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-300">entities</div>
                  </div>
                  {/* Always show mentions if KG is indexed (even if 0) */}
                  <span className="text-slate-400">→</span>
                  <div className="text-center min-w-[70px]">
                    <div className="text-lg font-bold text-indigo-300">
                      {(lennyKgStats.totalMentions || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-300">mentions</div>
                  </div>
                  {/* Show relations only if > 0 */}
                  {lennyKgStats.totalRelations !== undefined && lennyKgStats.totalRelations > 0 && (
                    <>
                      <span className="text-slate-400">→</span>
                      <div className="text-center">
                        <div className="text-lg font-bold text-emerald-300">
                          {lennyKgStats.totalRelations.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-300">relations</div>
                      </div>
                    </>
                  )}
                  {/* Quick Links */}
                  <div className="flex items-center gap-2 ml-auto">
                    <a
                      href="/entities?sourceType=expert"
                      className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-sm font-medium text-purple-300 hover:bg-purple-500/20 hover:border-purple-500/50 hover:text-purple-200 transition-all"
                    >
                      📋 Entities
                    </a>
                    <a
                      href="/graph?sourceType=expert"
                      className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-sm font-medium text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/50 hover:text-indigo-200 transition-all"
                    >
                      🔮 Graph
                    </a>
                  </div>
                </>
              ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 text-sm">Not indexed yet</div>
          )}

          {/* Actions Row */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-700/30">
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
              
              {/* Lenny Download/Sync Button (when not indexed) */}
              {!lennyStats.indexed && (
                <button
                  onClick={downloadLennyEmbeddings}
                  disabled={lennyDownloadStatus === "downloading"}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    lennyDownloadStatus === "downloading"
                      ? "bg-amber-500/20 text-amber-300 animate-pulse cursor-wait"
                      : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30"
                  }`}
                  title={
                    lennyStats.cloudMode
                      ? "Sync embeddings from Supabase Storage (fast) or GitHub Releases (fallback)"
                      : "Download pre-computed embeddings from GitHub Releases (~250MB, one-time)"
                  }
                >
                  <span className={lennyDownloadStatus === "downloading" ? "animate-spin" : ""}>
                    {lennyDownloadStatus === "downloading" ? "⏳" : lennyStats.cloudMode ? "🔄" : "📥"}
                  </span>
                  <span>
                    {lennyDownloadStatus === "downloading" 
                      ? (lennyStats.cloudMode ? "Syncing..." : "Downloading...") 
                      : (lennyStats.cloudMode ? "Sync" : "Download")
                    }
                  </span>
                </button>
              )}
              
              {/* Lenny Update Button (when indexed) */}
              {lennyStats.indexed && (
                <button
                  onClick={updateLennyEmbeddings}
                  disabled={lennyUpdateStatus === "updating"}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all min-w-[85px] ${
                    lennyUpdateStatus === "updating"
                      ? "bg-amber-500/20 text-amber-300 animate-pulse cursor-wait"
                      : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30"
                  }`}
                  title="Update embeddings & Knowledge Graph from GitHub Releases (v1.0.0-lenny & v1.0.0-lenny-kg). Updates both semantic search and KG. ~5-10 min."
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
  );
});

