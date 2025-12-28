"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { ReverseMatchResult } from "@/lib/types";
import { copyToClipboard } from "@/lib/utils";
import { LoadingSpinner } from "./LoadingSpinner";
import { StopIcon } from "./StopIcon";

interface ReverseMatchSectionProps {
  showReverseMatch: boolean;
  setShowReverseMatch: (show: boolean) => void;
  query: string;
  setQuery: (q: string) => void;
  daysBack: number;
  setDaysBack: (d: number) => void;
  topK: number;
  setTopK: (k: number) => void;
  minSimilarity: number;
  setMinSimilarity: (s: number) => void;
  isMatching: boolean;
  setIsMatching: (m: boolean) => void;
  result: ReverseMatchResult | null;
  setResult: (r: ReverseMatchResult | null) => void;
  abortController: React.MutableRefObject<AbortController | null>;
}

export function ReverseMatchSection({
  query,
  setQuery,
  daysBack,
  setDaysBack,
  topK,
  setTopK,
  minSimilarity,
  setMinSimilarity,
  isMatching,
  setIsMatching,
  result,
  setResult,
  abortController,
}: ReverseMatchSectionProps) {
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

    setIsMatching(true);
    setResult(null);

    // Create new AbortController for this request
    abortController.current = new AbortController();

    try {
      const response = await fetch("/api/reverse-match", {
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
          matches: [],
          stats: {
            totalMessages: 0,
            matchesFound: 0,
            daysSearched: daysBack,
            conversationsExamined: 0,
          },
          error: "Search cancelled",
        });
      } else {
        setResult({
          success: false,
          query: query.trim(),
          matches: [],
          stats: {
            totalMessages: 0,
            matchesFound: 0,
            daysSearched: daysBack,
            conversationsExamined: 0,
          },
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    } finally {
      abortController.current = null;
      setIsMatching(false);
    }
  }, [query, daysBack, topK, minSimilarity, lastSearchTime, abortController, setIsMatching, setResult]);

  const handleStop = () => {
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null; // Clear after abort
    }
  };

  // Memoize formatTimestamp function to avoid recreation on every render
  const formatTimestamp = useMemo(
    () => (ts: number): string => {
      try {
        const date = new Date(ts);
        return date.toLocaleString();
      } catch {
        return String(ts);
      }
    },
    []
  );

  return (
    <section className="glass-card p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <span>🔍</span> Reverse Match
        </h2>
        <p className="text-adobe-gray-400">
          Enter your insight or idea to find matching examples from your chat history
        </p>
      </div>

      {/* Query Input */}
      <div className="space-y-4">
          <div>
            <label htmlFor="reverse-query" className="block text-sm font-medium text-adobe-gray-300 mb-2">
              Your Insight or Idea
            </label>
            <textarea
              id="reverse-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., 'I should build a tool that helps with X' or 'Key insight about Y'"
              className="input-field w-full min-h-[120px] resize-y"
              disabled={isMatching}
              aria-describedby="reverse-query-help"
            />
            <p id="reverse-query-help" className="text-xs text-adobe-gray-500 mt-1">
              Describe your insight or idea. The system will search your chat history for related conversations.
            </p>
          </div>

        {/* Settings */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="reverse-days-back" className="block text-sm text-adobe-gray-400 mb-1">
              Days Back: {daysBack}
            </label>
            <input
              id="reverse-days-back"
              type="range"
              min={7}
              max={90}
              value={daysBack}
              onChange={(e) => setDaysBack(parseInt(e.target.value))}
              className="slider-track w-full"
              disabled={isMatching}
              aria-label={`Days back to search: ${daysBack} (maximum 90 days)`}
              aria-valuemin={7}
              aria-valuemax={90}
              aria-valuenow={daysBack}
            />
          </div>
          <div>
            <label htmlFor="reverse-top-k" className="block text-sm text-adobe-gray-400 mb-1">
              Top Results: {topK}
            </label>
            <input
              id="reverse-top-k"
              type="range"
              min={5}
              max={50}
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value))}
              className="slider-track w-full"
              disabled={isMatching}
              aria-label={`Maximum number of results: ${topK}`}
              aria-valuemin={5}
              aria-valuemax={50}
              aria-valuenow={topK}
            />
          </div>
          <div>
            <label htmlFor="reverse-min-similarity" className="block text-sm text-adobe-gray-400 mb-1">
              Min Similarity: {minSimilarity.toFixed(2)}
            </label>
            <input
              id="reverse-min-similarity"
              type="range"
              min={0}
              max={100}
              value={minSimilarity * 100}
              onChange={(e) => setMinSimilarity(parseInt(e.target.value) / 100)}
              className="slider-track w-full"
              disabled={isMatching}
              aria-label={`Minimum similarity threshold: ${(minSimilarity * 100).toFixed(0)}%`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={minSimilarity * 100}
            />
          </div>
        </div>

        {/* Search Button / Stop Button */}
        {isMatching ? (
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
            aria-busy={false}
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
              {result.stats.totalMessages > 0 && (
                <div className="bg-black/20 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-medium text-adobe-gray-300">Search Attempted</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-adobe-gray-400 text-xs mb-1">Date Range</div>
                      <div className="text-white font-medium">
                        {result.stats.startDate && result.stats.endDate
                          ? `${new Date(result.stats.startDate).toLocaleDateString()} - ${new Date(result.stats.endDate).toLocaleDateString()}`
                          : `${result.stats.daysSearched} days back`}
                      </div>
                    </div>
                    <div>
                      <div className="text-adobe-gray-400 text-xs mb-1">Conversations Examined</div>
                      <div className="text-white font-medium">
                        {result.stats.conversationsExamined ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-adobe-gray-400 text-xs mb-1">Messages Searched</div>
                      <div className="text-white font-medium">{result.stats.totalMessages}</div>
                    </div>
                    <div>
                      <div className="text-adobe-gray-400 text-xs mb-1">Matches Found</div>
                      <div className="text-adobe-gray-400 font-medium">{result.stats.matchesFound}</div>
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-adobe-gray-400 text-xs mb-1">Date Range</div>
                    <div className="text-white font-medium">
                      {result.stats.startDate && result.stats.endDate
                        ? `${new Date(result.stats.startDate).toLocaleDateString()} - ${new Date(result.stats.endDate).toLocaleDateString()}`
                        : `${result.stats.daysSearched} days back`}
                    </div>
                  </div>
                  <div>
                    <div className="text-adobe-gray-400 text-xs mb-1">Conversations Examined</div>
                    <div className="text-white font-medium">
                      {result.stats.conversationsExamined ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-adobe-gray-400 text-xs mb-1">Messages Searched</div>
                    <div className="text-white font-medium">{result.stats.totalMessages}</div>
                  </div>
                  <div>
                    <div className="text-adobe-gray-400 text-xs mb-1">Matches Found</div>
                    <div className={`font-medium ${
                      result.stats.matchesFound > 0 
                        ? "text-inspiration-insights" 
                        : "text-adobe-gray-400"
                    }`}>
                      {result.stats.matchesFound}
                    </div>
                  </div>
                </div>
              </div>

              {result.matches.length === 0 ? (
                <div className="p-6 bg-adobe-gray-800/50 rounded-lg border border-white/10">
                  <div className="text-center space-y-3">
                    <div className="text-4xl mb-2">🔍</div>
                    <h3 className="text-lg font-semibold text-white">
                      Search Completed — No Matches Found
                    </h3>
                    <p className="text-adobe-gray-300">
                      We searched through <strong>{result.stats.totalMessages} messages</strong> from{" "}
                      {result.stats.conversationsExamined ? (
                        <strong>{result.stats.conversationsExamined} conversations</strong>
                      ) : (
                        "your chat history"
                      )}{" "}
                      {result.stats.startDate && result.stats.endDate ? (
                        <>between <strong>{new Date(result.stats.startDate).toLocaleDateString()}</strong> and{" "}
                        <strong>{new Date(result.stats.endDate).toLocaleDateString()}</strong></>
                      ) : (
                        <>over the last <strong>{result.stats.daysSearched} days</strong></>
                      )}, but no messages met the similarity threshold.
                    </p>
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <p className="text-sm font-medium text-adobe-gray-300 mb-2">Try adjusting your search:</p>
                      <ul className="text-sm text-adobe-gray-400 space-y-1 text-left max-w-md mx-auto">
                        <li>• Lower the minimum similarity threshold (currently {(minSimilarity * 100).toFixed(0)}%)</li>
                        <li>• Increase the days back to search (currently {daysBack} days)</li>
                        <li>• Reword your query to use different keywords</li>
                        <li>• Try a broader or more general version of your insight</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {result.matches.map((match, idx) => (
                    <div
                      key={`match-${match.message.timestamp}-${idx}-${match.similarity}`}
                      className="p-4 bg-black/30 rounded-lg border border-white/10"
                    >
                      {/* Match Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-inspiration-insights">
                            Match #{idx + 1}
                          </span>
                          <span className="text-sm text-adobe-gray-400">
                            Similarity: {(match.similarity * 100).toFixed(1)}%
                          </span>
                          {match.message.chat_type && (
                            <span className="text-xs px-2 py-0.5 bg-white/10 rounded-full text-adobe-gray-400">
                              {match.message.chat_type === "composer" ? "Composer" : "Chat"}
                            </span>
                          )}
                        </div>
                        {match.message.workspace && (
                          <span className="text-xs text-adobe-gray-500">
                            {match.message.workspace.split("/").pop()}
                          </span>
                        )}
                      </div>

                      {/* Context Before */}
                      {match.context.before.length > 0 && (
                        <div className="mb-3 p-2 bg-white/5 rounded text-sm">
                          <p className="text-xs text-adobe-gray-500 mb-1">Previous messages:</p>
                          {match.context.before.map((msg, i) => (
                            <div key={`before-${msg.timestamp}-${i}`} className="text-adobe-gray-400 text-xs mb-1">
                              <span className="font-mono">
                                {msg.type === "user" ? "USER" : "ASSISTANT"}
                              </span>
                              : {msg.text.slice(0, 150)}
                              {msg.text.length > 150 && "..."}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Matched Message */}
                      <div className="p-3 bg-inspiration-insights/10 border border-inspiration-insights/30 rounded">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono text-inspiration-insights">
                            {match.message.type === "user" ? "USER" : "ASSISTANT"}
                          </span>
                          <span className="text-xs text-adobe-gray-400">
                            {formatTimestamp(match.message.timestamp)}
                          </span>
                        </div>
                        <p className="text-white whitespace-pre-wrap">{match.message.text}</p>
                      </div>

                      {/* Context After */}
                      {match.context.after.length > 0 && (
                        <div className="mt-3 p-2 bg-white/5 rounded text-sm">
                          <p className="text-xs text-adobe-gray-500 mb-1">Following messages:</p>
                          {match.context.after.map((msg, i) => (
                            <div key={`after-${msg.timestamp}-${i}`} className="text-adobe-gray-400 text-xs mb-1">
                              <span className="font-mono">
                                {msg.type === "user" ? "USER" : "ASSISTANT"}
                              </span>
                              : {msg.text.slice(0, 150)}
                              {msg.text.length > 150 && "..."}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Copy Button */}
                      <button
                        onClick={() => {
                          const text = [
                            `Match #${idx + 1} (Similarity: ${(match.similarity * 100).toFixed(1)}%)`,
                            `Timestamp: ${formatTimestamp(match.message.timestamp)}`,
                            `Workspace: ${match.message.workspace || "Unknown"}`,
                            "",
                            match.message.text,
                          ].join("\n");
                          copyToClipboard(text);
                        }}
                        className="mt-2 text-xs px-2 py-1 bg-white/10 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-inspiration-insights/50 rounded transition-colors"
                        aria-label={`Copy match ${idx + 1} message to clipboard`}
                      >
                        <span aria-hidden="true">📋</span> Copy Message
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

