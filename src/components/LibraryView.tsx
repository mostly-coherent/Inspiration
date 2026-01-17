"use client";

import { useState, useEffect, useMemo, memo, useRef } from "react";

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
  occurrence: number;
  categoryId: string | null;
  firstSeen: string;
  lastSeen: string;
  sourceDates?: string[];
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
  };
  pagination: PaginationInfo | null;
}

type SortOption = "recent" | "oldest";

interface FilterState {
  search: string;
  itemType: "all" | string;
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
  const [bulkActionError, setBulkActionError] = useState<string | null>(null);
  
  // Cleanup state
  const [staleCount, setStaleCount] = useState<number>(0);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  
  // Prevent state updates after unmount
  const isMountedRef = useRef(true);
  
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    itemType: "all",
    category: "all",
    sort: "recent",
  });

  // Initialize isMountedRef
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch library data with pagination
  useEffect(() => {
    const fetchLibrary = async () => {
      if (!isMountedRef.current) return;
      
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          pageSize: pageSize.toString(),
        });
        const res = await fetch(`/api/items?${params}`);
        if (!res.ok) {
          const errorText = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(`Failed to fetch library: ${errorText.length > 100 ? res.status : errorText}`);
        }
        
        const json = await res.json().catch((parseError) => {
          throw new Error(`Invalid response format: ${parseError.message}`);
        });
        
        if (!isMountedRef.current) return;
        
        if (json.success) {
          setData(json);
        } else {
          throw new Error(json.error || "Unknown error");
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
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
          item.description.toLowerCase().includes(searchLower)
      );
    }
    
    // Type filter
    if (filters.itemType !== "all") {
      items = items.filter((item) => item.itemType === filters.itemType);
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
        items.sort((a, b) => {
          const dateA = a.lastSeen ? new Date(a.lastSeen) : new Date(0);
          const dateB = b.lastSeen ? new Date(b.lastSeen) : new Date(0);
          const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
          const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
          return timeB - timeA; // Most recent first
        });
        break;
      case "oldest":
        items.sort((a, b) => {
          const dateA = a.firstSeen ? new Date(a.firstSeen) : new Date(0);
          const dateB = b.firstSeen ? new Date(b.firstSeen) : new Date(0);
          const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
          const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
          return timeA - timeB; // Oldest first
        });
        break;
    }
    
    return items;
  }, [data?.items, filters]);

  // Get categories for item display
  const categories = useMemo(() => {
    return data?.categories || [];
  }, [data?.categories]);

  // Refetch library data
  const refetchLibrary = async () => {
    if (!isMountedRef.current) return;
    
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
      });
      const res = await fetch(`/api/items?${params}`);
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Failed to refetch library: ${errorText.length > 100 ? res.status : errorText}`);
      }
      
      const json = await res.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (!isMountedRef.current) return;
      
      if (json.success) {
        setData(json);
      } else {
        throw new Error(json.error || "Refetch failed");
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("Refetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to refresh library");
    }
  };

  // Fetch stale items count
  const fetchStaleCount = async () => {
    if (!isMountedRef.current) return;
    
    try {
      const res = await fetch("/api/items/cleanup");
      if (res.ok) {
        const json = await res.json().catch(() => ({ staleCount: 0 }));
        if (!isMountedRef.current) return;
        setStaleCount(json.staleCount || 0);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("Stale count error:", err);
      // Fail silently - stale count is optional
    }
  };

  // Fetch stale count on load
  useEffect(() => {
    if (data) {
      fetchStaleCount();
    }
  }, [data]);

  // Run cleanup
  const runCleanup = async () => {
    if (staleCount === 0) return;
    if (!confirm(`Archive ${staleCount} stale items? (Items not seen in >90 days)`)) return;
    
    if (!isMountedRef.current) return;
    setCleanupLoading(true);
    setCleanupError(null);
    
    try {
      const res = await fetch("/api/items/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Cleanup failed: ${errorText.length > 100 ? res.status : errorText}`);
      }
      
      const json = await res.json().catch(() => ({ success: false }));
      
      if (!isMountedRef.current) return;
      
      if (json.success) {
        await refetchLibrary();
        await fetchStaleCount();
      } else {
        throw new Error(json.error || "Cleanup failed");
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("Cleanup error:", err);
      setCleanupError(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      if (isMountedRef.current) {
        setCleanupLoading(false);
      }
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
    if (!isMountedRef.current) return;
    
    setBulkActionLoading(true);
    setBulkActionError(null);
    
    try {
      const res = await fetch("/api/items/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), status: "archived" }),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Archive failed: ${errorText.length > 100 ? res.status : errorText}`);
      }
      
      const json = await res.json().catch(() => ({ success: false }));
      
      if (!isMountedRef.current) return;
      
      if (json.success) {
        setSelectedIds(new Set());
        await refetchLibrary();
      } else {
        throw new Error(json.error || "Archive failed");
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("Bulk archive error:", err);
      setBulkActionError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      if (isMountedRef.current) {
        setBulkActionLoading(false);
      }
    }
  };

  // Bulk delete
  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} items? This cannot be undone.`)) return;
    if (!isMountedRef.current) return;
    
    setBulkActionLoading(true);
    setBulkActionError(null);
    
    try {
      const res = await fetch("/api/items/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Delete failed: ${errorText.length > 100 ? res.status : errorText}`);
      }
      
      const json = await res.json().catch(() => ({ success: false }));
      
      if (!isMountedRef.current) return;
      
      if (json.success) {
        setSelectedIds(new Set());
        await refetchLibrary();
      } else {
        throw new Error(json.error || "Delete failed");
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("Bulk delete error:", err);
      setBulkActionError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      if (isMountedRef.current) {
        setBulkActionLoading(false);
      }
    }
  };

  // Bulk status change
  const bulkSetStatus = async (status: string) => {
    if (selectedIds.size === 0) return;
    if (!status || status.trim() === "") return;
    if (!isMountedRef.current) return;
    
    setBulkActionLoading(true);
    setBulkActionError(null);
    
    try {
      const res = await fetch("/api/items/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), status }),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Status update failed: ${errorText.length > 100 ? res.status : errorText}`);
      }
      
      const json = await res.json().catch(() => ({ success: false }));
      
      if (!isMountedRef.current) return;
      
      if (json.success) {
        setSelectedIds(new Set());
        await refetchLibrary();
      } else {
        throw new Error(json.error || "Status update failed");
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("Bulk status change error:", err);
      setBulkActionError(err instanceof Error ? err.message : "Status update failed");
    } finally {
      if (isMountedRef.current) {
        setBulkActionLoading(false);
      }
    }
  };

  // Merge selected items into one
  const mergeSelected = async () => {
    if (selectedIds.size < 2) return;
    if (!confirm(`Merge ${selectedIds.size} items into one? The item with highest occurrence will be kept, others deleted.`)) return;
    if (!isMountedRef.current) return;
    
    setBulkActionLoading(true);
    setBulkActionError(null);
    
    try {
      const res = await fetch("/api/items/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Merge failed: ${errorText.length > 100 ? res.status : errorText}`);
      }
      
      const json = await res.json().catch(() => ({ success: false }));
      
      if (!isMountedRef.current) return;
      
      if (json.success) {
        setSelectedIds(new Set());
        await refetchLibrary();
      } else {
        throw new Error(json.error || "Merge failed");
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("Merge error:", err);
      setBulkActionError(err instanceof Error ? err.message : "Merge failed");
    } finally {
      if (isMountedRef.current) {
        setBulkActionLoading(false);
      }
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
            
            {/* Sort */}
            <select
              value={filters.sort}
              onChange={(e) => setFilters({ ...filters, sort: e.target.value as SortOption })}
              aria-label="Sort items by"
              className="px-3 py-2 bg-adobe-gray-800 border border-adobe-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-inspiration-ideas"
            >
              <option value="recent">Most Recent</option>
              <option value="oldest">Oldest First</option>
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
          
          {/* Error Message */}
          {(bulkActionError || cleanupError) && (
            <div className="text-xs text-red-400" role="alert">
              {bulkActionError || cleanupError}
            </div>
          )}
          
          {/* Bulk Action Buttons */}
          {selectedIds.size > 0 ? (
            <div className="flex items-center gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    bulkSetStatus(e.target.value);
                    e.target.value = "";
                  }
                }}
                disabled={bulkActionLoading}
                className="px-2 py-1 bg-adobe-gray-800 border border-adobe-gray-700 rounded text-xs text-white"
                defaultValue=""
              >
                <option value="" disabled>Set Status...</option>
                <option value="active">Active</option>
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
              {staleCount > 0 && (
                <button
                  onClick={runCleanup}
                  disabled={cleanupLoading}
                  className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-xs hover:bg-orange-500/30 transition-colors disabled:opacity-50"
                >
                  {cleanupLoading ? "Cleaning..." : `🧹 Clean up ${staleCount} stale`}
                </button>
              )}
              {cleanupError && (
                <span className="text-xs text-red-400" role="alert">
                  {cleanupError}
                </span>
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
        </div>
        <span className="text-xs text-adobe-gray-500">
          ×{item.occurrence}
        </span>
      </div>
      
      {/* Title */}
      <h3 className="font-medium text-white mb-1 line-clamp-2">{item.title}</h3>
      
      {/* Description preview */}
      {item.description && (
        <p className="text-sm text-adobe-gray-400 line-clamp-2 mb-2">
          {item.description.length > 100 
            ? `${item.description.substring(0, 100)}...` 
            : item.description}
        </p>
      )}
      
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
}: {
  item: Item;
  category?: Category;
}) {
  return (
    <div className="glass-card p-5 space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-1 rounded-full bg-inspiration-ideas/20 text-inspiration-ideas border border-inspiration-ideas/30">
            {item.itemType}
          </span>
          {category && (
            <span className="text-xs px-2 py-1 rounded-full bg-adobe-gray-700 text-adobe-gray-300">
              {category.name}
            </span>
          )}
        </div>
        <h2 className="text-xl font-semibold text-white">{item.title}</h2>
      </div>
      
      {/* Description */}
      <div className="prose prose-invert prose-sm max-w-none">
        <p className="text-adobe-gray-300 whitespace-pre-wrap">{item.description}</p>
      </div>
      
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
