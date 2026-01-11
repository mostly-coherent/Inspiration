"use client";

import { useState, useEffect, memo, useCallback } from "react";
import { copyToClipboard, downloadFile } from "@/lib/utils";
import { Item } from "@/lib/types";
import { LoadingSpinner } from "./LoadingSpinner";
import { SectionErrorBoundary } from "./SectionErrorBoundary";
import { ItemCard } from "./ItemCard";
import { LibrarySearch } from "./LibrarySearch";

interface BanksOverviewProps {
  compact?: boolean;
}

export const BanksOverview = memo(function BanksOverview({ compact = false }: BanksOverviewProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [stats, setStats] = useState<{
    totalItems: number;
    totalCategories: number;
    byMode: Record<string, number>;
    byTheme: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState(true); // v3: Default expanded for two-panel layout
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalItems, setTotalItems] = useState(0);

  // Load items on mount
  useEffect(() => {
    loadItems();
  }, []);

  // Callbacks for LibrarySearch
  const handleFilteredItemsChange = useCallback((items: Item[]) => {
    setFilteredItems(items);
  }, []);

  const loadItems = async (page: number = 1, append: boolean = false) => {
    setError(null);
    if (append) {
      setLoadingMore(true);
    } else {
    setLoading(true);
    }
    
    try {
      const params = new URLSearchParams({
        view: "items",
        page: page.toString(),
        pageSize: "50",
      });
      
      const res = await fetch(`/api/items?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const loadedItems = data.items || [];
          
          if (append) {
            // Append to existing items
            setItems(prev => [...prev, ...loadedItems]);
            setFilteredItems(prev => [...prev, ...loadedItems]);
          } else {
            // Replace items (initial load)
          setItems(loadedItems);
            setFilteredItems(loadedItems);
          }
          
          setStats(data.stats);
          setCurrentPage(data.currentPage || page);
          setHasNextPage(data.hasNextPage || false);
          setTotalItems(data.totalItems || 0);
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
      setLoadingMore(false);
    }
  };
  
  const loadMore = () => {
    if (hasNextPage && !loadingMore) {
      loadItems(currentPage + 1, true);
    }
  };

  const downloadMarkdown = (content: string) => {
    downloadFile(content, "ITEMS_BANK.md");
  };

  const generateMarkdown = (): string => {
    return generateItemsMarkdown(filteredItems);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const generateItemsMarkdown = (_items?: Item[]): string => {
    const lines = ["# Items Library", ""];
    lines.push(`> **${items.length} items**`);
    lines.push("");
    lines.push("---");
    lines.push("");

    // All items (no status separation)
    if (items.length > 0) {
      lines.push("## Items");
      lines.push("");
      items.forEach((item, idx) => {
        const title = item.title || "Untitled";
        const itemType = item.itemType || "unknown";
        const typeLabel = itemType.charAt(0).toUpperCase() + itemType.slice(1);
        
        lines.push(`### ${idx + 1}. ${title}`);
        lines.push("");
        lines.push(`**Type:** ${typeLabel}`);
        lines.push("");
        
        if (item.description) {
          lines.push(item.description);
          lines.push("");
        }
        
        lines.push(`*Occurrence: ${item.occurrence}x | First seen: ${item.firstSeen} | Last seen: ${item.lastSeen}*`);
        lines.push("");
        lines.push("---");
        lines.push("");
      });
    }

    return lines.join("\n");
  };

  // v3: Filters are now handled by LibrarySearch component
  // NOTE: Category/Themes view removed - use Theme Explorer for pattern discovery

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
        {/* Quick Stats */}
        <div className="text-center p-2 bg-slate-800/50 rounded-lg">
          <div className="text-lg font-bold text-white">{stats.totalItems}</div>
          <div className="text-xs text-slate-500">items in library</div>
        </div>
        
        {/* Recent Items Preview */}
        <div className="space-y-2">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Recent</div>
          {recentItems.map((item) => (
            <div 
              key={item.id}
              className="p-2 bg-slate-800/30 rounded-lg text-sm border-l-2 border-indigo-500/50 hover:bg-slate-800/50 transition-colors"
            >
              <div className="text-white truncate">{item.title || "Untitled"}</div>
              <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                <span className="capitalize">{item.itemType}</span>
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
          {/* Stats Summary */}
          <div className="p-2 bg-black/20 rounded-lg text-center">
            <div className="text-white font-medium">{stats.totalItems}</div>
            <div className="text-adobe-gray-500 text-xs">Items in Library</div>
          </div>

          {/* Expandable content (always visible on desktop, collapsible on mobile) */}
          <div className={`space-y-3 ${expanded ? "block" : "hidden lg:block"}`}>
            {/* v3: Search and Filters */}
            <LibrarySearch
              items={items}
              onFilteredItemsChange={handleFilteredItemsChange}
            />

            {/* Header with count and export actions */}
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-adobe-gray-400">
                {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
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
              <div className="p-3 space-y-2">
                {filteredItems.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-adobe-gray-400 text-sm">No items found.</p>
                    <p className="text-adobe-gray-500 text-xs mt-1">Try adjusting your search or filters.</p>
                  </div>
                ) : (
                  <>
                    {filteredItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                    />
                    ))}
                    
                    {/* Load More / Pagination */}
                    {hasNextPage && (
                      <div className="pt-3 border-t border-white/10">
                        <button
                          onClick={loadMore}
                          disabled={loadingMore}
                          className="w-full py-2 px-4 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          {loadingMore ? (
                            <span className="flex items-center justify-center gap-2">
                              <LoadingSpinner />
                              Loading...
                            </span>
                          ) : (
                            <span>Load More ({items.length} of {totalItems})</span>
                          )}
                        </button>
                      </div>
                    )}
                    
                    {/* All loaded indicator */}
                    {!hasNextPage && items.length > 0 && items.length >= 50 && (
                      <div className="pt-3 text-center text-xs text-slate-500">
                        All {totalItems} items loaded
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
    </SectionErrorBoundary>
  );
});
