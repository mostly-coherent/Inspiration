"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ToolType,
  PresetMode,
  GenerateResult,
  PRESET_MODES,
  TOOL_CONFIG,
  ReverseMatchResult,
} from "@/lib/types";
import { BanksOverview } from "@/components/BanksOverview";
import { ResultsPanel } from "@/components/ResultsPanel";
import { ReverseMatchSection } from "@/components/ReverseMatchSection";
import { ProgressPanel } from "@/components/ProgressPanel";
import { ModeCard } from "@/components/ModeCard";
import { AdvancedSettings } from "@/components/AdvancedSettings";
import { ExpectedOutput } from "@/components/ExpectedOutput";
import { LogoutButton } from "@/components/LogoutButton";

export default function Home() {
  // State
  const [selectedTool, setSelectedTool] = useState<ToolType>("ideas");
  const [selectedMode, setSelectedMode] = useState<PresetMode>("sprint");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  
  // Reverse Match state
  const [showReverseMatch, setShowReverseMatch] = useState(false);
  const [reverseQuery, setReverseQuery] = useState("");
  const [isReverseMatching, setIsReverseMatching] = useState(false);
  const [reverseResult, setReverseResult] = useState<ReverseMatchResult | null>(null);
  const [reverseDaysBack, setReverseDaysBack] = useState(90);
  const [reverseTopK, setReverseTopK] = useState(10);
  const [reverseMinSimilarity, setReverseMinSimilarity] = useState(0.0);
  const reverseAbortController = useRef<AbortController | null>(null);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

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

  const currentModeConfig = PRESET_MODES.find((m) => m.id === selectedMode);
  const toolConfig = TOOL_CONFIG[selectedTool];

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
  // Maximum 90 days enforced (retention policy)
  const MAX_DAYS = 90;
  const calculateDateRangeDays = useCallback((from: string, to: string): number => {
    if (!from || !to) return 0;
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diffTime = Math.abs(toDate.getTime() - fromDate.getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    // Clamp to maximum 90 days
    return Math.min(days, MAX_DAYS);
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
        if (data.stats && data.stats.indexed > 0) {
          setSyncStatus(`✓ Synced ${data.stats.indexed} new items`);
        } else {
          setSyncStatus("✓ Brain up to date");
        }
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
  }, [isSyncing]);

  // Auto-sync on mount
  useEffect(() => {
    handleSync();
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
        tool: selectedTool,
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

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }
      
      setProgress(100);
      setProgressPhase("Complete!");
      setResult(data);
    } catch (error) {
      // Check if this was an abort
      if (error instanceof Error && error.name === "AbortError") {
        setProgressPhase("Stopped");
        // Don't set an error result for user-initiated stops
      } else {
        setResult({
          success: false,
          tool: selectedTool,
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
      if (reverseAbortController.current) {
        reverseAbortController.current.abort();
        reverseAbortController.current = null;
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
            {/* Sync Status / Refresh Button */}
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

        {/* Mode Toggle */}
        <section className="glass-card p-4">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setShowReverseMatch(false)}
              aria-pressed={!showReverseMatch}
              className={`px-6 py-2 rounded-lg transition-all ${
                !showReverseMatch
                  ? "bg-inspiration-ideas text-white"
                  : "bg-white/10 text-adobe-gray-400 hover:bg-white/20"
              }`}
            >
              Generate Ideas/Insights
            </button>
            <button
              onClick={() => setShowReverseMatch(true)}
              aria-pressed={showReverseMatch}
              aria-label="Reverse Match - Find chat history evidence for your insights"
              className={`px-6 py-2 rounded-lg transition-all ${
                showReverseMatch
                  ? "bg-inspiration-insights text-white"
                  : "bg-white/10 text-adobe-gray-400 hover:bg-white/20"
              }`}
            >
              <span aria-hidden="true">🔍</span> Reverse Match
            </button>
          </div>
        </section>

        {showReverseMatch ? null : (
          <>
        {/* Tool Selection */}
        <section className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-medium text-adobe-gray-300">
            What do you want to generate?
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {(Object.keys(TOOL_CONFIG) as ToolType[]).map((tool) => {
              const config = TOOL_CONFIG[tool];
              const isSelected = selectedTool === tool;
              return (
                <button
                  key={tool}
                  onClick={() => setSelectedTool(tool)}
                  aria-label={`Generate ${config.label}: ${config.description}`}
                  aria-pressed={isSelected}
                  className={`p-6 rounded-2xl border-2 transition-all duration-200 text-left ${
                    isSelected
                      ? tool === "insights"
                        ? "border-inspiration-insights bg-inspiration-insights/10"
                        : "border-inspiration-ideas bg-inspiration-ideas/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-4xl" aria-hidden="true">{config.icon}</span>
                    <div>
                      <h3 className="text-xl font-semibold">{config.label}</h3>
                      <p className="text-adobe-gray-400 text-sm">
                        {config.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Mode Selection */}
        <section className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-adobe-gray-300">
              Time period & depth
            </h2>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-inspiration-ideas hover:text-inspiration-ideas/80 transition-colors"
            >
              {showAdvanced ? "← Back to presets" : "Advanced settings →"}
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

          {/* Expected output summary */}
          <ExpectedOutput
            tool={selectedTool}
            days={showAdvanced ? (useCustomDates ? calculateDateRangeDays(fromDate, toDate) : customDays) : (currentModeConfig?.days ?? 14)}
            bestOf={getCurrentBestOf()}
            temperature={showAdvanced ? customTemperature : (currentModeConfig?.temperature ?? 0.4)}
            estimatedCost={estimateCost(getCurrentBestOf())}
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
                className="btn-primary text-xl px-12 py-4"
                aria-busy={isGenerating}
                aria-live="polite"
              >
                <span>
                  Generate {toolConfig.icon} {toolConfig.label}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Results */}
        {result && <ResultsPanel result={result} />}

        {/* Banks Overview */}
        <BanksOverview />
          </>
        )}

        {/* Reverse Match Section */}
        <ReverseMatchSection
          showReverseMatch={showReverseMatch}
          setShowReverseMatch={setShowReverseMatch}
          query={reverseQuery}
          setQuery={setReverseQuery}
          daysBack={reverseDaysBack}
          setDaysBack={setReverseDaysBack}
          topK={reverseTopK}
          setTopK={setReverseTopK}
          minSimilarity={reverseMinSimilarity}
          setMinSimilarity={setReverseMinSimilarity}
          isMatching={isReverseMatching}
          setIsMatching={setIsReverseMatching}
          result={reverseResult}
          setResult={setReverseResult}
          abortController={reverseAbortController}
        />
      </div>
    </main>
  );
}
