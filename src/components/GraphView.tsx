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

export default function GraphView({
  centerEntityId,
  onEntityClick,
  height = 500,
  className = "",
}: GraphViewProps) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

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
        params.set("depth", "2");
      }
      params.set("limit", "100");

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

      setGraphData({
        nodes: data.nodes || [],
        links: data.links || [],
      });
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
  }, [centerEntityId]);

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

  // Handle node click
  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setSelectedNode(node);
      if (onEntityClick) {
        onEntityClick(node.id, node.name);
      }
    },
    [onEntityClick]
  );

  // Node color based on type
  const getNodeColor = useCallback((node: GraphNode) => {
    return ENTITY_TYPE_COLORS[node.type] || "#94a3b8";
  }, []);

  // Link color based on type
  const getLinkColor = useCallback((link: GraphLink) => {
    return RELATION_TYPE_COLORS[link.type] || "#475569";
  }, []);

  // Node canvas rendering with source visual distinction
  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name;
      const fontSize = Math.max(10 / globalScale, 3);
      const nodeSize = Math.max((node.val || 4), 4);
      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;
      const isLenny = node.source === "lenny";
      const isBoth = node.source === "both";

      // Draw node circle
      ctx.beginPath();
      ctx.arc(node.x || 0, node.y || 0, nodeSize, 0, 2 * Math.PI);

      // Fill based on source:
      // - User entities: solid fill
      // - Lenny entities: outlined with pattern fill (lighter)
      // - Both: solid with extra ring
      if (isLenny) {
        // Lenny: lighter fill with dashed outline
        ctx.fillStyle = getNodeColor(node) + "60"; // 60 = 37.5% opacity
        ctx.fill();
        ctx.setLineDash([3 / globalScale, 2 / globalScale]);
        ctx.strokeStyle = getNodeColor(node);
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // User or unknown: solid fill
        ctx.fillStyle = getNodeColor(node);
        ctx.fill();
      }

      // "Both" sources get an extra ring
      if (isBoth) {
        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, nodeSize + 2 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = "#a78bfa"; // purple ring for "both"
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
      }

      // Highlight on hover/select
      if (isHovered || isSelected) {
        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, nodeSize + 1 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = isSelected ? "#ffffff" : "#cbd5e1";
        ctx.lineWidth = isSelected ? 2 / globalScale : 1.5 / globalScale;
        ctx.stroke();
      }

      // Draw label
      if (globalScale > 0.5 || isHovered || isSelected) {
        ctx.font = `${isSelected ? "bold " : ""}${fontSize}px Sans-Serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isSelected ? "#ffffff" : isHovered ? "#e2e8f0" : "#94a3b8";
        ctx.fillText(label, node.x || 0, (node.y || 0) + nodeSize + 2);

        // Source indicator icon (small)
        if (globalScale > 1 && (isLenny || isBoth)) {
          ctx.font = `${fontSize * 0.7}px Sans-Serif`;
          ctx.fillStyle = isLenny ? "#c084fc" : "#a78bfa"; // purple shades
          const icon = isLenny ? "🎙️" : isBoth ? "🔗" : "";
          ctx.fillText(icon, (node.x || 0) + nodeSize + 3, (node.y || 0) - nodeSize);
        }
      }
    },
    [hoveredNode, selectedNode, getNodeColor]
  );

  // Link rendering
  const linkCanvasObject = useCallback(
    (link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const sourceNode = link.source as GraphNode;
      const targetNode = link.target as GraphNode;
      
      if (!sourceNode.x || !targetNode.x) return;

      const isHovered = hoveredLink === link;
      
      ctx.beginPath();
      ctx.moveTo(sourceNode.x, sourceNode.y || 0);
      ctx.lineTo(targetNode.x, targetNode.y || 0);
      ctx.strokeStyle = isHovered ? "#ffffff" : getLinkColor(link);
      ctx.lineWidth = isHovered ? 2 / globalScale : (link.strength * 2 + 0.5) / globalScale;
      ctx.globalAlpha = isHovered ? 1 : 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Draw arrow for direction
      if (globalScale > 0.8 || isHovered) {
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
    },
    [hoveredLink, getLinkColor]
  );

  // Graph dimensions
  const graphWidth = useMemo(() => {
    if (containerRef.current) {
      return containerRef.current.clientWidth || 800;
    }
    return 800;
  }, [containerRef.current?.clientWidth]);

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
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Graph Legend */}
      <div className="absolute top-2 left-2 z-10 bg-slate-900/90 backdrop-blur-sm rounded-lg p-3 text-xs">
        <div className="font-medium text-slate-300 mb-2">Entity Types</div>
        <div className="flex flex-wrap gap-2 mb-3">
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
        <div className="font-medium text-slate-300 mb-2">Sources</div>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-slate-400">👤 My KG</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400/40 border border-purple-400 border-dashed" />
            <span className="text-slate-400">🎙️ Lenny</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 ring-1 ring-purple-400 ring-offset-1 ring-offset-slate-900" />
            <span className="text-slate-400">🔗 Both</span>
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
        {graphData.nodes.length} entities • {graphData.links.length} relations
      </div>

      {/* Force Graph */}
      <ForceGraph2D
        graphData={graphData}
        width={graphWidth}
        height={height}
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
        cooldownTicks={100}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={2}
        enableNodeDrag={true}
        enableZoomPanInteraction={true}
      />
    </div>
  );
}
