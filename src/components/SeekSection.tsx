"use client";

import { useState, useCallback } from "react";
import { SeekResult } from "@/lib/types";
// copyToClipboard imported but may be used in future for individual item copy
import { LoadingSpinner } from "./LoadingSpinner";
import { StopIcon } from "./StopIcon";
import { MarkdownContent } from "./MarkdownContent";

interface SeekSectionProps {
  showSeek: boolean;
  setShowSeek: (show: boolean) => void;
  query: string;
  setQuery: (q: string) => void;
  daysBack: number;
  setDaysBack: (d: number) => void;
  topK: number;
  setTopK: (k: number) => void;
  minSimilarity: number;
  setMinSimilarity: (s: number) => void;
  isSeeking: boolean;
  setIsSeeking: (m: boolean) => void;
  result: SeekResult | null;
  setResult: (r: SeekResult | null) => void;
  abortController: React.MutableRefObject<AbortController | null>;
}

export function SeekSection({
  query,
  setQuery,
  daysBack,
  setDaysBack,
  topK,
  setTopK,
  minSimilarity,
  setMinSimilarity,
  isSeeking,
  setIsSeeking,
  result,
  setResult,
  abortController,
}: SeekSectionProps) {
  // Debounce search to prevent rapid successive calls
  const [lastSearchTime, setLastSearchTime] = useState<number>(0);
  const SEARCH_DEBOUNCE_MS = 500; // Minimum 500ms between searches

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    // Debounce: prevent rapid successive searches
    const now = Date.now();
    if (now - lastSearchTime < SEARCH_DEBOUNCE_MS) {
      return;
    }
    setLastSearchTime(now);

    setIsSeeking(true);
    setResult(null);

    // Create new AbortController for this request
    abortController.current = new AbortController();

    try {
      const response = await fetch("/api/seek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          daysBack,
          topK,
          minSimilarity,
        }),
        signal: abortController.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (error) {
      // Check if this was an abort
      if (error instanceof Error && error.name === "AbortError") {
        setResult({
          success: false,
          query: query.trim(),
          stats: {
            conversationsAnalyzed: 0,
            daysSearched: daysBack,
            useCasesFound: 0,
          },
          error: "Search cancelled",
        });
      } else {
        setResult({
          success: false,
          query: query.trim(),
          stats: {
            conversationsAnalyzed: 0,
            daysSearched: daysBack,
            useCasesFound: 0,
          },
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    } finally {
      abortController.current = null;
      setIsSeeking(false);
    }
  }, [query, daysBack, topK, minSimilarity, lastSearchTime, abortController, setIsSeeking, setResult]);

  const handleStop = () => {
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null; // Clear after abort
    }
  };


  return (
    <section className="glass-card p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <span>🔍</span> Use Case
        </h2>
        <p className="text-adobe-gray-400">
          Enter your insight or idea to find matching examples from your chat history
        </p>
      </div>

      {/* Query Input */}
      <div className="space-y-4">
          <div>
            <label htmlFor="seek-query" className="block text-sm font-medium text-adobe-gray-300 mb-2">
              Your Insight or Idea
            </label>
            <textarea
              id="seek-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., 'I should build a tool that helps with X' or 'Key insight about Y'"
              className="input-field w-full min-h-[120px] resize-y"
              disabled={isSeeking}
              aria-describedby="seek-query-help"
            />
            <p id="seek-query-help" className="text-xs text-adobe-gray-500 mt-1">
              Describe your insight or idea. The system will search your chat history for related conversations.
            </p>
          </div>

        {/* Settings */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="seek-days-back" className="block text-sm text-adobe-gray-400 mb-1">
              Days Back: {daysBack}
            </label>
            <input
              id="seek-days-back"
              type="range"
              min={7}
              max={365}
              value={daysBack}
              onChange={(e) => setDaysBack(parseInt(e.target.value))}
              className="slider-track w-full"
              disabled={isSeeking}
              aria-label={`Days back to search: ${daysBack}`}
              aria-valuemin={7}
              aria-valuemax={365}
              aria-valuenow={daysBack}
            />
          </div>
          <div>
            <label htmlFor="seek-top-k" className="block text-sm text-adobe-gray-400 mb-1">
              Top Results: {topK}
            </label>
            <input
              id="seek-top-k"
              type="range"
              min={5}
              max={50}
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value))}
              className="slider-track w-full"
              disabled={isSeeking}
              aria-label={`Maximum number of results: ${topK}`}
              aria-valuemin={5}
              aria-valuemax={50}
              aria-valuenow={topK}
            />
          </div>
          <div>
            <label htmlFor="seek-min-similarity" className="block text-sm text-adobe-gray-400 mb-1">
              Min Similarity: {minSimilarity.toFixed(2)}
            </label>
            <input
              id="seek-min-similarity"
              type="range"
              min={0}
              max={100}
              value={minSimilarity * 100}
              onChange={(e) => setMinSimilarity(parseInt(e.target.value) / 100)}
              className="slider-track w-full"
              disabled={isSeeking}
              aria-label={`Minimum similarity threshold: ${(minSimilarity * 100).toFixed(0)}%`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(minSimilarity * 100)}
            />
          </div>
        </div>

        {/* Search Button / Stop Button */}
        {isSeeking ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10">
              <LoadingSpinner />
              <span className="text-adobe-gray-300" aria-live="polite">
                Searching chat history...
              </span>
            </div>
            <button
              onClick={handleStop}
              className="w-full px-4 py-2 text-sm font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 border border-red-400/30 rounded-lg transition-colors flex items-center justify-center gap-2"
              aria-label="Stop search"
            >
              <StopIcon />
              Stop Search
            </button>
          </div>
        ) : (
          <button
            onClick={handleSearch}
            disabled={!query.trim()}
            className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span aria-hidden="true">🔍</span> Search Chat History
          </button>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4" aria-live="polite" aria-atomic="true">
          {result.error ? (
            <div className="space-y-3">
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 font-medium">Error: {result.error}</p>
              </div>
              {/* Show search stats even on error if available */}
              {result.stats.conversationsAnalyzed > 0 && (
                <div className="bg-black/20 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-medium text-adobe-gray-300">Search Attempted</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-adobe-gray-400 text-xs mb-1">Conversations Analyzed</div>
                      <div className="text-white font-medium">
                        {result.stats.conversationsAnalyzed}
                      </div>
                    </div>
                    <div>
                      <div className="text-adobe-gray-400 text-xs mb-1">Days Searched</div>
                      <div className="text-white font-medium">{result.stats.daysSearched}</div>
                    </div>
                    <div>
                      <div className="text-adobe-gray-400 text-xs mb-1">Use Cases Found</div>
                      <div className="text-adobe-gray-400 font-medium">{result.stats.useCasesFound}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Search Summary Stats */}
              <div className="bg-black/20 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium text-adobe-gray-300">Search Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-adobe-gray-400 text-xs mb-1">Conversations Analyzed</div>
                    <div className="text-white font-medium">
                      {result.stats.conversationsAnalyzed}
                    </div>
                  </div>
                  <div>
                    <div className="text-adobe-gray-400 text-xs mb-1">Days Searched</div>
                    <div className="text-white font-medium">{result.stats.daysSearched}</div>
                  </div>
                  <div>
                    <div className="text-adobe-gray-400 text-xs mb-1">Use Cases Found</div>
                    <div className={`font-medium ${
                      result.stats.useCasesFound > 0 
                        ? "text-inspiration-seek" 
                        : "text-adobe-gray-400"
                    }`}>
                      {result.stats.useCasesFound}
                    </div>
                  </div>
                </div>
              </div>

              {!result.content || result.stats.useCasesFound === 0 ? (
                <div className="p-6 bg-adobe-gray-800/50 rounded-lg border border-white/10">
                  <div className="text-center space-y-3">
                    <div className="text-4xl mb-2">🔍</div>
                    <h3 className="text-lg font-semibold text-white">
                      No Use Cases Found
                    </h3>
                    <p className="text-adobe-gray-300">
                      We searched through <strong>{result.stats.conversationsAnalyzed} conversations</strong>{" "}
                      over the last <strong>{result.stats.daysSearched} days</strong>, but no similar examples were found.
                    </p>
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <p className="text-sm font-medium text-adobe-gray-300 mb-2">Try adjusting your search:</p>
                      <ul className="text-sm text-adobe-gray-400 space-y-1 text-left max-w-md mx-auto">
                        <li>• Increase the days back to search (currently {daysBack} days)</li>
                        <li>• Reword your query to use different keywords</li>
                        <li>• Try a broader or more general version of your query</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Display synthesized use cases */}
                  {result.content && (
                    <div className="bg-black/20 rounded-lg p-6">
                      <h3 className="text-sm font-medium text-adobe-gray-300 mb-4">Synthesized Use Cases</h3>
                      <MarkdownContent content={result.content} />
                    </div>
                  )}
                  
                  {/* Display parsed items if available */}
                  {result.items && result.items.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-adobe-gray-300">Use Case Items</h3>
                      {result.items.map((item, idx) => (
                        <div
                          key={`use-case-${idx}`}
                          className="p-4 bg-black/30 rounded-lg border border-white/10"
                        >
                          <h4 className="text-lg font-semibold text-white mb-3">{item.title}</h4>
                          {item.what && (
                            <div className="mb-2">
                              <div className="text-xs text-adobe-gray-400 mb-1">What:</div>
                              <div className="text-sm text-white">{item.what}</div>
                            </div>
                          )}
                          {item.how && (
                            <div className="mb-2">
                              <div className="text-xs text-adobe-gray-400 mb-1">How:</div>
                              <div className="text-sm text-white">{item.how}</div>
                            </div>
                          )}
                          {item.context && (
                            <div className="mb-2">
                              <div className="text-xs text-adobe-gray-400 mb-1">Context:</div>
                              <div className="text-sm text-white">{item.context}</div>
                            </div>
                          )}
                          {item.similarity && (
                            <div className="mb-2">
                              <div className="text-xs text-adobe-gray-400 mb-1">Similarity:</div>
                              <div className="text-sm text-inspiration-seek">{item.similarity}</div>
                            </div>
                          )}
                          {item.takeaways && (
                            <div className="mt-3 pt-3 border-t border-white/10">
                              <div className="text-xs text-adobe-gray-400 mb-1">Key Takeaways:</div>
                              <div className="text-sm text-white whitespace-pre-wrap">{item.takeaways}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

