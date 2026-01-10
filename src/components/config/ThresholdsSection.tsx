"use client";

import { GlobalThresholds } from "@/lib/types";
import { CollapsibleSection, ThresholdSlider, InfoBox } from "./ConfigHelpers";

// Default values for comparison
export const DEFAULT_THRESHOLDS: GlobalThresholds = {
  judgeTemperature: 0.0,
  compressionTokenThreshold: 10000,
  compressionDateThreshold: 7,
};

interface ThresholdsSectionProps {
  thresholds: GlobalThresholds;
  setThresholds: React.Dispatch<React.SetStateAction<GlobalThresholds>>;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ThresholdsSection({
  thresholds,
  setThresholds,
  isExpanded,
  onToggle,
}: ThresholdsSectionProps) {
  const isModified = () => {
    return (
      thresholds.judgeTemperature !== DEFAULT_THRESHOLDS.judgeTemperature ||
      thresholds.compressionTokenThreshold !== DEFAULT_THRESHOLDS.compressionTokenThreshold ||
      thresholds.compressionDateThreshold !== DEFAULT_THRESHOLDS.compressionDateThreshold
    );
  };

  return (
    <CollapsibleSection
      id="thresholds"
      icon="⚙️"
      title="Global Thresholds"
      description="Fine-tune similarity, temperature, and limits"
      isExpanded={isExpanded}
      isModified={isModified()}
      onToggle={onToggle}
    >
      <div className="flex items-start justify-between">
        <InfoBox title="Job to be done" color="slate">
          Fine-tune internal operations for performance vs. cost trade-offs.
          <div className="mt-2 text-slate-500">
            💡 <strong>When to change:</strong> Most users never need to touch these. Only adjust if you&apos;re hitting rate limits or want to optimize costs.
          </div>
        </InfoBox>
        {isModified() && (
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
    </CollapsibleSection>
  );
}
