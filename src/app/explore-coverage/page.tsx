"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface SuggestedRun {
  weekLabel: string;
  startDate: string;
  endDate: string;
  itemType: string;
  expectedItems: number;
  conversationCount: number;
  messageCount: number;
  existingItems: number;
  priority: "high" | "medium" | "low";
  reason: string;
  estimatedCost: number;
}

interface CoverageAnalysis {
  success: boolean;
  coverageScore: number;
  gapCounts: { high: number; medium: number; low: number };
  suggestedRuns: SuggestedRun[];
  memory: {
    totalWeeks: number;
    coveredWeeks: number; // Weeks with both conversations AND library items
    totalConversations: number;
    totalMessages: number;
    earliestDate: string | null;
    latestDate: string | null;
    weeks: {
      weekLabel: string;
      weekStart: string;
      weekEnd: string;
      conversationCount: number;
      messageCount: number;
    }[];
  };
  library: {
    totalItems: number;
    weeksWithItems: number;
    weeks: {
      weekLabel: string;
      weekStart: string;
      itemCount: number;
    }[];
    weeksByType?: {
      weekLabel: string;
      weekStart: string;
      itemType: string;
      itemCount: number;
    }[];
  };
  analyzedAt: string;
}

export default function ExploreCoveragePage() {
  const [coverageData, setCoverageData] = useState<CoverageAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningRun, setRunningRun] = useState<string | null>(null);

  // Fetch coverage analysis
  const fetchCoverage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/coverage/analyze");
      const data = await res.json();
      if (data.success) {
        setCoverageData(data);
      } else {
        setError(data.error || "Failed to fetch coverage analysis");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoverage();
  }, [fetchCoverage]);

  // Run a suggested run
  const handleRunSuggestion = async (run: SuggestedRun) => {
    const runKey = `${run.weekLabel}-${run.itemType}`;
    setRunningRun(runKey);

    try {
      const body = {
        theme: "generation",
        modeId: run.itemType,
        mode: "custom",
        fromDate: run.startDate,
        toDate: run.endDate,
        itemCount: run.expectedItems,
      };

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh coverage data
        await fetchCoverage();
      } else {
        alert(`Generation failed: ${data.error}`);
      }
    } catch (e) {
      alert(`Error: ${String(e)}`);
    } finally {
      setRunningRun(null);
    }
  };

  // Group suggested runs by week
  const runsByWeek = coverageData?.suggestedRuns.reduce((acc, run) => {
    if (!acc[run.weekLabel]) {
      acc[run.weekLabel] = [];
    }
    acc[run.weekLabel].push(run);
    return acc;
  }, {} as Record<string, SuggestedRun[]>) || {};

  const totalEstimatedCost = coverageData?.suggestedRuns.reduce(
    (sum, run) => sum + run.estimatedCost,
    0
  ) || 0;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              ← Back
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-slate-200">
                📊 Explore Coverage
              </h1>
              <p className="text-sm text-slate-500">
                Visualize your Cursor usage against Inspiration&apos;s mining coverage
              </p>
            </div>
          </div>
          <button
            onClick={fetchCoverage}
            disabled={isLoading}
            className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? "Refreshing..." : "🔄 Refresh"}
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Error State */}
        {error && (
          <div className="glass-card p-6 border-red-500/30">
            <h2 className="text-lg font-medium text-red-400">Coverage Analysis Error</h2>
            <p className="text-slate-400 mt-2">{error}</p>
            <p className="text-sm text-slate-500 mt-2">
              Make sure to run <code className="bg-slate-800 px-1 rounded">add_coverage_tables.sql</code> in Supabase SQL Editor.
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !coverageData && (
          <div className="glass-card p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
            <p className="text-slate-400 mt-4">Analyzing coverage...</p>
          </div>
        )}

        {/* Main Content */}
        {coverageData && (
          <>
            {/* Coverage Score Banner */}
            <div className="glass-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium text-slate-300">Coverage Score</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    How well your Library covers your chat terrain
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold text-emerald-400">
                    {coverageData.coverageScore}%
                  </div>
                  <div className="text-sm text-slate-500 mt-1">
                    {coverageData.memory.coveredWeeks} / {coverageData.memory.totalWeeks} weeks covered
                  </div>
                </div>
              </div>

              {/* Gap counts */}
              <div className="mt-4 flex items-center gap-4 text-sm">
                {coverageData.gapCounts.high > 0 && (
                  <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400">
                    {coverageData.gapCounts.high} high priority gaps
                  </span>
                )}
                {coverageData.gapCounts.medium > 0 && (
                  <span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400">
                    {coverageData.gapCounts.medium} medium gaps
                  </span>
                )}
                {coverageData.gapCounts.low > 0 && (
                  <span className="px-3 py-1 rounded-full bg-slate-500/20 text-slate-400">
                    {coverageData.gapCounts.low} low gaps
                  </span>
                )}
                {coverageData.gapCounts.high === 0 && coverageData.gapCounts.medium === 0 && coverageData.gapCounts.low === 0 && (
                  <span className="text-emerald-400">✓ No coverage gaps!</span>
                )}
              </div>

              {/* Date range */}
              <div className="mt-4 text-xs text-slate-500">
                Analyzing: {coverageData.memory.earliestDate || "N/A"} → {coverageData.memory.latestDate || "N/A"}
              </div>
            </div>

            {/* Summary Stats */}
            <section>
              <h2 className="text-lg font-medium text-slate-300 mb-4">
                📊 Coverage Statistics
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card p-4 text-center">
                  <div className="text-2xl font-bold text-slate-200">
                    {coverageData.memory.totalWeeks}
                  </div>
                  <div className="text-xs text-slate-500">Weeks Tracked</div>
                </div>
                <div className="glass-card p-4 text-center">
                  <div className="text-2xl font-bold text-cyan-400">
                    {coverageData.memory.totalConversations.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500">Total Conversations</div>
                </div>
                <div className="glass-card p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-400">
                    {coverageData.memory.coveredWeeks}
                  </div>
                  <div className="text-xs text-slate-500">Weeks with Items</div>
                </div>
                <div className="glass-card p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-400">
                    {coverageData.coverageScore}%
                  </div>
                  <div className="text-xs text-slate-500">Coverage Score</div>
                </div>
              </div>
            </section>

            {/* Suggested Runs */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-medium text-slate-300">
                    💡 Suggested Runs ({coverageData.suggestedRuns.length})
                  </h2>
                  <p className="text-sm text-slate-500">
                    Click to generate items for uncovered periods
                  </p>
                </div>
                <div className="text-sm text-slate-500">
                  Est. total: ${totalEstimatedCost.toFixed(2)}
                </div>
              </div>

              {coverageData.suggestedRuns.length === 0 ? (
                <div className="glass-card p-8 text-center">
                  <div className="text-4xl mb-4">🎉</div>
                  <h3 className="text-lg font-medium text-slate-300">Great Coverage!</h3>
                  <p className="text-slate-500 mt-2">
                    Your Library has good coverage of your chat history. Keep generating!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(runsByWeek).map(([weekLabel, runs]) => (
                    <div key={weekLabel} className="glass-card p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            runs[0].priority === "high"
                              ? "bg-red-500/20 text-red-400"
                              : runs[0].priority === "medium"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-slate-500/20 text-slate-400"
                          }`}>
                            {runs[0].priority}
                          </span>
                          <span className="font-medium text-slate-200">
                            {weekLabel}
                          </span>
                          <span className="text-sm text-slate-500">
                            {runs[0].conversationCount} conversations
                          </span>
                        </div>
                      </div>

                      <p className="text-sm text-slate-400 mb-3">
                        {runs[0].reason}
                      </p>

                      <div className="flex items-center gap-3">
                        {runs.map((run) => {
                          const runKey = `${run.weekLabel}-${run.itemType}`;
                          const isRunning = runningRun === runKey;
                          return (
                            <button
                              key={runKey}
                              onClick={() => handleRunSuggestion(run)}
                              disabled={isRunning || runningRun !== null}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                                run.itemType === "idea"
                                  ? "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30"
                                  : "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30"
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {isRunning ? (
                                <>
                                  <span className="animate-spin">⏳</span>
                                  Running...
                                </>
                              ) : (
                                <>
                                  {run.itemType === "idea" ? "💡" : "✨"}
                                  {run.expectedItems} {run.itemType}s
                                  <span className="text-xs opacity-70">
                                    ${run.estimatedCost.toFixed(2)}
                                  </span>
                                </>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Analysis Metadata */}
            <div className="text-xs text-slate-600 text-center">
              Last analyzed: {new Date(coverageData.analyzedAt).toLocaleString()}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
