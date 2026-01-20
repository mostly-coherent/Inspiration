"use client";

import { useState } from "react";

export type KGSource = "all" | "user" | "lenny";

interface KGSourceSelectorProps {
  value: KGSource;
  onChange: (source: KGSource) => void;
  className?: string;
}

/**
 * Toggle between viewing User KG, Lenny's KG, or Combined (all)
 */
export default function KGSourceSelector({
  value,
  onChange,
  className = "",
}: KGSourceSelectorProps) {
  return (
    <div className={`flex gap-1 bg-slate-800/50 p-1 rounded-lg ${className}`}>
      <button
        onClick={() => onChange("all")}
        className={`px-3 py-1.5 text-sm rounded transition-colors flex items-center gap-1.5 ${
          value === "all"
            ? "bg-indigo-600 text-white"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
        }`}
        title="View all entities from both sources"
      >
        <span className="text-xs">🔀</span>
        <span>Combined</span>
      </button>
      <button
        onClick={() => onChange("user")}
        className={`px-3 py-1.5 text-sm rounded transition-colors flex items-center gap-1.5 ${
          value === "user"
            ? "bg-emerald-600 text-white"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
        }`}
        title="View only entities from your chat history"
      >
        <span className="text-xs">👤</span>
        <span>My KG</span>
      </button>
      <button
        onClick={() => onChange("lenny")}
        className={`px-3 py-1.5 text-sm rounded transition-colors flex items-center gap-1.5 ${
          value === "lenny"
            ? "bg-purple-600 text-white"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
        }`}
        title="View only entities from Lenny's Podcast"
      >
        <span className="text-xs">🎙️</span>
        <span>Lenny&apos;s KG</span>
      </button>
    </div>
  );
}

/**
 * Hook for managing KG source state
 */
export function useKGSource(initialSource: KGSource = "all") {
  const [source, setSource] = useState<KGSource>(initialSource);
  return { source, setSource };
}

/**
 * Get display info for a source
 */
export function getSourceInfo(source: string | undefined): {
  icon: string;
  label: string;
  color: string;
  bgColor: string;
} {
  switch (source) {
    case "user":
      return {
        icon: "👤",
        label: "My KG",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/20",
      };
    case "lenny":
      return {
        icon: "🎙️",
        label: "Lenny",
        color: "text-purple-400",
        bgColor: "bg-purple-500/20",
      };
    case "both":
      return {
        icon: "🔗",
        label: "Both",
        color: "text-indigo-400",
        bgColor: "bg-indigo-500/20",
      };
    default:
      return {
        icon: "❓",
        label: "Unknown",
        color: "text-slate-400",
        bgColor: "bg-slate-500/20",
      };
  }
}

/**
 * Small badge showing entity source
 */
export function SourceBadge({
  source,
  size = "sm",
}: {
  source: string | undefined;
  size?: "xs" | "sm";
}) {
  const info = getSourceInfo(source);
  const sizeClasses = size === "xs" ? "text-xs px-1.5 py-0.5" : "text-xs px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded ${sizeClasses} ${info.bgColor} ${info.color}`}
      title={`Source: ${info.label}`}
    >
      <span>{info.icon}</span>
      {size === "sm" && <span>{info.label}</span>}
    </span>
  );
}
