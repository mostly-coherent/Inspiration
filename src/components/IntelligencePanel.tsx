"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface PatternAlert {
  problemId: string;
  problemName: string;
  solutionId: string;
  solutionName: string;
  solutionType: string;
  occurrenceCount: number;
  confidence: number;
}

interface MissingLink {
  entityAId: string;
  entityAName: string;
  entityAType: string;
  entityBId: string;
  entityBName: string;
  entityBType: string;
  cooccurrenceCount: number;
  suggestedRelation: string;
  confidence: number;
}

interface EntityPath {
  pathLength: number;
  pathEntities: string[];
  pathEntityNames: string[];
  pathRelations: string[];
  pathRelationTypes: string[];
}

type IntelligenceTab = "patterns" | "missing_links" | "path";

interface IntelligencePanelProps {
  onEntityClick?: (entityId: string, entityName: string) => void;
  className?: string;
}

export default function IntelligencePanel({
  onEntityClick,
  className = "",
}: IntelligencePanelProps) {
  const [activeTab, setActiveTab] = useState<IntelligenceTab>("patterns");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [patterns, setPatterns] = useState<PatternAlert[]>([]);
  const [missingLinks, setMissingLinks] = useState<MissingLink[]>([]);
  const [paths, setPaths] = useState<EntityPath[]>([]);

  // Path finding inputs
  const [sourceEntityId, setSourceEntityId] = useState<string>("");
  const [targetEntityId, setTargetEntityId] = useState<string>("");
  const [pathLoading, setPathLoading] = useState(false);

  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch intelligence data
  const fetchIntelligence = useCallback(
    async (type: IntelligenceTab) => {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("type", type);
        params.set("limit", "20");

        const res = await fetch(`/api/kg/intelligence?${params}`, {
          signal: abortControllerRef.current.signal,
        });

        if (!isMountedRef.current) return;

        if (!res.ok) {
          const errorText = await res.text().catch(() => `HTTP ${res.status}`);
          let errorData: any = {};
          try {
            errorData = JSON.parse(errorText);
          } catch {
            // Not JSON, use text as error
          }
          throw new Error(
            (errorData && typeof errorData === 'object' && errorData.error) || errorText || `Failed to fetch intelligence data: ${res.status}`
          );
        }

        const data = await res.json().catch((parseError) => {
          throw new Error(`Invalid JSON response: ${parseError.message}`);
        });

        if (!isMountedRef.current) return;

        // Validate response structure
        if (!data || typeof data !== 'object') {
          setError("Invalid response structure");
          return;
        }

        // Set appropriate data based on type
        if (type === "patterns" && Array.isArray(data.patterns)) {
          setPatterns(data.patterns);
        } else if (type === "missing_links" && Array.isArray(data.missingLinks)) {
          setMissingLinks(data.missingLinks);
        } else {
          // No data for this type
          if (type === "patterns") {
            setPatterns([]);
          } else if (type === "missing_links") {
            setMissingLinks([]);
          }
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        if (err instanceof Error && err.name === "AbortError") return;

        console.error("Intelligence fetch error:", err);
        
        // Check if error is about missing RPC functions
        const errorMessage = err instanceof Error ? err.message : "Failed to load data";
        if (errorMessage.includes("Could not find the function") || errorMessage.includes("function") && errorMessage.includes("not found")) {
          setError("Intelligence features require SQL functions. Run add_intelligence_schema.sql in Supabase SQL Editor.");
        } else {
          setError(errorMessage);
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  // Fetch path between entities
  const fetchPath = useCallback(async () => {
    // Validate inputs
    const sourceId = sourceEntityId.trim();
    const targetId = targetEntityId.trim();

    if (!sourceId || !targetId) {
      setError("Please enter both source and target entity IDs");
      return;
    }

    // Validate UUID format
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(sourceId) || !uuidPattern.test(targetId)) {
      setError("Invalid entity ID format. Please enter valid UUIDs.");
      return;
    }

    // Cancel previous request if still in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setPathLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("type", "path");
      params.set("source_entity_id", sourceId);
      params.set("target_entity_id", targetId);

      const res = await fetch(`/api/kg/intelligence?${params}`, {
        signal: abortControllerRef.current.signal,
      });

      if (!isMountedRef.current) return;

      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        let errorData: any = {};
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // Not JSON, use text as error
        }
        throw new Error(
          (errorData && typeof errorData === 'object' && errorData.error) || errorText || `Failed to find path: ${res.status}`
        );
      }

      const data = await res.json().catch((parseError) => {
        throw new Error(`Invalid JSON response: ${parseError.message}`);
      });

      if (!isMountedRef.current) return;

      // Validate response structure
      if (!data || typeof data !== 'object') {
        setError("Invalid response structure");
        return;
      }

      if (Array.isArray(data.paths)) {
        setPaths(data.paths);
        if (data.paths.length === 0) {
          setError("No path found between these entities");
        }
      } else {
        setPaths([]);
        setError("No path data in response");
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return;

      console.error("Path finding error:", err);
      
      // Check if error is about missing RPC functions
      const errorMessage = err instanceof Error ? err.message : "Failed to find path";
      if (errorMessage.includes("Could not find the function") || errorMessage.includes("function") && errorMessage.includes("not found")) {
        setError("Path finding requires SQL functions. Run add_intelligence_schema.sql in Supabase SQL Editor.");
      } else {
        setError(errorMessage);
      }
    } finally {
      if (isMountedRef.current) {
        setPathLoading(false);
      }
    }
  }, [sourceEntityId, targetEntityId]);

  // Initial fetch and cleanup
  useEffect(() => {
    isMountedRef.current = true;
    
    // Clear paths when switching away from path tab
    if (activeTab !== "path") {
      setPaths([]);
      fetchIntelligence(activeTab);
    }
    
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [activeTab, fetchIntelligence]);

  // Render patterns
  const renderPatterns = () => {
    if (loading) {
      return (
        <div className="text-center py-8 text-slate-400">
          Loading patterns...
        </div>
      );
    }

    if (patterns.length === 0) {
      return (
        <div className="text-center py-8 text-slate-500">
          <p>No recurring patterns detected yet.</p>
          <p className="text-sm mt-1">
            Patterns appear when problems are repeatedly solved by the same
            tool/pattern.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {patterns.map((pattern, index) => (
          <div
            key={`${pattern.problemId}-${pattern.solutionId}-${index}`}
            className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/30"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-amber-400">⚠️</span>
                  <span
                    className="text-slate-200 font-medium cursor-pointer hover:text-indigo-400 transition-colors"
                    onClick={() =>
                      onEntityClick?.(pattern.problemId, pattern.problemName)
                    }
                  >
                    {pattern.problemName}
                  </span>
                  <span className="text-slate-500 text-sm">(problem)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">→</span>
                  <span
                    className="text-slate-300 cursor-pointer hover:text-indigo-400 transition-colors"
                    onClick={() =>
                      onEntityClick?.(pattern.solutionId, pattern.solutionName)
                    }
                  >
                    {pattern.solutionName}
                  </span>
                  <span className="text-slate-500 text-sm capitalize">
                    ({pattern.solutionType})
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm text-slate-300">
                  {pattern.occurrenceCount}x
                </div>
                <div className="text-xs text-slate-500">
                  {(pattern.confidence * 100).toFixed(0)}% confidence
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render missing links
  const renderMissingLinks = () => {
    if (loading) {
      return (
        <div className="text-center py-8 text-slate-400">
          Analyzing missing links...
        </div>
      );
    }

    if (missingLinks.length === 0) {
      return (
        <div className="text-center py-8 text-slate-500">
          <p>No missing links detected.</p>
          <p className="text-sm mt-1">
            Missing links appear when entities co-occur but don't have explicit
            relations.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {missingLinks.map((link, index) => (
          <div
            key={`${link.entityAId}-${link.entityBId}-${index}`}
            className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/30"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-slate-200 font-medium cursor-pointer hover:text-indigo-400 transition-colors"
                    onClick={() =>
                      onEntityClick?.(link.entityAId, link.entityAName)
                    }
                  >
                    {link.entityAName}
                  </span>
                  <span className="text-purple-400 font-medium">
                    {link.suggestedRelation}
                  </span>
                  <span
                    className="text-slate-300 cursor-pointer hover:text-indigo-400 transition-colors"
                    onClick={() =>
                      onEntityClick?.(link.entityBId, link.entityBName)
                    }
                  >
                    {link.entityBName}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  Co-occurred {link.cooccurrenceCount} times
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-slate-500">
                  {(link.confidence * 100).toFixed(0)}% confidence
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render path finding
  const renderPathFinding = () => {
    return (
      <div className="space-y-4">
        {/* Input form */}
        <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/30">
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Source Entity ID
              </label>
              <input
                type="text"
                value={sourceEntityId}
                onChange={(e) => setSourceEntityId(e.target.value)}
                placeholder="Enter UUID..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Target Entity ID
              </label>
              <input
                type="text"
                value={targetEntityId}
                onChange={(e) => setTargetEntityId(e.target.value)}
                placeholder="Enter UUID..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              onClick={fetchPath}
              disabled={pathLoading || !sourceEntityId.trim() || !targetEntityId.trim()}
              className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              {pathLoading ? "Finding path..." : "Find Path"}
            </button>
          </div>
        </div>

        {/* Path results */}
        {paths.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-300">
              Found {paths.length} path{paths.length !== 1 ? "s" : ""}:
            </h3>
            {paths.map((path, index) => {
              // Create stable key from path entities
              const pathKey = path.pathEntities.join("-") || `path-${index}`;
              return (
                <div
                  key={pathKey}
                  className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/30"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {path.pathEntityNames.map((name, i) => {
                      const entityId = path.pathEntities[i];
                      if (!entityId || !name) return null;
                      
                      return (
                        <div key={`${pathKey}-${i}`} className="flex items-center gap-2">
                          <span
                            className="text-slate-200 cursor-pointer hover:text-indigo-400 transition-colors"
                            onClick={() => onEntityClick?.(entityId, name)}
                          >
                            {name}
                          </span>
                          {i < path.pathEntityNames.length - 1 && (
                            <span className="text-purple-400">
                              {path.pathRelationTypes[i] || "→"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-xs text-slate-500 mt-2">
                    Path length: {path.pathLength} hop{path.pathLength !== 1 ? "s" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Tab Navigation */}
      <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab("patterns")}
          className={`px-3 py-1.5 text-sm rounded transition-colors ${
            activeTab === "patterns"
              ? "bg-slate-700 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          🔍 Patterns
        </button>
        <button
          onClick={() => setActiveTab("missing_links")}
          className={`px-3 py-1.5 text-sm rounded transition-colors ${
            activeTab === "missing_links"
              ? "bg-slate-700 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          🔗 Missing Links
        </button>
        <button
          onClick={() => setActiveTab("path")}
          className={`px-3 py-1.5 text-sm rounded transition-colors ${
            activeTab === "path"
              ? "bg-slate-700 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          🗺️ Path Finding
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Content based on active tab */}
      {activeTab === "patterns" && renderPatterns()}
      {activeTab === "missing_links" && renderMissingLinks()}
      {activeTab === "path" && renderPathFinding()}
    </div>
  );
}
