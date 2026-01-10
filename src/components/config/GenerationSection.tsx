"use client";

import { GenerationDefaults } from "@/lib/types";
import { CollapsibleSection, ThresholdSlider, InfoBox } from "./ConfigHelpers";

export const DEFAULT_GENERATION: GenerationDefaults = {
  temperature: 0.5,
  deduplicationThreshold: 0.80,
  maxTokens: 4000,
  maxTokensJudge: 500,
};

interface GenerationSectionProps {
  generationDefaults: GenerationDefaults;
  setGenerationDefaults: React.Dispatch<React.SetStateAction<GenerationDefaults>>;
  isExpanded: boolean;
  onToggle: () => void;
}

export function GenerationSection({
  generationDefaults,
  setGenerationDefaults,
  isExpanded,
  onToggle,
}: GenerationSectionProps) {
  const isModified = () => {
    return (
      generationDefaults.temperature !== DEFAULT_GENERATION.temperature ||
      generationDefaults.deduplicationThreshold !== DEFAULT_GENERATION.deduplicationThreshold ||
      generationDefaults.maxTokens !== DEFAULT_GENERATION.maxTokens ||
      generationDefaults.maxTokensJudge !== DEFAULT_GENERATION.maxTokensJudge
    );
  };

  return (
    <CollapsibleSection
      id="generation"
      icon="✨"
      title="Generation Defaults"
      description="Control how AI creates ideas and insights"
      isExpanded={isExpanded}
      isModified={isModified()}
      onToggle={onToggle}
    >
      <div className="flex items-start justify-between">
        <InfoBox title="Job to be done" color="indigo">
          Control how the AI generates ideas and insights from your chat history.
          These are the most impactful settings — they directly affect the quality and variety of your results.
        </InfoBox>
        {isModified() && (
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
    </CollapsibleSection>
  );
}
