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

interface IndexingProgress {
  jobId: string;
  status: "running" | "completed" | "failed" | "stopped";
  startTime: number;
  endTime?: number;
  totalConversations: number;
  processedConversations: number;
  entitiesCreated: number;
  entitiesDeduplicated: number;
  relationsCreated: number;
  decisionsCreated: number;
  errors?: number;
  skipped?: number;
  error?: string;
  phase?: string;
  progressPercent?: number;
  elapsedSeconds?: number;
  estimatedSecondsRemaining?: number;
}

type LennyUpdateStatus = "idle" | "updating" | "success" | "error";
type LennyDownloadStatus = "idle" | "downloading" | "success" | "error";
type IndexingStatus = "idle" | "estimating" | "indexing" | "completed" | "error" | "stopped";

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
  const [kgStats, setKgStats] = useState<KGStats>({
    totalEntities: 0,
    byType: {},
    totalMentions: 0,
    indexed: false,
  });
  const [lennyKgStats, setLennyKgStats] = useState<KGStats>({
    totalEntities: 0,
    byType: {},
    totalMentions: 0,
    indexed: false,
  });
  const [isLoadingLennyKgStats, setIsLoadingLennyKgStats] = useState(true);
  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus>("idle");
  const [indexingProgress, setIndexingProgress] = useState<IndexingProgress | null>(null);
  const [indexingJobId, setIndexingJobId] = useState<string | null>(null);
  const [costEstimate, setCostEstimate] = useState<{
    conversationCount: number;
    estimatedCost: number;
    estimatedTimeMinutes: number;
  } | null>(null);
  const [showCostEstimate, setShowCostEstimate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const lennyUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lennyDownloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const indexingProgressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const indexingProgressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const indexingErrorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const indexingStopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  // Fetch Knowledge Graph stats (user's KG)
  const fetchKGStats = useCallback(async () => {
    try {
      const res = await fetch("/api/kg/stats?sourceType=user");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (isMountedRef.current) {
        setKgStats({
          totalEntities: data.totalEntities || 0,
          byType: data.byType || {},
          totalMentions: data.totalMentions || 0,
          totalRelations: data.totalRelations || 0,
          indexed: data.indexed || false,
          sourceType: "user",
        });
      }
    } catch (e) {
      console.error("Failed to fetch KG stats:", e);
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

  // Fetch indexing progress
  const fetchIndexingProgress = useCallback(async (jobId?: string) => {
    try {
      const url = jobId
        ? `/api/kg/index-progress?jobId=${jobId}`
        : "/api/kg/index-progress";
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success && data.progress && isMountedRef.current) {
        setIndexingProgress(data.progress);
        setIndexingJobId(data.progress.jobId);
        
        if (data.progress.status === "running") {
          setIndexingStatus("indexing");
          // Start polling if not already polling
          if (!indexingProgressIntervalRef.current) {
            indexingProgressIntervalRef.current = setInterval(() => {
              fetchIndexingProgress(data.progress.jobId);
            }, 2000); // Poll every 2 seconds
          }
        } else if (data.progress.status === "completed") {
          setIndexingStatus("completed");
          // Stop polling
          if (indexingProgressIntervalRef.current) {
            clearInterval(indexingProgressIntervalRef.current);
            indexingProgressIntervalRef.current = null;
          }
          // Refresh KG stats after completion
          fetchKGStats();
          fetchLennyKGStats();
          // Clear progress after 5 seconds
          if (indexingProgressTimeoutRef.current) {
            clearTimeout(indexingProgressTimeoutRef.current);
          }
          indexingProgressTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setIndexingStatus("idle");
              setIndexingProgress(null);
            }
            indexingProgressTimeoutRef.current = null;
          }, 5000);
        } else if (data.progress.status === "failed" || data.progress.status === "stopped") {
          setIndexingStatus("error");
          // Stop polling
          if (indexingProgressIntervalRef.current) {
            clearInterval(indexingProgressIntervalRef.current);
            indexingProgressIntervalRef.current = null;
          }
        }
        return data.progress; // Return progress for caller to check
      } else if (isMountedRef.current) {
        // No active job
        setIndexingStatus("idle");
        setIndexingProgress(null);
        return null;
      }
    } catch (e) {
      console.error("Failed to fetch indexing progress:", e);
      return null;
    }
  }, [fetchKGStats]);

  // Estimate cost before indexing
  const estimateCost = useCallback(async () => {
    try {
      // Get conversation count
      const countRes = await fetch("/api/kg/conversation-count?daysBack=90");
      if (!countRes.ok) {
        return null;
      }
      const countData = await countRes.json();
      const conversationCount = countData.conversationCount || 0;

      if (conversationCount === 0) {
        return null; // Can't estimate without count
      }

      // Estimate cost using same logic as estimate-cost endpoint
      const estimateRes = await fetch("/api/kg/estimate-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chunkCount: conversationCount, // Approximate: 1 conversation = 1 chunk
          model: "claude-haiku-4-5",
          withRelations: true,
          avgChunkSize: 200, // Average tokens per conversation
          workers: 4,
        }),
      });

      if (!estimateRes.ok) {
        return null;
      }

      const estimateData = await estimateRes.json();
      return {
        conversationCount,
        estimatedCost: estimateData.costEstimate?.totalCostUsd || 0,
        estimatedTimeMinutes: Math.round(
          (estimateData.timeEstimate?.hours || 0) * 60 +
            (estimateData.timeEstimate?.minutes || 0)
        ),
      };
    } catch (e) {
      console.error("Failed to estimate cost:", e);
      return null;
    }
  }, []);

  // Start indexing
  const startIndexing = useCallback(async () => {
    if (indexingStatus === "indexing" || indexingStatus === "estimating") {
      return;
    }

    setIndexingStatus("estimating");
    
    try {
      const res = await fetch("/api/kg/index-user-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          withRelations: true,
          withDecisions: true,
          workers: 4,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errorData.error || "Failed to start indexing");
      }

      const data = await res.json();
      if (data.success && data.jobId) {
        setIndexingJobId(data.jobId);
        setIndexingStatus("indexing");
        setShowCostEstimate(false);
        
        // Start polling for progress
        if (indexingProgressIntervalRef.current) {
          clearInterval(indexingProgressIntervalRef.current);
        }
        indexingProgressIntervalRef.current = setInterval(() => {
          fetchIndexingProgress(data.jobId);
        }, 2000); // Poll every 2 seconds
      } else {
        throw new Error(data.error || "Failed to start indexing");
      }
    } catch (e) {
      console.error("Failed to start indexing:", e);
      setIndexingStatus("error");
      if (indexingErrorTimeoutRef.current) {
        clearTimeout(indexingErrorTimeoutRef.current);
      }
      indexingErrorTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setIndexingStatus("idle");
        }
        indexingErrorTimeoutRef.current = null;
      }, 5000);
    }
  }, [indexingStatus, fetchIndexingProgress]);

  // Stop indexing
  const stopIndexing = useCallback(async () => {
    if (!indexingJobId) {
      return;
    }

    try {
      const res = await fetch("/api/kg/index-user-chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: indexingJobId }),
      });

      if (res.ok) {
        setIndexingStatus("stopped");
        if (indexingProgressIntervalRef.current) {
          clearInterval(indexingProgressIntervalRef.current);
        }
        // Refresh progress to show stopped state
        if (indexingStopTimeoutRef.current) {
          clearTimeout(indexingStopTimeoutRef.current);
        }
        indexingStopTimeoutRef.current = setTimeout(() => {
          fetchIndexingProgress(indexingJobId);
          indexingStopTimeoutRef.current = null;
        }, 1000);
      }
    } catch (e) {
      console.error("Failed to stop indexing:", e);
    }
  }, [indexingJobId, fetchIndexingProgress]);

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
        fetchKGStats(),
        fetchLennyKGStats(),
        fetchIndexingProgress(), // Check for existing indexing jobs
      ]);
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    };
    fetchAll();
    
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchMemoryStats, fetchLibraryStats, fetchSourceBreakdown, fetchLennyStats, fetchKGStats, fetchLennyKGStats, fetchIndexingProgress]);

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
      if (indexingProgressIntervalRef.current) {
        clearInterval(indexingProgressIntervalRef.current);
      }
      if (indexingProgressTimeoutRef.current) {
        clearTimeout(indexingProgressTimeoutRef.current);
      }
      if (indexingErrorTimeoutRef.current) {
        clearTimeout(indexingErrorTimeoutRef.current);
      }
      if (indexingStopTimeoutRef.current) {
        clearTimeout(indexingStopTimeoutRef.current);
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
      {/* YOUR KNOWLEDGE GRAPH SECTION                                      */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900/90 to-slate-950/95 border border-slate-700/70 rounded-2xl p-5 mt-4">
        {/* Subtle gradient glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-purple-500/5 via-indigo-500/5 to-transparent rounded-full blur-3xl" />
        
        <div className="relative z-10 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔮</span>
                <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">
                  Your Knowledge Graph
                </h2>
                <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wide" title="Under construction - work in progress">
                  UNDER CONSTRUCTION
                </span>
              </div>
              <p className="text-xs text-slate-300 ml-8">
                Entities & relations from your AI conversations
              </p>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex flex-wrap items-center gap-4">
            {kgStats.indexed ? (
              <>
                <div className="text-center">
                  <div className="text-lg font-bold text-purple-300">
                    {kgStats.totalEntities.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-300">entities</div>
                </div>
                {/* Always show mentions if KG is indexed (even if 0) */}
                <span className="text-slate-400">→</span>
                <div className="text-center">
                  <div className="text-lg font-bold text-indigo-300">
                    {(kgStats.totalMentions || 0).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-300">mentions</div>
                </div>
                {/* Show relations if available */}
                {kgStats.totalRelations !== undefined && (
                  <>
                    <span className="text-slate-400">→</span>
                    <div className="text-center">
                      <div className="text-lg font-bold text-emerald-300">
                        {kgStats.totalRelations.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-300">relations</div>
                      {kgStats.totalRelations === 0 && (
                        <div className="text-[8px] text-slate-500 mt-0.5" title="Relations extraction requires --with-relations flag during indexing">
                          (not extracted)
                        </div>
                      )}
                    </div>
                  </>
                )}
                {/* Quick Links */}
                <div className="flex items-center gap-3 ml-auto">
                  <a
                    href="/entities"
                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    📋 Entities
                  </a>
                  <a
                    href="/graph"
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    🔮 Graph
                  </a>
                </div>
              </>
            ) : (
              <div className="text-slate-500 text-sm">Not indexed yet</div>
            )}
          </div>

          {/* Indexing UI - Always show (allows re-indexing and shows progress) */}
          <div className="space-y-2 pt-2 border-t border-slate-700/30">
              {indexingStatus === "indexing" && indexingProgress ? (
                <>
                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">
                        {indexingProgress.phase || "Indexing conversations..."}
                      </span>
                      <span className="text-slate-400">
                        {indexingProgress.progressPercent || 0}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-800/50 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full transition-all duration-300"
                        style={{
                          width: `${indexingProgress.progressPercent || 0}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>
                        {indexingProgress.processedConversations} / {indexingProgress.totalConversations} conversations
                      </span>
                      {indexingProgress.estimatedSecondsRemaining && (
                        <span>
                          ~{Math.round(indexingProgress.estimatedSecondsRemaining / 60)} min remaining
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Stats */}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {indexingProgress.entitiesCreated > 0 && (
                      <div className="text-purple-300">
                        +{indexingProgress.entitiesCreated} entities
                      </div>
                    )}
                    {indexingProgress.entitiesDeduplicated > 0 && (
                      <div className="text-purple-400/70">
                        {indexingProgress.entitiesDeduplicated} deduplicated
                      </div>
                    )}
                    {indexingProgress.relationsCreated > 0 && (
                      <div className="text-indigo-300">
                        +{indexingProgress.relationsCreated} relations
                      </div>
                    )}
                    {indexingProgress.decisionsCreated > 0 && (
                      <div className="text-emerald-300">
                        +{indexingProgress.decisionsCreated} decisions
                      </div>
                    )}
                    {(indexingProgress.errors ?? 0) > 0 && (
                      <div className="text-red-400">
                        {indexingProgress.errors} errors
                      </div>
                    )}
                  </div>
                  
                  {/* Stop Button */}
                  <button
                    onClick={stopIndexing}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 text-xs font-medium transition-all"
                  >
                    <span>⏸️</span>
                    <span>Stop</span>
                  </button>
                </>
              ) : indexingStatus === "completed" ? (
                <div className="text-xs text-emerald-400">
                  ✓ Indexing complete! Refresh to see updated stats.
                </div>
              ) : indexingStatus === "error" && indexingProgress?.error ? (
                <div className="space-y-2">
                  <div className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
                    ⚠️ {indexingProgress.error}
                  </div>
                  <button
                    onClick={() => {
                      setIndexingStatus("idle");
                      setIndexingProgress(null);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-300"
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {showCostEstimate && costEstimate ? (
                    <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 space-y-1">
                      <div className="text-amber-300 font-medium">Cost Estimate</div>
                      <div className="text-slate-300">
                        {costEstimate.conversationCount.toLocaleString()} conversations
                      </div>
                      <div className="text-slate-300">
                        Estimated cost: ${costEstimate.estimatedCost.toFixed(2)}
                      </div>
                      <div className="text-slate-300">
                        Estimated time: ~{costEstimate.estimatedTimeMinutes} minutes
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={startIndexing}
                          disabled={indexingStatus === "estimating"}
                          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-xs font-medium transition-all"
                        >
                          <span className={indexingStatus === "estimating" ? "animate-spin" : ""}>
                            {indexingStatus === "estimating" ? "⏳" : "🚀"}
                          </span>
                          <span>Start Indexing</span>
                        </button>
                        <button
                          onClick={() => setShowCostEstimate(false)}
                          className="px-2 py-1 rounded bg-slate-800/50 text-slate-400 hover:text-slate-300 text-xs transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          // First, check if there's an existing running job
                          const existingProgress = await fetchIndexingProgress();
                          
                          if (existingProgress && existingProgress.status === "running") {
                            // Job already running, progress will be shown automatically
                            return;
                          }
                          
                          // No running job, proceed with cost estimation
                          const estimate = await estimateCost();
                          if (estimate) {
                            setCostEstimate(estimate);
                            setShowCostEstimate(true);
                          } else {
                            // If estimation fails, start directly
                            await startIndexing();
                          }
                        }}
                        disabled={indexingStatus === "estimating" || indexingStatus === "indexing"}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          indexingStatus === "estimating" || indexingStatus === "indexing"
                            ? "bg-amber-500/20 text-amber-300 animate-pulse cursor-wait"
                            : "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30"
                        }`}
                      >
                        <span className={indexingStatus === "estimating" || indexingStatus === "indexing" ? "animate-spin" : ""}>
                          {indexingStatus === "estimating" || indexingStatus === "indexing" ? "⏳" : "🚀"}
                        </span>
                        <span>
                          {indexingStatus === "estimating" ? "Starting..." : indexingStatus === "indexing" ? "Indexing..." : "Index Your Chat History"}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
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

            {/* Source Breakdown: Cursor: # conversations | # messages | Claude Code: # conversations | # messages */}
            {sourceBreakdown && 
              ((sourceBreakdown.cursor.conversations > 0 || sourceBreakdown.cursor.messages > 0) ||
               (sourceBreakdown.claudeCode.conversations > 0 || sourceBreakdown.claudeCode.messages > 0)) && (
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
          {lennyStats.indexed && lennyStats.episodeCount > 0 ? (
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

