"use client";

import { useState, useEffect } from "react";
import {
  LLMProviderType,
  AdvancedLLMConfig,
  GlobalThresholds,
  TimePreset,
} from "@/lib/types";

interface AdvancedConfigSectionProps {
  onSave?: () => void;
}

// Default LLM models per provider
const DEFAULT_MODELS: Record<LLMProviderType, string[]> = {
  anthropic: [
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-20241022",
    "claude-3-opus-20240229",
    "claude-3-haiku-20240307",
  ],
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
  ],
  openrouter: [
    "anthropic/claude-sonnet-4",
    "anthropic/claude-3.5-sonnet",
    "openai/gpt-4o",
    "google/gemini-pro-1.5",
    "meta-llama/llama-3.1-70b-instruct",
  ],
};

// Embedding models (OpenAI only for now)
const EMBEDDING_MODELS = [
  "text-embedding-3-small",
  "text-embedding-3-large",
  "text-embedding-ada-002",
];

// Default configuration
const DEFAULT_LLM_CONFIG: AdvancedLLMConfig = {
  generation: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  judge: { provider: "openai", model: "gpt-3.5-turbo" },
  embedding: { provider: "openai", model: "text-embedding-3-small" },
  compression: { provider: "openai", model: "gpt-4o-mini" },
};

const DEFAULT_THRESHOLDS: GlobalThresholds = {
  categorySimilarity: 0.75,
  judgeTemperature: 0.0,
  compressionTokenThreshold: 10000,
  compressionDateThreshold: 7,
};

const DEFAULT_TIME_PRESETS: TimePreset[] = [
  { id: "6h", label: "Last 6 hours", days: 0, hours: 6, isCustom: true },
  { id: "12h", label: "Last 12 hours", days: 0, hours: 12, isCustom: true },
  { id: "3d", label: "Last 3 days", days: 3, isCustom: true },
  { id: "7d", label: "Last week", days: 7, isCustom: true },
];

export function AdvancedConfigSection({ onSave }: AdvancedConfigSectionProps) {
  const [llmConfig, setLlmConfig] = useState<AdvancedLLMConfig>(DEFAULT_LLM_CONFIG);
  const [thresholds, setThresholds] = useState<GlobalThresholds>(DEFAULT_THRESHOLDS);
  const [timePresets, setTimePresets] = useState<TimePreset[]>(DEFAULT_TIME_PRESETS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("llm");

  // Load configuration
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
              model: oldLlm.promptCompression?.compressionModel || "gpt-4o-mini",
            },
          });
        }

        // Load thresholds
        if (data.config.thresholds) {
          setThresholds(data.config.thresholds);
        }

        // Load time presets
        if (data.config.timePresets) {
          setTimePresets(data.config.timePresets);
        }
      }
    } catch (err) {
      setError(`Failed to load config: ${err}`);
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advancedLLM: llmConfig,
          thresholds,
          timePresets,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Configuration saved successfully!");
        onSave?.();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(data.error || "Failed to save configuration");
      }
    } catch (err) {
      setError(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const updateLlmTask = (
    task: keyof AdvancedLLMConfig,
    field: "provider" | "model",
    value: string
  ) => {
    setLlmConfig((prev) => ({
      ...prev,
      [task]: {
        ...prev[task],
        [field]: value,
        // Reset model when provider changes
        ...(field === "provider" && {
          model: DEFAULT_MODELS[value as LLMProviderType]?.[0] || prev[task].model,
        }),
      },
    }));
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (loading) {
    return (
      <div className="text-slate-400 p-4">Loading advanced configuration...</div>
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
      <div className="border border-slate-700/50 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection("llm")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🤖</span>
            <div className="text-left">
              <h3 className="font-medium text-slate-200">LLM Task Assignments</h3>
              <p className="text-xs text-slate-500">Configure which model to use for each task</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "llm" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "llm" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            {/* Generation LLM */}
            <LLMTaskEditor
              label="Generation"
              description="Main content generation (ideas, insights)"
              config={llmConfig.generation}
              onChange={(field, value) => updateLlmTask("generation", field, value)}
              models={DEFAULT_MODELS}
            />

            {/* Judge LLM */}
            <LLMTaskEditor
              label="Judging/Ranking"
              description="Rank and filter generated items"
              config={llmConfig.judge}
              onChange={(field, value) => updateLlmTask("judge", field, value)}
              models={DEFAULT_MODELS}
            />

            {/* Embedding LLM */}
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-medium text-slate-300">Embedding</h4>
                  <p className="text-xs text-slate-500">Vector embeddings for semantic search</p>
                </div>
              </div>
              <select
                value={llmConfig.embedding.model}
                onChange={(e) =>
                  setLlmConfig((prev) => ({
                    ...prev,
                    embedding: { ...prev.embedding, model: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200"
              >
                {EMBEDDING_MODELS.map((model) => (
                  <option key={model} value={model}>
                    OpenAI: {model}
                  </option>
                ))}
              </select>
            </div>

            {/* Compression LLM */}
            <LLMTaskEditor
              label="Compression"
              description="Compress large conversations before generation"
              config={llmConfig.compression}
              onChange={(field, value) => updateLlmTask("compression", field, value)}
              models={DEFAULT_MODELS}
            />
          </div>
        )}
      </div>

      {/* Global Thresholds Section */}
      <div className="border border-slate-700/50 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection("thresholds")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">⚙️</span>
            <div className="text-left">
              <h3 className="font-medium text-slate-200">Global Thresholds</h3>
              <p className="text-xs text-slate-500">Fine-tune similarity, temperature, and limits</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "thresholds" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "thresholds" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            {/* Category Similarity */}
            <ThresholdSlider
              label="Category Similarity"
              description="Items above this similarity are grouped together"
              value={thresholds.categorySimilarity}
              min={0.5}
              max={0.95}
              step={0.05}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(value) =>
                setThresholds((prev) => ({ ...prev, categorySimilarity: value }))
              }
            />

            {/* Judge Temperature */}
            <ThresholdSlider
              label="Judge Temperature"
              description="Creativity for ranking (0 = deterministic, 1 = creative)"
              value={thresholds.judgeTemperature}
              min={0}
              max={1}
              step={0.1}
              format={(v) => v.toFixed(1)}
              onChange={(value) =>
                setThresholds((prev) => ({ ...prev, judgeTemperature: value }))
              }
            />

            {/* Compression Token Threshold */}
            <ThresholdSlider
              label="Compression Token Threshold"
              description="Compress conversations larger than this (tokens)"
              value={thresholds.compressionTokenThreshold}
              min={5000}
              max={50000}
              step={1000}
              format={(v) => `${(v / 1000).toFixed(0)}K`}
              onChange={(value) =>
                setThresholds((prev) => ({ ...prev, compressionTokenThreshold: value }))
              }
            />

            {/* Compression Date Threshold */}
            <ThresholdSlider
              label="Compression Date Range Threshold"
              description="Skip compression for date ranges under this (days)"
              value={thresholds.compressionDateThreshold}
              min={1}
              max={30}
              step={1}
              format={(v) => `${v} days`}
              onChange={(value) =>
                setThresholds((prev) => ({ ...prev, compressionDateThreshold: value }))
              }
            />
          </div>
        )}
      </div>

      {/* Time Presets Section */}
      <div className="border border-slate-700/50 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection("presets")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">⏱️</span>
            <div className="text-left">
              <h3 className="font-medium text-slate-200">Custom Time Presets</h3>
              <p className="text-xs text-slate-500">Add custom time windows (6h, 12h, etc.)</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "presets" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "presets" && (
          <div className="p-4 space-y-3 border-t border-slate-700/50">
            <p className="text-xs text-slate-500 mb-3">
              Custom presets appear alongside built-in presets (Daily, Sprint, Month, Quarter).
            </p>

            {timePresets.map((preset, index) => (
              <div
                key={preset.id}
                className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg"
              >
                <input
                  type="text"
                  value={preset.label}
                  onChange={(e) => {
                    const updated = [...timePresets];
                    updated[index] = { ...preset, label: e.target.value };
                    setTimePresets(updated);
                  }}
                  className="flex-1 px-3 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200"
                  placeholder="Label"
                />
                <div className="flex items-center gap-2">
                  {preset.hours !== undefined ? (
                    <>
                      <input
                        type="number"
                        value={preset.hours}
                        onChange={(e) => {
                          const updated = [...timePresets];
                          updated[index] = { ...preset, hours: parseInt(e.target.value) || 0 };
                          setTimePresets(updated);
                        }}
                        className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 text-center"
                        min="1"
                        max="72"
                      />
                      <span className="text-xs text-slate-500">hours</span>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        value={preset.days}
                        onChange={(e) => {
                          const updated = [...timePresets];
                          updated[index] = { ...preset, days: parseInt(e.target.value) || 0 };
                          setTimePresets(updated);
                        }}
                        className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 text-center"
                        min="1"
                        max="365"
                      />
                      <span className="text-xs text-slate-500">days</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => {
                    setTimePresets(timePresets.filter((_, i) => i !== index));
                  }}
                  className="text-slate-500 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              onClick={() => {
                setTimePresets([
                  ...timePresets,
                  {
                    id: `custom-${Date.now()}`,
                    label: "New Preset",
                    days: 7,
                    isCustom: true,
                  },
                ]);
              }}
              className="w-full p-2 text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg hover:border-slate-500 hover:text-slate-300 transition-colors"
            >
              + Add Time Preset
            </button>
          </div>
        )}
      </div>

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

// LLM Task Editor Component
function LLMTaskEditor({
  label,
  description,
  config,
  onChange,
  models,
}: {
  label: string;
  description: string;
  config: { provider: LLMProviderType; model: string };
  onChange: (field: "provider" | "model", value: string) => void;
  models: Record<LLMProviderType, string[]>;
}) {
  return (
    <div className="p-3 bg-slate-800/30 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="text-sm font-medium text-slate-300">{label}</h4>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={config.provider}
          onChange={(e) => onChange("provider", e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200"
        >
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="openrouter">OpenRouter</option>
        </select>
        <select
          value={config.model}
          onChange={(e) => onChange("model", e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200"
        >
          {models[config.provider]?.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Threshold Slider Component
function ThresholdSlider({
  label,
  description,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="p-3 bg-slate-800/30 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="text-sm font-medium text-slate-300">{label}</h4>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <span className="text-sm font-mono text-amber-400">{format(value)}</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
      />
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

