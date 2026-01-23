"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ModeSettingsManager } from "@/components/ModeSettingsManager";
import { AdvancedConfigSection } from "@/components/AdvancedConfigSection";
import { PromptTemplateEditor } from "@/components/PromptTemplateEditor";
import {
  SettingsSection,
  WizardNavigation,
  WorkspacesSection,
  VectorDBSection,
  VoiceStyleSection,
  LLMSettingsSection,
  ChatHistorySection,
} from "@/components/settings";
import { ThemeSynthesisSection } from "@/components/config/ThemeSynthesisSection";
import { DebugReportSection } from "@/components/DebugReportButton";

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
    provider: "anthropic" | "openai";
    model: string;
    fallbackProvider: "anthropic" | "openai" | null;
    fallbackModel: string | null;
    promptCompression?: {
      enabled: boolean;
      threshold: number;
      compressionModel: string;
    };
  };
  features: {
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

type WizardStep = "workspaces" | "vectordb" | "voice" | "llm" | "done";
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
  
  // Chat history detection state
  const [chatHistoryCursor, setChatHistoryCursor] = useState<string | null>(null);
  const [chatHistoryClaudeCode, setChatHistoryClaudeCode] = useState<string | null>(null);
  const [chatHistoryPlatform, setChatHistoryPlatform] = useState<"darwin" | "win32" | null>(null);
  const [chatHistoryCursorExists, setChatHistoryCursorExists] = useState(false);
  const [chatHistoryClaudeCodeExists, setChatHistoryClaudeCodeExists] = useState(false);
  const [detectingChatHistory, setDetectingChatHistory] = useState(false);
  
  // Form state
  const [newWorkspace, setNewWorkspace] = useState("");
  
  // Local state for inputs (to avoid cursor jumping on every keystroke)
  const [localAuthorName, setLocalAuthorName] = useState("");
  const [localAuthorContext, setLocalAuthorContext] = useState("");
  const [localGoldenExamplesDir, setLocalGoldenExamplesDir] = useState("");
  const [localVoiceGuideFile, setLocalVoiceGuideFile] = useState("");
  const [localLlmModel, setLocalLlmModel] = useState("");

  // Prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Initialize isMountedRef
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
  }, [config]);

  // Initialize local state from config
  useEffect(() => {
    if (config) {
      setLocalAuthorName(config.features.customVoice.authorName || "");
      setLocalAuthorContext(config.features.customVoice.authorContext || "");
      setLocalGoldenExamplesDir(config.features.customVoice.goldenExamplesDir || "");
      setLocalVoiceGuideFile(config.features.customVoice.voiceGuideFile || "");
      setLocalLlmModel(config.llm.model || "");
    }
  }, [config]);

  const loadConfig = async () => {
    if (!isMountedRef.current) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/config");
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Failed to load config: ${errorText.length > 100 ? res.status : errorText}`);
      }
      
      const data = await res.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (!isMountedRef.current) return;
      
      if (data.success && data.config) {
        setConfig(data.config);
      } else {
        // Default config
        setConfig({
          version: 1,
          setupComplete: false,
          workspaces: [],
          llm: {
            provider: "anthropic",
            model: "claude-sonnet-4-20250514",
            fallbackProvider: null,
            fallbackModel: null,
          },
          features: {
            customVoice: {
              enabled: false,
              voiceGuideFile: null,
              goldenExamplesDir: null,
              authorName: null,
              authorContext: null,
            },
          },
          ui: { defaultTool: "ideas", defaultMode: "sprint" },
        });
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load configuration");
      console.error(err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const detectChatHistory = async () => {
    if (!isMountedRef.current) return;
    
    setDetectingChatHistory(true);
    try {
      const res = await fetch("/api/chat-history");
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Failed to detect chat history: ${errorText.length > 100 ? res.status : errorText}`);
      }
      
      const data = await res.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (!isMountedRef.current) return;
      
      if (data.success) {
        setChatHistoryCursor(data.cursor || null);
        setChatHistoryClaudeCode(data.claudeCode || null);
        setChatHistoryPlatform(data.platform);
        setChatHistoryCursorExists(data.cursorExists || false);
        setChatHistoryClaudeCodeExists(data.claudeCodeExists || false);
        
        // Save Cursor path if detected and not already saved
        if (data.cursor && config && (!config.chatHistory || !config.chatHistory.path)) {
          await saveConfig({
            chatHistory: {
              path: data.cursor,
              platform: data.platform,
              autoDetected: true,
              lastChecked: data.lastChecked,
            },
          });
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("Failed to detect chat history:", err);
      // Fail silently - chat history detection is optional
    } finally {
      if (isMountedRef.current) {
        setDetectingChatHistory(false);
      }
    }
  };

  const saveConfig = async (updates: Partial<AppConfig>): Promise<boolean> => {
    if (!config) return false;
    setSaving(true);
    try {
      const newConfig = { ...config, ...updates };
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(newConfig);
        return true;
      }
      setError(data.error || "Failed to save");
      return false;
    } catch (err) {
      setError("Failed to save configuration");
      console.error(err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addWorkspace = () => {
    if (newWorkspace.trim() && config) {
      saveConfig({ workspaces: [...config.workspaces, newWorkspace.trim()] });
      setNewWorkspace("");
    }
  };

  const removeWorkspace = (index: number) => {
    if (config) {
      saveConfig({ workspaces: config.workspaces.filter((_, i) => i !== index) });
    }
  };

  const completeSetup = async () => {
    await saveConfig({
      setupComplete: true,
    });
    setCurrentStep("done");
  };

  const handleVoiceSave = (field: "authorName" | "authorContext" | "goldenExamplesDir" | "voiceGuideFile", value: string) => {
    if (!config) return;
    
    // Update the customVoice settings
    const updatedCustomVoice = {
      ...config.features.customVoice,
      [field]: value || null,
      enabled: field === "goldenExamplesDir" ? !!value : config.features.customVoice.enabled,
    };
    
    // Merge with existing features, preserving v1Enabled
    const updates: Partial<AppConfig> = {
      features: {
        customVoice: updatedCustomVoice,
        v1Enabled: config.features.v1Enabled,
      },
    };
    
    saveConfig(updates);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <p className="text-red-400">{error || "Failed to load configuration"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Skip link */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-slate-900 focus:rounded-lg">
        Skip to main content
      </a>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-slate-300 hover:text-slate-100 transition-colors">
            <span>←</span>
            <span>Back to App</span>
          </Link>
          <h1 className="text-lg font-semibold text-slate-200">
            {config.setupComplete ? "Settings" : "Setup Wizard"}
          </h1>
          <div className="w-24" />
        </div>
      </header>

      <main id="main-content" className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Wizard Progress (Setup Mode) */}
        {!config.setupComplete && currentStep !== "done" && (
          <div className="mb-8">
            <div className="flex items-center justify-center mb-4">
              {["workspaces", "vectordb", "voice", "llm"].map((step, i) => (
                <div key={step} className="flex items-center">
                  <button
                    onClick={() => setCurrentStep(step as WizardStep)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      currentStep === step
                        ? "bg-amber-500 text-slate-900"
                        : i < ["workspaces", "vectordb", "voice", "llm"].indexOf(currentStep)
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-slate-800 text-slate-500"
                    }`}
                  >
                    {i + 1}
                  </button>
                  {i < 3 && <div className="w-12 h-0.5 bg-slate-800 mx-2" />}
                </div>
              ))}
            </div>
            <div className="text-center text-sm text-slate-500">
              {currentStep === "workspaces" && "Step 1: Configure Workspaces"}
              {currentStep === "vectordb" && "Step 2: Vector DB Setup"}
              {currentStep === "voice" && "Step 3: Your Voice & Style"}
              {currentStep === "llm" && "Step 4: LLM Settings"}
            </div>
          </div>
        )}

        {/* Tab Navigation (Setup Complete Mode) */}
        {config.setupComplete && (
          <div className="mb-8">
            <nav className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg border border-slate-700/30" role="tablist">
              {SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-all ${
                    activeTab === tab.id
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                  }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* Workspaces Section */}
        {((!config.setupComplete && currentStep === "workspaces") || (config.setupComplete && activeTab === "general")) && (
          <SettingsSection title="📁 Workspaces" description="Directories containing Cursor projects to analyze">
            <WorkspacesSection
              workspaces={config.workspaces}
              newWorkspace={newWorkspace}
              setNewWorkspace={setNewWorkspace}
              onAdd={addWorkspace}
              onRemove={removeWorkspace}
            />
            {!config.setupComplete && (
              <WizardNavigation
                onNext={() => setCurrentStep("vectordb")}
                nextDisabled={config.workspaces.length === 0}
              />
            )}
          </SettingsSection>
        )}

        {/* Chat History Locations Section */}
        {((!config.setupComplete && currentStep === "vectordb") || (config.setupComplete && activeTab === "general")) && (
          <SettingsSection title="📁 Chat History Locations" description="Auto-detected paths to your Cursor and Claude Code chat history">
            <ChatHistorySection
              chatHistory={{
                cursor: chatHistoryCursor,
                claudeCode: chatHistoryClaudeCode,
                platform: chatHistoryPlatform,
                cursorExists: chatHistoryCursorExists,
                claudeCodeExists: chatHistoryClaudeCodeExists,
                isDetecting: detectingChatHistory,
                onRefresh: detectChatHistory,
              }}
            />
          </SettingsSection>
        )}

        {/* VectorDB Setup Section */}
        {((!config.setupComplete && currentStep === "vectordb") || (config.setupComplete && activeTab === "general")) && (
          <SettingsSection title="🧠 Vector Database (Memory)" description="Set up Supabase Vector DB for efficient chat history search">
            <VectorDBSection
              vectordb={config.vectordb}
              chatHistory={{
                cursor: chatHistoryCursor,
                claudeCode: chatHistoryClaudeCode,
                platform: chatHistoryPlatform,
                cursorExists: chatHistoryCursorExists,
                claudeCodeExists: chatHistoryClaudeCodeExists,
                isDetecting: detectingChatHistory,
                onRefresh: detectChatHistory,
              }}
            />
            {!config.setupComplete && (
              <WizardNavigation
                onBack={() => setCurrentStep("workspaces")}
                onNext={() => setCurrentStep("voice")}
              />
            )}
          </SettingsSection>
        )}

        {/* Voice & Style Section */}
        {((!config.setupComplete && currentStep === "voice") || (config.setupComplete && activeTab === "general")) && (
          <SettingsSection title="✍️ Your Voice & Style" description="Configure how Inspiration captures your authentic writing voice">
            <VoiceStyleSection
              authorName={localAuthorName}
              setAuthorName={setLocalAuthorName}
              authorContext={localAuthorContext}
              setAuthorContext={setLocalAuthorContext}
              goldenExamplesDir={localGoldenExamplesDir}
              setGoldenExamplesDir={setLocalGoldenExamplesDir}
              voiceGuideFile={localVoiceGuideFile}
              setVoiceGuideFile={setLocalVoiceGuideFile}
              onSave={handleVoiceSave}
            />
            {!config.setupComplete && (
              <WizardNavigation
                onBack={() => setCurrentStep("vectordb")}
                onNext={() => setCurrentStep("llm")}
              />
            )}
          </SettingsSection>
        )}

        {/* LLM Settings */}
        {((!config.setupComplete && currentStep === "llm") || (config.setupComplete && activeTab === "general")) && (
          <SettingsSection title="🤖 LLM Provider" description="Configure your AI model for generation">
            <LLMSettingsSection
              llm={config.llm}
              localModel={localLlmModel}
              setLocalModel={setLocalLlmModel}
              onSave={(updates) => saveConfig(updates as Partial<AppConfig>)}
            />
            {!config.setupComplete && (
              <WizardNavigation
                onBack={() => setCurrentStep("voice")}
                onNext={completeSetup}
                nextLabel="Complete Setup ✓"
                saving={saving}
                isComplete
              />
            )}
          </SettingsSection>
        )}

        {/* Mode Settings Section */}
        {config.setupComplete && activeTab === "modes" && (
          <SettingsSection
            title="🎯 Mode Settings"
            description="Per-mode overrides for temperature, similarity, and search queries. Leave blank to use global defaults."
          >
            <div className="mb-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20 text-xs text-slate-400">
              <strong className="text-blue-400">💡 How to use:</strong> Each mode can have its own settings. 
              Mode-specific settings override the global defaults in Advanced tab.
            </div>
            <ModeSettingsManager />
          </SettingsSection>
        )}

        {/* Advanced Configuration Section */}
        {config.setupComplete && activeTab === "advanced" && (
          <SettingsSection
            title="🔧 Advanced Configuration"
            description="Global defaults for all generation modes"
          >
            <div className="mb-4 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-xs text-slate-400">
              <strong className="text-amber-400">💡 Quick guide:</strong> These are global defaults — they apply to all modes unless you set a mode-specific override.
            </div>
            <AdvancedConfigSection onSave={() => loadConfig()} />
          </SettingsSection>
        )}

        {/* Prompt Templates Section */}
        {config.setupComplete && activeTab === "prompts" && (
          <>
            <SettingsSection
              title="📝 Generation Prompts"
              description="The exact instructions the AI follows when generating Ideas, Insights, and Use Cases"
            >
              <PromptTemplateEditor />
            </SettingsSection>
            
            <SettingsSection
              title="✨ Theme Synthesis Prompts"
              description="The instructions for AI when synthesizing patterns in Theme Explorer"
            >
              <ThemeSynthesisSection />
            </SettingsSection>
          </>
        )}

        {/* API Keys Notice */}
        <div className="mt-8 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <h3 className="text-sm font-medium text-slate-300 mb-2">🔑 API Keys</h3>
          <p className="text-xs text-slate-500">
            API keys are loaded from environment variables. Set{" "}
            <code className="text-amber-400">ANTHROPIC_API_KEY</code> and/or{" "}
            <code className="text-amber-400">OPENAI_API_KEY</code> in your{" "}
            <code className="text-slate-400">.env</code> or <code className="text-slate-400">.env.local</code> file.
          </p>
        </div>

        {/* Debug Report Section */}
        <div className="mt-6">
          <DebugReportSection />
        </div>
      </main>
    </div>
  );
}
