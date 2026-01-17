"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import EvolutionTimeline from "./EvolutionTimeline";

// Entity type icons and colors
const ENTITY_TYPE_CONFIG: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  tool: { icon: "🔧", label: "Tools", color: "text-blue-400" },
  pattern: { icon: "🧩", label: "Patterns", color: "text-purple-400" },
  problem: { icon: "⚠️", label: "Problems", color: "text-amber-400" },
  concept: { icon: "💡", label: "Concepts", color: "text-emerald-400" },
  person: { icon: "👤", label: "People", color: "text-pink-400" },
  project: { icon: "📁", label: "Projects", color: "text-cyan-400" },
  workflow: { icon: "🔄", label: "Workflows", color: "text-orange-400" },
};

interface Entity {
  id: string;
  name: string;
  type: string;
  aliases: string[];
  mentionCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  confidence: number;
}

interface EntityMention {
  id: string;
  contextSnippet: string;
  timestamp: number;
  // Provenance (enriched from mention-sources API)
  messageId?: string;
  guestName?: string | null;
  episodeTitle?: string | null;
  youtubeUrl?: string | null;
  durationHuman?: string | null;
  publishedDate?: string | null;
  chunkIndex?: string | null;
}

interface EnrichedSource {
  mentionId: string;
  entityId: string;
  messageId: string;
  contextSnippet: string;
  timestamp: number;
  episodeSlug: string | null;
  guestName: string | null;
  episodeTitle: string | null;
  youtubeUrl: string | null;
  videoId: string | null;
  durationHuman: string | null;
  publishedDate: string | null;
  chunkIndex: string | null;
}

interface EntityRelation {
  id: string;
  entityId: string;
  entityName: string;
  entityType: string;
  relationType: string;
  evidenceSnippet: string | null;
  confidence: number;
  occurrenceCount: number;
}

interface EntityRelations {
  outgoing: EntityRelation[];
  incoming: EntityRelation[];
}

// Relation type display config
const RELATION_TYPE_CONFIG: Record<string, { label: string; arrow: string }> = {
  SOLVES: { label: "solves", arrow: "→" },
  CAUSES: { label: "causes", arrow: "→" },
  ENABLES: { label: "enables", arrow: "→" },
  PART_OF: { label: "part of", arrow: "⊂" },
  USED_WITH: { label: "used with", arrow: "↔" },
  ALTERNATIVE_TO: { label: "alternative to", arrow: "≈" },
  REQUIRES: { label: "requires", arrow: "→" },
  IMPLEMENTS: { label: "implements", arrow: "→" },
  MENTIONED_BY: { label: "mentioned by", arrow: "←" },
};

interface EntityExplorerProps {
  onEntitySelect?: (entity: Entity) => void;
}

export default function EntityExplorer({ onEntitySelect }: EntityExplorerProps) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [mentions, setMentions] = useState<EntityMention[]>([]);
  const [relations, setRelations] = useState<EntityRelations>({ outgoing: [], incoming: [] });
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"mentions" | "relations" | "evolution">("mentions");

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("mentions");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [confidenceFilter, setConfidenceFilter] = useState<string>("all"); // "all", "high", "medium", "low"

  // Refs for cleanup and debouncing
  const isMountedRef = useRef(true);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch entities
  const fetchEntities = useCallback(async () => {
    // Cancel previous request if still in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      params.set("sort", sortBy);
      params.set("limit", "100");
      if (searchQuery) params.set("search", searchQuery);
      if (confidenceFilter !== "all") params.set("confidence", confidenceFilter);

      const res = await fetch(`/api/kg/entities?${params}`, {
        signal: abortControllerRef.current.signal,
      });
      
      if (!isMountedRef.current) return;
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Failed to fetch entities: ${errorText.length > 100 ? res.status : errorText}`);
      }

      const data = await res.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      if (!isMountedRef.current) return;
      
      if (data && typeof data === 'object' && Array.isArray(data.entities)) {
        setEntities(data.entities);
      } else {
        setEntities([]);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      
      // Don't set error if request was aborted
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load entities");
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [typeFilter, sortBy, searchQuery]);

  // Fetch entity detail (mentions + relations)
  const fetchEntityDetail = useCallback(async (entity: Entity) => {
    // Cancel previous detail request if still in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setSelectedEntity(entity);
    setLoadingDetail(true);
    setMentions([]); // Clear previous mentions
    setRelations({ outgoing: [], incoming: [] }); // Clear previous relations
    onEntitySelect?.(entity);

    try {
      // Fetch mentions and relations in parallel
      const [mentionsRes, relationsRes] = await Promise.all([
        fetch("/api/kg/entities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityId: entity.id }),
          signal: abortControllerRef.current.signal,
        }),
        fetch(`/api/kg/relations?entity_id=${entity.id}`, {
          signal: abortControllerRef.current.signal,
        }),
      ]);

      if (!isMountedRef.current) return;

      // Process mentions
      if (mentionsRes.ok) {
        const mentionsData = await mentionsRes.json().catch((parseError) => {
          throw new Error(`Invalid response format: ${parseError.message}`);
        });
        const rawMentions = (mentionsData && typeof mentionsData === 'object' && Array.isArray(mentionsData.mentions)) 
          ? mentionsData.mentions 
          : [];
        
        // Fetch enriched sources (provenance) for Lenny's mentions
        if (rawMentions.length > 0 && isMountedRef.current) {
          try {
            const mentionIds = rawMentions.map((m: EntityMention) => m.id).join(",");
            const sourcesRes = await fetch(`/api/kg/mention-sources?ids=${mentionIds}`, {
              signal: abortControllerRef.current.signal,
            });
            
            if (sourcesRes.ok && isMountedRef.current) {
              const sourcesData = await sourcesRes.json().catch((parseError) => {
                throw new Error(`Invalid response format: ${parseError.message}`);
              });
              const sourcesArray = (sourcesData && typeof sourcesData === 'object' && Array.isArray(sourcesData.sources))
                ? sourcesData.sources
                : [];
              const sourcesMap = new Map<string, EnrichedSource>(
                sourcesArray.map((s: EnrichedSource) => [s.mentionId, s])
              );
              
              // Enrich mentions with provenance data
              const enrichedMentions = rawMentions.map((mention: EntityMention) => {
                const source = sourcesMap.get(mention.id);
                return {
                  ...mention,
                  messageId: source?.messageId,
                  guestName: source?.guestName,
                  episodeTitle: source?.episodeTitle,
                  youtubeUrl: source?.youtubeUrl,
                  durationHuman: source?.durationHuman,
                  publishedDate: source?.publishedDate,
                  chunkIndex: source?.chunkIndex,
                };
              });
              
              if (isMountedRef.current) {
                setMentions(enrichedMentions);
              }
            } else {
              // Fallback to raw mentions if enrichment fails
              if (isMountedRef.current) {
                setMentions(rawMentions);
              }
            }
          } catch (sourcesErr) {
            // Fallback to raw mentions if enrichment fails
            console.warn("Failed to fetch enriched sources:", sourcesErr);
            if (isMountedRef.current) {
              setMentions(rawMentions);
            }
          }
        } else if (isMountedRef.current) {
          setMentions(rawMentions);
        }
        
        if (mentionsData.mentionsError) {
          console.warn("Mentions fetch had errors:", mentionsData.mentionsError);
        }
      }

      // Process relations
      if (relationsRes.ok) {
        try {
          const relationsData = await relationsRes.json().catch((parseError) => {
            throw new Error(`Invalid response format: ${parseError.message}`);
          });
          
          if (!isMountedRef.current) return;
          
          if (relationsData && typeof relationsData === 'object') {
            setRelations({
              outgoing: (Array.isArray(relationsData.outgoing) ? relationsData.outgoing : []).map((r: Record<string, unknown>) => ({
                id: r.id as string,
                entityId: r.target_entity_id as string,
                entityName: (r.target_name as string) || "Unknown",
                entityType: (r.target_type as string) || "unknown",
                relationType: (r.relation_type as string) || "",
                evidenceSnippet: (r.evidence_snippet as string) || null,
                confidence: (r.confidence as number) || 0.8,
                occurrenceCount: (r.occurrence_count as number) || 1,
              })),
              incoming: (Array.isArray(relationsData.incoming) ? relationsData.incoming : []).map((r: Record<string, unknown>) => ({
                id: r.id as string,
                entityId: r.source_entity_id as string,
                entityName: (r.source_name as string) || "Unknown",
                entityType: (r.source_type as string) || "unknown",
                relationType: (r.relation_type as string) || "",
                evidenceSnippet: (r.evidence_snippet as string) || null,
                confidence: (r.confidence as number) || 0.8,
                occurrenceCount: (r.occurrence_count as number) || 1,
              })),
            });
          } else {
            // Invalid response structure
            setRelations({ outgoing: [], incoming: [] });
          }
        } catch (jsonErr) {
          console.error("Failed to parse relations JSON:", jsonErr);
          if (isMountedRef.current) {
            setRelations({ outgoing: [], incoming: [] });
          }
        }
      } else {
        // Relations fetch failed, but don't show error (may not have relations yet)
        const errorText = await relationsRes.text().catch(() => `HTTP ${relationsRes.status}`);
        console.warn(`Relations fetch failed: ${errorText.length > 100 ? relationsRes.status : errorText}`);
        if (isMountedRef.current) {
          setRelations({ outgoing: [], incoming: [] });
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;

      // Don't set error if request was aborted
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      console.error("Failed to load entity detail:", err);
      setMentions([]);
      setRelations({ outgoing: [], incoming: [] });
      setError("Failed to load entity details. Please try again.");
    } finally {
      if (isMountedRef.current) {
        setLoadingDetail(false);
      }
    }
  }, [onEntitySelect]);

  // Debounced search effect
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search query changes (but not type/sort changes)
    if (searchQuery !== undefined) {
      searchTimeoutRef.current = setTimeout(() => {
        fetchEntities();
      }, 300); // 300ms debounce
    } else {
      fetchEntities();
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [typeFilter, sortBy, searchQuery, confidenceFilter, fetchEntities]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  // Get confidence badge
  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) {
      return { emoji: "🟢", label: "High", color: "text-emerald-400" };
    } else if (confidence >= 0.5) {
      return { emoji: "🟡", label: "Medium", color: "text-yellow-400" };
    } else {
      return { emoji: "🟠", label: "Low", color: "text-orange-400" };
    }
  };

  // Format timestamp
  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* Entity List */}
      <div className="lg:w-1/2 flex flex-col">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-slate-100 mb-3">
            🔮 Entity Explorer
          </h2>

          {/* Search */}
          <input
            type="text"
            placeholder="Search entities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600 mb-3"
          />

          {/* Type Filter Tabs */}
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => setTypeFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                typeFilter === "all"
                  ? "bg-slate-600 text-white"
                  : "bg-slate-800/50 text-slate-400 hover:bg-slate-700/50"
              }`}
            >
              All
            </button>
            {Object.entries(ENTITY_TYPE_CONFIG).map(([type, config]) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  typeFilter === type
                    ? "bg-slate-600 text-white"
                    : "bg-slate-800/50 text-slate-400 hover:bg-slate-700/50"
                }`}
              >
                {config.icon} {config.label}
              </button>
            ))}
          </div>

          {/* Sort & Confidence Filter */}
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <span>Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-slate-800/50 border border-slate-700/50 rounded px-2 py-1 text-slate-300"
              >
                <option value="mentions">Most Mentioned</option>
                <option value="recent">Most Recent</option>
                <option value="name">Name (A-Z)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span>Confidence:</span>
              <select
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value)}
                className="bg-slate-800/50 border border-slate-700/50 rounded px-2 py-1 text-slate-300"
              >
                <option value="all">All</option>
                <option value="high">🟢 High (≥0.8)</option>
                <option value="medium">🟡 Medium (0.5-0.8)</option>
                <option value="low">🟠 Low (&lt;0.5)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Entity List */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <div className="text-slate-400 text-center py-8">Loading entities...</div>
          ) : error ? (
            <div className="text-red-400 text-center py-8">{error}</div>
          ) : entities.length === 0 ? (
            <div className="text-slate-400 text-center py-8">
              No entities found. Run the indexer to extract entities from your chat history.
            </div>
          ) : (
            entities.map((entity) => {
              const config = ENTITY_TYPE_CONFIG[entity.type] || {
                icon: "❓",
                label: entity.type,
                color: "text-slate-400",
              };
              const isSelected = selectedEntity?.id === entity.id;

              return (
                <button
                  key={entity.id}
                  onClick={() => fetchEntityDetail(entity)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    isSelected
                      ? "bg-slate-700/70 border-slate-600"
                      : "bg-slate-800/30 border-slate-700/30 hover:bg-slate-800/50 hover:border-slate-700/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span>{config.icon}</span>
                        <span className="font-medium text-slate-200 truncate">
                          {entity.name}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-1 flex-wrap">
                        <span className={config.color}>{config.label}</span>
                        <span className="mx-1">•</span>
                        <span>{formatDate(entity.firstSeen)} → {formatDate(entity.lastSeen)}</span>
                        {entity.confidence !== undefined && (
                          <>
                            <span className="mx-1">•</span>
                            <span className={getConfidenceBadge(entity.confidence).color}>
                              {getConfidenceBadge(entity.confidence).emoji} {getConfidenceBadge(entity.confidence).label}
                            </span>
                          </>
                        )}
                      </div>
                      {entity.aliases.length > 0 && (
                        <div className="text-xs text-slate-500 mt-1 truncate">
                          Also: {entity.aliases.join(", ")}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-medium text-slate-300">
                        {entity.mentionCount}
                      </div>
                      <div className="text-xs text-slate-500">mentions</div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Entity Detail Panel */}
      <div className="lg:w-1/2 bg-slate-800/30 border border-slate-700/30 rounded-xl p-4">
        {!selectedEntity ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            Select an entity to see details
          </div>
        ) : loadingDetail ? (
          <div className="h-full flex items-center justify-center text-slate-400">
            Loading...
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* Entity Header */}
            <div className="mb-4 pb-4 border-b border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">
                  {ENTITY_TYPE_CONFIG[selectedEntity.type]?.icon || "❓"}
                </span>
                <h3 className="text-xl font-semibold text-slate-100">
                  {selectedEntity.name}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <span
                  className={`px-2 py-0.5 rounded ${
                    ENTITY_TYPE_CONFIG[selectedEntity.type]?.color || "text-slate-400"
                  } bg-slate-700/50`}
                >
                  {ENTITY_TYPE_CONFIG[selectedEntity.type]?.label || selectedEntity.type}
                </span>
                {selectedEntity.confidence !== undefined && (
                  <span
                    className={`px-2 py-0.5 rounded ${
                      getConfidenceBadge(selectedEntity.confidence).color
                    } bg-slate-700/50`}
                  >
                    {getConfidenceBadge(selectedEntity.confidence).emoji}{" "}
                    {getConfidenceBadge(selectedEntity.confidence).label} (
                    {(selectedEntity.confidence * 100).toFixed(0)}%)
                  </span>
                )}
                <span className="text-slate-400">
                  {selectedEntity.mentionCount} mentions
                </span>
                <span className="text-slate-500">
                  {formatDate(selectedEntity.firstSeen)} → {formatDate(selectedEntity.lastSeen)}
                </span>
              </div>
              {selectedEntity.aliases.length > 0 && (
                <div className="mt-2 text-sm text-slate-400">
                  <span className="text-slate-500">Aliases:</span>{" "}
                  {selectedEntity.aliases.join(", ")}
                </div>
              )}
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setDetailTab("mentions")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  detailTab === "mentions"
                    ? "bg-slate-600 text-white"
                    : "bg-slate-800/50 text-slate-400 hover:bg-slate-700/50"
                }`}
              >
                💬 Mentions ({mentions.length})
              </button>
              <button
                onClick={() => setDetailTab("relations")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  detailTab === "relations"
                    ? "bg-slate-600 text-white"
                    : "bg-slate-800/50 text-slate-400 hover:bg-slate-700/50"
                }`}
              >
                🔗 Relations ({relations.outgoing.length + relations.incoming.length})
              </button>
              <button
                onClick={() => setDetailTab("evolution")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  detailTab === "evolution"
                    ? "bg-slate-600 text-white"
                    : "bg-slate-800/50 text-slate-400 hover:bg-slate-700/50"
                }`}
              >
                📈 Timeline
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
              {detailTab === "evolution" ? (
                /* Evolution Tab */
                <EvolutionTimeline
                  entityId={selectedEntity.id}
                  className="h-full"
                />
              ) : detailTab === "mentions" ? (
                /* Mentions Tab */
                <>
                  {mentions.length === 0 ? (
                    <div className="text-slate-500 text-sm">No mentions found</div>
                  ) : (
                    <div className="space-y-3">
                      {mentions.map((mention) => (
                        <div
                          key={mention.id}
                          className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/30"
                        >
                          {/* Episode Header (if from Lenny's podcast) */}
                          {mention.guestName && (
                            <div className="mb-2 pb-2 border-b border-slate-700/30">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-lg">🎙️</span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-slate-200">
                                    {mention.guestName}
                                  </div>
                                  {mention.episodeTitle && (
                                    <div className="text-xs text-slate-400 truncate">
                                      {mention.episodeTitle}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {mention.youtubeUrl && (
                                <a
                                  href={mention.youtubeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                  <span>📺</span>
                                  <span>Watch on YouTube</span>
                                  {mention.durationHuman && (
                                    <span className="text-slate-500">• {mention.durationHuman}</span>
                                  )}
                                </a>
                              )}
                              {mention.publishedDate && (
                                <div className="text-xs text-slate-500 mt-1">
                                  Published: {new Date(mention.publishedDate).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Timestamp (for non-Lenny mentions) */}
                          {!mention.guestName && (
                            <div className="text-xs text-slate-500 mb-1">
                              {formatTimestamp(mention.timestamp)}
                            </div>
                          )}
                          
                          {/* Context Snippet */}
                          <div className="text-sm text-slate-300 leading-relaxed">
                            {mention.contextSnippet}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                /* Relations Tab */
                <>
                  {relations.outgoing.length === 0 && relations.incoming.length === 0 ? (
                    <div className="text-slate-500 text-sm">
                      No relations found. Run indexing with --with-relations to extract relationships.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Outgoing Relations */}
                      {relations.outgoing.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-slate-500 uppercase mb-2">
                            Outgoing ({relations.outgoing.length})
                          </h5>
                          <div className="space-y-2">
                            {relations.outgoing.map((rel) => {
                              const relConfig = RELATION_TYPE_CONFIG[rel.relationType] || {
                                label: rel.relationType.toLowerCase(),
                                arrow: "→",
                              };
                              const entityConfig = ENTITY_TYPE_CONFIG[rel.entityType] || {
                                icon: "❓",
                                label: rel.entityType,
                                color: "text-slate-400",
                              };
                              return (
                                <div
                                  key={rel.id}
                                  className="p-2 bg-slate-800/50 rounded-lg border border-slate-700/30"
                                >
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="text-slate-400">{relConfig.arrow}</span>
                                    <span className="text-purple-400 font-medium">
                                      {relConfig.label}
                                    </span>
                                    <span>{entityConfig.icon}</span>
                                    <span className="text-slate-200">{rel.entityName}</span>
                                    {rel.occurrenceCount > 1 && (
                                      <span className="text-xs text-slate-500">
                                        (×{rel.occurrenceCount})
                                      </span>
                                    )}
                                  </div>
                                  {rel.evidenceSnippet && (
                                    <div className="text-xs text-slate-500 mt-1 italic">
                                      &ldquo;{rel.evidenceSnippet.substring(0, 100)}...&rdquo;
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Incoming Relations */}
                      {relations.incoming.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-slate-500 uppercase mb-2">
                            Incoming ({relations.incoming.length})
                          </h5>
                          <div className="space-y-2">
                            {relations.incoming.map((rel) => {
                              const relConfig = RELATION_TYPE_CONFIG[rel.relationType] || {
                                label: rel.relationType.toLowerCase(),
                                arrow: "←",
                              };
                              const entityConfig = ENTITY_TYPE_CONFIG[rel.entityType] || {
                                icon: "❓",
                                label: rel.entityType,
                                color: "text-slate-400",
                              };
                              return (
                                <div
                                  key={rel.id}
                                  className="p-2 bg-slate-800/50 rounded-lg border border-slate-700/30"
                                >
                                  <div className="flex items-center gap-2 text-sm">
                                    <span>{entityConfig.icon}</span>
                                    <span className="text-slate-200">{rel.entityName}</span>
                                    <span className="text-purple-400 font-medium">
                                      {relConfig.label}
                                    </span>
                                    <span className="text-slate-400">←</span>
                                    <span className="text-slate-300">{selectedEntity.name}</span>
                                    {rel.occurrenceCount > 1 && (
                                      <span className="text-xs text-slate-500">
                                        (×{rel.occurrenceCount})
                                      </span>
                                    )}
                                  </div>
                                  {rel.evidenceSnippet && (
                                    <div className="text-xs text-slate-500 mt-1 italic">
                                      &ldquo;{rel.evidenceSnippet.substring(0, 100)}...&rdquo;
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
