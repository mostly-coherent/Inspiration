"use client";

import { useState, useEffect, useMemo, memo } from "react";
import Link from "next/link";

// Format YYYY-MM date string to readable format (e.g., "2025-12" → "Dec 2025")
function formatMonthYear(dateStr: string): string {
  if (!dateStr) return "Unknown";
  
  // Handle YYYY-MM format
  if (dateStr.length === 7) {
    const [year, month] = dateStr.split("-");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthIndex = parseInt(month) - 1;
    return `${monthNames[monthIndex]} ${year}`;
  }
  
  // Handle legacy YYYY-MM-DD format (shouldn't happen, but fallback)
  if (dateStr.length === 10) {
    const [year, month] = dateStr.split("-");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthIndex = parseInt(month) - 1;
    return `${monthNames[monthIndex]} ${year}`;
  }
  
  return dateStr;
}

interface Item {
  id: string;
  itemType: string;
  title: string;
  description: string;
  tags: string[];
  status: "active" | "implemented" | "posted" | "archived";
  quality?: "A" | "B" | "C" | null;
  occurrence: number;
  implementedStatus: string;
  categoryId: string | null;
  firstSeen: string;
  lastSeen: string;
  sourceDates: string[];
}

interface Category {
  id: string;
  name: string;
  itemType: string;
  itemCount: number;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface LibraryData {
  items: Item[];
  categories: Category[];
  stats: {
    totalItems: number;
    totalCategories: number;
    implementedCount: number;
  };
  pagination: PaginationInfo | null;
}

type SortOption = "recent" | "oldest" | "occurrence" | "alphabetical";

interface FilterState {
  search: string;
  itemType: "all" | string;
  status: "all" | "implemented" | "pending";
  quality: "all" | "A" | "B" | "C" | "unrated";
  tag: "all" | string;
  category: "all" | string;
  sort: SortOption;
}

export const LibraryView = memo(function LibraryView() {
  const [data, setData] = useState<LibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50); // Fixed page size
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  
  // Cleanup state
  const [staleCount, setStaleCount] = useState<number>(0);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  
  // Top recommendations
  interface TopItem {
    id: string;
    title: string;
    description: string;
    itemType: string;
    quality?: string | null;
    occurrence: number;
    score: number;
    reasons: string[];
  }
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [buildNext, setBuildNext] = useState<TopItem[]>([]);
  const [shareNext, setShareNext] = useState<TopItem[]>([]);
  const [showRecommendations, setShowRecommendations] = useState(true);
  
  // Theme synthesis
  interface ThemeSummary {
    name: string;
    itemCount: number;
    topTags: string[];
    recentActivity: string;
    qualityBreakdown: { A: number; B: number; C: number; unrated: number };
  }
  interface ThemeStats {
    totalItems: number;
    totalThemes: number;
    topTheme: string | null;
    qualityDistribution: { A: number; B: number; C: number; unrated: number };
    typeDistribution: { ideas: number; insights: number; useCases: number };
  }
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [themeStats, setThemeStats] = useState<ThemeStats | null>(null);
  const [showThemes, setShowThemes] = useState(true);
  
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    itemType: "all",
    status: "all",
    quality: "all",
    tag: "all",
    category: "all",
    sort: "recent",
  });

  // Fetch library data with pagination
  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          pageSize: pageSize.toString(),
        });
        const res = await fetch(`/api/items?${params}`);
        if (!res.ok) throw new Error("Failed to fetch library");
        const json = await res.json();
        if (json.success) {
          setData(json);
        } else {
          throw new Error(json.error || "Unknown error");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    fetchLibrary();
  }, [currentPage, pageSize]);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    
    let items = [...data.items];
    
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(searchLower) ||
          item.description.toLowerCase().includes(searchLower) ||
          (item.tags?.some((t) => t.toLowerCase().includes(searchLower)) ?? false)
      );
    }
    
    // Type filter
    if (filters.itemType !== "all") {
      items = items.filter((item) => item.itemType === filters.itemType);
    }
    
    // Status filter
    if (filters.status !== "all") {
      items = items.filter((item) => item.status === filters.status);
    }
    
    // Quality filter
    if (filters.quality !== "all") {
      if (filters.quality === "unrated") {
        items = items.filter((item) => !item.quality);
      } else {
        items = items.filter((item) => item.quality === filters.quality);
      }
    }
    
    // Tag filter
    if (filters.tag !== "all") {
      items = items.filter((item) => item.tags?.includes(filters.tag));
    }
    
    // Category filter (matches items by their category name)
    if (filters.category !== "all") {
      if (filters.category === "Uncategorized") {
        // Match items with no category or null categoryId
        items = items.filter((item) => !item.categoryId || item.categoryId === "uncategorized");
      } else {
        // Find the category ID by name, then filter items
        const matchingCategory = data?.categories?.find((cat) => cat.name === filters.category);
        if (matchingCategory) {
          items = items.filter((item) => item.categoryId === matchingCategory.id);
        }
      }
    }
    
    // Sort
    switch (filters.sort) {
      case "recent":
        items.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
        break;
      case "oldest":
        items.sort((a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime());
        break;
      case "occurrence":
        items.sort((a, b) => b.occurrence - a.occurrence);
        break;
      case "alphabetical":
        items.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }
    
    return items;
  }, [data?.items, filters]);

  // Get categories for item display
  const categories = useMemo(() => {
    return data?.categories || [];
  }, [data?.categories]);
  
  // Get all unique tags for filter dropdown
  const allTags = useMemo(() => {
    if (!data?.items) return [];
    const tagSet = new Set<string>();
    data.items.forEach((item) => {
      item.tags?.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [data?.items]);

  // Refetch library data
  const refetchLibrary = async () => {
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
      });
      const res = await fetch(`/api/items?${params}`);
      if (!res.ok) throw new Error("Failed to fetch library");
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error("Refetch error:", err);
    }
  };

  // Fetch stale items count
  const fetchStaleCount = async () => {
    try {
      const res = await fetch("/api/items/cleanup");
      if (res.ok) {
        const json = await res.json();
        setStaleCount(json.staleCount || 0);
      }
    } catch (err) {
      console.error("Stale count error:", err);
    }
  };

  // Fetch stale count and top items on load
  useEffect(() => {
    if (data) {
      fetchStaleCount();
      fetchTopItems();
      fetchThemes();
    }
  }, [data]);

  // Fetch top recommendations
  const fetchTopItems = async () => {
    try {
      const res = await fetch("/api/items/top");
      if (res.ok) {
        const json = await res.json();
        setTopItems(json.items || []);
        setBuildNext(json.buildNext || []);
        setShareNext(json.shareNext || []);
      }
    } catch (err) {
      console.error("Top items error:", err);
    }
  };
  
  // Fetch themes
  const fetchThemes = async () => {
    try {
      const res = await fetch("/api/items/themes");
      if (res.ok) {
        const json = await res.json();
        setThemes(json.themes || []);
        setThemeStats(json.stats || null);
      }
    } catch (err) {
      console.error("Themes error:", err);
    }
  };

  // Run cleanup
  const runCleanup = async () => {
    if (staleCount === 0) return;
    if (!confirm(`Archive ${staleCount} stale items? (Items >90 days old, not A-tier, not implemented/posted)`)) return;
    setCleanupLoading(true);
    try {
      const res = await fetch("/api/items/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      if (res.ok) {
        await refetchLibrary();
        await fetchStaleCount();
      }
    } catch (err) {
      console.error("Cleanup error:", err);
    } finally {
      setCleanupLoading(false);
    }
  };

  // Toggle item selection
  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all visible items
  const selectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((item) => item.id)));
    }
  };

  // Bulk archive
  const bulkArchive = async () => {
    if (selectedIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch("/api/items/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), status: "archived" }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        await refetchLibrary();
      }
    } catch (err) {
      console.error("Bulk archive error:", err);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk delete
  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} items? This cannot be undone.`)) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch("/api/items/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        await refetchLibrary();
      }
    } catch (err) {
      console.error("Bulk delete error:", err);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk status change
  const bulkSetStatus = async (status: Item["status"]) => {
    if (selectedIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch("/api/items/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), status }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        await refetchLibrary();
      }
    } catch (err) {
      console.error("Bulk status change error:", err);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Merge selected items into one
  const mergeSelected = async () => {
    if (selectedIds.size < 2) return;
    if (!confirm(`Merge ${selectedIds.size} items into one? The item with highest occurrence will be kept, others deleted.`)) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch("/api/items/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        await refetchLibrary();
      }
    } catch (err) {
      console.error("Merge error:", err);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Set quality for an item
  const setItemQuality = async (itemId: string, quality: "A" | "B" | "C" | null) => {
    try {
      const res = await fetch("/api/items/quality", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, quality }),
      });
      if (res.ok) {
        await refetchLibrary();
        // Update selected item if it's the one being changed
        if (selectedItem?.id === itemId) {
          setSelectedItem({ ...selectedItem, quality });
        }
      }
    } catch (err) {
      console.error("Quality change error:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-inspiration-ideas"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-6 border-red-500/30">
        <p className="text-red-400">Failed to load library: {error}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Items List */}
      <div className="lg:col-span-2 space-y-4">
        {/* Top 3 Today - Mixed ideas and insights, ranked by score */}
        {showRecommendations && topItems.length > 0 && (
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <span className="text-lg">🎯</span> Top 3 Today
                <span className="text-xs text-adobe-gray-500 font-normal">(ranked by score)</span>
              </h3>
              <button
                onClick={() => setShowRecommendations(false)}
                className="text-xs text-adobe-gray-500 hover:text-adobe-gray-300"
              >
                Hide
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {topItems.map((item, idx) => {
                const isIdea = item.itemType === "idea";
                const colorClass = isIdea ? "inspiration-ideas" : "inspiration-insights";
                const icon = isIdea ? "🔨" : "✨";
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      const fullItem = data?.items.find((i) => i.id === item.id);
                      if (fullItem) setSelectedItem(fullItem);
                    }}
                    className={`w-full text-left p-3 rounded-lg bg-gradient-to-br from-${colorClass}/10 to-adobe-gray-900/50 border border-${colorClass}/20 hover:border-${colorClass}/50 transition-all`}
                    style={{
                      background: `linear-gradient(to bottom right, ${isIdea ? 'rgba(59, 130, 246, 0.1)' : 'rgba(168, 85, 247, 0.1)'}, rgba(30, 30, 30, 0.5))`,
                      borderColor: isIdea ? 'rgba(59, 130, 246, 0.2)' : 'rgba(168, 85, 247, 0.2)'
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold ${isIdea ? 'text-inspiration-ideas' : 'text-inspiration-insights'}`}>#{idx + 1}</span>
                      <span className="text-xs">{icon}</span>
                      {item.quality === "A" && <span className="text-xs">⭐</span>}
                      <span className="text-[10px] text-adobe-gray-500 ml-auto">{item.score} pts</span>
                    </div>
                    <h5 className="text-sm font-medium text-white line-clamp-1 mb-1">{item.title}</h5>
                    <p className="text-xs text-adobe-gray-500 line-clamp-1">
                      {item.reasons?.join(" • ") || ""}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Themes Overview */}
        {showThemes && themes.length > 0 && (
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <span className="text-lg">🗺️</span> Themes ({themeStats?.totalThemes || 0})
              </h3>
              <button
                onClick={() => setShowThemes(false)}
                className="text-xs text-adobe-gray-500 hover:text-adobe-gray-300"
              >
                Hide
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {themes.slice(0, 8).map((theme) => (
                <button
                  key={theme.name}
                  onClick={() => setFilters({ ...filters, category: filters.category === theme.name ? "all" : theme.name })}
                  className={`text-left p-2 rounded-lg border transition-all ${
                    filters.category === theme.name 
                      ? "bg-adobe-blue-500/20 border-adobe-blue-500/50" 
                      : "bg-adobe-gray-800/50 border-adobe-gray-700/50 hover:border-adobe-gray-600"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-white truncate max-w-[80%]">{theme.name}</span>
                    <span className="text-xs text-adobe-gray-500">{theme.itemCount}</span>
                  </div>
                  <div className="flex gap-1">
                    {theme.qualityBreakdown.A > 0 && (
                      <span className="text-[10px] px-1 rounded bg-yellow-500/20 text-yellow-400">
                        {theme.qualityBreakdown.A}⭐
                      </span>
                    )}
                    {theme.qualityBreakdown.B > 0 && (
                      <span className="text-[10px] px-1 rounded bg-blue-500/20 text-blue-400">
                        {theme.qualityBreakdown.B}B
                      </span>
                    )}
                    {theme.qualityBreakdown.C > 0 && (
                      <span className="text-[10px] px-1 rounded bg-gray-500/20 text-gray-400">
                        {theme.qualityBreakdown.C}C
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            
            {/* Distribution summary */}
            {themeStats && (
              <div className="mt-3 pt-3 border-t border-adobe-gray-700/50 flex flex-wrap gap-3 text-xs text-adobe-gray-500">
                <span>Ideas: {themeStats.typeDistribution.ideas}</span>
                <span>Insights: {themeStats.typeDistribution.insights}</span>
                <span>Use Cases: {themeStats.typeDistribution.useCases}</span>
              </div>
            )}
          </div>
        )}

        {/* Link to Theme Explorer */}
        <Link 
          href="/themes"
          className="glass-card p-4 flex items-center justify-between hover:bg-slate-800/60 transition-colors mb-4 group"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔭</span>
            <div>
              <h3 className="font-medium text-white">Explore Themes</h3>
              <p className="text-sm text-slate-400">Zoom in/out to see patterns in your ideas</p>
            </div>
          </div>
          <svg 
            className="w-5 h-5 text-slate-400 group-hover:text-white group-hover:translate-x-1 transition-all" 
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        {/* Search & Filters */}
        <div className="glass-card p-4 space-y-4">
          {/* Search Input */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-adobe-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search items..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-10 pr-4 py-2 bg-adobe-gray-800 border border-adobe-gray-700 rounded-lg text-white placeholder-adobe-gray-500 focus:outline-none focus:border-inspiration-ideas"
            />
          </div>
          
          {/* Filter Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Type Filter */}
            <select
              value={filters.itemType}
              onChange={(e) => setFilters({ ...filters, itemType: e.target.value })}
              aria-label="Filter by item type"
              className="px-3 py-2 bg-adobe-gray-800 border border-adobe-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-inspiration-ideas"
            >
              <option value="all">All Types</option>
              <option value="idea">Ideas</option>
              <option value="insight">Insights</option>
              <option value="use_case">Use Cases</option>
            </select>
            
            {/* Status Filter */}
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as FilterState["status"] })}
              aria-label="Filter by status"
              className="px-3 py-2 bg-adobe-gray-800 border border-adobe-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-inspiration-ideas"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="implemented">Implemented</option>
            </select>
            
            {/* Quality Filter */}
            <select
              value={filters.quality}
              onChange={(e) => setFilters({ ...filters, quality: e.target.value as FilterState["quality"] })}
              aria-label="Filter by quality"
              className="px-3 py-2 bg-adobe-gray-800 border border-adobe-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-inspiration-ideas"
            >
              <option value="all">All Quality</option>
              <option value="A">⭐ A-Tier</option>
              <option value="B">B-Tier</option>
              <option value="C">C-Tier</option>
              <option value="unrated">Unrated</option>
            </select>
            
          {/* Tag Filter */}
          <select
              value={filters.tag}
              onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
              aria-label="Filter by tag"
              className="px-3 py-2 bg-adobe-gray-800 border border-adobe-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-inspiration-ideas"
            >
              <option value="all">All Tags ({allTags.length})</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            
            {/* Sort */}
            <select
              value={filters.sort}
              onChange={(e) => setFilters({ ...filters, sort: e.target.value as SortOption })}
              aria-label="Sort items by"
              className="px-3 py-2 bg-adobe-gray-800 border border-adobe-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-inspiration-ideas"
            >
              <option value="recent">Most Recent</option>
              <option value="oldest">Oldest First</option>
              <option value="occurrence">Most Occurrences</option>
              <option value="alphabetical">A-Z</option>
            </select>
          </div>
        </div>
        
        {/* Stats Bar + Bulk Actions */}
        <div className="flex items-center justify-between text-sm text-adobe-gray-400 px-2">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className="flex items-center gap-2 hover:text-white transition-colors"
            >
              <input
                type="checkbox"
                checked={filteredItems.length > 0 && selectedIds.size === filteredItems.length}
                onChange={selectAll}
                className="w-4 h-4 rounded bg-adobe-gray-800 border-adobe-gray-600"
              />
              <span>
                {selectedIds.size > 0 
                  ? `${selectedIds.size} selected` 
                  : `Showing ${filteredItems.length} of ${data?.stats.totalItems || 0}`
                }
              </span>
            </button>
          </div>
          
          {/* Bulk Action Buttons */}
          {selectedIds.size > 0 ? (
            <div className="flex items-center gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    bulkSetStatus(e.target.value as Item["status"]);
                    e.target.value = "";
                  }
                }}
                disabled={bulkActionLoading}
                className="px-2 py-1 bg-adobe-gray-800 border border-adobe-gray-700 rounded text-xs text-white"
                defaultValue=""
              >
                <option value="" disabled>Set Status...</option>
                <option value="active">Active</option>
                <option value="implemented">Implemented</option>
                <option value="posted">Posted</option>
                <option value="archived">Archived</option>
              </select>
              {selectedIds.size >= 2 && (
                <button
                  onClick={mergeSelected}
                  disabled={bulkActionLoading}
                  className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                >
                  Merge ({selectedIds.size})
                </button>
              )}
              <button
                onClick={bulkArchive}
                disabled={bulkActionLoading}
                className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs hover:bg-amber-500/30 transition-colors disabled:opacity-50"
              >
                Archive
              </button>
              <button
                onClick={bulkDelete}
                disabled={bulkActionLoading}
                className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs hover:bg-red-500/30 transition-colors disabled:opacity-50"
              >
                Delete
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-2 py-1 text-adobe-gray-400 hover:text-white text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span>{data?.stats.implementedCount || 0} implemented</span>
              {staleCount > 0 && (
                <button
                  onClick={runCleanup}
                  disabled={cleanupLoading}
                  className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-xs hover:bg-orange-500/30 transition-colors disabled:opacity-50"
                >
                  {cleanupLoading ? "Cleaning..." : `🧹 Clean up ${staleCount} stale`}
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              isSelected={selectedItem?.id === item.id}
              isChecked={selectedIds.has(item.id)}
              onCheck={(e) => toggleSelection(item.id, e)}
              onClick={() => setSelectedItem(item)}
              category={categories.find((c) => c.id === item.categoryId)}
            />
          ))}
          
          {filteredItems.length === 0 && (
            <div className="col-span-full text-center py-12 text-adobe-gray-400">
              No items match your filters
            </div>
          )}
        </div>
        
        {/* Pagination Controls */}
        {data?.pagination && data.pagination.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-adobe-gray-400">
              Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, data.pagination.totalItems)} of {data.pagination.totalItems} items
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={!data.pagination.hasPrevPage}
                className="px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
                aria-label="First page"
              >
                ⏮
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={!data.pagination.hasPrevPage}
                className="px-4 py-1.5 text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                ← Previous
              </button>
              <span className="px-4 py-1.5 text-sm bg-white/10 rounded-lg">
                Page {currentPage} of {data.pagination.totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(data.pagination!.totalPages, p + 1))}
                disabled={!data.pagination.hasNextPage}
                className="px-4 py-1.5 text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Next →
              </button>
              <button
                onClick={() => setCurrentPage(data.pagination!.totalPages)}
                disabled={!data.pagination.hasNextPage}
                className="px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
                aria-label="Last page"
              >
                ⏭
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Item Detail Panel */}
      <div className="lg:col-span-1">
        <div className="lg:sticky lg:top-6">
          {selectedItem ? (
            <ItemDetailPanel 
              item={selectedItem} 
              category={categories.find((c) => c.id === selectedItem.categoryId)}
              onQualityChange={(quality) => setItemQuality(selectedItem.id, quality)}
            />
          ) : (
            <div className="glass-card p-6 text-center text-adobe-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <p>Select an item to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// Item Card Component
const ItemCard = memo(function ItemCard({
  item,
  isSelected,
  isChecked,
  onCheck,
  onClick,
  category,
}: {
  item: Item;
  isSelected: boolean;
  isChecked: boolean;
  onCheck: (e: React.MouseEvent) => void;
  onClick: () => void;
  category?: Category;
}) {
  const typeColors: Record<string, string> = {
    idea: "bg-inspiration-ideas/20 text-inspiration-ideas border-inspiration-ideas/30",
    insight: "bg-inspiration-insights/20 text-inspiration-insights border-inspiration-insights/30",
    use_case: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  };
  
  const typeColor = typeColors[item.itemType] || typeColors.idea;
  const isImplemented = item.implementedStatus === "implemented";
  
  return (
    <div
      className={`relative w-full text-left p-4 rounded-lg border transition-all cursor-pointer ${
        isSelected
          ? "bg-adobe-gray-700/50 border-inspiration-ideas"
          : isChecked
          ? "bg-adobe-gray-700/30 border-amber-500/50"
          : "bg-adobe-gray-800/30 border-adobe-gray-700/50 hover:border-adobe-gray-600"
      }`}
      onClick={onClick}
    >
      {/* Checkbox */}
      <div 
        className="absolute top-3 right-3 z-10"
        onClick={onCheck}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => {}}
          className="w-4 h-4 rounded bg-adobe-gray-800 border-adobe-gray-600 cursor-pointer"
        />
      </div>
      
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2 pr-6">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${typeColor}`}>
            {item.itemType}
          </span>
          {isImplemented && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
              ✓ Done
            </span>
          )}
        </div>
        <span className="text-xs text-adobe-gray-500">
          ×{item.occurrence}
        </span>
      </div>
      
      {/* Title */}
      <h3 className="font-medium text-white mb-1 line-clamp-2">{item.title}</h3>
      
      {/* Description preview */}
      <p className="text-sm text-adobe-gray-400 line-clamp-2 mb-2">
        {item.description.substring(0, 100)}...
      </p>
      
      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-adobe-gray-500">
        {category && (
          <span className="truncate max-w-[60%]">{category.name}</span>
        )}
        <span>{formatMonthYear(item.firstSeen)}</span>
      </div>
    </div>
  );
});

// Item Detail Panel
const ItemDetailPanel = memo(function ItemDetailPanel({
  item,
  category,
  onQualityChange,
}: {
  item: Item;
  category?: Category;
  onQualityChange?: (quality: "A" | "B" | "C" | null) => void;
}) {
  const isImplemented = item.implementedStatus === "implemented";
  
  return (
    <div className="glass-card p-5 space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-1 rounded-full bg-inspiration-ideas/20 text-inspiration-ideas border border-inspiration-ideas/30">
            {item.itemType}
          </span>
          {isImplemented && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
              ✓ Implemented
            </span>
          )}
          {item.quality && (
            <span className={`text-xs px-2 py-1 rounded-full ${
              item.quality === "A" 
                ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" 
                : item.quality === "B"
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                : "bg-gray-500/20 text-gray-400 border border-gray-500/30"
            }`}>
              {item.quality === "A" ? "⭐ A-Tier" : `${item.quality}-Tier`}
            </span>
          )}
          {category && (
            <span className="text-xs px-2 py-1 rounded-full bg-adobe-gray-700 text-adobe-gray-300">
              {category.name}
            </span>
          )}
        </div>
        <h2 className="text-xl font-semibold text-white">{item.title}</h2>
      </div>
      
      {/* Quality Rating */}
      {onQualityChange && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-adobe-gray-400 uppercase tracking-wider">Quality</h4>
          <div className="flex gap-2">
            {(["A", "B", "C"] as const).map((q) => (
              <button
                key={q}
                onClick={() => onQualityChange(item.quality === q ? null : q)}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  item.quality === q
                    ? q === "A"
                      ? "bg-yellow-500/30 text-yellow-300 border border-yellow-500/50"
                      : q === "B"
                      ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                      : "bg-gray-500/30 text-gray-300 border border-gray-500/50"
                    : "bg-adobe-gray-800 text-adobe-gray-400 hover:bg-adobe-gray-700"
                }`}
              >
                {q === "A" ? "⭐ A" : q}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Description */}
      <div className="prose prose-invert prose-sm max-w-none">
        <p className="text-adobe-gray-300 whitespace-pre-wrap">{item.description}</p>
      </div>
      
      {/* Tags */}
      {item.tags && item.tags.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-adobe-gray-400 uppercase tracking-wider">Tags</h4>
          <div className="flex flex-wrap gap-1">
            {item.tags.map((tag, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded bg-adobe-gray-700 text-adobe-gray-300">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
      
      {/* Metadata */}
      <div className="space-y-2 pt-4 border-t border-adobe-gray-700">
        <h4 className="text-xs font-medium text-adobe-gray-400 uppercase tracking-wider">Details</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-adobe-gray-500">Occurrences:</span>
            <span className="ml-2 text-white">{item.occurrence}</span>
          </div>
          <div>
            <span className="text-adobe-gray-500">First seen:</span>
            <span className="ml-2 text-white">{formatMonthYear(item.firstSeen)}</span>
          </div>
          <div>
            <span className="text-adobe-gray-500">Last seen:</span>
            <span className="ml-2 text-white">{formatMonthYear(item.lastSeen)}</span>
          </div>
          <div>
            <span className="text-adobe-gray-500">Source dates:</span>
            <span className="ml-2 text-white">{item.sourceDates?.length ?? 0}</span>
          </div>
        </div>
      </div>
      
      {/* Source Dates */}
      {item.sourceDates && item.sourceDates.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-adobe-gray-400 uppercase tracking-wider">
            Appeared On ({item.sourceDates.length} dates)
          </h4>
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {item.sourceDates.slice(0, 10).map((date, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded bg-adobe-gray-800 text-adobe-gray-400">
                {date}
              </span>
            ))}
            {item.sourceDates.length > 10 && (
              <span className="text-xs px-2 py-1 text-adobe-gray-500">
                +{item.sourceDates.length - 10} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

