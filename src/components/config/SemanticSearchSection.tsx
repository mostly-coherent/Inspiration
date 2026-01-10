"use client";

import { SemanticSearchDefaults } from "@/lib/types";
import { CollapsibleSection, ThresholdSlider, InfoBox } from "./ConfigHelpers";

export const DEFAULT_SEMANTIC: SemanticSearchDefaults = {
  defaultTopK: 50,
  defaultMinSimilarity: 0.3,
};

interface SemanticSearchSectionProps {
  semanticSearch: SemanticSearchDefaults;
  setSemanticSearch: React.Dispatch<React.SetStateAction<SemanticSearchDefaults>>;
  isExpanded: boolean;
  onToggle: () => void;
}

export function SemanticSearchSection({
  semanticSearch,
  setSemanticSearch,
  isExpanded,
  onToggle,
}: SemanticSearchSectionProps) {
  const isModified = () => {
    return (
      semanticSearch.defaultTopK !== DEFAULT_SEMANTIC.defaultTopK ||
      semanticSearch.defaultMinSimilarity !== DEFAULT_SEMANTIC.defaultMinSimilarity
    );
  };

  return (
    <CollapsibleSection
      id="semantic"
      icon="🧠"
      title="Semantic Search Settings"
      description="How the AI searches your chat history"
      isExpanded={isExpanded}
      isModified={isModified()}
      onToggle={onToggle}
    >
      <div className="flex items-start justify-between">
        <InfoBox title="Job to be done" color="indigo">
          Find relevant conversations in your chat history, even when you don&apos;t remember exact keywords.
          Unlike keyword search, semantic search understands meaning — &quot;fixing bugs&quot; will find chats about &quot;debugging errors&quot;.
          <div className="mt-2 text-slate-500">
            💡 <strong>How it&apos;s used:</strong> Powers both Generate (finding source material) and Seek (finding evidence). These settings control the defaults.
          </div>
        </InfoBox>
        {isModified() && (
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
    </CollapsibleSection>
  );
}
