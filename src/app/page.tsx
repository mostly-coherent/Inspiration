"use client";

import { useState, useEffect, useRef } from "react";
import {
  ToolType,
  PresetMode,
  GenerateResult,
  PRESET_MODES,
  TOOL_CONFIG,
  ModeConfig,
} from "@/lib/types";

// Shared utility for clipboard operations
async function copyToClipboard(content: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(content);
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = content;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
  }
}

export default function Home() {
  // State
  const [selectedTool, setSelectedTool] = useState<ToolType>("ideas");
  const [selectedMode, setSelectedMode] = useState<PresetMode>("sprint");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);

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

  // Estimate generation time based on candidates
  const estimateTime = (bestOf: number): number => {
    // ~20 seconds per candidate + 15 seconds for judging + 10 seconds overhead
    return bestOf * 20 + 15 + 10;
  };

  // Estimate LLM cost based on candidates
  // Claude Sonnet 4: $3/M input, $15/M output
  // Per candidate: ~4K input + ~750 output = ~$0.023
  // Judge: ~6K input + ~500 output = ~$0.025
  const estimateCost = (bestOf: number): number => {
    const costPerCandidate = 0.023;
    const judgeCost = 0.025;
    return bestOf * costPerCandidate + judgeCost;
  };

  // Get current bestOf value
  const getCurrentBestOf = (): number => {
    if (showAdvanced) return customBestOf;
    return currentModeConfig?.bestOf ?? 5;
  };

  // Helper to calculate days from date range
  const calculateDateRangeDays = (from: string, to: string): number => {
    if (!from || !to) return 0;
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diffTime = Math.abs(toDate.getTime() - fromDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

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
    }
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    setProgressPhase("Stopping...");
  };

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, []);

  return (
    <main className="min-h-screen p-8">
      {/* Background gradient */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-adobe-gray-900 via-adobe-gray-800 to-adobe-gray-900" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-inspiration-ideas/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-inspiration-insights/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="text-center space-y-4 pt-8 relative">
          <div className="absolute right-0 top-8 flex items-center gap-2">
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
            bestOf={showAdvanced ? customBestOf : (currentModeConfig?.bestOf ?? 5)}
            temperature={showAdvanced ? customTemperature : (currentModeConfig?.temperature ?? 0.4)}
            estimatedCost={estimateCost(showAdvanced ? customBestOf : (currentModeConfig?.bestOf ?? 5))}
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
      </div>
    </main>
  );
}

function BanksOverview() {
  const [ideaStats, setIdeaStats] = useState<{ total: number; unsolved: number; partial: number; solved: number } | null>(null);
  const [insightStats, setInsightStats] = useState<{ total: number; unshared: number; partial: number; shared: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedBank, setExpandedBank] = useState<"idea" | "insight" | null>(null);
  const [bankMarkdown, setBankMarkdown] = useState<string>("");

  useEffect(() => {
    loadBankStats();
  }, []);

  const loadBankStats = async () => {
    try {
      const [ideaRes, insightRes] = await Promise.all([
        fetch("/api/banks?type=idea"),
        fetch("/api/banks?type=insight"),
      ]);
      
      if (ideaRes.ok) {
        const data = await ideaRes.json();
        if (data.success && data.stats) {
          setIdeaStats(data.stats);
        }
      }
      
      if (insightRes.ok) {
        const data = await insightRes.json();
        if (data.success && data.stats) {
          setInsightStats(data.stats);
        }
      }
    } catch {
      // Silent fail - banks may not exist yet
    } finally {
      setLoading(false);
    }
  };

  const loadBankContent = async (type: "idea" | "insight") => {
    if (expandedBank === type) {
      setExpandedBank(null);
      setBankMarkdown("");
      return;
    }
    
    try {
      const res = await fetch(`/api/banks?type=${type}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.markdown) {
          setBankMarkdown(data.markdown);
          setExpandedBank(type);
        }
      }
    } catch {
      // Silent fail
    }
  };

  const downloadMarkdown = (type: "idea" | "insight", content: string) => {
    const filename = type === "idea" ? "IDEA_BANK.md" : "INSIGHT_BANK.md";
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) return null;
  if (!ideaStats && !insightStats) return null;

  return (
    <section className="glass-card p-6 space-y-4 mt-8">
      <h2 className="text-lg font-medium text-adobe-gray-300 flex items-center gap-2">
        <span>🏦</span> Your Banks
      </h2>
      
      <div className="grid grid-cols-2 gap-4">
        {/* Idea Bank */}
        {ideaStats && ideaStats.total > 0 && (
          <button
            onClick={() => loadBankContent("idea")}
            aria-label={`Idea Bank: ${ideaStats.total} ideas, ${ideaStats.unsolved} unsolved, ${ideaStats.partial} partial, ${ideaStats.solved} solved. Click to ${expandedBank === "idea" ? "collapse" : "expand"}`}
            aria-expanded={expandedBank === "idea"}
            className={`p-4 rounded-xl border transition-all text-left ${
              expandedBank === "idea"
                ? "border-inspiration-ideas bg-inspiration-ideas/10"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">💡</span>
              <div>
                <h3 className="font-semibold">Idea Bank</h3>
                <p className="text-sm text-adobe-gray-400">{ideaStats.total} ideas</p>
              </div>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 bg-slate-700/50 rounded-full">
                🔲 {ideaStats.unsolved} unsolved
              </span>
              {ideaStats.partial > 0 && (
                <span className="px-2 py-1 bg-amber-500/20 rounded-full text-amber-400">
                  🔶 {ideaStats.partial}
                </span>
              )}
              {ideaStats.solved > 0 && (
                <span className="px-2 py-1 bg-emerald-500/20 rounded-full text-emerald-400">
                  ✅ {ideaStats.solved}
                </span>
              )}
            </div>
          </button>
        )}

        {/* Insight Bank */}
        {insightStats && insightStats.total > 0 && (
          <button
            onClick={() => loadBankContent("insight")}
            aria-label={`Insight Bank: ${insightStats.total} insights, ${insightStats.unshared} unshared, ${insightStats.partial} partial, ${insightStats.shared} shared. Click to ${expandedBank === "insight" ? "collapse" : "expand"}`}
            aria-expanded={expandedBank === "insight"}
            className={`p-4 rounded-xl border transition-all text-left ${
              expandedBank === "insight"
                ? "border-inspiration-insights bg-inspiration-insights/10"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">✨</span>
              <div>
                <h3 className="font-semibold">Insight Bank</h3>
                <p className="text-sm text-adobe-gray-400">{insightStats.total} insights</p>
              </div>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 bg-slate-700/50 rounded-full">
                📝 {insightStats.unshared} unshared
              </span>
              {insightStats.partial > 0 && (
                <span className="px-2 py-1 bg-amber-500/20 rounded-full text-amber-400">
                  📤 {insightStats.partial}
                </span>
              )}
              {insightStats.shared > 0 && (
                <span className="px-2 py-1 bg-emerald-500/20 rounded-full text-emerald-400">
                  ✅ {insightStats.shared}
                </span>
              )}
            </div>
          </button>
        )}
      </div>

      {/* Expanded Bank View */}
      {expandedBank && bankMarkdown && (
        <div className="mt-4">
          {/* Export Actions */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => downloadMarkdown(expandedBank, bankMarkdown)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              aria-label={`Download ${expandedBank} bank as markdown`}
            >
              <span aria-hidden="true">📥</span> Export .md
            </button>
            <button
              onClick={() => copyToClipboard(bankMarkdown)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              aria-label={`Copy ${expandedBank} bank to clipboard`}
            >
              <span aria-hidden="true">📋</span> Copy
            </button>
          </div>
          {/* Bank Content */}
          <div className="p-4 bg-black/30 rounded-xl border border-white/10 max-h-96 overflow-y-auto">
            <div className="prose prose-invert prose-sm max-w-none">
              <div dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(bankMarkdown) }} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function simpleMarkdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mb-4">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    .replace(/^---$/gm, '<hr class="border-slate-700 my-4" />')
    .replace(/\n\n/g, '</p><p class="mb-2">')
    .replace(/^(?!<)(.+)$/gm, '<p class="mb-2">$1</p>');
}

function ModeCard({
  mode,
  isSelected,
  onClick,
}: {
  mode: ModeConfig;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`${mode.label} mode: ${mode.description}. ${mode.days} days, ${mode.bestOf} candidates.`}
      aria-pressed={isSelected}
      className={`mode-card ${isSelected ? "selected" : ""}`}
    >
      <span className="text-3xl" aria-hidden="true">{mode.icon}</span>
      <div>
        <h3 className="font-semibold text-lg">{mode.label}</h3>
        <p className="text-adobe-gray-400 text-sm">{mode.description}</p>
      </div>
      {mode.id === "sprint" && (
        <span className="text-xs text-inspiration-ideas bg-inspiration-ideas/20 px-2 py-1 rounded-full mx-auto">
          Recommended
        </span>
      )}
    </button>
  );
}

function AdvancedSettings({
  customDays,
  setCustomDays,
  customBestOf,
  setCustomBestOf,
  customTemperature,
  setCustomTemperature,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  useCustomDates,
  setUseCustomDates,
}: {
  customDays: number;
  setCustomDays: (v: number) => void;
  customBestOf: number;
  setCustomBestOf: (v: number) => void;
  customTemperature: number;
  setCustomTemperature: (v: number) => void;
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
  useCustomDates: boolean;
  setUseCustomDates: (v: boolean) => void;
}) {
  return (
    <div className="space-y-6 p-4 bg-white/5 rounded-xl">
      {/* Date Selection */}
      <fieldset className="space-y-3">
        <legend className="sr-only">Date range selection method</legend>
        <div className="flex items-center gap-4" role="radiogroup" aria-label="Date range selection">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="date-selection"
              checked={!useCustomDates}
              onChange={() => setUseCustomDates(false)}
              className="w-4 h-4 accent-inspiration-ideas"
              aria-describedby="last-n-days-desc"
            />
            <span id="last-n-days-desc">Last N days</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="date-selection"
              checked={useCustomDates}
              onChange={() => setUseCustomDates(true)}
              className="w-4 h-4 accent-inspiration-ideas"
              aria-describedby="custom-range-desc"
            />
            <span id="custom-range-desc">Custom date range</span>
          </label>
        </div>

        {!useCustomDates ? (
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={90}
              value={customDays}
              onChange={(e) => setCustomDays(parseInt(e.target.value))}
              className="slider-track flex-1"
              aria-label={`Number of days to analyze: ${customDays}`}
              aria-valuemin={1}
              aria-valuemax={90}
              aria-valuenow={customDays}
            />
            <span className="w-16 text-center font-mono" aria-hidden="true">{customDays} days</span>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label htmlFor="from-date" className="text-sm text-adobe-gray-400 block mb-1">From</label>
              <input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="input-field"
                aria-label="Start date for analysis"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="to-date" className="text-sm text-adobe-gray-400 block mb-1">To</label>
              <input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="input-field"
                aria-label="End date for analysis"
              />
            </div>
          </div>
        )}
      </fieldset>

      {/* Best-of Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-adobe-gray-300">
            Candidates to generate
            <span className="text-adobe-gray-500 text-sm ml-2">
              (more = more variety, slower)
            </span>
          </label>
          <span className="font-mono text-lg">{customBestOf}</span>
        </div>
        <input
          type="range"
          min={1}
          max={20}
          value={customBestOf}
          onChange={(e) => setCustomBestOf(parseInt(e.target.value))}
          className="slider-track w-full"
          aria-label={`Number of candidates to generate: ${customBestOf}`}
          aria-valuemin={1}
          aria-valuemax={20}
          aria-valuenow={customBestOf}
        />
        <div className="flex justify-between text-xs text-adobe-gray-500">
          <span>1 (fast)</span>
          <span>5 (balanced)</span>
          <span>10 (thorough)</span>
          <span>20 (exhaustive)</span>
        </div>
      </div>

      {/* Temperature Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-adobe-gray-300">
            Temperature
            <span className="text-adobe-gray-500 text-sm ml-2">
              (higher = more creative, riskier)
            </span>
          </label>
          <span className="font-mono text-lg">{customTemperature.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={customTemperature * 100}
          onChange={(e) => setCustomTemperature(parseInt(e.target.value) / 100)}
          className="slider-track w-full"
          aria-label={`Temperature setting: ${customTemperature.toFixed(2)}`}
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={customTemperature}
        />
        <div className="flex justify-between text-xs text-adobe-gray-500">
          <span>0.0 (focused)</span>
          <span>0.3 (safe)</span>
          <span>0.5 (balanced)</span>
          <span>0.7+ (creative)</span>
        </div>
      </div>

      {/* Quick preset buttons */}
      <div className="flex gap-2 pt-2" role="group" aria-label="Quick preset options">
        <span className="text-sm text-adobe-gray-400" id="presets-label">Quick presets:</span>
        {PRESET_MODES.map((preset) => (
          <button
            key={preset.id}
            onClick={() => {
              setCustomDays(preset.days);
              setCustomBestOf(preset.bestOf);
              setCustomTemperature(preset.temperature);
              setUseCustomDates(false);
            }}
            className="text-xs px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label={`Apply ${preset.label} preset: ${preset.days} days, ${preset.bestOf} candidates, temperature ${preset.temperature}`}
          >
            <span aria-hidden="true">{preset.icon}</span> {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProgressPanel({
  progress,
  phase,
  elapsedSeconds,
  estimatedSeconds,
  tool,
  onStop,
}: {
  progress: number;
  phase: string;
  elapsedSeconds: number;
  estimatedSeconds: number;
  tool: string;
  onStop: () => void;
}) {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const remainingSeconds = Math.max(0, estimatedSeconds - elapsedSeconds);
  const isStopping = phase === "Stopping..." || phase === "Stopped";

  return (
    <div className="glass-card p-6 space-y-4" aria-busy={!isStopping} aria-live="polite">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-white flex items-center gap-3">
          {!isStopping && <LoadingSpinner />}
          {isStopping ? phase : `Generating ${tool}...`}
        </h3>
        <div className="flex items-center gap-4">
          <span className="text-sm text-adobe-gray-400">
            {formatTime(elapsedSeconds)} elapsed
          </span>
          {!isStopping && (
            <button
              onClick={onStop}
              aria-label="Stop generation"
              className="px-4 py-2 text-sm font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 border border-red-400/30 rounded-lg transition-colors flex items-center gap-2"
            >
              <StopIcon />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div 
          className="h-3 bg-white/10 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Generation progress: ${Math.round(progress)}%`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              isStopping 
                ? "bg-red-400/50" 
                : "bg-gradient-to-r from-inspiration-ideas to-inspiration-insights"
            }`}
            style={{ width: `${progress}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-adobe-gray-300">{phase}</span>
          <span className="text-adobe-gray-400">
            {isStopping ? (
              <span className="text-red-400">Cancelled</span>
            ) : progress < 100 ? (
              <>~{formatTime(remainingSeconds)} remaining</>
            ) : (
              <span className="text-inspiration-ideas">Complete!</span>
            )}
          </span>
        </div>
      </div>

      {/* Progress percentage */}
      <div className="flex justify-center">
        <span 
          className={`text-4xl font-bold ${isStopping ? "text-red-400" : "gradient-text"}`}
          aria-hidden="true"
        >
          {Math.round(progress)}%
        </span>
        <span className="sr-only">
          {isStopping ? "Generation stopped" : `${Math.round(progress)} percent complete`}
        </span>
      </div>
    </div>
  );
}

function StopIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function ExpectedOutput({
  tool,
  days,
  bestOf,
  temperature,
  estimatedCost,
}: {
  tool: ToolType;
  days: number;
  bestOf: number;
  temperature: number;
  estimatedCost: number;
}) {
  const toolLabel = tool === "ideas" ? "idea" : "insight";
  
  return (
    <div className="mt-4 p-4 bg-gradient-to-r from-white/5 to-white/10 rounded-xl border border-white/10">
      <h3 className="text-sm font-medium text-adobe-gray-300 mb-3 flex items-center gap-2">
        <span className="text-lg">📊</span> Expected Output
      </h3>
      <div className="grid grid-cols-5 gap-4 text-center">
        {/* Output Files */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-white">1</div>
          <div className="text-xs text-adobe-gray-400">output file</div>
        </div>
        
        {/* Candidates Generated */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-inspiration-ideas">{bestOf}</div>
          <div className="text-xs text-adobe-gray-400">
            {bestOf === 1 ? "candidate" : "candidates"}
          </div>
        </div>
        
        {/* Winning Output */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-inspiration-insights">1</div>
          <div className="text-xs text-adobe-gray-400">
            winning {toolLabel}
          </div>
        </div>
        
        {/* Days Analyzed */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-white">{days || "—"}</div>
          <div className="text-xs text-adobe-gray-400">
            {days === 1 ? "day" : "days"} analyzed
          </div>
        </div>

        {/* Estimated Cost */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-green-400">${estimatedCost.toFixed(2)}</div>
          <div className="text-xs text-adobe-gray-400">est. cost</div>
        </div>
      </div>
      
      {/* Explanation */}
      <div className="mt-3 pt-3 border-t border-white/10 text-xs text-adobe-gray-500 space-y-1">
        <div>
          <span className="text-adobe-gray-400">How it works:</span>{" "}
          {bestOf} {bestOf === 1 ? "candidate is" : "candidates are"} generated at temp {temperature.toFixed(1)}, 
          then judged at temp 0.0 to select the best {toolLabel}.
          {days > 1 && ` All ${days} days of conversations are analyzed together.`}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-adobe-gray-400">Model:</span>
          <code className="px-1.5 py-0.5 bg-white/10 rounded text-adobe-gray-300">claude-sonnet-4-20250514</code>
          <span className="text-adobe-gray-500">(generation & judging)</span>
        </div>
      </div>
    </div>
  );
}

function ResultsPanel({ result }: { result: GenerateResult }) {
  const [showRaw, setShowRaw] = useState(false);

  const downloadResult = (content: string) => {
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `${result.tool}_${timestamp}.md`;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!result.success) {
    return (
      <section className="glass-card p-6 border-red-500/30">
        <h2 className="text-lg font-medium text-red-400 flex items-center gap-2">
          ❌ Generation Failed
        </h2>
        <p className="text-adobe-gray-400 mt-2">{result.error}</p>
      </section>
    );
  }

  return (
    <section className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-inspiration-ideas flex items-center gap-2">
          ✅ Generated {TOOL_CONFIG[result.tool].label}
        </h2>
        <div className="flex items-center gap-4 text-sm text-adobe-gray-400">
          <span>📅 {result.stats.daysProcessed} days</span>
          <span>✨ {result.stats.daysWithOutput} with output</span>
          {result.outputFile && (
            <span className="font-mono text-xs">{result.outputFile}</span>
          )}
        </div>
      </div>

      {result.content && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4" role="tablist" aria-label="View mode">
              <button
                onClick={() => setShowRaw(false)}
                role="tab"
                aria-selected={!showRaw}
                aria-controls="result-content"
                className={`text-sm px-3 py-1 rounded-lg transition-colors ${
                  !showRaw ? "bg-white/20" : "hover:bg-white/10"
                }`}
              >
                Formatted
              </button>
              <button
                onClick={() => setShowRaw(true)}
                role="tab"
                aria-selected={showRaw}
                aria-controls="result-content"
                className={`text-sm px-3 py-1 rounded-lg transition-colors ${
                  showRaw ? "bg-white/20" : "hover:bg-white/10"
                }`}
              >
                Raw Markdown
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => result.content && downloadResult(result.content)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Download result as markdown"
              >
                <span aria-hidden="true">📥</span> Export
              </button>
              <button
                onClick={() => result.content && copyToClipboard(result.content)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Copy result to clipboard"
              >
                <span aria-hidden="true">📋</span> Copy
              </button>
            </div>
          </div>

          <div id="result-content" role="tabpanel" className="bg-black/30 rounded-xl p-6 max-h-[600px] overflow-auto">
            {showRaw ? (
              <pre className="text-sm font-mono whitespace-pre-wrap text-adobe-gray-300">
                {result.content}
              </pre>
            ) : (
              <MarkdownContent content={result.content} />
            )}
          </div>
        </div>
      )}

      {!result.content && (
        <p className="text-adobe-gray-400">
          No output generated. The conversations may have been routine work without
          notable patterns.
        </p>
      )}
    </section>
  );
}

function MarkdownContent({ content }: { content: string }) {
  // Simple markdown rendering - just for display
  const lines = content.split("\n");
  
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      {lines.map((line, i) => {
        if (line.startsWith("# ")) {
          return (
            <h1 key={i} className="text-2xl font-bold mt-6 mb-4 gradient-text">
              {line.slice(2)}
            </h1>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <h2 key={i} className="text-xl font-semibold mt-5 mb-3 text-white">
              {line.slice(3)}
            </h2>
          );
        }
        if (line.startsWith("### ")) {
          return (
            <h3 key={i} className="text-lg font-medium mt-4 mb-2 text-adobe-gray-200">
              {line.slice(4)}
            </h3>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <li key={i} className="text-adobe-gray-300 ml-4">
              {line.slice(2)}
            </li>
          );
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return (
            <p key={i} className="font-semibold text-white">
              {line.slice(2, -2)}
            </p>
          );
        }
        if (line.trim() === "") {
          return <br key={i} />;
        }
        if (line.startsWith("---")) {
          return <hr key={i} className="border-white/10 my-4" />;
        }
        return (
          <p key={i} className="text-adobe-gray-300 leading-relaxed">
            {line}
          </p>
        );
      })}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-5 w-5"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function LogoutButton() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout failed:", error);
      setIsLoggingOut(false);
    }
  };

  // Only show logout button if password protection is enabled
  // We can't check this client-side easily, so we'll always show it
  // The middleware will handle redirecting if needed
  return (
    <button
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="p-2 text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50"
      title="Logout"
      aria-label="Logout"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
    </button>
  );
}

