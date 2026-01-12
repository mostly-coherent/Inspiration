"use client";

import { useState, useEffect } from "react";
import {
  AdvancedLLMConfig,
  GlobalThresholds,
  TimePreset,
  GenerationDefaults,
  SeekDefaults,
  SemanticSearchDefaults,
  ThemeExplorerConfig,
} from "@/lib/types";

// Import section components
import {
  LLMConfigSection,
  ThresholdsSection,
  TimePresetsSection,
  GenerationSection,
  SeekDefaultsSection,
  SemanticSearchSection,
  ThemeExplorerSection,
  DEFAULT_THRESHOLDS,
  DEFAULT_TIME_PRESETS,
  DEFAULT_GENERATION,
  DEFAULT_SEEK,
  DEFAULT_SEMANTIC,
  DEFAULT_THEME_EXPLORER,
  DEFAULT_MODELS,
} from "./config";

interface AdvancedConfigSectionProps {
  onSave?: () => void;
}

// Default LLM configuration
const DEFAULT_LLM_CONFIG: AdvancedLLMConfig = {
  generation: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  judge: { provider: "openai", model: "gpt-3.5-turbo" },
  embedding: { provider: "openai", model: "text-embedding-3-small" },
  compression: { provider: "openai", model: "gpt-4o-mini" },
};

type SectionId = "llm" | "thresholds" | "presets" | "generation" | "seek" | "semantic" | "themeExplorer";

export function AdvancedConfigSection({ onSave }: AdvancedConfigSectionProps) {
  // State for all config sections
  const [llmConfig, setLlmConfig] = useState<AdvancedLLMConfig>(DEFAULT_LLM_CONFIG);
  const [thresholds, setThresholds] = useState<GlobalThresholds>(DEFAULT_THRESHOLDS);
  const [timePresets, setTimePresets] = useState<TimePreset[]>(DEFAULT_TIME_PRESETS);
  const [generationDefaults, setGenerationDefaults] = useState<GenerationDefaults>(DEFAULT_GENERATION);
  const [seekDefaults, setSeekDefaults] = useState<SeekDefaults>(DEFAULT_SEEK);
  const [semanticSearch, setSemanticSearch] = useState<SemanticSearchDefaults>(DEFAULT_SEMANTIC);
  const [themeExplorer, setThemeExplorer] = useState<ThemeExplorerConfig>(DEFAULT_THEME_EXPLORER);
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<SectionId | null>("llm");

  // Load configuration on mount
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      if (data.success && data.config) {
        // Load LLM config
        if (data.config.advancedLLM) {
          setLlmConfig(data.config.advancedLLM);
        } else {
          // Migrate from old config format
          const oldLlm = data.config.llm || {};
          setLlmConfig({
            generation: {
              provider: oldLlm.provider || "anthropic",
              model: oldLlm.model || "claude-sonnet-4-20250514",
            },
            judge: {
              provider: "openai",
              model: "gpt-3.5-turbo",
            },
            embedding: {
              provider: "openai",
              model: "text-embedding-3-small",
            },
            compression: {
              provider: "openai",
              model: "gpt-4o-mini",
            },
          });
        }
        
        // Load other configs (merge with defaults to ensure new fields are included)
        if (data.config.thresholds) setThresholds(data.config.thresholds);
        if (data.config.timePresets) setTimePresets(data.config.timePresets);
        if (data.config.generationDefaults) {
          // Merge with defaults to ensure new fields (e.g., softCap) are included
          setGenerationDefaults({ ...DEFAULT_GENERATION, ...data.config.generationDefaults });
        }
        if (data.config.seekDefaults) setSeekDefaults(data.config.seekDefaults);
        if (data.config.semanticSearch) setSemanticSearch(data.config.semanticSearch);
        if (data.config.themeExplorer) setThemeExplorer(data.config.themeExplorer);
      }
    } catch (err) {
      console.error("Failed to load config:", err);
      setError("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advancedLLM: llmConfig,
          thresholds,
          timePresets,
          generationDefaults,
          seekDefaults,
          semanticSearch,
          themeExplorer,
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Configuration saved successfully!");
        setTimeout(() => setSuccessMessage(null), 3000);
        onSave?.();
      } else {
        setError(data.error || "Failed to save configuration");
      }
    } catch (err) {
      console.error("Failed to save config:", err);
      setError("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (section: SectionId) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error/Success Messages */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400">
          {successMessage}
        </div>
      )}

      {/* LLM Task Assignments Section */}
      <LLMConfigSection
        llmConfig={llmConfig}
        setLlmConfig={setLlmConfig}
        isExpanded={expandedSection === "llm"}
        onToggle={() => toggleSection("llm")}
      />

      {/* Global Thresholds Section */}
      <ThresholdsSection
        thresholds={thresholds}
        setThresholds={setThresholds}
        isExpanded={expandedSection === "thresholds"}
        onToggle={() => toggleSection("thresholds")}
      />

      {/* Time Presets Section */}
      <TimePresetsSection
        timePresets={timePresets}
        setTimePresets={setTimePresets}
        isExpanded={expandedSection === "presets"}
        onToggle={() => toggleSection("presets")}
      />

      {/* Generation Defaults Section */}
      <GenerationSection
        generationDefaults={generationDefaults}
        setGenerationDefaults={setGenerationDefaults}
        isExpanded={expandedSection === "generation"}
        onToggle={() => toggleSection("generation")}
      />

      {/* Seek Mode Defaults Section */}
      <SeekDefaultsSection
        seekDefaults={seekDefaults}
        setSeekDefaults={setSeekDefaults}
        isExpanded={expandedSection === "seek"}
        onToggle={() => toggleSection("seek")}
      />

      {/* Semantic Search Section */}
      <SemanticSearchSection
        semanticSearch={semanticSearch}
        setSemanticSearch={setSemanticSearch}
        isExpanded={expandedSection === "semantic"}
        onToggle={() => toggleSection("semantic")}
      />

      {/* Theme Explorer Section */}
      <ThemeExplorerSection
        themeExplorer={themeExplorer}
        setThemeExplorer={setThemeExplorer}
        isExpanded={expandedSection === "themeExplorer"}
        onToggle={() => toggleSection("themeExplorer")}
      />

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="px-6 py-2 bg-amber-500 text-slate-900 font-medium rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : "Save Configuration"}
        </button>
      </div>
    </div>
  );
}
