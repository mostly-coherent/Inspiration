"use client";

import { TimePreset } from "@/lib/types";
import { CollapsibleSection } from "./ConfigHelpers";

export const DEFAULT_TIME_PRESETS: TimePreset[] = [
  { id: "6h", label: "Last 6 hours", days: 0, hours: 6, isCustom: true },
  { id: "12h", label: "Last 12 hours", days: 0, hours: 12, isCustom: true },
  { id: "3d", label: "Last 3 days", days: 3, isCustom: true },
  { id: "7d", label: "Last week", days: 7, isCustom: true },
];

interface TimePresetsSectionProps {
  timePresets: TimePreset[];
  setTimePresets: React.Dispatch<React.SetStateAction<TimePreset[]>>;
  isExpanded: boolean;
  onToggle: () => void;
}

export function TimePresetsSection({
  timePresets,
  setTimePresets,
  isExpanded,
  onToggle,
}: TimePresetsSectionProps) {
  return (
    <CollapsibleSection
      id="presets"
      icon="⏱️"
      title="Custom Time Presets"
      description="Add custom time windows (6h, 12h, etc.)"
      isExpanded={isExpanded}
      onToggle={onToggle}
    >
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
    </CollapsibleSection>
  );
}
