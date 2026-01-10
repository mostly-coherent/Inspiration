"use client";

import React, { useMemo } from "react";

interface WeekData {
  weekLabel: string;
  weekStart: string;
  weekEnd?: string;
  conversationCount?: number;
  messageCount?: number;
  ideaCount?: number;
  insightCount?: number;
  itemCount?: number;
}

interface CoverageVisualizationProps {
  memoryWeeks: WeekData[];
  libraryWeeksByType: {
    weekLabel: string;
    weekStart: string;
    itemType: string;
    itemCount: number;
  }[];
  libraryWeeks?: WeekData[]; // Fallback if type-specific not available
}

/**
 * Visualizes chat terrain (memory) against library coverage (ideas + insights).
 * Shows a stacked bar chart with conversations as terrain and items as coverage.
 */
export function CoverageVisualization({
  memoryWeeks,
  libraryWeeksByType,
  libraryWeeks,
}: CoverageVisualizationProps) {
  // Combine data by week
  const chartData = useMemo(() => {
    // Build a map of library coverage by week and type
    const coverageMap = new Map<string, { ideas: number; insights: number }>();
    
    for (const item of libraryWeeksByType) {
      const existing = coverageMap.get(item.weekLabel) || { ideas: 0, insights: 0 };
      if (item.itemType === "idea") {
        existing.ideas = item.itemCount;
      } else if (item.itemType === "insight") {
        existing.insights = item.itemCount;
      }
      coverageMap.set(item.weekLabel, existing);
    }
    
    // Fallback to combined library data if type-specific not available
    if (libraryWeeksByType.length === 0 && libraryWeeks) {
      for (const week of libraryWeeks) {
        coverageMap.set(week.weekLabel, {
          ideas: week.itemCount || 0,
          insights: 0,
        });
      }
    }

    // Merge with memory data
    return memoryWeeks.map((week) => {
      const coverage = coverageMap.get(week.weekLabel) || { ideas: 0, insights: 0 };
      return {
        weekLabel: week.weekLabel,
        weekStart: week.weekStart,
        conversations: week.conversationCount || 0,
        messages: week.messageCount || 0,
        ideas: coverage.ideas,
        insights: coverage.insights,
        totalItems: coverage.ideas + coverage.insights,
      };
    });
  }, [memoryWeeks, libraryWeeksByType, libraryWeeks]);

  // Calculate max values for percentage normalization
  const maxConversations = useMemo(
    () => Math.max(...chartData.map((d) => d.conversations), 1),
    [chartData]
  );
  const maxItems = useMemo(
    () => Math.max(...chartData.map((d) => d.totalItems), 1),
    [chartData]
  );
  const maxIdeas = useMemo(
    () => Math.max(...chartData.map((d) => d.ideas), 1),
    [chartData]
  );
  const maxInsights = useMemo(
    () => Math.max(...chartData.map((d) => d.insights), 1),
    [chartData]
  );

  // Summary stats
  const totals = useMemo(() => {
    const totalConvos = chartData.reduce((sum, d) => sum + d.conversations, 0);
    const totalIdeas = chartData.reduce((sum, d) => sum + d.ideas, 0);
    const totalInsights = chartData.reduce((sum, d) => sum + d.insights, 0);
    const weeksWithCoverage = chartData.filter((d) => d.totalItems > 0).length;
    const weeksWithConvos = chartData.filter((d) => d.conversations > 0).length;
    const coveragePercent = weeksWithConvos > 0 
      ? Math.round((weeksWithCoverage / weeksWithConvos) * 100) 
      : 100;
    return { totalConvos, totalIdeas, totalInsights, weeksWithCoverage, weeksWithConvos, coveragePercent };
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <div className="glass-card p-6 text-center text-slate-400">
        <p>No data available for visualization.</p>
        <p className="text-sm mt-2">Sync your chat history and generate some items first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-slate-200">{chartData.length}</div>
          <div className="text-xs text-slate-500">Weeks</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-cyan-400">{totals.totalConvos.toLocaleString()}</div>
          <div className="text-xs text-slate-500">Conversations</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">{totals.totalIdeas}</div>
          <div className="text-xs text-slate-500">Ideas</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{totals.totalInsights}</div>
          <div className="text-xs text-slate-500">Insights</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{totals.coveragePercent}%</div>
          <div className="text-xs text-slate-500">Coverage</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-cyan-500/30 border border-cyan-500/50"></div>
          <span className="text-slate-400">Chat Terrain (% of max)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-purple-500"></div>
          <span className="text-slate-400">Ideas (% of max)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-500"></div>
          <span className="text-slate-400">Insights (% of max)</span>
        </div>
      </div>

      {/* Chart */}
      <div className="glass-card p-6">
        <div className="relative">
          {/* Y-axis labels (percentage) */}
          <div className="absolute left-0 top-0 bottom-8 w-12 flex flex-col justify-between text-xs text-slate-500">
            <span>100%</span>
            <span>50%</span>
            <span>0%</span>
          </div>

          {/* Chart area */}
          <div className="ml-14 overflow-x-auto">
            <div className="flex items-end gap-1 min-w-max" style={{ height: "280px" }}>
              {chartData.map((week, index) => {
                // Normalize to percentages (0-100% of their respective maximums)
                const terrainHeight = (week.conversations / maxConversations) * 100;
                const ideaHeight = (week.ideas / maxIdeas) * 100;
                const insightHeight = (week.insights / maxInsights) * 100;
                const hasGap = week.conversations > 0 && week.totalItems === 0;

                return (
                  <div
                    key={week.weekLabel}
                    className="relative flex flex-col items-center group"
                    style={{ width: "36px" }}
                  >
                    {/* Terrain bar (background) - full width */}
                    <div
                      className={`absolute bottom-0 w-full rounded-t transition-all ${
                        hasGap 
                          ? "bg-red-500/30 border-2 border-red-500/50" 
                          : "bg-cyan-500/30 border border-cyan-500/40"
                      }`}
                      style={{ height: `${terrainHeight}%`, minHeight: week.conversations > 0 ? "4px" : "0px" }}
                    />

                    {/* Item bars (side by side, foreground) */}
                    <div className="absolute bottom-0 w-full flex justify-center gap-1 px-1.5">
                      {/* Ideas (left) */}
                      <div
                        className={`w-3 rounded-t transition-all ${week.ideas > 0 ? "bg-purple-500 shadow-lg shadow-purple-500/30" : ""}`}
                        style={{ height: `${ideaHeight}%`, minHeight: week.ideas > 0 ? "4px" : "0px" }}
                      />
                      {/* Insights (right) */}
                      <div
                        className={`w-3 rounded-t transition-all ${week.insights > 0 ? "bg-blue-500 shadow-lg shadow-blue-500/30" : ""}`}
                        style={{ height: `${insightHeight}%`, minHeight: week.insights > 0 ? "4px" : "0px" }}
                      />
                    </div>

                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs shadow-xl whitespace-nowrap">
                        <div className="font-medium text-slate-200 mb-2">{week.weekLabel}</div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-cyan-400">Conversations</span>
                            <span className="text-slate-300">{week.conversations} ({Math.round(terrainHeight)}%)</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-purple-400">Ideas</span>
                            <span className="text-slate-300">{week.ideas} ({Math.round(ideaHeight)}%)</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-blue-400">Insights</span>
                            <span className="text-slate-300">{week.insights} ({Math.round(insightHeight)}%)</span>
                          </div>
                        </div>
                        {hasGap && (
                          <div className="text-red-400 mt-2 font-medium border-t border-slate-700 pt-2">⚠️ Coverage Gap</div>
                        )}
                      </div>
                    </div>

                    {/* X-axis label (every 3rd week for better readability) */}
                    {index % 3 === 0 && (
                      <div className="absolute -bottom-7 text-[10px] text-slate-500 -rotate-45 origin-top-left whitespace-nowrap">
                        {week.weekLabel.replace("-W", " W")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* X-axis line */}
        <div className="ml-14 mt-8 border-t border-slate-700" />
        <div className="ml-14 text-center text-xs text-slate-500 mt-2">
          Week (Oldest → Newest)
        </div>
      </div>

      {/* Gap indicator explanation */}
      <div className="text-xs text-slate-500 text-center">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30"></span>
          Red bars indicate weeks with conversations but no generated items (coverage gaps)
        </span>
      </div>
    </div>
  );
}
