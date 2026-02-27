"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { SeekResult } from "@/lib/types";
import { LoadingSpinner } from "./LoadingSpinner";
import { StopIcon } from "./StopIcon";
import { MarkdownContent } from "./MarkdownContent";

// Progress phase for Seek
type SeekPhase = 
  | "confirming"
  | "searching" 
  | "compressing"
  | "generating"
  | "parsing"
  | "saving"
  | "integrating"
  | "complete"
  | "stopping"
  | "stopped"
  | "error";

interface SeekProgressData {
  // Request confirmation
  query?: string;
  daysBack?: number;
  minSimilarity?: number;
  
  // Search phase
  conversationsFound?: number;
  daysSearched?: number;
  
  // Compression phase
  conversationsToCompress?: number;
  
  // Generation phase
  useCasesParsed?: number;
  
  // Integration phase
  useCasesAdded?: number;
  useCasesMerged?: number;  // Duplicates found during harmonization
  
  // Intra-phase progress
  currentItem?: number;
  totalItems?: number;
  progressLabel?: string;
  
  // Cost tracking
  tokensIn?: number;
  tokensOut?: number;
  cumulativeCost?: number;
  
  // Warnings
  warnings?: string[];
  
  // Performance summary
  totalSeconds?: number;
  totalCost?: number;
}

interface SeekSectionProps {
  showSeek: boolean;
  setShowSeek: (show: boolean) => void;
  query: string;
  setQuery: (q: string) => void;
  daysBack: number;
  setDaysBack: (d: number) => void;
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
  const SEARCH_DEBOUNCE_MS = 500;

  // Progress tracking state
  const [progressPhase, setProgressPhase] = useState<SeekPhase>("confirming");
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [progressData, setProgressData] = useState<SeekProgressData>({});
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  
  // S8 Fix: Use ref to track latest progress data (avoid stale closure)
  const progressDataRef = useRef<SeekProgressData>({});
  
  // S3/S10 Fix: Track if complete marker was received
  const receivedCompleteMarker = useRef<boolean>(false);
  
  // S4 Fix: Streaming timeout (60 seconds)
  const STREAM_TIMEOUT_MS = 60000;

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const formatCost = (cost: number): string => {
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  // Phase display info
  const phaseInfo: Record<SeekPhase, { icon: string; label: string }> = {
    confirming: { icon: "📋", label: "Confirming request..." },
    searching: { icon: "🔍", label: "Searching chat history..." },
    compressing: { icon: "📦", label: "Preparing conversations..." },
    generating: { icon: "🧠", label: "Synthesizing use cases..." },
    parsing: { icon: "📝", label: "Extracting use cases..." },
    saving: { icon: "💾", label: "Saving results..." },
    integrating: { icon: "📚", label: "Adding to Library..." },
    complete: { icon: "✅", label: "Complete!" },
    stopping: { icon: "⏹", label: "Stopping..." },
    stopped: { icon: "⏹", label: "Stopped" },
    error: { icon: "❌", label: "Error" },
  };

  // Progress percentage based on phase
  const phaseProgress: Record<SeekPhase, number> = {
    confirming: 5,
    searching: 20,
    compressing: 40,
    generating: 60,
    parsing: 75,
    saving: 85,
    integrating: 95,
    complete: 100,
    stopping: 50,
    stopped: 50,
    error: 0,
  };

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
    setProgressPhase("confirming");
    setProgressMessage("Starting search...");
    const initialData = {
      query: query.trim(),
      daysBack,
      minSimilarity,
    };
    setProgressData(initialData);
    progressDataRef.current = initialData; // S8 Fix: Reset ref
    receivedCompleteMarker.current = false; // S3/S10 Fix: Reset marker
    setElapsedSeconds(0);

    // Issue #26: Fetch library count before search (for verification)
    let libraryCountBefore: number | null = null;
    try {
      const libRes = await fetch("/api/items?view=items");
      if (!libRes.ok) {
        const errorText = await libRes.text().catch(() => `HTTP ${libRes.status}`);
        console.error("[Seek] Failed to fetch library count before:", errorText.length > 100 ? libRes.status : errorText);
        // Continue with generation even if library count fetch fails
      } else {
        const libData = await libRes.json().catch((parseError) => {
          throw new Error(`Invalid response format: ${parseError.message}`);
        });
        if (libData && typeof libData === 'object' && libData.success) {
          libraryCountBefore = libData.stats?.totalItems || 0;
        }
      }
    } catch (e) {
      console.error("[Seek] Failed to fetch library count before:", e);
      // Continue with generation even if library count fetch fails
    }

    // Create new AbortController for this request
    abortController.current = new AbortController();

    // Start elapsed time tracking
    const startTime = Date.now();
    progressInterval.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);
    }, 500);

    try {
      // Use streaming API for real-time progress
      const response = await fetch("/api/seek-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          daysBack,
          minSimilarity,
        }),
        signal: abortController.current.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`Request failed: ${errorText.length > 100 ? response.status : errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let streamResult: SeekResult | null = null;
      
      // S4 Fix: Timeout watchdog
      let lastActivityTime = Date.now();
      const timeoutRefs: NodeJS.Timeout[] = []; // Track timeouts for cleanup
      
      const readWithTimeout = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
        return Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            const checkTimeout = () => {
              // Check if request was aborted
              if (abortController.current?.signal.aborted) {
                reject(new Error("Request cancelled"));
                return;
              }
              
              if (Date.now() - lastActivityTime > STREAM_TIMEOUT_MS) {
                reject(new Error("Stream timeout - no response for 60 seconds. Check your Library for results."));
              } else {
                const timeoutId = setTimeout(checkTimeout, 5000);
                timeoutRefs.push(timeoutId);
              }
            };
            const initialTimeoutId = setTimeout(checkTimeout, STREAM_TIMEOUT_MS);
            timeoutRefs.push(initialTimeoutId);
          }),
        ]);
      };

      // Process SSE stream
      try {
        while (true) {
          const { done, value } = await readWithTimeout();
          if (done) {
            // Clean up timeouts when stream completes normally
            timeoutRefs.forEach(id => clearTimeout(id));
            timeoutRefs.length = 0;
            break;
          }
          
          // Reset timeout on activity
          lastActivityTime = Date.now();

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            
            try {
              const data = JSON.parse(line.slice(6));
              
              // Validate data structure before processing
              if (!data || typeof data !== 'object') {
                continue; // Skip invalid data
              }
              
              // Handle different message types from stream
              switch (data.type) {
              case "phase":
                setProgressPhase(data.phase as SeekPhase);
                setProgressMessage(phaseInfo[data.phase as SeekPhase]?.label || data.phase);
                break;
                
              case "stat":
                // S8 Fix: Update both state and ref
                progressDataRef.current = { ...progressDataRef.current, [data.key]: data.value };
                setProgressData(prev => ({
                  ...prev,
                  [data.key]: data.value,
                }));
                break;
                
              case "info":
                setProgressMessage(data.message);
                break;
                
              case "error":
                setProgressPhase("error");
                setProgressMessage(data.message || data.error);
                break;
                
              case "progress":
                // S8 Fix: Update both state and ref
                progressDataRef.current = { 
                  ...progressDataRef.current, 
                  currentItem: data.current,
                  totalItems: data.total,
                  progressLabel: data.label,
                };
                setProgressData(prev => ({
                  ...prev,
                  currentItem: data.current,
                  totalItems: data.total,
                  progressLabel: data.label,
                }));
                break;
                
              case "cost":
                // S8 Fix: Update both state and ref
                progressDataRef.current = { 
                  ...progressDataRef.current, 
                  tokensIn: (progressDataRef.current.tokensIn || 0) + (data.tokensIn || 0),
                  tokensOut: (progressDataRef.current.tokensOut || 0) + (data.tokensOut || 0),
                  cumulativeCost: data.cumulative || data.cost || 0,
                };
                setProgressData(prev => ({
                  ...prev,
                  tokensIn: (prev.tokensIn || 0) + (data.tokensIn || 0),
                  tokensOut: (prev.tokensOut || 0) + (data.tokensOut || 0),
                  cumulativeCost: data.cumulative || data.cost || 0,
                }));
                break;
                
              case "warning":
                // S8 Fix: Update both state and ref
                progressDataRef.current = { 
                  ...progressDataRef.current, 
                  warnings: [...(progressDataRef.current.warnings || []), data.message],
                };
                setProgressData(prev => ({
                  ...prev,
                  warnings: [...(prev.warnings || []), data.message],
                }));
                break;
                
              case "perf":
                // S8 Fix: Update both state and ref
                progressDataRef.current = { 
                  ...progressDataRef.current, 
                  totalSeconds: data.totalSeconds,
                  totalCost: data.cost,
                };
                setProgressData(prev => ({
                  ...prev,
                  totalSeconds: data.totalSeconds,
                  totalCost: data.cost,
                }));
                break;
                
              case "result":
                streamResult = data.result;
                break;
                
              case "complete":
                receivedCompleteMarker.current = true; // S3/S10 Fix
                setProgressPhase("complete");
                setProgressMessage("Search complete!");
                break;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      } finally {
        // Always clean up timeouts when stream processing ends
        timeoutRefs.forEach(id => clearTimeout(id));
        timeoutRefs.length = 0;
      }

      // S3/S10 Fix: Check if complete marker was received before verifying
      if (!receivedCompleteMarker.current) {
        console.warn("[Seek] Stream ended without complete marker - checking Library for partial results");
      }
      
      // Issue #26: Verify Library count increased (with retry for eventual consistency)
      // S8 Fix: Use ref instead of state to avoid stale closure
      const fetchLibraryCountWithRetry = async (retries = 3, delayMs = 500): Promise<number | null> => {
        for (let i = 0; i < retries; i++) {
          try {
            // Small delay before each attempt
            if (i > 0 || delayMs > 0) {
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            
            const response = await fetch("/api/items?view=items");
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json().catch((parseError) => {
              throw new Error(`Invalid response format: ${parseError.message}`);
            });
            
            if (data && typeof data === 'object' && data.success) {
              const newCount = data.stats?.totalItems || 0;
              // S8 Fix: Use ref instead of state
              const useCasesAdded = progressDataRef.current.useCasesAdded || 0;
              const _useCasesMerged = progressDataRef.current.useCasesMerged || 0;
              
              // If we added items but count didn't increase, retry
              // If all items were duplicates (useCasesAdded=0, useCasesMerged>0), count won't increase but that's expected
              if (useCasesAdded > 0 && libraryCountBefore !== null && newCount <= libraryCountBefore) {
                console.log(`[Seek] Count ${newCount} <= before ${libraryCountBefore}, retrying...`);
                delayMs = Math.min(delayMs * 2, 2000); // Exponential backoff, max 2s
                continue;
              }
              return newCount;
            }
          } catch (e) {
            console.error(`[Seek] Fetch attempt ${i + 1} failed:`, e);
          }
          delayMs = Math.min(delayMs * 2, 2000);
        }
        return null;
      };
      
      const finalCount = await fetchLibraryCountWithRetry();
      if (finalCount !== null && libraryCountBefore !== null) {
        const actualAdded = finalCount - libraryCountBefore;
        console.log(`[Seek] Library count: ${libraryCountBefore} → ${finalCount} (${actualAdded > 0 ? '+' : ''}${actualAdded})`);
        
        // S3 Fix: If no complete marker but Library count increased, items were saved
        if (!receivedCompleteMarker.current && actualAdded > 0) {
          console.log(`[Seek] ${actualAdded} items were saved despite stream ending early`);
        }
      }

      // Set the final result
      // S8 Fix: Use ref to get current values
      const finalData = progressDataRef.current;
      if (streamResult) {
        setResult(streamResult);
      } else {
        // Build result from progress data (use ref to avoid stale closure)
        setResult({
          success: receivedCompleteMarker.current,
          query: query.trim(),
          stats: {
            conversationsAnalyzed: finalData.conversationsFound || 0,
            daysSearched: daysBack,
            useCasesFound: finalData.useCasesAdded || finalData.useCasesParsed || 0,
          },
          error: !receivedCompleteMarker.current ? "Search may have ended unexpectedly. Check your Library for results." : undefined,
        });
      }
    } catch (error) {
      // S8 Fix: Use ref to get current values
      const errorData = progressDataRef.current;
      
      // Check if this was an abort
      if (error instanceof Error && error.name === "AbortError") {
        setProgressPhase("stopped");
        setResult({
          success: false,
          query: query.trim(),
          stats: {
            conversationsAnalyzed: errorData.conversationsFound || 0,
            daysSearched: daysBack,
            useCasesFound: 0,
          },
          error: "Search cancelled",
        });
      } else {
        setProgressPhase("error");
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setProgressMessage(errorMessage);
        setResult({
          success: false,
          query: query.trim(),
          stats: {
            conversationsAnalyzed: errorData.conversationsFound || 0,
            daysSearched: daysBack,
            useCasesFound: 0,
          },
          error: errorMessage,
        });
      }
    } finally {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      abortController.current = null;
      setIsSeeking(false);
    }
  }, [query, daysBack, minSimilarity, lastSearchTime, abortController, setIsSeeking, setResult, progressPhase, progressData, progressMessage, phaseInfo]);

  const handleStop = () => {
    setProgressPhase("stopping");
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null;
    }
  };

  const currentProgress = phaseProgress[progressPhase] || 0;
  const hasWarnings = progressData.warnings && progressData.warnings.length > 0;

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
            />
          </div>
        </div>

        {/* Progress Panel (shown during search) */}
        {isSeeking && (
          <div className="bg-black/30 rounded-lg p-4 space-y-4">
            {/* Header with timer and stop button */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-white flex items-center gap-3">
                {progressPhase !== "complete" && progressPhase !== "stopped" && progressPhase !== "error" && (
              <LoadingSpinner />
                )}
                <span>{phaseInfo[progressPhase]?.icon} {phaseInfo[progressPhase]?.label}</span>
              </h3>
              <div className="flex items-center gap-4">
                {/* Cost display */}
                {progressData.cumulativeCost !== undefined && progressData.cumulativeCost > 0 && (
                  <span className="text-sm text-green-400 font-mono">
                    {formatCost(progressData.cumulativeCost)}
                  </span>
                )}
                <span className="text-sm text-adobe-gray-400">
                  {formatTime(elapsedSeconds)} elapsed
              </span>
                {progressPhase !== "complete" && progressPhase !== "stopped" && progressPhase !== "error" && (
            <button
              onClick={handleStop}
                    className="px-3 py-1.5 text-sm font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 border border-red-400/30 rounded-lg transition-colors flex items-center gap-2"
            >
              <StopIcon />
                    Stop
            </button>
                )}
              </div>
            </div>

            {/* Warnings banner */}
            {hasWarnings && (
              <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg px-4 py-2 text-sm">
                <span className="text-yellow-400 font-medium">⚠️ Performance warning:</span>
                {progressData.warnings?.map((w, i) => (
                  <span key={i} className="text-yellow-300 ml-2">{w}</span>
                ))}
              </div>
            )}

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    progressPhase === "error" ? "bg-red-400/50" :
                    progressPhase === "stopping" || progressPhase === "stopped" ? "bg-red-400/50" :
                    progressPhase === "complete" ? "bg-green-500" :
                    hasWarnings ? "bg-gradient-to-r from-yellow-400 to-inspiration-seek" :
                    "bg-gradient-to-r from-inspiration-ideas to-inspiration-seek"
                  }`}
                  style={{ width: `${currentProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-adobe-gray-300">
                  {progressMessage}
                  {progressData.currentItem !== undefined && progressData.totalItems !== undefined && (
                    <span className="text-white font-medium ml-2">
                      ({progressData.currentItem} of {progressData.totalItems} {progressData.progressLabel || "items"})
                    </span>
                  )}
                </span>
                <span className={`font-bold ${
                  progressPhase === "error" ? "text-red-400" :
                  progressPhase === "stopping" || progressPhase === "stopped" ? "text-red-400" :
                  progressPhase === "complete" ? "text-green-400" :
                  "text-inspiration-seek"
                }`}>
                  {currentProgress}%
                </span>
              </div>
            </div>

            {/* Progress details */}
            <div className="font-mono text-sm space-y-2">
              {/* Search stats */}
              {progressData.conversationsFound !== undefined && (
                <div className="text-adobe-gray-300">
                  <span className="text-adobe-gray-600">├─</span> Conversations found: {progressData.conversationsFound}
                </div>
              )}
              {progressData.conversationsToCompress !== undefined && progressData.conversationsToCompress > 0 && (
                <div className="text-adobe-gray-300">
                  <span className="text-adobe-gray-600">├─</span> Compressing: {progressData.conversationsToCompress} conversations
                </div>
              )}
              {progressData.useCasesParsed !== undefined && (
                <div className="text-adobe-gray-300">
                  <span className="text-adobe-gray-600">├─</span> Use cases found: {progressData.useCasesParsed}
                </div>
              )}
              {progressData.useCasesAdded !== undefined && (
                <div className="text-green-400">
                  <span className="text-adobe-gray-600">└─</span> Added to Library: {progressData.useCasesAdded}
                </div>
              )}
            </div>

            {/* Performance summary on complete */}
            {progressPhase === "complete" && progressData.totalSeconds !== undefined && (
              <div className="text-adobe-gray-400 text-xs pt-2 border-t border-white/10">
                ⏱️ Total time: {formatTime(Math.round(progressData.totalSeconds))}
                {progressData.totalCost !== undefined && (
                  <> • Cost: {formatCost(progressData.totalCost)}</>
                )}
                {progressData.tokensIn !== undefined && progressData.tokensOut !== undefined && (
                  <> • Tokens: {Math.round((progressData.tokensIn + progressData.tokensOut) / 1000)}k</>
                )}
              </div>
            )}
          </div>
        )}

        {/* Search Button (hidden during search) */}
        {!isSeeking && (
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
      {result && !isSeeking && (
        <div className="space-y-4" aria-live="polite" aria-atomic="true">
          {result.error ? (
            <div className="space-y-3">
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 font-medium">Error: {result.error}</p>
              </div>
              {result.stats.conversationsAnalyzed > 0 && (
                <div className="bg-black/20 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-medium text-adobe-gray-300">Search Attempted</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-adobe-gray-400 text-xs mb-1">Conversations Analyzed</div>
                      <div className="text-white font-medium">{result.stats.conversationsAnalyzed}</div>
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
                    <div className="text-white font-medium">{result.stats.conversationsAnalyzed}</div>
                  </div>
                  <div>
                    <div className="text-adobe-gray-400 text-xs mb-1">Days Searched</div>
                    <div className="text-white font-medium">{result.stats.daysSearched}</div>
                  </div>
                  <div>
                    <div className="text-adobe-gray-400 text-xs mb-1">Use Cases Found</div>
                    <div className={`font-medium ${
                      result.stats.useCasesFound > 0 ? "text-inspiration-seek" : "text-adobe-gray-400"
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
                    <h3 className="text-lg font-semibold text-white">No Use Cases Found</h3>
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
                  {result.content && (
                    <div className="bg-black/20 rounded-lg p-6">
                      <h3 className="text-sm font-medium text-adobe-gray-300 mb-4">Synthesized Use Cases</h3>
                      <MarkdownContent content={result.content} />
                    </div>
                  )}
                  
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
