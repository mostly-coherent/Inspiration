"use client";

import { useState, useEffect } from "react";
import {
  LLMProviderType,
  AdvancedLLMConfig,
  GlobalThresholds,
  TimePreset,
  GenerationDefaults,
  SeekDefaults,
  QualityScoring,
  SemanticSearchDefaults,
  FileTrackingConfig,
  ThemeExplorerConfig,
  ThemeSynthesisConfig,
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

// v3: Generation Defaults
// Temperature 0.5: Better balance of creativity & focus for ideation
// Dedup 0.80: Slightly more aggressive duplicate detection
const DEFAULT_GENERATION: GenerationDefaults = {
  temperature: 0.5,
  deduplicationThreshold: 0.80,
  maxTokens: 4000,
  maxTokensJudge: 500,
};

// v3: Seek Mode Defaults
const DEFAULT_SEEK: SeekDefaults = {
  daysBack: 90,
  topK: 10,
  minSimilarity: 0.0,
};

// v3: Quality Scoring
const DEFAULT_QUALITY: QualityScoring = {
  tierA: 13,
  tierB: 9,
  tierC: 5,
};

// v3: Semantic Search
const DEFAULT_SEMANTIC: SemanticSearchDefaults = {
  defaultTopK: 50,
  defaultMinSimilarity: 0.3,
};

// v3: File Tracking
const DEFAULT_FILE_TRACKING: FileTrackingConfig = {
  textExtensions: [".md", ".txt", ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml"],
  implementedMatchThreshold: 0.75,
};

// v3: Theme Explorer
const DEFAULT_THEME_EXPLORER: ThemeExplorerConfig = {
  defaultZoom: 0.7,
  sliderMin: 0.45,
  sliderMax: 0.92,
  maxThemesToDisplay: 20,
  largeThemeThreshold: 5,
};

// v3: Theme Synthesis
const DEFAULT_THEME_SYNTHESIS: ThemeSynthesisConfig = {
  maxItemsToSynthesize: 15,
  maxTokens: 800,
  maxDescriptionLength: 200,
};

export function AdvancedConfigSection({ onSave }: AdvancedConfigSectionProps) {
  const [llmConfig, setLlmConfig] = useState<AdvancedLLMConfig>(DEFAULT_LLM_CONFIG);
  const [thresholds, setThresholds] = useState<GlobalThresholds>(DEFAULT_THRESHOLDS);
  const [timePresets, setTimePresets] = useState<TimePreset[]>(DEFAULT_TIME_PRESETS);
  const [generationDefaults, setGenerationDefaults] = useState<GenerationDefaults>(DEFAULT_GENERATION);
  const [seekDefaults, setSeekDefaults] = useState<SeekDefaults>(DEFAULT_SEEK);
  const [qualityScoring, setQualityScoring] = useState<QualityScoring>(DEFAULT_QUALITY);
  const [semanticSearch, setSemanticSearch] = useState<SemanticSearchDefaults>(DEFAULT_SEMANTIC);
  const [fileTracking, setFileTracking] = useState<FileTrackingConfig>(DEFAULT_FILE_TRACKING);
  const [themeExplorer, setThemeExplorer] = useState<ThemeExplorerConfig>(DEFAULT_THEME_EXPLORER);
  const [themeSynthesis, setThemeSynthesis] = useState<ThemeSynthesisConfig>(DEFAULT_THEME_SYNTHESIS);
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

        // Load generation defaults
        if (data.config.generationDefaults) {
          setGenerationDefaults(data.config.generationDefaults);
        }

        // Load seek defaults
        if (data.config.seekDefaults) {
          setSeekDefaults(data.config.seekDefaults);
        }

        // Load quality scoring
        if (data.config.qualityScoring) {
          setQualityScoring(data.config.qualityScoring);
        }

        // Load semantic search
        if (data.config.semanticSearch) {
          setSemanticSearch(data.config.semanticSearch);
        }

        // Load file tracking
        if (data.config.fileTracking) {
          setFileTracking(data.config.fileTracking);
        }

        // Load theme explorer
        if (data.config.themeExplorer) {
          setThemeExplorer(data.config.themeExplorer);
        }

        // Load theme synthesis
        if (data.config.themeSynthesis) {
          setThemeSynthesis(data.config.themeSynthesis);
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
          generationDefaults,
          seekDefaults,
          qualityScoring,
          semanticSearch,
          fileTracking,
          themeExplorer,
          themeSynthesis,
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

  // Helper functions to check if sections are modified from defaults
  const isThresholdsModified = () => 
    thresholds.judgeTemperature !== DEFAULT_THRESHOLDS.judgeTemperature ||
    thresholds.compressionTokenThreshold !== DEFAULT_THRESHOLDS.compressionTokenThreshold ||
    thresholds.compressionDateThreshold !== DEFAULT_THRESHOLDS.compressionDateThreshold;

  const isGenerationModified = () =>
    Math.abs(generationDefaults.temperature - DEFAULT_GENERATION.temperature) > 0.001 ||
    Math.abs(generationDefaults.deduplicationThreshold - DEFAULT_GENERATION.deduplicationThreshold) > 0.001 ||
    generationDefaults.maxTokens !== DEFAULT_GENERATION.maxTokens ||
    generationDefaults.maxTokensJudge !== DEFAULT_GENERATION.maxTokensJudge;

  const isSeekModified = () =>
    seekDefaults.daysBack !== DEFAULT_SEEK.daysBack ||
    seekDefaults.topK !== DEFAULT_SEEK.topK ||
    Math.abs(seekDefaults.minSimilarity - DEFAULT_SEEK.minSimilarity) > 0.001;

  const isQualityModified = () =>
    qualityScoring.tierA !== DEFAULT_QUALITY.tierA ||
    qualityScoring.tierB !== DEFAULT_QUALITY.tierB ||
    qualityScoring.tierC !== DEFAULT_QUALITY.tierC;

  const isSemanticModified = () =>
    semanticSearch.defaultTopK !== DEFAULT_SEMANTIC.defaultTopK ||
    Math.abs(semanticSearch.defaultMinSimilarity - DEFAULT_SEMANTIC.defaultMinSimilarity) > 0.001;

  const isFileTrackingModified = () =>
    Math.abs(fileTracking.implementedMatchThreshold - DEFAULT_FILE_TRACKING.implementedMatchThreshold) > 0.001 ||
    JSON.stringify(fileTracking.textExtensions) !== JSON.stringify(DEFAULT_FILE_TRACKING.textExtensions);

  const isThemeExplorerModified = () =>
    Math.abs(themeExplorer.defaultZoom - DEFAULT_THEME_EXPLORER.defaultZoom) > 0.001 ||
    Math.abs(themeExplorer.sliderMin - DEFAULT_THEME_EXPLORER.sliderMin) > 0.001 ||
    Math.abs(themeExplorer.sliderMax - DEFAULT_THEME_EXPLORER.sliderMax) > 0.001 ||
    themeExplorer.maxThemesToDisplay !== DEFAULT_THEME_EXPLORER.maxThemesToDisplay ||
    themeExplorer.largeThemeThreshold !== DEFAULT_THEME_EXPLORER.largeThemeThreshold;

  const isThemeSynthesisModified = () =>
    themeSynthesis.maxItemsToSynthesize !== DEFAULT_THEME_SYNTHESIS.maxItemsToSynthesize ||
    themeSynthesis.maxTokens !== DEFAULT_THEME_SYNTHESIS.maxTokens ||
    themeSynthesis.maxDescriptionLength !== DEFAULT_THEME_SYNTHESIS.maxDescriptionLength;

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
            <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-xs text-slate-400">
              <strong className="text-indigo-400">🎯 Job to be done:</strong> Choose which AI models handle different tasks.
              Smarter models (Claude, GPT-4o) give better results but cost more. Cheaper models (GPT-3.5) are faster and more affordable.
              <div className="mt-2 text-slate-500">
                💡 <strong>Recommendation:</strong> Use Claude for generation (best quality), GPT-3.5 for judging/compression (good enough, much cheaper).
              </div>
            </div>

            {/* Generation LLM */}
            <LLMTaskEditor
              label="Generation"
              description="The main creative engine — generates your ideas and insights. Use the smartest model you can afford."
              config={llmConfig.generation}
              onChange={(field, value) => updateLlmTask("generation", field, value)}
              models={DEFAULT_MODELS}
            />

            {/* Judge LLM */}
            <LLMTaskEditor
              label="Judging/Ranking"
              description="Ranks items by quality. A simpler task, so a cheaper/faster model works fine here."
              config={llmConfig.judge}
              onChange={(field, value) => updateLlmTask("judge", field, value)}
              models={DEFAULT_MODELS}
            />

            {/* Embedding LLM */}
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-medium text-slate-300">Embedding</h4>
                  <p className="text-xs text-slate-500">Converts text to numbers for semantic search. &quot;text-embedding-3-small&quot; is the best balance of cost and quality.</p>
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
              description="Summarizes long conversations to fit in context. Use a cheap model — it just needs to preserve key facts."
              config={llmConfig.compression}
              onChange={(field, value) => updateLlmTask("compression", field, value)}
              models={DEFAULT_MODELS}
            />
          </div>
        )}
      </div>

      {/* Global Thresholds Section */}
      <div className={`border rounded-lg overflow-hidden ${isThresholdsModified() ? 'border-amber-500/30' : 'border-slate-700/50'}`}>
        <button
          onClick={() => toggleSection("thresholds")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">⚙️</span>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-slate-200">Global Thresholds</h3>
                {isThresholdsModified() && (
                  <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">modified</span>
                )}
              </div>
              <p className="text-xs text-slate-500">Fine-tune similarity, temperature, and limits</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "thresholds" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "thresholds" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="flex items-start justify-between">
              <div className="p-3 bg-slate-500/10 rounded-lg border border-slate-500/20 text-xs text-slate-400 flex-1">
                <strong className="text-slate-300">🎯 Job to be done:</strong> Fine-tune internal operations for performance vs. cost trade-offs.
                <div className="mt-2 text-slate-500">
                  💡 <strong>When to change:</strong> Most users never need to touch these. Only adjust if you&apos;re hitting rate limits or want to optimize costs.
                </div>
              </div>
              {isThresholdsModified() && (
                <button
                  onClick={() => setThresholds(DEFAULT_THRESHOLDS)}
                  className="ml-3 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors flex items-center gap-1"
                >
                  ↺ Reset All
                </button>
              )}
            </div>

            {/* Judge Temperature */}
            <ThresholdSlider
              label="Judge Temperature"
              description="Controls randomness in ranking. Keep at 0 for consistent results. Only increase if rankings feel too repetitive."
              value={thresholds.judgeTemperature}
              defaultValue={DEFAULT_THRESHOLDS.judgeTemperature}
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
              description="Large conversations get summarized before analysis. Lower = more compression (saves money, may lose detail). Higher = less compression (better quality, costs more)."
              value={thresholds.compressionTokenThreshold}
              defaultValue={DEFAULT_THRESHOLDS.compressionTokenThreshold}
              min={5000}
              max={50000}
              step={1000}
              format={(v) => `${(v / 1000).toFixed(0)}K tokens`}
              onChange={(value) =>
                setThresholds((prev) => ({ ...prev, compressionTokenThreshold: value }))
              }
            />

            {/* Compression Date Threshold */}
            <ThresholdSlider
              label="Compression Date Range Threshold"
              description="Skip compression for short date ranges (they're small anyway). Increase if you often analyze just 1-2 days."
              value={thresholds.compressionDateThreshold}
              defaultValue={DEFAULT_THRESHOLDS.compressionDateThreshold}
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

      {/* Generation Defaults Section */}
      <div className={`border rounded-lg overflow-hidden ${isGenerationModified() ? 'border-amber-500/30' : 'border-slate-700/50'}`}>
        <button
          onClick={() => toggleSection("generation")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">✨</span>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-slate-200">Generation Defaults</h3>
                {isGenerationModified() && (
                  <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">modified</span>
                )}
              </div>
              <p className="text-xs text-slate-500">Control how AI creates ideas and insights</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "generation" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "generation" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="flex items-start justify-between">
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20 text-xs text-slate-400 flex-1">
                <strong className="text-blue-400">🎯 Job to be done:</strong> Control how the AI generates ideas and insights from your chat history.
                These are the most impactful settings — they directly affect the quality and variety of your results.
              </div>
              {isGenerationModified() && (
                <button
                  onClick={() => setGenerationDefaults(DEFAULT_GENERATION)}
                  className="ml-3 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors flex items-center gap-1"
                >
                  ↺ Reset All
                </button>
              )}
            </div>

            {/* Temperature */}
            <ThresholdSlider
              label="Generation Temperature"
              description="Controls creativity vs. focus. Low (0.2-0.3) = predictable, safe outputs. Medium (0.4-0.6) = balanced variety. High (0.7+) = creative, sometimes surprising."
              value={generationDefaults.temperature}
              defaultValue={DEFAULT_GENERATION.temperature}
              min={0}
              max={1}
              step={0.1}
              format={(v) => v.toFixed(1)}
              onChange={(value) =>
                setGenerationDefaults((prev) => ({ ...prev, temperature: value }))
              }
            />
            <div className="text-xs text-slate-500 -mt-2 ml-3">
              💡 <strong>Recommendation:</strong> Start at 0.5 (default). Increase to 0.7 if results feel repetitive. Decrease to 0.3 for more focused output.
            </div>

            {/* Deduplication Threshold */}
            <ThresholdSlider
              label="Duplicate Detection Sensitivity"
              description="Two items are considered duplicates if they're this similar. Lower = more aggressive (removes more). Higher = stricter (keeps more)."
              value={generationDefaults.deduplicationThreshold}
              defaultValue={DEFAULT_GENERATION.deduplicationThreshold}
              min={0.5}
              max={0.99}
              step={0.01}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(value) =>
                setGenerationDefaults((prev) => ({ ...prev, deduplicationThreshold: value }))
              }
            />
            <div className="text-xs text-slate-500 -mt-2 ml-3">
              💡 <strong>Recommendation:</strong> 80% (default) works well. Lower to 70% if you&apos;re seeing near-duplicates. Raise to 90% if too many unique items are being removed.
            </div>

            {/* Max Tokens */}
            <ThresholdSlider
              label="Max Generation Length"
              description="How long each generated item can be. More tokens = more detailed descriptions. Fewer tokens = concise summaries."
              value={generationDefaults.maxTokens}
              defaultValue={DEFAULT_GENERATION.maxTokens}
              min={1000}
              max={8000}
              step={500}
              format={(v) => `${(v / 1000).toFixed(1)}K tokens`}
              onChange={(value) =>
                setGenerationDefaults((prev) => ({ ...prev, maxTokens: value }))
              }
            />
            <div className="text-xs text-slate-500 -mt-2 ml-3">
              💡 <strong>Recommendation:</strong> 4K (default) is plenty for most items. Only increase if outputs are being cut off mid-sentence.
            </div>

            {/* Max Tokens Judge */}
            <ThresholdSlider
              label="Max Judging Length"
              description="How much the judge can write when scoring items. Keep this low — it just needs to output a score."
              value={generationDefaults.maxTokensJudge}
              defaultValue={DEFAULT_GENERATION.maxTokensJudge}
              min={100}
              max={2000}
              step={100}
              format={(v) => `${v} tokens`}
              onChange={(value) =>
                setGenerationDefaults((prev) => ({ ...prev, maxTokensJudge: value }))
              }
            />
          </div>
        )}
      </div>

      {/* Seek Mode Defaults Section */}
      <div className={`border rounded-lg overflow-hidden ${isSeekModified() ? 'border-amber-500/30' : 'border-slate-700/50'}`}>
        <button
          onClick={() => toggleSection("seek")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔍</span>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-slate-200">Seek Mode Defaults</h3>
                {isSeekModified() && (
                  <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">modified</span>
                )}
              </div>
              <p className="text-xs text-slate-500">Default settings when using &quot;Seek&quot; to find use cases</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "seek" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "seek" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="flex items-start justify-between">
              <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20 text-xs text-slate-400 flex-1">
                <strong className="text-purple-400">🎯 Job to be done:</strong> Find evidence in your chat history for things you want to build.
                Ask &quot;Have I worked on something like X before?&quot; and Seek finds relevant conversations, then synthesizes them into use cases.
                <div className="mt-2 text-slate-500">
                  💡 <strong>Example:</strong> Query &quot;AI debugging assistant&quot; → finds all chats where you discussed debugging tools → synthesizes into structured use case examples.
                </div>
              </div>
              {isSeekModified() && (
                <button
                  onClick={() => setSeekDefaults(DEFAULT_SEEK)}
                  className="ml-3 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors flex items-center gap-1"
                >
                  ↺ Reset All
                </button>
              )}
            </div>

            {/* Days Back */}
            <ThresholdSlider
              label="Days to Search"
              description="How far back to search in your chat history. More days = more potential matches, but slower and may include outdated context."
              value={seekDefaults.daysBack}
              defaultValue={DEFAULT_SEEK.daysBack}
              min={7}
              max={365}
              step={7}
              format={(v) => `${v} days`}
              onChange={(value) =>
                setSeekDefaults((prev) => ({ ...prev, daysBack: value }))
              }
            />
            <div className="text-xs text-slate-500 -mt-2 ml-3">
              💡 <strong>Recommendation:</strong> 90 days (default) covers ~3 months. Increase to 365 if you want to search your entire history.
            </div>

            {/* Top K */}
            <ThresholdSlider
              label="Maximum Results"
              description="How many matching conversations to analyze. More = richer context for synthesis. Fewer = faster, focused on best matches."
              value={seekDefaults.topK}
              defaultValue={DEFAULT_SEEK.topK}
              min={1}
              max={50}
              step={1}
              format={(v) => `${v} conversations`}
              onChange={(value) =>
                setSeekDefaults((prev) => ({ ...prev, topK: value }))
              }
            />
            <div className="text-xs text-slate-500 -mt-2 ml-3">
              💡 <strong>Recommendation:</strong> 10 (default) is a good balance. Increase to 20-30 for comprehensive searches on broad topics.
            </div>

            {/* Min Similarity */}
            <ThresholdSlider
              label="Minimum Relevance"
              description="Filter out loosely related results. 0% = show everything (cast wide net). Higher = only highly relevant matches."
              value={seekDefaults.minSimilarity}
              defaultValue={DEFAULT_SEEK.minSimilarity}
              min={0}
              max={0.9}
              step={0.1}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(value) =>
                setSeekDefaults((prev) => ({ ...prev, minSimilarity: value }))
              }
            />
            <div className="text-xs text-slate-500 -mt-2 ml-3">
              💡 <strong>Recommendation:</strong> Start at 0% (default) to see everything. Increase to 30-50% if you&apos;re getting too many irrelevant results.
            </div>
          </div>
        )}
      </div>

      {/* Quality Scoring Section */}
      <div className={`border rounded-lg overflow-hidden ${isQualityModified() ? 'border-amber-500/30' : 'border-slate-700/50'}`}>
        <button
          onClick={() => toggleSection("quality")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">⭐</span>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-slate-200">Quality Scoring Thresholds</h3>
                {isQualityModified() && (
                  <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">modified</span>
                )}
              </div>
              <p className="text-xs text-slate-500">How items get graded (A/B/C)</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "quality" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "quality" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="flex items-start justify-between">
              <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-xs text-slate-400 flex-1">
                <strong className="text-amber-400">🎯 Job to be done:</strong> Automatically grade each generated item so you can focus on the best ones.
                The AI scores items 0-15 based on originality, clarity, and actionability.
                <div className="mt-2 text-slate-500">
                  💡 <strong>How to use:</strong> Focus on Grade A items first — they&apos;re ready to share or build. Grade B needs light editing. Grade C are rough ideas to revisit later.
                </div>
              </div>
              {isQualityModified() && (
                <button
                  onClick={() => setQualityScoring(DEFAULT_QUALITY)}
                  className="ml-3 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors flex items-center gap-1"
                >
                  ↺ Reset All
                </button>
              )}
            </div>

            {/* Tier A */}
            <ThresholdSlider
              label="Grade A Threshold"
              description="Items scoring this or higher get an 'A' — your best stuff. Raise this if too many items are getting A's."
              value={qualityScoring.tierA}
              defaultValue={DEFAULT_QUALITY.tierA}
              min={10}
              max={15}
              step={1}
              format={(v) => `≥ ${v} points`}
              onChange={(value) =>
                setQualityScoring((prev) => ({ ...prev, tierA: value }))
              }
            />

            {/* Tier B */}
            <ThresholdSlider
              label="Grade B Threshold"
              description="Items in this range get a 'B' — good but need polish. The gap between A and B thresholds matters."
              value={qualityScoring.tierB}
              defaultValue={DEFAULT_QUALITY.tierB}
              min={5}
              max={12}
              step={1}
              format={(v) => `≥ ${v} points`}
              onChange={(value) =>
                setQualityScoring((prev) => ({ ...prev, tierB: value }))
              }
            />

            {/* Tier C */}
            <ThresholdSlider
              label="Grade C Threshold"
              description="Items at or above this get a 'C' — worth keeping but need work. Below this = filtered out."
              value={qualityScoring.tierC}
              defaultValue={DEFAULT_QUALITY.tierC}
              min={1}
              max={8}
              step={1}
              format={(v) => `≥ ${v} points`}
              onChange={(value) =>
                setQualityScoring((prev) => ({ ...prev, tierC: value }))
              }
            />
            <div className="text-xs text-slate-500 ml-3">
              💡 <strong>Recommendation:</strong> Default values (A≥13, B≥9, C≥5) work well. Lower all thresholds if you want to see more items. Raise them if you only want top-tier results.
            </div>
          </div>
        )}
      </div>

      {/* Semantic Search Section */}
      <div className={`border rounded-lg overflow-hidden ${isSemanticModified() ? 'border-amber-500/30' : 'border-slate-700/50'}`}>
        <button
          onClick={() => toggleSection("semantic")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🧠</span>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-slate-200">Semantic Search Settings</h3>
                {isSemanticModified() && (
                  <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">modified</span>
                )}
              </div>
              <p className="text-xs text-slate-500">How the AI searches your chat history</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "semantic" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "semantic" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="flex items-start justify-between">
              <div className="p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/20 text-xs text-slate-400 flex-1">
                <strong className="text-cyan-400">🎯 Job to be done:</strong> Find relevant conversations in your chat history, even when you don&apos;t remember exact keywords.
                Unlike keyword search, semantic search understands meaning — &quot;fixing bugs&quot; will find chats about &quot;debugging errors&quot;.
                <div className="mt-2 text-slate-500">
                  💡 <strong>How it&apos;s used:</strong> Powers both Generate (finding source material) and Seek (finding evidence). These settings control the defaults.
                </div>
              </div>
              {isSemanticModified() && (
                <button
                  onClick={() => setSemanticSearch(DEFAULT_SEMANTIC)}
                  className="ml-3 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors flex items-center gap-1"
                >
                  ↺ Reset All
                </button>
              )}
            </div>

            {/* Default Top K */}
            <ThresholdSlider
              label="Conversations to Consider"
              description="How many conversations to retrieve from your history. More = richer context, but slower and may include noise."
              value={semanticSearch.defaultTopK}
              defaultValue={DEFAULT_SEMANTIC.defaultTopK}
              min={10}
              max={200}
              step={10}
              format={(v) => `${v} conversations`}
              onChange={(value) =>
                setSemanticSearch((prev) => ({ ...prev, defaultTopK: value }))
              }
            />
            <div className="text-xs text-slate-500 -mt-2 ml-3">
              💡 <strong>Recommendation:</strong> 50 (default) works for most users. Increase to 100+ if you have a large chat history and want deeper coverage.
            </div>

            {/* Default Min Similarity */}
            <ThresholdSlider
              label="Relevance Threshold"
              description="Minimum similarity score for a conversation to be included. Lower = more results (broader). Higher = fewer, more focused results."
              value={semanticSearch.defaultMinSimilarity}
              defaultValue={DEFAULT_SEMANTIC.defaultMinSimilarity}
              min={0}
              max={0.8}
              step={0.05}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(value) =>
                setSemanticSearch((prev) => ({ ...prev, defaultMinSimilarity: value }))
              }
            />
            <div className="text-xs text-slate-500 -mt-2 ml-3">
              💡 <strong>Recommendation:</strong> 30% (default) is a good balance. Lower to 0% to see everything. Raise to 50%+ to filter out tangentially related chats.
            </div>
          </div>
        )}
      </div>

      {/* File Tracking Section */}
      <div className={`border rounded-lg overflow-hidden ${isFileTrackingModified() ? 'border-amber-500/30' : 'border-slate-700/50'}`}>
        <button
          onClick={() => toggleSection("files")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">📁</span>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-slate-200">File Tracking</h3>
                {isFileTrackingModified() && (
                  <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">modified</span>
                )}
              </div>
              <p className="text-xs text-slate-500">Configure folder scanning for implemented items</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "files" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "files" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="flex items-start justify-between">
              <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-xs text-slate-400 flex-1">
                <strong className="text-emerald-400">🎯 Job to be done:</strong> Track which ideas you&apos;ve already built or written about.
                Point to a folder (blog, code repo, notes) and Inspiration scans files to mark matching items as &quot;implemented&quot;.
                <div className="mt-2 text-slate-500">
                  💡 <strong>Example:</strong> Set your blog folder → ideas that match published posts get marked as &quot;implemented&quot; → focus on what&apos;s left to build.
                </div>
              </div>
              {isFileTrackingModified() && (
                <button
                  onClick={() => setFileTracking(DEFAULT_FILE_TRACKING)}
                  className="ml-3 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors flex items-center gap-1"
                >
                  ↺ Reset All
                </button>
              )}
            </div>

            {/* Text Extensions */}
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-medium text-slate-300">File Extensions to Scan</h4>
                  <p className="text-xs text-slate-500">Which file types to look at when scanning folders</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {fileTracking.textExtensions.map((ext, i) => (
                  <span
                    key={ext}
                    className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300 flex items-center gap-1"
                  >
                    {ext}
                    <button
                      onClick={() => {
                        setFileTracking((prev) => ({
                          ...prev,
                          textExtensions: prev.textExtensions.filter((_, idx) => idx !== i),
                        }));
                      }}
                      className="text-slate-500 hover:text-red-400 ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder=".extension"
                  className="flex-1 px-3 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const input = e.currentTarget;
                      let ext = input.value.trim();
                      if (ext && !ext.startsWith(".")) ext = "." + ext;
                      if (ext && !fileTracking.textExtensions.includes(ext)) {
                        setFileTracking((prev) => ({
                          ...prev,
                          textExtensions: [...prev.textExtensions, ext],
                        }));
                        input.value = "";
                      }
                    }
                  }}
                />
                <button
                  onClick={() => {
                    setFileTracking(DEFAULT_FILE_TRACKING);
                  }}
                  className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded"
                >
                  Reset
                </button>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                💡 Common: .md (blogs), .txt (notes), .py/.ts/.js (code)
              </p>
            </div>

            {/* Implemented Match Threshold */}
            <ThresholdSlider
              label="Match Sensitivity"
              description="How similar an idea needs to be to a file to count as 'implemented'. Lower = more matches (may be false positives). Higher = stricter matching."
              value={fileTracking.implementedMatchThreshold}
              defaultValue={DEFAULT_FILE_TRACKING.implementedMatchThreshold}
              min={0.5}
              max={0.95}
              step={0.05}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(value) =>
                setFileTracking((prev) => ({ ...prev, implementedMatchThreshold: value }))
              }
            />
            <div className="text-xs text-slate-500 -mt-2 ml-3">
              💡 <strong>Recommendation:</strong> 75% (default) is a good balance. Lower to 60% if ideas aren&apos;t being matched. Raise to 85% if unrelated items are being marked as implemented.
            </div>
          </div>
        )}
      </div>

      {/* Theme Explorer Section */}
      <div className={`border rounded-lg overflow-hidden ${isThemeExplorerModified() ? 'border-amber-500/30' : 'border-slate-700/50'}`}>
        <button
          onClick={() => toggleSection("themeExplorer")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔭</span>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-slate-200">Theme Explorer</h3>
                {isThemeExplorerModified() && (
                  <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">modified</span>
                )}
              </div>
              <p className="text-xs text-slate-500">Pattern discovery and grouping settings</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "themeExplorer" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "themeExplorer" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="flex items-start justify-between">
              <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-xs text-slate-400 flex-1">
                <strong className="text-indigo-400">🎯 Job to be done:</strong> Discover patterns across your ideas and insights.
                Theme Explorer groups similar items together dynamically — &quot;zoom out&quot; to see big-picture themes, &quot;zoom in&quot; for specific clusters.
                <div className="mt-2 text-slate-500">
                  💡 <strong>How to use:</strong> Open Theme Explorer → Drag the zoom slider → Click a theme to see its items → Synthesize insights with AI.
                </div>
              </div>
              {isThemeExplorerModified() && (
                <button
                  onClick={() => setThemeExplorer(DEFAULT_THEME_EXPLORER)}
                  className="ml-3 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors flex items-center gap-1"
                >
                  ↺ Reset All
                </button>
              )}
            </div>

            {/* Default Zoom */}
            <ThresholdSlider
              label="Default Zoom Level"
              description="Where the slider starts. Lower = fewer, broader themes. Higher = more, specific themes."
              value={themeExplorer.defaultZoom}
              defaultValue={DEFAULT_THEME_EXPLORER.defaultZoom}
              min={0.4}
              max={0.95}
              step={0.05}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(value) =>
                setThemeExplorer((prev) => ({ ...prev, defaultZoom: value }))
              }
            />
            <div className="text-xs text-slate-500 -mt-2 ml-3">
              💡 <strong>Recommendation:</strong> 70% (default) shows a balanced mix. Start lower (50%) for big-picture view. Start higher (85%) for detailed clusters.
            </div>

            {/* Slider Range */}
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Zoom Slider Range</h4>
              <p className="text-xs text-slate-500 mb-3">Controls how far you can zoom in/out. Wider range = more flexibility.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Min (Broadest themes)</label>
                  <input
                    type="number"
                    value={themeExplorer.sliderMin}
                    onChange={(e) =>
                      setThemeExplorer((prev) => ({ ...prev, sliderMin: parseFloat(e.target.value) || 0.3 }))
                    }
                    step="0.05"
                    min="0.3"
                    max="0.6"
                    className="w-full px-3 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Max (Most specific)</label>
                  <input
                    type="number"
                    value={themeExplorer.sliderMax}
                    onChange={(e) =>
                      setThemeExplorer((prev) => ({ ...prev, sliderMax: parseFloat(e.target.value) || 0.95 }))
                    }
                    step="0.05"
                    min="0.7"
                    max="0.99"
                    className="w-full px-3 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Max Themes to Display */}
            <ThresholdSlider
              label="Max Themes to Show"
              description="Limit how many themes appear (largest first). Increase if you have many items and want to see more themes."
              value={themeExplorer.maxThemesToDisplay}
              defaultValue={DEFAULT_THEME_EXPLORER.maxThemesToDisplay}
              min={5}
              max={50}
              step={5}
              format={(v) => `${v} themes`}
              onChange={(value) =>
                setThemeExplorer((prev) => ({ ...prev, maxThemesToDisplay: value }))
              }
            />

            {/* Large Theme Threshold */}
            <ThresholdSlider
              label="Major Theme Threshold"
              description="Themes with this many items or more are highlighted as 'major' in stats. Helps identify your dominant interests."
              value={themeExplorer.largeThemeThreshold}
              defaultValue={DEFAULT_THEME_EXPLORER.largeThemeThreshold}
              min={2}
              max={20}
              step={1}
              format={(v) => `${v}+ items`}
              onChange={(value) =>
                setThemeExplorer((prev) => ({ ...prev, largeThemeThreshold: value }))
              }
            />
          </div>
        )}
      </div>

      {/* Theme Synthesis Section */}
      <div className={`border rounded-lg overflow-hidden ${isThemeSynthesisModified() ? 'border-amber-500/30' : 'border-slate-700/50'}`}>
        <button
          onClick={() => toggleSection("themeSynthesis")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">✨</span>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-slate-200">Theme Synthesis (AI Insights)</h3>
                {isThemeSynthesisModified() && (
                  <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">modified</span>
                )}
              </div>
              <p className="text-xs text-slate-500">Control AI-generated pattern insights</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "themeSynthesis" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "themeSynthesis" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="flex items-start justify-between">
              <div className="p-3 bg-violet-500/10 rounded-lg border border-violet-500/20 text-xs text-slate-400 flex-1">
                <strong className="text-violet-400">🎯 Job to be done:</strong> Generate AI insights about patterns in your themes.
                When you click a theme in Theme Explorer, AI reads the items and writes a summary of the pattern — what it represents, why it matters, and what to do next.
                <div className="mt-2 text-slate-500">
                  💡 <strong>Example output:</strong> &quot;This theme focuses on AI debugging tools. Your conversations show growing expertise in error handling. Consider building a debugging assistant as a project.&quot;
                </div>
              </div>
              {isThemeSynthesisModified() && (
                <button
                  onClick={() => setThemeSynthesis(DEFAULT_THEME_SYNTHESIS)}
                  className="ml-3 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors flex items-center gap-1"
                >
                  ↺ Reset All
                </button>
              )}
            </div>

            {/* Max Items to Synthesize */}
            <ThresholdSlider
              label="Max Items to Analyze"
              description="How many items from the theme to feed to the AI. More = richer insights, but costs more and may exceed context."
              value={themeSynthesis.maxItemsToSynthesize}
              defaultValue={DEFAULT_THEME_SYNTHESIS.maxItemsToSynthesize}
              min={5}
              max={30}
              step={1}
              format={(v) => `${v} items`}
              onChange={(value) =>
                setThemeSynthesis((prev) => ({ ...prev, maxItemsToSynthesize: value }))
              }
            />
            <div className="text-xs text-slate-500 -mt-2 ml-3">
              💡 <strong>Recommendation:</strong> 15 (default) balances depth and cost. Increase to 25+ for very broad themes.
            </div>

            {/* Max Tokens */}
            <ThresholdSlider
              label="Max Insight Length"
              description="How long the AI&apos;s synthesis can be. More tokens = more detailed analysis."
              value={themeSynthesis.maxTokens}
              defaultValue={DEFAULT_THEME_SYNTHESIS.maxTokens}
              min={200}
              max={2000}
              step={100}
              format={(v) => `${v} tokens`}
              onChange={(value) =>
                setThemeSynthesis((prev) => ({ ...prev, maxTokens: value }))
              }
            />

            {/* Max Description Length */}
            <ThresholdSlider
              label="Item Description Length"
              description="How much of each item&apos;s description to include when synthesizing. Longer = more context for the AI."
              value={themeSynthesis.maxDescriptionLength}
              defaultValue={DEFAULT_THEME_SYNTHESIS.maxDescriptionLength}
              min={50}
              max={500}
              step={50}
              format={(v) => `${v} chars`}
              onChange={(value) =>
                setThemeSynthesis((prev) => ({ ...prev, maxDescriptionLength: value }))
              }
            />
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
  defaultValue,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  defaultValue?: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (value: number) => void;
}) {
  // Check if value differs from default (with tolerance for floating point)
  const isModified = defaultValue !== undefined && Math.abs(value - defaultValue) > 0.001;
  
  return (
    <div className={`p-3 rounded-lg ${isModified ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-slate-800/30'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-slate-300">{label}</h4>
            {isModified && (
              <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded" title={`Default: ${format(defaultValue)}`}>
                modified
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-mono ${isModified ? 'text-amber-400' : 'text-slate-400'}`}>{format(value)}</span>
          {isModified && (
            <button
              onClick={() => onChange(defaultValue)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              title={`Reset to ${format(defaultValue)}`}
            >
              ↺
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${isModified ? 'bg-amber-500/30 accent-amber-500' : 'bg-slate-700 accent-amber-500'}`}
      />
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>{format(min)}</span>
        {isModified && defaultValue !== undefined && (
          <span className="text-amber-400/60">default: {format(defaultValue)}</span>
        )}
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

