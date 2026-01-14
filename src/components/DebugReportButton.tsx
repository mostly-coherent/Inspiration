"use client";

import { useState, useCallback } from "react";

/**
 * DebugReportButton - One-click copy of diagnostic info for troubleshooting.
 * 
 * Used in Settings page and error screens. Collects non-sensitive system info
 * that helps debug issues without exposing chat content, API keys, or paths.
 */

interface Props {
  variant?: "button" | "link";
  className?: string;
}

export function DebugReportButton({ variant = "button", className = "" }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "copied" | "error">("idle");
  
  const copyReport = useCallback(async () => {
    setStatus("loading");
    
    try {
      const res = await fetch("/api/debug-report");
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || "Failed to generate report");
      }
      
      await navigator.clipboard.writeText(data.formatted);
      setStatus("copied");
      
      // Reset after 3 seconds
      setTimeout(() => setStatus("idle"), 3000);
    } catch (e) {
      console.error("Failed to copy debug report:", e);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }, []);
  
  const statusText = {
    idle: "📋 Copy Debug Report",
    loading: "⏳ Generating...",
    copied: "✅ Copied!",
    error: "❌ Failed",
  };
  
  if (variant === "link") {
    return (
      <button
        onClick={copyReport}
        disabled={status === "loading"}
        className={`text-sm text-slate-400 hover:text-slate-300 underline transition-colors ${className}`}
      >
        {statusText[status]}
      </button>
    );
  }
  
  return (
    <button
      onClick={copyReport}
      disabled={status === "loading"}
      className={`
        px-4 py-2 rounded-lg text-sm font-medium transition-all
        ${status === "idle" ? "bg-slate-700 hover:bg-slate-600 text-white" : ""}
        ${status === "loading" ? "bg-slate-700 text-slate-400 cursor-wait" : ""}
        ${status === "copied" ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30" : ""}
        ${status === "error" ? "bg-red-600/20 text-red-400 border border-red-500/30" : ""}
        ${className}
      `}
    >
      {statusText[status]}
    </button>
  );
}

/**
 * DebugReportSection - A full section with explanation for use in Settings page.
 */
export function DebugReportSection() {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white flex items-center gap-2">
            <span>🔧</span> Troubleshooting
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            If you're having issues, copy this debug report to share with support.
          </p>
        </div>
        <DebugReportButton />
      </div>
      
      <div className="bg-slate-900/50 rounded-lg p-3 text-xs text-slate-500">
        <p className="font-medium text-slate-400 mb-2">What's included:</p>
        <ul className="space-y-1">
          <li>• System info (OS, Node/Python versions)</li>
          <li>• Database detection status and size</li>
          <li>• Configuration status (not values)</li>
          <li>• Theme Map status</li>
          <li>• Performance metrics</li>
        </ul>
        <p className="mt-2 text-emerald-400/70">
          ✓ No chat content, API keys, or file paths are included.
        </p>
      </div>
    </div>
  );
}
