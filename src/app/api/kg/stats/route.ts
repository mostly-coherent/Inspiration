import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireFeature } from "@/lib/featureFlags";

/**
 * GET /api/kg/stats
 *
 * Returns Knowledge Graph statistics:
 * - totalEntities: Total number of unique entities
 * - byType: Breakdown by entity type (tool, pattern, problem, etc.)
 * - totalMentions: Total entity-message links
 * - indexed: Whether any entities have been indexed
 */
export async function GET() {
  // Feature flag: Return 404 if KG is disabled
  const featureCheck = requireFeature("KNOWLEDGE_GRAPH");
  if (featureCheck) return featureCheck;

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          totalEntities: 0,
          byType: {},
          totalMentions: 0,
          indexed: false,
          error: "Supabase not configured",
        },
        { status: 200 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try to use RPC function first (more efficient)
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_kg_stats"
      );

      if (!rpcError && rpcData) {
        return NextResponse.json(rpcData);
      }
    } catch {
      // RPC not available, fall back to manual queries
    }

    // Fallback: Manual queries
    const [entitiesResult, mentionsResult] = await Promise.all([
      supabase.from("kg_entities").select("entity_type"),
      supabase.from("kg_entity_mentions").select("id", { count: "exact" }),
    ]);

    // Check if tables exist
    if (entitiesResult.error?.code === "42P01") {
      // Table doesn't exist
      return NextResponse.json({
        totalEntities: 0,
        byType: {},
        totalMentions: 0,
        indexed: false,
        error: "Knowledge Graph tables not created. Run init_knowledge_graph.sql first.",
      });
    }

    const entities = entitiesResult.data || [];
    const totalMentions = mentionsResult.count || 0;

    // Count by type
    const byType: Record<string, number> = {};
    for (const entity of entities) {
      const type = entity.entity_type;
      byType[type] = (byType[type] || 0) + 1;
    }

    return NextResponse.json({
      totalEntities: entities.length,
      byType,
      totalMentions,
      indexed: entities.length > 0,
    });
  } catch (error) {
    console.error("Error fetching KG stats:", error);
    return NextResponse.json(
      {
        totalEntities: 0,
        byType: {},
        totalMentions: 0,
        indexed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
