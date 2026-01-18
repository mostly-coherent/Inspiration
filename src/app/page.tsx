"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ToolType,
  PresetMode,
  GenerateResult,
  PRESET_MODES,
  TOOL_CONFIG,
  SeekResult,
  ThemeType,
  ModeType,
} from "@/lib/types";
import { BanksOverview } from "@/components/BanksOverview";
import { ResultsPanel } from "@/components/ResultsPanel";
import { SeekSection } from "@/components/SeekSection";
import { ProgressPanel, ProgressPhase, ProgressPhaseData, ErrorExplanation } from "@/components/ProgressPanel";
import { explainError } from "@/lib/errorExplainer";
import { ModeCard } from "@/components/ModeCard";
import { AdvancedSettings } from "@/components/AdvancedSettings";
import { ExpectedOutput } from "@/components/ExpectedOutput";
import { LogoutButton } from "@/components/LogoutButton";
import { SimpleModeSelector } from "@/components/SimpleModeSelector";
import { ScoreboardHeader } from "@/components/ScoreboardHeader";
import { ViewToggle, ViewMode } from "@/components/ViewToggle";
import { LibraryView } from "@/components/LibraryView";
import { loadThemesAsync } from "@/lib/themes";

export default function Home() {
  const router = useRouter();
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);

  // Check if user has completed onboarding
  useEffect(() => {
    let cancelled = false;
    
    const checkSetup = async () => {
      try {
        // First check if environment variables are configured
        const envRes = await fetch("/api/config/env");
        if (cancelled) return;
        
        if (!envRes.ok) {
          const errorText = await envRes.text().catch(() => `HTTP ${envRes.status}`);
          console.error("Failed to check environment config:", errorText.length > 100 ? envRes.status : errorText);
          if (!cancelled) router.push("/onboarding-fast");
          return;
        }
        const envData = await envRes.json().catch((parseError) => {
          throw new Error(`Invalid response format: ${parseError.message}`);
        });
        
        if (cancelled) return;
        
        if (!envData || typeof envData !== 'object' || !envData.allRequired) {
          // Missing required API keys → redirect to Fast Start (simpler onboarding)
          if (!cancelled) router.push("/onboarding-fast");
          return;
        }
        
        // Then check if setup is complete
        const configRes = await fetch("/api/config");
        if (cancelled) return;
        
        if (!configRes.ok) {
          const errorText = await configRes.text().catch(() => `HTTP ${configRes.status}`);
          console.error("Failed to check config:", errorText.length > 100 ? configRes.status : errorText);
          if (!cancelled) router.push("/onboarding-fast");
          return;
        }
        const configData = await configRes.json().catch((parseError) => {
          throw new Error(`Invalid response format: ${parseError.message}`);
        });
        
        if (cancelled) return;
        
        if (!configData.success || !configData.config?.setupComplete) {
          // Setup not complete → redirect to Fast Start
          // (Fast Start will redirect to full onboarding if chat history > 500MB)
          router.push("/onboarding-fast");
          return;
        }
        
        // All good, show the app
        setIsCheckingSetup(false);
      } catch (e) {
        if (cancelled) return;
        console.error("Failed to check setup:", e);
        // On error, still show the app (might be first load)
        setIsCheckingSetup(false);
      }
    };
    
    checkSetup();
    
    return () => {
      cancelled = true;
    };
  }, [router]);

  // View mode state (Library View vs Comprehensive View)
  const [viewMode, setViewMode] = useState<ViewMode>("comprehensive");
  
  // State - simplified mode system (theme auto-determined from mode)
  const [selectedModeId, setSelectedModeId] = useState<ModeType>("idea");
  const [selectedTheme, setSelectedTheme] = useState<ThemeType>("generation"); // Auto-determined from mode
  const [selectedMode, setSelectedMode] = useState<PresetMode>("week");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  
  // Seek state - derived from selected mode
  const [showSeek, setShowSeek] = useState(false);
  
  // Sync showSeek with selectedModeId (use_case mode = seek theme)
  useEffect(() => {
    setShowSeek(selectedModeId === "use_case");
  }, [selectedModeId]);
  const [reverseQuery, setReverseQuery] = useState("");
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekResult, setSeekResult] = useState<SeekResult | null>(null);
  const [reverseDaysBack, setReverseDaysBack] = useState(90);
  const [reverseMinSimilarity, setReverseMinSimilarity] = useState(0.0);
  const seekAbortController = useRef<AbortController | null>(null);
  
  // Load seek defaults from config on mount
  useEffect(() => {
    let cancelled = false;
    
    const loadSeekDefaults = async () => {
      try {
        const res = await fetch("/api/config");
        if (cancelled) return;
        
        if (!res.ok) {
          const errorText = await res.text().catch(() => `HTTP ${res.status}`);
          console.error("Failed to load seek defaults:", errorText.length > 100 ? res.status : errorText);
          return;
        }
        const data = await res.json().catch((parseError) => {
          throw new Error(`Invalid response format: ${parseError.message}`);
        });
        
        if (cancelled) return;
        
        if (data && typeof data === 'object' && data.success && data.config?.seekDefaults) {
          const { daysBack, minSimilarity } = data.config.seekDefaults;
          if (daysBack !== undefined && !cancelled) setReverseDaysBack(daysBack);
          if (minSimilarity !== undefined && !cancelled) setReverseMinSimilarity(minSimilarity);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load seek defaults:", err);
        }
      }
    };
    
    loadSeekDefaults();
    
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  
  // Library delta tracking (v3)
  const [libraryCountBefore, setLibraryCountBefore] = useState<number | null>(null);
  const [libraryCountAfter, setLibraryCountAfter] = useState<number | null>(null);
  
  // Progress tracking
  const [progress, setProgress] = useState(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [progressPhase, setProgressPhase] = useState<ProgressPhase>("confirming");
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [progressPhaseData, setProgressPhaseData] = useState<ProgressPhaseData>({});
  const [progressErrorExplanation, setProgressErrorExplanation] = useState<ErrorExplanation | undefined>(undefined);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const abortController = useRef<AbortController | null>(null);
  // Ref to track accumulated progress data (avoids stale closure in async functions)
  const progressPhaseDataRef = useRef<ProgressPhaseData>({});
  // Ref to track sync status timeout for cleanup
  const syncStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Advanced settings
  const [customDays, setCustomDays] = useState<number>(14);
  const [customTemperature, setCustomTemperature] = useState<number>(0.4);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [useCustomDates, setUseCustomDates] = useState(false);

  const currentModeConfig = useMemo(
    () => PRESET_MODES.find((m) => m.id === selectedMode),
    [selectedMode]
  );
  
  // Get mode config from themes.json
  const [modeConfig, setModeConfig] = useState<{ name: string; icon: string; color: string } | null>(null);
  
  useEffect(() => {
    let cancelled = false;
    
    // Auto-determine theme from mode if needed
    const determineTheme = async () => {
      try {
        // Load themes to find which theme contains the selected mode
        const themesConfig = await loadThemesAsync();
        if (cancelled) return;
        
        if (!themesConfig || !Array.isArray(themesConfig.themes)) {
          console.error("Invalid themes config structure");
          return;
        }
        
        for (const theme of themesConfig.themes) {
          if (cancelled) return;
          const mode = theme.modes?.find(m => m.id === selectedModeId);
          if (mode) {
            setSelectedTheme(theme.id as ThemeType);
            setModeConfig({
              name: mode.name,
              icon: mode.icon,
              color: mode.color,
            });
            return;
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to determine theme:", err);
        }
      }
    };
    
    determineTheme();
    
    return () => {
      cancelled = true;
    };
  }, [selectedModeId]);
  
  // Backward compatibility: derive tool from mode for display
  const displayTool: ToolType = selectedModeId === "idea" ? "ideas" : "insights";
  const toolConfig = TOOL_CONFIG[displayTool];

  // v2: Estimate time for item-centric architecture (memoized)
  const estimateTime = useCallback((itemCount: number): number => {
    // v2: Single LLM call + batch embeddings + dedup + ranking
    // Base: 20s for LLM call, +2s per item for processing
    return 20 + itemCount * 2 + 15;
  }, []);

  // v2: Estimate LLM cost for item-centric architecture (memoized)
  // Claude Sonnet 4: $3/M input, $15/M output
  // OpenAI text-embedding-3-small: $0.02/M tokens
  const estimateCost = useCallback((itemCount: number, days?: number): number => {
    // More days = more chat history tokens to process
    const daysToUse = days ?? 14;
    const avgMessagesPerDay = 50; // Estimate based on typical usage
    const avgTokensPerMessage = 200;
    const inputTokens = daysToUse * avgMessagesPerDay * avgTokensPerMessage;
    
    // Claude Sonnet 4 pricing: $3/M input, $15/M output
    const inputCost = (inputTokens / 1_000_000) * 3;
    const outputTokens = itemCount * 500; // ~500 tokens per item
    const outputCost = (outputTokens / 1_000_000) * 15;
    
    // Embedding cost (OpenAI): $0.02/M tokens
    const embeddingTokens = itemCount * 100;
    const embeddingCost = (embeddingTokens / 1_000_000) * 0.02;
    
    return inputCost + outputCost + embeddingCost;
  }, []);

  // Helper to calculate days from date range (memoized)
  // Note: 90-day limit removed in v1 - Vector DB enables unlimited date ranges
  const calculateDateRangeDays = useCallback((from: string, to: string): number => {
    if (!from || !to) return 0;
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diffTime = Math.abs(toDate.getTime() - fromDate.getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return days;
  }, []);


  // Sync brain with local Cursor history
  const handleSync = useCallback(async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    setSyncStatus("Syncing...");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Sync failed: ${errorText.length > 100 ? res.status : errorText}`);
      }
      const data = await res.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (data && typeof data === 'object' && data.success) {
        if (data.stats && typeof data.stats === 'object') {
          const { indexed = 0, skipped = 0, failed = 0 } = data.stats;
          if (indexed > 0) {
            const statusMsg = skipped > 0 
              ? `✓ Synced ${indexed} new (${skipped} already indexed)`
              : `✓ Synced ${indexed} new`;
            setSyncStatus(statusMsg);
          } else if (skipped > 0) {
            setSyncStatus(`✓ Up to date (${skipped} indexed)`);
          } else {
            setSyncStatus("✓ Up to date");
          }
          if (failed > 0) {
            console.warn(`${failed} messages failed to sync`);
          }
        } else {
          setSyncStatus("✓ Up to date");
        }
        // Note: ScoreboardHeader will auto-refresh when syncStatus changes
        // Clear success status after 5 seconds
        if (syncStatusTimeoutRef.current) {
          clearTimeout(syncStatusTimeoutRef.current);
        }
        syncStatusTimeoutRef.current = setTimeout(() => {
          setSyncStatus((prev) => {
            // Only clear if it's still a success message (not changed to error/cloud mode)
            if (prev && prev.startsWith("✓")) {
              return null;
            }
            return prev;
          });
          syncStatusTimeoutRef.current = null;
        }, 5000);
      } else {
        // Handle cloud environment limitation gracefully
        if (data.error && (data.error.includes("Cannot sync from cloud") || data.error.includes("cloud environment"))) {
          setSyncStatus("☁️ Cloud Mode (Read-only)");
          // Don't clear this status - keep it visible permanently
        } else {
          setSyncStatus("⚠️ Sync failed");
          console.error("Sync failed:", data.error);
          // Clear error status after 5 seconds
          if (syncStatusTimeoutRef.current) {
            clearTimeout(syncStatusTimeoutRef.current);
          }
          syncStatusTimeoutRef.current = setTimeout(() => {
            setSyncStatus((prev) => prev === "⚠️ Sync failed" ? null : prev);
            syncStatusTimeoutRef.current = null;
          }, 5000);
        }
      }
    } catch (e) {
      console.error("Sync error:", e);
      setSyncStatus("⚠️ Connection error");
      if (syncStatusTimeoutRef.current) {
        clearTimeout(syncStatusTimeoutRef.current);
      }
      syncStatusTimeoutRef.current = setTimeout(() => {
        setSyncStatus((prev) => prev === "⚠️ Connection error" ? null : prev);
        syncStatusTimeoutRef.current = null;
      }, 5000);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // Auto-sync on mount
  // Note: Only works when running locally (not on Vercel)
  // On Vercel, it will gracefully show "Cloud Mode (Read-only)" status
  useEffect(() => {
    // Auto-sync on first load (only works locally)
    // ScoreboardHeader will fetch stats on its own
    handleSync().catch((error) => {
      console.error("Auto-sync failed:", error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount - handleSync is stable

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // UNIFIED GENERATION LOGIC
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  /**
   * Core generation executor - handles all the common logic for running generation.
   * Called by both handleGenerate (manual) and handleRunSuggestion (coverage runs).
   */
  const executeGeneration = async (
    body: Record<string, unknown>,
    displayInfo: { tool: ToolType; mode: PresetMode }
  ) => {
    setIsGenerating(true);
    setResult(null);
    setProgress(0);
    setElapsedSeconds(0);
    setLibraryCountBefore(null);
    setLibraryCountAfter(null);
    setProgressErrorExplanation(undefined);
    
    // Initialize progress with request parameters
    const dateRangeDisplay = body.fromDate && body.toDate 
      ? `${body.fromDate} to ${body.toDate}`
      : body.days 
        ? `Last ${body.days} days`
        : "Custom range";
    
    setProgressPhase("confirming");
    setProgressMessage("Confirming request parameters...");
    const initialPhaseData = {
      dateRange: dateRangeDisplay,
      temperature: body.temperature as number ?? 0.5,
    };
    setProgressPhaseData(initialPhaseData);
    progressPhaseDataRef.current = initialPhaseData; // Also reset ref
    
    // Fetch library count before generation
    try {
      const libRes = await fetch("/api/items?view=items");
      if (!libRes.ok) {
        const errorText = await libRes.text().catch(() => `HTTP ${libRes.status}`);
        console.error("Failed to fetch library count:", errorText.length > 100 ? libRes.status : errorText);
        return;
      }
      const libData = await libRes.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      if (libData && typeof libData === 'object' && libData.success) {
        setLibraryCountBefore(libData.stats?.totalItems || 0);
      }
    } catch (e) {
      console.error("Failed to fetch library count before:", e);
      // Continue with generation even if library count fetch fails
    }
    
    // Create new AbortController for this request
    abortController.current = new AbortController();
    
    // Estimate time based on date range (items unknown until generation)
    const days = body.days as number ?? 14;
    const totalEstimate = estimateTime(days * 2); // Rough estimate: ~2 items per day
    setEstimatedSeconds(totalEstimate);

    // Start elapsed time tracking
    const startTime = Date.now();
    progressInterval.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);
    }, 500);

    // Phase progress weights for progress bar
    const phaseProgress: Record<string, number> = {
      confirming: 5,
      searching: 20,
      generating: 50,
      deduplicating: 70,
      ranking: 85,
      integrating: 95,
      complete: 100,
    };

    try {
      // Use streaming API for real-time progress
      const response = await fetch("/api/generate-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortController.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let streamError: string | null = null;
      let receivedCompleteMarker = false;
      
      // C3/C5 FIX: Add timeout for stalled streams (120 seconds between updates)
      // Increased from 60s to handle long generation phases (90+ seconds)
      const STREAM_TIMEOUT_MS = 120000;
      let lastActivityTime = Date.now();
      const timeoutRefs: NodeJS.Timeout[] = []; // Track timeouts for cleanup
      
      const readWithTimeout = async (): Promise<ReadableStreamReadResult<Uint8Array> | null> => {
        const timeoutPromise = new Promise<null>((resolve) => {
          const checkTimeout = () => {
            // Check if request was aborted
            if (abortController.current?.signal.aborted) {
              resolve(null);
              return;
            }
            
            if (Date.now() - lastActivityTime > STREAM_TIMEOUT_MS) {
              resolve(null);
            } else {
              const timeoutId = setTimeout(checkTimeout, 5000);
              timeoutRefs.push(timeoutId);
            }
          };
          const initialTimeoutId = setTimeout(checkTimeout, STREAM_TIMEOUT_MS);
          timeoutRefs.push(initialTimeoutId);
        });
        
        try {
          const result = await Promise.race([
            reader.read(),
            timeoutPromise
          ]);
          
          // Clean up all timeouts when we get a result
          timeoutRefs.forEach(id => clearTimeout(id));
          timeoutRefs.length = 0;
          
          if (result) {
            lastActivityTime = Date.now(); // Reset timeout on activity
          }
          return result;
        } catch {
          // Clean up timeouts on error
          timeoutRefs.forEach(id => clearTimeout(id));
          timeoutRefs.length = 0;
          return null;
        }
      };

      // Process SSE stream
      try {
        while (true) {
          const result = await readWithTimeout();
          
          // C3/C5 FIX: Handle timeout
          if (result === null) {
            // Clean up timeouts before throwing
            timeoutRefs.forEach(id => clearTimeout(id));
            timeoutRefs.length = 0;
            throw new Error("Stream timeout - no response for 60 seconds. The generation may still be running. Check the Library for results.");
          }
          
          const { done, value } = result;
          if (done) {
            // Clean up timeouts when stream completes normally
            timeoutRefs.forEach(id => clearTimeout(id));
            timeoutRefs.length = 0;
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            
            try {
              const data = JSON.parse(line.slice(6));
              
              // Handle different message types from stream
              switch (data.type) {
              case "phase":
                setProgressPhase(data.phase);
                setProgress(phaseProgress[data.phase] || 0);
                // Track if we received the complete marker
                if (data.phase === "complete") {
                  receivedCompleteMarker = true;
                }
                break;
                
              case "stat":
                // Update phase data with streaming stats (both state and ref)
                progressPhaseDataRef.current = { ...progressPhaseDataRef.current, [data.key]: data.value };
                setProgressPhaseData(prev => ({ ...prev, [data.key]: data.value }));
                break;
                
              case "info":
                setProgressMessage(data.message);
                break;
                
              case "error":
                streamError = data.message || data.error;
                break;
                
              case "complete":
                receivedCompleteMarker = true;
      setProgress(100);
                setProgressPhase("complete");
                setProgressMessage("Generation complete!");
                break;
                
              case "progress":
                // Intra-phase progress (e.g., "processing item 5 of 22")
                {
                  const update = { currentItem: data.current, totalItems: data.total, progressLabel: data.label };
                  progressPhaseDataRef.current = { ...progressPhaseDataRef.current, ...update };
                  setProgressPhaseData(prev => ({ ...prev, ...update }));
                }
                break;
                
              case "cost":
                // Token/cost tracking
                {
                  const ref = progressPhaseDataRef.current;
                  const update = {
                    tokensIn: (ref.tokensIn || 0) + (data.tokensIn || 0),
                    tokensOut: (ref.tokensOut || 0) + (data.tokensOut || 0),
                    cumulativeCost: data.cumulative || data.cost || 0,
                  };
                  progressPhaseDataRef.current = { ...ref, ...update };
                  setProgressPhaseData(prev => ({
                    ...prev,
                    tokensIn: (prev.tokensIn || 0) + (data.tokensIn || 0),
                    tokensOut: (prev.tokensOut || 0) + (data.tokensOut || 0),
                    cumulativeCost: data.cumulative || data.cost || 0,
                  }));
                }
                break;
                
              case "warning":
                // Slow phase warnings
                {
                  const ref = progressPhaseDataRef.current;
                  progressPhaseDataRef.current = { ...ref, warnings: [...(ref.warnings || []), data.message] };
                  setProgressPhaseData(prev => ({ ...prev, warnings: [...(prev.warnings || []), data.message] }));
                }
                break;
                
              case "perf":
                // Performance summary at end of run
                {
                  const update = {
                    totalSeconds: data.totalSeconds,
                    totalCost: data.cost,
                    tokensIn: data.tokensIn,
                    tokensOut: data.tokensOut,
                  };
                  progressPhaseDataRef.current = { ...progressPhaseDataRef.current, ...update };
                  setProgressPhaseData(prev => ({ ...prev, ...update }));
                }
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

      // If there was a stream error, throw it
      if (streamError) {
        throw new Error(streamError);
      }

      // C3 FIX: Check if stream closed without complete marker (e.g., Python crash)
      // Try to verify if items were actually saved before giving up
      if (!receivedCompleteMarker) {
        // Check if Library count increased - items may have been saved before crash
        try {
          const checkRes = await fetch("/api/items?view=items");
          if (!checkRes.ok) {
            throw new Error(`HTTP ${checkRes.status}`);
          }
          const checkData = await checkRes.json().catch((parseError) => {
            throw new Error(`Invalid response format: ${parseError.message}`);
          });
          const currentCount = (checkData && typeof checkData === 'object' && checkData.stats?.totalItems) || 0;
          const itemsAdded = progressPhaseDataRef.current.itemsAdded || 0;
          
          if (itemsAdded > 0 && currentCount > (libraryCountBefore || 0)) {
            // Items were saved! Continue with partial success
            console.warn("[Generation] Stream ended without complete marker, but items were saved");
            setProgressMessage("Generation completed (stream ended early but items were saved)");
          } else {
            throw new Error("Generation stream closed unexpectedly - items may not have been saved. Please check the Library or try again.");
          }
        } catch (checkErr) {
          throw new Error("Generation stream closed unexpectedly - items may not have been saved. Please check the Library or try again.");
        }
      }

      // Fetch final Library count with retry logic
      // Small delay ensures DB writes are committed (harmonization happens before stream ends now)
      // Retry handles any transient DB latency
      const fetchLibraryCountWithRetry = async (retries = 3, delayMs = 500): Promise<number | null> => {
        for (let i = 0; i < retries; i++) {
          try {
            // Small delay before each attempt (ensures DB consistency)
            if (i > 0 || delayMs > 0) {
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            
            const response = await fetch("/api/items?view=items");
            const data = await response.json();
            
            if (data.success) {
              const newCount = data.stats?.totalItems || 0;
              // Verify count increased (if we added items) OR harmonization completed (even if all duplicates)
              // Use ref to get current values (avoids stale closure)
              const refData = progressPhaseDataRef.current;
              const itemsAdded = refData.itemsAdded || 0;
              const itemsMerged = refData.itemsMerged || 0;
              const hasChanges = itemsAdded > 0 || itemsMerged > 0;
              
              // If we added items but count didn't increase, retry (DB might not be updated yet)
              // If all items were duplicates (itemsAdded=0, itemsMerged>0), count won't increase but DB is updated
              // So we only retry if itemsAdded > 0 and count didn't increase
              if (itemsAdded > 0 && libraryCountBefore !== null && newCount <= libraryCountBefore) {
                // Count didn't increase yet, retry
                console.log(`[Library] Count ${newCount} <= before ${libraryCountBefore}, retrying...`);
                delayMs = Math.min(delayMs * 2, 2000); // Exponential backoff, max 2s
                continue;
              }
              // If all duplicates (itemsAdded=0, itemsMerged>0), count won't increase but that's expected
              // Return the count anyway - harmonization succeeded even if no new items
              return newCount;
          }
        } catch (e) {
            console.error(`[Library] Fetch attempt ${i + 1} failed:`, e);
          }
          delayMs = Math.min(delayMs * 2, 2000); // Exponential backoff
        }
        return null;
      };
      
      const finalCount = await fetchLibraryCountWithRetry();
      if (finalCount !== null) {
        setLibraryCountAfter(finalCount);
      }

      // Create result object from streamed data (use ref to avoid stale closure)
      const finalData = progressPhaseDataRef.current;
      const result: GenerateResult = {
        success: true,
        tool: displayInfo.tool,
        mode: displayInfo.mode,
        stats: {
          daysProcessed: finalData.daysProcessed || 0,
          daysWithActivity: finalData.daysWithActivity || 0,
          daysWithOutput: finalData.daysWithActivity || 0,
          itemsGenerated: finalData.itemsGenerated || 0,
          itemsAfterDedup: finalData.itemsAfterSelfDedup || 0,
          itemsReturned: finalData.itemsAfterSelfDedup || 0, // UX-1: no truncation, all go to harmonization
          conversationsAnalyzed: finalData.conversationsFound || 0,
          harmonization: {
            itemsProcessed: finalData.itemsCompared || 0,
            itemsAdded: finalData.itemsAdded || 0,
            itemsUpdated: finalData.itemsMerged || 0,
            itemsDeduplicated: finalData.itemsMerged || 0,
          },
        },
        timestamp: new Date().toISOString(),
      };
      
      setResult(result);
      
    } catch (error) {
      // Clean up any remaining timeouts on error
      // Note: timeoutRefs is scoped to executeGeneration, so we can't access it here
      // But the finally block in the stream processing will clean it up
      
      if (error instanceof Error && error.name === "AbortError") {
        setProgressPhase("stopped");
        setProgressMessage("Generation stopped by user");
      } else {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        setProgressPhase("error");
        setProgressMessage("Generation failed");
        
        // Get structured error explanation for user-friendly display (use ref to avoid stale closure)
        const errorRefData = progressPhaseDataRef.current;
        const explanation = explainError(errorMsg, {
          daysProcessed: errorRefData.daysProcessed,
          conversationsAnalyzed: errorRefData.conversationsFound,
          itemsGenerated: errorRefData.itemsGenerated,
          itemsAfterDedup: errorRefData.itemsAfterSelfDedup,
        });
        setProgressErrorExplanation(explanation);
        
        setResult({
          success: false,
          tool: displayInfo.tool,
          mode: displayInfo.mode,
          error: errorMsg,
          stats: {
            daysProcessed: 0,
            daysWithActivity: 0,
            daysWithOutput: 0,
            itemsGenerated: 0,
            itemsAfterDedup: 0,
            itemsReturned: 0,
          },
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      abortController.current = null;
      setIsGenerating(false);
    }
  };

  // Handle manual generation (Generate button click)
  const handleGenerate = () => {
    // Build request body based on current UI state
    const body: Record<string, unknown> = {
      theme: selectedTheme,
      modeId: selectedModeId,
      mode: showAdvanced ? "custom" : selectedMode,
    };

    if (showAdvanced) {
      if (useCustomDates && fromDate && toDate) {
        body.fromDate = fromDate;
        body.toDate = toDate;
      } else {
        body.days = customDays;
      }
      body.temperature = customTemperature;
    }
    
    const displayInfo = {
      tool: displayTool,
      mode: selectedMode,
    };
    
    executeGeneration(body, displayInfo);
  };

  // Handle retry with suggested smaller date range (IMP-14)
  const handleRetryWithDays = (days: number) => {
    // Update UI to show advanced mode with the suggested days
    setShowAdvanced(true);
    setUseCustomDates(false);
    setCustomDays(days);
    
    const body: Record<string, unknown> = {
      theme: selectedTheme,
      modeId: selectedModeId,
      mode: "custom",
      days: days,
      temperature: customTemperature,
    };
    
    const displayInfo = {
      tool: displayTool,
      mode: "custom" as PresetMode,
    };

    executeGeneration(body, displayInfo);
  };

  const handleStop = () => {
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null; // Clear after abort
    }
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    setProgressPhase("stopping");
    setProgressMessage("Stopping generation...");
  };

  // Cleanup interval on unmount and when generation stops
  useEffect(() => {
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      if (abortController.current) {
        abortController.current.abort();
        abortController.current = null;
      }
      if (seekAbortController.current) {
        seekAbortController.current.abort();
        seekAbortController.current = null;
      }
      if (syncStatusTimeoutRef.current) {
        clearTimeout(syncStatusTimeoutRef.current);
        syncStatusTimeoutRef.current = null;
      }
    };
  }, []);

  // Show loading state while checking setup
  if (isCheckingSetup) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen p-6 md:p-8">
      {/* Background gradient */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-500 focus:text-white focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950"
      >
        Skip to main content
      </a>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Minimal Header */}
        <header className="flex items-center justify-between pt-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✨</span>
            <h1 className="text-2xl font-bold text-white">Inspiration</h1>
          </div>
          <div className="flex items-center gap-2">
            <a 
              href="/theme-map" 
              className="p-2 text-slate-400 hover:text-indigo-400 transition-colors"
              title="View Theme Map"
              aria-label="View Theme Map"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </a>
            <a 
              href="/settings" 
              className="p-2 text-slate-400 hover:text-amber-400 transition-colors"
              title="Settings"
              aria-label="Open settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </a>
            <LogoutButton />
          </div>
        </header>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* HERO: Theme Explorer — The Forest View */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600/20 via-purple-600/10 to-slate-900/50 border border-indigo-500/20 p-8 md:p-10">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-3">
                <span className="text-4xl">🔭</span>
                <h2 className="text-3xl md:text-4xl font-bold text-white">Theme Explorer</h2>
              </div>
              <p className="text-lg text-slate-300 max-w-lg">
                See your own thinking from 10,000 feet. Discover the <strong className="text-indigo-300">forests</strong>, not just the trees.
              </p>
              <p className="text-sm text-slate-400 mt-2">
                For pattern seekers: AI synthesis reveals recurring themes you didn't notice—ideas worth building, insights worth sharing.
              </p>
            </div>
            
            <a
              href="/themes"
              className="group flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-lg rounded-2xl shadow-xl shadow-indigo-500/25 transition-all hover:scale-105 hover:shadow-indigo-500/40"
            >
              <span>Explore Themes</span>
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* MEMORY & LIBRARY — Side by Side Stats */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <ScoreboardHeader
          onSyncClick={handleSync}
          isSyncing={isSyncing}
          syncStatus={syncStatus}
        />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* VIEW MODE: Library Browse vs Generate New */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <ViewToggle currentView={viewMode} onViewChange={setViewMode} />

        {/* Conditional Layout based on View Mode */}
        {viewMode === "library" ? (
          /* Library View - Full width, focused on exploring items */
          <LibraryView />
        ) : (
          /* Comprehensive View - Generate-focused Layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT PANEL: Generate Actions (Primary) */}
            <main className="lg:col-span-8 space-y-6">
            {/* Mode Selection */}
            <section className="glass-card p-5 space-y-4">
              <h2 className="text-lg font-medium text-adobe-gray-300">
                What do you want to do?
              </h2>
              
              <SimpleModeSelector
                selectedModeId={selectedModeId}
                onModeChange={(modeId, themeId) => {
                  setSelectedModeId(modeId as ModeType);
                  setSelectedTheme(themeId as ThemeType);
                }}
              />
            </section>

            {showSeek ? (
              /* Seek Section */
              <SeekSection
                showSeek={showSeek}
                setShowSeek={setShowSeek}
                query={reverseQuery}
                setQuery={setReverseQuery}
                daysBack={reverseDaysBack}
                setDaysBack={setReverseDaysBack}
                minSimilarity={reverseMinSimilarity}
                setMinSimilarity={setReverseMinSimilarity}
                isSeeking={isSeeking}
                setIsSeeking={setIsSeeking}
                result={seekResult}
                setResult={setSeekResult}
                abortController={seekAbortController}
              />
            ) : (
              <>
                {/* Time Period & Settings Section */}
                <section className="glass-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-medium text-adobe-gray-300">
                      Time period & depth
                    </h2>
                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="text-sm text-inspiration-ideas hover:text-inspiration-ideas/80 transition-colors"
                    >
                      {showAdvanced ? "← Presets" : "Advanced →"}
                    </button>
                  </div>

                  {!showAdvanced ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {PRESET_MODES.map((mode) => (
                        <ModeCard
                          key={mode.id}
                          mode={mode}
                          isSelected={selectedMode === mode.id}
                          onClick={() => setSelectedMode(mode.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <AdvancedSettings
                      customDays={customDays}
                      setCustomDays={setCustomDays}
                      customTemperature={customTemperature}
                      setCustomTemperature={setCustomTemperature}
                      fromDate={fromDate}
                      setFromDate={setFromDate}
                      toDate={toDate}
                      setToDate={setToDate}
                      useCustomDates={useCustomDates}
                      setUseCustomDates={setUseCustomDates}
                    />
                  )}

                  {/* Expected output summary - integrated */}
                  {(() => {
                    const days = showAdvanced 
                      ? (useCustomDates ? calculateDateRangeDays(fromDate, toDate) : customDays) 
                      : (currentModeConfig?.days ?? 14);
                    return (
                  <ExpectedOutput
                    tool={displayTool}
                        days={days}
                    hours={!showAdvanced ? currentModeConfig?.hours : undefined}
                    temperature={showAdvanced ? customTemperature : (currentModeConfig?.temperature ?? 0.4)}
                        estimatedCost={estimateCost(days * 2, days)} // Rough estimate: ~2 items per day
                      />
                    );
                  })()}
                </section>

                {/* Cost Warning */}
                {(() => {
                  const days = showAdvanced 
                      ? (useCustomDates ? calculateDateRangeDays(fromDate, toDate) : customDays) 
                    : (currentModeConfig?.days ?? 14);
                  const currentCost = estimateCost(days * 2, days); // Rough estimate: ~2 items per day
                  const COST_WARNING_THRESHOLD = 0.50;
                  if (currentCost > COST_WARNING_THRESHOLD) {
                    return (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-3">
                        <span className="text-xl">⚠️</span>
                        <div className="text-sm text-amber-300">
                          <strong>High cost operation:</strong> This will cost approximately <strong>${currentCost.toFixed(2)}</strong>.
                          Consider reducing the time range.
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Generate Button & Progress */}
                <div className="space-y-4">
                  {isGenerating ? (
                    <ProgressPanel
                      progress={progress}
                      phase={progressPhase}
                      phaseMessage={progressMessage}
                      phaseData={progressPhaseData}
                      elapsedSeconds={elapsedSeconds}
                      estimatedSeconds={estimatedSeconds}
                      tool={toolConfig.mode}
                      toolLabel={toolConfig.label}
                      errorExplanation={progressErrorExplanation}
                      onStop={handleStop}
                      onRetry={handleGenerate}
                    />
                  ) : (
                    <div className="flex justify-center">
                      <button
                        onClick={handleGenerate}
                        className="btn-primary text-xl px-12 py-4 font-semibold shadow-lg shadow-inspiration-ideas/20 hover:shadow-inspiration-ideas/30 transition-all"
                        aria-busy={isGenerating}
                        aria-live="polite"
                      >
                        <span className="flex items-center gap-3">
                          <span className="text-2xl">{modeConfig?.icon || toolConfig.icon}</span>
                          Generate {modeConfig?.name || toolConfig.label}
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Results */}
                {result && <ResultsPanel result={result} onRetry={handleGenerate} onRetryWithDays={handleRetryWithDays} />}
              </>
            )}
          </main>

            {/* RIGHT PANEL: Theme Explorer CTA */}
            <aside className="lg:col-span-4">
              <div className="lg:sticky lg:top-6">
                <div id="library-section" className="bg-gradient-to-br from-indigo-600/20 via-purple-600/10 to-slate-900/50 border border-indigo-500/20 rounded-2xl p-6 text-center space-y-4">
                  <span className="text-4xl">🔭</span>
                  <h3 className="text-lg font-semibold text-white">Explore Your Patterns</h3>
                  <p className="text-sm text-slate-400">
                    See themes, unexplored territory, and counter-intuitive perspectives in your thinking
                  </p>
                  <a
                    href="/themes"
                    className="inline-block btn-primary px-6 py-3 hover:scale-105 transition-transform"
                  >
                    Theme Explorer →
                  </a>
                  
                  {/* Quick access to Library view */}
                  <div className="pt-4 border-t border-slate-700/30">
                    <button
                      onClick={() => setViewMode("library")}
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Or browse all items →
                    </button>
                  </div>
                </div>
              </div>
            </aside>
        </div>
        )}
      </div>
    </main>
  );
}
