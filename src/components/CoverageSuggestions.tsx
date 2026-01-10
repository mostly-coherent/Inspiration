"use client";

import { memo } from "react";

export interface SuggestedRun {
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

interface CoverageSuggestionsProps {
  suggestedRuns: SuggestedRun[];
  onRunSuggestion: (run: SuggestedRun) => void;
  isGenerating: boolean;
  maxDisplay?: number;
}

const PRIORITY_STYLES = {
  high: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    badge: "bg-red-500/20 text-red-400",
    dot: "bg-red-500",
  },
  medium: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-400",
    dot: "bg-amber-500",
  },
  low: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    badge: "bg-emerald-500/20 text-emerald-400",
    dot: "bg-emerald-500",
  },
};

export const CoverageSuggestions = memo(function CoverageSuggestions({
  suggestedRuns,
  onRunSuggestion,
  isGenerating,
  maxDisplay = 6,
}: CoverageSuggestionsProps) {
  if (suggestedRuns.length === 0) {
    return null;
  }

  const displayRuns = suggestedRuns.slice(0, maxDisplay);
  const totalCost = displayRuns.reduce((sum, r) => sum + r.estimatedCost, 0);
  const highPriorityCount = suggestedRuns.filter((r) => r.priority === "high").length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">💡</span>
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Suggested Runs
          </h3>
          {highPriorityCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400">
              {highPriorityCount} high priority
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500">
          Est. ${totalCost.toFixed(2)} total
        </span>
      </div>

      {/* Suggestion Cards - Grid Layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {displayRuns.map((run, index) => {
          const styles = PRIORITY_STYLES[run.priority];
          const isIdea = run.itemType === "idea";

          return (
            <button
              key={`${run.weekLabel}-${run.itemType}-${index}`}
              onClick={() => onRunSuggestion(run)}
              disabled={isGenerating}
              className={`
                relative group text-left p-3 rounded-xl border transition-all
                ${styles.bg} ${styles.border}
                hover:scale-[1.02] hover:shadow-lg
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
              `}
            >
              {/* Priority Dot */}
              <div className={`absolute top-3 right-3 w-2 h-2 rounded-full ${styles.dot}`} />

              {/* Week Label + Type */}
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-slate-200 text-sm">
                  {run.weekLabel}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  isIdea 
                    ? "bg-purple-500/20 text-purple-400" 
                    : "bg-blue-500/20 text-blue-400"
                }`}>
                  {isIdea ? "💡" : "✨"}
                </span>
              </div>

              {/* Stats */}
              <div className="text-xs text-slate-400 mb-2">
                {run.conversationCount} convos → {run.expectedItems} {isIdea ? "ideas" : "insights"}
              </div>

              {/* Cost + Run Button */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  ${run.estimatedCost.toFixed(2)}
                </span>
                <span className="text-xs text-slate-400 group-hover:text-white transition-colors flex items-center gap-1">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">▶</span>
                  Run
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Show more link if there are more runs */}
      {suggestedRuns.length > maxDisplay && (
        <div className="text-center">
          <a
            href="/coverage"
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            View all {suggestedRuns.length} suggestions →
          </a>
        </div>
      )}
    </div>
  );
});
