import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * API endpoint for Cross-KG Semantic Matching (P4) - Specific Entity
 * 
 * GET /api/kg/cross-kg-matches/[entityId]
 *   Query params:
 *   - similarity_threshold?: number (default: 0.75)
 *   - top_k?: number (default: 10)
 * 
 * Returns semantic matches for a specific entity across User ↔ Lenny KGs
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
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
    const searchParams = request.nextUrl.searchParams;

    const { entityId } = await params;
    const similarityThreshold = parseFloat(
      searchParams.get("similarity_threshold") || "0.75"
    );
    const topK = parseInt(searchParams.get("top_k") || "10", 10);

    // Fetch the entity
    const { data: entityData, error: entityError } = await supabase
      .from("kg_entities")
      .select("id, canonical_name, embedding, entity_type, source_type")
      .eq("id", entityId)
      .single();

    if (entityError || !entityData) {
      return NextResponse.json(
        { error: "Entity not found", matches: [] },
        { status: 404 }
      );
    }

    const sourceType = entityData.source_type;
    const entityEmbedding = entityData.embedding;

    if (!entityEmbedding) {
      return NextResponse.json(
        { error: "Entity has no embedding", matches: [] },
        { status: 400 }
      );
    }

    // Fetch entities from the other KG
    let targetEntities;
    if (sourceType === "user") {
      const { data, error } = await supabase
        .from("kg_entities")
        .select("id, canonical_name, embedding, entity_type, mention_count")
        .in("source_type", ["expert", "lenny"])
        .not("embedding", "is", null)
        .order("mention_count", { ascending: false })
        .limit(1000);

      if (error) {
        return NextResponse.json(
          { error: error.message, matches: [] },
          { status: 500 }
        );
      }
      targetEntities = data || [];
    } else {
      const { data, error } = await supabase
        .from("kg_entities")
        .select("id, canonical_name, embedding, entity_type, mention_count")
        .eq("source_type", "user")
        .not("embedding", "is", null)
        .order("mention_count", { ascending: false })
        .limit(1000);

      if (error) {
        return NextResponse.json(
          { error: error.message, matches: [] },
          { status: 500 }
        );
      }
      targetEntities = data || [];
    }

    // Compute similarities
    const matches = [];
    for (const target of targetEntities) {
      if (!target.embedding) continue;

      const similarity = cosineSimilarity(
        entityEmbedding as number[],
        target.embedding as number[]
      );

      if (similarity >= similarityThreshold) {
        matches.push({
          user_entity_id: sourceType === "user" ? entityData.id : target.id,
          user_entity_name:
            sourceType === "user"
              ? entityData.canonical_name
              : target.canonical_name,
          lenny_entity_id: sourceType === "user" ? target.id : entityData.id,
          lenny_entity_name:
            sourceType === "user"
              ? target.canonical_name
              : entityData.canonical_name,
          similarity,
          user_entity_type:
            sourceType === "user" ? entityData.entity_type : target.entity_type,
          lenny_entity_type:
            sourceType === "user" ? target.entity_type : entityData.entity_type,
        });
      }
    }

    // Sort by similarity and take top K
    matches.sort((a, b) => b.similarity - a.similarity);
    const topMatches = matches.slice(0, topK);

    return NextResponse.json({
      matches: topMatches,
      total_found: matches.length,
      threshold: similarityThreshold,
      entity: {
        id: entityData.id,
        name: entityData.canonical_name,
        type: entityData.entity_type,
        source: sourceType,
      },
    });
  } catch (error) {
    console.error("Error in /api/kg/cross-kg-matches/[entityId]:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        matches: [],
      },
      { status: 500 }
    );
  }
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) {
    return 0.0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) {
    return 0.0;
  }

  return dotProduct / (norm1 * norm2);
}
