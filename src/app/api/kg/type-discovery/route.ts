import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * API endpoint for Schema Evolution (P2): Type Discovery
 * 
 * GET /api/kg/type-discovery
 *   - Fetch type proposals (from cache or generate new)
 * 
 * POST /api/kg/type-discovery/discover
 *   - Trigger type discovery analysis
 *   - Body: { limit?: number, min_cluster_size?: number, eps?: number, max_proposals?: number }
 * 
 * POST /api/kg/type-discovery/approve
 *   - Approve a type proposal and add to enum
 *   - Body: { proposed_type: string, description: string }
 * 
 * POST /api/kg/type-discovery/reclassify
 *   - Re-classify "other" entities to new type
 *   - Body: { new_type: string, entity_ids: string[] }
 */

export async function GET(_request: NextRequest) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 }
      );
    }

    const _supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch pending type proposals (stored in a table or cache)
    // For now, return empty array - proposals are generated on-demand
    return NextResponse.json({
      proposals: [],
      message: "Use POST /api/kg/type-discovery/discover to generate proposals",
    });
  } catch (error) {
    console.error("Error in /api/kg/type-discovery:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const action = body.action || "discover";

    if (action === "discover") {
      // Trigger type discovery (runs Python script)
      // For now, return placeholder - actual implementation would spawn Python script
      return NextResponse.json({
        message: "Type discovery triggered",
        note: "Run discover_entity_types.py script to generate proposals",
      });
    } else if (action === "approve") {
      const { proposed_type } = body;
      if (!proposed_type) {
        return NextResponse.json(
          { error: "proposed_type required" },
          { status: 400 }
        );
      }

      // Add new type to enum (requires SQL migration)
      return NextResponse.json({
        message: "Type approval requires SQL migration",
        note: `Run: ALTER TYPE entity_type ADD VALUE IF NOT EXISTS '${proposed_type}';`,
      });
    } else if (action === "reclassify") {
      const { new_type, entity_ids } = body;
      if (!new_type || !entity_ids || !Array.isArray(entity_ids)) {
        return NextResponse.json(
          { error: "new_type and entity_ids array required" },
          { status: 400 }
        );
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      // Update entity types
      const { error } = await supabase
        .from("kg_entities")
        .update({ entity_type: new_type })
        .in("id", entity_ids);

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        message: `Re-classified ${entity_ids.length} entities to ${new_type}`,
        updated: entity_ids.length,
      });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in /api/kg/type-discovery:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
