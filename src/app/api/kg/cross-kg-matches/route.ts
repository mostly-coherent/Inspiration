import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * API endpoint for Cross-KG Semantic Matching (P4)
 * 
 * GET /api/kg/cross-kg-matches
 *   Query params:
 *   - entity_id?: string - Find matches for specific entity
 *   - similarity_threshold?: number (default: 0.75)
 *   - top_k?: number (default: 10)
 *   - user_limit?: number - Limit user entities checked
 *   - lenny_limit?: number - Limit Lenny entities checked
 * 
 * Returns semantic matches between User KG ↔ Lenny KG entities
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
    const searchParams = request.nextUrl.searchParams;

    const entityId = searchParams.get("entity_id");
    const similarityThreshold = parseFloat(
      searchParams.get("similarity_threshold") || "0.75"
    );
    const topK = parseInt(searchParams.get("top_k") || "10", 10);
    const userLimit = searchParams.get("user_limit")
      ? parseInt(searchParams.get("user_limit")!, 10)
      : null;
    const lennyLimit = searchParams.get("lenny_limit")
      ? parseInt(searchParams.get("lenny_limit")!, 10)
      : null;

    // If entity_id provided, find matches for that specific entity
    if (entityId) {
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
          .limit(lennyLimit || 1000);

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
          .limit(userLimit || 1000);

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
            lenny_entity_id:
              sourceType === "user" ? target.id : entityData.id,
            lenny_entity_name:
              sourceType === "user"
                ? target.canonical_name
                : entityData.canonical_name,
            similarity,
            user_entity_type:
              sourceType === "user"
                ? entityData.entity_type
                : target.entity_type,
            lenny_entity_type:
              sourceType === "user"
                ? target.entity_type
                : entityData.entity_type,
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
      });
    }

    // Otherwise, find matches across all entities (limited)
    // Fetch user entities
    const { data: userEntities, error: userError } = await supabase
      .from("kg_entities")
      .select("id, canonical_name, embedding, entity_type, mention_count")
      .eq("source_type", "user")
      .not("embedding", "is", null)
      .order("mention_count", { ascending: false })
      .limit(userLimit || 100);

    if (userError) {
      return NextResponse.json(
        { error: userError.message, matches: [] },
        { status: 500 }
      );
    }

    // Fetch Lenny entities
    const { data: lennyEntities, error: lennyError } = await supabase
      .from("kg_entities")
      .select("id, canonical_name, embedding, entity_type, mention_count")
      .in("source_type", ["expert", "lenny"])
      .not("embedding", "is", null)
      .order("mention_count", { ascending: false })
      .limit(lennyLimit || 100);

    if (lennyError) {
      return NextResponse.json(
        { error: lennyError.message, matches: [] },
        { status: 500 }
      );
    }

    // Compute similarities
    const allMatches = [];
    for (const userEntity of userEntities || []) {
      if (!userEntity.embedding) continue;

      const entityMatches = [];
      for (const lennyEntity of lennyEntities || []) {
        if (!lennyEntity.embedding) continue;

        const similarity = cosineSimilarity(
          userEntity.embedding as number[],
          lennyEntity.embedding as number[]
        );

        if (similarity >= similarityThreshold) {
          entityMatches.push({
            user_entity_id: userEntity.id,
            user_entity_name: userEntity.canonical_name,
            lenny_entity_id: lennyEntity.id,
            lenny_entity_name: lennyEntity.canonical_name,
            similarity,
            user_entity_type: userEntity.entity_type,
            lenny_entity_type: lennyEntity.entity_type,
          });
        }
      }

      // Sort by similarity and take top K per user entity
      entityMatches.sort((a, b) => b.similarity - a.similarity);
      allMatches.push(...entityMatches.slice(0, topK));
    }

    // Sort all matches by similarity
    allMatches.sort((a, b) => b.similarity - a.similarity);

    return NextResponse.json({
      matches: allMatches,
      total_found: allMatches.length,
      threshold: similarityThreshold,
      user_entities_checked: userEntities?.length || 0,
      lenny_entities_checked: lennyEntities?.length || 0,
    });
  } catch (error) {
    console.error("Error in /api/kg/cross-kg-matches:", error);
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
