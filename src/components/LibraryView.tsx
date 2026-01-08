"use client";

import { useState, useEffect, useMemo, memo } from "react";

interface Item {
  id: string;
  itemType: string;
  title: string;
  description: string;
  tags: string[];
  status: "active" | "implemented" | "posted" | "archived";
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

interface LibraryData {
  items: Item[];
  categories: Category[];
  stats: {
    totalItems: number;
    totalCategories: number;
    implementedCount: number;
  };
}

type SortOption = "recent" | "oldest" | "occurrence" | "alphabetical";

interface FilterState {
  search: string;
  itemType: "all" | string;
  status: "all" | "implemented" | "pending";
  tag: "all" | string;
  sort: SortOption;
}

export const LibraryView = memo(function LibraryView() {
  const [data, setData] = useState<LibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    itemType: "all",
    status: "all",
    tag: "all",
    sort: "recent",
  });

  // Fetch library data
  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        const res = await fetch("/api/items");
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
  }, []);

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
    
    // Tag filter
    if (filters.tag !== "all") {
      items = items.filter((item) => item.tags?.includes(filters.tag));
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        
        {/* Stats Bar */}
        <div className="flex items-center justify-between text-sm text-adobe-gray-400 px-2">
          <span>Showing {filteredItems.length} of {data?.stats.totalItems || 0} items</span>
          <span>{data?.stats.implementedCount || 0} implemented</span>
        </div>
        
        {/* Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              isSelected={selectedItem?.id === item.id}
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
      </div>
      
      {/* Item Detail Panel */}
      <div className="lg:col-span-1">
        <div className="lg:sticky lg:top-6">
          {selectedItem ? (
            <ItemDetailPanel item={selectedItem} category={categories.find((c) => c.id === selectedItem.categoryId)} />
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
  onClick,
  category,
}: {
  item: Item;
  isSelected: boolean;
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
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border transition-all ${
        isSelected
          ? "bg-adobe-gray-700/50 border-inspiration-ideas"
          : "bg-adobe-gray-800/30 border-adobe-gray-700/50 hover:border-adobe-gray-600"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
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
        <span>{new Date(item.firstSeen).toLocaleDateString()}</span>
      </div>
    </button>
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
            <span className="ml-2 text-white">{new Date(item.firstSeen).toLocaleDateString()}</span>
          </div>
          <div>
            <span className="text-adobe-gray-500">Last seen:</span>
            <span className="ml-2 text-white">{new Date(item.lastSeen).toLocaleDateString()}</span>
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

