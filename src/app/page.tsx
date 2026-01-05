"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { RunHistory } from "@/components/RunHistory";
import { ScoreboardHeader } from "@/components/ScoreboardHeader";
import { AnalysisCoverage } from "@/components/AnalysisCoverage";
import { ViewToggle, ViewMode } from "@/components/ViewToggle";
import { LibraryView } from "@/components/LibraryView";
import { loadThemesAsync } from "@/lib/themes";
import { saveRunToHistory } from "@/lib/runHistory";

export default function Home() {
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
  const estimateCost = useCallback((itemCount: number): number => {
    // v2: Single generation call + embeddings + ranking call
    const generationCost = 0.015; // ~15k tokens for generation
    const embeddingCost = itemCount * 0.0001; // ~100 tokens per item embedding
    const rankingCost = 0.003; // Ranking call
    return generationCost + embeddingCost + rankingCost;
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
      }
      
      // Save to run history
      if (data.success) {
        saveRunToHistory(data);
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
            candidatesGenerated: 0,
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

  return (
    <main id="main-content" className="min-h-screen p-8">
      {/* Background gradient */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-adobe-gray-900 via-adobe-gray-800 to-adobe-gray-900" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-inspiration-ideas/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-inspiration-insights/10 rounded-full blur-3xl" />
      </div>

      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-inspiration-ideas focus:text-white focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-inspiration-ideas focus:ring-offset-2 focus:ring-offset-adobe-gray-900"
      >
        Skip to main content
      </a>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="text-center space-y-3 pt-6 relative">
          {/* Settings & Logout - Top Right */}
          <div className="absolute right-0 top-6 flex items-center gap-2">
            <a 
              href="/settings" 
              className="p-2 text-slate-400 hover:text-amber-400 transition-colors"
              title="Settings"
              aria-label="Open settings"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </a>
            <LogoutButton />
          </div>
          
          <h1 className="text-4xl font-bold gradient-text mt-8">Inspiration</h1>
          <p className="text-adobe-gray-400 text-base">
            Turn your Cursor conversations into ideas and insights
          </p>
        </header>
        
        {/* v3: Scoreboard Header - Always Visible */}
        <ScoreboardHeader
          onSyncClick={handleSync}
          isSyncing={isSyncing}
          syncStatus={syncStatus}
        />

        {/* View Toggle */}
        <ViewToggle currentView={viewMode} onViewChange={setViewMode} />

        {/* Conditional Layout based on View Mode */}
        {viewMode === "library" ? (
          /* Library View - Full width, focused on exploring items */
          <LibraryView />
        ) : (
          /* Comprehensive View - Two-Panel Layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT PANEL: Library */}
            <aside className="lg:col-span-5 xl:col-span-4 order-2 lg:order-1">
              <div className="lg:sticky lg:top-6 space-y-4">
                <div id="library-section">
                  <BanksOverview />
                </div>
              </div>
            </aside>

            {/* RIGHT PANEL: Generate/Seek Actions */}
            <main className="lg:col-span-7 xl:col-span-8 order-1 lg:order-2 space-y-6">
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
                    estimatedCost={estimateCost(getCurrentItemCount())}
                  />
                </section>

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

                {/* Run History */}
                <RunHistory />
              </>
            )}
          </main>
        </div>
        )}
      </div>
    </main>
  );
}
