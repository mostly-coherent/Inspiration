"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ToolType,
  PresetMode,
  GenerateResult,
  PRESET_MODES,
  TOOL_CONFIG,
  SeekResult,
  ThemeType,
  ModeType,
} from "@/lib/types";
import { BanksOverview } from "@/components/BanksOverview";
import { ResultsPanel } from "@/components/ResultsPanel";
import { SeekSection } from "@/components/SeekSection";
import { ProgressPanel } from "@/components/ProgressPanel";
import { ModeCard } from "@/components/ModeCard";
import { AdvancedSettings } from "@/components/AdvancedSettings";
import { ExpectedOutput } from "@/components/ExpectedOutput";
import { LogoutButton } from "@/components/LogoutButton";
import { SimpleModeSelector } from "@/components/SimpleModeSelector";
import { ScoreboardHeader } from "@/components/ScoreboardHeader";
import { AnalysisCoverage } from "@/components/AnalysisCoverage";
import { ViewToggle, ViewMode } from "@/components/ViewToggle";
import { LibraryView } from "@/components/LibraryView";
import { CoverageSuggestions, SuggestedRun } from "@/components/CoverageSuggestions";
import { loadThemesAsync } from "@/lib/themes";

export default function Home() {
  const router = useRouter();
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);

  // Check if user has completed onboarding
  useEffect(() => {
    const checkSetup = async () => {
      try {
        // First check if environment variables are configured
        const envRes = await fetch("/api/config/env");
        const envData = await envRes.json();
        
        if (!envData.allRequired) {
          // Missing required API keys → redirect to onboarding
          router.push("/onboarding");
          return;
        }
        
        // Then check if setup is complete
        const configRes = await fetch("/api/config");
        const configData = await configRes.json();
        
        if (!configData.success || !configData.config?.setupComplete) {
          // Setup not complete → redirect to onboarding
          router.push("/onboarding");
          return;
        }
        
        // All good, show the app
        setIsCheckingSetup(false);
      } catch (e) {
        console.error("Failed to check setup:", e);
        // On error, still show the app (might be first load)
        setIsCheckingSetup(false);
      }
    };
    
    checkSetup();
  }, [router]);

  // View mode state (Library View vs Comprehensive View)
  const [viewMode, setViewMode] = useState<ViewMode>("comprehensive");
  
  // State - simplified mode system (theme auto-determined from mode)
  const [selectedModeId, setSelectedModeId] = useState<ModeType>("idea");
  const [selectedTheme, setSelectedTheme] = useState<ThemeType>("generation"); // Auto-determined from mode
  const [selectedMode, setSelectedMode] = useState<PresetMode>("sprint");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  
  // Seek state - derived from selected mode
  const [showSeek, setShowSeek] = useState(false);
  
  // Sync showSeek with selectedModeId (use_case mode = seek theme)
  useEffect(() => {
    setShowSeek(selectedModeId === "use_case");
  }, [selectedModeId]);
  const [reverseQuery, setReverseQuery] = useState("");
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekResult, setSeekResult] = useState<SeekResult | null>(null);
  const [reverseDaysBack, setReverseDaysBack] = useState(90);
  const [reverseTopK, setReverseTopK] = useState(10);
  const [reverseMinSimilarity, setReverseMinSimilarity] = useState(0.0);
  const seekAbortController = useRef<AbortController | null>(null);
  
  // Load seek defaults from config on mount
  useEffect(() => {
    const loadSeekDefaults = async () => {
      try {
        const res = await fetch("/api/config");
        const data = await res.json();
        if (data.success && data.config?.seekDefaults) {
          const { daysBack, topK, minSimilarity } = data.config.seekDefaults;
          if (daysBack !== undefined) setReverseDaysBack(daysBack);
          if (topK !== undefined) setReverseTopK(topK);
          if (minSimilarity !== undefined) setReverseMinSimilarity(minSimilarity);
        }
      } catch (err) {
        console.error("Failed to load seek defaults:", err);
      }
    };
    loadSeekDefaults();
  }, []);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  
  // Library delta tracking (v3)
  const [libraryCountBefore, setLibraryCountBefore] = useState<number | null>(null);
  const [libraryCountAfter, setLibraryCountAfter] = useState<number | null>(null);
  
  // Analysis coverage state (v3)
  const [analysisCoverage, setAnalysisCoverage] = useState<{
    conversationsAnalyzed?: number;
    messagesAnalyzed?: number;
    actualFromDate?: string;
    actualToDate?: string;
    workspaces?: number;
  } | null>(null);

  // Coverage Intelligence state (v5)
  const [coverageStats, setCoverageStats] = useState<{
    coverageScore: number;
    gapCounts: { high: number; medium: number; low: number };
    totalGaps: number;
  } | null>(null);
  const [suggestedRuns, setSuggestedRuns] = useState<SuggestedRun[]>([]);

  // Progress tracking
  const [progress, setProgress] = useState(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [progressPhase, setProgressPhase] = useState<string>("");
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const abortController = useRef<AbortController | null>(null);

  // Advanced settings
  const [customDays, setCustomDays] = useState<number>(14);
  const [customItemCount, setCustomItemCount] = useState<number>(10);
  const [customTemperature, setCustomTemperature] = useState<number>(0.4);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [useCustomDates, setUseCustomDates] = useState(false);

  const currentModeConfig = useMemo(
    () => PRESET_MODES.find((m) => m.id === selectedMode),
    [selectedMode]
  );
  
  // Get mode config from themes.json
  const [modeConfig, setModeConfig] = useState<{ name: string; icon: string; color: string } | null>(null);
  
  useEffect(() => {
    // Auto-determine theme from mode if needed
    const determineTheme = async () => {
      // Load themes to find which theme contains the selected mode
      const themesConfig = await loadThemesAsync();
      for (const theme of themesConfig.themes) {
        const mode = theme.modes.find(m => m.id === selectedModeId);
        if (mode) {
          setSelectedTheme(theme.id as ThemeType);
          setModeConfig({
            name: mode.name,
            icon: mode.icon,
            color: mode.color,
          });
          return;
        }
      }
    };
    
    determineTheme();
  }, [selectedModeId]);
  
  // Backward compatibility: derive tool from mode for display
  const displayTool: ToolType = selectedModeId === "idea" ? "ideas" : "insights";
  const toolConfig = TOOL_CONFIG[displayTool];

  // v2: Estimate time for item-centric architecture (memoized)
  const estimateTime = useCallback((itemCount: number): number => {
    // v2: Single LLM call + batch embeddings + dedup + ranking
    // Base: 20s for LLM call, +2s per item for processing
    return 20 + itemCount * 2 + 15;
  }, []);

  // v2: Estimate LLM cost for item-centric architecture (memoized)
  // Claude Sonnet 4: $3/M input, $15/M output
  // OpenAI text-embedding-3-small: $0.02/M tokens
  const estimateCost = useCallback((itemCount: number, days?: number): number => {
    // More days = more chat history tokens to process
    const daysToUse = days ?? 14;
    const avgMessagesPerDay = 50; // Estimate based on typical usage
    const avgTokensPerMessage = 200;
    const inputTokens = daysToUse * avgMessagesPerDay * avgTokensPerMessage;
    
    // Claude Sonnet 4 pricing: $3/M input, $15/M output
    const inputCost = (inputTokens / 1_000_000) * 3;
    const outputTokens = itemCount * 500; // ~500 tokens per item
    const outputCost = (outputTokens / 1_000_000) * 15;
    
    // Embedding cost (OpenAI): $0.02/M tokens
    const embeddingTokens = itemCount * 100;
    const embeddingCost = (embeddingTokens / 1_000_000) * 0.02;
    
    return inputCost + outputCost + embeddingCost;
  }, []);

  // v2: Get current itemCount value (memoized)
  const getCurrentItemCount = useCallback((): number => {
    if (showAdvanced) return customItemCount;
    return currentModeConfig?.itemCount ?? 10;
  }, [showAdvanced, customItemCount, currentModeConfig]);

  // Helper to calculate days from date range (memoized)
  // Note: 90-day limit removed in v1 - Vector DB enables unlimited date ranges
  const calculateDateRangeDays = useCallback((from: string, to: string): number => {
    if (!from || !to) return 0;
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diffTime = Math.abs(toDate.getTime() - fromDate.getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return days;
  }, []);


  // Sync brain with local Cursor history
  const handleSync = useCallback(async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    setSyncStatus("Syncing...");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      
      if (data.success) {
        if (data.stats) {
          const { indexed = 0, skipped = 0, failed = 0 } = data.stats;
          if (indexed > 0) {
            const statusMsg = skipped > 0 
              ? `✓ Synced ${indexed} new (${skipped} already indexed)`
              : `✓ Synced ${indexed} new`;
            setSyncStatus(statusMsg);
          } else if (skipped > 0) {
            setSyncStatus(`✓ Up to date (${skipped} indexed)`);
          } else {
            setSyncStatus("✓ Up to date");
          }
          if (failed > 0) {
            console.warn(`${failed} messages failed to sync`);
          }
        } else {
          setSyncStatus("✓ Up to date");
        }
        // Note: ScoreboardHeader will auto-refresh when syncStatus changes
        // Clear success status after 5 seconds
        setTimeout(() => {
          setSyncStatus((prev) => {
            // Only clear if it's still a success message (not changed to error/cloud mode)
            if (prev && prev.startsWith("✓")) {
              return null;
            }
            return prev;
          });
        }, 5000);
      } else {
        // Handle cloud environment limitation gracefully
        if (data.error && (data.error.includes("Cannot sync from cloud") || data.error.includes("cloud environment"))) {
          setSyncStatus("☁️ Cloud Mode (Read-only)");
          // Don't clear this status - keep it visible permanently
        } else {
          setSyncStatus("⚠️ Sync failed");
          console.error("Sync failed:", data.error);
          // Clear error status after 5 seconds
          setTimeout(() => {
            setSyncStatus((prev) => prev === "⚠️ Sync failed" ? null : prev);
          }, 5000);
        }
      }
    } catch (e) {
      console.error("Sync error:", e);
      setSyncStatus("⚠️ Connection error");
      setTimeout(() => {
        setSyncStatus((prev) => prev === "⚠️ Connection error" ? null : prev);
      }, 5000);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // Auto-sync on mount
  // Note: Only works when running locally (not on Vercel)
  // On Vercel, it will gracefully show "Cloud Mode (Read-only)" status
  useEffect(() => {
    // Auto-sync on first load (only works locally)
    // ScoreboardHeader will fetch stats on its own
    handleSync().catch((error) => {
      console.error("Auto-sync failed:", error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount - handleSync is stable

  // Fetch coverage analysis (v5)
  const fetchCoverageAnalysis = useCallback(async () => {
    try {
      const res = await fetch("/api/coverage/analyze");
      const data = await res.json();
      if (data.success) {
        setCoverageStats({
          coverageScore: data.coverageScore,
          gapCounts: data.gapCounts,
          totalGaps: (data.gapCounts?.high || 0) + (data.gapCounts?.medium || 0) + (data.gapCounts?.low || 0),
        });
        setSuggestedRuns(data.suggestedRuns || []);
      }
    } catch (e) {
      console.error("Failed to fetch coverage analysis:", e);
    }
  }, []);

  // Fetch coverage on mount and after generation
  useEffect(() => {
    fetchCoverageAnalysis();
  }, [fetchCoverageAnalysis]);

  // Handle running a suggested coverage run
  const handleRunSuggestion = async (run: SuggestedRun) => {
    // Set mode based on item type
    const newModeId = run.itemType === "idea" ? "idea" : "insight";
    setSelectedModeId(newModeId as ModeType);
    setSelectedTheme("generation");
    
    // Enable advanced mode with custom dates
    setShowAdvanced(true);
    setUseCustomDates(true);
    setFromDate(run.startDate);
    setToDate(run.endDate);
    setCustomItemCount(run.expectedItems);
    
    // Small delay to let state update, then trigger generation
    setTimeout(() => {
      // Trigger generation (the state is already set)
      handleGenerateWithParams({
        theme: "generation",
        modeId: newModeId,
        fromDate: run.startDate,
        toDate: run.endDate,
        itemCount: run.expectedItems,
      });
    }, 100);
  };

  // Generate with explicit params (for suggested runs)
  const handleGenerateWithParams = async (params: {
    theme: string;
    modeId: string;
    fromDate: string;
    toDate: string;
    itemCount: number;
  }) => {
    setIsGenerating(true);
    setResult(null);
    setProgress(0);
    setElapsedSeconds(0);
    setAnalysisCoverage(null);
    setLibraryCountBefore(null);
    setLibraryCountAfter(null);
    
    // v3: Fetch library count before generation
    try {
      const libRes = await fetch("/api/items?view=items");
      const libData = await libRes.json();
      if (libData.success) {
        setLibraryCountBefore(libData.stats?.totalItems || 0);
      }
    } catch (e) {
      console.error("Failed to fetch library count before:", e);
    }
    
    // Create new AbortController for this request
    abortController.current = new AbortController();
    
    const totalEstimate = estimateTime(params.itemCount);
    setEstimatedSeconds(totalEstimate);

    // Start progress simulation
    const startTime = Date.now();
    progressInterval.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);
      
      const rawProgress = Math.min((elapsed / totalEstimate) * 100, 95);
      setProgress(rawProgress);
      
      if (rawProgress < 10) {
        setProgressPhase("Reading chat history...");
      } else if (rawProgress < 30) {
        setProgressPhase("Analyzing conversations...");
      } else if (rawProgress < 60) {
        setProgressPhase(`Generating ${params.itemCount} items...`);
      } else if (rawProgress < 75) {
        setProgressPhase("Deduplicating items...");
      } else if (rawProgress < 90) {
        setProgressPhase("Ranking items...");
      } else {
        setProgressPhase("Harmonizing to library...");
      }
    }, 500);

    try {
      const body = {
        theme: params.theme,
        modeId: params.modeId,
        mode: "custom",
        fromDate: params.fromDate,
        toDate: params.toDate,
        itemCount: params.itemCount,
      };

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortController.current.signal,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }
      
      setProgress(100);
      setProgressPhase("Complete!");
      setResult(data);
      
      // v3: Update analysis coverage from result
      if (data.success && data.stats) {
        setAnalysisCoverage({
          conversationsAnalyzed: data.stats.conversationsAnalyzed,
          workspaces: 3,
        });
        
        // Fetch library count after generation
        try {
          const libRes = await fetch("/api/items?view=items");
          const libData = await libRes.json();
          if (libData.success) {
            setLibraryCountAfter(libData.stats?.totalItems || 0);
          }
        } catch (e) {
          console.error("Failed to fetch library count after:", e);
        }
        
        // Refresh coverage analysis after successful generation
        fetchCoverageAnalysis();
      }
      
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setProgressPhase("Stopped");
      } else {
        setResult({
          success: false,
          tool: params.modeId === "idea" ? "ideas" : "insights",
          mode: "custom",
          error: error instanceof Error ? error.message : "Unknown error",
          stats: {
            daysProcessed: 0,
            daysWithActivity: 0,
            daysWithOutput: 0,
            itemsGenerated: 0,
            itemsAfterDedup: 0,
            itemsReturned: 0,
          },
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      abortController.current = null;
      setIsGenerating(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResult(null);
    setProgress(0);
    setElapsedSeconds(0);
    setAnalysisCoverage(null);
    setLibraryCountBefore(null);
    setLibraryCountAfter(null);
    
    // v3: Fetch library count before generation
    try {
      const libRes = await fetch("/api/items?view=items");
      const libData = await libRes.json();
      if (libData.success) {
        setLibraryCountBefore(libData.stats?.totalItems || 0);
      }
    } catch (e) {
      console.error("Failed to fetch library count before:", e);
    }
    
    // Create new AbortController for this request
    abortController.current = new AbortController();
    
    const itemCount = getCurrentItemCount();
    const totalEstimate = estimateTime(itemCount);
    setEstimatedSeconds(totalEstimate);

    // Start progress simulation (v2: Item-centric phases)
    const startTime = Date.now();
    progressInterval.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);
      
      // Calculate progress (cap at 95% until complete)
      const rawProgress = Math.min((elapsed / totalEstimate) * 100, 95);
      setProgress(rawProgress);
      
      // v2: Update phase based on progress (item-centric flow)
      if (rawProgress < 10) {
        setProgressPhase("Reading chat history...");
      } else if (rawProgress < 30) {
        setProgressPhase("Analyzing conversations...");
      } else if (rawProgress < 60) {
        setProgressPhase(`Generating ${itemCount} items...`);
      } else if (rawProgress < 75) {
        setProgressPhase("Deduplicating items...");
      } else if (rawProgress < 90) {
        setProgressPhase("Ranking items...");
      } else {
        setProgressPhase("Harmonizing to bank...");
      }
    }, 500);

    try {
      const body: Record<string, unknown> = {
        theme: selectedTheme,
        modeId: selectedModeId,
        mode: showAdvanced ? "custom" : selectedMode,
      };

      if (showAdvanced) {
        if (useCustomDates && fromDate && toDate) {
          body.fromDate = fromDate;
          body.toDate = toDate;
        } else {
          body.days = customDays;
        }
        body.itemCount = customItemCount;
        body.temperature = customTemperature;
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortController.current.signal,
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("Invalid JSON response from server");
      }
      
      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }
      
      setProgress(100);
      setProgressPhase("Complete!");
      setResult(data);
      
      // v3: Update analysis coverage from result
      if (data.success && data.stats) {
        setAnalysisCoverage({
          conversationsAnalyzed: data.stats.conversationsAnalyzed,
          workspaces: 3, // TODO: Get actual workspace count from API
        });
        
        // v3: Fetch library count after generation
        try {
          const libRes = await fetch("/api/items?view=items");
          const libData = await libRes.json();
          if (libData.success) {
            setLibraryCountAfter(libData.stats?.totalItems || 0);
          }
        } catch (e) {
          console.error("Failed to fetch library count after:", e);
        }
        
        // v5: Refresh coverage analysis after successful generation
        fetchCoverageAnalysis();
      }
      
    } catch (error) {
      // Check if this was an abort
      if (error instanceof Error && error.name === "AbortError") {
        setProgressPhase("Stopped");
        // Don't set an error result for user-initiated stops
      } else {
        setResult({
          success: false,
          tool: displayTool,
          mode: selectedMode,
          error: error instanceof Error ? error.message : "Unknown error",
          stats: {
            daysProcessed: 0,
            daysWithActivity: 0,
            daysWithOutput: 0,
            itemsGenerated: 0,
            itemsAfterDedup: 0,
            itemsReturned: 0,
          },
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      abortController.current = null;
      setIsGenerating(false);
    }
  };

  const handleStop = () => {
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null; // Clear after abort
    }
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    setProgressPhase("Stopping...");
  };

  // Cleanup interval on unmount and when generation stops
  useEffect(() => {
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      if (abortController.current) {
        abortController.current.abort();
        abortController.current = null;
      }
      if (seekAbortController.current) {
        seekAbortController.current.abort();
        seekAbortController.current = null;
      }
    };
  }, []);

  // Show loading state while checking setup
  if (isCheckingSetup) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen p-6 md:p-8">
      {/* Background gradient */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-500 focus:text-white focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950"
      >
        Skip to main content
      </a>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Minimal Header */}
        <header className="flex items-center justify-between pt-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✨</span>
            <h1 className="text-2xl font-bold text-white">Inspiration</h1>
          </div>
          <div className="flex items-center gap-2">
            <a 
              href="/coverage" 
              className="p-2 text-slate-400 hover:text-emerald-400 transition-colors"
              title="Coverage Intelligence"
              aria-label="Open coverage intelligence"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </a>
            <a 
              href="/settings" 
              className="p-2 text-slate-400 hover:text-amber-400 transition-colors"
              title="Settings"
              aria-label="Open settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </a>
            <LogoutButton />
          </div>
        </header>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* HERO: Theme Explorer — The Forest View */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600/20 via-purple-600/10 to-slate-900/50 border border-indigo-500/20 p-8 md:p-10">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-3">
                <span className="text-4xl">🔭</span>
                <h2 className="text-3xl md:text-4xl font-bold text-white">Theme Explorer</h2>
              </div>
              <p className="text-lg text-slate-300 max-w-lg">
                See your own thinking from 10,000 feet. Discover the <strong className="text-indigo-300">forests</strong>, not just the trees.
              </p>
              <p className="text-sm text-slate-400 mt-2">
                For pattern seekers: AI synthesis reveals recurring themes you didn't notice—ideas worth building, insights worth sharing.
              </p>
            </div>
            
            <a
              href="/themes"
              className="group flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-lg rounded-2xl shadow-xl shadow-indigo-500/25 transition-all hover:scale-105 hover:shadow-indigo-500/40"
            >
              <span>Explore Themes</span>
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* MEMORY & LIBRARY — Side by Side Stats */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <ScoreboardHeader
          onSyncClick={handleSync}
          isSyncing={isSyncing}
          syncStatus={syncStatus}
          coverageStats={coverageStats}
        />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* COVERAGE SUGGESTIONS — Quick run recommendations */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {suggestedRuns.length > 0 && !isGenerating && (
          <div className="glass-card p-5">
            <CoverageSuggestions
              suggestedRuns={suggestedRuns}
              onRunSuggestion={handleRunSuggestion}
              isGenerating={isGenerating}
              maxDisplay={6}
            />
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* VIEW MODE: Library Browse vs Generate New */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <ViewToggle currentView={viewMode} onViewChange={setViewMode} />

        {/* Conditional Layout based on View Mode */}
        {viewMode === "library" ? (
          /* Library View - Full width, focused on exploring items */
          <LibraryView />
        ) : (
          /* Comprehensive View - Generate-focused Layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT PANEL: Generate Actions (Primary) */}
            <main className="lg:col-span-8 space-y-6">
            {/* Mode Selection */}
            <section className="glass-card p-5 space-y-4">
              <h2 className="text-lg font-medium text-adobe-gray-300">
                What do you want to do?
              </h2>
              
              <SimpleModeSelector
                selectedModeId={selectedModeId}
                onModeChange={(modeId, themeId) => {
                  setSelectedModeId(modeId as ModeType);
                  setSelectedTheme(themeId as ThemeType);
                }}
              />
            </section>

            {showSeek ? (
              /* Seek Section */
              <SeekSection
                showSeek={showSeek}
                setShowSeek={setShowSeek}
                query={reverseQuery}
                setQuery={setReverseQuery}
                daysBack={reverseDaysBack}
                setDaysBack={setReverseDaysBack}
                topK={reverseTopK}
                setTopK={setReverseTopK}
                minSimilarity={reverseMinSimilarity}
                setMinSimilarity={setReverseMinSimilarity}
                isSeeking={isSeeking}
                setIsSeeking={setIsSeeking}
                result={seekResult}
                setResult={setSeekResult}
                abortController={seekAbortController}
              />
            ) : (
              <>
                {/* Time Period & Settings Section */}
                <section className="glass-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-medium text-adobe-gray-300">
                      Time period & depth
                    </h2>
                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="text-sm text-inspiration-ideas hover:text-inspiration-ideas/80 transition-colors"
                    >
                      {showAdvanced ? "← Presets" : "Advanced →"}
                    </button>
                  </div>

                  {!showAdvanced ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {PRESET_MODES.map((mode) => (
                        <ModeCard
                          key={mode.id}
                          mode={mode}
                          isSelected={selectedMode === mode.id}
                          onClick={() => setSelectedMode(mode.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <AdvancedSettings
                      customDays={customDays}
                      setCustomDays={setCustomDays}
                      customItemCount={customItemCount}
                      setCustomItemCount={setCustomItemCount}
                      customTemperature={customTemperature}
                      setCustomTemperature={setCustomTemperature}
                      fromDate={fromDate}
                      setFromDate={setFromDate}
                      toDate={toDate}
                      setToDate={setToDate}
                      useCustomDates={useCustomDates}
                      setUseCustomDates={setUseCustomDates}
                    />
                  )}

                  {/* Expected output summary - integrated */}
                  <ExpectedOutput
                    tool={displayTool}
                    days={showAdvanced ? (useCustomDates ? calculateDateRangeDays(fromDate, toDate) : customDays) : (currentModeConfig?.days ?? 14)}
                    hours={!showAdvanced ? currentModeConfig?.hours : undefined}
                    itemCount={getCurrentItemCount()}
                    temperature={showAdvanced ? customTemperature : (currentModeConfig?.temperature ?? 0.4)}
                    estimatedCost={estimateCost(
                      getCurrentItemCount(),
                      showAdvanced 
                        ? (useCustomDates ? calculateDateRangeDays(fromDate, toDate) : customDays) 
                        : (currentModeConfig?.days ?? 14)
                    )}
                  />
                </section>

                {/* Cost Warning */}
                {(() => {
                  const currentCost = estimateCost(
                    getCurrentItemCount(),
                    showAdvanced 
                      ? (useCustomDates ? calculateDateRangeDays(fromDate, toDate) : customDays) 
                      : (currentModeConfig?.days ?? 14)
                  );
                  const COST_WARNING_THRESHOLD = 0.50;
                  if (currentCost > COST_WARNING_THRESHOLD) {
                    return (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-3">
                        <span className="text-xl">⚠️</span>
                        <div className="text-sm text-amber-300">
                          <strong>High cost operation:</strong> This will cost approximately <strong>${currentCost.toFixed(2)}</strong>.
                          Consider reducing the time range or item count.
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Generate Button & Progress */}
                <div className="space-y-4">
                  {isGenerating ? (
                    <ProgressPanel
                      progress={progress}
                      phase={progressPhase}
                      elapsedSeconds={elapsedSeconds}
                      estimatedSeconds={estimatedSeconds}
                      tool={toolConfig.label}
                      onStop={handleStop}
                    />
                  ) : (
                    <div className="flex justify-center">
                      <button
                        onClick={handleGenerate}
                        className="btn-primary text-xl px-12 py-4 font-semibold shadow-lg shadow-inspiration-ideas/20 hover:shadow-inspiration-ideas/30 transition-all"
                        aria-busy={isGenerating}
                        aria-live="polite"
                      >
                        <span className="flex items-center gap-3">
                          <span className="text-2xl">{modeConfig?.icon || toolConfig.icon}</span>
                          Generate {modeConfig?.name || toolConfig.label}
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {/* v3: Analysis Coverage - Shows after generation */}
                {(result?.success || analysisCoverage) && (
                  <AnalysisCoverage
                    plannedDays={showAdvanced ? (useCustomDates ? undefined : customDays) : currentModeConfig?.days}
                    plannedHours={!showAdvanced ? currentModeConfig?.hours : undefined}
                    plannedFromDate={useCustomDates ? fromDate : undefined}
                    plannedToDate={useCustomDates ? toDate : undefined}
                    conversationsAnalyzed={result?.stats?.conversationsAnalyzed || analysisCoverage?.conversationsAnalyzed}
                    workspaces={analysisCoverage?.workspaces}
                    isComplete={result?.success}
                    itemsGenerated={result?.stats?.itemsGenerated}
                    itemsAfterDedup={result?.stats?.itemsAfterDedup}
                    itemsNew={result?.stats?.harmonization?.itemsAdded}
                    itemsUpdated={result?.stats?.harmonization?.itemsUpdated}
                    libraryBefore={libraryCountBefore ?? undefined}
                    libraryAfter={libraryCountAfter ?? undefined}
                  />
                )}

                {/* Results */}
                {result && <ResultsPanel result={result} onRetry={handleGenerate} />}
              </>
            )}
          </main>

            {/* RIGHT PANEL: Library Preview (Compact) */}
            <aside className="lg:col-span-4">
              <div className="lg:sticky lg:top-6">
                <div id="library-section" className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📚</span>
                      <h3 className="text-sm font-semibold text-slate-300">Library Preview</h3>
                    </div>
                    <button
                      onClick={() => setViewMode("library")}
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Full View →
                    </button>
                  </div>
                  <BanksOverview compact />
                </div>
              </div>
            </aside>
        </div>
        )}
      </div>
    </main>
  );
}
