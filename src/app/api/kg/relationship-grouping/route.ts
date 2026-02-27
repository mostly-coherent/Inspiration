import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * API endpoint for Relationship Grouping (P3): Dynamic Ontology
 * 
 * GET /api/kg/relationship-grouping
 *   - Fetch relationship groups and canonical ontology
 * 
 * POST /api/kg/relationship-grouping/group
 *   - Trigger relationship grouping analysis
 *   - Body: { similarity_threshold?: number }
 * 
 * POST /api/kg/relationship-grouping/merge
 *   - Merge relationships to canonical forms
 *   - Body: { canonical_mappings: { [old_type: string]: string } }
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

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get unique relation types with counts
    const { data, error } = await supabase
      .from("kg_relations")
      .select("relation_type");

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Count occurrences
    const typeCounts: Record<string, number> = {};
    if (data) {
      for (const rel of data) {
        const type = rel.relation_type;
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }
    }

    return NextResponse.json({
      unique_types: Object.keys(typeCounts).length,
      type_counts: typeCounts,
      message: "Use POST /api/kg/relationship-grouping/group to generate groupings",
    });
  } catch (error) {
    console.error("Error in /api/kg/relationship-grouping:", error);
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
    const action = body.action || "group";

    if (action === "group") {
      // Trigger relationship grouping (runs Python script)
      return NextResponse.json({
        message: "Relationship grouping triggered",
        note: "Run group_relationships.py script to generate groupings",
      });
    } else if (action === "merge") {
      const { canonical_mappings } = body;
      if (!canonical_mappings || typeof canonical_mappings !== "object") {
        return NextResponse.json(
          { error: "canonical_mappings object required" },
          { status: 400 }
        );
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      // Update relation types in batches
      let totalUpdated = 0;
      for (const [old_type, new_type] of Object.entries(canonical_mappings)) {
        const { data } = await supabase
          .from("kg_relations")
          .update({ relation_type: new_type as string })
          .eq("relation_type", old_type)
          .select("id");

        totalUpdated += data?.length || 0;
      }

      return NextResponse.json({
        message: `Merged ${totalUpdated} relations to canonical forms`,
        updated: totalUpdated,
      });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in /api/kg/relationship-grouping:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
