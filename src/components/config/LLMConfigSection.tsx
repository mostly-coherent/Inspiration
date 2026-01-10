"use client";

import { AdvancedLLMConfig, LLMProviderType } from "@/lib/types";
import { CollapsibleSection, LLMTaskEditor, InfoBox, EMBEDDING_MODELS, DEFAULT_MODELS } from "./ConfigHelpers";

interface LLMConfigSectionProps {
  llmConfig: AdvancedLLMConfig;
  setLlmConfig: React.Dispatch<React.SetStateAction<AdvancedLLMConfig>>;
  isExpanded: boolean;
  onToggle: () => void;
}

export function LLMConfigSection({
  llmConfig,
  setLlmConfig,
  isExpanded,
  onToggle,
}: LLMConfigSectionProps) {
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
        // Auto-select first model when provider changes
        ...(field === "provider" && {
          model: DEFAULT_MODELS[value as LLMProviderType]?.[0] || prev[task].model,
        }),
      },
    }));
  };

  return (
    <CollapsibleSection
      id="llm"
      icon="🤖"
      title="LLM Task Assignments"
      description="Configure which model to use for each task"
      isExpanded={isExpanded}
      onToggle={onToggle}
    >
      <InfoBox title="Job to be done" color="indigo">
        Choose which AI models handle different tasks.
        Smarter models (Claude, GPT-4o) give better results but cost more. Cheaper models (GPT-3.5) are faster and more affordable.
        <div className="mt-2 text-slate-500">
          💡 <strong>Recommendation:</strong> Use Claude for generation (best quality), GPT-3.5 for judging/compression (good enough, much cheaper).
        </div>
      </InfoBox>

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
    </CollapsibleSection>
  );
}
