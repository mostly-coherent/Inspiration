"use client";

import { memo } from "react";

interface AnalysisCoverageProps {
  // Before generation (planned)
  plannedDays?: number;
  plannedHours?: number;
  plannedFromDate?: string;
  plannedToDate?: string;
  
  // After generation (actual)
  conversationsAnalyzed?: number;
  messagesAnalyzed?: number;
  actualFromDate?: string;
  actualToDate?: string;
  workspaces?: string[] | number;
  
  // Status
  isGenerating?: boolean;
  isComplete?: boolean;
  
  // Results (for delta display)
  itemsGenerated?: number;
  itemsAfterDedup?: number;
  itemsNew?: number;
  itemsUpdated?: number;
  libraryBefore?: number;
  libraryAfter?: number;
}

export const AnalysisCoverage = memo(function AnalysisCoverage({
  plannedDays,
  plannedHours,
  plannedFromDate,
  plannedToDate,
  conversationsAnalyzed,
  messagesAnalyzed,
  actualFromDate,
  actualToDate,
  workspaces,
  isGenerating,
  isComplete,
  itemsGenerated,
  itemsAfterDedup,
  itemsNew,
  itemsUpdated,
  libraryBefore,
  libraryAfter,
}: AnalysisCoverageProps) {
  // Format date range string
  const getDateRangeDisplay = () => {
    if (actualFromDate && actualToDate) {
      return `${actualFromDate} → ${actualToDate}`;
    }
    if (plannedFromDate && plannedToDate) {
      return `${plannedFromDate} → ${plannedToDate}`;
    }
    if (plannedHours) {
      return `Last ${plannedHours} hours`;
    }
    if (plannedDays) {
      return `Last ${plannedDays} days`;
    }
    return null;
  };

  const workspaceCount = typeof workspaces === "number" 
    ? workspaces 
    : Array.isArray(workspaces) 
      ? workspaces.length 
      : 0;

  const dateRangeDisplay = getDateRangeDisplay();
  const hasData = dateRangeDisplay || conversationsAnalyzed || messagesAnalyzed;

  // Don't render if no data
  if (!hasData && !isComplete) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-slate-800/50 to-slate-700/30 border border-white/10 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-lg">📊</span>
        <h3 className="text-sm font-medium text-slate-300">
          {isComplete ? "Analysis Complete" : isGenerating ? "Analyzing..." : "Analysis Coverage"}
        </h3>
        {isComplete && (
          <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full">
            ✓ Done
          </span>
        )}
      </div>

      {/* Coverage Stats (Before/During) */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        {/* Date Range */}
        {dateRangeDisplay && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">📅</span>
              <span className="text-slate-400 text-xs">Period</span>
            </div>
            <p className="text-white font-medium">{dateRangeDisplay}</p>
          </div>
        )}

        {/* Conversations */}
        {conversationsAnalyzed !== undefined && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">💬</span>
              <span className="text-slate-400 text-xs">Conversations</span>
            </div>
            <p className="text-white font-medium">
              {conversationsAnalyzed.toLocaleString()}
              {messagesAnalyzed !== undefined && (
                <span className="text-slate-500 font-normal text-xs ml-1">
                  ({messagesAnalyzed.toLocaleString()} messages)
                </span>
              )}
            </p>
          </div>
        )}

        {/* Workspaces */}
        {workspaceCount > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">📁</span>
              <span className="text-slate-400 text-xs">Workspaces</span>
            </div>
            <p className="text-white font-medium">{workspaceCount}</p>
          </div>
        )}
      </div>

      {/* Results (After Generation) */}
      {isComplete && (itemsGenerated !== undefined || libraryAfter !== undefined) && (
        <div className="pt-3 border-t border-white/10">
          <div className="grid grid-cols-2 gap-4 text-sm">
            {/* Items Generated */}
            {itemsGenerated !== undefined && (
              <div className="space-y-1">
                <span className="text-slate-400 text-xs">Items Generated</span>
                <p className="text-white font-medium">
                  {itemsGenerated}
                  {itemsAfterDedup !== undefined && itemsAfterDedup < itemsGenerated && (
                    <span className="text-slate-500 font-normal text-xs ml-1">
                      → {itemsAfterDedup} after dedup
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Library Delta */}
            {libraryBefore !== undefined && libraryAfter !== undefined && (
              <div className="space-y-1">
                <span className="text-slate-400 text-xs">Library Updated</span>
                <p className="font-medium">
                  <span className="text-slate-400">{libraryBefore}</span>
                  <span className="text-slate-500 mx-1">→</span>
                  <span className="text-white">{libraryAfter}</span>
                  {libraryAfter > libraryBefore && (
                    <span className="text-emerald-400 ml-2">
                      (+{libraryAfter - libraryBefore} new)
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Harmonization Stats */}
            {(itemsNew !== undefined || itemsUpdated !== undefined) && (
              <div className="col-span-2 flex gap-4 text-xs text-slate-500">
                {itemsNew !== undefined && itemsNew > 0 && (
                  <span className="text-emerald-400">✓ {itemsNew} new items added</span>
                )}
                {itemsUpdated !== undefined && itemsUpdated > 0 && (
                  <span className="text-blue-400">↑ {itemsUpdated} existing updated</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

