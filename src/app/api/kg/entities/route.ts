import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireFeature } from "@/lib/featureFlags";

/**
 * GET /api/kg/entities
 *
 * Query params:
 * - type: Filter by entity type (tool, pattern, problem, concept, person, project, workflow)
 * - sort: Sort by (mentions, recent, name) - default: mentions
 * - limit: Max results (default: 50)
 * - search: Search by name (case-insensitive)
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
        { error: "Supabase not configured", entities: [] },
        { status: 200 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse query params
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const sort = searchParams.get("sort") || "mentions";
    const limitParam = searchParams.get("limit") || "50";
    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200); // Clamp between 1-200
    const search = searchParams.get("search")?.trim().substring(0, 100); // Limit search length
    const confidenceFilter = searchParams.get("confidence"); // "high", "medium", "low", or null

    // Build query
    let query = supabase.from("kg_entities").select("*");

    // Filter by type
    if (type && type !== "all") {
      query = query.eq("entity_type", type);
    }

    // Search by name
    if (search) {
      query = query.ilike("canonical_name", `%${search}%`);
    }

    // Filter by confidence
    if (confidenceFilter === "high") {
      query = query.gte("confidence", 0.8);
    } else if (confidenceFilter === "medium") {
      query = query.gte("confidence", 0.5).lt("confidence", 0.8);
    } else if (confidenceFilter === "low") {
      query = query.lt("confidence", 0.5);
    }

    // Sort
    switch (sort) {
      case "recent":
        query = query.order("last_seen", { ascending: false, nullsFirst: false });
        break;
      case "name":
        query = query.order("canonical_name", { ascending: true });
        break;
      case "mentions":
      default:
        query = query.order("mention_count", { ascending: false });
        break;
    }

    // Limit
    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching entities:", error);
      return NextResponse.json(
        { error: error.message, entities: [] },
        { status: 500 }
      );
    }

    // Transform data for frontend
    const entities = (data || []).map((entity) => ({
      id: entity.id,
      name: entity.canonical_name,
      type: entity.entity_type,
      aliases: entity.aliases || [],
      mentionCount: entity.mention_count || 0,
      firstSeen: entity.first_seen,
      lastSeen: entity.last_seen,
      confidence: entity.confidence || 1.0,
    }));

    return NextResponse.json({ entities });
  } catch (error: unknown) {
    console.error("Error in /api/kg/entities:", error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Unknown error",
        entities: [] 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/kg/entities/[id]
 * Get single entity with mentions
 */
export async function POST(request: NextRequest) {
  // Feature flag: Return 404 if KG is disabled
  const featureCheck = requireFeature("KNOWLEDGE_GRAPH");
  if (featureCheck) return featureCheck;

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 200 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const { entityId } = body;

    if (!entityId || typeof entityId !== "string") {
      return NextResponse.json(
        { error: "entityId required (must be a string)" },
        { status: 400 }
      );
    }

    // Fetch entity
    const { data: entity, error: entityError } = await supabase
      .from("kg_entities")
      .select("*")
      .eq("id", entityId)
      .single();

    if (entityError || !entity) {
      return NextResponse.json(
        { error: "Entity not found" },
        { status: 404 }
      );
    }

    // Fetch mentions
    const { data: mentions, error: mentionsError } = await supabase
      .from("kg_entity_mentions")
      .select("*")
      .eq("entity_id", entityId)
      .order("message_timestamp", { ascending: false })
      .limit(20);

    if (mentionsError) {
      console.error("Error fetching mentions:", mentionsError);
      // Return entity with empty mentions rather than failing completely
    }

    return NextResponse.json({
      entity: {
        id: entity.id,
        name: entity.canonical_name,
        type: entity.entity_type,
        aliases: entity.aliases || [],
        description: entity.description,
        mentionCount: entity.mention_count || 0,
        firstSeen: entity.first_seen,
        lastSeen: entity.last_seen,
        confidence: entity.confidence || 1.0,
      },
      mentions: (mentions || []).map((m) => ({
        id: m.id,
        contextSnippet: m.context_snippet,
        timestamp: m.message_timestamp,
      })),
      mentionsError: mentionsError ? mentionsError.message : null,
    });
  } catch (error) {
    console.error("Error in /api/kg/entities POST:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
