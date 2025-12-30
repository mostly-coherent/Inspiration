"use client";

import { useState, useEffect, memo } from "react";
import { RunHistoryEntry } from "@/lib/runHistory";
import {
  getRunHistory,
  getRecentRuns,
  deleteRun,
  clearRunHistory,
  getStorageSize,
} from "@/lib/runHistory";
import { GenerateResult } from "@/lib/types";
import { copyToClipboard, downloadFile } from "@/lib/utils";
import { MarkdownContent } from "./MarkdownContent";

export const RunHistory = memo(function RunHistory() {
  const [runs, setRuns] = useState<RunHistoryEntry[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunHistoryEntry | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRuns();
  }, [showAll]);

  const loadRuns = () => {
    setLoading(true);
    const history = showAll ? getRunHistory() : getRecentRuns(10);
    setRuns(history);
    setLoading(false);
  };

  const formatDate = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getRunPreview = (result: GenerateResult): string => {
    if (!result.success) {
      return `Error: ${result.error || "Unknown error"}`;
    }
    if (result.items && result.items.length > 0) {
      return `${result.items.length} items generated`;
    }
    if (result.content) {
      // Extract first line or first 100 chars
      const firstLine = result.content.split("\n")[0];
      return firstLine.length > 100
        ? firstLine.substring(0, 100) + "..."
        : firstLine;
    }
    return "No content";
  };

  const downloadRun = (entry: RunHistoryEntry) => {
    const timestamp = new Date(entry.timestamp).toISOString().split("T")[0];
    const filename = `run_${timestamp}_${entry.id}.md`;
    const content = formatRunAsMarkdown(entry.result);
    downloadFile(content, filename);
  };

  const formatRunAsMarkdown = (result: GenerateResult): string => {
    const lines = [
      `# Generation Run - ${new Date(result.timestamp).toLocaleString()}`,
      "",
      `**Tool:** ${result.tool}`,
      `**Mode:** ${result.mode}`,
      "",
      "## Stats",
      "",
      `- Days Processed: ${result.stats.daysProcessed}`,
      `- Days with Activity: ${result.stats.daysWithActivity}`,
      `- Days with Output: ${result.stats.daysWithOutput}`,
      `- Candidates Generated: ${result.stats.candidatesGenerated}`,
      result.stats.conversationsAnalyzed
        ? `- Conversations Analyzed: ${result.stats.conversationsAnalyzed}`
        : "",
      "",
    ];

    if (result.items && result.items.length > 0) {
      lines.push("## Generated Items", "");
      result.items.forEach((item, idx) => {
        lines.push(`### ${idx + 1}. ${item.name}${item.isBest ? " ⭐ Best" : ""}`);
        lines.push("");
        lines.push(item.rawMarkdown);
        lines.push("");
      });
    } else if (result.content) {
      lines.push("## Content", "");
      lines.push(result.content);
    }

    return lines.filter((line) => line !== "").join("\n");
  };

  const storageSizeMB = (getStorageSize() / 1024 / 1024).toFixed(2);

  return (
    <section className="glass-card p-6 space-y-4 mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-adobe-gray-300 flex items-center gap-2">
          <span>📜</span> Run History
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-adobe-gray-400">
            {runs.length} runs ({storageSizeMB} MB)
          </span>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-inspiration-ideas hover:text-inspiration-ideas/80 transition-colors"
          >
            {showAll ? "Show Recent" : "Show All"}
          </button>
          {runs.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Clear all run history?")) {
                  clearRunHistory();
                  loadRuns();
                  setSelectedRun(null);
                }
              }}
              className="text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-adobe-gray-400">Loading...</p>
      ) : runs.length === 0 ? (
        <p className="text-adobe-gray-400">No run history yet.</p>
      ) : (
        <div className="space-y-3">
          {runs.map((entry) => (
            <div
              key={entry.id}
              className={`p-4 rounded-lg border transition-all ${
                selectedRun?.id === entry.id
                  ? "border-inspiration-ideas bg-inspiration-ideas/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer"
              }`}
              onClick={() => setSelectedRun(selectedRun?.id === entry.id ? null : entry)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white">
                      {formatDate(entry.timestamp)}
                    </span>
                    <span className="text-xs text-adobe-gray-400">
                      {entry.result.tool} • {entry.result.mode}
                    </span>
                  </div>
                  <p className="text-sm text-adobe-gray-300">
                    {getRunPreview(entry.result)}
                  </p>
                  {entry.result.stats && (
                    <div className="flex gap-3 mt-2 text-xs text-adobe-gray-400">
                      <span>{entry.result.stats.daysProcessed} days</span>
                      <span>{entry.result.stats.candidatesGenerated} candidates</span>
                      {entry.result.stats.conversationsAnalyzed && (
                        <span>{entry.result.stats.conversationsAnalyzed} conversations</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadRun(entry);
                    }}
                    className="p-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                    aria-label="Download run"
                  >
                    📥
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRun(entry.id);
                      loadRuns();
                      if (selectedRun?.id === entry.id) {
                        setSelectedRun(null);
                      }
                    }}
                    className="p-2 text-sm bg-white/10 hover:bg-red-500/20 rounded-lg transition-colors"
                    aria-label="Delete run"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Run Detail */}
      {selectedRun && (
        <div className="mt-4 p-4 bg-black/30 rounded-xl border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-white">
              Run Details - {formatDate(selectedRun.timestamp)}
            </h3>
            <button
              onClick={() => setSelectedRun(null)}
              className="text-sm text-adobe-gray-400 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
            <div>
              <div className="text-adobe-gray-400 text-xs mb-1">Days Processed</div>
              <div className="text-white font-medium">
                {selectedRun.result.stats.daysProcessed}
              </div>
            </div>
            <div>
              <div className="text-adobe-gray-400 text-xs mb-1">Candidates</div>
              <div className="text-white font-medium">
                {selectedRun.result.stats.candidatesGenerated}
              </div>
            </div>
            <div>
              <div className="text-adobe-gray-400 text-xs mb-1">Conversations</div>
              <div className="text-white font-medium">
                {selectedRun.result.stats.conversationsAnalyzed || "-"}
              </div>
            </div>
            <div>
              <div className="text-adobe-gray-400 text-xs mb-1">Items</div>
              <div className="text-white font-medium">
                {selectedRun.result.items?.length || "-"}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => downloadRun(selectedRun)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              <span aria-hidden="true">📥</span> Export
            </button>
            <button
              onClick={() => copyToClipboard(formatRunAsMarkdown(selectedRun.result))}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              <span aria-hidden="true">📋</span> Copy
            </button>
          </div>

          {/* Content */}
          {selectedRun.result.items && selectedRun.result.items.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {selectedRun.result.items.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg border ${
                    item.isBest
                      ? "border-inspiration-ideas bg-inspiration-ideas/10"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-adobe-gray-400">
                      #{item.rank}
                    </span>
                    {item.isBest && (
                      <span className="text-xs bg-inspiration-ideas/20 text-inspiration-ideas px-2 py-0.5 rounded-full">
                        ⭐ Best
                      </span>
                    )}
                    <h4 className="font-semibold text-white">{item.name}</h4>
                  </div>
                  <MarkdownContent content={item.rawMarkdown} />
                </div>
              ))}
            </div>
          ) : selectedRun.result.content ? (
            <div className="max-h-96 overflow-y-auto">
              <MarkdownContent content={selectedRun.result.content} />
            </div>
          ) : (
            <p className="text-adobe-gray-400">No content available.</p>
          )}
        </div>
      )}
    </section>
  );
});

