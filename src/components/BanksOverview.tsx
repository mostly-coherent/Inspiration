"use client";

import { useState, useEffect, memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { copyToClipboard, downloadFile } from "@/lib/utils";
import { Item, Category, ThemeType, ModeType } from "@/lib/types";
import { loadThemesAsync } from "@/lib/themes";
import { LoadingSpinner } from "./LoadingSpinner";

type ViewMode = "items" | "categories";

export const BanksOverview = memo(function BanksOverview() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<{
    totalItems: number;
    totalCategories: number;
    byMode: Record<string, number>;
    byTheme: Record<string, number>;
    implemented: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("items");
  const [filterTheme, setFilterTheme] = useState<ThemeType | "all">("all");
  const [filterMode, setFilterMode] = useState<ModeType | "all">("all");
  const [showImplemented, setShowImplemented] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadItems();
  }, [viewMode, filterTheme, filterMode, showImplemented]);

  const loadItems = async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        view: viewMode,
        implemented: showImplemented ? "true" : "false",
      });
      
      if (filterTheme !== "all") {
        params.append("theme", filterTheme);
      }
      if (filterMode !== "all") {
        params.append("mode", filterMode);
      }
      
      const res = await fetch(`/api/items?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setItems(data.items || []);
          setCategories(data.categories || []);
          setStats(data.stats);
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

  const generateItemsMarkdown = (itemsToExport: Item[]): string => {
    const lines = ["# Items Bank", ""];
    lines.push(`> **${items.length} items** — ${stats?.implemented || 0} implemented`);
    lines.push("");
    lines.push("---");
    lines.push("");

    // Separate implemented and unimplemented
    const unimplemented = items.filter((item) => !item.implemented);
    const implemented = items.filter((item) => item.implemented);

    if (unimplemented.length > 0) {
      lines.push("## Active Items");
      lines.push("");
      unimplemented.forEach((item, idx) => {
        lines.push(`### ${idx + 1}. ${item.name}`);
        lines.push("");
        if (item.content.title) {
          lines.push(`**Title:** ${item.content.title}`);
          lines.push("");
        }
        if (item.content.problem) {
          lines.push(`**Problem:** ${item.content.problem}`);
          lines.push("");
        }
        if (item.content.solution) {
          lines.push(`**Solution:** ${item.content.solution}`);
          lines.push("");
        }
        if (item.content.hook) {
          lines.push(`**Hook:** ${item.content.hook}`);
          lines.push("");
        }
        if (item.content.insight) {
          lines.push(`**Insight:** ${item.content.insight}`);
          lines.push("");
        }
        lines.push(`*Occurrence: ${item.occurrence}x | First seen: ${item.firstSeen} | Last seen: ${item.lastSeen}*`);
        lines.push("");
        lines.push("---");
        lines.push("");
      });
    }

    if (implemented.length > 0) {
      lines.push("## Implemented Items");
      lines.push("");
      implemented.forEach((item, idx) => {
        lines.push(`### ${idx + 1}. ${item.name} ✅`);
        lines.push("");
        if (item.implementedSource) {
          lines.push(`*Implemented in: ${item.implementedSource}*`);
          lines.push("");
        }
        lines.push("---");
        lines.push("");
      });
    }

    return lines.join("\n");
  };

  const generateCategoriesMarkdown = (categories: Category[], items: Item[]): string => {
    const lines = ["# Categories Bank", ""];
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

  // Get available themes and modes for filters
  const [availableThemes, setAvailableThemes] = useState<ThemeType[]>([]);
  const [availableModes, setAvailableModes] = useState<ModeType[]>([]);

  useEffect(() => {
    loadThemesAsync().then((themesConfig) => {
      const themes = themesConfig.themes.map((t) => t.id);
      setAvailableThemes(themes);
      
      // Get modes for selected theme
      const theme = themesConfig.themes.find((t) => t.id === filterTheme);
      if (theme) {
        setAvailableModes(theme.modes.map((m) => m.id));
      } else {
        // Get all modes
        const allModes = new Set<ModeType>();
        themesConfig.themes.forEach((t) => {
          t.modes.forEach((m) => allModes.add(m.id));
        });
        setAvailableModes(Array.from(allModes));
      }
    });
  }, [filterTheme]);

  if (loading && !stats) return null;
  if (!stats && !error) return null;

  return (
    <section className="glass-card p-6 space-y-4 mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-adobe-gray-300 flex items-center gap-2">
          <span>🏦</span> Your Bank
        </h2>
        {error && (
          <button
            onClick={() => loadItems()}
            className="text-sm text-inspiration-ideas hover:text-inspiration-ideas/80 transition-colors"
            aria-label="Retry loading bank"
          >
            Retry
          </button>
        )}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="p-3 bg-black/20 rounded-lg">
              <div className="text-adobe-gray-400 text-xs mb-1">Total Items</div>
              <div className="text-white font-medium text-lg">{stats.totalItems}</div>
            </div>
            <div className="p-3 bg-black/20 rounded-lg">
              <div className="text-adobe-gray-400 text-xs mb-1">Categories</div>
              <div className="text-white font-medium text-lg">{stats.totalCategories}</div>
            </div>
            <div className="p-3 bg-black/20 rounded-lg">
              <div className="text-adobe-gray-400 text-xs mb-1">Implemented</div>
              <div className="text-white font-medium text-lg">{stats.implemented}</div>
            </div>
            <div className="p-3 bg-black/20 rounded-lg">
              <div className="text-adobe-gray-400 text-xs mb-1">Active</div>
              <div className="text-white font-medium text-lg">{stats.totalItems - stats.implemented}</div>
            </div>
          </div>

          {/* Filters and View Toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-adobe-gray-400">View:</label>
              <div className="flex gap-1">
                <button
                  onClick={() => setViewMode("items")}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    viewMode === "items"
                      ? "bg-white/20 text-white"
                      : "bg-white/10 text-adobe-gray-400 hover:bg-white/15"
                  }`}
                >
                  Items
                </button>
                <button
                  onClick={() => setViewMode("categories")}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    viewMode === "categories"
                      ? "bg-white/20 text-white"
                      : "bg-white/10 text-adobe-gray-400 hover:bg-white/15"
                  }`}
                >
                  Categories
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-adobe-gray-400">Theme:</label>
              <select
                value={filterTheme}
                onChange={(e) => setFilterTheme(e.target.value as ThemeType | "all")}
                className="px-3 py-1 text-sm bg-black/30 border border-white/10 rounded-lg text-white"
              >
                <option value="all">All</option>
                {availableThemes.map((theme) => (
                  <option key={theme} value={theme}>
                    {theme.charAt(0).toUpperCase() + theme.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-adobe-gray-400">Mode:</label>
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as ModeType | "all")}
                className="px-3 py-1 text-sm bg-black/30 border border-white/10 rounded-lg text-white"
              >
                <option value="all">All</option>
                {availableModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-adobe-gray-400">
              <input
                type="checkbox"
                checked={showImplemented}
                onChange={(e) => setShowImplemented(e.target.checked)}
                className="rounded"
              />
              Show implemented
            </label>

            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-auto px-4 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          </div>

          {/* Expanded View */}
          {expanded && (
            <div className="mt-4">
              {/* Export Actions */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => downloadMarkdown(generateMarkdown())}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                  aria-label="Export bank as markdown"
                >
                  <span aria-hidden="true">📥</span> Export .md
                </button>
                <button
                  onClick={() => copyToClipboard(generateMarkdown())}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                  aria-label="Copy bank to clipboard"
                >
                  <span aria-hidden="true">📋</span> Copy
                </button>
              </div>

              {/* Content */}
              <div className="p-4 bg-black/30 rounded-xl border border-white/10 max-h-96 overflow-y-auto">
                {viewMode === "items" ? (
                  <div className="space-y-4">
                    {filteredItems.length === 0 ? (
                      <p className="text-adobe-gray-400">No items found.</p>
                    ) : (
                      filteredItems.map((item) => (
                        <div
                          key={item.id}
                          className={`p-4 rounded-lg border ${
                            item.implemented
                              ? "border-emerald-500/30 bg-emerald-500/5"
                              : "border-white/10 bg-white/5"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-semibold text-white">{item.name}</h3>
                                {item.implemented && (
                                  <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                                    ✅ Implemented
                                  </span>
                                )}
                                <span className="text-xs text-adobe-gray-400">
                                  ({item.occurrence}x)
                                </span>
                              </div>
                              {item.content.title && (
                                <p className="text-sm text-adobe-gray-300 mb-2">
                                  {item.content.title}
                                </p>
                              )}
                              {item.content.problem && (
                                <p className="text-sm text-adobe-gray-300 mb-1">
                                  <strong>Problem:</strong> {item.content.problem}
                                </p>
                              )}
                              {item.content.solution && (
                                <p className="text-sm text-adobe-gray-300 mb-1">
                                  <strong>Solution:</strong> {item.content.solution}
                                </p>
                              )}
                              {item.content.hook && (
                                <p className="text-sm text-adobe-gray-300 mb-1">
                                  <strong>Hook:</strong> {item.content.hook}
                                </p>
                              )}
                              {item.content.insight && (
                                <p className="text-sm text-adobe-gray-300 mb-1">
                                  <strong>Insight:</strong> {item.content.insight}
                                </p>
                              )}
                              <p className="text-xs text-adobe-gray-400 mt-2">
                                {item.firstSeen} → {item.lastSeen}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredCategories.length === 0 ? (
                      <p className="text-adobe-gray-400">No categories found.</p>
                    ) : (
                      filteredCategories.map((category) => {
                        const categoryItems = filteredItems.filter((item) =>
                          category.itemIds.includes(item.id)
                        );
                        return (
                          <div
                            key={category.id}
                            className="p-4 rounded-lg border border-white/10 bg-white/5"
                          >
                            <h3 className="font-semibold text-white mb-2">
                              {category.name}
                            </h3>
                            <p className="text-xs text-adobe-gray-400 mb-3">
                              {category.theme} / {category.mode} • {categoryItems.length} items
                            </p>
                            <div className="space-y-2">
                              {categoryItems.map((item) => (
                                <div
                                  key={item.id}
                                  className="text-sm text-adobe-gray-300 pl-3 border-l-2 border-white/10"
                                >
                                  <strong>{item.name}</strong> ({item.occurrence}x)
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
});
