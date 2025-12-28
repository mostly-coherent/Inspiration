"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface AppConfig {
  version: number;
  setupComplete: boolean;
  workspaces: string[];
  llm: {
    provider: "anthropic" | "openai";
    model: string;
    fallbackProvider: "anthropic" | "openai" | null;
    fallbackModel: string | null;
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
  };
  ui: {
    defaultTool: "ideas" | "insights";
    defaultMode: string;
  };
}

type WizardStep = "workspaces" | "voice" | "llm" | "features" | "done";

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<WizardStep>("workspaces");
  const [newWorkspace, setNewWorkspace] = useState("");

  // Load configuration
  useEffect(() => {
    loadConfig();
  }, []);

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
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        return true;
      } else {
        setError(data.error);
        return false;
      }
    } catch (err) {
      setError(String(err));
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
          {config.setupComplete && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
              Setup Complete
            </span>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Progress Steps (Wizard Mode) */}
        {!config.setupComplete && (
          <div className="mb-8">
            <div className="flex items-center justify-center gap-4 mb-6" role="navigation" aria-label="Setup wizard steps">
              {(["workspaces", "voice", "llm", "features"] as const).map((step, i) => {
                const stepLabels: Record<Exclude<WizardStep, "done">, string> = {
                  workspaces: "Configure Workspaces",
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
                    {i < 3 && (
                      <div className="w-12 h-0.5 bg-slate-800 mx-2" aria-hidden="true"></div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-center text-sm text-slate-500">
              {currentStep === "workspaces" && "Step 1: Configure Workspaces"}
              {currentStep === "voice" && "Step 2: Your Voice & Style"}
              {currentStep === "llm" && "Step 3: LLM Settings"}
              {currentStep === "features" && "Step 4: Power Features"}
            </div>
          </div>
        )}

        {/* Workspaces Section */}
        {(currentStep === "workspaces" || config.setupComplete) && (
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
                  onClick={() => setCurrentStep("voice")}
                  disabled={config.workspaces.length === 0}
                  className="px-6 py-2 bg-amber-500 text-slate-900 font-medium rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </Section>
        )}

        {/* Voice & Style Section */}
        {(currentStep === "voice" || config.setupComplete) && (
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
        {(currentStep === "llm" || config.setupComplete) && (
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
                      llm: { ...config.llm, provider: e.target.value as "anthropic" | "openai" },
                    })
                  }
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500/50"
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
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

        {/* Power Features */}
        {(currentStep === "features" || config.setupComplete) && (
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
                  Mark insights as "shared" when they match your social media posts
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
                  Mark ideas as "solved" when they match projects in your workspaces
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

