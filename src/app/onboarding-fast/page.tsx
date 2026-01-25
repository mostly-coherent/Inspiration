"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * Fast Start Onboarding — Local-first, no Supabase required
 * 
 * 3 screens:
 * 1. Welcome + Auto-detect (DB metrics, time window suggestion)
 * 2. LLM Key (required, single provider)
 * 3. Generate Theme Map (with results display)
 */

type OnboardingStep = "welcome" | "api-key" | "generate";

interface DbMetrics {
  size_mb: number;
  estimated_conversations_total: number;
  estimated_conversations_per_day: number;
  suggested_days: number;
  confidence: "high" | "medium" | "low";
  explanation: string;
  db_path: string | null;
  cursor_conversations?: number;
  claude_code_conversations?: number;
}

interface ThemeEvidence {
  workspace: string;
  chatId: string;
  chatType: string;
  date: string;
  snippet: string;
}

interface ExpertQuote {
  guestName: string;
  speaker?: string;
  timestamp?: string;
  content: string;
  similarity?: number;
  episodeFilename?: string;
  episodeTitle?: string;
  youtubeUrl?: string;
  videoId?: string;
  duration?: string;
}

interface Theme {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string[];
  evidence: ThemeEvidence[];
  expertPerspectives?: ExpertQuote[];
}

interface UnexploredTerritory {
  title: string;
  why: string;
  expertInsight?: ExpertQuote;
}

interface CounterIntuitive {
  title: string;
  perspective: string;
  reasoning: string;
  expertChallenge?: ExpertQuote;
}

interface ThemeMapResult {
  generatedAt?: string;
  suggestedDays: number;
  analyzed: {
    days: number;
    conversationsConsidered: number;
    conversationsUsed: number;
    sizeMb?: number; // Actual size analyzed (when size-based)
    maxSizeMb?: number; // Size limit (when size-based)
    sizeBased?: boolean; // Whether this was size-based analysis
  };
  themes: Theme[];
  counterIntuitive?: CounterIntuitive[];
  unexploredTerritory: UnexploredTerritory[];
  lennyAvailable?: boolean;
  lennyUnlocked?: boolean;
  error?: string;
}

interface CostEstimate {
  estimatedCostUSD: number;
  inputTokens: number;
  outputTokens: number;
  breakdown: {
    inputCostUSD: number;
    outputCostUSD: number;
    pricingPerMTok: {
      input: number;
      output: number;
    };
  };
  provider: string;
  model: string;
  disclaimer: string;
  conversationCount: number;
}

// Wrapper component to handle Suspense for useSearchParams
export default function FastOnboardingPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <FastOnboardingContent />
    </Suspense>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500 mx-auto mb-4"></div>
        <p className="text-white text-lg">Loading...</p>
      </div>
    </div>
  );
}

function FastOnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPreviewMode = searchParams.get("preview") === "true";
  
  // Unified onboarding: Always analyze most recent ~500MB
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [error, setError] = useState<string | null>(null);
  
  // DB metrics state
  const [dbMetrics, setDbMetrics] = useState<DbMetrics | null>(null);
  const [detectingDb, setDetectingDb] = useState(true);
  
  // Valid days options
  const VALID_DAYS_OPTIONS = [7, 14, 28, 42];
  
  // Theme Maps are now size-based (~500MB), not days-based
  // Removed days normalization - no longer needed
  
  // Time window state (kept for UI display only, but generation uses maxSizeMb: 500)
  const [selectedDays, setSelectedDays] = useState(14);
  
  // API key state
  const [selectedProvider, setSelectedProvider] = useState<"anthropic" | "openai">("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [keyFromEnv, setKeyFromEnv] = useState(false);
  const [validatingKey, setValidatingKey] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  
  // Optional OpenAI key for Lenny's expert perspectives
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiKeyFromEnv, setOpenaiKeyFromEnv] = useState(false);
  const [validatingOpenaiKey, setValidatingOpenaiKey] = useState(false);
  const [openaiKeyValid, setOpenaiKeyValid] = useState<boolean | null>(null);
  
  // Theme generation state
  const [generating, setGenerating] = useState(false);
  const [themeMap, setThemeMap] = useState<ThemeMapResult | null>(null);
  const [generationProgress, setGenerationProgress] = useState("");
  
  // Lenny auto-download state
  const [lennyDownloading, setLennyDownloading] = useState(false);
  const [lennyDownloadProgress, setLennyDownloadProgress] = useState("");
  
  // Cost estimation state
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  const [loadingCost, setLoadingCost] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  
  // Vector DB state (for CTA behavior)
  const [hasVectorDb, setHasVectorDb] = useState(false);
  
  // Existing user detection state
  const [isExistingUser, setIsExistingUser] = useState<boolean | null>(null);
  const [hasExistingThemeMap, setHasExistingThemeMap] = useState(false);
  const [hasLibraryItems, setHasLibraryItems] = useState(false);
  const [checkingExistingUser, setCheckingExistingUser] = useState(true);

  // Check if user is existing (has indexed chat, library items, or theme map)
  // NOTE: This check does NOT redirect users - existing users can stay on this page
  // and choose to view Theme Map or continue with onboarding
  useEffect(() => {
    let cancelled = false;
    
    const checkExistingUser = async () => {
      try {
        let hasThemeMap = false;
        let hasItems = false;
        let setupComplete = false;
        
        // Check for existing theme map
        const themeMapRes = await fetch("/api/theme-map");
        if (cancelled) return;
        
        if (themeMapRes.ok) {
          const themeMapData = await themeMapRes.json().catch(() => null);
          if (themeMapData && typeof themeMapData === 'object' && themeMapData.success && themeMapData.themes && Array.isArray(themeMapData.themes) && themeMapData.themes.length > 0) {
            hasThemeMap = true;
          }
        }
        
        // Check for library items
        const itemsRes = await fetch("/api/items?view=items");
        if (cancelled) return;
        
        if (itemsRes.ok) {
          const itemsData = await itemsRes.json().catch(() => null);
          if (itemsData && typeof itemsData === 'object' && itemsData.success && itemsData.stats?.totalItems > 0) {
            hasItems = true;
          }
        }
        
        // Check config for setup completion
        const configRes = await fetch("/api/config");
        if (cancelled) return;
        
        if (configRes.ok) {
          const configData = await configRes.json().catch(() => null);
          if (configData && typeof configData === 'object' && configData.success && configData.config?.setupComplete) {
            setupComplete = true;
          }
        }
        
        // If any of the above checks found data, user is existing
        // IMPORTANT: We do NOT redirect existing users - they can stay on this page
        // and choose to view Theme Map or continue with onboarding.
        // The banner will show them an option to view Theme Map, but they can also stay.
        if (!cancelled) {
          setHasExistingThemeMap(hasThemeMap);
          setHasLibraryItems(hasItems);
          setIsExistingUser(hasThemeMap || hasItems || setupComplete);
          setCheckingExistingUser(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to check existing user status:", e);
          setIsExistingUser(false);
          setCheckingExistingUser(false);
        }
      }
    };
    
    checkExistingUser();
    
    return () => {
      cancelled = true;
    };
  }, []);

  // Detect DB metrics on mount
  useEffect(() => {
    let cancelled = false;
    
    const detectDb = async () => {
      if (isPreviewMode) {
        // Simulate detection in preview mode
        if (cancelled) return;
        setDbMetrics({
          size_mb: 150.5,
          estimated_conversations_total: 450,
          estimated_conversations_per_day: 6.2,
          suggested_days: 14,
          confidence: "high",
          explanation: "Based on 450 conversations over 72 days",
          db_path: "/Users/demo/Library/Application Support/Cursor/User/globalStorage/state.vscdb",
        });
        setSelectedDays(14);
        setDetectingDb(false);
        return;
      }
      
      try {
        const res = await fetch("/api/generate-themes");
        if (cancelled) return;
        
        if (!res.ok) {
          const errorText = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(`API error: ${errorText.length > 100 ? res.status : errorText}`);
        }
        const data = await res.json().catch((parseError) => {
          throw new Error(`Invalid response format: ${parseError.message}`);
        });
        
        if (cancelled) return;
        
        if (data && typeof data === 'object' && data.success && data.metrics) {
          // Set metrics - always analyze most recent ~500MB
          setDbMetrics(data.metrics);
          // Days value doesn't matter since we use maxSizeMb: 500
          setSelectedDays(30); // Default, but maxSizeMb: 500 will limit it
        } else {
          // Check for Python version errors
          if (data.errorType === "python_version_too_old") {
            setError(`Python ${data.detectedVersion || "version"} is too old. ${data.error || "Python 3.10+ is required."}`);
          } else if (data.errorType === "python_not_found") {
            setError(data.error || "Python not found. Please install Python 3.10+.");
          } else {
            setError(data.error || "Failed to detect Cursor database");
          }
        }
      } catch (e) {
        if (cancelled) return;
        console.error("Failed to detect DB:", e);
        // Check if error message contains Python version info
        const errorMsg = e instanceof Error ? e.message : String(e);
        if (errorMsg.includes("Python") || errorMsg.includes("python")) {
          setError("Python version issue detected. Please ensure Python 3.10+ is installed.");
        } else {
          setError("Failed to detect Cursor database. Make sure Cursor is installed.");
        }
      } finally {
        if (!cancelled) {
          setDetectingDb(false);
        }
      }
    };
    
    detectDb();
    
    return () => {
      cancelled = true;
    };
  }, [isPreviewMode, router]);
  
  // REMOVED: No longer redirect to /onboarding-choice
  // All users go through the same unified onboarding flow (~500MB analysis)

  // Check for API keys in environment and Vector DB status
  useEffect(() => {
    let cancelled = false;
    
    const checkConfig = async () => {
      try {
        // First check if Anthropic key exists in environment
        const envRes = await fetch("/api/config/env");
        if (cancelled) return;
        
        if (envRes.ok) {
          try {
            const envData = await envRes.json().catch((parseError) => {
              throw new Error(`Invalid response format: ${parseError.message}`);
            });
            
            if (cancelled) return;
            
            if (envData && typeof envData === 'object' && envData.configured?.anthropic) {
              // Anthropic key is in environment - trust it and enable proceed
              setKeyFromEnv(true);
              setSelectedProvider("anthropic");
              setKeyValid(true);
              setError(null);
            }
            // Also check for OpenAI key (optional, for Lenny's expert perspectives)
            if (envData && typeof envData === 'object' && envData.configured?.openai) {
              setOpenaiKeyFromEnv(true);
            }
          } catch (parseError) {
            if (!cancelled) {
              console.error("Failed to parse env config response:", parseError);
              // Continue - will prompt user for key if needed
            }
          }
        }
        
        // Then check config for Vector DB status
        const res = await fetch("/api/config");
        if (cancelled) return;
        
        if (res.ok) {
          const data = await res.json().catch((parseError) => {
            throw new Error(`Invalid response format: ${parseError.message}`);
          });
          
          if (cancelled) return;
          
          if (data && typeof data === 'object' && data.success && data.config) {
            // Check if Vector DB is configured
            if (data.config.vectordb?.url && data.config.vectordb?.anonKey) {
              setHasVectorDb(true);
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          // Ignore - config not available
          console.error("Failed to load config:", e);
        }
      }
    };
    
    checkConfig();
    
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch cost estimate when provider or days change (with debouncing)
  useEffect(() => {
    let cancelled = false;
    
    const fetchCostEstimate = async () => {
      if (isPreviewMode) {
        // Simulate cost in preview mode
        if (!cancelled) {
          setCostEstimate({
            estimatedCostUSD: 0.12,
            inputTokens: 9500,
            outputTokens: 2500,
            breakdown: {
              inputCostUSD: 0.0285,
              outputCostUSD: 0.0375,
              pricingPerMTok: { input: 3.0, output: 15.0 },
            },
            provider: selectedProvider,
            model: selectedProvider === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o",
            disclaimer: "Estimate may vary ±20% based on actual conversation length",
            conversationCount: 50,
          });
        }
        return;
      }

      if (!dbMetrics) return;

      if (!cancelled) setLoadingCost(true);
      try {
        const res = await fetch(
          `/api/generate-themes?estimateCost=true&days=${selectedDays}&provider=${selectedProvider}`
        );
        if (cancelled) return;
        
        if (!res.ok) {
          const errorText = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(`API error: ${errorText.length > 100 ? res.status : errorText}`);
        }
        const data = await res.json().catch((parseError) => {
          throw new Error(`Invalid response format: ${parseError.message}`);
        });
        
        if (cancelled) return;
        
        if (data && typeof data === 'object' && data.success && data.costEstimate) {
          setCostEstimate(data.costEstimate);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to fetch cost estimate:", e);
          // Non-critical - don't show error, just don't display cost
          setCostEstimate(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingCost(false);
        }
      }
    };

    // Debounce cost estimate fetching (300ms delay)
    const timer = setTimeout(() => {
      fetchCostEstimate();
    }, 300);
    
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedDays, selectedProvider, dbMetrics, isPreviewMode]);

  // Validate API key
  const validateKey = useCallback(async () => {
    if (!apiKey && !keyFromEnv) return false;
    
    setValidatingKey(true);
    setKeyValid(null);
    setError(null);
    
    try {
      const envVarName = selectedProvider === "anthropic" 
        ? "ANTHROPIC_API_KEY" 
        : "OPENAI_API_KEY";
      
      const res = await fetch("/api/config/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [envVarName]: apiKey }),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Validation failed: ${errorText.length > 100 ? res.status : errorText}`);
      }
      
      const data = await res.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (data && typeof data === 'object' && data.success && data.valid) {
        setKeyValid(true);
        return true;
      } else {
        setKeyValid(false);
        // Type-safe access to results based on selectedProvider
        const errorMessage = selectedProvider === "anthropic" 
          ? data.results?.anthropic?.error 
          : data.results?.openai?.error;
        setError(errorMessage || "Invalid API key");
        return false;
      }
    } catch (e) {
      console.error("Key validation failed:", e);
      setKeyValid(false);
      setError("Failed to validate key");
      return false;
    } finally {
      setValidatingKey(false);
    }
  }, [apiKey, keyFromEnv, selectedProvider]);

  // Validate OpenAI key (optional - only validate if provided)
  const validateOpenaiKey = useCallback(async () => {
    if (!openaiKey || openaiKey.length === 0) {
      setOpenaiKeyValid(null);
      return true; // Empty is valid (optional field)
    }
    
    setValidatingOpenaiKey(true);
    setOpenaiKeyValid(null);
    
    try {
      const res = await fetch("/api/config/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ OPENAI_API_KEY: openaiKey }),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Validation failed: ${errorText.length > 100 ? res.status : errorText}`);
      }
      
      const data = await res.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (data && typeof data === 'object' && data.success && data.results?.openai?.valid) {
        setOpenaiKeyValid(true);
        return true;
      } else {
        setOpenaiKeyValid(false);
        return false;
      }
    } catch (e) {
      console.error("OpenAI key validation failed:", e);
      setOpenaiKeyValid(false);
      return false;
    } finally {
      setValidatingOpenaiKey(false);
    }
  }, [openaiKey]);

  // Auto-download Lenny embeddings when OpenAI key is available
  const downloadLennyEmbeddings = useCallback(async () => {
    if (lennyDownloading) return; // Already downloading
    
    setLennyDownloading(true);
    setLennyDownloadProgress("📥 Downloading Lenny's expert perspectives (~250MB)...");
    
    try {
      const res = await fetch("/api/lenny-download", { method: "POST" });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const errorMsg = errorData?.error || `HTTP ${res.status}`;
        console.warn("Lenny download failed (non-critical):", errorMsg);
        setLennyDownloadProgress("⚠️ Lenny download skipped (will retry later)");
        // Don't block onboarding - just log warning
        setTimeout(() => setLennyDownloadProgress(""), 5000);
        return;
      }
      
      const data = await res.json().catch(() => null);
      if (data?.success) {
        setLennyDownloadProgress("✓ Lenny's expert perspectives ready!");
        setTimeout(() => setLennyDownloadProgress(""), 3000);
      } else {
        setLennyDownloadProgress("⚠️ Download in progress (non-blocking)");
        setTimeout(() => setLennyDownloadProgress(""), 5000);
      }
    } catch (e) {
      console.warn("Lenny download error (non-critical):", e);
      setLennyDownloadProgress("⚠️ Download skipped (will retry later)");
      setTimeout(() => setLennyDownloadProgress(""), 5000);
    } finally {
      setLennyDownloading(false);
    }
  }, [lennyDownloading]);

  // Save API key and proceed
  const saveKeyAndProceed = useCallback(async () => {
    if (isPreviewMode) {
      setStep("generate");
      return;
    }
    
    // Validate Anthropic key first (always required, even for env keys)
    if (keyValid !== true) {
      const isValid = await validateKey();
      if (!isValid) return;
    }
    
    // Validate OpenAI key if provided (optional but should be valid if provided)
    if (openaiKey && openaiKey.length > 0 && openaiKeyValid !== true) {
      const isValid = await validateOpenaiKey();
      if (!isValid) {
        setError("OpenAI API key is invalid. Please check your key or leave it empty.");
        return;
      }
    }
    
    try {
      // Build keys to save
      const keysToSave: Record<string, string> = {};
      
      // Save Anthropic key if user typed one (not from env)
      if (!keyFromEnv && apiKey) {
        const envVarName = selectedProvider === "anthropic" 
          ? "ANTHROPIC_API_KEY" 
          : "OPENAI_API_KEY";
        keysToSave[envVarName] = apiKey;
      }
      
      // Save OpenAI key if user typed one (optional, for Lenny's expert perspectives)
      if (!openaiKeyFromEnv && openaiKey && openaiKey.length > 0) {
        keysToSave["OPENAI_API_KEY"] = openaiKey;
      }
      
      // Save all keys in one request
      if (Object.keys(keysToSave).length > 0) {
        const res = await fetch("/api/config/env", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(keysToSave),
        });
        
        if (!res.ok) {
          const errorText = await res.text().catch(() => `HTTP ${res.status}`);
          let errorData: any = {};
          try {
            errorData = JSON.parse(errorText);
          } catch {
            // Not JSON, use text as error
          }
          throw new Error((errorData && typeof errorData === 'object' && errorData.error) || errorText || "Failed to save API key");
        }
      }
      
      // Save minimal config (always, to mark fast start complete)
      const configRes = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: 1,
          setupComplete: false, // Will be true after full setup
          fastStartComplete: true,
          llm: {
            provider: selectedProvider,
          },
        }),
      });
      
      if (!configRes.ok) {
        const errorText = await configRes.text().catch(() => `HTTP ${configRes.status}`);
        throw new Error(`Failed to save config: ${errorText.length > 100 ? configRes.status : errorText}`);
      }
      
      const configData = await configRes.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (!(configData && typeof configData === 'object' && configData.success)) {
        throw new Error("Config save returned unsuccessful response");
      }
      
      // Verify config was actually saved by reading it back (prevents race conditions)
      const verifyRes = await fetch("/api/config");
      if (!verifyRes.ok) {
        throw new Error("Failed to verify config save");
      }
      const verifyData = await verifyRes.json().catch(() => null);
      if (!verifyData || !verifyData.success || !verifyData.config?.fastStartComplete) {
        throw new Error("Config verification failed - save may not have persisted");
      }
      
      setStep("generate");
      
      // Auto-download Lenny embeddings for ALL users (not just those with OpenAI key)
      // Embeddings are pre-computed and can be downloaded without API key
      // OpenAI key is only needed later when actually searching the embeddings
      // Do this AFTER setting step to "generate" so it doesn't block the UI
      fetch("/api/lenny-stats")
        .then(res => res.json().catch(() => null))
        .then(lennyStats => {
          if (lennyStats && !lennyStats.indexed) {
            // Start download in background (don't block onboarding)
            downloadLennyEmbeddings();
          }
        })
        .catch(() => {
          // Silent fail - non-critical
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }, [apiKey, keyFromEnv, keyValid, selectedProvider, validateKey, validateOpenaiKey, isPreviewMode, openaiKey, openaiKeyFromEnv, openaiKeyValid, downloadLennyEmbeddings]);

  // Generate Theme Map
  const generateThemeMap = useCallback(async () => {
    if (isPreviewMode) {
      // Simulate generation
      setGenerating(true);
      setGenerationProgress("Extracting conversations...");
      await new Promise(r => setTimeout(r, 1000));
      setGenerationProgress("Analyzing patterns...");
      await new Promise(r => setTimeout(r, 1500));
      setGenerationProgress("Generating themes...");
      await new Promise(r => setTimeout(r, 1000));
      
      setThemeMap({
        generatedAt: new Date().toISOString(),
        suggestedDays: selectedDays,
        analyzed: {
          days: selectedDays,
          conversationsConsidered: 85,
          conversationsUsed: 60,
        },
        themes: [
          {
            id: "theme_1",
            title: "AI-Assisted Code Refactoring",
            summary: "You frequently use AI to refactor and improve existing code, focusing on maintainability and performance.",
            whyItMatters: [
              "Reduces technical debt systematically",
              "Improves code quality without manual review overhead",
            ],
            evidence: [
              {
                workspace: "/Users/demo/projects/app",
                chatId: "demo-1",
                chatType: "composer",
                date: "2026-01-10",
                snippet: "Can you refactor this function to use async/await...",
              },
            ],
          },
          {
            id: "theme_2",
            title: "Error Handling & Debugging",
            summary: "Significant time spent debugging errors and improving error handling patterns.",
            whyItMatters: [
              "Critical for production reliability",
              "Reduces time-to-resolution for issues",
            ],
            evidence: [
              {
                workspace: "/Users/demo/projects/api",
                chatId: "demo-2",
                chatType: "chat",
                date: "2026-01-08",
                snippet: "I'm getting this error: TypeError...",
              },
            ],
          },
        ],
        counterIntuitive: [
          {
            title: "Building Multiple Apps",
            perspective: "What if focusing on fewer apps would accelerate learning?",
            reasoning: "You're building Inspiration, Catalog, and S2_Chat simultaneously. While breadth is valuable, depth in one domain might unlock insights faster.",
          },
          {
            title: "Production Clones",
            perspective: "What if studying production code slows your original thinking?",
            reasoning: "You clone production repos to learn, but this might bias you toward existing patterns rather than discovering novel approaches.",
          },
        ],
        unexploredTerritory: [
          {
            title: "Testing & Test Coverage",
            why: "Given your focus on refactoring and error handling, the absence of testing discussions could lead to regressions.",
          },
        ],
      });
      setGenerating(false);
      return;
    }
    
    setGenerating(true);
    setGenerationProgress("Extracting high-signal conversations...");
    setError(null);
    
    // Wait for Lenny embeddings download to complete if needed (for OpenAI key users)
    // This ensures Lenny perspectives are included in the Theme Map
    if (openaiKey || openaiKeyFromEnv) {
      setGenerationProgress("Checking Lenny's expert perspectives...");
      
      // Check if Lenny is already indexed
      const statsRes = await fetch("/api/lenny-stats").catch(() => null);
      const stats = statsRes?.ok ? await statsRes.json().catch(() => null) : null;
      
      if (!stats?.indexed) {
        // Files don't exist - wait for download to complete (if in progress)
        if (lennyDownloading) {
          setGenerationProgress("Waiting for Lenny's expert perspectives to download (~250MB)...");
          let attempts = 0;
          const maxAttempts = 60; // 60 attempts × 2 seconds = 2 minutes max wait
          
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds
            
            const checkRes = await fetch("/api/lenny-stats").catch(() => null);
            const checkStats = checkRes?.ok ? await checkRes.json().catch(() => null) : null;
            
            if (checkStats?.indexed) {
              // Download complete - ready to proceed
              setGenerationProgress("Lenny's expert perspectives ready!");
              await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause to show message
              break;
            }
            
            attempts++;
          }
          
          if (attempts >= maxAttempts) {
            console.warn("Lenny download timeout - proceeding without Lenny perspectives");
            setGenerationProgress("Proceeding (Lenny perspectives will be available after download completes)...");
          }
        } else {
          // Download not started - trigger it and wait briefly, then proceed
          // (Download will complete in background, user can regenerate later for Lenny perspectives)
          console.log("Lenny download not started - triggering download in background");
          downloadLennyEmbeddings();
          setGenerationProgress("Lenny's expert perspectives downloading in background (regenerate Theme Map later to include them)...");
          await new Promise(resolve => setTimeout(resolve, 2000)); // Brief pause
        }
      }
    }
    
    setGenerationProgress("Extracting high-signal conversations...");
    
    try {
      const res = await fetch("/api/generate-themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Size-based generation (most recent ~500MB) - days parameter ignored when maxSizeMb is set
          maxSizeMb: 500,
          provider: selectedProvider,
          source: "sqlite", // Force SQLite (even if Vector DB exists)
        }),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        let errorMsg = `API error: ${res.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMsg = (errorData && typeof errorData === 'object' && errorData.error) || errorMsg;
        } catch {
          // Use default error message
          errorMsg = errorText.length > 100 ? `HTTP ${res.status}` : errorText;
        }
        throw new Error(errorMsg);
      }
      
      const data = await res.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (data && typeof data === 'object' && data.success && data.result) {
        // Debug: Log Lenny status
        console.log("[ThemeMap] Lenny status:", {
          lennyAvailable: data.result.lennyAvailable,
          lennyUnlocked: data.result.lennyUnlocked,
          expertPerspectivesCount: data.result.themes?.reduce((sum: number, t: Theme) => sum + (t.expertPerspectives?.length || 0), 0) || 0,
        });
        setThemeMap(data.result);
        
        // Mark Fast Start as complete (setupComplete: true) after successful theme map generation
        // This prevents redirect loops when user visits home page
        try {
          const completeRes = await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              setupComplete: true, // Mark as complete so home page doesn't redirect
              fastStartComplete: true,
            }),
          });
          if (!completeRes.ok) {
            throw new Error(`HTTP ${completeRes.status}`);
          }
          
          // Verify config was actually saved
          const verifyRes = await fetch("/api/config");
          if (!verifyRes.ok) {
            throw new Error("Failed to verify config save");
          }
          const verifyData = await verifyRes.json().catch(() => null);
          if (!verifyData || !verifyData.success || !(verifyData.config?.setupComplete || verifyData.config?.fastStartComplete)) {
            throw new Error("Config verification failed - completion may not have persisted");
          }
        } catch (completeErr) {
          // Non-critical: Theme Map still displayed even if config update fails
          const errorMsg = completeErr instanceof Error ? completeErr.message : "Unknown error";
          console.warn("Failed to mark Fast Start complete:", errorMsg);
          // Show warning to user (non-blocking)
          setError(`Theme Map generated successfully, but failed to mark setup complete: ${errorMsg}. You may be redirected to onboarding on refresh.`);
          // Clear error after 5 seconds
          setTimeout(() => {
            setError(null);
          }, 5000);
        }
        
        // Persist Theme Map to data/theme_map.json
        try {
          const persistRes = await fetch("/api/theme-map", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              // Size-based Theme Map (most recent ~500MB) - use consistent cache key
              days: null, // null = size-based, not days-based
              maxSizeMb: 500, // Context: this Theme Map is based on ~500MB
              themes: data.result.themes.map((t: Theme) => ({
                name: t.title,
                description: t.summary,
                evidence: t.evidence.map((e: ThemeEvidence) => ({
                  conversation_id: e.chatId,
                  snippet: e.snippet,
                })),
                expertPerspectives: t.expertPerspectives || [], // Preserve Lenny's wisdom
              })),
              counter_intuitive: data.result.counterIntuitive || [],
              unexplored_territory: data.result.unexploredTerritory || [],
              generated_at: data.result.generatedAt,
              conversations_analyzed: data.result.analyzed.conversationsUsed,
              conversations_considered: data.result.analyzed.conversationsConsidered,
              meta: {
                llm_provider: selectedProvider,
              },
            }),
          });
          if (!persistRes.ok) {
            const errorText = await persistRes.text().catch(() => `HTTP ${persistRes.status}`);
            const errorMsg = errorText.length > 100 ? `HTTP ${persistRes.status}` : errorText;
            console.warn("Failed to persist Theme Map (non-critical):", errorMsg);
            // Show warning to user (non-blocking)
            setError(`Theme Map generated successfully, but failed to save: ${errorMsg}. You may lose it on refresh.`);
            // Clear error after 5 seconds
            setTimeout(() => {
              setError(null);
            }, 5000);
          }
        } catch (persistErr) {
          // Non-critical: Theme Map still displayed even if persistence fails
          const errorMsg = persistErr instanceof Error ? persistErr.message : "Unknown error";
          console.warn("Failed to persist Theme Map:", errorMsg);
          // Show warning to user (non-blocking)
          setError(`Theme Map generated successfully, but failed to save: ${errorMsg}. You may lose it on refresh.`);
          // Clear error after 5 seconds
          setTimeout(() => {
            setError(null);
          }, 5000);
        }
        } else {
          // Enhanced error handling with user-friendly messages
          const errorMsg = (data && typeof data === 'object' && data.error) || "Failed to generate themes";
          const errorDetails = (data && typeof data === 'object' && data.details) || null;
          
          // Format user-friendly error message
          let friendlyError = errorMsg;
          if (errorMsg.includes("API key") || errorMsg.includes("authentication") || errorMsg.includes("401") || errorMsg.includes("403")) {
            friendlyError = "🔑 API Key Issue: Your API key may be invalid or expired. Please check your API key in Settings and try again.";
          } else if (errorMsg.includes("rate limit") || errorMsg.includes("429")) {
            friendlyError = "⏱️ Rate Limited: Too many requests. Please wait a minute and try again.";
          } else if (errorMsg.includes("timeout") || errorMsg.includes("timed out") || errorMsg.includes("504")) {
            friendlyError = "⏳ Request Timed Out: The generation took too long. Try selecting a smaller time window (e.g., 7 days instead of 14).";
          } else if (errorMsg.includes("No conversations") || errorMsg.includes("no messages")) {
            friendlyError = "📭 No Conversations Found: No chat history found in the selected time window. Try selecting a longer period or check if Cursor is installed.";
          } else if (errorMsg.includes("Python") || errorMsg.includes("python")) {
            friendlyError = "🐍 Python Issue: Python 3.10+ is required. Please install Python and restart the app.";
          } else if (errorMsg.includes("database") || errorMsg.includes("DB")) {
            friendlyError = "💾 Database Issue: Could not access your Cursor chat history. Make sure Cursor is installed and has been used at least once.";
          } else {
            friendlyError = `❌ Generation Failed: ${errorMsg}. Please try again or check Settings if the issue persists.`;
          }
          
          setError(friendlyError);
          console.error("Theme generation failed:", { error: errorMsg, details: errorDetails });
        }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
      setGenerationProgress("");
    }
  }, [selectedDays, selectedProvider, isPreviewMode]);

  // Track if we've already attempted generation to prevent infinite loops
  const hasAttemptedGeneration = useRef(false);
  
  // Auto-generate when reaching generate step (only once)
  useEffect(() => {
    if (step === "generate" && !themeMap && !generating && !hasAttemptedGeneration.current) {
      hasAttemptedGeneration.current = true;
      generateThemeMap();
    }
    // Reset flag if step changes away from generate
    if (step !== "generate") {
      hasAttemptedGeneration.current = false;
    }
    // Note: Intentionally only depend on `step` to avoid re-running when selectedDays/selectedProvider change.
    // Once user reaches generate step, those values are already set and shouldn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]); // Only depend on step to avoid infinite loops

  // Navigate to main app
  const goToApp = () => {
    router.push("/");
  };

  // Navigate to Theme Map
  const goToThemeMap = () => {
    router.push("/theme-map");
  };

  // Navigate to full setup
  const goToFullSetup = () => {
    router.push("/onboarding");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950 flex items-center justify-center p-6">
      {/* Background decoration */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      {/* Preview Mode Banner - Sticky */}
      {isPreviewMode && (
        <div className="fixed top-0 left-0 right-0 bg-amber-500/90 text-black text-center py-2 text-sm font-medium z-50 shadow-lg">
          🔬 Preview Mode — No data will be saved.{" "}
          <Link href="/" className="underline font-semibold hover:bg-amber-400/50 px-2 py-1 rounded">
            Exit Preview
          </Link>
        </div>
      )}

      <div className={`w-full max-w-2xl ${isPreviewMode ? 'mt-12' : ''}`}>
        {/* Progress indicator */}
        <div className="flex justify-center gap-2 mb-8">
          {["welcome", "api-key", "generate"].map((s, i) => (
            <div
              key={s}
              className={`h-2 w-20 rounded-full transition-colors ${
                step === s
                  ? "bg-indigo-500"
                  : ["welcome", "api-key", "generate"].indexOf(step) > i
                  ? "bg-indigo-500/50"
                  : "bg-slate-700"
              }`}
            />
          ))}
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* Existing User Banner */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* 
          NOTE: Existing users are NOT automatically redirected.
          They can stay on this page, view their chat history size, 
          and choose to view Theme Map or continue with onboarding.
        */}
        {/* Banner removed as per user request */}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* SCREEN 1: Welcome + Auto-detect */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === "welcome" && (
          <div className="text-center space-y-8">
            <div className="space-y-4">
              <span className="text-6xl">⚡</span>
              <h1 className="text-4xl font-bold text-white">Inspiration Fast Start</h1>
              <p className="text-xl text-slate-300">
                See your first patterns in <strong className="text-indigo-300">~90 seconds</strong>
              </p>
            </div>

            {/* DB Detection Card */}
            <div className={`rounded-2xl p-6 text-left ${
              detectingDb 
                ? "bg-slate-800/50 border border-slate-700" 
                : dbMetrics?.db_path
                  ? "bg-emerald-500/10 border border-emerald-500/30"
                  : "bg-red-500/10 border border-red-500/30"
            }`}>
              {detectingDb ? (
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                  <div>
                    <div className="font-semibold text-white">Detecting your Cursor and Claude Code history</div>
                  </div>
                </div>
              ) : dbMetrics?.db_path ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🧠</span>
                    <div>
                      <div className="font-semibold text-white text-lg">
                        Found {(() => {
                          const sizeMb = dbMetrics.size_mb;
                          if (sizeMb >= 1000) {
                            return `${(sizeMb / 1000).toFixed(1)} GB`;
                          }
                          return `${sizeMb.toFixed(0)} MB`;
                        })()} of chat history
                      </div>
                      <div className="text-sm text-slate-400">
                        ~{dbMetrics.estimated_conversations_total} conversations • {dbMetrics.explanation}
                      </div>
                    </div>
                  </div>
                  
                  {/* Unified onboarding: Always analyze most recent ~500MB */}
                  <div className="pt-4 border-t border-slate-700/50">
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                      <div className="text-sm text-slate-300 mb-2">
                        <span className="text-emerald-400">✓</span> We'll analyze the most recent <strong className="text-indigo-400">~500MB</strong> of your chat history
                      </div>
                      <div className="text-xs text-slate-400">
                        Includes Cursor and Claude Code conversations, prioritized by relevance.
                      </div>
                    </div>
                  </div>
                  
                </div>
              ) : (error && (error.includes("Python") || error.includes("python"))) ? (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">🐍</span>
                    <div className="flex-1">
                      <div className="font-semibold text-amber-300 mb-2">Python Version Issue</div>
                      <div className="text-sm text-slate-300 mb-3">{error}</div>
                      <div className="text-xs text-slate-400 space-y-1">
                        <div><strong>macOS:</strong> <code className="bg-slate-800 px-2 py-1 rounded">brew install python@3.11</code></div>
                        <div><strong>Windows:</strong> Download from <a href="https://python.org/downloads" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">python.org</a></div>
                        <div className="mt-2 text-slate-500">After installing, restart this app and try again.</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-3xl">⚠️</span>
                  <div>
                    <div className="font-semibold text-white">Cursor database not found</div>
                    <div className="text-sm text-slate-400">
                      {error || "Make sure Cursor is installed and has been used at least once."}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* What you'll get */}
            <div className="bg-slate-800/50 rounded-2xl p-6 text-left">
              <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
                <span>🎯</span> Your Theme Map will show:
              </h2>
              <ul className="space-y-3 text-slate-300">
                <li className="flex items-start gap-3">
                  <span className="text-indigo-400">→</span>
                  <span><strong>Top 5 themes</strong> — Patterns in your AI conversations</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-indigo-400">→</span>
                  <span><strong>Evidence</strong> — Real examples from your chats</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-indigo-400">→</span>
                  <span><strong>Counter-intuitive</strong> — Assumptions worth questioning</span>
                </li>
              </ul>
            </div>

            <div className="text-sm text-slate-500">
              We'll analyze your most recent ~500MB • Just API keys needed • ~90 seconds
            </div>

            <button
              onClick={() => setStep("api-key")}
              disabled={detectingDb || !dbMetrics?.db_path}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-lg rounded-xl transition-all"
            >
              {detectingDb ? "Detecting..." : !dbMetrics?.db_path ? "Database Required" : "Continue →"}
            </button>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* SCREEN 2: API Key */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === "api-key" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <span className="text-4xl">🔑</span>
              <h1 className="text-3xl font-bold text-white">Add Your LLM Key</h1>
              <p className="text-slate-400">
                Powers the AI analysis. Runs locally — your key never leaves your machine.
              </p>
            </div>

            {error && !keyFromEnv && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
                {error}
              </div>
            )}

            {keyFromEnv && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-emerald-400 text-sm flex items-center gap-2">
                <span>✓</span>
                <span>Anthropic API key found in environment. You can proceed directly.</span>
              </div>
            )}

            {/* API Key input - Anthropic only for Fast Start */}
            {!keyFromEnv && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">
                  Anthropic API Key
                  <span className="text-red-400 ml-1">*</span>
                </label>
                <p className="text-xs text-slate-400">
                  Required for generating your <strong className="text-indigo-400">Theme Map</strong> from chat history. 
                  Analyzes patterns and insights from your conversations.
                </p>
                <div className="relative">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setKeyValid(null);
                    }}
                    onBlur={() => {
                      // Auto-validate when user clicks away or presses Tab
                      if (apiKey && apiKey.length > 0) {
                        validateKey();
                      }
                    }}
                    placeholder="sk-ant-..."
                    autoComplete="off"
                    className={`w-full px-4 py-3 pr-10 bg-slate-800/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      keyValid === true
                        ? "border-emerald-500"
                        : keyValid === false
                        ? "border-red-500"
                        : "border-slate-700"
                    }`}
                  />
                  {keyValid !== null && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg">
                      {keyValid ? "✅" : "❌"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Get one at{" "}
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                    console.anthropic.com
                  </a>
                </p>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <span>🔒</span>
                  <span>Saved locally to <code className="text-slate-400">.env.local</code> — never uploaded or shared</span>
                </p>
              </div>
            )}

            {/* Optional OpenAI Key for Lenny's Expert Perspectives */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">
                OpenAI API Key
                <span className="text-slate-500 font-normal ml-2">(optional)</span>
              </label>
              <p className="text-xs text-slate-400">
                <strong className="text-indigo-400">Optional:</strong> Unlock expert perspectives from <strong className="text-indigo-400">300+ Lenny&apos;s Podcast episodes</strong>. 
                See what industry leaders have said about your themes. Lenny&apos;s archive downloads automatically; OpenAI key enables semantic search to match your themes with expert quotes.
              </p>
              {openaiKeyFromEnv ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-emerald-400 text-sm flex items-center gap-2">
                  <span>✓</span>
                  <span>OpenAI API key found in environment. Expert perspectives enabled.</span>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="password"
                    value={openaiKey}
                    onChange={(e) => {
                      setOpenaiKey(e.target.value);
                      setOpenaiKeyValid(null);
                    }}
                    onBlur={() => {
                      // Auto-validate when user clicks away or presses Tab (optional field)
                      if (openaiKey && openaiKey.length > 0) {
                        validateOpenaiKey();
                      }
                    }}
                    placeholder="sk-..."
                    autoComplete="off"
                    className={`w-full px-4 py-3 pr-10 bg-slate-800/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      openaiKeyValid === true
                        ? "border-emerald-500"
                        : openaiKeyValid === false
                        ? "border-red-500"
                        : "border-slate-700"
                    }`}
                  />
                  {openaiKeyValid !== null && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg">
                      {openaiKeyValid ? "✅" : "❌"}
                    </span>
                  )}
                  {validatingOpenaiKey && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                      ⏳
                    </span>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-500">
                Get one at{" "}
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                  platform.openai.com
                </a>
              </p>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <span>🔒</span>
                <span>Saved locally to <code className="text-slate-400">.env.local</code> — never uploaded or shared</span>
              </p>
            </div>


            <div className="flex gap-3">
              <button
                onClick={() => setStep("welcome")}
                disabled={validatingKey}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={saveKeyAndProceed}
                disabled={validatingKey || keyValid !== true}
                className="flex-[2] py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {validatingKey ? (
                  <>
                    <span className="animate-spin">⏳</span> Validating...
                  </>
                ) : (
                  "Generate Theme Map →"
                )}
              </button>
            </div>

            <p className="text-center text-xs text-slate-500">
              Key stored locally in .env.local — never sent to external servers.
            </p>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* SCREEN 3: Generate & Results */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === "generate" && (
          <div className="space-y-6">
            {/* Info Banner - Always show what we're analyzing */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">ℹ️</span>
                <div>
                  <div className="font-semibold text-blue-300">Analyzing Most Recent ~500MB</div>
                  <div className="text-sm text-slate-300 mt-1">
                    Mining high-signal conversations from Cursor + Claude Code to generate your Theme Map.
                  </div>
                </div>
              </div>
            </div>
            
            {/* Lenny Download Progress */}
            {lennyDownloadProgress && (
              <div className={`rounded-xl p-4 ${
                lennyDownloadProgress.startsWith("✓")
                  ? "bg-emerald-500/10 border border-emerald-500/30"
                  : lennyDownloadProgress.startsWith("⚠️")
                  ? "bg-amber-500/10 border border-amber-500/30"
                  : "bg-blue-500/10 border border-blue-500/30"
              }`}>
                <div className="flex items-center gap-3">
                  {lennyDownloading && <span className="animate-spin">⏳</span>}
                  <div className="text-sm text-slate-300">{lennyDownloadProgress}</div>
                </div>
              </div>
            )}
            
            {/* Generating state */}
            {generating && (
              <div className="text-center space-y-6 py-12">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Generating Your Theme Map</h2>
                  <p className="text-slate-400">{generationProgress || "Analyzing your conversations..."}</p>
                </div>
                <p className="text-sm text-slate-500">This usually takes 30-60 seconds...</p>
              </div>
            )}

            {/* Error state */}
            {error && !generating && (
              <div className="text-center space-y-6 py-8">
                <span className="text-6xl">⚠️</span>
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Generation Failed</h2>
                  <p className="text-red-400">{error}</p>
                </div>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setStep("api-key")}
                    className="py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={generateThemeMap}
                    className="py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {/* Results */}
            {themeMap && !generating && (
              <div className="space-y-6">
                
                {/* Header */}
                <div className="text-center space-y-2">
                  <span className="text-4xl">🎉</span>
                  <h1 className="text-3xl font-bold text-white">Your Theme Map</h1>
                </div>

                {/* Themes */}
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span>🎯</span> Top {themeMap.themes.length} {themeMap.themes.length === 1 ? 'Theme' : 'Themes'}
                  </h2>
                  {themeMap.themes.map((theme, i) => (
                    <div key={theme.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl font-bold text-indigo-400">{i + 1}</span>
                        <div>
                          <h3 className="font-semibold text-white text-lg">{theme.title}</h3>
                          <p className="text-slate-400 text-sm">{theme.summary}</p>
                        </div>
                      </div>
                      
                      {theme.whyItMatters.length > 0 && (
                        <div className="pl-9">
                          <div className="text-xs text-slate-500 mb-1">Why it matters:</div>
                          <ul className="text-sm text-slate-300 space-y-1">
                            {theme.whyItMatters.map((reason, j) => (
                              <li key={j} className="flex items-start gap-2">
                                <span className="text-emerald-400">•</span>
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {theme.evidence.length > 0 && (
                        <div className="pl-9 pt-2 border-t border-slate-700/50">
                          <div className="text-xs text-slate-500 mb-2">Evidence:</div>
                          {theme.evidence.slice(0, 2).map((ev, j) => (
                            <div key={j} className="text-sm text-slate-400 bg-slate-900/50 rounded p-2 mb-2">
                              <div className="text-xs text-slate-500 mb-1">
                                {ev.date} • {ev.chatType}
                              </div>
                              <div className="text-slate-300 italic">&quot;{ev.snippet}&quot;</div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Expert Perspectives from Lenny's Podcast */}
                      {theme.expertPerspectives && theme.expertPerspectives.length > 0 && (
                        <div className="pl-9 pt-2 border-t border-amber-500/20">
                          <div className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                            <span>🎙️</span> Expert Perspectives, Lenny&apos;s Podcast
                          </div>
                          {theme.expertPerspectives.map((quote, j) => (
                            <div key={j} className="text-sm bg-amber-500/5 rounded p-3 border border-amber-500/20">
                              <p className="text-slate-300 italic">&quot;{quote.content}&quot;</p>
                              <div className="flex items-center justify-between mt-2 text-xs">
                                <span className="text-amber-400 font-medium">— {quote.guestName}</span>
                                {quote.youtubeUrl && quote.episodeTitle && (
                                  <a 
                                    href={quote.youtubeUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-slate-500 hover:text-amber-400 transition-colors"
                                  >
                                    📺 {quote.episodeTitle}
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                {/* Lenny Unlock Teaser */}
                {themeMap.lennyAvailable && !themeMap.lennyUnlocked && (
                  <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🎙️</span>
                      <div>
                        <h3 className="font-semibold text-amber-300">Unlock Expert Perspectives</h3>
                        <p className="text-sm text-slate-400 mt-1">
                          Add an OpenAI API key to see what 300+ industry experts (from Lenny&apos;s Podcast, updated weekly) 
                          have said about your themes.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Counter-Intuitive */}
                {themeMap.counterIntuitive && themeMap.counterIntuitive.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <span>💭</span> Counter-Intuitive
                    </h2>
                    {themeMap.counterIntuitive.slice(0, 2).map((item, i) => (
                      <div key={i} className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-5 space-y-3">
                        <div className="flex items-start gap-3">
                          <span className="text-2xl font-bold text-purple-400">{i + 1}</span>
                          <div>
                            <h3 className="font-semibold text-white text-lg">{item.title}</h3>
                            <p className="text-purple-300 text-sm italic mt-1">{item.perspective}</p>
                          </div>
                        </div>
                        <div className="pl-9">
                          <div className="text-xs text-slate-500 mb-1">Why consider this:</div>
                          <p className="text-sm text-slate-300">{item.reasoning}</p>
                        </div>
                        
                        {/* Expert Challenge from Lenny's Podcast */}
                        {item.expertChallenge && (
                          <div className="pl-9 pt-2 border-t border-purple-500/20">
                            <div className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                              <span>🎙️</span> Expert Perspectives, Lenny&apos;s Podcast
                            </div>
                            <div className="text-sm bg-amber-500/5 rounded p-3 border border-amber-500/20">
                              <p className="text-slate-300 italic">&quot;{item.expertChallenge.content}&quot;</p>
                              <div className="flex items-center justify-between mt-2 text-xs">
                                <span className="text-amber-400 font-medium">— {item.expertChallenge.guestName}</span>
                                {item.expertChallenge.youtubeUrl && item.expertChallenge.episodeTitle && (
                                  <a 
                                    href={item.expertChallenge.youtubeUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-slate-500 hover:text-amber-400 transition-colors"
                                  >
                                    📺 {item.expertChallenge.episodeTitle}
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Unexplored Territory */}
                {themeMap.unexploredTerritory.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <span>🔭</span> Unexplored Territory
                    </h2>
                    {themeMap.unexploredTerritory.map((item, i) => (
                      <div key={i} className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 space-y-3">
                        <div className="flex items-start gap-3">
                          <span className="text-2xl font-bold text-amber-400">{i + 1}</span>
                          <div>
                            <h3 className="font-semibold text-white text-lg">{item.title}</h3>
                          </div>
                        </div>
                        <div className="pl-9">
                          <div className="text-xs text-slate-500 mb-1">Why this matters:</div>
                          <p className="text-sm text-slate-300">{item.why}</p>
                        </div>
                        
                        {/* Expert Insight from Lenny's Podcast */}
                        {item.expertInsight && (
                          <div className="pl-9 pt-2 border-t border-amber-500/20">
                            <div className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                              <span>🎙️</span> Expert Perspectives, Lenny&apos;s Podcast
                            </div>
                            <div className="text-sm bg-amber-500/5 rounded p-3 border border-amber-500/20">
                              <p className="text-slate-300 italic">&quot;{item.expertInsight.content}&quot;</p>
                              <div className="flex items-center justify-between mt-2 text-xs">
                                <span className="text-amber-400 font-medium">— {item.expertInsight.guestName}</span>
                                {item.expertInsight.youtubeUrl && item.expertInsight.episodeTitle && (
                                  <a 
                                    href={item.expertInsight.youtubeUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-slate-500 hover:text-amber-400 transition-colors"
                                  >
                                    📺 {item.expertInsight.episodeTitle}
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Next Steps - CTA Behavior based on Vector DB status */}
                <div className="pt-6 border-t border-slate-700 space-y-4">
                  <h2 className="text-lg font-semibold text-white">What's Next?</h2>
                  
                  {/* Full Setup - Main CTA */}
                  {!hasVectorDb && (
                    <button
                      onClick={goToFullSetup}
                      className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-lg rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <span>⚙️</span>
                      <span>Full Setup (Unlock Theme Explorer)</span>
                    </button>
                  )}
                  
                  {/* Theme CTAs */}
                  <div className="grid grid-cols-1 gap-3">
                    {/* Regenerate - Always works */}
                    <button
                      onClick={generateThemeMap}
                      className="py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
                    >
                      🔄 Regenerate Theme Map
                    </button>
                  </div>
                  
                  {/* Explanation */}
                  {!hasVectorDb && (
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm">
                      <div className="flex items-start gap-3">
                        <span className="text-xl">💡</span>
                        <div className="text-slate-400">
                          <strong className="text-slate-300">Theme Map gives you a taste.</strong>
                          <br />
                          Full setup unlocks Theme Explorer (generate themes directly from indexed chat history), 
                          idea generation, semantic search, and a growing Library.
                          Takes ~2 minutes with Supabase (free tier works great).
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
