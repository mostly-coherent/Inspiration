"use client";

import { memo, useState, useCallback, useMemo, useEffect } from "react";
import { Item, Category, ModeType, ItemStatus } from "@/lib/types";

interface LibrarySearchProps {
  items: Item[];
  categories: Category[];
  onFilteredItemsChange: (items: Item[]) => void;
  onFilteredCategoriesChange: (categories: Category[]) => void;
}

export const LibrarySearch = memo(function LibrarySearch({
  items,
  categories,
  onFilteredItemsChange,
  onFilteredCategoriesChange,
}: LibrarySearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<ModeType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<ItemStatus | "all">("all");
  const [filterCategory, setFilterCategory] = useState<string | "all">("all");
  const [sortBy, setSortBy] = useState<"recency" | "occurrence" | "title">("recency");

  // Get unique modes from items
  const availableModes = useMemo(() => {
    const modes = new Set<string>();
    items.forEach((item) => {
      if (item.mode) modes.add(item.mode);
      if (item.itemType) modes.add(item.itemType);
    });
    return Array.from(modes).sort();
  }, [items]);

  // Filter and sort items
  const filterItems = useCallback(() => {
    let filtered = [...items];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((item) => {
        const title = (item.title || item.name || "").toLowerCase();
        const description = (item.description || "").toLowerCase();
        const tags = (item.tags || []).join(" ").toLowerCase();
        const content = JSON.stringify(item.content || {}).toLowerCase();
        return (
          title.includes(query) ||
          description.includes(query) ||
          tags.includes(query) ||
          content.includes(query)
        );
      });
    }

    // Mode filter
    if (filterMode !== "all") {
      filtered = filtered.filter(
        (item) => item.mode === filterMode || item.itemType === filterMode
      );
    }

    // Status filter
    if (filterStatus !== "all") {
      filtered = filtered.filter((item) => {
        const status = item.status || (item.implemented ? "implemented" : "active");
        return status === filterStatus;
      });
    }

    // Category filter
    if (filterCategory !== "all") {
      const category = categories.find((c) => c.id === filterCategory);
      if (category) {
        filtered = filtered.filter((item) => category.itemIds.includes(item.id));
      }
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === "recency") {
        const dateA = new Date(a.lastSeen || a.firstSeen || "1970-01-01").getTime();
        const dateB = new Date(b.lastSeen || b.firstSeen || "1970-01-01").getTime();
        return dateB - dateA; // Most recent first
      }
      if (sortBy === "occurrence") {
        return (b.occurrence || 0) - (a.occurrence || 0);
      }
      if (sortBy === "title") {
        const titleA = (a.title || a.name || "").toLowerCase();
        const titleB = (b.title || b.name || "").toLowerCase();
        return titleA.localeCompare(titleB);
      }
      return 0;
    });

    return filtered;
  }, [items, searchQuery, filterMode, filterStatus, filterCategory, sortBy, categories]);

  // Filter categories to only show those with matching items
  const filterCategories = useCallback(
    (filteredItems: Item[]) => {
      const itemIds = new Set(filteredItems.map((i) => i.id));
      return categories.filter((cat) =>
        cat.itemIds.some((id) => itemIds.has(id))
      );
    },
    [categories]
  );

  // Apply filters when any filter changes (useEffect for side effects, not useMemo)
  useEffect(() => {
    const filteredItems = filterItems();
    const filteredCategories = filterCategories(filteredItems);
    onFilteredItemsChange(filteredItems);
    onFilteredCategoriesChange(filteredCategories);
  }, [filterItems, filterCategories, onFilteredItemsChange, onFilteredCategoriesChange]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    filterMode !== "all" ||
    filterStatus !== "all" ||
    filterCategory !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setFilterMode("all");
    setFilterStatus("all");
    setFilterCategory("all");
  };

  return (
    <div className="space-y-2">
      {/* Search Input - Compact */}
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
          🔍
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search items..."
          className="w-full pl-8 pr-8 py-2 text-sm bg-black/30 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-inspiration-ideas/50 focus:border-inspiration-ideas/50"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors text-sm"
          >
            ✕
          </button>
        )}
      </div>

      {/* Filter Row - Compact grid for sidebar */}
      <div className="grid grid-cols-2 gap-2">
        {/* Mode Filter */}
        <select
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value)}
          className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-inspiration-ideas/50"
          aria-label="Filter by type"
        >
          <option value="all">All Types</option>
          {availableModes.map((mode) => (
            <option key={mode} value={mode}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as ItemStatus | "all")}
          className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-inspiration-ideas/50"
          aria-label="Filter by status"
        >
          <option value="all">All Status</option>
          <option value="active">💡 Active</option>
          <option value="implemented">✅ Built</option>
          <option value="posted">📝 Posted</option>
          <option value="archived">📦 Archived</option>
        </select>

        {/* Category Filter */}
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-inspiration-ideas/50"
          aria-label="Filter by category"
        >
          <option value="all">All Categories</option>
          {categories.slice(0, 20).map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name.length > 15 ? cat.name.slice(0, 15) + "..." : cat.name}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "recency" | "occurrence" | "title")}
          className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-inspiration-ideas/50"
          aria-label="Sort by"
        >
          <option value="recency">Recent</option>
          <option value="occurrence">Frequent</option>
          <option value="title">A-Z</option>
        </select>
      </div>

      {/* Clear Filters - Only show when active */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="w-full text-xs text-inspiration-ideas hover:text-inspiration-ideas/80 transition-colors py-1"
        >
          Clear all filters ✕
        </button>
      )}
    </div>
  );
});

