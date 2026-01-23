"use client";

import { LLMProviderType } from "@/lib/types";

// Default LLM models per provider
export const DEFAULT_MODELS: Record<LLMProviderType, string[]> = {
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
};

// Embedding models (OpenAI only for now)
export const EMBEDDING_MODELS = [
  "text-embedding-3-small",
  "text-embedding-3-large",
  "text-embedding-ada-002",
];

// LLM Task Editor Component
interface LLMTaskEditorProps {
  label: string;
  description: string;
  config: { provider: LLMProviderType; model: string };
  onChange: (field: "provider" | "model", value: string) => void;
  models?: Record<LLMProviderType, string[]>;
}

export function LLMTaskEditor({
  label,
  description,
  config,
  onChange,
  models = DEFAULT_MODELS,
}: LLMTaskEditorProps) {
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
interface ThresholdSliderProps {
  label: string;
  description: string;
  value: number;
  defaultValue?: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (value: number) => void;
}

export function ThresholdSlider({
  label,
  description,
  value,
  defaultValue,
  min,
  max,
  step,
  format,
  onChange,
}: ThresholdSliderProps) {
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

// Collapsible Section Header Component
interface CollapsibleSectionProps {
  id: string;
  icon: string;
  title: string;
  description: string;
  isExpanded: boolean;
  isModified?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function CollapsibleSection({
  id,
  icon,
  title,
  description,
  isExpanded,
  isModified = false,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className={`border rounded-lg overflow-hidden ${isModified ? 'border-amber-500/30' : 'border-slate-700/50'}`}>
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={`${id}-content`}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-slate-200">{title}</h3>
              {isModified && (
                <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">modified</span>
              )}
            </div>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
        </div>
        <span className="text-slate-400">{isExpanded ? "▼" : "▶"}</span>
      </button>

      {isExpanded && (
        <div id={`${id}-content`} className="p-4 space-y-4 border-t border-slate-700/50">
          {children}
        </div>
      )}
    </div>
  );
}

// Info Box Component
interface InfoBoxProps {
  icon?: string;
  title: string;
  children: React.ReactNode;
  color?: "indigo" | "emerald" | "amber" | "slate";
}

export function InfoBox({ icon = "🎯", title, children, color = "indigo" }: InfoBoxProps) {
  const colorClasses = {
    indigo: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400",
    emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    amber: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    slate: "bg-slate-500/10 border-slate-500/20 text-slate-300",
  };

  return (
    <div className={`p-3 rounded-lg border text-xs text-slate-400 ${colorClasses[color]}`}>
      <strong className={colorClasses[color].split(" ").slice(2).join(" ")}>{icon} {title}:</strong> {children}
    </div>
  );
}
