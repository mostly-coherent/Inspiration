import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/kg/semantic-matches
 *
 * Returns semantic matches (SEMANTIC_MATCH relations) for visualization.
 * Used to show visual "heat" or "glow" between matched conversations and episodes.
 *
 * Query params:
 * - conversation_id: Optional conversation ID to filter matches
 * - episode_id: Optional episode ID to filter matches
 * - min_similarity: Minimum similarity threshold (default: 0.75)
 *
 * Returns:
 * {
 *   matches: [
 *     {
 *       conversation_id: string,
 *       episode_id: string,
 *       similarity: number,
 *       confidence: number
 *     }
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase not configured", matches: [] },
        { status: 200 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse query params
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversation_id");
    const episodeId = searchParams.get("episode_id");
    const minSimilarity = parseFloat(searchParams.get("min_similarity") || "0.75");

    // Build query for SEMANTIC_MATCH relations
    let query = supabase
      .from("kg_relations")
      .select(`
        source_entity_id,
        target_entity_id,
        confidence,
        evidence_snippet
      `)
      .eq("relation_type", "SEMANTIC_MATCH")
      .gte("confidence", minSimilarity);

    if (conversationId) {
      query = query.eq("source_entity_id", conversationId);
    }

    if (episodeId) {
      query = query.eq("target_entity_id", episodeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching semantic matches:", error);
      return NextResponse.json(
        { error: error.message, matches: [] },
        { status: 500 }
      );
    }

    // Format matches
    const matches = (data || []).map((rel) => ({
      conversation_id: rel.source_entity_id,
      episode_id: rel.target_entity_id,
      similarity: rel.confidence || 0,
      confidence: rel.confidence || 0,
      evidence: rel.evidence_snippet || "",
    }));

    return NextResponse.json({ matches });
  } catch (error) {
    console.error("Error in /api/kg/semantic-matches:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        matches: [],
      },
      { status: 500 }
    );
  }
}
