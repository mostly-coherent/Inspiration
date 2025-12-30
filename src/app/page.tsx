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
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { getModeAsync, loadThemesAsync } from "@/lib/themes";
import { saveRunToHistory } from "@/lib/runHistory";

export default function Home() {
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
  
  // Brain stats
  const [brainStats, setBrainStats] = useState<{
    localSize: string | null;
    vectorSize: string | null;
  }>({ localSize: null, vectorSize: null });

  // Progress tracking
  const [progress, setProgress] = useState(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [progressPhase, setProgressPhase] = useState<string>("");
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const abortController = useRef<AbortController | null>(null);

  // Advanced settings
  const [customDays, setCustomDays] = useState<number>(14);
  const [customBestOf, setCustomBestOf] = useState<number>(5);
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

  // Estimate generation time based on candidates (memoized to avoid recreation)
  const estimateTime = useCallback((bestOf: number): number => {
    // ~20 seconds per candidate + 15 seconds for judging + 10 seconds overhead
    return bestOf * 20 + 15 + 10;
  }, []);

  // Estimate LLM cost based on candidates (memoized to avoid recreation)
  // Claude Sonnet 4: $3/M input, $15/M output
  // Per candidate: ~4K input + ~750 output = ~$0.023
  // Judge: ~6K input + ~500 output = ~$0.025
  const estimateCost = useCallback((bestOf: number): number => {
    const costPerCandidate = 0.023;
    const judgeCost = 0.025;
    return bestOf * costPerCandidate + judgeCost;
  }, []);

  // Get current bestOf value (memoized)
  const getCurrentBestOf = useCallback((): number => {
    if (showAdvanced) return customBestOf;
    return currentModeConfig?.bestOf ?? 5;
  }, [showAdvanced, customBestOf, currentModeConfig]);

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

  // Fetch brain stats
  const fetchBrainStats = useCallback(async () => {
    try {
      const res = await fetch("/api/brain-stats");
      const data = await res.json();
      
      if (data.success) {
        setBrainStats({
          localSize: data.localSize,
          vectorSize: data.vectorSize,
        });
      }
    } catch (e) {
      console.error("Failed to fetch brain stats:", e);
    }
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
              ? `✓ Synced ${indexed} new items (${skipped} already indexed)`
              : `✓ Synced ${indexed} new items`;
            setSyncStatus(statusMsg);
          } else if (skipped > 0) {
            setSyncStatus(`✓ Brain up to date (${skipped} already indexed)`);
          } else {
            setSyncStatus("✓ Brain up to date");
          }
          if (failed > 0) {
            console.warn(`${failed} messages failed to sync`);
          }
        } else {
          setSyncStatus("✓ Brain up to date");
        }
        // Refresh brain stats after sync
        await fetchBrainStats();
      } else {
        // Handle cloud environment limitation gracefully
        if (data.error && data.error.includes("Cannot sync from cloud")) {
          setSyncStatus("☁️ Cloud Mode (Read-only)");
        } else {
          setSyncStatus("⚠️ Sync failed");
          console.error("Sync failed:", data.error);
        }
      }
    } catch (e) {
      console.error("Sync error:", e);
      setSyncStatus("⚠️ Connection error");
    } finally {
      setIsSyncing(false);
      // Clear status after 5 seconds
      setTimeout(() => setSyncStatus(null), 5000);
    }
  }, [isSyncing, fetchBrainStats]);

  // Auto-sync on mount and fetch brain stats
  // Note: Only works when running locally (not on Vercel)
  // On Vercel, it will gracefully show "Cloud Mode (Read-only)" status
  useEffect(() => {
    fetchBrainStats();
    // Auto-sync on first load (only works locally)
    handleSync().catch((error) => {
      console.error("Auto-sync failed:", error);
      // Don't show error if it's just cloud mode - that's expected
      if (!error?.message?.includes("cloud")) {
        setSyncStatus("Sync failed. Click 'Refresh Brain' to retry.");
      }
    });
  }, []); // Run once on mount

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResult(null);
    setProgress(0);
    setElapsedSeconds(0);
    
    // Create new AbortController for this request
    abortController.current = new AbortController();
    
    const bestOf = getCurrentBestOf();
    const totalEstimate = estimateTime(bestOf);
    setEstimatedSeconds(totalEstimate);

    // Start progress simulation
    const startTime = Date.now();
    progressInterval.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);
      
      // Calculate progress (cap at 95% until complete)
      const rawProgress = Math.min((elapsed / totalEstimate) * 100, 95);
      setProgress(rawProgress);
      
      // Update phase based on progress
      if (rawProgress < 10) {
        setProgressPhase("Reading chat history...");
      } else if (rawProgress < 30) {
        setProgressPhase("Analyzing conversations...");
      } else if (rawProgress < 80) {
        const candidateNum = Math.min(Math.floor((rawProgress - 30) / (50 / bestOf)) + 1, bestOf);
        setProgressPhase(`Generating candidate ${candidateNum} of ${bestOf}...`);
      } else {
        setProgressPhase("Judging candidates...");
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
        body.bestOf = customBestOf;
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
      } catch (jsonError) {
        throw new Error("Invalid JSON response from server");
      }
      
      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }
      
      setProgress(100);
      setProgressPhase("Complete!");
      setResult(data);
      
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
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="text-center space-y-4 pt-8 relative">
          <div className="absolute right-0 top-8 flex items-center gap-2">
            {/* Sync Status / Refresh Button with Brain Size */}
            <div className="flex items-center gap-2">
              {/* Brain Size Display */}
              {(brainStats.localSize || brainStats.vectorSize) && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-white/5 text-slate-400">
                  <span className="text-slate-500">🧠</span>
                  {brainStats.localSize && (
                    <span className="text-slate-300">{brainStats.localSize}</span>
                  )}
                  {brainStats.localSize && brainStats.vectorSize && (
                    <span className="text-slate-500">/</span>
                  )}
                  {brainStats.vectorSize && (
                    <span className="text-slate-300">{brainStats.vectorSize}</span>
                  )}
                </div>
              )}
              
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  isSyncing 
                    ? "bg-amber-500/20 text-amber-300 animate-pulse cursor-wait" 
                    : syncStatus === "☁️ Cloud Mode (Read-only)"
                      ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                      : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                }`}
                title={syncStatus === "☁️ Cloud Mode (Read-only)" ? "Running in cloud. Cannot sync from local disk." : "Refresh Brain with latest Cursor history"}
              >
                <span className={`text-base ${isSyncing ? "animate-spin" : ""}`}>
                  {syncStatus === "☁️ Cloud Mode (Read-only)" ? "☁️" : "🔄"}
                </span>
                {syncStatus || "Refresh Brain"}
              </button>
            </div>

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
          <h1 className="text-5xl font-bold gradient-text">Inspiration</h1>
          <p className="text-adobe-gray-400 text-lg">
            Turn your Cursor conversations into ideas and insights
          </p>
        </header>

        {/* Mode Selection - Always Visible */}
        <section className="glass-card p-6 space-y-6">
          <div className="space-y-4">
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
          </div>
        </section>

        {showSeek ? null : (
          <>
        {/* Time Period & Settings Section */}
        <section className="glass-card p-6 space-y-6">

          {/* Time Period & Settings */}
          <div className="space-y-4 pt-4 border-t border-white/10">
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
              <div className="grid grid-cols-4 gap-4">
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
                customBestOf={customBestOf}
                setCustomBestOf={setCustomBestOf}
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
              bestOf={getCurrentBestOf()}
              temperature={showAdvanced ? customTemperature : (currentModeConfig?.temperature ?? 0.4)}
              estimatedCost={estimateCost(getCurrentBestOf())}
            />
          </div>
        </section>

        {/* Generate Button & Progress - More Prominent */}
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
                className="btn-primary text-2xl px-16 py-5 font-semibold shadow-lg shadow-inspiration-ideas/20 hover:shadow-inspiration-ideas/30 transition-all"
                aria-busy={isGenerating ? "true" : "false"}
                aria-live="polite"
              >
                <span className="flex items-center gap-3">
                  <span className="text-3xl">{modeConfig?.icon || toolConfig.icon}</span>
                  Generate {modeConfig?.name || toolConfig.label}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <SectionErrorBoundary sectionName="Results">
            <ResultsPanel result={result} />
          </SectionErrorBoundary>
        )}

        {/* Banks Overview */}
        <SectionErrorBoundary sectionName="Banks Overview">
          <BanksOverview />
        </SectionErrorBoundary>

        {/* Run History */}
        <SectionErrorBoundary sectionName="Run History">
          <RunHistory />
        </SectionErrorBoundary>
          </>
        )}

        {/* Seek Section - Only shown when Use Case mode is selected */}
        {showSeek && (
          <SectionErrorBoundary sectionName="Seek Section">
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
          </SectionErrorBoundary>
        )}
      </div>
    </main>
  );
}
