// Type declarations for react-force-graph-2d (and react-force-graph for compatibility)
declare module "react-force-graph-2d" {
  export * from "react-force-graph";
}

declare module "react-force-graph" {
  import { Component, RefObject } from "react";

  export interface GraphNode {
    id: string;
    name?: string;
    val?: number;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
    [key: string]: unknown;
  }

  export interface GraphLink {
    source: string | GraphNode;
    target: string | GraphNode;
    [key: string]: unknown;
  }

  export interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
  }

  export interface ForceGraph2DProps {
    graphData: GraphData;
    width?: number;
    height?: number;
    backgroundColor?: string;
    nodeRelSize?: number;
    nodeId?: string;
    nodeVal?: string | number | ((node: GraphNode) => number);
    nodeLabel?: string | ((node: GraphNode) => string);
    nodeColor?: string | ((node: GraphNode) => string);
    nodeAutoColorBy?: string | ((node: GraphNode) => string);
    nodeCanvasObject?: (
      node: GraphNode,
      ctx: CanvasRenderingContext2D,
      globalScale: number
    ) => void;
    nodeCanvasObjectMode?: string | ((node: GraphNode) => string);
    nodePointerAreaPaint?: (
      node: GraphNode,
      color: string,
      ctx: CanvasRenderingContext2D
    ) => void;
    linkSource?: string;
    linkTarget?: string;
    linkLabel?: string | ((link: GraphLink) => string);
    linkColor?: string | ((link: GraphLink) => string);
    linkAutoColorBy?: string | ((link: GraphLink) => string);
    linkWidth?: number | ((link: GraphLink) => number);
    linkCurvature?: number | ((link: GraphLink) => number);
    linkCanvasObject?: (
      link: GraphLink,
      ctx: CanvasRenderingContext2D,
      globalScale: number
    ) => void;
    linkCanvasObjectMode?: string | ((link: GraphLink) => string);
    linkPointerAreaPaint?: (
      link: GraphLink,
      color: string,
      ctx: CanvasRenderingContext2D
    ) => void;
    linkDirectionalArrowLength?: number | ((link: GraphLink) => number);
    linkDirectionalArrowColor?: string | ((link: GraphLink) => string);
    linkDirectionalArrowRelPos?: number | ((link: GraphLink) => number);
    linkDirectionalParticles?: number | ((link: GraphLink) => number);
    linkDirectionalParticleSpeed?: number | ((link: GraphLink) => number);
    linkDirectionalParticleWidth?: number | ((link: GraphLink) => number);
    linkDirectionalParticleColor?: string | ((link: GraphLink) => string);
    onNodeClick?: (node: GraphNode, event: MouseEvent) => void;
    onNodeRightClick?: (node: GraphNode, event: MouseEvent) => void;
    onNodeHover?: (node: GraphNode | null, prevNode: GraphNode | null) => void;
    onNodeDrag?: (node: GraphNode, translate: { x: number; y: number }) => void;
    onNodeDragEnd?: (node: GraphNode, translate: { x: number; y: number }) => void;
    onLinkClick?: (link: GraphLink, event: MouseEvent) => void;
    onLinkRightClick?: (link: GraphLink, event: MouseEvent) => void;
    onLinkHover?: (link: GraphLink | null, prevLink: GraphLink | null) => void;
    onBackgroundClick?: (event: MouseEvent) => void;
    onBackgroundRightClick?: (event: MouseEvent) => void;
    enableNodeDrag?: boolean;
    enableZoomPanInteraction?: boolean;
    enablePointerInteraction?: boolean;
    d3AlphaDecay?: number;
    d3VelocityDecay?: number;
    d3Force?: (
      forceName: string,
      force?: unknown
    ) => void;
    warmupTicks?: number;
    cooldownTicks?: number;
    cooldownTime?: number;
    onEngineStop?: () => void;
    onEngineTick?: () => void;
    ref?: RefObject<ForceGraph2DInstance>;
  }

  export interface ForceGraph2DInstance {
    centerAt: (x: number, y: number, ms?: number) => void;
    zoom: (zoom: number, ms?: number) => void;
    zoomToFit: (ms?: number, padding?: number, nodeFilter?: (node: GraphNode) => boolean) => void;
    pauseAnimation: () => void;
    resumeAnimation: () => void;
    d3Force: (forceName: string, force?: unknown) => void;
    d3ReheatSimulation: () => void;
    emitParticle: (link: GraphLink) => void;
    refresh: () => void;
    getGraphBbox: () => { x: [number, number]; y: [number, number] };
  }

  export class ForceGraph2D extends Component<ForceGraph2DProps> {
    centerAt: (x: number, y: number, ms?: number) => void;
    zoom: (zoom: number, ms?: number) => void;
    zoomToFit: (ms?: number, padding?: number, nodeFilter?: (node: GraphNode) => boolean) => void;
    pauseAnimation: () => void;
    resumeAnimation: () => void;
    d3Force: (forceName: string, force?: unknown) => void;
    d3ReheatSimulation: () => void;
    emitParticle: (link: GraphLink) => void;
    refresh: () => void;
    getGraphBbox: () => { x: [number, number]; y: [number, number] };
  }

  export class ForceGraph3D extends Component<ForceGraph2DProps> {
    centerAt: (x: number, y: number, ms?: number) => void;
    zoom: (zoom: number, ms?: number) => void;
    zoomToFit: (ms?: number, padding?: number, nodeFilter?: (node: GraphNode) => boolean) => void;
    pauseAnimation: () => void;
    resumeAnimation: () => void;
    d3Force: (forceName: string, force?: unknown) => void;
    d3ReheatSimulation: () => void;
    emitParticle: (link: GraphLink) => void;
    refresh: () => void;
    getGraphBbox: () => { x: [number, number]; y: [number, number] };
  }
}
