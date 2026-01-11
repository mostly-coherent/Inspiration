"use client";

import { memo, useState } from "react";
import { Item } from "@/lib/types";

interface ItemCardProps {
  item: Item;
  isExpanded?: boolean;
}

// Format date for memory jog (e.g., "Dec 19" or "Dec 19, 2025")
function formatDateShort(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const isThisYear = date.getFullYear() === now.getFullYear();
    const options: Intl.DateTimeFormatOptions = isThisYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
    return date.toLocaleDateString("en-US", options);
  } catch {
    return dateStr;
  }
}

// Calculate days ago for recency indicator
function getDaysAgo(dateStr: string): number {
  if (!dateStr) return 999;
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return 999;
  }
}

// Get recency label and color
function getRecencyInfo(daysAgo: number): { label: string; color: string } {
  if (daysAgo <= 1) return { label: "Today", color: "text-emerald-400" };
  if (daysAgo <= 7) return { label: `${daysAgo}d ago`, color: "text-emerald-400" };
  if (daysAgo <= 14) return { label: `${daysAgo}d ago`, color: "text-blue-400" };
  if (daysAgo <= 30) return { label: `${daysAgo}d ago`, color: "text-slate-400" };
  if (daysAgo <= 90) return { label: `${Math.floor(daysAgo / 7)}w ago`, color: "text-slate-500" };
  return { label: `${Math.floor(daysAgo / 30)}mo ago`, color: "text-slate-600" };
}

export const ItemCard = memo(function ItemCard({
  item,
  isExpanded: initialExpanded = false,
}: ItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const title = item.title || "Untitled";
  const itemType = item.itemType || "idea";
  const typeEmoji = itemType === "idea" ? "💡" : itemType === "insight" ? "✨" : "🔍";
  
  const daysAgo = getDaysAgo(item.lastSeen);
  const recency = getRecencyInfo(daysAgo);
  
  // Memory jog: First seen to last seen
  const firstSeenFormatted = formatDateShort(item.firstSeen);
  const lastSeenFormatted = formatDateShort(item.lastSeen);
  const dateRange = firstSeenFormatted === lastSeenFormatted
    ? firstSeenFormatted
    : `${firstSeenFormatted} → ${lastSeenFormatted}`;

  return (
    <div
      className="group rounded-xl border transition-all duration-200 border-white/10 bg-gradient-to-br from-white/5 to-transparent hover:border-white/20"
    >
      {/* Main Content */}
      <div className="p-4">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            {/* Title with type emoji */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg">{typeEmoji}</span>
              <h3 className="font-semibold text-white truncate">{title}</h3>
            </div>
          </div>
          
          {/* Recency Badge */}
          <div className={`flex items-center gap-1 text-xs ${recency.color} whitespace-nowrap`}>
            <span className="opacity-60">●</span>
            {recency.label}
          </div>
        </div>

        {/* Memory Jog Bar */}
        <div className="flex items-center gap-3 mb-3 text-xs">
          {/* Date Range */}
          <div className="flex items-center gap-1 text-slate-400">
            <span className="opacity-50">📅</span>
            <span>{dateRange}</span>
          </div>
          
          {/* Occurrence Count */}
          <div className="flex items-center gap-1 text-slate-400">
            <span className="opacity-50">💬</span>
            <span>{item.occurrence || 1}x mentioned</span>
          </div>
        </div>

        {/* Description Preview */}
        {item.description && (
          <div className="text-sm text-slate-300 mb-2">
            {isExpanded ? (
              <div className="whitespace-pre-wrap">{item.description}</div>
            ) : (
              <div className="line-clamp-2">
                {item.description.length > 200 
                  ? item.description.slice(0, 200) + "..." 
                  : item.description}
              </div>
            )}
          </div>
        )}

        {/* Expand/Collapse */}
        {item.description?.length > 200 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-2 text-xs text-inspiration-ideas hover:text-inspiration-ideas/80 transition-colors"
          >
            {isExpanded ? "Show less ↑" : "Show more ↓"}
          </button>
        )}
      </div>

    </div>
  );
});

