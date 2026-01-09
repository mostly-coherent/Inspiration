"use client";

import { useState, useEffect, memo, useMemo, useCallback } from "react";
import { copyToClipboard, downloadFile } from "@/lib/utils";
import { Item, Category } from "@/lib/types";
import { LoadingSpinner } from "./LoadingSpinner";
import { SectionErrorBoundary } from "./SectionErrorBoundary";
import { ItemCard } from "./ItemCard";
import { LibrarySearch } from "./LibrarySearch";

type ViewMode = "items" | "categories";

interface BanksOverviewProps {
  compact?: boolean;
}

export const BanksOverview = memo(function BanksOverview({ compact = false }: BanksOverviewProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<{
    totalItems: number;
    totalCategories: number;
    byMode: Record<string, number>;
    byTheme: Record<string, number>;
    implemented: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true); // v3: Default expanded for two-panel layout
  const [viewMode, setViewMode] = useState<ViewMode>("items");
  const [error, setError] = useState<string | null>(null);

  // Load items on mount
  useEffect(() => {
    loadItems();
  }, []);

  // Category lookup map for ItemCard
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((cat) => {
      cat.itemIds.forEach((itemId) => {
        map.set(itemId, cat);
      });
    });
    return map;
  }, [categories]);

  // Callbacks for LibrarySearch
  const handleFilteredItemsChange = useCallback((items: Item[]) => {
    setFilteredItems(items);
  }, []);

  const handleFilteredCategoriesChange = useCallback((categories: Category[]) => {
    setFilteredCategories(categories);
  }, []);

  const loadItems = async () => {
    setError(null);
    setLoading(true);
    try {
      // Load all items and categories (filtering done client-side via LibrarySearch)
      const params = new URLSearchParams({
        view: "items",
        // No implemented filter - include all statuses, filter client-side
      });
      
      const res = await fetch(`/api/items?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const loadedItems = data.items || [];
          const loadedCategories = data.categories || [];
          setItems(loadedItems);
          setCategories(loadedCategories);
          setStats(data.stats);
          // Initial filtered state is all items
          setFilteredItems(loadedItems);
          setFilteredCategories(loadedCategories);
        } else {
          setError(data.error || "Failed to load items");
        }
      } else {
        setError(`Failed to load items: HTTP ${res.status}`);
      }
    } catch (err) {
      setError(`Failed to load items: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const downloadMarkdown = (content: string) => {
    const filename = viewMode === "items" ? "ITEMS_BANK.md" : "CATEGORIES_BANK.md";
    downloadFile(content, filename);
  };

  const generateMarkdown = (): string => {
    if (viewMode === "items") {
      return generateItemsMarkdown(filteredItems);
    } else {
      return generateCategoriesMarkdown(filteredCategories, filteredItems);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const generateItemsMarkdown = (_items?: Item[]): string => {
    const lines = ["# Items Library", ""];
    const implementedCount = items.filter((item) => 
      item.status === "implemented" || item.status === "posted" || item.implemented
    ).length;
    lines.push(`> **${items.length} items** — ${implementedCount} implemented/posted`);
    lines.push("");
    lines.push("---");
    lines.push("");

    // Separate by status
    const active = items.filter((item) => 
      (item.status === "active" || !item.status) && !item.implemented
    );
    const completed = items.filter((item) => 
      item.status === "implemented" || item.status === "posted" || item.implemented
    );

    if (active.length > 0) {
      lines.push("## Active Items");
      lines.push("");
      active.forEach((item, idx) => {
        // Use unified structure: title + description
        const title = item.title || item.name || item.content?.title || "Untitled";
        const itemType = item.itemType || item.mode || "unknown";
        const typeLabel = itemType.charAt(0).toUpperCase() + itemType.slice(1);
        
        lines.push(`### ${idx + 1}. ${title}`);
        lines.push("");
        lines.push(`**Type:** ${typeLabel}`);
        lines.push("");
        
        // Description (unified field)
        const description = item.description || "";
        if (description) {
          lines.push(description);
          lines.push("");
        } else {
          // Fallback to legacy content fields
          if (item.content?.problem) {
            lines.push(`**Problem:** ${item.content.problem}`);
            lines.push("");
          }
          if (item.content?.solution) {
            lines.push(`**Solution:** ${item.content.solution}`);
            lines.push("");
          }
          if (item.content?.hook) {
            lines.push(`**Hook:** ${item.content.hook}`);
            lines.push("");
          }
          if (item.content?.insight) {
            lines.push(`**Insight:** ${item.content.insight}`);
            lines.push("");
          }
        }
        
        // Tags
        const tags = item.tags || [];
        if (tags.length > 0) {
          lines.push(`**Tags:** ${tags.join(", ")}`);
          lines.push("");
        }
        
        lines.push(`*Occurrence: ${item.occurrence}x | First seen: ${item.firstSeen} | Last seen: ${item.lastSeen}*`);
        lines.push("");
        lines.push("---");
        lines.push("");
      });
    }

    if (completed.length > 0) {
      lines.push("## Completed Items");
      lines.push("");
      completed.forEach((item, idx) => {
        const title = item.title || item.name || item.content?.title || "Untitled";
        const status = item.status || (item.implemented ? "implemented" : "active");
        const statusEmoji = status === "posted" ? "📝" : "✅";
        lines.push(`### ${idx + 1}. ${title} ${statusEmoji}`);
        lines.push("");
        if (item.implementedSource) {
          lines.push(`*Source: ${item.implementedSource}*`);
          lines.push("");
        }
        lines.push("---");
        lines.push("");
      });
    }

    return lines.join("\n");
  };

  const generateCategoriesMarkdown = (categories: Category[], items: Item[]): string => {
    const lines = ["# Categories Library", ""];
    lines.push(`> **${categories.length} categories**`);
    lines.push("");
    lines.push("---");
    lines.push("");

    categories.forEach((category, idx) => {
      lines.push(`## ${idx + 1}. ${category.name}`);
      lines.push("");
      lines.push(`*Theme: ${category.theme} | Mode: ${category.mode} | Items: ${category.itemIds.length}*`);
      lines.push("");
      
      // List items in category
      const categoryItems = items.filter((item) => category.itemIds.includes(item.id));
      categoryItems.forEach((item) => {
        lines.push(`- **${item.name}** (${item.occurrence}x)`);
      });
      
      lines.push("");
      lines.push("---");
      lines.push("");
    });

    return lines.join("\n");
  };

  // v3: Filters are now handled by LibrarySearch component

  if (loading && !stats) {
    return (
      <section className="glass-card p-6 space-y-4 mt-8">
        <div className="flex items-center gap-2 text-adobe-gray-400">
          <LoadingSpinner />
          <span className="text-sm">Loading library...</span>
        </div>
      </section>
    );
  }
  if (!stats && !error) return null;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // COMPACT MODE: Show minimal preview for sidebar
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (compact && stats) {
    // Get top 5 recent items
    const recentItems = [...filteredItems]
      .sort((a, b) => new Date(b.lastSeen || b.firstSeen || "").getTime() - new Date(a.lastSeen || a.firstSeen || "").getTime())
      .slice(0, 5);
    
    return (
      <div className="space-y-4">
        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center p-2 bg-slate-800/50 rounded-lg">
            <div className="text-lg font-bold text-white">{stats.totalItems}</div>
            <div className="text-slate-500">items</div>
          </div>
          <div className="text-center p-2 bg-slate-800/50 rounded-lg">
            <div className="text-lg font-bold text-slate-300">{stats.totalCategories}</div>
            <div className="text-slate-500">themes</div>
          </div>
          <div className="text-center p-2 bg-slate-800/50 rounded-lg">
            <div className="text-lg font-bold text-emerald-400">{stats.implemented}</div>
            <div className="text-slate-500">done</div>
          </div>
        </div>
        
        {/* Recent Items Preview */}
        <div className="space-y-2">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Recent</div>
          {recentItems.map((item) => (
            <div 
              key={item.id}
              className="p-2 bg-slate-800/30 rounded-lg text-sm border-l-2 border-indigo-500/50 hover:bg-slate-800/50 transition-colors"
            >
              <div className="text-white truncate">{item.title || item.name}</div>
              <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                <span className="capitalize">{item.itemType}</span>
                {item.quality && <span className={`${item.quality === "A" ? "text-emerald-400" : item.quality === "B" ? "text-amber-400" : "text-slate-400"}`}>{item.quality}</span>}
              </div>
            </div>
          ))}
          {recentItems.length === 0 && (
            <div className="text-sm text-slate-500 italic">No items yet. Run Generate!</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <SectionErrorBoundary sectionName="Library">
      <section className="glass-card p-4 lg:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base lg:text-lg font-medium text-adobe-gray-300 flex items-center gap-2">
          <span>📚</span> Your Library
        </h2>
        <div className="flex items-center gap-2">
          {error && (
            <button
              onClick={() => loadItems()}
              className="text-sm text-inspiration-ideas hover:text-inspiration-ideas/80 transition-colors"
              aria-label="Retry loading library"
            >
              Retry
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-adobe-gray-400 hover:text-white transition-colors lg:hidden"
            aria-label={expanded ? "Collapse library" : "Expand library"}
          >
            <svg className={`w-5 h-5 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
      
      {error && (
        <div 
          id="bank-error"
          className="p-3 bg-red-400/10 border border-red-400/30 rounded-lg text-sm text-red-400" 
          role="alert"
          aria-live="polite"
        >
          {error}
        </div>
      )}
      
      {stats && (
        <>
          {/* Stats Summary - Compact for sidebar */}
          <div className="grid grid-cols-4 gap-2 text-sm">
            <div className="p-2 bg-black/20 rounded-lg text-center">
              <div className="text-white font-medium">{stats.totalItems}</div>
              <div className="text-adobe-gray-500 text-xs">Items</div>
            </div>
            <div className="p-2 bg-black/20 rounded-lg text-center">
              <div className="text-white font-medium">{stats.totalCategories}</div>
              <div className="text-adobe-gray-500 text-xs">Themes</div>
            </div>
            <div className="p-2 bg-black/20 rounded-lg text-center">
              <div className="text-emerald-400 font-medium">{stats.implemented}</div>
              <div className="text-adobe-gray-500 text-xs">Done</div>
            </div>
            <div className="p-2 bg-black/20 rounded-lg text-center">
              <div className="text-amber-400 font-medium">{stats.totalItems - stats.implemented}</div>
              <div className="text-adobe-gray-500 text-xs">Active</div>
            </div>
          </div>

          {/* Expandable content (always visible on desktop, collapsible on mobile) */}
          <div className={`space-y-3 ${expanded ? "block" : "hidden lg:block"}`}>
            {/* v3: Search and Filters */}
            <LibrarySearch
              items={items}
              categories={categories}
              onFilteredItemsChange={handleFilteredItemsChange}
              onFilteredCategoriesChange={handleFilteredCategoriesChange}
            />

            {/* View Toggle - Compact */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1">
                <button
                  onClick={() => setViewMode("items")}
                  className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                    viewMode === "items"
                      ? "bg-white/20 text-white"
                      : "bg-white/10 text-adobe-gray-400 hover:bg-white/15"
                  }`}
                >
                  Items ({filteredItems.length})
                </button>
                <button
                  onClick={() => setViewMode("categories")}
                  className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                    viewMode === "categories"
                      ? "bg-white/20 text-white"
                      : "bg-white/10 text-adobe-gray-400 hover:bg-white/15"
                  }`}
                >
                  Themes ({filteredCategories.length})
                </button>
              </div>

              {/* Export Actions - Compact */}
              <div className="flex gap-1">
                <button
                  onClick={() => downloadMarkdown(generateMarkdown())}
                  className="p-1.5 text-adobe-gray-400 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                  aria-label="Export library as markdown"
                  title="Export .md"
                >
                  <span aria-hidden="true">📥</span>
                </button>
                <button
                  onClick={() => copyToClipboard(generateMarkdown())}
                  className="p-1.5 text-adobe-gray-400 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                  aria-label="Copy library to clipboard"
                  title="Copy"
                >
                  <span aria-hidden="true">📋</span>
                </button>
              </div>
            </div>

            {/* Content - Scrollable */}
            <div className="bg-black/20 rounded-xl border border-white/10 max-h-[50vh] lg:max-h-[60vh] overflow-y-auto">
              {viewMode === "items" ? (
                <div className="p-3 space-y-2">
                  {filteredItems.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-adobe-gray-400 text-sm">No items found.</p>
                      <p className="text-adobe-gray-500 text-xs mt-1">Try adjusting your search or filters.</p>
                    </div>
                  ) : (
                    filteredItems.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        category={categoryMap.get(item.id)}
                      />
                    ))
                  )}
                </div>
              ) : (
                <div className="p-3 space-y-3">
                  {filteredCategories.length === 0 ? (
                    <p className="text-adobe-gray-400 text-sm">No categories found.</p>
                  ) : (
                    filteredCategories.map((category) => {
                      const categoryItems = filteredItems.filter((item) =>
                        category.itemIds.includes(item.id)
                      );
                      return (
                        <div
                          key={category.id}
                          className="p-3 rounded-lg border border-white/10 bg-white/5"
                        >
                          <h3 className="font-medium text-white text-sm mb-1">
                            {category.name}
                          </h3>
                          <p className="text-xs text-adobe-gray-500 mb-2">
                            {categoryItems.length} items
                          </p>
                          <div className="space-y-1">
                            {categoryItems.slice(0, 5).map((item) => (
                              <div
                                key={item.id}
                                className="text-xs text-adobe-gray-300 pl-2 border-l border-white/10"
                              >
                                {item.title || item.name}
                              </div>
                            ))}
                            {categoryItems.length > 5 && (
                              <div className="text-xs text-adobe-gray-500 pl-2">
                                +{categoryItems.length - 5} more
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
    </SectionErrorBoundary>
  );
});
