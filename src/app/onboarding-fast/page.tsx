"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
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
}

interface ThemeEvidence {
  workspace: string;
  chatId: string;
  chatType: string;
  date: string;
  snippet: string;
}

interface Theme {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string[];
  evidence: ThemeEvidence[];
}

interface UnexploredTerritory {
  title: string;
  why: string;
}

interface ThemeMapResult {
  generatedAt?: string;
  suggestedDays: number;
  analyzed: {
    days: number;
    conversationsConsidered: number;
    conversationsUsed: number;
  };
  themes: Theme[];
  unexploredTerritory: UnexploredTerritory[];
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
  
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [error, setError] = useState<string | null>(null);
  
  // DB metrics state
  const [dbMetrics, setDbMetrics] = useState<DbMetrics | null>(null);
  const [detectingDb, setDetectingDb] = useState(true);
  
  // Time window state
  const [selectedDays, setSelectedDays] = useState(14);
  
  // API key state
  const [selectedProvider, setSelectedProvider] = useState<"anthropic" | "openai" | "openrouter">("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [keyFromEnv, setKeyFromEnv] = useState(false);
  const [validatingKey, setValidatingKey] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  
  // Theme generation state
  const [generating, setGenerating] = useState(false);
  const [themeMap, setThemeMap] = useState<ThemeMapResult | null>(null);
  const [generationProgress, setGenerationProgress] = useState("");
  
  // Cost estimation state
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  const [loadingCost, setLoadingCost] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  
  // Vector DB state (for CTA behavior)
  const [hasVectorDb, setHasVectorDb] = useState(false);

  // Detect DB metrics on mount
  useEffect(() => {
    const detectDb = async () => {
      if (isPreviewMode) {
        // Simulate detection in preview mode
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
        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }
        const data = await res.json();
        
        if (data.success && data.metrics) {
          setDbMetrics(data.metrics);
          setSelectedDays(data.metrics.suggested_days || 14);
        } else {
          setError(data.error || "Failed to detect Cursor database");
        }
      } catch (e) {
        console.error("Failed to detect DB:", e);
        setError("Failed to detect Cursor database. Make sure Cursor is installed.");
      } finally {
        setDetectingDb(false);
      }
    };
    
    detectDb();
  }, [isPreviewMode]);

  // Check for API keys in environment and Vector DB status
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const res = await fetch("/api/config");
        if (!res.ok) {
          // Config not available - ignore
          return;
        }
        const data = await res.json();
        
        if (data.success && data.config) {
          // Check if keys exist in config (means they're in .env.local)
          if (data.config.llm?.provider) {
            setKeyFromEnv(true);
            setSelectedProvider(data.config.llm.provider);
          }
          
          // Check if Vector DB is configured
          if (data.config.vectordb?.url && data.config.vectordb?.anonKey) {
            setHasVectorDb(true);
          }
        }
      } catch (e) {
        // Ignore - config not available
      }
    };
    
    checkConfig();
  }, []);

  // Fetch cost estimate when provider or days change
  useEffect(() => {
    const fetchCostEstimate = async () => {
      if (isPreviewMode) {
        // Simulate cost in preview mode
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
        return;
      }

      if (!dbMetrics) return;

      setLoadingCost(true);
      try {
        const res = await fetch(
          `/api/generate-themes?estimateCost=true&days=${selectedDays}&provider=${selectedProvider}`
        );
        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }
        const data = await res.json();
        
        if (data.success && data.costEstimate) {
          setCostEstimate(data.costEstimate);
        }
      } catch (e) {
        console.error("Failed to fetch cost estimate:", e);
        // Non-critical - don't show error, just don't display cost
        setCostEstimate(null);
      } finally {
        setLoadingCost(false);
      }
    };

    fetchCostEstimate();
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
        : selectedProvider === "openai" 
          ? "OPENAI_API_KEY" 
          : "OPENROUTER_API_KEY";
      
      const res = await fetch("/api/config/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [envVarName]: apiKey }),
      });
      
      if (!res.ok) {
        throw new Error(`Validation failed: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.success && data.valid) {
        setKeyValid(true);
        return true;
      } else {
        setKeyValid(false);
        setError(data.results?.[selectedProvider]?.error || "Invalid API key");
        return false;
      }
    } catch (e) {
      setKeyValid(false);
      setError("Failed to validate key");
      return false;
    } finally {
      setValidatingKey(false);
    }
  }, [apiKey, keyFromEnv, selectedProvider]);

  // Save API key and proceed
  const saveKeyAndProceed = useCallback(async () => {
    if (isPreviewMode) {
      setStep("generate");
      return;
    }
    
    // Validate first
    const isValid = await validateKey();
    if (!isValid && !keyFromEnv) return;
    
    // Save key to .env.local
    try {
      const envVarName = selectedProvider === "anthropic" 
        ? "ANTHROPIC_API_KEY" 
        : selectedProvider === "openai" 
          ? "OPENAI_API_KEY" 
          : "OPENROUTER_API_KEY";
      
      const res = await fetch("/api/config/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [envVarName]: apiKey }),
      });
      
      if (!res.ok) {
        throw new Error("Failed to save API key");
      }
      
      // Save minimal config
      await fetch("/api/config", {
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
      
      setStep("generate");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }, [apiKey, keyFromEnv, selectedProvider, validateKey, isPreviewMode]);

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
    
    try {
      const res = await fetch("/api/generate-themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: selectedDays,
          provider: selectedProvider,
        }),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        let errorMsg = `API error: ${res.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMsg = errorData.error || errorMsg;
        } catch {
          // Use default error message
        }
        throw new Error(errorMsg);
      }
      
      const data = await res.json();
      
      if (data.success && data.result) {
        setThemeMap(data.result);
        
        // Persist Theme Map to data/theme_map.json
        try {
          const persistRes = await fetch("/api/theme-map", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              themes: data.result.themes.map((t: Theme) => ({
                name: t.title,
                description: t.summary,
                evidence: t.evidence.map((e: ThemeEvidence) => ({
                  conversation_id: e.chatId,
                  snippet: e.snippet,
                })),
              })),
              unexplored_territory: data.result.unexploredTerritory.map((u: UnexploredTerritory) => u.title),
              generated_at: data.result.generatedAt,
              conversations_analyzed: data.result.analyzed.conversationsUsed,
              time_window_days: data.result.analyzed.days,
              meta: {
                llm_provider: selectedProvider,
              },
            }),
          });
          if (!persistRes.ok) {
            console.warn("Failed to persist Theme Map (non-critical):", await persistRes.text());
          }
        } catch (persistErr) {
          // Non-critical: Theme Map still displayed even if persistence fails
          console.warn("Failed to persist Theme Map:", persistErr);
        }
      } else {
        // Enhanced error handling
        const errorMsg = data.error || "Failed to generate themes";
        const errorDetails = data.details || null;
        
        // Format user-friendly error message
        let friendlyError = errorMsg;
        if (errorMsg.includes("API key")) {
          friendlyError = "API key error: Please check your LLM API key is valid and has sufficient credits.";
        } else if (errorMsg.includes("rate limit") || errorMsg.includes("429")) {
          friendlyError = "Rate limited: Too many requests. Please wait a minute and try again.";
        } else if (errorMsg.includes("timeout") || errorMsg.includes("timed out")) {
          friendlyError = "Request timed out: The generation took too long. Try a smaller time window.";
        } else if (errorMsg.includes("No conversations")) {
          friendlyError = "No conversations found in the selected time window. Try a longer period.";
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

  // Auto-generate when reaching generate step
  useEffect(() => {
    if (step === "generate" && !themeMap && !generating) {
      generateThemeMap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]); // Only depend on step to avoid infinite loops

  // Navigate to main app
  const goToApp = () => {
    router.push("/");
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

      {/* Preview Mode Banner */}
      {isPreviewMode && (
        <div className="fixed top-0 left-0 right-0 bg-amber-500/90 text-black text-center py-2 text-sm font-medium z-50">
          🔬 Preview Mode — No data will be saved.{" "}
          <Link href="/" className="underline">
            Exit Preview
          </Link>
        </div>
      )}

      <div className="w-full max-w-2xl">
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
                    <div className="font-semibold text-white">Detecting your Cursor history...</div>
                    <div className="text-sm text-slate-400">Looking for local database...</div>
                  </div>
                </div>
              ) : dbMetrics?.db_path ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🧠</span>
                    <div>
                      <div className="font-semibold text-white text-lg">
                        Found {dbMetrics.size_mb.toFixed(0)} MB of chat history
                      </div>
                      <div className="text-sm text-slate-400">
                        ~{dbMetrics.estimated_conversations_total} conversations • {dbMetrics.explanation}
                      </div>
                    </div>
                  </div>
                  
                  {/* Time window selector */}
                  <div className="pt-4 border-t border-slate-700/50">
                    <label className="block text-sm font-medium text-slate-300 mb-3">
                      Analyze conversations from the last:
                    </label>
                    <div className="flex gap-2">
                      {[7, 14, 30, 60].map((days) => (
                        <button
                          key={days}
                          onClick={() => setSelectedDays(days)}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                            selectedDays === days
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-700/50 text-slate-300 hover:bg-slate-700"
                          }`}
                        >
                          {days} days
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {dbMetrics.suggested_days === selectedDays ? (
                        <span className="text-emerald-400">✓ Recommended based on your history density</span>
                      ) : selectedDays < dbMetrics.suggested_days ? (
                        "Faster, but fewer patterns"
                      ) : (
                        "Richer themes, but takes longer"
                      )}
                    </div>
                    
                    {/* Cost Estimate */}
                    {(costEstimate || loadingCost) && (
                      <div className="mt-4 pt-4 border-t border-slate-700/50">
                        {loadingCost ? (
                          <div className="flex items-center gap-2 text-sm text-slate-400">
                            <span className="animate-pulse">💰</span>
                            <span>Calculating cost...</span>
                          </div>
                        ) : costEstimate && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">💰</span>
                              <div>
                                <div className="text-sm font-medium text-white">
                                  Estimated cost: ~${costEstimate.estimatedCostUSD < 0.01 
                                    ? costEstimate.estimatedCostUSD.toFixed(4) 
                                    : costEstimate.estimatedCostUSD.toFixed(2)}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {costEstimate.provider} • {costEstimate.conversationCount} conversations
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => setShowCostBreakdown(!showCostBreakdown)}
                              className="text-xs text-indigo-400 hover:text-indigo-300"
                            >
                              {showCostBreakdown ? "Hide" : "Details"}
                            </button>
                          </div>
                        )}
                        
                        {showCostBreakdown && costEstimate && (
                          <div className="mt-2 p-2 bg-slate-900/50 rounded text-xs text-slate-400 space-y-1">
                            <div className="flex justify-between">
                              <span>Input ({costEstimate.inputTokens.toLocaleString()} tokens)</span>
                              <span>${costEstimate.breakdown.inputCostUSD.toFixed(4)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Output ({costEstimate.outputTokens.toLocaleString()} tokens)</span>
                              <span>${costEstimate.breakdown.outputCostUSD.toFixed(4)}</span>
                            </div>
                            <div className="text-slate-500 italic pt-1 border-t border-slate-700/50">
                              {costEstimate.disclaimer}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-3xl">⚠️</span>
                  <div>
                    <div className="font-semibold text-white">Cursor database not found</div>
                    <div className="text-sm text-slate-400">
                      Make sure Cursor is installed and has been used at least once.
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
                  <span><strong>Unexplored territory</strong> — Topics you might be missing</span>
                </li>
              </ul>
            </div>

            <div className="text-sm text-slate-500">
              No Supabase needed • Just one API key • ~90 seconds
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

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
                {error}
              </div>
            )}

            {keyFromEnv && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-emerald-400 text-sm flex items-center gap-2">
                <span>✓</span>
                <span>Found API key in environment. You can proceed directly.</span>
              </div>
            )}

            {/* Provider selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300">
                Select Provider
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "anthropic" as const, name: "Anthropic", icon: "🅰️" },
                  { id: "openai" as const, name: "OpenAI", icon: "🤖" },
                  { id: "openrouter" as const, name: "OpenRouter", icon: "🔀" },
                ].map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => {
                      setSelectedProvider(provider.id);
                      setApiKey("");
                      setKeyValid(null);
                    }}
                    className={`p-4 rounded-xl border transition-all ${
                      selectedProvider === provider.id
                        ? "bg-indigo-600/20 border-indigo-500"
                        : "bg-slate-800/50 border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    <div className="text-2xl mb-1">{provider.icon}</div>
                    <div className="text-sm font-medium text-white">{provider.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* API Key input */}
            {!keyFromEnv && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">
                  {selectedProvider === "anthropic" && "Anthropic API Key"}
                  {selectedProvider === "openai" && "OpenAI API Key"}
                  {selectedProvider === "openrouter" && "OpenRouter API Key"}
                  <span className="text-red-400 ml-1">*</span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setKeyValid(null);
                    }}
                    placeholder={
                      selectedProvider === "anthropic" ? "sk-ant-..." :
                      selectedProvider === "openai" ? "sk-..." :
                      "sk-or-..."
                    }
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
                  {selectedProvider === "anthropic" && (
                    <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                      console.anthropic.com
                    </a>
                  )}
                  {selectedProvider === "openai" && (
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                      platform.openai.com
                    </a>
                  )}
                  {selectedProvider === "openrouter" && (
                    <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                      openrouter.ai
                    </a>
                  )}
                </p>
              </div>
            )}

            {/* Cost Summary */}
            {costEstimate && (
              <div className="flex items-center gap-3 p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                <span className="text-2xl">💰</span>
                <div className="flex-1">
                  <div className="text-sm text-white">
                    Estimated cost: <strong className="text-emerald-400">~${costEstimate.estimatedCostUSD < 0.01 
                      ? costEstimate.estimatedCostUSD.toFixed(4) 
                      : costEstimate.estimatedCostUSD.toFixed(2)}</strong>
                  </div>
                  <div className="text-xs text-slate-500">
                    {selectedDays} days • {costEstimate.conversationCount} conversations • {selectedProvider}
                  </div>
                </div>
              </div>
            )}

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
                disabled={validatingKey || (!keyFromEnv && !apiKey)}
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
                  <p className="text-slate-400">
                    Analyzed {themeMap.analyzed.conversationsUsed} conversations from the last {themeMap.analyzed.days} days
                  </p>
                </div>

                {/* Themes */}
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span>🎯</span> Top Themes
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
                              <div className="text-slate-300 italic">"{ev.snippet}"</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Unexplored Territory */}
                {themeMap.unexploredTerritory.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <span>🔭</span> Unexplored Territory
                    </h2>
                    {themeMap.unexploredTerritory.map((item, i) => (
                      <div key={i} className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                        <h3 className="font-medium text-amber-300">{item.title}</h3>
                        <p className="text-sm text-slate-400 mt-1">{item.why}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Next Steps - CTA Behavior based on Vector DB status */}
                <div className="pt-6 border-t border-slate-700 space-y-4">
                  <h2 className="text-lg font-semibold text-white">What's Next?</h2>
                  
                  {/* Primary CTA */}
                  <button
                    onClick={goToApp}
                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-lg rounded-xl transition-all"
                  >
                    🚀 Start Using Inspiration
                  </button>
                  
                  {/* Theme CTAs with locked/unlocked behavior */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Regenerate - Always works */}
                    <button
                      onClick={generateThemeMap}
                      className="py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
                    >
                      🔄 Regenerate Theme Map
                    </button>
                    
                    {/* Generate Ideas - Requires Vector DB */}
                    {hasVectorDb ? (
                      <button
                        onClick={() => router.push("/?tool=ideas")}
                        className="py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
                      >
                        💡 Generate Ideas
                      </button>
                    ) : (
                      <button
                        onClick={goToFullSetup}
                        className="py-3 bg-slate-800/50 border border-slate-600 text-slate-400 font-medium rounded-lg transition-colors hover:border-slate-500 flex items-center justify-center gap-2"
                        title="Requires full setup with Vector DB"
                      >
                        <span>🔒</span>
                        <span>Generate Ideas</span>
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* Seek - Requires Vector DB */}
                    {hasVectorDb ? (
                      <button
                        onClick={() => router.push("/?tool=seek")}
                        className="py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
                      >
                        🔍 Search History
                      </button>
                    ) : (
                      <button
                        onClick={goToFullSetup}
                        className="py-3 bg-slate-800/50 border border-slate-600 text-slate-400 font-medium rounded-lg transition-colors hover:border-slate-500 flex items-center justify-center gap-2"
                        title="Requires full setup with Vector DB"
                      >
                        <span>🔒</span>
                        <span>Search History</span>
                      </button>
                    )}
                    
                    {/* Full Setup */}
                    {hasVectorDb ? (
                      <div className="py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium rounded-lg flex items-center justify-center gap-2">
                        <span>✓</span>
                        <span>Full Setup Complete</span>
                      </div>
                    ) : (
                      <button
                        onClick={goToFullSetup}
                        className="py-3 bg-indigo-600/20 border border-indigo-500/50 text-indigo-300 font-medium rounded-lg transition-colors hover:bg-indigo-600/30 flex items-center justify-center gap-2"
                      >
                        <span>⚙️</span>
                        <span>Unlock Full Features</span>
                      </button>
                    )}
                  </div>
                  
                  {/* Explanation */}
                  {!hasVectorDb && (
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm">
                      <div className="flex items-start gap-3">
                        <span className="text-xl">💡</span>
                        <div className="text-slate-400">
                          <strong className="text-slate-300">Theme Map gives you a taste.</strong>
                          <br />
                          Full setup unlocks idea generation, semantic search, and a growing Library.
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
