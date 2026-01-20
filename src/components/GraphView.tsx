"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { hierarchy, tree } from "d3-hierarchy";

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
type ViewMode = "overview" | "detailed"; // Data Funnel: Overview vs Detailed
type LayoutType = "force" | "hierarchical"; // Layout algorithms
type NoiseFilter = {
  hideSupernodes: boolean; // Hide highly connected nodes (>N connections)
  hideLeafNodes: boolean; // Hide nodes with only 1 connection
  supernodeThreshold: number; // Threshold for supernodes
};

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
  const [entityLimit, setEntityLimit] = useState(500);
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("overview"); // Start with overview
  const [noiseFilter, setNoiseFilter] = useState<NoiseFilter>({
    hideSupernodes: false,
    hideLeafNodes: false,
    supernodeThreshold: 20, // Nodes with >20 connections are supernodes
  });
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null); // For muted context
  const [layoutType, setLayoutType] = useState<LayoutType>("force"); // Layout algorithm
  const [progressiveMode, setProgressiveMode] = useState(true); // Progressive expansion mode
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set()); // Track expanded nodes
  const [initialNodeCount, setInitialNodeCount] = useState(50); // Start with top N nodes
  const [weightedScoring, setWeightedScoring] = useState({ mentions: 50, degree: 50 }); // Weighted scoring (0-100)
  const [bundlingEnabled, setBundlingEnabled] = useState(false); // Node bundling/clustering
  const [clusters, setClusters] = useState<Map<string, string[]>>(new Map()); // Cluster assignments

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

  // Fetch neighbors of a specific node (for progressive expansion)
  const fetchNodeNeighbors = useCallback(async (nodeId: string, depth: number = 1) => {
    try {
      const params = new URLSearchParams();
      params.set("center_entity_id", nodeId);
      params.set("depth", depth.toString());
      params.set("limit", "50"); // Limit neighbors per expansion

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

  // Fetch graph data (with progressive expansion support)
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
        params.set("depth", "2");
      }
      // Progressive mode: start with initialNodeCount, otherwise use entityLimit
      const limit = progressiveMode ? initialNodeCount : entityLimit;
      params.set("limit", limit.toString());
      // Pass weighted scoring to API
      params.set("weight_mentions", weightedScoring.mentions.toString());

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
      // Apply initial filters
      applyFilters(newGraphData, sourceFilter, noiseFilter);
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
  }, [centerEntityId, entityLimit, progressiveMode, initialNodeCount, weightedScoring]);

  // Compute node degrees (connection counts) for noise filtering
  const computeNodeDegrees = useCallback((data: GraphData): Map<string, number> => {
    const degrees = new Map<string, number>();
    data.nodes.forEach((node) => degrees.set(node.id, 0));
    data.links.forEach((link) => {
      const sourceId = typeof link.source === "string" ? link.source : link.source.id;
      const targetId = typeof link.target === "string" ? link.target : link.target.id;
      degrees.set(sourceId, (degrees.get(sourceId) || 0) + 1);
      degrees.set(targetId, (degrees.get(targetId) || 0) + 1);
    });
    return degrees;
  }, []);

  // Apply all filters: source + noise reduction
  const applyFilters = useCallback((data: GraphData, filter: SourceFilter, noise: NoiseFilter) => {
    // Step 1: Source filter
    let filteredNodes = data.nodes;
    if (filter !== "all") {
      filteredNodes = data.nodes.filter((node) => {
        if (filter === "user") return node.source === "user";
        if (filter === "lenny") return node.source === "lenny" || node.source === "expert";
        if (filter === "both") return node.source === "both";
        return true;
      });
    }

    // Step 2: Compute degrees for noise filtering
    const degrees = computeNodeDegrees({ nodes: filteredNodes, links: data.links });

    // Step 3: Apply noise filters (supernodes and leaf nodes)
    if (noise.hideSupernodes || noise.hideLeafNodes) {
      filteredNodes = filteredNodes.filter((node) => {
        const degree = degrees.get(node.id) || 0;
        if (noise.hideSupernodes && degree > noise.supernodeThreshold) return false;
        if (noise.hideLeafNodes && degree <= 1) return false;
        return true;
      });
    }

    // Step 4: Filter links to only include filtered nodes
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredLinks = data.links.filter(
      (link) => {
        const sourceId = typeof link.source === "string" ? link.source : link.source.id;
        const targetId = typeof link.target === "string" ? link.target : link.target.id;
        return filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId);
      }
    );

    setFilteredGraphData({
      nodes: filteredNodes,
      links: filteredLinks,
    });
  }, [computeNodeDegrees]);

  // Update filtered data when filters change
  useEffect(() => {
    applyFilters(graphData, sourceFilter, noiseFilter);
  }, [sourceFilter, noiseFilter, graphData, applyFilters]);

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

  // Handle node click - Data Funnel: Details on Demand + Progressive Expansion
  const handleNodeClick = useCallback(
    async (node: GraphNode) => {
      setSelectedNode(node);
      setFocusNodeId(node.id); // Set focus for muted context
      if (viewMode === "overview") {
        setViewMode("detailed"); // Switch to detailed view when clicking
      }
      
      // Progressive Expansion: Load neighbors if not already expanded
      if (progressiveMode && !expandedNodes.has(node.id)) {
        const neighbors = await fetchNodeNeighbors(node.id, 1);
        if (neighbors.nodes.length > 0 || neighbors.links.length > 0) {
          setGraphData((prev) => {
            // Merge new nodes (avoid duplicates)
            const existingNodeIds = new Set(prev.nodes.map((n) => n.id));
            const newNodes = neighbors.nodes.filter((n: GraphNode) => !existingNodeIds.has(n.id));
            const existingLinkKeys = new Set(
              prev.links.map((l: GraphLink) => `${typeof l.source === "string" ? l.source : l.source.id}-${typeof l.target === "string" ? l.target : l.target.id}`)
            );
            const newLinks = neighbors.links.filter(
              (l: GraphLink) => !existingLinkKeys.has(`${typeof l.source === "string" ? l.source : l.source.id}-${typeof l.target === "string" ? l.target : l.target.id}`)
            );
            
            return {
              nodes: [...prev.nodes, ...newNodes],
              links: [...prev.links, ...newLinks],
            };
          });
          setExpandedNodes((prev) => new Set([...prev, node.id]));
        }
      }
      
      if (onEntityClick) {
        onEntityClick(node.id, node.name);
      }
    },
    [onEntityClick, viewMode, progressiveMode, expandedNodes, fetchNodeNeighbors]
  );

  // Node bundling/clustering: Simple community detection by entity type
  const computeClusters = useCallback((data: GraphData): Map<string, string[]> => {
    const clusterMap = new Map<string, string[]>();
    
    // Group nodes by entity type (simple clustering)
    data.nodes.forEach((node) => {
      const clusterKey = node.type || "other";
      if (!clusterMap.has(clusterKey)) {
        clusterMap.set(clusterKey, []);
      }
      clusterMap.get(clusterKey)!.push(node.id);
    });
    
    return clusterMap;
  }, []);

  // Hierarchical layout calculation using d3-hierarchy
  const applyHierarchicalLayout = useCallback((data: GraphData) => {
    if (data.nodes.length === 0) return data;

    // Build a tree structure from the graph
    // Use entity type as hierarchy level, then by mention count
    const nodesByType = new Map<string, GraphNode[]>();
    data.nodes.forEach((node) => {
      const type = node.type || "other";
      if (!nodesByType.has(type)) {
        nodesByType.set(type, []);
      }
      nodesByType.get(type)!.push(node);
    });

    // Sort nodes within each type by mention count
    nodesByType.forEach((nodes) => {
      nodes.sort((a, b) => (b.mentionCount || 0) - (a.mentionCount || 0));
    });

    // Create hierarchy: Root -> Entity Types -> Entities
    const rootData = {
      name: "root",
      children: Array.from(nodesByType.entries()).map(([type, nodes]) => ({
        name: type,
        children: nodes.map((node) => ({ name: node.id, node })),
      })),
    };

    // Create d3 hierarchy
    const root = hierarchy(rootData as any);
    const treeLayout = tree().size([dimensions.width - 100, dimensions.height - 100]);
    treeLayout(root);

    // Map hierarchy positions to nodes
    const nodeMap = new Map<string, { x: number; y: number }>();
    
    root.each((d: any) => {
      if (d.data && d.data.node) {
        // Leaf node (actual entity)
        nodeMap.set(d.data.node.id, {
          x: (d.x || 0) + dimensions.width / 2,
          y: (d.y || 0) + 50,
        });
      }
    });

    // Apply positions to nodes
    const positionedNodes = data.nodes.map((node) => {
      const pos = nodeMap.get(node.id);
      if (pos) {
        return {
          ...node,
          fx: pos.x,
          fy: pos.y,
        };
      }
      return node;
    });

    return {
      ...data,
      nodes: positionedNodes,
    };
  }, [dimensions]);

  // Apply layout to filtered graph data
  const layoutedGraphData = useMemo(() => {
    if (layoutType === "hierarchical") {
      return applyHierarchicalLayout(filteredGraphData);
    }
    // Force-directed: clear fixed positions
    return {
      ...filteredGraphData,
      nodes: filteredGraphData.nodes.map((node) => ({
        ...node,
        fx: null,
        fy: null,
      })),
    };
  }, [filteredGraphData, layoutType, applyHierarchicalLayout]);

  // Update clusters when graph data changes
  useEffect(() => {
    if (bundlingEnabled) {
      setClusters(computeClusters(filteredGraphData));
    } else {
      setClusters(new Map());
    }
  }, [bundlingEnabled, filteredGraphData, computeClusters]);

  // Node color based on type
  const getNodeColor = useCallback((node: GraphNode) => {
    return ENTITY_TYPE_COLORS[node.type] || "#94a3b8";
  }, []);

  // Link color based on type
  const getLinkColor = useCallback((link: GraphLink) => {
    return RELATION_TYPE_COLORS[link.type] || "#475569";
  }, []);

  // Semantic Zoom Levels:
  // - globalScale < 0.2: Heatmap mode (dots only, no labels)
  // - 0.2 <= globalScale < 0.5: Minimal mode (small dots, no labels except hovered/selected)
  // - 0.5 <= globalScale < 1.0: Standard mode (nodes with labels, basic icons)
  // - 1.0 <= globalScale < 1.5: Detailed mode (full labels, source icons, relationship indicators)
  // - globalScale >= 1.5: Metadata mode (labels + mention counts + relationship counts)

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
      // In heatmap mode, use smaller uniform size
      const baseNodeSize = isHeatmapMode ? 2 : Math.max((node.val || 4), 4);
      const nodeSize = baseNodeSize;

      // Draw node circle
      ctx.beginPath();
      ctx.arc(node.x || 0, node.y || 0, nodeSize, 0, 2 * Math.PI);

      // Visual Encoding: Bright colors for focus, muted for context
      const baseColor = getNodeColor(node);
      const colorWithOpacity = opacity < 1 
        ? baseColor + Math.floor(255 * opacity).toString(16).padStart(2, "0")
        : baseColor;

      // HEATMAP MODE: Simple dots only (very zoomed out)
      if (isHeatmapMode) {
        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, nodeSize, 0, 2 * Math.PI);
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

      // MINIMAL MODE & STANDARD MODE: Basic node rendering
      // Fill based on source:
      // - User entities: solid fill
      // - Lenny entities: outlined with pattern fill (lighter)
      // - Both: solid with extra ring
      if (isLenny && !isMinimalMode) {
        // Lenny: lighter fill with dashed outline (skip in minimal mode for performance)
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

      // Highlight on hover/select/focus - Visual Encoding: Bright signal
      if (isHovered || isSelected || isFocused) {
        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, nodeSize + 1 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = isSelected || isFocused ? "#ffffff" : "#cbd5e1";
        ctx.lineWidth = isSelected || isFocused ? 2 / globalScale : 1.5 / globalScale;
        ctx.stroke();
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

        // METADATA MODE: Show mention count and relationship count
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
    [hoveredNode, selectedNode, focusNodeId, getNodeColor]
  );

  // Link rendering - Semantic Zooming: Hide/show details based on zoom
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

      // HEATMAP MODE: Hide links entirely (too zoomed out)
      if (isHeatmapMode && !isHovered && !isInFocusPath) {
        return;
      }

      // Muted Context: Dim links not in focus path
      const linkOpacity = isInFocusPath || !focusNodeId ? 1 : 0.2;
      
      ctx.beginPath();
      ctx.moveTo(sourceNode.x, sourceNode.y || 0);
      ctx.lineTo(targetNode.x, targetNode.y || 0);
      
      // Visual Encoding: Thicker lines for stronger relationships
      // In minimal mode, use thinner lines
      const baseLineWidth = isMinimalMode 
        ? (link.strength * 1 + 0.3) / globalScale
        : (link.strength * 2 + 0.5) / globalScale;
      
      ctx.strokeStyle = isHovered ? "#ffffff" : getLinkColor(link);
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
        // Immediately update dimensions when ref is set
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
      {/* Graph Legend & Controls - Collapsible */}
      <div className="absolute top-2 right-2 z-10">
        {/* Toggle Button */}
        <button
          onClick={() => setControlsExpanded(!controlsExpanded)}
          className="mb-2 w-10 h-10 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors shadow-lg"
          title={controlsExpanded ? "Hide Controls" : "Show Controls"}
          aria-label={controlsExpanded ? "Hide Controls" : "Show Controls"}
        >
          <span className="text-lg">{controlsExpanded ? "✕" : "⚙️"}</span>
        </button>

        {/* Controls Panel */}
        {controlsExpanded && (
          <div className="bg-slate-900/90 backdrop-blur-sm rounded-lg p-3 text-xs space-y-3 shadow-lg max-w-[280px] max-h-[80vh] overflow-y-auto">
        {/* View Mode Toggle - Data Funnel */}
        <div>
          <div className="font-medium text-slate-300 mb-2">View Mode</div>
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                setViewMode("overview");
                setFocusNodeId(null);
                setSelectedNode(null);
              }}
              className={`px-2 py-1 rounded text-[10px] transition-colors ${
                viewMode === "overview"
                  ? "bg-indigo-500 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setViewMode("detailed")}
              className={`px-2 py-1 rounded text-[10px] transition-colors ${
                viewMode === "detailed"
                  ? "bg-indigo-500 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              Detailed
            </button>
          </div>
          {focusNodeId && (
            <button
              onClick={() => {
                setFocusNodeId(null);
                setSelectedNode(null);
              }}
              className="mt-2 w-full px-2 py-1 rounded text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              Clear Focus
            </button>
          )}
        </div>

        {/* Noise Reduction Filters */}
        <div>
          <div className="font-medium text-slate-300 mb-2">Reduce Noise</div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={noiseFilter.hideSupernodes}
                onChange={(e) =>
                  setNoiseFilter({ ...noiseFilter, hideSupernodes: e.target.checked })
                }
                className="w-3 h-3 rounded accent-indigo-500"
              />
              <span className="text-slate-400 text-[10px]">
                Hide Supernodes ({">"}{noiseFilter.supernodeThreshold} connections)
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={noiseFilter.hideLeafNodes}
                onChange={(e) =>
                  setNoiseFilter({ ...noiseFilter, hideLeafNodes: e.target.checked })
                }
                className="w-3 h-3 rounded accent-indigo-500"
              />
              <span className="text-slate-400 text-[10px]">Hide Leaf Nodes (1 connection)</span>
            </label>
            {noiseFilter.hideSupernodes && (
              <div className="mt-1">
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={noiseFilter.supernodeThreshold}
                  onChange={(e) =>
                    setNoiseFilter({
                      ...noiseFilter,
                      supernodeThreshold: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  aria-label="Supernode threshold slider"
                  title={`Supernode threshold: ${noiseFilter.supernodeThreshold}`}
                />
                <div className="text-[9px] text-slate-500 text-center mt-0.5">
                  Threshold: {noiseFilter.supernodeThreshold}
                </div>
              </div>
            )}
          </div>
        </div>

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

        {/* Layout Type */}
        <div>
          <div className="font-medium text-slate-300 mb-2">Layout</div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setLayoutType("force")}
              className={`px-2 py-1 rounded text-[10px] transition-colors ${
                layoutType === "force"
                  ? "bg-indigo-500 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              Force
            </button>
            <button
              onClick={() => setLayoutType("hierarchical")}
              className={`px-2 py-1 rounded text-[10px] transition-colors ${
                layoutType === "hierarchical"
                  ? "bg-indigo-500 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              Hierarchical
            </button>
          </div>
        </div>

        {/* Progressive Expansion */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={progressiveMode}
              onChange={(e) => {
                setProgressiveMode(e.target.checked);
                if (!e.target.checked) {
                  setExpandedNodes(new Set());
                }
              }}
              className="w-3 h-3 rounded accent-indigo-500"
            />
            <span className="text-slate-400 text-[10px]">Progressive Expansion</span>
          </label>
          {progressiveMode && (
            <div className="mt-1">
              <div className="text-slate-500 text-[10px] mb-1">
                Initial Nodes: {initialNodeCount}
              </div>
              <input
                type="range"
                min="20"
                max="200"
                step="10"
                value={initialNodeCount}
                onChange={(e) => {
                  setInitialNodeCount(parseInt(e.target.value, 10));
                  setExpandedNodes(new Set()); // Reset expansions when changing initial count
                }}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                aria-label="Initial node count slider"
                title={`Initial nodes: ${initialNodeCount}`}
              />
            </div>
          )}
        </div>

        {/* Weighted Scoring */}
        <div>
          <div className="font-medium text-slate-300 mb-2">
            Scoring: {weightedScoring.mentions}% Mentions / {weightedScoring.degree}% Connections
          </div>
          <div className="space-y-1">
            <div className="text-slate-500 text-[10px]">Mentions Weight</div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={weightedScoring.mentions}
              onChange={(e) => {
                const mentions = parseInt(e.target.value, 10);
                setWeightedScoring({ mentions, degree: 100 - mentions });
              }}
              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              aria-label="Mentions weight slider"
              title={`Mentions weight: ${weightedScoring.mentions}%`}
            />
          </div>
        </div>

        {/* Node Bundling */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={bundlingEnabled}
              onChange={(e) => setBundlingEnabled(e.target.checked)}
              className="w-3 h-3 rounded accent-indigo-500"
            />
            <span className="text-slate-400 text-[10px]">Node Bundling (by Type)</span>
          </label>
          {bundlingEnabled && clusters.size > 0 && (
            <div className="mt-1 text-slate-500 text-[10px]">
              {clusters.size} clusters
            </div>
          )}
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

        {/* Entity Types */}
        <div>
        <div className="font-medium text-slate-300 mb-2">Entity Types</div>
          <div className="flex flex-wrap gap-2">
          {Object.entries(ENTITY_TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-slate-400 capitalize">{type}</span>
            </div>
          ))}
        </div>
        </div>

        {/* Source Legend */}
        <div>
          <div className="font-medium text-slate-300 mb-2">Source Indicators</div>
          <div className="flex flex-wrap gap-2 text-[10px]">
          <div className="flex items-center gap-1">
              <span className="text-emerald-400">👤</span>
              <span className="text-slate-400">My KG</span>
          </div>
          <div className="flex items-center gap-1">
              <span className="text-purple-400">🎙️</span>
              <span className="text-slate-400">Lenny</span>
          </div>
          <div className="flex items-center gap-1">
              <span className="text-indigo-400">🔗</span>
              <span className="text-slate-400">Both</span>
            </div>
          </div>
        </div>
          </div>
        )}
      </div>

      {/* Zoom Controls - Moved to bottom right */}
      <div className="absolute bottom-2 right-2 z-10 bg-slate-900/90 backdrop-blur-sm rounded-lg p-2 flex flex-col gap-1">
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

      {/* Node/Link Info Panel */}
      {(hoveredNode || hoveredLink || selectedNode) && (
        <div className="absolute top-2 right-2 z-10 bg-slate-900/90 backdrop-blur-sm rounded-lg p-3 text-xs max-w-[200px]">
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
        key={`graph-${dimensions.width}-${dimensions.height}-${layoutType}`}
        backgroundColor="transparent"
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
          ctx.beginPath();
          ctx.arc(node.x || 0, node.y || 0, (node.val || 4) + 2, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkCanvasObject={linkCanvasObject}
        linkPointerAreaPaint={(link: GraphLink, color: string, ctx: CanvasRenderingContext2D) => {
          const sourceNode = link.source as GraphNode;
          const targetNode = link.target as GraphNode;
          if (!sourceNode.x || !targetNode.x) return;
          
          ctx.beginPath();
          ctx.moveTo(sourceNode.x, sourceNode.y || 0);
          ctx.lineTo(targetNode.x, targetNode.y || 0);
          ctx.strokeStyle = color;
          ctx.lineWidth = 8;
          ctx.stroke();
        }}
        onNodeClick={handleNodeClick}
        onNodeHover={setHoveredNode}
        onLinkHover={setHoveredLink}
        onZoom={(zoom: { k?: number }) => {
          const newZoom = zoom.k || 1;
          setZoomLevel(newZoom);
          // Force re-render on zoom change for semantic zooming
          // The canvas will automatically re-render with new detail levels
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
