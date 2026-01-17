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
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isHarmonizing, setIsHarmonizing] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
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
    if (!content) {
      console.error("Cannot download: content is empty");
      return;
    }
    
    setIsDownloading(true);
    try {
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
        } catch (err: any) {
          // Check if user cancelled (DOMException with name "AbortError")
          if (err?.name === "AbortError") {
            // User cancelled - silently ignore
            return;
          }
          // Actual error - fallback to download
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
    } catch (error) {
      console.error("Download failed:", error);
      // Note: downloadFile doesn't throw, but showSaveFilePicker might
      // User will see browser's download dialog or error
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopy = async (content: string) => {
    if (!content) {
      setCopyError("Nothing to copy");
      setTimeout(() => setCopyError(null), 3000);
      return;
    }
    
    setIsCopying(true);
    setCopyError(null);
    try {
      await copyToClipboard(content);
      // Success - clear error after brief delay to show success state
      setTimeout(() => setIsCopying(false), 500);
    } catch (error) {
      console.error("Copy failed:", error);
      setCopyError("Failed to copy to clipboard. Please try again.");
      setIsCopying(false);
      setTimeout(() => setCopyError(null), 5000);
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
          setIsHarmonizing(true);
          fetch("/api/harmonize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: result.tool === "ideas" ? "ideas" : "insights" }),
          })
            .then(async (res) => {
              if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
              }
              return res.json().catch(() => {
                throw new Error("Invalid JSON response from server");
              });
            })
            .then((data) => {
              setIsHarmonizing(false);
              if (data.success) {
                // Use a more user-friendly notification (could be replaced with toast library)
                const message = `✅ Harmonized ${data.filesProcessed} files: ${data.itemsAdded} added, ${data.itemsUpdated} updated`;
                // For now, use alert but could be replaced with toast notification
                alert(message);
                // Optionally refresh the page or update UI
                window.location.reload();
              } else {
                alert(`❌ Harmonization failed: ${data.error || "Unknown error"}`);
              }
            })
            .catch((err) => {
              setIsHarmonizing(false);
              console.error("Harmonize API error:", err);
              alert(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
            });
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
              disabled={isHarmonizing}
              className="px-4 py-2 bg-adobe-blue-600 hover:bg-adobe-blue-500 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isHarmonizing ? "⏳ Processing..." : friendlyError.cta.label}
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

        {/* Run Summary - Trust-Building Overview */}
        <div className="bg-black/20 rounded-lg p-4 space-y-4">
          {/* Step 1: Search Phase */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-adobe-gray-300 flex items-center gap-2">
              <span className="text-inspiration-ideas">①</span> Search Phase
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm pl-5">
              <div>
                <div className="text-adobe-gray-400 text-xs mb-1">Date Range</div>
                <div className="text-white font-medium">{result.stats.daysProcessed} days</div>
              </div>
              <div>
                <div className="text-adobe-gray-400 text-xs mb-1">Days with Relevant Chats</div>
                <div className="text-white font-medium">
                  {result.stats.daysWithActivity} of {result.stats.daysProcessed}
                  {result.stats.daysWithActivity < result.stats.daysProcessed && (
                    <span className="text-adobe-gray-500 text-xs ml-1">
                      ({result.stats.daysProcessed - result.stats.daysWithActivity} days had no extractable content)
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-adobe-gray-400 text-xs mb-1">Conversations Found</div>
                <div className="text-white font-medium">
                  {result.stats.conversationsAnalyzed ?? result.stats.daysWithActivity}
                  <span className="text-adobe-gray-500 text-xs ml-1">
                    (likely contain {result.tool === "ideas" ? "buildable ideas" : "shareable insights"})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Generation Phase */}
          <div className="space-y-2 pt-3 border-t border-white/10">
            <h3 className="text-sm font-medium text-adobe-gray-300 flex items-center gap-2">
              <span className="text-inspiration-ideas">②</span> Generation Phase
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm pl-5">
              <div>
                <div className="text-adobe-gray-400 text-xs mb-1">Items Generated by AI</div>
                <div className="text-white font-medium">{result.stats.itemsGenerated ?? 0}</div>
              </div>
              <div>
                <div className="text-adobe-gray-400 text-xs mb-1">After Self-Dedup</div>
                <div className="text-white font-medium">
                  {result.stats.itemsAfterDedup ?? result.stats.itemsGenerated ?? 0}
                  {(result.stats.itemsGenerated ?? 0) > (result.stats.itemsAfterDedup ?? result.stats.itemsGenerated ?? 0) ? (
                    <span className="text-adobe-gray-500 text-xs ml-1">
                      ({(result.stats.itemsGenerated ?? 0) - (result.stats.itemsAfterDedup ?? result.stats.itemsGenerated ?? 0)} too similar to each other)
                    </span>
                  ) : (
                    <span className="text-adobe-gray-500 text-xs ml-1">(all unique)</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-adobe-gray-400 text-xs mb-1">Sent to Library</div>
                <div className="text-white font-medium">{result.stats.itemsAfterDedup ?? result.stats.itemsGenerated ?? 0}</div>
              </div>
            </div>
          </div>

          {/* Step 3: Library Integration */}
          {result.stats.harmonization && (
            <div className="space-y-2 pt-3 border-t border-white/10">
              <h3 className="text-sm font-medium text-adobe-gray-300 flex items-center gap-2">
                <span className="text-inspiration-ideas">③</span> Library Integration
              </h3>
              {/* Show if items were filtered before library integration */}
              {(result.stats.itemsAfterDedup ?? result.stats.itemsGenerated ?? 0) > result.stats.harmonization.itemsProcessed && (
                <div className="text-xs text-adobe-gray-500 pl-5 -mt-1">
                  {(result.stats.itemsAfterDedup ?? result.stats.itemsGenerated ?? 0) - result.stats.harmonization.itemsProcessed} items filtered (topic already covered in Library or parsing failed)
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm pl-5">
                <div>
                  <div className="text-adobe-gray-400 text-xs mb-1">Compared to Library</div>
                  <div className="text-white font-medium">{result.stats.harmonization.itemsProcessed}</div>
                </div>
                <div>
                  <div className="text-adobe-gray-400 text-xs mb-1">New (Added)</div>
                  <div className="text-inspiration-ideas font-medium">
                    +{result.stats.harmonization.itemsAdded}
                    {result.stats.harmonization.itemsAdded > 0 && (
                      <span className="text-adobe-gray-500 text-xs ml-1">(unique)</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-adobe-gray-400 text-xs mb-1">Existing (Merged)</div>
                  <div className="text-inspiration-insights font-medium">
                    {result.stats.harmonization.itemsUpdated}
                    {result.stats.harmonization.itemsUpdated > 0 && (
                      <span className="text-adobe-gray-500 text-xs ml-1">(occurrence +1)</span>
                    )}
                  </div>
                </div>
              </div>
              {/* Accounting verification */}
              <div className="pl-5 text-xs">
                <span className={`font-medium ${
                  result.stats.harmonization.itemsAdded + result.stats.harmonization.itemsUpdated === result.stats.harmonization.itemsProcessed
                    ? 'text-green-400'
                    : 'text-yellow-400'
                }`}>
                  ✓ Accounting: {result.stats.harmonization.itemsAdded} new + {result.stats.harmonization.itemsUpdated} merged = {result.stats.harmonization.itemsProcessed} processed
                </span>
              </div>
              
              {/* Outcome Summary */}
              <div className="mt-3 p-3 bg-adobe-gray-800/50 rounded text-sm">
                {result.stats.harmonization.itemsAdded > 0 && result.stats.harmonization.itemsUpdated > 0 && (
                  <p className="text-adobe-gray-300">
                    ✅ <strong>{result.stats.harmonization.itemsAdded}</strong> new {result.tool === "ideas" ? "ideas" : "insights"} added to your Library. 
                    <strong> {result.stats.harmonization.itemsUpdated}</strong> existing items were reinforced (they appeared again, so their occurrence count increased).
                  </p>
                )}
                {result.stats.harmonization.itemsAdded > 0 && result.stats.harmonization.itemsUpdated === 0 && (
                  <p className="text-adobe-gray-300">
                    ✅ <strong>{result.stats.harmonization.itemsAdded}</strong> new {result.tool === "ideas" ? "ideas" : "insights"} added to your Library. All were unique—no duplicates with existing items.
                  </p>
                )}
                {result.stats.harmonization.itemsAdded === 0 && result.stats.harmonization.itemsUpdated > 0 && (
                  <p className="text-adobe-gray-300">
                    ℹ️ No new items added, but <strong>{result.stats.harmonization.itemsUpdated}</strong> existing Library items were reinforced (the same topics came up again). This means you&apos;ve already captured these patterns—great coverage!
                  </p>
                )}
                {result.stats.harmonization.itemsProcessed > 0 && 
                 result.stats.harmonization.itemsAdded === 0 && 
                 result.stats.harmonization.itemsUpdated === 0 && (
                  <p className="text-adobe-gray-300">
                    ℹ️ All {result.stats.harmonization.itemsProcessed} generated items were too similar to items already in your Library. Your Library already has good coverage of these topics.
                  </p>
                )}
              </div>
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
                disabled={isDownloading || !result.content}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Save result to file"
              >
                <span aria-hidden="true">{isDownloading ? "⏳" : "💾"}</span> {isDownloading ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => result.content && handleCopy(result.content)}
                disabled={isCopying || !result.content}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Copy result to clipboard"
              >
                <span aria-hidden="true">{isCopying ? "✓" : "📋"}</span> {isCopying ? "Copied!" : "Copy"}
              </button>
              {copyError && (
                <span className="text-xs text-red-400" role="alert">
                  {copyError}
                </span>
              )}
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

      {/* Explanatory messages when content is not displayed */}
      {!result.content && harmonizedItems === 0 && !result.stats.harmonization?.itemsUpdated && (
        <div className="p-4 bg-adobe-gray-800/50 rounded-lg">
          <p className="text-adobe-gray-400">
            No {result.tool === "ideas" ? "ideas" : "insights"} were generated. The conversations in this date range may have been routine work (debugging, configuration, etc.) without notable patterns worth extracting.
          </p>
          <p className="text-adobe-gray-500 text-sm mt-2">
            💡 Try: A different date range, higher temperature for more creative extraction, or check that your conversations contain the type of content you&apos;re looking for.
          </p>
        </div>
      )}
      
      {/* Success case: Items were processed but output file was cleaned up (normal behavior) */}
      {!result.content && (harmonizedItems > 0 || (result.stats.harmonization?.itemsUpdated ?? 0) > 0) && (
        <div className="p-4 bg-inspiration-ideas/10 border border-inspiration-ideas/30 rounded-lg">
          <p className="text-adobe-gray-300">
            ✅ <strong>Run completed successfully.</strong> {harmonizedItems > 0 && (
              <>{harmonizedItems} new {result.tool === "ideas" ? "ideas" : "insights"} were added to your Library.</>
            )}
            {harmonizedItems === 0 && (result.stats.harmonization?.itemsUpdated ?? 0) > 0 && (
              <>{result.stats.harmonization?.itemsUpdated} existing items were reinforced.</>
            )}
          </p>
          <p className="text-adobe-gray-500 text-sm mt-2">
            The output file was automatically cleaned up after processing. View your Library to see all items.
          </p>
        </div>
      )}
    </section>
  );
});

