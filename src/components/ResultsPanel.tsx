"use client";

import { useState, memo, useMemo } from "react";
import { GenerateResult, TOOL_CONFIG, RankedItem } from "@/lib/types";
import { copyToClipboard, downloadFile } from "@/lib/utils";
import { MarkdownContent } from "./MarkdownContent";
import { parseRankedItems, extractEstimatedCost } from "@/lib/resultParser";

export const ResultsPanel = memo(function ResultsPanel({ result }: { result: GenerateResult }) {
  const [showRaw, setShowRaw] = useState(false);

  // Parse ranked items from content
  const rankedItems = useMemo(() => {
    if (result.items) {
      return result.items; // Already parsed
    }
    if (result.content) {
      return parseRankedItems(result.content, result.tool);
    }
    return [];
  }, [result.items, result.content, result.tool]);

  // Get estimated cost
  const estimatedCost = useMemo(() => {
    if (result.estimatedCost !== undefined) {
      return result.estimatedCost;
    }
    if (result.content) {
      return extractEstimatedCost(result.content, result.stats.candidatesGenerated ?? 1);
    }
    return (result.stats.candidatesGenerated ?? 1) * 0.023 + 0.025; // Fallback estimate
  }, [result.estimatedCost, result.content, result.stats.candidatesGenerated]);

  const downloadResult = async (content: string) => {
    // Show file picker dialog
    if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
      try {
        const timestamp = new Date().toISOString().split("T")[0];
        const filename = `${result.tool}_${timestamp}.md`;
        
        // @ts-ignore - showSaveFilePicker is available in modern browsers
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: "Markdown files",
            accept: { "text/markdown": [".md"] },
          }],
        });
        
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
      } catch (err) {
        // User cancelled or error - fallback to download
        const timestamp = new Date().toISOString().split("T")[0];
        const filename = `${result.tool}_${timestamp}.md`;
        downloadFile(content, filename);
      }
    } else {
      // Fallback for browsers without File System Access API
      const timestamp = new Date().toISOString().split("T")[0];
      const filename = `${result.tool}_${timestamp}.md`;
      downloadFile(content, filename);
    }
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

  // Show success header only if content was actually generated
  const hasContent = result.content && result.content.trim().length > 0;
  const hasItems = result.items && result.items.length > 0;
  const actuallySuccessful = hasContent || hasItems;
  
  return (
    <section className="glass-card p-6 space-y-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className={`text-lg font-medium flex items-center gap-2 ${
            actuallySuccessful 
              ? `text-inspiration-ideas` 
              : `text-adobe-gray-400`
          }`}>
            {actuallySuccessful ? "✅" : "⚠️"} Generated {TOOL_CONFIG[result.tool].label}
          </h2>
          {estimatedCost > 0 && (
            <span className="text-xs text-adobe-gray-400">
              Estimated cost: ${estimatedCost.toFixed(3)}
            </span>
          )}
        </div>

        {/* Agentic Journey Stats */}
        <div className="bg-black/20 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium text-adobe-gray-300">Agentic Journey</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-adobe-gray-400 text-xs mb-1">Conversations Analyzed</div>
              <div className="text-white font-medium">
                {result.stats.conversationsAnalyzed ?? result.stats.daysWithActivity}
              </div>
            </div>
            <div>
              <div className="text-adobe-gray-400 text-xs mb-1">Days Processed</div>
              <div className="text-white font-medium">{result.stats.daysProcessed}</div>
            </div>
            <div>
              <div className="text-adobe-gray-400 text-xs mb-1">Candidates Generated</div>
              <div className="text-white font-medium">{result.stats.candidatesGenerated}</div>
            </div>
            <div>
              <div className="text-adobe-gray-400 text-xs mb-1">Days with Output</div>
              <div className="text-white font-medium">{result.stats.daysWithOutput}</div>
            </div>
          </div>

          {/* Harmonization Stats */}
          {result.stats.harmonization && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <h4 className="text-xs font-medium text-adobe-gray-300 mb-2">Harmonization with Bank</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-adobe-gray-400 text-xs mb-1">Items Processed</div>
                  <div className="text-white font-medium">{result.stats.harmonization.itemsProcessed}</div>
                </div>
                <div>
                  <div className="text-adobe-gray-400 text-xs mb-1">New Items Added</div>
                  <div className="text-inspiration-ideas font-medium">
                    {result.stats.harmonization.itemsAdded}
                  </div>
                </div>
                <div>
                  <div className="text-adobe-gray-400 text-xs mb-1">Items Updated</div>
                  <div className="text-inspiration-insights font-medium">
                    {result.stats.harmonization.itemsUpdated}
                  </div>
                </div>
                <div>
                  <div className="text-adobe-gray-400 text-xs mb-1">Deduplicated</div>
                  <div className="text-adobe-gray-400 font-medium">
                    {result.stats.harmonization.itemsDeduplicated}
                  </div>
                </div>
              </div>
              {result.stats.harmonization.itemsProcessed > 0 && 
               result.stats.harmonization.itemsAdded === 0 && 
               result.stats.harmonization.itemsUpdated === 0 && (
                <div className="mt-3 p-2 bg-adobe-gray-800/50 rounded text-xs text-adobe-gray-300">
                  ℹ️ All generated items were deduplicated against existing bank entries. No new unique {result.tool === "ideas" ? "ideas" : "insights"} found.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Ranked Items Display */}
      {rankedItems.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-adobe-gray-300">
              Generated Items ({rankedItems.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => result.content && downloadResult(result.content)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Save result to file"
              >
                <span aria-hidden="true">💾</span> Save
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

          <div className="space-y-3">
            {rankedItems.map((item) => (
              <div
                key={item.id}
                className={`bg-black/30 rounded-xl p-4 border-2 transition-all ${
                  item.isBest
                    ? "border-inspiration-ideas bg-inspiration-ideas/10"
                    : "border-white/10"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
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
                    <div className="text-sm text-adobe-gray-300">
                      <MarkdownContent content={item.rawMarkdown} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fallback: Show raw content if no items parsed */}
      {result.content && rankedItems.length === 0 && (
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
                aria-label="Save result to file"
              >
                <span aria-hidden="true">💾</span> Save
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
});

