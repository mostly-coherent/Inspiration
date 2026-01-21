"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";

// Dynamically import ForceGraph2D from react-force-graph-2d to avoid SSR issues
// react-force-graph-2d doesn't include AFRAME dependencies (unlike react-force-graph)
// Using any type due to lack of proper TS types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D: any = dynamic(
  async () => {
    const mod: any = await import("react-force-graph-2d");
    // react-force-graph-2d exports ForceGraph2D as default
    const Component = mod.default || mod.ForceGraph2D || mod;
    if (!Component) {
      throw new Error("Failed to load ForceGraph2D component from react-force-graph-2d");
    }
    return Component;
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-slate-400">
        Loading graph...
      </div>
    ),
  }
);

// Entity type colors matching EntityExplorer
const ENTITY_TYPE_COLORS: Record<string, string> = {
  tool: "#60a5fa", // blue-400
  pattern: "#c084fc", // purple-400
  problem: "#fbbf24", // amber-400
  concept: "#34d399", // emerald-400
  person: "#f472b6", // pink-400
  project: "#22d3ee", // cyan-400
  workflow: "#fb923c", // orange-400
  episode: "#a78bfa", // violet-400 (backbone nodes - episodes)
  other: "#94a3b8", // slate-400 (for emergent/uncategorized entities)
};

// Relation type colors
const RELATION_TYPE_COLORS: Record<string, string> = {
  SOLVES: "#34d399", // emerald
  CAUSES: "#f87171", // red
  ENABLES: "#60a5fa", // blue
  PART_OF: "#a78bfa", // violet
  USED_WITH: "#fbbf24", // amber
  ALTERNATIVE_TO: "#f472b6", // pink
  REQUIRES: "#fb923c", // orange
  IMPLEMENTS: "#2dd4bf", // teal
};

interface GraphNode {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
  val?: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  source?: string; // "user", "lenny", "both", "unknown"
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  strength: number;
  evidence?: string;
  similarity?: number; // For SEMANTIC_MATCH relations (0.0-1.0)
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface GraphViewProps {
  centerEntityId?: string;
  onEntityClick?: (entityId: string, entityName: string) => void;
  height?: number;
  className?: string;
}

type SourceFilter = "all" | "user" | "lenny" | "both";

export default function GraphView({
  centerEntityId,
  onEntityClick,
  height = 500,
  className = "",
}: GraphViewProps) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [filteredGraphData, setFilteredGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [entityLimit, setEntityLimit] = useState(100); // Default to Galaxy view (clean start)
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null); // For muted context
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set()); // Track expanded nodes
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null); // Loading state for expansion
  
  // Search State (P4)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GraphNode[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Phase 5: Summarization Nodes
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set()); // Collapsed conversation nodes (show as synthesis)
  const [expandedMessageNodes, setExpandedMessageNodes] = useState<Set<string>>(new Set()); // Expanded to message-level detail
  const [messageLevelData, setMessageLevelData] = useState<Map<string, GraphData>>(new Map()); // Message-level graph data per conversation

  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Initialize dimensions from window size if available, otherwise defaults
  const [dimensions, setDimensions] = useState(() => {
    if (typeof window !== "undefined") {
      return {
        width: Math.min(window.innerWidth - 48, 1200), // Account for padding
        height: Math.min(window.innerHeight - 280, 800), // Account for header/footer
      };
    }
    return { width: 800, height: 600 };
  });

  // Handle search input change
  const handleSearchChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    if (query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    setShowSearchResults(true);
    
    try {
      const res = await fetch(`/api/kg/search?q=${encodeURIComponent(query)}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Handle search result selection
  const handleSearchResultClick = useCallback(async (node: GraphNode) => {
    setSearchQuery("");
    setShowSearchResults(false);
    
    // Check if node is already in graph
    const existingNode = graphData.nodes.find(n => n.id === node.id);
    
    if (existingNode) {
      // Just focus it
      setFocusNodeId(node.id);
      setSelectedNode(existingNode);
      if (graphRef.current) {
        graphRef.current.centerAt(existingNode.x, existingNode.y, 1000);
        graphRef.current.zoom(2, 1000);
      }
    } else {
      // Fetch centered graph for this node
      setLoading(true);
      try {
        const res = await fetch(`/api/kg/subgraph?center_entity_id=${node.id}&depth=1&limit=50`);
        if (res.ok) {
          const data = await res.json();
          // Replace current graph with new centered graph
          const newGraphData: GraphData = {
            nodes: (data.nodes || []) as GraphNode[],
            links: (data.links || []) as GraphLink[],
          };
          setGraphData(newGraphData);
          setFilteredGraphData(newGraphData);
          
          // Focus the node
          setFocusNodeId(node.id);
          const newNode = newGraphData.nodes.find((n: GraphNode) => n.id === node.id);
          if (newNode) setSelectedNode(newNode);
        }
      } catch (err) {
        console.error("Failed to load search result:", err);
      } finally {
        setLoading(false);
      }
    }
  }, [graphData]);

  // Fetch neighbors of a specific node (for progressive expansion)
  const fetchNodeNeighbors = useCallback(async (nodeId: string) => {
    try {
      const params = new URLSearchParams();
      params.set("center_entity_id", nodeId);
      params.set("depth", "1");
      params.set("limit", "20"); // Limit neighbors per expansion

      const res = await fetch(`/api/kg/subgraph?${params}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch neighbors: ${res.status}`);
      }
      const data = await res.json();
      return { nodes: data.nodes || [], links: data.links || [] };
    } catch (err) {
      console.error("Error fetching neighbors:", err);
      return { nodes: [], links: [] };
    }
  }, []);

  // Fetch graph data
  const fetchGraph = useCallback(async () => {
    // Cancel previous request if still in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (centerEntityId) {
        params.set("center_entity_id", centerEntityId);
        params.set("depth", "1"); // Shallow depth for cleaner view
      }
      
      params.set("limit", entityLimit.toString());

      const res = await fetch(`/api/kg/subgraph?${params}`, {
        signal: abortControllerRef.current.signal,
      });
      
      if (!isMountedRef.current) return;
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Failed to fetch graph: ${errorText.length > 100 ? res.status : errorText}`);
      }

      const data = await res.json().catch((parseError) => {
        throw new Error(`Invalid JSON response from server: ${parseError.message}`);
      });
      
      if (!isMountedRef.current) return;

      // Validate response structure
      if (!data || typeof data !== "object") {
        setGraphData({ nodes: [], links: [] });
        setError("Invalid response structure");
        return;
      }

      if (!Array.isArray(data.nodes) || !Array.isArray(data.links)) {
        setGraphData({ nodes: [], links: [] });
        setError("Invalid graph data structure");
        return;
      }

      const newGraphData = {
        nodes: data.nodes || [],
        links: data.links || [],
      };
      setGraphData(newGraphData);
      
      // Reset filtering state on new data
      setFilteredGraphData(newGraphData);
      
    } catch (err) {
      if (!isMountedRef.current) return;
      
      // Don't set error if request was aborted
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      
      console.error("Graph fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load graph");
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [centerEntityId, entityLimit]);

  // Apply source filter
  useEffect(() => {
    let filteredNodes = graphData.nodes;
    let filteredLinks = graphData.links;

    // Step 1: Source filter
    if (sourceFilter !== "all") {
      filteredNodes = graphData.nodes.filter((node) => {
        if (sourceFilter === "user") return node.source === "user";
        if (sourceFilter === "lenny") return node.source === "lenny" || node.source === "expert";
        if (sourceFilter === "both") return node.source === "both";
        return true;
      });
      
      const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
      filteredLinks = graphData.links.filter(
        (link) => {
          const sourceId = typeof link.source === "string" ? link.source : link.source.id;
          const targetId = typeof link.target === "string" ? link.target : link.target.id;
          return filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId);
        }
      );
    }

    setFilteredGraphData({
      nodes: filteredNodes,
      links: filteredLinks,
    });
  }, [graphData, sourceFilter]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoom(1.2, 200);
      setZoomLevel((prev) => Math.min(prev * 1.2, 5));
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoom(0.8, 200);
      setZoomLevel((prev) => Math.max(prev * 0.8, 0.1));
    }
  }, []);

  const handleZoomReset = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 20);
      setZoomLevel(1);
    }
  }, []);

  // Initial fetch and cleanup
  useEffect(() => {
    isMountedRef.current = true;
    fetchGraph();
    return () => {
      isMountedRef.current = false;
      // Cancel in-flight request on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchGraph]);

  // Handle node click - Expand and focus (P3)
  const handleNodeClick = useCallback(
    async (node: GraphNode) => {
      setSelectedNode(node);
      setFocusNodeId(node.id); // Set focus for muted context
      
      if (onEntityClick) {
        onEntityClick(node.id, node.name);
      }

      // P3: Interactive Expansion
      // If node is NOT a collapsed satellite (which uses double-click), expand it
      if (!collapsedNodes.has(node.id) && !expandedNodes.has(node.id)) {
        setExpandingNodeId(node.id);
        
        try {
          const neighbors = await fetchNodeNeighbors(node.id);
          
          if (neighbors.nodes.length > 0) {
            setGraphData((prev: GraphData) => {
              // Merge new nodes
              const existingNodeIds = new Set(prev.nodes.map((n) => n.id));
              const newNodes = neighbors.nodes.filter((n: GraphNode) => !existingNodeIds.has(n.id));
              
              // Merge new links
              const existingLinkKeys = new Set(
                prev.links.map((l) => `${typeof l.source === 'string' ? l.source : (l.source as GraphNode).id}-${typeof l.target === 'string' ? l.target : (l.target as GraphNode).id}`)
              );
              const newLinks = neighbors.links.filter((l: GraphLink) => 
                !existingLinkKeys.has(`${typeof l.source === 'string' ? l.source : (l.source as GraphNode).id}-${typeof l.target === 'string' ? l.target : (l.target as GraphNode).id}`)
              );
              
              if (newNodes.length === 0 && newLinks.length === 0) return prev;

              return {
                nodes: [...prev.nodes, ...newNodes],
                links: [...prev.links, ...newLinks]
              };
            });
            
            setExpandedNodes(prev => new Set([...prev, node.id]));
          }
        } catch (err) {
          console.error("Error expanding node:", err);
        } finally {
          setExpandingNodeId(null);
        }
      }
    },
    [onEntityClick, collapsedNodes, expandedNodes, fetchNodeNeighbors]
  );

  // Phase 5: Handle double-click for summarization nodes (expand/collapse)
  const handleNodeDoubleClick = useCallback(
    async (node: GraphNode) => {
      // Only handle double-click for conversation nodes
      if (!node.id.startsWith("conv-")) {
        return;
      }
      
      // Toggle collapse/expand
      if (collapsedNodes.has(node.id)) {
        // Expand: Remove from collapsed set
        setCollapsedNodes((prev) => {
          const next = new Set(prev);
          next.delete(node.id);
          return next;
        });
      } else {
        // Collapse: Add to collapsed set
        setCollapsedNodes((prev) => new Set([...prev, node.id]));
      }
      
      // Toggle message-level expansion
      if (expandedMessageNodes.has(node.id)) {
        // Collapse message-level view
        setExpandedMessageNodes((prev) => {
          const next = new Set(prev);
          next.delete(node.id);
          return next;
        });
        setMessageLevelData((prev) => {
          const next = new Map(prev);
          next.delete(node.id);
          return next;
        });
      } else {
        // Expand to message-level: Fetch message-level graph data
        setExpandedMessageNodes((prev) => new Set([...prev, node.id]));
        
        try {
          // Fetch message-level entities and relations for this conversation
          const res = await fetch(`/api/kg/subgraph?center_entity_id=${node.id}&depth=2&limit=100`);
          if (res.ok) {
            const data = await res.json();
            setMessageLevelData((prev) => {
              const next = new Map(prev);
              next.set(node.id, data);
              return next;
            });
          }
        } catch (error) {
          console.error("Failed to fetch message-level data:", error);
        }
      }
    },
    [collapsedNodes, expandedMessageNodes]
  );

  // Combine filtered data with message-level expansions
  const layoutedGraphData = useMemo(() => {
    let dataToLayout = filteredGraphData;
    
    // Phase 5: Merge message-level expanded data if any conversations are expanded
    if (expandedMessageNodes.size > 0 && messageLevelData.size > 0) {
      const expandedNodes = new Set<string>();
      const expandedLinks: GraphLink[] = [];
      
      expandedMessageNodes.forEach((convId) => {
        const messageData = messageLevelData.get(convId);
        if (messageData) {
          // Add message-level nodes (avoid duplicates)
          const existingNodeIds = new Set(dataToLayout.nodes.map((n) => n.id));
          messageData.nodes.forEach((node: GraphNode) => {
            if (!existingNodeIds.has(node.id)) {
              expandedNodes.add(node.id);
            }
          });
          
          // Add message-level links
          expandedLinks.push(...messageData.links);
        }
      });
      
      // Merge expanded data
      if (expandedNodes.size > 0 || expandedLinks.length > 0) {
        const existingNodeIds = new Set(dataToLayout.nodes.map((n) => n.id));
        const newNodes = Array.from(expandedNodes).map((nodeId) => {
          // Find node in message data
          for (const [convId, messageData] of messageLevelData.entries()) {
            const node = messageData.nodes.find((n: GraphNode) => n.id === nodeId);
            if (node) return node;
          }
          return null;
        }).filter((n): n is GraphNode => n !== null && !existingNodeIds.has(n.id));
        
        const existingLinkKeys = new Set(
          dataToLayout.links.map((l) => `${typeof l.source === "string" ? l.source : l.source.id}-${typeof l.target === "string" ? l.target : l.target.id}`)
        );
        const newLinks = expandedLinks.filter(
          (l) => !existingLinkKeys.has(`${typeof l.source === "string" ? l.source : l.source.id}-${typeof l.target === "string" ? l.target : l.target.id}`)
        );
        
        dataToLayout = {
          nodes: [...dataToLayout.nodes, ...newNodes],
          links: [...dataToLayout.links, ...newLinks],
        };
      }
    }
    
    return dataToLayout;
  }, [filteredGraphData, expandedMessageNodes, messageLevelData]);

  // Node color based on type
  const getNodeColor = useCallback((node: GraphNode) => {
    return ENTITY_TYPE_COLORS[node.type] || "#94a3b8";
  }, []);

  // Link color based on type
  const getLinkColor = useCallback((link: GraphLink) => {
    return RELATION_TYPE_COLORS[link.type] || "#475569";
  }, []);

  // Node canvas rendering with semantic zooming
  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name;
      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;
      const isFocused = focusNodeId === node.id;
      const isInFocusContext = focusNodeId && (isFocused || isHovered || isSelected);
      const isLenny = node.source === "lenny";
      const isBoth = node.source === "both";
      
      // Phase 5: Check if node is collapsed (show as synthesis node)
      const isCollapsed = collapsedNodes.has(node.id);
      
      // Muted Context: Dim non-focused nodes when a node is selected
      const opacity = isInFocusContext || !focusNodeId ? 1 : 0.3;
      
      // Semantic Zoom: Determine detail level
      const zoomLevel = globalScale;
      const isHeatmapMode = zoomLevel < 0.2;
      const isMinimalMode = zoomLevel >= 0.2 && zoomLevel < 0.5;
      const isStandardMode = zoomLevel >= 0.5 && zoomLevel < 1.0;
      const isDetailedMode = zoomLevel >= 1.0 && zoomLevel < 1.5;
      const isMetadataMode = zoomLevel >= 1.5;

      // Visual Encoding: Size by importance (mentionCount + degree)
      const baseNodeSize = isHeatmapMode ? 2 : Math.max((node.val || 4), 4);
      let nodeSize = baseNodeSize;
      
      // Phase 5: Collapsed nodes are smaller (synthesis representation)
      if (isCollapsed && node.id.startsWith("conv-")) {
        nodeSize = baseNodeSize * 0.5; // 50% of base size for collapsed synthesis nodes
      }

      // Draw node circle
      ctx.beginPath();
      ctx.arc(node.x || 0, node.y || 0, nodeSize, 0, 2 * Math.PI);

      // Visual Encoding: Bright colors for focus, muted for context
      let baseColor = getNodeColor(node);
      const colorWithOpacity = opacity < 1 
        ? baseColor + Math.floor(255 * opacity).toString(16).padStart(2, "0")
        : baseColor;

      // HEATMAP MODE: Simple dots only (very zoomed out)
      if (isHeatmapMode) {
        ctx.fillStyle = colorWithOpacity;
        ctx.fill();
        // Only show highlight for hovered/selected in heatmap mode
        if (isHovered || isSelected || isFocused) {
          ctx.beginPath();
          ctx.arc(node.x || 0, node.y || 0, nodeSize + 2, 0, 2 * Math.PI);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        return; // Early return for heatmap mode
      }

      // Phase 5: Collapsed nodes show simplified synthesis representation
      if (isCollapsed && node.id.startsWith("conv-")) {
        ctx.fillStyle = colorWithOpacity;
        ctx.fill();
        
        // Add synthesis indicator
        if (isDetailedMode || isMetadataMode) {
          ctx.fillStyle = "#ffffff";
          ctx.font = `${Math.max(8 / globalScale, 6)}px Sans-Serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("S", node.x || 0, node.y || 0);
        }
        return; 
      }
      
      // MINIMAL MODE & STANDARD MODE: Basic node rendering
      if (isLenny && !isMinimalMode) {
        // Lenny: lighter fill with dashed outline
        ctx.fillStyle = colorWithOpacity + (opacity < 1 ? "" : "60");
        ctx.fill();
        if (!isMinimalMode) {
        ctx.setLineDash([3 / globalScale, 2 / globalScale]);
          ctx.strokeStyle = colorWithOpacity;
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
        ctx.setLineDash([]);
        }
      } else {
        // User or unknown: solid fill
        ctx.fillStyle = colorWithOpacity;
        ctx.fill();
      }

      // "Both" sources get an extra ring (only in standard+ modes)
      if (isBoth && !isMinimalMode) {
        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, nodeSize + 2 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = "#a78bfa";
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
      }

      // Highlight on hover/select/focus
      if (isHovered || isSelected || isFocused) {
        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, nodeSize + 1 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = isSelected || isFocused ? "#ffffff" : "#cbd5e1";
        ctx.lineWidth = isSelected || isFocused ? 2 / globalScale : 1.5 / globalScale;
        ctx.stroke();
      }

      // P3: Expansion Loading Indicator
      if (node.id === expandingNodeId) {
        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, nodeSize + 4 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = "#60a5fa"; // Blue
        ctx.lineWidth = 1.5 / globalScale;
        ctx.setLineDash([2 / globalScale, 2 / globalScale]);
        ctx.stroke();
        ctx.setLineDash([]); // Reset
      }

      // SEMANTIC ZOOM: Label rendering based on zoom level
      const shouldShowLabel = isStandardMode || isDetailedMode || isMetadataMode || isHovered || isSelected || isFocused;
      
      if (shouldShowLabel) {
        const fontSize = isMetadataMode 
          ? Math.max(12 / globalScale, 8)
          : isDetailedMode
          ? Math.max(11 / globalScale, 7)
          : Math.max(10 / globalScale, 6);
        
        ctx.font = `${isSelected || isFocused ? "bold " : ""}${fontSize}px Sans-Serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isSelected || isFocused ? "#ffffff" : isHovered ? "#e2e8f0" : "#94a3b8";
        ctx.fillText(label, node.x || 0, (node.y || 0) + nodeSize + 2);

        // METADATA MODE: Show mention count
        if (isMetadataMode) {
          const metadataY = (node.y || 0) + nodeSize + fontSize + 4;
          ctx.font = `${Math.max(8 / globalScale, 5)}px Sans-Serif`;
          ctx.fillStyle = "#64748b";
          ctx.fillText(`${node.mentionCount} mentions`, node.x || 0, metadataY);
        }

        // Source indicator icon (detailed+ modes)
        if ((isDetailedMode || isMetadataMode) && (isLenny || isBoth || node.source === "user")) {
          ctx.font = `${fontSize * 0.9}px Sans-Serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const icon = isLenny ? "🎙️" : isBoth ? "🔗" : "👤";
          ctx.fillStyle = isLenny ? "#c084fc" : isBoth ? "#a78bfa" : "#34d399";
          ctx.fillText(icon, (node.x || 0) + nodeSize + 4, node.y || 0);
          ctx.textAlign = "center"; // Reset for label
        }
      }
    },
    [hoveredNode, selectedNode, focusNodeId, getNodeColor, collapsedNodes]
  );

  // Link rendering
  const linkCanvasObject = useCallback(
    (link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const sourceNode = link.source as GraphNode;
      const targetNode = link.target as GraphNode;
      
      if (!sourceNode.x || !targetNode.x) return;

      const isHovered = hoveredLink === link;
      const isInFocusPath = focusNodeId && (
        focusNodeId === sourceNode.id || 
        focusNodeId === targetNode.id ||
        focusNodeId === selectedNode?.id
      );
      
      // Semantic Zoom Levels for Links
      const zoomLevel = globalScale;
      const isHeatmapMode = zoomLevel < 0.2;
      const isMinimalMode = zoomLevel >= 0.2 && zoomLevel < 0.5;
      const isStandardMode = zoomLevel >= 0.5 && zoomLevel < 1.0;
      const isDetailedMode = zoomLevel >= 1.0;

      // HEATMAP MODE: Hide links entirely
      if (isHeatmapMode && !isHovered && !isInFocusPath) {
        return;
      }

      // Muted Context: Dim links not in focus path
      const linkOpacity = isInFocusPath || !focusNodeId ? 1 : 0.2;
      
      ctx.beginPath();
      ctx.moveTo(sourceNode.x, sourceNode.y || 0);
      ctx.lineTo(targetNode.x, targetNode.y || 0);
      
      // Visual Encoding: Thicker lines for stronger relationships
      const baseLineWidth = isMinimalMode 
        ? (link.strength * 1 + 0.3) / globalScale
        : (link.strength * 2 + 0.5) / globalScale;
      
      let linkColor = isHovered ? "#ffffff" : getLinkColor(link);
      
      ctx.strokeStyle = linkColor;
      ctx.lineWidth = isHovered ? 2 / globalScale : baseLineWidth;
      
      // Opacity: Lower in heatmap/minimal modes, full in detailed
      const finalOpacity = isHeatmapMode || isMinimalMode 
        ? (isHovered || isInFocusPath ? 0.8 : 0.3)
        : (isHovered ? 1 : linkOpacity * 0.6);
      
      ctx.globalAlpha = finalOpacity;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Draw arrow for direction (only in standard+ modes)
      if ((isStandardMode || isDetailedMode) && (globalScale > 0.8 || isHovered)) {
        const midX = (sourceNode.x + targetNode.x) / 2;
        const midY = (sourceNode.y! + targetNode.y!) / 2;
        const angle = Math.atan2(
          targetNode.y! - sourceNode.y!,
          targetNode.x - sourceNode.x
        );
        const arrowSize = 4 / globalScale;

        ctx.beginPath();
        ctx.moveTo(
          midX + arrowSize * Math.cos(angle),
          midY + arrowSize * Math.sin(angle)
        );
        ctx.lineTo(
          midX + arrowSize * Math.cos(angle - Math.PI * 0.8),
          midY + arrowSize * Math.sin(angle - Math.PI * 0.8)
        );
        ctx.lineTo(
          midX + arrowSize * Math.cos(angle + Math.PI * 0.8),
          midY + arrowSize * Math.sin(angle + Math.PI * 0.8)
        );
        ctx.closePath();
        ctx.fillStyle = isHovered ? "#ffffff" : getLinkColor(link);
        ctx.fill();
      }

      // DETAILED MODE: Show relationship type label on hover
      if (isDetailedMode && isHovered) {
        const midX = (sourceNode.x + targetNode.x) / 2;
        const midY = (sourceNode.y! + targetNode.y!) / 2;
        ctx.font = `${Math.max(9 / globalScale, 6)}px Sans-Serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(link.type, midX, midY - 8);
      }
    },
    [hoveredLink, focusNodeId, selectedNode, getLinkColor]
  );

  // Dynamic graph dimensions based on container size
  useEffect(() => {
    const updateDimensions = () => {
    if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Use actual container dimensions, fallback to defaults only if container has no size
        const containerWidth = rect.width > 0 ? rect.width : 800;
        const containerHeight = rect.height > 0 ? rect.height : (height || 600);
        
        // Only update if dimensions actually changed to avoid unnecessary re-renders
        setDimensions((prev) => {
          if (prev.width !== containerWidth || prev.height !== containerHeight) {
            return {
              width: containerWidth,
              height: containerHeight,
            };
          }
          return prev;
        });
      }
    };

    // Initial calculation - try multiple times to ensure container is rendered
    updateDimensions();
    const timeout1 = setTimeout(updateDimensions, 10);
    const timeout2 = setTimeout(updateDimensions, 100);

    // Create ResizeObserver to watch for container size changes
    const resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(updateDimensions);
    });
    
    // Wait for containerRef to be set
    const observeContainer = () => {
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      } else {
        // Retry if containerRef not ready yet
        setTimeout(observeContainer, 10);
      }
    };
    observeContainer();

    // Also listen to window resize for viewport changes
    window.addEventListener("resize", updateDimensions);

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateDimensions);
    };
  }, [height]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height }}>
        <div className="text-slate-400 flex items-center gap-2">
          <span className="animate-spin">⚡</span>
          Loading graph...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 ${className}`} style={{ height }}>
        <div className="text-red-400">❌ {error}</div>
        <button
          onClick={fetchGraph}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300"
        >
          Retry
        </button>
      </div>
    );
  }

  if (graphData.nodes.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 ${className}`} style={{ height }}>
        <div className="text-slate-400 text-center">
          <div className="text-4xl mb-2">🔮</div>
          <div className="font-medium">No graph data yet</div>
          <div className="text-sm text-slate-500 mt-1">
            Index some messages with relations to see the Knowledge Graph
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={(el) => {
        containerRef.current = el;
        if (el) {
          requestAnimationFrame(() => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              setDimensions({
                width: rect.width,
                height: rect.height,
              });
            }
          });
        }
      }}
      className={`relative w-full h-full ${className}`}
      style={{ height: "100%", minHeight: height || 600 }}
    >
      {/* Search Bar (P4) */}
      <div className="absolute top-2 left-2 z-20 pointer-events-auto">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search entities..."
            className="w-64 px-3 py-2 bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-lg"
          />
          {isSearching && (
            <div className="absolute right-3 top-2.5">
              <div className="animate-spin h-4 w-4 border-2 border-indigo-500 rounded-full border-t-transparent"></div>
            </div>
          )}
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleSearchResultClick(result)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800 border-b border-slate-800/50 last:border-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-200 font-medium">{result.name}</span>
                    <span className="text-xs text-slate-500 capitalize">{result.type}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {result.mentionCount} mentions
                  </div>
                </button>
          ))}
        </div>
          )}
          </div>
          </div>

      {/* Graph Legend & Controls - Collapsible */}
      <div className="absolute top-2 right-2 z-10 pointer-events-none">
        {/* Toggle Button */}
        <button
          onClick={() => setControlsExpanded(!controlsExpanded)}
          className="mb-2 w-10 h-10 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors shadow-lg pointer-events-auto"
          title={controlsExpanded ? "Hide Controls" : "Show Controls"}
          aria-label={controlsExpanded ? "Hide Controls" : "Show Controls"}
        >
          <span className="text-lg">{controlsExpanded ? "✕" : "⚙️"}</span>
        </button>

        {/* Controls Panel - Simplified */}
        {controlsExpanded && (
          <div className="bg-slate-900/90 backdrop-blur-sm rounded-lg p-3 text-xs space-y-3 shadow-lg max-w-[280px] max-h-[80vh] overflow-y-auto pointer-events-auto">
            {focusNodeId && (
              <div>
                <button
                  onClick={() => {
                    setFocusNodeId(null);
                    setSelectedNode(null);
                  }}
                  className="w-full px-2 py-1 rounded text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                >
                  Clear Focus
                </button>
          </div>
            )}

            {/* Entity Limit Control */}
            <div>
              <div className="font-medium text-slate-300 mb-2 flex items-center justify-between">
                <span>Entity Limit</span>
                <span className="text-slate-500 text-[10px]">{entityLimit}</span>
              </div>
              <div className="flex gap-1.5 mb-1">
                <button
                  onClick={() => setEntityLimit(100)}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${
                    entityLimit === 100
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  100
                </button>
                <button
                  onClick={() => setEntityLimit(500)}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${
                    entityLimit === 500
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  500
                </button>
                <button
                  onClick={() => setEntityLimit(1000)}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${
                    entityLimit === 1000
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  1K
                </button>
              </div>
              <input
                type="range"
                min="50"
                max="2000"
                step="50"
                value={entityLimit}
                onChange={(e) => setEntityLimit(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                aria-label="Entity limit slider"
                title={`Entity limit: ${entityLimit}`}
              />
            </div>

            {/* Source Filter Toggle */}
            <div>
              <div className="font-medium text-slate-300 mb-2">Filter by Source</div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSourceFilter("all")}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${
                    sourceFilter === "all"
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setSourceFilter("user")}
                  className={`px-2 py-1 rounded text-[10px] transition-colors flex items-center gap-1 ${
                    sourceFilter === "user"
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  <span>👤</span> My KG
                </button>
                <button
                  onClick={() => setSourceFilter("lenny")}
                  className={`px-2 py-1 rounded text-[10px] transition-colors flex items-center gap-1 ${
                    sourceFilter === "lenny"
                      ? "bg-purple-500 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  <span>🎙️</span> Lenny
                </button>
                <button
                  onClick={() => setSourceFilter("both")}
                  className={`px-2 py-1 rounded text-[10px] transition-colors flex items-center gap-1 ${
                    sourceFilter === "both"
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  <span>🔗</span> Both
                </button>
              </div>
            </div>

            {/* Entity Type Legend - Simplified */}
            <div className="pt-2 border-t border-slate-700/50">
              <div className="text-slate-400 text-[9px] mb-1">Double-click nodes to expand</div>
        </div>
          </div>
        )}
          </div>

      {/* Zoom Controls - Moved to bottom right */}
      <div className="absolute bottom-2 right-2 z-10 bg-slate-900/90 backdrop-blur-sm rounded-lg p-2 flex flex-col gap-1 pointer-events-auto">
        <button
          onClick={handleZoomIn}
          className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-colors"
          title="Zoom In"
          aria-label="Zoom in"
        >
          <span className="text-sm">+</span>
        </button>
        <button
          onClick={handleZoomOut}
          className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-colors"
          title="Zoom Out"
          aria-label="Zoom out"
        >
          <span className="text-sm">−</span>
        </button>
        <button
          onClick={handleZoomReset}
          className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-colors text-[10px]"
          title="Reset Zoom"
          aria-label="Reset zoom"
        >
          ⌂
        </button>
        <div className="text-[10px] text-slate-500 text-center pt-1 border-t border-slate-700 mt-1">
          {Math.round(zoomLevel * 100)}%
          <div className="text-[8px] text-slate-600 mt-0.5">
            {zoomLevel < 0.2 ? "Heatmap" :
             zoomLevel < 0.5 ? "Minimal" :
             zoomLevel < 1.0 ? "Standard" :
             zoomLevel < 1.5 ? "Detailed" : "Metadata"}
          </div>
        </div>
      </div>

      {/* Node/Link Info Panel - Adjusted position below search */}
      {(hoveredNode || hoveredLink || selectedNode) && (
        <div className="absolute top-14 left-2 z-10 bg-slate-900/90 backdrop-blur-sm rounded-lg p-3 text-xs max-w-[200px] pointer-events-auto">
          {selectedNode && (
            <div>
              <div className="font-medium text-white mb-1">{selectedNode.name}</div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-slate-400 capitalize">{selectedNode.type}</span>
                {selectedNode.source && selectedNode.source !== "unknown" && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    selectedNode.source === "lenny" ? "bg-purple-500/20 text-purple-400" :
                    selectedNode.source === "user" ? "bg-emerald-500/20 text-emerald-400" :
                    "bg-indigo-500/20 text-indigo-400"
                  }`}>
                    {selectedNode.source === "lenny" ? "🎙️ Lenny" :
                     selectedNode.source === "user" ? "👤 My KG" : "🔗 Both"}
                  </span>
                )}
              </div>
              <div className="text-slate-500">{selectedNode.mentionCount} mentions</div>
            </div>
          )}
          {hoveredNode && hoveredNode.id !== selectedNode?.id && (
            <div>
              <div className="font-medium text-slate-300">{hoveredNode.name}</div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 capitalize text-[10px]">{hoveredNode.type}</span>
                {hoveredNode.source && hoveredNode.source !== "unknown" && (
                  <span className="text-[10px] text-slate-500">
                    {hoveredNode.source === "lenny" ? "🎙️" :
                     hoveredNode.source === "user" ? "👤" : "🔗"}
                  </span>
                )}
              </div>
            </div>
          )}
          {hoveredLink && (
            <div className="mt-2 pt-2 border-t border-slate-700">
              <div className="text-slate-300">
                {(hoveredLink.source as GraphNode).name}{" "}
                <span className="text-amber-400">{hoveredLink.type}</span>{" "}
                {(hoveredLink.target as GraphNode).name}
              </div>
              {hoveredLink.evidence && (
                <div className="text-slate-500 mt-1 italic line-clamp-2">
                  &quot;{hoveredLink.evidence}&quot;
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="absolute bottom-2 left-2 z-10 text-xs text-slate-500">
        {filteredGraphData.nodes.length} / {graphData.nodes.length} entities • {filteredGraphData.links.length} / {graphData.links.length} relations
      </div>

      {/* Force Graph */}
      <ForceGraph2D
        ref={graphRef}
        graphData={layoutedGraphData}
        width={dimensions.width}
        height={dimensions.height}
        key={`graph-${dimensions.width}-${dimensions.height}`}
        backgroundColor="transparent"
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
          // Larger hit area for easier clicking - 12px padding around node
          const nodeSize = Math.max((node.val || 4), 4);
          const hitRadius = Math.max(nodeSize + 12, 16); // At least 16px radius for small nodes
          ctx.beginPath();
          ctx.arc(node.x || 0, node.y || 0, hitRadius, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkCanvasObject={linkCanvasObject}
        linkPointerAreaPaint={(link: GraphLink, color: string, ctx: CanvasRenderingContext2D) => {
          const sourceNode = link.source as GraphNode;
          const targetNode = link.target as GraphNode;
          if (!sourceNode.x || !targetNode.x) return;
          
          // Smaller hit area for links - only 3px wide to avoid blocking nodes
          ctx.beginPath();
          ctx.moveTo(sourceNode.x, sourceNode.y || 0);
          ctx.lineTo(targetNode.x, targetNode.y || 0);
          ctx.strokeStyle = color;
          ctx.lineWidth = 3; // Reduced from 8 to 3
          ctx.stroke();
        }}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeHover={setHoveredNode}
        onLinkHover={setHoveredLink}
        onLinkClick={undefined} // Disable link clicking - prioritize nodes
        onZoom={(zoom: { k?: number }) => {
          const newZoom = zoom.k || 1;
          setZoomLevel(newZoom);
        }}
        cooldownTicks={100}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={2}
        enableNodeDrag={true}
        enableZoomPanInteraction={true}
        zoom={zoomLevel}
        minZoom={0.1}
        maxZoom={5}
        wheelSensitivity={0.1}
      />
    </div>
  );
}
