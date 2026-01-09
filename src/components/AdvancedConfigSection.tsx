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

// v3: Generation Defaults
const DEFAULT_GENERATION: GenerationDefaults = {
  temperature: 0.2,
  deduplicationThreshold: 0.85,
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

      {/* Generation Defaults Section */}
      <div className="border border-slate-700/50 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection("generation")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">✨</span>
            <div className="text-left">
              <h3 className="font-medium text-slate-200">Generation Defaults</h3>
              <p className="text-xs text-slate-500">Control how AI creates ideas and insights</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "generation" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "generation" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20 text-xs text-slate-400">
              <strong className="text-blue-400">What is this?</strong> These settings control how the AI generates content. 
              Lower temperature = more focused & predictable. Higher = more creative & varied.
            </div>

            {/* Temperature */}
            <ThresholdSlider
              label="Generation Temperature"
              description="How creative should the AI be? Lower = focused/consistent, Higher = varied/creative"
              value={generationDefaults.temperature}
              min={0}
              max={1}
              step={0.1}
              format={(v) => v.toFixed(1)}
              onChange={(value) =>
                setGenerationDefaults((prev) => ({ ...prev, temperature: value }))
              }
            />

            {/* Deduplication Threshold */}
            <ThresholdSlider
              label="Duplicate Detection Sensitivity"
              description="How similar items need to be to count as duplicates. Higher = stricter (fewer removed)"
              value={generationDefaults.deduplicationThreshold}
              min={0.5}
              max={0.99}
              step={0.01}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(value) =>
                setGenerationDefaults((prev) => ({ ...prev, deduplicationThreshold: value }))
              }
            />

            {/* Max Tokens */}
            <ThresholdSlider
              label="Max Generation Length"
              description="Maximum length of generated content (in tokens, ~4 characters each)"
              value={generationDefaults.maxTokens}
              min={1000}
              max={8000}
              step={500}
              format={(v) => `${(v / 1000).toFixed(1)}K`}
              onChange={(value) =>
                setGenerationDefaults((prev) => ({ ...prev, maxTokens: value }))
              }
            />

            {/* Max Tokens Judge */}
            <ThresholdSlider
              label="Max Judging Length"
              description="Maximum length for quality scoring responses (usually shorter)"
              value={generationDefaults.maxTokensJudge}
              min={100}
              max={2000}
              step={100}
              format={(v) => `${v}`}
              onChange={(value) =>
                setGenerationDefaults((prev) => ({ ...prev, maxTokensJudge: value }))
              }
            />
          </div>
        )}
      </div>

      {/* Seek Mode Defaults Section */}
      <div className="border border-slate-700/50 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection("seek")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔍</span>
            <div className="text-left">
              <h3 className="font-medium text-slate-200">Seek Mode Defaults</h3>
              <p className="text-xs text-slate-500">Default settings when using &quot;Seek&quot; to find use cases</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "seek" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "seek" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20 text-xs text-slate-400">
              <strong className="text-purple-400">What is Seek?</strong> Seek searches your chat history for evidence 
              matching a query (like &quot;AI debugging&quot;). These settings control the defaults for that search.
            </div>

            {/* Days Back */}
            <ThresholdSlider
              label="Days to Search"
              description="How many days of chat history to look through"
              value={seekDefaults.daysBack}
              min={7}
              max={365}
              step={7}
              format={(v) => `${v} days`}
              onChange={(value) =>
                setSeekDefaults((prev) => ({ ...prev, daysBack: value }))
              }
            />

            {/* Top K */}
            <ThresholdSlider
              label="Maximum Results"
              description="Maximum number of matching conversations to return"
              value={seekDefaults.topK}
              min={1}
              max={50}
              step={1}
              format={(v) => `${v}`}
              onChange={(value) =>
                setSeekDefaults((prev) => ({ ...prev, topK: value }))
              }
            />

            {/* Min Similarity */}
            <ThresholdSlider
              label="Minimum Relevance"
              description="Only show results this relevant or higher. 0% = show all, 100% = exact match only"
              value={seekDefaults.minSimilarity}
              min={0}
              max={0.9}
              step={0.1}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(value) =>
                setSeekDefaults((prev) => ({ ...prev, minSimilarity: value }))
              }
            />
          </div>
        )}
      </div>

      {/* Quality Scoring Section */}
      <div className="border border-slate-700/50 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection("quality")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">⭐</span>
            <div className="text-left">
              <h3 className="font-medium text-slate-200">Quality Scoring Thresholds</h3>
              <p className="text-xs text-slate-500">How items get graded (A/B/C)</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "quality" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "quality" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-xs text-slate-400">
              <strong className="text-amber-400">How grading works:</strong> Each item gets a quality score (0-15). 
              Grade A = excellent (share-worthy), Grade B = good (needs polish), Grade C = okay (needs work).
            </div>

            {/* Tier A */}
            <ThresholdSlider
              label="Grade A Threshold"
              description="Score needed for Grade A (Excellent - ready to share)"
              value={qualityScoring.tierA}
              min={10}
              max={15}
              step={1}
              format={(v) => `≥ ${v}`}
              onChange={(value) =>
                setQualityScoring((prev) => ({ ...prev, tierA: value }))
              }
            />

            {/* Tier B */}
            <ThresholdSlider
              label="Grade B Threshold"
              description="Score needed for Grade B (Good - needs minor polish)"
              value={qualityScoring.tierB}
              min={5}
              max={12}
              step={1}
              format={(v) => `≥ ${v}`}
              onChange={(value) =>
                setQualityScoring((prev) => ({ ...prev, tierB: value }))
              }
            />

            {/* Tier C */}
            <ThresholdSlider
              label="Grade C Threshold"
              description="Score needed for Grade C (Okay - needs work)"
              value={qualityScoring.tierC}
              min={1}
              max={8}
              step={1}
              format={(v) => `≥ ${v}`}
              onChange={(value) =>
                setQualityScoring((prev) => ({ ...prev, tierC: value }))
              }
            />
          </div>
        )}
      </div>

      {/* Semantic Search Section */}
      <div className="border border-slate-700/50 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection("semantic")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🧠</span>
            <div className="text-left">
              <h3 className="font-medium text-slate-200">Semantic Search Settings</h3>
              <p className="text-xs text-slate-500">How the AI searches your chat history</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "semantic" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "semantic" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/20 text-xs text-slate-400">
              <strong className="text-cyan-400">What is semantic search?</strong> Unlike keyword search, 
              semantic search understands meaning. &quot;debugging tools&quot; will find chats about &quot;fixing errors&quot; 
              even if those exact words aren&apos;t used.
            </div>

            {/* Default Top K */}
            <ThresholdSlider
              label="Conversations to Consider"
              description="How many conversations to pull from memory for analysis"
              value={semanticSearch.defaultTopK}
              min={10}
              max={200}
              step={10}
              format={(v) => `${v}`}
              onChange={(value) =>
                setSemanticSearch((prev) => ({ ...prev, defaultTopK: value }))
              }
            />

            {/* Default Min Similarity */}
            <ThresholdSlider
              label="Relevance Threshold"
              description="Minimum relevance score for including a conversation. Lower = cast wider net"
              value={semanticSearch.defaultMinSimilarity}
              min={0}
              max={0.8}
              step={0.05}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(value) =>
                setSemanticSearch((prev) => ({ ...prev, defaultMinSimilarity: value }))
              }
            />
          </div>
        )}
      </div>

      {/* File Tracking Section */}
      <div className="border border-slate-700/50 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection("files")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">📁</span>
            <div className="text-left">
              <h3 className="font-medium text-slate-200">File Tracking</h3>
              <p className="text-xs text-slate-500">Configure folder scanning for implemented items</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "files" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "files" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-xs text-slate-400">
              <strong className="text-emerald-400">What is file tracking?</strong> When you point to a folder 
              (like your blog or code repo), Inspiration scans files to mark matching ideas as &quot;implemented&quot;. 
              This helps track which ideas you&apos;ve already built or written about.
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
              description="How similar an idea needs to be to a file to mark it as 'implemented'"
              value={fileTracking.implementedMatchThreshold}
              min={0.5}
              max={0.95}
              step={0.05}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(value) =>
                setFileTracking((prev) => ({ ...prev, implementedMatchThreshold: value }))
              }
            />
          </div>
        )}
      </div>

      {/* Theme Explorer Section */}
      <div className="border border-slate-700/50 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection("themeExplorer")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔭</span>
            <div className="text-left">
              <h3 className="font-medium text-slate-200">Theme Explorer</h3>
              <p className="text-xs text-slate-500">Pattern discovery and grouping settings</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "themeExplorer" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "themeExplorer" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-xs text-slate-400">
              <strong className="text-indigo-400">What is Theme Explorer?</strong> It groups your ideas and insights 
              into themes based on similarity. &quot;Zoom out&quot; to see broad patterns, &quot;zoom in&quot; for specific details.
            </div>

            {/* Default Zoom */}
            <ThresholdSlider
              label="Default Zoom Level"
              description="Where the slider starts when you open Theme Explorer (lower = broader themes)"
              value={themeExplorer.defaultZoom}
              min={0.4}
              max={0.95}
              step={0.05}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(value) =>
                setThemeExplorer((prev) => ({ ...prev, defaultZoom: value }))
              }
            />

            {/* Slider Range */}
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Zoom Slider Range</h4>
              <p className="text-xs text-slate-500 mb-3">Controls how far you can zoom in/out</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Min (Broad)</label>
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
                  <label className="text-xs text-slate-500 block mb-1">Max (Specific)</label>
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
              description="Limit how many themes appear in the list (largest shown first)"
              value={themeExplorer.maxThemesToDisplay}
              min={5}
              max={50}
              step={5}
              format={(v) => `${v}`}
              onChange={(value) =>
                setThemeExplorer((prev) => ({ ...prev, maxThemesToDisplay: value }))
              }
            />

            {/* Large Theme Threshold */}
            <ThresholdSlider
              label="Major Theme Threshold"
              description="Items needed to count as a 'major theme' in stats"
              value={themeExplorer.largeThemeThreshold}
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
      <div className="border border-slate-700/50 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection("themeSynthesis")}
          className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">✨</span>
            <div className="text-left">
              <h3 className="font-medium text-slate-200">Theme Synthesis (AI Insights)</h3>
              <p className="text-xs text-slate-500">Control AI-generated pattern insights</p>
            </div>
          </div>
          <span className="text-slate-400">{expandedSection === "themeSynthesis" ? "▼" : "▶"}</span>
        </button>

        {expandedSection === "themeSynthesis" && (
          <div className="p-4 space-y-4 border-t border-slate-700/50">
            <div className="p-3 bg-violet-500/10 rounded-lg border border-violet-500/20 text-xs text-slate-400">
              <strong className="text-violet-400">What is Theme Synthesis?</strong> When you click a theme in 
              Theme Explorer, AI analyzes the items and generates insights about the pattern. These settings 
              control the analysis.
            </div>

            {/* Max Items to Synthesize */}
            <ThresholdSlider
              label="Max Items to Analyze"
              description="How many items from the theme to include in AI analysis (more = more context, higher cost)"
              value={themeSynthesis.maxItemsToSynthesize}
              min={5}
              max={30}
              step={1}
              format={(v) => `${v}`}
              onChange={(value) =>
                setThemeSynthesis((prev) => ({ ...prev, maxItemsToSynthesize: value }))
              }
            />

            {/* Max Tokens */}
            <ThresholdSlider
              label="Max Insight Length"
              description="Maximum length of AI-generated insights (in tokens, ~4 chars each)"
              value={themeSynthesis.maxTokens}
              min={200}
              max={2000}
              step={100}
              format={(v) => `${v}`}
              onChange={(value) =>
                setThemeSynthesis((prev) => ({ ...prev, maxTokens: value }))
              }
            />

            {/* Max Description Length */}
            <ThresholdSlider
              label="Item Description Length"
              description="How much of each item's description to include (longer = more context)"
              value={themeSynthesis.maxDescriptionLength}
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

