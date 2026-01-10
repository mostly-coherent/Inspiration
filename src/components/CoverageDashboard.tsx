"use client";

import React, { useEffect, useState, useCallback } from "react";

// Types
interface WeekData {
  weekLabel: string;
  weekStart: string;
  weekEnd?: string;
  conversationCount?: number;
  messageCount?: number;
  itemCount?: number;
}

interface CoverageGap {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  conversationCount: number;
  messageCount: number;
  existingItems: number;
  expectedItems: number;
  severity: "high" | "medium" | "low";
}

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

interface QueuedRun {
  id: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  priority: string;
  week_label: string;
  start_date: string;
  end_date: string;
  item_type: string;
  expected_items: number;
  actual_items?: number;
  conversation_count: number;
  message_count: number;
  existing_items: number;
  reason: string;
  estimated_cost: number;
  actual_cost?: number;
  progress?: number;
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

interface CoverageAnalysis {
  success: boolean;
  coverageScore: number;
  gapCounts: {
    high: number;
    medium: number;
    low: number;
  };
  gaps: CoverageGap[];
  suggestedRuns: SuggestedRun[];
  memory: {
    totalWeeks: number;
    totalConversations: number;
    totalMessages: number;
    earliestDate: string | null;
    latestDate: string | null;
    weeks: WeekData[];
  };
  library: {
    totalItems: number;
    weeksWithItems: number;
    weeks: WeekData[];
  };
  analyzedAt: string;
}

// Severity colors
const SEVERITY_COLORS = {
  high: { bg: "bg-red-500/20", border: "border-red-500/50", text: "text-red-400", dot: "bg-red-500" },
  medium: { bg: "bg-yellow-500/20", border: "border-yellow-500/50", text: "text-yellow-400", dot: "bg-yellow-500" },
  low: { bg: "bg-green-500/20", border: "border-green-500/50", text: "text-green-400", dot: "bg-green-500" },
};

export function CoverageDashboard() {
  const [analysis, setAnalysis] = useState<CoverageAnalysis | null>(null);
  const [queuedRuns, setQueuedRuns] = useState<QueuedRun[]>([]);
  const [runHistory, setRunHistory] = useState<QueuedRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executingRunId, setExecutingRunId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Fetch coverage analysis
  const fetchAnalysis = useCallback(async () => {
    try {
      const response = await fetch("/api/coverage/analyze");
      const data = await response.json();
      
      if (data.success) {
        setAnalysis(data);
        setError(null);
      } else {
        setError(data.error || "Failed to load coverage analysis");
      }
    } catch (err) {
      setError("Failed to connect to coverage API");
      console.error("Coverage analysis error:", err);
    }
  }, []);

  // Fetch queued runs
  const fetchQueuedRuns = useCallback(async () => {
    try {
      const response = await fetch("/api/coverage/runs?status=pending");
      const data = await response.json();
      
      if (data.success) {
        setQueuedRuns(data.runs || []);
      }
    } catch (err) {
      console.error("Error fetching queued runs:", err);
    }
  }, []);

  // Fetch run history
  const fetchRunHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/coverage/runs?status=history&limit=10");
      const data = await response.json();
      
      if (data.success) {
        setRunHistory(data.runs || []);
      }
    } catch (err) {
      console.error("Error fetching run history:", err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchAnalysis(), fetchQueuedRuns(), fetchRunHistory()]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchAnalysis, fetchQueuedRuns, fetchRunHistory]);

  // Queue a suggested run
  const queueRun = async (run: SuggestedRun) => {
    try {
      const response = await fetch("/api/coverage/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekLabel: run.weekLabel,
          startDate: run.startDate,
          endDate: run.endDate,
          itemType: run.itemType,
          expectedItems: run.expectedItems,
          conversationCount: run.conversationCount,
          messageCount: run.messageCount,
          existingItems: run.existingItems,
          priority: run.priority,
          reason: run.reason,
          estimatedCost: run.estimatedCost,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        await fetchQueuedRuns();
      } else {
        alert(`Failed to queue run: ${data.error}`);
      }
    } catch (err) {
      console.error("Error queuing run:", err);
      alert("Failed to queue run");
    }
  };

  // Execute a queued run
  const executeRun = async (runId: string) => {
    setExecutingRunId(runId);
    
    try {
      const response = await fetch("/api/coverage/runs/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: runId }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh all data
        await Promise.all([fetchAnalysis(), fetchQueuedRuns(), fetchRunHistory()]);
      } else {
        alert(`Run failed: ${data.error}`);
        await fetchQueuedRuns();
      }
    } catch (err) {
      console.error("Error executing run:", err);
      alert("Failed to execute run");
      await fetchQueuedRuns();
    } finally {
      setExecutingRunId(null);
    }
  };

  // Cancel a queued run
  const cancelRun = async (runId: string) => {
    try {
      const response = await fetch(`/api/coverage/runs?id=${runId}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        await fetchQueuedRuns();
      }
    } catch (err) {
      console.error("Error canceling run:", err);
    }
  };

  // Queue all high priority runs
  const queueAllHighPriority = async () => {
    const highPriorityRuns = analysis?.suggestedRuns.filter((r) => r.priority === "high") || [];
    
    for (const run of highPriorityRuns) {
      await queueRun(run);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          <span className="text-slate-400">Analyzing coverage...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 border border-red-500/50">
        <div className="text-red-400">
          <strong>Coverage Analysis Error:</strong> {error}
        </div>
        <p className="text-slate-500 text-sm mt-2">
          Make sure to run <code className="bg-slate-700 px-1 rounded">add_coverage_tables.sql</code> in Supabase SQL Editor.
        </p>
        <button
          onClick={() => {
            setError(null);
            fetchAnalysis();
          }}
          className="mt-3 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  const totalGaps = analysis.gapCounts.high + analysis.gapCounts.medium + analysis.gapCounts.low;
  const totalEstimatedCost = analysis.suggestedRuns.reduce((sum, r) => sum + r.estimatedCost, 0);

  return (
    <div className="space-y-6">
      {/* Header: Coverage Score */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
            📊 Coverage Intelligence
          </h2>
          <button
            onClick={() => fetchAnalysis()}
            className="text-sm text-slate-400 hover:text-slate-200 flex items-center gap-1"
          >
            🔄 Refresh
          </button>
        </div>

        {/* Score and Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Coverage Score */}
          <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Coverage Score</div>
            <div className="flex items-center gap-3">
              <div
                className={`text-3xl font-bold ${
                  analysis.coverageScore >= 80
                    ? "text-green-400"
                    : analysis.coverageScore >= 50
                    ? "text-yellow-400"
                    : "text-red-400"
                }`}
              >
                {analysis.coverageScore}%
              </div>
              <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full ${
                    analysis.coverageScore >= 80
                      ? "bg-green-500"
                      : analysis.coverageScore >= 50
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${analysis.coverageScore}%` }}
                />
              </div>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              {analysis.library.weeksWithItems} of {analysis.memory.totalWeeks} weeks have items
            </div>
          </div>

          {/* Memory Stats */}
          <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">🧠 Memory Terrain</div>
            <div className="text-xl font-semibold text-slate-200">
              {analysis.memory.totalConversations.toLocaleString()} conversations
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {analysis.memory.earliestDate} → {analysis.memory.latestDate}
            </div>
            <div className="text-xs text-slate-500">
              {analysis.memory.totalMessages.toLocaleString()} messages across {analysis.memory.totalWeeks} weeks
            </div>
          </div>

          {/* Library Stats */}
          <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">📚 Library Coverage</div>
            <div className="text-xl font-semibold text-slate-200">
              {analysis.library.totalItems} items
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Covering {analysis.library.weeksWithItems} weeks
            </div>
          </div>
        </div>

        {/* Gap Summary */}
        <div className="mt-4 flex items-center gap-4 text-sm">
          <span className="text-slate-400">Gaps:</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span className="text-red-400">{analysis.gapCounts.high} high</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
            <span className="text-yellow-400">{analysis.gapCounts.medium} medium</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-green-400">{analysis.gapCounts.low} low</span>
          </span>
        </div>
      </div>

      {/* Run Queue */}
      {queuedRuns.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-6 border border-blue-500/30">
          <h3 className="text-md font-semibold text-slate-200 mb-4 flex items-center gap-2">
            📋 Run Queue ({queuedRuns.length})
          </h3>
          <div className="space-y-3">
            {queuedRuns.map((run) => (
              <div
                key={run.id}
                className={`bg-slate-900/50 rounded-lg p-4 border ${
                  run.status === "processing"
                    ? "border-blue-500/50"
                    : "border-slate-700/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {run.status === "processing" ? (
                      <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    ) : (
                      <span className="text-slate-400">⏸</span>
                    )}
                    <span className="font-medium text-slate-200">{run.week_label}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      run.item_type === "idea" 
                        ? "bg-purple-500/20 text-purple-400" 
                        : "bg-blue-500/20 text-blue-400"
                    }`}>
                      {run.item_type === "idea" ? "💡" : "✨"}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        SEVERITY_COLORS[run.priority as keyof typeof SEVERITY_COLORS]?.bg || "bg-slate-700"
                      } ${SEVERITY_COLORS[run.priority as keyof typeof SEVERITY_COLORS]?.text || "text-slate-400"}`}
                    >
                      {run.priority}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {run.status === "queued" && (
                      <>
                        <button
                          onClick={() => executeRun(run.id)}
                          disabled={executingRunId !== null}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 rounded text-sm"
                        >
                          ▶ Run
                        </button>
                        <button
                          onClick={() => cancelRun(run.id)}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
                        >
                          ✕
                        </button>
                      </>
                    )}
                    {run.status === "processing" && (
                      <span className="text-blue-400 text-sm">
                        {run.progress !== undefined ? `${run.progress}%` : "Processing..."}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm text-slate-500">
                  {run.conversation_count} conversations → {run.expected_items} items (${run.estimated_cost.toFixed(2)})
                </div>
                {run.status === "processing" && run.progress !== undefined && (
                  <div className="mt-2 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${run.progress}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Runs */}
      {analysis.suggestedRuns.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-semibold text-slate-200 flex items-center gap-2">
              💡 Suggested Runs ({analysis.suggestedRuns.length})
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">
                Total: ${totalEstimatedCost.toFixed(2)}
              </span>
              {analysis.gapCounts.high > 0 && (
                <button
                  onClick={queueAllHighPriority}
                  className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 rounded text-sm text-red-400"
                >
                  Queue All High Priority
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {analysis.suggestedRuns.map((run, index) => {
              const colors = SEVERITY_COLORS[run.priority];
              const isQueued = queuedRuns.some(
                (q) => q.week_label === run.weekLabel && q.status !== "completed"
              );

              return (
                <div
                  key={index}
                  className={`rounded-lg p-3 border ${colors.border} ${colors.bg}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${colors.dot}`}></span>
                      <div>
                        <span className="font-medium text-slate-200">{run.weekLabel}</span>
                        <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                          run.itemType === "idea" 
                            ? "bg-purple-500/20 text-purple-400" 
                            : "bg-blue-500/20 text-blue-400"
                        }`}>
                          {run.itemType === "idea" ? "💡 Ideas" : "✨ Insights"}
                        </span>
                        <span className="text-slate-500 mx-2">•</span>
                        <span className="text-sm text-slate-400">
                          {run.conversationCount} convos → {run.expectedItems} items
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-400">
                        ${run.estimatedCost.toFixed(2)}
                      </span>
                      {isQueued ? (
                        <span className="px-3 py-1 bg-slate-700 rounded text-sm text-slate-400">
                          Queued
                        </span>
                      ) : (
                        <button
                          onClick={() => queueRun(run)}
                          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
                        >
                          + Queue
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 ml-5">{run.reason}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Run History (collapsible) */}
      {runHistory.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full p-4 flex items-center justify-between text-slate-400 hover:text-slate-200"
          >
            <span className="flex items-center gap-2">
              ✅ Recent Runs ({runHistory.length})
            </span>
            <span>{showHistory ? "▼" : "▶"}</span>
          </button>
          
          {showHistory && (
            <div className="px-4 pb-4 space-y-2">
              {runHistory.map((run) => (
                <div
                  key={run.id}
                  className={`rounded-lg p-3 border ${
                    run.status === "completed"
                      ? "border-green-500/30 bg-green-500/10"
                      : run.status === "failed"
                      ? "border-red-500/30 bg-red-500/10"
                      : "border-slate-700/50 bg-slate-900/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {run.status === "completed" ? "✅" : run.status === "failed" ? "❌" : "⏹"}
                      <span className="font-medium text-slate-300">{run.week_label}</span>
                    </div>
                    <div className="text-sm text-slate-500">
                      {run.status === "completed"
                        ? `${run.actual_items || 0} items generated`
                        : run.status === "failed"
                        ? "Failed"
                        : "Cancelled"}
                    </div>
                  </div>
                  {run.error && (
                    <div className="mt-1 text-xs text-red-400 truncate">{run.error}</div>
                  )}
                  <div className="mt-1 text-xs text-slate-500">
                    {run.completed_at
                      ? new Date(run.completed_at).toLocaleString()
                      : run.created_at
                      ? new Date(run.created_at).toLocaleString()
                      : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No Gaps Message */}
      {totalGaps === 0 && (
        <div className="bg-green-500/10 rounded-xl p-6 border border-green-500/30 text-center">
          <div className="text-green-400 text-lg mb-2">✅ Great coverage!</div>
          <div className="text-slate-400 text-sm">
            Your Library has items covering all weeks of your Memory terrain.
          </div>
        </div>
      )}
    </div>
  );
}
