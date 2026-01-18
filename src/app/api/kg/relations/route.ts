import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireFeature } from "@/lib/featureFlags";

/**
 * GET /api/kg/relations
 *
 * Query params:
 * - entity_id: Get relations for specific entity (both incoming and outgoing)
 * - type: Filter by relation type (SOLVES, CAUSES, ENABLES, etc.)
 * - limit: Max results (default: 50)
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
        { error: "Supabase not configured", relations: [], stats: null },
        { status: 200 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse query params
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get("entity_id");
    const type = searchParams.get("type");
    const limitParam = searchParams.get("limit") || "50";
    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 100);

    // If entity_id provided, use RPC function for efficiency
    if (entityId) {
      try {
        const { data, error } = await supabase.rpc("get_entity_relations", {
          p_entity_id: entityId,
        });

        if (error) {
          console.error("RPC error:", error);
          // Fallback to manual query
          return await fetchEntityRelationsManualInline(supabase, entityId, limit);
        }

        // Validate response structure
        if (!data || typeof data !== "object") {
          console.error("Invalid RPC response:", data);
          return await fetchEntityRelationsManualInline(supabase, entityId, limit);
        }

        return NextResponse.json({
          entityId,
          outgoing: Array.isArray(data.outgoing) ? data.outgoing : [],
          incoming: Array.isArray(data.incoming) ? data.incoming : [],
        });
      } catch {
        // RPC might not exist, fallback to manual
        return await fetchEntityRelationsManualInline(supabase, entityId, limit);
      }
    }

    // Get general relations stats
    try {
      const { data: statsData, error: statsError } = await supabase.rpc(
        "get_kg_relations_stats"
      );

      if (statsError) {
        console.error("Stats RPC error:", statsError);
      }

      // Also get recent relations for display
      let query = supabase
        .from("kg_relations")
        .select(
          `
          id,
          source_entity_id,
          target_entity_id,
          relation_type,
          evidence_snippet,
          confidence,
          occurrence_count
        `
        )
        .order("occurrence_count", { ascending: false })
        .limit(limit);

      if (type) {
        query = query.eq("relation_type", type);
      }

      const { data: relations, error: relError } = await query;

      if (relError) {
        console.error("Error fetching relations:", relError);
        return NextResponse.json(
          { error: relError.message, relations: [], stats: null },
          { status: 500 }
        );
      }

      return NextResponse.json({
        relations: relations || [],
        stats: statsData || { total_relations: 0, by_type: {} },
      });
    } catch (error) {
      console.error("Error in relations API:", error);
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          relations: [],
          stats: null,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in /api/kg/relations:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        relations: [],
        stats: null,
      },
      { status: 500 }
    );
  }
}

/**
 * Fallback function to fetch entity relations manually (if RPC doesn't exist)
 * Uses inline types to avoid Supabase client type issues
 */
async function fetchEntityRelationsManualInline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entityId: string,
  limit: number
) {
  // Fetch outgoing relations
  const { data: outgoingData, error: outError } = await supabase
    .from("kg_relations")
    .select(
      `
      id,
      target_entity_id,
      relation_type,
      evidence_snippet,
      confidence,
      occurrence_count
    `
    )
    .eq("source_entity_id", entityId)
    .order("occurrence_count", { ascending: false })
    .limit(limit);

  if (outError) {
    console.error("Error fetching outgoing relations:", outError);
  }

  const outgoing = (outgoingData || []) as Array<{
    id: string;
    target_entity_id?: string;
    relation_type: string;
    evidence_snippet: string | null;
    confidence: number;
    occurrence_count: number;
  }>;

  // Fetch incoming relations
  const { data: incomingData, error: inError } = await supabase
    .from("kg_relations")
    .select(
      `
      id,
      source_entity_id,
      relation_type,
      evidence_snippet,
      confidence,
      occurrence_count
    `
    )
    .eq("target_entity_id", entityId)
    .order("occurrence_count", { ascending: false })
    .limit(limit);

  if (inError) {
    console.error("Error fetching incoming relations:", inError);
  }

  const incoming = (incomingData || []) as Array<{
    id: string;
    source_entity_id?: string;
    relation_type: string;
    evidence_snippet: string | null;
    confidence: number;
    occurrence_count: number;
  }>;

  // Fetch entity names for the relations
  const entityIds = new Set<string>();
  outgoing.forEach((r) => {
    if (r.target_entity_id) entityIds.add(r.target_entity_id);
  });
  incoming.forEach((r) => {
    if (r.source_entity_id) entityIds.add(r.source_entity_id);
  });

  let entityNameMap: Record<string, { name: string; type: string }> = {};
  if (entityIds.size > 0) {
    try {
      const { data: entitiesData, error: entitiesError } = await supabase
        .from("kg_entities")
        .select("id, canonical_name, entity_type")
        .in("id", Array.from(entityIds));

      if (entitiesError) {
        console.error("Error fetching entity names:", entitiesError);
      } else {
        const entities = (entitiesData || []) as Array<{
          id: string;
          canonical_name: string;
          entity_type: string;
        }>;
        if (entities.length > 0) {
          entityNameMap = Object.fromEntries(
            entities.map((e) => [
              e.id,
              { name: e.canonical_name || "Unknown", type: e.entity_type || "unknown" },
            ])
          );
        }
      }
    } catch (err) {
      console.error("Error building entity name map:", err);
    }
  }

  return NextResponse.json({
    entityId,
    outgoing: outgoing.map((r) => ({
      id: r.id,
      target_entity_id: r.target_entity_id,
      target_name: r.target_entity_id ? entityNameMap[r.target_entity_id]?.name || "Unknown" : "Unknown",
      target_type: r.target_entity_id ? entityNameMap[r.target_entity_id]?.type || "unknown" : "unknown",
      relation_type: r.relation_type,
      evidence_snippet: r.evidence_snippet,
      confidence: r.confidence,
      occurrence_count: r.occurrence_count,
    })),
    incoming: incoming.map((r) => ({
      id: r.id,
      source_entity_id: r.source_entity_id,
      source_name: r.source_entity_id ? entityNameMap[r.source_entity_id]?.name || "Unknown" : "Unknown",
      source_type: r.source_entity_id ? entityNameMap[r.source_entity_id]?.type || "unknown" : "unknown",
      relation_type: r.relation_type,
      evidence_snippet: r.evidence_snippet,
      confidence: r.confidence,
      occurrence_count: r.occurrence_count,
    })),
  });
}
