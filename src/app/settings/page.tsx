"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ModeSettingsManager } from "@/components/ModeSettingsManager";
import { AdvancedConfigSection } from "@/components/AdvancedConfigSection";
import { PromptTemplateEditor } from "@/components/PromptTemplateEditor";

interface AppConfig {
  version: number;
  setupComplete: boolean;
  workspaces: string[];
  vectordb?: {
    provider: "supabase";
    url: string | null;
    anonKey: string | null;
    serviceRoleKey: string | null;
    initialized: boolean;
    lastSync: string | null;
  };
  chatHistory?: {
    path: string | null;
    platform: "darwin" | "win32" | null;
    autoDetected: boolean;
    lastChecked: string | null;
  };
  llm: {
    provider: "anthropic" | "openai" | "openrouter";
    model: string;
    fallbackProvider: "anthropic" | "openai" | "openrouter" | null;
    fallbackModel: string | null;
    promptCompression?: {
      enabled: boolean;
      threshold: number;
      compressionModel: string;
    };
  };
  features: {
    linkedInSync: {
      enabled: boolean;
      postsDirectory: string | null;
    };
    solvedStatusSync: {
      enabled: boolean;
    };
    customVoice: {
      enabled: boolean;
      voiceGuideFile: string | null;
      goldenExamplesDir: string | null;
      authorName: string | null;
      authorContext: string | null;
    };
    v1Enabled?: boolean;
  };
  ui: {
    defaultTool: "ideas" | "insights";
    defaultMode: string;
  };
}

type WizardStep = "workspaces" | "vectordb" | "voice" | "llm" | "features" | "done";

// Tab types for post-setup navigation
type SettingsTab = "general" | "modes" | "advanced" | "prompts";

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "⚙️" },
  { id: "modes", label: "Modes", icon: "🎯" },
  { id: "advanced", label: "Advanced", icon: "🔧" },
  { id: "prompts", label: "Prompts", icon: "📝" },
];

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<WizardStep>("workspaces");
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [chatHistoryPath, setChatHistoryPath] = useState<string | null>(null);
  const [chatHistoryPlatform, setChatHistoryPlatform] = useState<"darwin" | "win32" | null>(null);
  const [chatHistoryExists, setChatHistoryExists] = useState(false);
  const [detectingChatHistory, setDetectingChatHistory] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Load configuration
  useEffect(() => {
    loadConfig();
  }, []);

  // Auto-detect chat history after config loads
  useEffect(() => {
    if (config) {
      detectChatHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]); // detectChatHistory is stable, only re-run when config changes

  // Auto-detect chat history path
  const detectChatHistory = async () => {
    setDetectingChatHistory(true);
    try {
      const res = await fetch("/api/chat-history");
      const data = await res.json();
      if (data.success) {
        setChatHistoryPath(data.path);
        setChatHistoryPlatform(data.platform);
        setChatHistoryExists(data.exists);
        
        // Save to config if not already set
        if (data.path && config && (!config.chatHistory || !config.chatHistory.path)) {
          await saveConfig({
            chatHistory: {
              path: data.path,
              platform: data.platform,
              autoDetected: true,
              lastChecked: data.lastChecked,
            },
          });
        }
      }
    } catch (err) {
      console.error("Failed to detect chat history:", err);
    } finally {
      setDetectingChatHistory(false);
    }
  };

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        // If setup is complete, don't show wizard
        if (data.config.setupComplete) {
          setCurrentStep("done");
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (updates: Partial<AppConfig>) => {
    setSaving(true);
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setSaveStatus("saved");
        // Reset save status after 2 seconds
        setTimeout(() => setSaveStatus("idle"), 2000);
        return true;
      } else {
        setError(data.error);
        setSaveStatus("idle");
        return false;
      }
    } catch (err) {
      setError(String(err));
      setSaveStatus("idle");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addWorkspace = () => {
    if (!newWorkspace.trim() || !config) return;
    const updated = [...config.workspaces, newWorkspace.trim()];
    saveConfig({ workspaces: updated });
    setNewWorkspace("");
  };

  const removeWorkspace = (index: number) => {
    if (!config) return;
    const updated = config.workspaces.filter((_, i) => i !== index);
    saveConfig({ workspaces: updated });
  };

  const completeSetup = async () => {
    await saveConfig({ setupComplete: true });
    setCurrentStep("done");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading configuration...</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-red-400">Failed to load configuration: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800/50 backdrop-blur-sm sticky top-0 z-50 bg-slate-950/80">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-400 hover:text-slate-200 transition-colors">
              ← Back
            </Link>
            <h1 className="text-xl font-semibold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
              ⚙️ Settings
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus === "saving" && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></span>
                Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                Saved ✓
              </span>
            )}
            {config.setupComplete && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                Setup Complete
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Progress Steps (Wizard Mode) */}
        {!config.setupComplete && (
          <div className="mb-8">
            <div className="flex items-center justify-center gap-4 mb-6" role="navigation" aria-label="Setup wizard steps">
              {(["workspaces", "vectordb", "voice", "llm", "features"] as const).map((step, i) => {
                const stepLabels: Record<Exclude<WizardStep, "done">, string> = {
                  workspaces: "Configure Workspaces",
                  vectordb: "Vector DB Setup",
                  voice: "Your Voice & Style",
                  llm: "LLM Settings",
                  features: "Power Features",
                };
                return (
                  <div key={step} className="flex items-center">
                    <button
                      onClick={() => setCurrentStep(step)}
                      aria-label={`Step ${i + 1}: ${stepLabels[step]}${currentStep === step ? " (current)" : ""}`}
                      aria-current={currentStep === step ? "step" : undefined}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                        currentStep === step
                          ? "bg-amber-500 text-slate-900"
                          : config.workspaces.length > 0 && step !== currentStep
                          ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                          : "bg-slate-800 text-slate-500"
                      }`}
                    >
                      {i + 1}
                    </button>
                    {i < 4 && (
                      <div className="w-12 h-0.5 bg-slate-800 mx-2" aria-hidden="true"></div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-center text-sm text-slate-500">
              {currentStep === "workspaces" && "Step 1: Configure Workspaces"}
              {currentStep === "vectordb" && "Step 2: Vector DB Setup"}
              {currentStep === "voice" && "Step 3: Your Voice & Style"}
              {currentStep === "llm" && "Step 4: LLM Settings"}
              {currentStep === "features" && "Step 5: Power Features"}
            </div>
          </div>
        )}

        {/* Tab Navigation (Setup Complete Mode) */}
        {config.setupComplete && (
          <div className="mb-8">
            <nav className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg border border-slate-700/30" role="tablist" aria-label="Settings sections">
              {SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`${tab.id}-panel`}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-all ${
                    activeTab === tab.id
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                  }`}
                >
                  <span aria-hidden="true">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* Workspaces Section */}
        {(currentStep === "workspaces" || (config.setupComplete && activeTab === "general")) && (
          <Section
            title="📁 Workspaces"
            description="Directories containing Cursor projects to analyze"
          >
            <div className="space-y-3">
              {config.workspaces.map((ws, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50"
                >
                  <span className="flex-1 font-mono text-sm text-slate-300">{ws}</span>
                  <button
                    onClick={() => removeWorkspace(i)}
                    className="text-slate-500 hover:text-red-400 transition-colors"
                    aria-label={`Remove workspace: ${ws}`}
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newWorkspace}
                  onChange={(e) => setNewWorkspace(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addWorkspace()}
                  placeholder="/path/to/your/workspace"
                  className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                />
                <button
                  onClick={addWorkspace}
                  disabled={!newWorkspace.trim()}
                  className="px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
              </div>
              {config.workspaces.length === 0 && (
                <p className="text-slate-500 text-sm">
                  Add at least one workspace to get started. This is where Cursor stores your chat history.
                </p>
              )}
            </div>
            {!config.setupComplete && (
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setCurrentStep("vectordb")}
                  disabled={config.workspaces.length === 0}
                  className="px-6 py-2 bg-amber-500 text-slate-900 font-medium rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </Section>
        )}

        {/* VectorDB Setup Section */}
        {(currentStep === "vectordb" || (config.setupComplete && activeTab === "general")) && (
          <Section
            title="🧠 Vector Database (Memory)"
            description="Set up Supabase Vector DB for efficient chat history search"
          >
            <div className="space-y-6">
              <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
                <h4 className="text-blue-400 font-medium mb-2">Why Vector DB?</h4>
                <p className="text-sm text-slate-400 mb-2">
                  Vector DB enables fast semantic search across your entire chat history, 
                  even with 2GB+ of conversations. It&apos;s required for Inspiration v1.
                </p>
                <p className="text-xs text-slate-500">
                  💡 <strong>Setup:</strong> Create a free Supabase project, run the SQL script 
                  (see link below), then enter your credentials here.
                </p>
              </div>

              {/* Supabase Credentials (Read-Only) */}
              <SupabaseCredentialsSection config={config} />

              {/* Chat History Auto-Detection */}
              <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-slate-200 font-medium">📁 Chat History Location</h4>
                  <button
                    onClick={detectChatHistory}
                    disabled={detectingChatHistory}
                    className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 disabled:opacity-50 transition-colors"
                  >
                    {detectingChatHistory ? "Detecting..." : "Refresh"}
                  </button>
                </div>
                {detectingChatHistory ? (
                  <p className="text-sm text-slate-500">Detecting chat history location...</p>
                ) : chatHistoryPath ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {chatHistoryExists ? (
                        <span className="text-emerald-400">✓</span>
                      ) : (
                        <span className="text-yellow-400">⚠</span>
                      )}
                      <code className="flex-1 px-2 py-1 bg-slate-900 rounded text-xs text-slate-300 break-all">
                        {chatHistoryPath}
                      </code>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Platform: {chatHistoryPlatform === "darwin" ? "macOS" : chatHistoryPlatform === "win32" ? "Windows" : "Unknown"}</span>
                      {chatHistoryExists ? (
                        <span className="text-emerald-400">File exists</span>
                      ) : (
                        <span className="text-yellow-400">File not found (Cursor may not be installed)</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Click &quot;Refresh&quot; to auto-detect your Cursor chat history location.
                  </p>
                )}
              </div>

              {/* Setup Instructions */}
              <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                <h4 className="text-slate-200 font-medium mb-2">📋 Setup Instructions</h4>
                <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
                  <li>Create a free Supabase project at <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">supabase.com</a></li>
                  <li>Run the SQL script: <code className="px-1.5 py-0.5 bg-slate-900 rounded text-xs">engine/scripts/init_vector_db.sql</code></li>
                  <li>Copy your Project URL and Anon Key from Project Settings → API</li>
                  <li>Enter them above and click &quot;Test Connection&quot;</li>
                </ol>
              </div>

              {/* Status */}
              {config.vectordb?.initialized && (
                <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                  <h4 className="text-emerald-400 font-medium mb-2">✓ Vector DB Configured</h4>
                  <p className="text-sm text-slate-400">
                    {config.vectordb.lastSync 
                      ? `Last sync: ${new Date(config.vectordb.lastSync).toLocaleString()}`
                      : "Ready to sync your chat history"}
                  </p>
                </div>
              )}
            </div>
            {!config.setupComplete && (
              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setCurrentStep("workspaces")}
                  className="px-6 py-2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setCurrentStep("voice")}
                  className="px-6 py-2 bg-amber-500 text-slate-900 font-medium rounded-lg hover:bg-amber-400 transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </Section>
        )}

        {/* Voice & Style Section */}
        {(currentStep === "voice" || (config.setupComplete && activeTab === "general")) && (
          <Section
            title="✍️ Your Voice & Style"
            description="Configure how Inspiration captures your authentic writing voice"
          >
            <div className="space-y-6">
              {/* Author Info */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={config.features.customVoice.authorName || ""}
                    onChange={(e) =>
                      saveConfig({
                        features: {
                          ...config.features,
                          customVoice: {
                            ...config.features.customVoice,
                            authorName: e.target.value || null,
                          },
                        },
                      })
                    }
                    placeholder="e.g., JM"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Brief Context
                  </label>
                  <input
                    type="text"
                    value={config.features.customVoice.authorContext || ""}
                    onChange={(e) =>
                      saveConfig({
                        features: {
                          ...config.features,
                          customVoice: {
                            ...config.features.customVoice,
                            authorContext: e.target.value || null,
                          },
                        },
                      })
                    }
                    placeholder="e.g., PM at a tech company who builds with AI"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              {/* Golden Examples */}
              <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📝</span>
                  <div className="flex-1">
                    <h4 className="text-slate-200 font-medium mb-1">Golden Examples Folder</h4>
                    <p className="text-xs text-slate-500 mb-3">
                      Point to a folder with your actual social media posts or writing samples. 
                      The AI will study these to match your voice, style, and depth.
                    </p>
                    <input
                      type="text"
                      value={config.features.customVoice.goldenExamplesDir || ""}
                      onChange={(e) =>
                        saveConfig({
                          features: {
                            ...config.features,
                            customVoice: {
                              ...config.features.customVoice,
                              enabled: !!e.target.value,
                              goldenExamplesDir: e.target.value || null,
                            },
                          },
                        })
                      }
                      placeholder="/path/to/your/social-posts"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                    />
                    <p className="text-xs text-slate-600 mt-2">
                      Tip: Save your best 5-10 posts as .md files in this folder
                    </p>
                  </div>
                </div>
              </div>

              {/* Voice Guide (Optional) */}
              <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📋</span>
                  <div className="flex-1">
                    <h4 className="text-slate-200 font-medium mb-1">Voice Guide (Optional)</h4>
                    <p className="text-xs text-slate-500 mb-3">
                      A markdown file with explicit voice rules: words you use, words you avoid, 
                      sentence style preferences, emoji usage, etc.
                    </p>
                    <input
                      type="text"
                      value={config.features.customVoice.voiceGuideFile || ""}
                      onChange={(e) =>
                        saveConfig({
                          features: {
                            ...config.features,
                            customVoice: {
                              ...config.features.customVoice,
                              voiceGuideFile: e.target.value || null,
                            },
                          },
                        })
                      }
                      placeholder="/path/to/voice-guide.md"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* Preview of what's configured */}
              {(config.features.customVoice.authorName || config.features.customVoice.goldenExamplesDir) && (
                <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                  <h4 className="text-emerald-400 font-medium mb-2">✓ Voice Profile Active</h4>
                  <ul className="text-sm text-slate-400 space-y-1">
                    {config.features.customVoice.authorName && (
                      <li>• Author: {config.features.customVoice.authorName}</li>
                    )}
                    {config.features.customVoice.authorContext && (
                      <li>• Context: {config.features.customVoice.authorContext}</li>
                    )}
                    {config.features.customVoice.goldenExamplesDir && (
                      <li>• Examples: {config.features.customVoice.goldenExamplesDir}</li>
                    )}
                    {config.features.customVoice.voiceGuideFile && (
                      <li>• Voice Guide: {config.features.customVoice.voiceGuideFile}</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
            {!config.setupComplete && (
              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setCurrentStep("workspaces")}
                  className="px-6 py-2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setCurrentStep("llm")}
                  className="px-6 py-2 bg-amber-500 text-slate-900 font-medium rounded-lg hover:bg-amber-400 transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </Section>
        )}

        {/* LLM Settings */}
        {(currentStep === "llm" || (config.setupComplete && activeTab === "general")) && (
          <Section
            title="🤖 LLM Provider"
            description="Configure your AI model for generation"
          >
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Primary Provider
                </label>
                <select
                  value={config.llm.provider}
                  onChange={(e) =>
                    saveConfig({
                      llm: { ...config.llm, provider: e.target.value as "anthropic" | "openai" | "openrouter" },
                    })
                  }
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500/50"
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="openrouter">OpenRouter (500+ Models)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Model
                </label>
                <input
                  type="text"
                  value={config.llm.model}
                  onChange={(e) =>
                    saveConfig({ llm: { ...config.llm, model: e.target.value } })
                  }
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div className="pt-4 border-t border-slate-700/50">
                <label className="flex items-center gap-3 text-sm text-slate-400 cursor-pointer">
                  <input
                    id="fallback-provider-toggle"
                    type="checkbox"
                    checked={config.llm.fallbackProvider !== null}
                    onChange={(e) =>
                      saveConfig({
                        llm: {
                          ...config.llm,
                          fallbackProvider: e.target.checked ? "openai" : null,
                          fallbackModel: e.target.checked ? "gpt-4o" : null,
                        },
                      })
                    }
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700"
                  />
                  Enable fallback provider
                </label>
                <p className="text-xs text-slate-500 mt-1 ml-7">
                  If primary fails, automatically try the fallback
                </p>
              </div>
              
              {/* Prompt Compression */}
              <div className="pt-4 border-t border-slate-700/50">
                <label className="flex items-center gap-3 text-sm text-slate-400 cursor-pointer">
                  <input
                    id="prompt-compression-toggle"
                    type="checkbox"
                    checked={config.llm.promptCompression?.enabled ?? false}
                    onChange={(e) =>
                      saveConfig({
                        llm: {
                          ...config.llm,
                          promptCompression: {
                            enabled: e.target.checked,
                            threshold: config.llm.promptCompression?.threshold ?? 10000,
                            compressionModel: config.llm.promptCompression?.compressionModel ?? "gpt-3.5-turbo",
                          },
                        },
                      })
                    }
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700"
                  />
                  Enable prompt compression
                </label>
                <p className="text-xs text-slate-500 mt-1 ml-7">
                  Automatically compress large conversation histories to reduce token usage and avoid rate limits
                </p>
                {config.llm.promptCompression?.enabled && (
                  <div className="mt-3 ml-7 space-y-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">
                        Compression threshold (tokens)
                      </label>
                      <input
                        type="number"
                        value={config.llm.promptCompression.threshold}
                        onChange={(e) =>
                          saveConfig({
                            llm: {
                              ...config.llm,
                              promptCompression: {
                                ...config.llm.promptCompression!,
                                threshold: parseInt(e.target.value) || 10000,
                              },
                            },
                          })
                        }
                        className="w-full px-3 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-amber-500/50"
                        min="1000"
                        max="100000"
                        step="1000"
                      />
                      <p className="text-xs text-slate-600 mt-1">
                        Compress prompts larger than this (default: 10,000)
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">
                        Compression model
                      </label>
                      <select
                        value={config.llm.promptCompression.compressionModel}
                        onChange={(e) =>
                          saveConfig({
                            llm: {
                              ...config.llm,
                              promptCompression: {
                                ...config.llm.promptCompression!,
                                compressionModel: e.target.value,
                              },
                            },
                          })
                        }
                        className="w-full px-3 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-amber-500/50"
                      >
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo (cheapest)</option>
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                        <option value="gpt-4o">GPT-4o</option>
                      </select>
                      <p className="text-xs text-slate-600 mt-1">
                        Model used for compression (cheaper = lower cost)
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {!config.setupComplete && (
              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setCurrentStep("voice")}
                  className="px-6 py-2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setCurrentStep("features")}
                  className="px-6 py-2 bg-amber-500 text-slate-900 font-medium rounded-lg hover:bg-amber-400 transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </Section>
        )}

        {/* Mode Settings Section */}
        {(config.setupComplete && activeTab === "modes") && (
          <Section
            title="⚙️ Mode Settings"
            description="Configure settings for each generation mode"
          >
            <ModeSettingsManager />
          </Section>
        )}

        {/* Advanced Configuration Section (v3) */}
        {config.setupComplete && activeTab === "advanced" && (
          <Section
            title="🔧 Advanced Configuration"
            description="Fine-tune LLM assignments, thresholds, and presets"
          >
            <AdvancedConfigSection onSave={() => loadConfig()} />
          </Section>
        )}

        {/* Prompt Templates Section (v3) */}
        {config.setupComplete && activeTab === "prompts" && (
          <Section
            title="📝 Prompt Templates"
            description="View and edit system prompts for each generation mode"
          >
            <PromptTemplateEditor />
          </Section>
        )}

        {/* Power Features */}
        {(currentStep === "features" || (config.setupComplete && activeTab === "general")) && (
          <Section
            title="⚡ Power Features"
            description="Optional features for advanced users"
          >
            <div className="space-y-6">
              {/* Social Media Sync */}
              <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                <label className="flex items-center gap-3 text-slate-200 cursor-pointer">
                  <input
                    id="social-sync-toggle"
                    type="checkbox"
                    checked={config.features.linkedInSync.enabled}
                    onChange={(e) =>
                      saveConfig({
                        features: {
                          ...config.features,
                          linkedInSync: {
                            ...config.features.linkedInSync,
                            enabled: e.target.checked,
                          },
                        },
                      })
                    }
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700"
                  />
                  Social Media Sync
                </label>
                <p className="text-xs text-slate-500 mt-1 ml-7">
                  Mark insights as &quot;shared&quot; when they match your social media posts
                </p>
                {config.features.linkedInSync.enabled && (
                  <div className="mt-3 ml-7">
                    <input
                      type="text"
                      value={config.features.linkedInSync.postsDirectory || ""}
                      onChange={(e) =>
                        saveConfig({
                          features: {
                            ...config.features,
                            linkedInSync: {
                              ...config.features.linkedInSync,
                              postsDirectory: e.target.value || null,
                            },
                          },
                        })
                      }
                      placeholder="/path/to/social/posts"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                )}
              </div>

              {/* Solved Status Sync */}
              <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                <label className="flex items-center gap-3 text-slate-200 cursor-pointer">
                  <input
                    id="solved-status-sync-toggle"
                    type="checkbox"
                    checked={config.features.solvedStatusSync.enabled}
                    onChange={(e) =>
                      saveConfig({
                        features: {
                          ...config.features,
                          solvedStatusSync: { enabled: e.target.checked },
                        },
                      })
                    }
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700"
                  />
                  Solved Status Sync
                </label>
                <p className="text-xs text-slate-500 mt-1 ml-7">
                  Mark ideas as &quot;solved&quot; when they match projects in your workspaces
                </p>
              </div>
            </div>
            {!config.setupComplete && (
              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setCurrentStep("llm")}
                  className="px-6 py-2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={completeSetup}
                  disabled={saving}
                  className="px-6 py-2 bg-emerald-500 text-slate-900 font-medium rounded-lg hover:bg-emerald-400 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving..." : "Complete Setup ✓"}
                </button>
              </div>
            )}
            {config.setupComplete && activeTab === "general" && (
              <div className="mt-6 flex justify-end">
                <div className="text-xs text-slate-500 mr-4 self-center">
                  Changes are saved automatically
                </div>
              </div>
            )}
          </Section>
        )}

        {/* API Keys Notice */}
        <div className="mt-8 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <h3 className="text-sm font-medium text-slate-300 mb-2">🔑 API Keys</h3>
          <p className="text-xs text-slate-500">
            API keys are loaded from environment variables. Set{" "}
            <code className="text-amber-400">ANTHROPIC_API_KEY</code> and/or{" "}
            <code className="text-amber-400">OPENAI_API_KEY</code> in your{" "}
            <code className="text-slate-400">.env</code> file.
          </p>
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 p-6 bg-slate-900/50 rounded-xl border border-slate-800/50">
      <h2 className="text-lg font-semibold text-slate-200 mb-1">{title}</h2>
      <p className="text-sm text-slate-500 mb-4">{description}</p>
      {children}
    </section>
  );
}

function SupabaseCredentialsSection({ config }: { config: AppConfig }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    details?: Record<string, unknown>;
  } | null>(null);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-supabase");
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-slate-200 font-medium">🔐 Supabase Credentials</h4>
          <p className="text-xs text-slate-500 mt-1">
            Configured in <code className="px-1.5 py-0.5 bg-slate-900 rounded text-amber-400">.env.local</code>
          </p>
        </div>
        <button
          onClick={testConnection}
          disabled={testing || !config.vectordb?.url || !config.vectordb?.anonKey}
          className="text-xs px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          {testing ? (
            <>
              <span className="animate-spin">⟳</span>
              Testing...
            </>
          ) : (
            <>🔌 Test Connection</>
          )}
        </button>
      </div>
      
      <div className="space-y-2">
        {/* Supabase URL */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg">
          <span className="text-xs font-medium text-slate-500">SUPABASE_URL</span>
          {config.vectordb?.url ? (
            <span className="text-emerald-400 text-sm flex items-center gap-2">
              <span>✓</span>
              <span className="font-mono text-slate-400">•••••••••••••••</span>
            </span>
          ) : (
            <span className="text-amber-400 text-xs">Not set</span>
          )}
        </div>

        {/* Anon Key */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg">
          <span className="text-xs font-medium text-slate-500">SUPABASE_ANON_KEY</span>
          {config.vectordb?.anonKey ? (
            <span className="text-emerald-400 text-sm flex items-center gap-2">
              <span>✓</span>
              <span className="font-mono text-slate-400">•••••••••••••••</span>
            </span>
          ) : (
            <span className="text-amber-400 text-xs">Not set</span>
          )}
        </div>

        {/* Service Role Key */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg">
          <span className="text-xs font-medium text-slate-500">
            SUPABASE_SERVICE_ROLE_KEY <span className="text-slate-600">(optional)</span>
          </span>
          {config.vectordb?.serviceRoleKey ? (
            <span className="text-emerald-400 text-sm flex items-center gap-2">
              <span>✓</span>
              <span className="font-mono text-slate-400">•••••••••••••••</span>
            </span>
          ) : (
            <span className="text-slate-500 text-xs">—</span>
          )}
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`mt-3 p-3 rounded-lg border ${
          testResult.success 
            ? "bg-emerald-500/10 border-emerald-500/30" 
            : "bg-red-500/10 border-red-500/30"
        }`}>
          {testResult.success ? (
            <div className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <div>
                <p className="text-sm text-emerald-400 font-medium">Connection successful!</p>
                {testResult.details && (
                  <p className="text-xs text-slate-400 mt-1">
                    {(testResult.details as { messageCount?: number }).messageCount?.toLocaleString() ?? 0} messages indexed
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <span className="text-red-400">✗</span>
              <div>
                <p className="text-sm text-red-400 font-medium">{testResult.error}</p>
                {testResult.details && (testResult.details as { hint?: string }).hint && (
                  <p className="text-xs text-slate-400 mt-1">
                    💡 {(testResult.details as { hint?: string }).hint}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Instructions - collapsed by default */}
      <details className="mt-3">
        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">
          📝 How to edit credentials
        </summary>
        <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
            <li>Open <code className="px-1 bg-slate-800 rounded text-slate-300">.env.local</code> in the project root</li>
            <li>Add or update the environment variables</li>
            <li>Restart the app (<code className="px-1 bg-slate-800 rounded text-slate-300">npm run dev</code>)</li>
          </ol>
        </div>
      </details>
    </div>
  );
}

