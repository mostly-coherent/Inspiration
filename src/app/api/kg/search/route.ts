import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/kg/search
 * Search for entities by name (fuzzy match)
 *
 * Query params:
 * - q: Search query string
 * - limit: Max results (default 10)
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase not configured", results: [] },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] });
    }

    // Perform fuzzy search on canonical_name
    const { data, error } = await supabase
      .from("kg_entities")
      .select("id, canonical_name, entity_type, mention_count, source_type")
      .ilike("canonical_name", `%${query}%`)
      .order("mention_count", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { error: error.message, results: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      results: data.map((entity) => ({
        id: entity.id,
        name: entity.canonical_name,
        type: entity.entity_type,
        mentionCount: entity.mention_count,
        source: entity.source_type,
      })),
    });
  } catch (error) {
    console.error("Error in /api/kg/search:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        results: [],
      },
      { status: 500 }
    );
  }
}
