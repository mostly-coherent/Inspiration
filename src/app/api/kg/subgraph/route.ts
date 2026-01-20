import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireFeature } from "@/lib/featureFlags";

interface GraphNode {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
  val?: number; // Used for node sizing
  source?: string; // Data source: user, lenny, both, unknown
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
  strength: number;
  evidence?: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/**
 * GET /api/kg/subgraph
 *
 * Query params:
 * - center_entity_id: Optional entity to center the graph around
 * - limit: Max nodes to return (default: 50, max: 200)
 * - depth: How many hops from center entity (default: 2, max: 3)
 * - type: Filter by entity type
 * - source: Filter by data source (user, lenny, both, all) - default: all
 */
export async function GET(request: NextRequest) {
  // Feature flag: Return 404 if KG is disabled
  const featureCheck = requireFeature("KNOWLEDGE_GRAPH");
  if (featureCheck) return featureCheck;

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase not configured", nodes: [], links: [] },
        { status: 200 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse query params
    const { searchParams } = new URL(request.url);
    const centerEntityId = searchParams.get("center_entity_id");
    const typeFilter = searchParams.get("type");
    const sourceFilter = searchParams.get("source") || "all";
    const limitParam = searchParams.get("limit") || "50";
    const depthParam = searchParams.get("depth") || "2";

    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200);
    const depth = Math.min(Math.max(parseInt(depthParam, 10) || 2, 1), 3);

    // Validate centerEntityId format (UUID v4 pattern)
    if (centerEntityId) {
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(centerEntityId)) {
        return NextResponse.json(
          { error: "Invalid entity ID format", nodes: [], links: [] },
          { status: 400 }
        );
      }
      return await buildCenteredSubgraph(supabase, centerEntityId, depth, limit, sourceFilter);
    }

    // Otherwise, return the top entities and their relations
    return await buildTopEntitiesGraph(supabase, limit, typeFilter, sourceFilter);
  } catch (error) {
    console.error("Error in /api/kg/subgraph:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        nodes: [],
        links: [],
      },
      { status: 500 }
    );
  }
}

/**
 * Build a subgraph centered around a specific entity
 */
async function buildCenteredSubgraph(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  centerEntityId: string,
  depth: number,
  limit: number,
  sourceFilter: string
): Promise<NextResponse> {
  const nodeIds = new Set<string>([centerEntityId]);
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // BFS to find connected entities up to `depth` hops
  let currentLayer = [centerEntityId];
  
  for (let d = 0; d < depth && nodeIds.size < limit; d++) {
    if (currentLayer.length === 0) break;

    // Find all relations where current layer entities are source or target
    // Build OR query safely - fetch relations where source OR target is in current layer
    // Supabase doesn't support OR with .in() directly, so we'll fetch both and merge
    const { data: sourceRelations, error: sourceError } = await supabase
      .from("kg_relations")
      .select("source_entity_id, target_entity_id, relation_type, evidence_snippet, occurrence_count")
      .in("source_entity_id", currentLayer)
      .limit(limit * 3);

    const { data: targetRelations, error: targetError } = await supabase
      .from("kg_relations")
      .select("source_entity_id, target_entity_id, relation_type, evidence_snippet, occurrence_count")
      .in("target_entity_id", currentLayer)
      .limit(limit * 3);

    const relError = sourceError || targetError;
    // Merge and deduplicate relations
    const relationsMap = new Map<string, { source_entity_id: string; target_entity_id: string; relation_type: string; evidence_snippet: string | null; occurrence_count: number }>();
    [...(sourceRelations || []), ...(targetRelations || [])].forEach((rel) => {
      if (!rel || !rel.source_entity_id || !rel.target_entity_id || !rel.relation_type) {
        return; // Skip invalid relations
      }
      const key = `${rel.source_entity_id}-${rel.target_entity_id}-${rel.relation_type}`;
      if (!relationsMap.has(key)) {
        relationsMap.set(key, rel);
      }
    });
    const relationsData = Array.from(relationsMap.values());

    if (relError) {
      console.error("Error fetching relations:", relError);
      break;
    }

    const nextLayer: string[] = [];

    for (const rel of relationsData || []) {
      // Add both endpoints to node set
      if (!nodeIds.has(rel.source_entity_id) && nodeIds.size < limit) {
        nodeIds.add(rel.source_entity_id);
        nextLayer.push(rel.source_entity_id);
      }
      if (!nodeIds.has(rel.target_entity_id) && nodeIds.size < limit) {
        nodeIds.add(rel.target_entity_id);
        nextLayer.push(rel.target_entity_id);
      }

      // Add link (avoid duplicates)
      const linkKey = `${rel.source_entity_id}-${rel.target_entity_id}-${rel.relation_type}`;
      const existingLink = links.find(
        (l) =>
          l.source === rel.source_entity_id &&
          l.target === rel.target_entity_id &&
          l.type === rel.relation_type
      );
      
      if (!existingLink) {
        links.push({
          source: rel.source_entity_id,
          target: rel.target_entity_id,
          type: rel.relation_type,
          strength: Math.min(rel.occurrence_count || 1, 10) / 10,
          evidence: rel.evidence_snippet || undefined,
        });
      }
    }

    currentLayer = nextLayer;
  }

  // Fetch entity details for all collected node IDs
  if (nodeIds.size > 0) {
    let entitiesQuery = supabase
      .from("kg_entities")
      .select("id, canonical_name, entity_type, mention_count, source_type")
      .in("id", Array.from(nodeIds));

    // Apply source filter (use source_type column, not source)
    if (sourceFilter === "user") {
      entitiesQuery = entitiesQuery.eq("source_type", "user");
    } else if (sourceFilter === "lenny") {
      entitiesQuery = entitiesQuery.eq("source_type", "expert"); // Changed to 'expert' to match Python backend
    } else if (sourceFilter === "both") {
      entitiesQuery = entitiesQuery.eq("source_type", "both");
    }

    const { data: entitiesData, error: entError } = await entitiesQuery;

    if (entError) {
      console.error("Error fetching entities:", entError);
    } else {
      for (const entity of entitiesData || []) {
        nodes.push({
          id: entity.id,
          name: entity.canonical_name,
          type: entity.entity_type,
          mentionCount: entity.mention_count || 1,
          val: Math.max(Math.log(entity.mention_count || 1) + 1, 1) * 2,
          source: entity.source_type || "unknown",
        });
      }
    }
  }

  // Filter links to only include links where both endpoints are in nodes
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const filteredLinks = links.filter(
    (l) => nodeIdSet.has(l.source) && nodeIdSet.has(l.target)
  );

  return NextResponse.json({
    centerEntityId,
    nodes,
    links: filteredLinks,
  });
}

/**
 * Build a graph from top entities by mention count
 */
async function buildTopEntitiesGraph(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  limit: number,
  typeFilter: string | null,
  sourceFilter: string
): Promise<NextResponse> {
  // Fetch top entities
  let entitiesQuery = supabase
    .from("kg_entities")
    .select("id, canonical_name, entity_type, mention_count, source_type")
    .order("mention_count", { ascending: false })
    .limit(limit);

  if (typeFilter) {
    entitiesQuery = entitiesQuery.eq("entity_type", typeFilter);
  }

  // Apply source filter (use source_type column, not source)
  if (sourceFilter === "user") {
    entitiesQuery = entitiesQuery.eq("source_type", "user");
  } else if (sourceFilter === "lenny") {
    entitiesQuery = entitiesQuery.eq("source_type", "expert"); // Changed to 'expert' to match Python backend
  } else if (sourceFilter === "both") {
    entitiesQuery = entitiesQuery.eq("source_type", "both");
  }

  const { data: entitiesData, error: entError } = await entitiesQuery;

  if (entError) {
    console.error("Error fetching top entities:", entError);
    return NextResponse.json(
      { error: entError.message, nodes: [], links: [] },
      { status: 500 }
    );
  }

  const nodes: GraphNode[] = (entitiesData || []).map((entity: {
    id: string;
    canonical_name: string;
    entity_type: string;
    mention_count: number;
    source_type?: string;
  }) => ({
    id: entity.id,
    name: entity.canonical_name,
    type: entity.entity_type,
    mentionCount: entity.mention_count || 1,
    val: Math.max(Math.log(entity.mention_count || 1) + 1, 1) * 2,
    source: entity.source_type || "unknown",
  }));

  const nodeIds = nodes.map((n) => n.id);

  // Fetch relations between these entities
  const links: GraphLink[] = [];
  
  if (nodeIds.length > 1) {
    try {
      const { data: relationsData, error: relError } = await supabase
        .from("kg_relations")
        .select("source_entity_id, target_entity_id, relation_type, evidence_snippet, occurrence_count")
        .in("source_entity_id", nodeIds)
        .in("target_entity_id", nodeIds)
        .limit(limit * 3);

      if (relError) {
        console.error("Error fetching relations:", relError);
      } else if (relationsData && Array.isArray(relationsData)) {
        const nodeIdSet = new Set(nodeIds); // Use Set for O(1) lookup
        for (const rel of relationsData) {
          // Validate relation structure
          if (!rel.source_entity_id || !rel.target_entity_id || !rel.relation_type) {
            continue;
          }
          
          // Only add link if both endpoints are in our node set
          if (nodeIdSet.has(rel.source_entity_id) && nodeIdSet.has(rel.target_entity_id)) {
            links.push({
              source: rel.source_entity_id,
              target: rel.target_entity_id,
              type: rel.relation_type,
              strength: Math.min(rel.occurrence_count || 1, 10) / 10,
              evidence: rel.evidence_snippet || undefined,
            });
          }
        }
      }
    } catch (err) {
      console.error("Error processing relations:", err);
      // Continue without relations rather than failing
    }
  }

  return NextResponse.json({
    nodes,
    links,
  });
}
