"use client";

import { useState, memo, useMemo } from "react";
import { useRouter } from "next/navigation";
import { GenerateResult, TOOL_CONFIG } from "@/lib/types";
import { copyToClipboard, downloadFile } from "@/lib/utils";
import { MarkdownContent } from "./MarkdownContent";
import { parseRankedItems, extractEstimatedCost } from "@/lib/resultParser";
import { getFriendlyError, FriendlyError } from "@/lib/errorMessages";
import { validateAndLog } from "@/lib/statsValidator";

interface ResultsPanelProps {
  result: GenerateResult;
  onRetry?: () => void;
  onRetryWithDays?: (days: number) => void;
}

export const ResultsPanel = memo(function ResultsPanel({ result, onRetry, onRetryWithDays }: ResultsPanelProps) {
  const [showRaw, setShowRaw] = useState(false);
  const router = useRouter();
  
  // Validate stats in development mode
  validateAndLog(result, 'ResultsPanel');

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
      return extractEstimatedCost(result.content, result.stats.itemsGenerated);
    }
    return result.stats.itemsGenerated * 0.01 + 0.05; // Fallback estimate (v2: single LLM call)
  }, [result.estimatedCost, result.content, result.stats.itemsGenerated]);

  const downloadResult = async (content: string) => {
    // Show file picker dialog
    if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
      try {
        const timestamp = new Date().toISOString().split("T")[0];
        const filename = `${result.tool}_${timestamp}.md`;
        
        // @ts-expect-error - showSaveFilePicker is available in modern browsers
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
      } catch {
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
    const friendlyError: FriendlyError = getFriendlyError(result.error || "Unknown error");
    
    const handleCTA = () => {
      if (!friendlyError.cta) return;
      
      switch (friendlyError.cta.action) {
        case "retry":
          onRetry?.();
          break;
        case "retry_smaller":
          // Retry with suggested smaller date range
          if (friendlyError.suggestedDays && onRetryWithDays) {
            onRetryWithDays(friendlyError.suggestedDays);
          } else {
            onRetry?.();
          }
          break;
        case "settings":
          router.push("/settings");
          break;
        case "external_link":
          if (friendlyError.cta.url) {
            window.open(friendlyError.cta.url, "_blank");
          }
          break;
        case "harmonize":
          // Call harmonize API
          fetch("/api/harmonize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: result.tool === "ideas" ? "ideas" : "insights" }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success) {
                alert(`✅ Harmonized ${data.filesProcessed} files: ${data.itemsAdded} added, ${data.itemsUpdated} updated`);
              } else {
                alert(`❌ Harmonization failed: ${data.error}`);
              }
            })
            .catch((err) => alert(`❌ Error: ${err}`));
          break;
      }
    };
    
    const borderColor = friendlyError.severity === "warning" ? "border-yellow-500/30" : "border-red-500/30";
    const iconColor = friendlyError.severity === "warning" ? "text-yellow-400" : "text-red-400";
    const icon = friendlyError.severity === "warning" ? "⚠️" : "❌";
    
    return (
      <section className={`glass-card p-6 ${borderColor}`}>
        <h2 className={`text-lg font-medium ${iconColor} flex items-center gap-2`}>
          {icon} {friendlyError.title}
        </h2>
        <p className="text-adobe-gray-400 mt-2">{friendlyError.message}</p>
        
        {friendlyError.cta && (
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleCTA}
              className="px-4 py-2 bg-adobe-blue-600 hover:bg-adobe-blue-500 text-white rounded-md text-sm font-medium transition-colors"
            >
              {friendlyError.cta.label}
            </button>
            
            {/* Show raw error toggle for debugging */}
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="px-4 py-2 bg-adobe-gray-700 hover:bg-adobe-gray-600 text-adobe-gray-300 rounded-md text-sm transition-colors"
            >
              {showRaw ? "Hide Details" : "Show Details"}
            </button>
          </div>
        )}
        
        {showRaw && (
          <pre className="mt-4 p-3 bg-adobe-gray-900 rounded text-xs text-adobe-gray-400 overflow-x-auto whitespace-pre-wrap">
            {result.error}
          </pre>
        )}
      </section>
    );
  }

  // Show success if content was generated OR items were harmonized into Library
  const hasContent = result.content && result.content.trim().length > 0;
  const hasItems = result.items && result.items.length > 0;
  const harmonizedItems = result.stats.harmonization?.itemsAdded ?? 0;
  const actuallySuccessful = hasContent || hasItems || harmonizedItems > 0;
  
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
              <div className="text-adobe-gray-400 text-xs mb-1">Days with Activity</div>
              <div className="text-white font-medium">{result.stats.daysWithActivity} of {result.stats.daysProcessed}</div>
            </div>
            <div>
              <div className="text-adobe-gray-400 text-xs mb-1">Items Generated</div>
              <div className="text-white font-medium">{result.stats.itemsGenerated ?? 0}</div>
            </div>
            <div>
              <div className="text-adobe-gray-400 text-xs mb-1">Items in Output File</div>
              <div className="text-white font-medium">{result.stats.daysWithOutput > 0 ? 'Yes' : 'No'}</div>
            </div>
          </div>

          {/* Harmonization Stats */}
          {result.stats.harmonization && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <h4 className="text-xs font-medium text-adobe-gray-300 mb-2">Harmonization with Library</h4>
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
                  ℹ️ All generated items were deduplicated against existing library entries. No new unique {result.tool === "ideas" ? "ideas" : "insights"} found.
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

      {!result.content && harmonizedItems === 0 && (
        <p className="text-adobe-gray-400">
          No output generated. The conversations may have been routine work without
          notable patterns.
        </p>
      )}
      
      {!result.content && harmonizedItems > 0 && (
        <div className="p-4 bg-adobe-blue-900/20 border border-adobe-blue-500/30 rounded-lg">
          <p className="text-adobe-gray-300">
            ℹ️ No new items were generated in this run, but <strong>{harmonizedItems} items</strong> from previous runs were successfully harmonized into your Library.
          </p>
        </div>
      )}
    </section>
  );
});

