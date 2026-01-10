"use client";

import { SeekDefaults } from "@/lib/types";
import { CollapsibleSection, ThresholdSlider, InfoBox } from "./ConfigHelpers";

export const DEFAULT_SEEK: SeekDefaults = {
  daysBack: 90,
  topK: 10,
  minSimilarity: 0.0,
};

interface SeekDefaultsSectionProps {
  seekDefaults: SeekDefaults;
  setSeekDefaults: React.Dispatch<React.SetStateAction<SeekDefaults>>;
  isExpanded: boolean;
  onToggle: () => void;
}

export function SeekDefaultsSection({
  seekDefaults,
  setSeekDefaults,
  isExpanded,
  onToggle,
}: SeekDefaultsSectionProps) {
  const isModified = () => {
    return (
      seekDefaults.daysBack !== DEFAULT_SEEK.daysBack ||
      seekDefaults.topK !== DEFAULT_SEEK.topK ||
      seekDefaults.minSimilarity !== DEFAULT_SEEK.minSimilarity
    );
  };

  return (
    <CollapsibleSection
      id="seek"
      icon="🔍"
      title="Seek Mode Defaults"
      description='Default settings when using "Seek" to find use cases'
      isExpanded={isExpanded}
      isModified={isModified()}
      onToggle={onToggle}
    >
      <div className="flex items-start justify-between">
        <InfoBox title="Job to be done" color="indigo">
          Find evidence in your chat history for things you want to build.
          Ask &quot;Have I worked on something like X before?&quot; and Seek finds relevant conversations, then synthesizes them into use cases.
          <div className="mt-2 text-slate-500">
            💡 <strong>Example:</strong> Query &quot;AI debugging assistant&quot; → finds all chats where you discussed debugging tools → synthesizes into structured use case examples.
          </div>
        </InfoBox>
        {isModified() && (
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
        💡 <strong>Recommendation:</strong> 90 days (default) covers recent work. Increase to 180-365 for older projects.
      </div>

      {/* Top K */}
      <ThresholdSlider
        label="Matches to Retrieve"
        description="How many similar conversations to find. More = broader search (may include less relevant). Fewer = focused results."
        value={seekDefaults.topK}
        defaultValue={DEFAULT_SEEK.topK}
        min={3}
        max={30}
        step={1}
        format={(v) => `${v} matches`}
        onChange={(value) =>
          setSeekDefaults((prev) => ({ ...prev, topK: value }))
        }
      />
      <div className="text-xs text-slate-500 -mt-2 ml-3">
        💡 <strong>Recommendation:</strong> 10 (default) balances coverage and relevance. Start low (5) for specific queries, increase for exploratory searches.
      </div>

      {/* Min Similarity */}
      <ThresholdSlider
        label="Minimum Relevance"
        description="Only return matches above this similarity score. Higher = stricter (may miss some). Lower = more permissive (may include noise)."
        value={seekDefaults.minSimilarity}
        defaultValue={DEFAULT_SEEK.minSimilarity}
        min={0}
        max={0.9}
        step={0.05}
        format={(v) => (v === 0 ? "None" : `${(v * 100).toFixed(0)}%`)}
        onChange={(value) =>
          setSeekDefaults((prev) => ({ ...prev, minSimilarity: value }))
        }
      />
      <div className="text-xs text-slate-500 -mt-2 ml-3">
        💡 <strong>Recommendation:</strong> Keep at 0 (none) unless you&apos;re getting too much noise. Then try 20-30%.
      </div>
    </CollapsibleSection>
  );
}
