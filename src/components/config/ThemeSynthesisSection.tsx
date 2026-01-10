"use client";

import { ThemeSynthesisConfig } from "@/lib/types";
import { CollapsibleSection, ThresholdSlider, InfoBox } from "./ConfigHelpers";

export const DEFAULT_THEME_SYNTHESIS: ThemeSynthesisConfig = {
  maxItemsToSynthesize: 15,
  maxTokens: 800,
  maxDescriptionLength: 200,
};

interface ThemeSynthesisSectionProps {
  themeSynthesis: ThemeSynthesisConfig;
  setThemeSynthesis: React.Dispatch<React.SetStateAction<ThemeSynthesisConfig>>;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ThemeSynthesisSection({
  themeSynthesis,
  setThemeSynthesis,
  isExpanded,
  onToggle,
}: ThemeSynthesisSectionProps) {
  const isModified = () => {
    return (
      themeSynthesis.maxItemsToSynthesize !== DEFAULT_THEME_SYNTHESIS.maxItemsToSynthesize ||
      themeSynthesis.maxTokens !== DEFAULT_THEME_SYNTHESIS.maxTokens ||
      themeSynthesis.maxDescriptionLength !== DEFAULT_THEME_SYNTHESIS.maxDescriptionLength
    );
  };

  return (
    <CollapsibleSection
      id="themeSynthesis"
      icon="💡"
      title="Theme Synthesis"
      description="AI-powered theme analysis settings"
      isExpanded={isExpanded}
      isModified={isModified()}
      onToggle={onToggle}
    >
      <div className="flex items-start justify-between">
        <InfoBox title="Job to be done" color="indigo">
          Generate AI insights from a cluster of related items. When you click a theme in Theme Explorer, the AI analyzes the items and writes a synthesis — patterns, connections, and recommendations.
          <div className="mt-2 text-slate-500">
            💡 <strong>Cost note:</strong> Synthesis uses your Generation LLM. Larger themes with more items = higher cost per synthesis.
          </div>
        </InfoBox>
        {isModified() && (
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
        label="Items per Synthesis"
        description="Max items to include when synthesizing a theme. More = richer context, but more expensive. Fewer = cheaper, may miss nuance."
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
        description="How long the AI's synthesis can be. More tokens = more detailed analysis."
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
        description="How much of each item's description to include when synthesizing. Longer = more context for the AI."
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
    </CollapsibleSection>
  );
}
