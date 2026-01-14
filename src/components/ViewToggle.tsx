"use client";

import { memo } from "react";

export type ViewMode = "library" | "comprehensive";

interface ViewToggleProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export const ViewToggle = memo(function ViewToggle({
  currentView,
  onViewChange,
}: ViewToggleProps) {
  return (
    <div className="flex items-center justify-center gap-1 p-1 bg-adobe-gray-800/50 rounded-lg border border-adobe-gray-700/50">
      <button
        onClick={() => onViewChange("library")}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
          currentView === "library"
            ? "bg-inspiration-ideas text-white shadow-lg"
            : "text-adobe-gray-400 hover:text-white hover:bg-adobe-gray-700/50"
        }`}
        aria-pressed={currentView === "library"}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        Library
      </button>
      <button
        onClick={() => onViewChange("comprehensive")}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
          currentView === "comprehensive"
            ? "bg-inspiration-insights text-white shadow-lg"
            : "text-adobe-gray-400 hover:text-white hover:bg-adobe-gray-700/50"
        }`}
        aria-pressed={currentView === "comprehensive"}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        Generate
      </button>
    </div>
  );
});

