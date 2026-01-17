"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type OnboardingStep = "welcome" | "api-keys" | "sync" | "done";

interface SyncProgress {
  status: "idle" | "syncing" | "complete" | "error";
  message: string;
  indexed?: number;
  total?: number;
}

interface ChatDbInfo {
  detected: boolean;
  sizeBytes: number;
  sizeFormatted: string;
  requiresVectorDb: boolean;
  isCloudMode: boolean;
}

// Thresholds for Vector DB requirement
const VECTOR_DB_REQUIRED_THRESHOLD = 500 * 1024 * 1024; // 500MB
const VECTOR_DB_RECOMMENDED_THRESHOLD = 50 * 1024 * 1024; // 50MB

// Wrapper component to handle Suspense for useSearchParams
export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingLoadingFallback />}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500 mx-auto mb-4"></div>
        <p className="text-white text-lg">Loading...</p>
      </div>
    </div>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams(); // Wrapped in Suspense below (Next.js 15+ requirement)
  const isPreviewMode = searchParams.get("preview") === "true";
  const isLargeHistoryRedirect = searchParams.get("reason") === "large-history";
  
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Chat DB detection state
  const [chatDb, setChatDb] = useState<ChatDbInfo>({
    detected: false,
    sizeBytes: 0,
    sizeFormatted: "Detecting...",
    requiresVectorDb: true, // Default to true for safety
    isCloudMode: false,
  });
  const [detectingDb, setDetectingDb] = useState(true);
  
  // API Keys state
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [skipSupabase, setSkipSupabase] = useState(false);
  
  // Validation state
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<{
    anthropic: { valid: boolean; error?: string } | null;
    openai: { valid: boolean; error?: string } | null;
    supabase: { valid: boolean; error?: string } | null;
  }>({ anthropic: null, openai: null, supabase: null });
  
  // Sync state
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    status: "idle",
    message: "Ready to sync your Cursor history",
  });
  
  // Detect chat DB size on mount
  useEffect(() => {
    let cancelled = false;
    
    const detectChatDb = async () => {
      if (isPreviewMode) {
        // Simulate detection in preview mode
        if (!cancelled) {
          setChatDb({
            detected: true,
            sizeBytes: 150 * 1024 * 1024, // Simulate 150MB
            sizeFormatted: "150 MB",
            requiresVectorDb: false,
            isCloudMode: false,
          });
          setDetectingDb(false);
        }
        return;
      }
      
      try {
        const res = await fetch("/api/brain-stats");
        if (cancelled) return;
        
        if (!res.ok) {
          const errorText = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(`API error: ${errorText.length > 100 ? res.status : errorText}`);
        }
        const data = await res.json().catch((parseError) => {
          throw new Error(`Invalid response format: ${parseError.message}`);
        });
        
        if (cancelled) return;
        
        if (data && typeof data === 'object' && data.success) {
          const sizeBytes = data.localSizeBytes || 0;
          // Use explicit cloudMode flag from API (checks VERCEL, RAILWAY env vars)
          // Don't infer cloud from "no file found" - user may just not have chat history yet
          const isCloud = data.cloudMode === true;
          
          if (!cancelled) {
            setChatDb({
              detected: true,
              sizeBytes,
              sizeFormatted: data.localSize || (isCloud ? "N/A (Cloud)" : "0 B"),
              requiresVectorDb: isCloud || sizeBytes >= VECTOR_DB_REQUIRED_THRESHOLD,
              isCloudMode: isCloud,
            });
          }
        } else {
          // Couldn't detect, assume cloud mode
          if (!cancelled) {
            setChatDb({
              detected: true,
              sizeBytes: 0,
              sizeFormatted: "N/A",
              requiresVectorDb: true,
              isCloudMode: true,
            });
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to detect chat DB:", e);
          // On error, assume cloud mode (safest)
          setChatDb({
            detected: true,
            sizeBytes: 0,
            sizeFormatted: "N/A",
            requiresVectorDb: true,
            isCloudMode: true,
          });
        }
      } finally {
        if (!cancelled) {
          setDetectingDb(false);
        }
      }
    };
    
    detectChatDb();
    
    return () => {
      cancelled = true;
    };
  }, [isPreviewMode]);

  // Check if already onboarded (redirect if so, unless preview mode)
  useEffect(() => {
    let cancelled = false;
    
    const checkOnboarding = async () => {
      if (isPreviewMode) return; // Skip check in preview mode
      
      try {
        const res = await fetch("/api/config");
        if (cancelled) return;
        
        if (!res.ok) {
          const errorText = await res.text().catch(() => `HTTP ${res.status}`);
          console.error("Failed to check onboarding status:", errorText.length > 100 ? res.status : errorText);
          return;
        }
        
        const data = await res.json().catch((parseError) => {
          throw new Error(`Invalid response format: ${parseError.message}`);
        });
        
        if (cancelled) return;
        
        if (data && typeof data === 'object' && data.success && data.config?.setupComplete) {
          router.push("/");
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to check onboarding status:", e);
        }
      }
    };
    
    checkOnboarding();
    
    return () => {
      cancelled = true;
    };
  }, [router, isPreviewMode]);

  // Validate API keys before saving
  const validateKeys = useCallback(async (): Promise<boolean> => {
    setValidating(true);
    setValidationResults({ anthropic: null, openai: null, supabase: null });
    setError(null);
    
    try {
      const payload: Record<string, string> = {
        ANTHROPIC_API_KEY: anthropicKey,
      };
      
      // OpenAI is optional but validate if provided
      if (openaiKey) {
        payload.OPENAI_API_KEY = openaiKey;
      }
      
      if (!skipSupabase && supabaseUrl && supabaseKey) {
        payload.SUPABASE_URL = supabaseUrl;
        payload.SUPABASE_ANON_KEY = supabaseKey;
      }
      
      const res = await fetch("/api/config/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Validation failed: ${errorText.length > 100 ? res.status : errorText}`);
      }
      
      const data = await res.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (data && typeof data === 'object' && data.success) {
        setValidationResults({
          anthropic: data.results.anthropic,
          openai: data.results.openai || null,
          supabase: data.results.supabase,
        });
        
        if (!data.valid) {
          // Build error message from failed validations
          const errors: string[] = [];
          if (!data.results.anthropic?.valid) {
            errors.push(`Anthropic: ${data.results.anthropic?.error || "Invalid"}`);
          }
          // OpenAI is optional - only show error if provided and invalid
          if (data.results.openai && !data.results.openai.valid) {
            errors.push(`OpenAI: ${data.results.openai?.error || "Invalid"}`);
          }
          if (data.results.supabase && !data.results.supabase.valid) {
            errors.push(`Supabase: ${data.results.supabase?.error || "Invalid"}`);
          }
          setError(errors.join(" • "));
          return false;
        }
        return true;
      } else {
        setError("Validation failed. Please check your keys.");
        return false;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed");
      return false;
    } finally {
      setValidating(false);
    }
  }, [anthropicKey, openaiKey, supabaseUrl, supabaseKey, skipSupabase]);

  // Save API keys and create initial config
  const saveApiKeys = useCallback(async () => {
    if (isPreviewMode) {
      // In preview mode, just advance to next step
      setStep("sync");
      return;
    }
    
    setError(null);
    
    // Validate keys first
    const isValid = await validateKeys();
    if (!isValid) {
      return; // Stop if validation failed
    }
    
    setSaving(true);
    
    try {
      // Build environment variables object
      const envVars: Record<string, string> = {
        ANTHROPIC_API_KEY: anthropicKey,
      };
      
      // Include OpenAI key if provided (enables embeddings, dedup, search)
      if (openaiKey) {
        envVars.OPENAI_API_KEY = openaiKey;
      }
      
      // Only include Supabase if not skipping
      if (!skipSupabase && supabaseUrl && supabaseKey) {
        envVars.SUPABASE_URL = supabaseUrl;
        envVars.SUPABASE_ANON_KEY = supabaseKey;
      }
      
      // Save environment variables via API
      const envRes = await fetch("/api/config/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envVars),
      });
      
      if (!envRes.ok) {
        const errorText = await envRes.text().catch(() => `HTTP ${envRes.status}`);
        let envData: any = {};
        try {
          envData = JSON.parse(errorText);
        } catch {
          // Not JSON, use text as error
        }
        throw new Error((envData && typeof envData === 'object' && envData.error) || errorText || "Failed to save API keys");
      }
      
      // Build config object
      const configPayload: Record<string, unknown> = {
        version: 1,
        setupComplete: skipSupabase, // If skipping Supabase, mark complete (no sync needed)
        workspaces: [],
        llm: {
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          fallbackProvider: null,
          fallbackModel: null,
        },
        features: {
          customVoice: { enabled: false },
          v1Enabled: true,
        },
        ui: {
          defaultTool: "ideas",
          defaultMode: "sprint",
        },
      };
      
      // Only include vectordb config if not skipping
      if (!skipSupabase && supabaseUrl && supabaseKey) {
        configPayload.vectordb = {
          provider: "supabase",
          url: supabaseUrl,
          anonKey: supabaseKey,
          serviceRoleKey: null,
          initialized: false,
          lastSync: null,
        };
      }
      
      const configRes = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configPayload),
      });
      
      if (!configRes.ok) {
        const errorText = await configRes.text().catch(() => `HTTP ${configRes.status}`);
        let configData: any = {};
        try {
          configData = JSON.parse(errorText);
        } catch {
          // Not JSON, use text as error
        }
        throw new Error((configData && typeof configData === 'object' && configData.error) || errorText || "Failed to save config");
      }
      
      const configResponseData = await configRes.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (!(configResponseData && typeof configResponseData === 'object' && configResponseData.success)) {
        throw new Error("Config save returned unsuccessful response");
      }
      
      // If skipping Supabase, go directly to app (no sync needed)
      if (skipSupabase) {
        router.push("/");
      } else {
        setStep("sync");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [anthropicKey, openaiKey, supabaseUrl, supabaseKey, skipSupabase, isPreviewMode, router, validateKeys]);

  // Run first sync
  const runSync = useCallback(async () => {
    if (isPreviewMode) {
      // Simulate sync in preview mode
      setSyncProgress({ status: "syncing", message: "Simulating sync..." });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setSyncProgress({ status: "complete", message: "Preview sync complete!", indexed: 1234 });
      return;
    }
    
    setSyncProgress({ status: "syncing", message: "Starting sync..." });
    
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
        const { indexed = 0, skipped = 0 } = (data.stats && typeof data.stats === 'object') ? data.stats : {};
        setSyncProgress({
          status: "complete",
          message: `Indexed ${indexed} messages${skipped > 0 ? ` (${skipped} already indexed)` : ""}`,
          indexed,
        });
        
        // Mark setup as complete
        try {
          const configRes = await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ setupComplete: true }),
          });
          if (!configRes.ok) {
            console.warn("Failed to mark setup as complete:", configRes.status);
          }
        } catch (configErr) {
          console.warn("Failed to mark setup as complete:", configErr);
          // Non-critical - sync succeeded even if config update fails
        }
      } else {
        // Handle cloud mode gracefully
        const errorMsg = (data && typeof data === 'object' && data.error) || "Sync failed";
        if (errorMsg.includes("cloud") || errorMsg.includes("Cannot sync")) {
          setSyncProgress({
            status: "complete",
            message: "Cloud mode detected. You can sync later from a local machine.",
          });
        } else {
          setSyncProgress({
            status: "error",
            message: errorMsg,
          });
        }
      }
    } catch (e) {
      setSyncProgress({
        status: "error",
        message: e instanceof Error ? e.message : "Sync failed",
      });
    }
  }, [isPreviewMode]);

  // Auto-run sync when reaching sync step
  useEffect(() => {
    if (step === "sync" && syncProgress.status === "idle") {
      runSync();
    }
  }, [step, syncProgress.status, runSync]);

  // Complete onboarding
  const completeOnboarding = () => {
    if (isPreviewMode) {
      router.push("/?from=onboarding-preview");
    } else {
      router.push("/themes");
    }
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

      <div className="w-full max-w-xl">
        {/* Progress indicator */}
        <div className="flex justify-center gap-2 mb-8">
          {["welcome", "api-keys", "sync"].map((s, i) => (
            <div
              key={s}
              className={`h-2 w-16 rounded-full transition-colors ${
                step === s
                  ? "bg-indigo-500"
                  : ["welcome", "api-keys", "sync"].indexOf(step) > i
                  ? "bg-indigo-500/50"
                  : "bg-slate-700"
              }`}
            />
          ))}
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* STEP 1: Welcome */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === "welcome" && (
          <div className="text-center space-y-8">
            <div className="space-y-4">
              <span className="text-6xl">✨</span>
              <h1 className="text-4xl font-bold text-white">Welcome to Inspiration</h1>
              <p className="text-xl text-slate-300">
                Turn your Cursor conversations into <strong className="text-indigo-300">patterns</strong> and{" "}
                <strong className="text-purple-300">insights</strong>
              </p>
            </div>

            {/* Large History Redirect Banner */}
            {isLargeHistoryRedirect && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-left">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚡</span>
                  <div>
                    <div className="font-semibold text-amber-300">Large chat history detected!</div>
                    <div className="text-sm text-slate-300 mt-1">
                      You have 500MB+ of conversations. Setting up Supabase (free tier) ensures 
                      fast search and a smooth experience. Takes ~2 minutes.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Chat DB Detection Card */}
            <div className={`rounded-2xl p-5 text-left ${
              detectingDb 
                ? "bg-slate-800/50 border border-slate-700" 
                : chatDb.isCloudMode
                  ? "bg-blue-500/10 border border-blue-500/30"
                  : chatDb.sizeBytes >= VECTOR_DB_REQUIRED_THRESHOLD
                    ? "bg-amber-500/10 border border-amber-500/30"
                    : "bg-emerald-500/10 border border-emerald-500/30"
            }`}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">
                  {detectingDb ? "🔍" : chatDb.isCloudMode ? "☁️" : "🧠"}
                </span>
                <div>
                  <div className="font-semibold text-white">
                    {detectingDb 
                      ? "Detecting your Cursor history..." 
                      : chatDb.isCloudMode 
                        ? "Cloud Environment Detected"
                        : `Found ${chatDb.sizeFormatted} of chat history`
                    }
                  </div>
                  <div className="text-sm text-slate-400">
                    {detectingDb 
                      ? "Checking local Cursor database..."
                      : chatDb.isCloudMode
                        ? "No local Cursor database found. Supabase required for cloud deployment."
                        : chatDb.sizeBytes >= VECTOR_DB_REQUIRED_THRESHOLD
                          ? "Large history! Supabase Vector DB recommended for best performance."
                          : chatDb.sizeBytes >= VECTOR_DB_RECOMMENDED_THRESHOLD
                            ? "Medium history. Supabase optional but recommended."
                            : "Small history. Supabase is optional — you can set it up later."
                    }
                  </div>
                </div>
              </div>
              
              {!detectingDb && !chatDb.isCloudMode && chatDb.sizeBytes < VECTOR_DB_REQUIRED_THRESHOLD && (
                <div className="mt-3 pt-3 border-t border-slate-700/50">
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipSupabase}
                      onChange={(e) => setSkipSupabase(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 text-indigo-500 focus:ring-indigo-500 bg-slate-700"
                    />
                    Skip Supabase setup (use local search only)
                  </label>
                </div>
              )}
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-6 text-left space-y-4">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <span>🎯</span> What you'll get
              </h2>
              <ul className="space-y-3 text-slate-300">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400">✓</span>
                  <span>
                    <strong>Theme Explorer</strong> — Discover patterns in your thinking
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400">✓</span>
                  <span>
                    <strong>Idea Generation</strong> — Surface ideas worth building
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400">✓</span>
                  <span>
                    <strong>Insight Mining</strong> — Draft learnings to share
                  </span>
                </li>
              </ul>
            </div>

            <div className="text-sm text-slate-500">
              {skipSupabase 
                ? "Quick setup — just 1 API key needed!"
                : "Setup takes about 2 minutes. Let's go!"
              }
            </div>

            <button
              onClick={() => setStep("api-keys")}
              disabled={detectingDb}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-wait text-white font-semibold text-lg rounded-xl transition-all"
            >
              {detectingDb ? "Detecting..." : "Get Started →"}
            </button>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* STEP 2: API Keys */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === "api-keys" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <span className="text-4xl">🔑</span>
              <h1 className="text-3xl font-bold text-white">
                {skipSupabase ? "Add Your API Key" : "Connect Your Services"}
              </h1>
              <p className="text-slate-400">
                {skipSupabase 
                  ? "Just one key needed to power the AI."
                  : "We need API keys to power the AI and store your data securely."
                }
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Anthropic Key - Always required */}
              <div className="space-y-2">
                <label htmlFor="anthropic-key" className="block text-sm font-medium text-slate-300">
                  Anthropic API Key <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    id="anthropic-key"
                    type="password"
                    value={anthropicKey}
                    onChange={(e) => {
                      setAnthropicKey(e.target.value);
                      // Clear validation on change
                      if (validationResults.anthropic) {
                        setValidationResults(prev => ({ ...prev, anthropic: null }));
                      }
                    }}
                    placeholder="sk-ant-..."
                    autoComplete="off"
                    className={`w-full px-4 py-3 pr-10 bg-slate-800/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      validationResults.anthropic?.valid === true
                        ? "border-emerald-500"
                        : validationResults.anthropic?.valid === false
                        ? "border-red-500"
                        : "border-slate-700"
                    }`}
                  />
                  {validationResults.anthropic && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg">
                      {validationResults.anthropic.valid ? "✅" : "❌"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Get one at{" "}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:underline"
                  >
                    console.anthropic.com
                  </a>
                </p>
              </div>

              {/* OpenAI Key - Optional but enables embeddings/dedup/search */}
              <div className="space-y-2 pt-3 border-t border-slate-700/50">
                <div className="flex items-center gap-2 mb-1">
                  <label htmlFor="openai-key" className="block text-sm font-medium text-slate-300">
                    OpenAI API Key
                  </label>
                  <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-400">Optional</span>
                </div>
                <div className="relative">
                  <input
                    id="openai-key"
                    type="password"
                    value={openaiKey}
                    onChange={(e) => {
                      setOpenaiKey(e.target.value);
                      if (validationResults.openai) {
                        setValidationResults(prev => ({ ...prev, openai: null }));
                      }
                    }}
                    placeholder="sk-..."
                    autoComplete="off"
                    className={`w-full px-4 py-3 pr-10 bg-slate-800/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      validationResults.openai?.valid === true
                        ? "border-emerald-500"
                        : validationResults.openai?.valid === false
                        ? "border-red-500"
                        : "border-slate-700"
                    }`}
                  />
                  {validationResults.openai && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg">
                      {validationResults.openai.valid ? "✅" : "❌"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Enables embeddings for deduplication, search, and sync.{" "}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:underline"
                  >
                    platform.openai.com
                  </a>
                </p>
                {!openaiKey && (
                  <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300">
                    <strong>Without OpenAI:</strong> Limited to basic generation. No deduplication, semantic search, or library sync.
                  </div>
                )}
              </div>

              {/* Supabase fields - Only show if not skipping */}
              {!skipSupabase && (
                <>
                  <div className="pt-2 border-t border-slate-700/50">
                    <div className="flex items-center gap-2 mb-3 text-sm text-slate-400">
                      <span>☁️</span>
                      <span>Supabase (Vector Database)</span>
                      {!chatDb.requiresVectorDb && (
                        <span className="text-xs bg-slate-700 px-2 py-0.5 rounded">Optional</span>
                      )}
                    </div>
                  </div>

                  {/* Supabase URL */}
                  <div className="space-y-2">
                    <label htmlFor="supabase-url" className="block text-sm font-medium text-slate-300">
                      Supabase Project URL {chatDb.requiresVectorDb && <span className="text-red-400">*</span>}
                    </label>
                    <div className="relative">
                      <input
                        id="supabase-url"
                        type="url"
                        value={supabaseUrl}
                        onChange={(e) => {
                          setSupabaseUrl(e.target.value);
                          if (validationResults.supabase) {
                            setValidationResults(prev => ({ ...prev, supabase: null }));
                          }
                        }}
                        placeholder="https://your-project.supabase.co"
                        autoComplete="off"
                        className={`w-full px-4 py-3 pr-10 bg-slate-800/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          validationResults.supabase?.valid === true
                            ? "border-emerald-500"
                            : validationResults.supabase?.valid === false
                            ? "border-red-500"
                            : "border-slate-700"
                        }`}
                      />
                      {validationResults.supabase && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg">
                          {validationResults.supabase.valid ? "✅" : "❌"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Supabase Key */}
                  <div className="space-y-2">
                    <label htmlFor="supabase-key" className="block text-sm font-medium text-slate-300">
                      Supabase Anon Key {chatDb.requiresVectorDb && <span className="text-red-400">*</span>}
                    </label>
                    <input
                      id="supabase-key"
                      type="password"
                      value={supabaseKey}
                      onChange={(e) => {
                        setSupabaseKey(e.target.value);
                        if (validationResults.supabase) {
                          setValidationResults(prev => ({ ...prev, supabase: null }));
                        }
                      }}
                      placeholder="eyJ..."
                      autoComplete="off"
                      className={`w-full px-4 py-3 bg-slate-800/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        validationResults.supabase?.valid === true
                          ? "border-emerald-500"
                          : validationResults.supabase?.valid === false
                          ? "border-red-500"
                          : "border-slate-700"
                      }`}
                    />
                    <p className="text-xs text-slate-500">
                      Find both at{" "}
                      <a
                        href="https://supabase.com/dashboard/project/_/settings/api"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:underline"
                      >
                        supabase.com/dashboard
                      </a>{" "}
                      → Settings → API
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("welcome")}
                disabled={validating || saving}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={saveApiKeys}
                disabled={validating || saving || (!isPreviewMode && (
                  !anthropicKey || 
                  (!skipSupabase && chatDb.requiresVectorDb && (!supabaseUrl || !supabaseKey))
                ))}
                className="flex-[2] py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {validating ? (
                  <>
                    <span className="animate-spin">⏳</span> Validating...
                  </>
                ) : saving ? (
                  "Saving..."
                ) : (
                  "Continue →"
                )}
              </button>
            </div>

            <p className="text-center text-xs text-slate-500">
              Keys are stored locally in .env.local — never sent to our servers.
            </p>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* STEP 3: Sync */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {step === "sync" && (
          <div className="space-y-8 text-center">
            <div className="space-y-4">
              <span className="text-6xl">
                {syncProgress.status === "syncing" && "🔄"}
                {syncProgress.status === "complete" && "✅"}
                {syncProgress.status === "error" && "⚠️"}
                {syncProgress.status === "idle" && "🧠"}
              </span>
              <h1 className="text-3xl font-bold text-white">
                {syncProgress.status === "syncing" && "Syncing Your Memory..."}
                {syncProgress.status === "complete" && "Memory Ready!"}
                {syncProgress.status === "error" && "Sync Issue"}
                {syncProgress.status === "idle" && "Preparing Sync..."}
              </h1>
              <p className="text-slate-400">{syncProgress.message}</p>
            </div>

            {/* Progress visualization */}
            {syncProgress.status === "syncing" && (
              <div className="space-y-3">
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse w-2/3" />
                </div>
                <p className="text-sm text-slate-500">
                  This may take a few minutes for large chat histories...
                </p>
              </div>
            )}

            {/* Success state */}
            {syncProgress.status === "complete" && (
              <div className="space-y-6">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6">
                  <div className="text-4xl font-bold text-emerald-400">
                    {syncProgress.indexed?.toLocaleString() || "✓"}
                  </div>
                  <div className="text-slate-400">messages indexed</div>
                </div>

                <button
                  onClick={completeOnboarding}
                  className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-lg rounded-xl transition-all"
                >
                  🔭 Explore Your Themes →
                </button>
              </div>
            )}

            {/* Error state */}
            {syncProgress.status === "error" && (
              <div className="space-y-4">
                <button
                  onClick={runSync}
                  className="w-full py-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-medium rounded-lg transition-colors"
                >
                  Retry Sync
                </button>
                <button
                  onClick={completeOnboarding}
                  className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
                >
                  Skip for now →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
