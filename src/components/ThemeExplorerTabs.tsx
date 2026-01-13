"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type ThemeTab = "patterns" | "unexplored" | "counterIntuitive";

interface TabConfig {
  id: ThemeTab;
  label: string;
  icon: string;
  description: string;
  status: "ready" | "coming_soon" | "experimental";
}

const TABS: TabConfig[] = [
  {
    id: "patterns",
    label: "Patterns",
    icon: "🎨",
    description: "Cluster what EXISTS in your Library",
    status: "ready",
  },
  {
    id: "counterIntuitive",
    label: "Counter-Intuitive",
    icon: "🔄",
    description: "Reflection prompts for GOOD OPPOSITES",
    status: "ready",  // ✅ Phase 3 complete
  },
  {
    id: "unexplored",
    label: "Unexplored",
    icon: "🧭",
    description: "Find what's MISSING from Library but in Memory",
    status: "experimental",  // 🚧 Work in progress - value unclear
  },
];

interface ThemeExplorerTabsProps {
  activeTab: ThemeTab;
  onTabChange?: (tab: ThemeTab) => void;
}

export function ThemeExplorerTabs({ activeTab, onTabChange }: ThemeExplorerTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleTabClick = (tab: ThemeTab) => {
    // Update URL with new tab
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`/themes?${params.toString()}`);
    
    // Callback if provided
    onTabChange?.(tab);
  };

  return (
    <div className="border-b border-slate-800/50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const isComingSoon = tab.status === "coming_soon";
            const isExperimental = tab.status === "experimental";
            
            return (
              <button
                key={tab.id}
                onClick={() => !isComingSoon && handleTabClick(tab.id)}
                disabled={isComingSoon}
                className={`
                  relative px-5 py-4 text-sm font-medium transition-all duration-200
                  ${isActive
                    ? "text-white border-b-2 border-indigo-500"
                    : isComingSoon
                      ? "text-slate-600 cursor-not-allowed"
                      : "text-slate-400 hover:text-slate-200 border-b-2 border-transparent hover:border-slate-600"
                  }
                `}
                aria-current={isActive ? "page" : undefined}
                aria-disabled={isComingSoon}
                title={isComingSoon ? "Coming soon" : isExperimental ? `${tab.description} (experimental feature)` : tab.description}
              >
                <span className="flex items-center gap-2">
                  <span className={isComingSoon ? "opacity-50" : ""}>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {isComingSoon && (
                    <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full">
                      Soon
                    </span>
                  )}
                  {isExperimental && (
                    <span className="text-[10px] bg-amber-900/50 text-amber-400 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      🚧 WIP
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function getTabFromSearchParams(searchParams: URLSearchParams): ThemeTab {
  const tab = searchParams.get("tab");
  if (tab === "patterns" || tab === "unexplored" || tab === "counterIntuitive") {
    return tab;
  }
  return "patterns"; // Default
}
