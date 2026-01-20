import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface PatternAlert {
  problemId: string;
  problemName: string;
  solutionId: string;
  solutionName: string;
  solutionType: string;
  occurrenceCount: number;
  confidence: number;
}

interface MissingLink {
  entityAId: string;
  entityAName: string;
  entityAType: string;
  entityBId: string;
  entityBName: string;
  entityBType: string;
  cooccurrenceCount: number;
  suggestedRelation: string;
  confidence: number;
}

interface EntityPath {
  pathLength: number;
  pathEntities: string[];
  pathEntityNames: string[];
  pathRelations: string[];
  pathRelationTypes: string[];
}

interface EntityCluster {
  entityAId: string;
  entityAName: string;
  entityBId: string;
  entityBName: string;
  sharedRelationsCount: number;
  clusterStrength: number;
}

/**
 * GET /api/kg/intelligence
 *
 * Query params:
 * - type: 'patterns' | 'missing_links' | 'path' | 'clusters'
 * - source_entity_id: For path finding (required for 'path' type)
 * - target_entity_id: For path finding (required for 'path' type)
 * - min_occurrences: Minimum occurrences for patterns (default: 2)
 * - min_cooccurrences: Minimum cooccurrences for missing links (default: 3)
 * - limit: Number of results (default: 20)
 */
export async function GET(request: NextRequest) {
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

    // Parse query params
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "patterns";
    const sourceEntityId = searchParams.get("source_entity_id");
    const targetEntityId = searchParams.get("target_entity_id");
    const minOccurrencesParam = searchParams.get("min_occurrences") || "2";
    const minCooccurrencesParam = searchParams.get("min_cooccurrences") || "3";
    const limitParam = searchParams.get("limit") || "20";

    const minOccurrences = Math.min(
      Math.max(parseInt(minOccurrencesParam, 10) || 2, 1),
      50
    );
    const minCooccurrences = Math.min(
      Math.max(parseInt(minCooccurrencesParam, 10) || 3, 1),
      50
    );
    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100);

    // UUID validation pattern
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    switch (type) {
      case "patterns": {
        const { data, error } = await supabase.rpc(
          "detect_problem_solution_patterns",
          {
            p_min_occurrences: minOccurrences,
            p_limit: limit,
          }
        );

        if (error) {
          console.error("Error detecting patterns:", error);
          return NextResponse.json(
            { error: error.message },
            { status: 500 }
          );
        }

        // Validate and map pattern data
        const patterns: PatternAlert[] = [];
        if (data && Array.isArray(data)) {
          for (const row of data) {
            if (
              !row ||
              typeof row !== "object" ||
              !("problem_id" in row) ||
              !("solution_id" in row)
            ) {
              continue;
            }

            patterns.push({
              problemId: String(row.problem_id),
              problemName: String(row.problem_name || "Unknown"),
              solutionId: String(row.solution_id),
              solutionName: String(row.solution_name || "Unknown"),
              solutionType: String(row.solution_type || "unknown"),
              occurrenceCount: Number(row.occurrence_count) || 0,
              confidence: Number(row.confidence) || 0,
            });
          }
        }

        return NextResponse.json({ patterns });
      }

      case "missing_links": {
        const { data, error } = await supabase.rpc("detect_missing_links", {
          p_min_cooccurrences: minCooccurrences,
          p_limit: limit,
        });

        if (error) {
          console.error("Error detecting missing links:", error);
          return NextResponse.json(
            { error: error.message },
            { status: 500 }
          );
        }

        // Validate and map missing link data
        const missingLinks: MissingLink[] = [];
        if (data && Array.isArray(data)) {
          for (const row of data) {
            if (
              !row ||
              typeof row !== "object" ||
              !("entity_a_id" in row) ||
              !("entity_b_id" in row)
            ) {
              continue;
            }

            missingLinks.push({
              entityAId: String(row.entity_a_id),
              entityAName: String(row.entity_a_name || "Unknown"),
              entityAType: String(row.entity_a_type || "unknown"),
              entityBId: String(row.entity_b_id),
              entityBName: String(row.entity_b_name || "Unknown"),
              entityBType: String(row.entity_b_type || "unknown"),
              cooccurrenceCount: Number(row.cooccurrence_count) || 0,
              suggestedRelation: String(row.suggested_relation || "USED_WITH"),
              confidence: Number(row.confidence) || 0,
            });
          }
        }

        return NextResponse.json({ missingLinks });
      }

      case "path": {
        if (!sourceEntityId || !targetEntityId) {
          return NextResponse.json(
            { error: "source_entity_id and target_entity_id required for path finding" },
            { status: 400 }
          );
        }

        if (!uuidPattern.test(sourceEntityId) || !uuidPattern.test(targetEntityId)) {
          return NextResponse.json(
            { error: "Invalid entity ID format" },
            { status: 400 }
          );
        }

        const { data, error } = await supabase.rpc("find_entity_path", {
          p_source_entity_id: sourceEntityId,
          p_target_entity_id: targetEntityId,
          p_max_depth: 5,
        });

        if (error) {
          console.error("Error finding path:", error);
          return NextResponse.json(
            { error: error.message },
            { status: 500 }
          );
        }

        // Validate and map path data
        const paths: EntityPath[] = [];
        if (data && Array.isArray(data)) {
          for (const row of data) {
            if (
              !row ||
              typeof row !== "object" ||
              !("path_entities" in row) ||
              !("path_length" in row)
            ) {
              continue;
            }

            paths.push({
              pathLength: Number(row.path_length) || 0,
              pathEntities: Array.isArray(row.path_entities)
                ? row.path_entities.map(String)
                : [],
              pathEntityNames: Array.isArray(row.path_entity_names)
                ? row.path_entity_names.map(String)
                : [],
              pathRelations: Array.isArray(row.path_relations)
                ? row.path_relations.map(String)
                : [],
              pathRelationTypes: Array.isArray(row.path_relation_types)
                ? row.path_relation_types.map(String)
                : [],
            });
          }
        }

        return NextResponse.json({ paths });
      }

      case "clusters": {
        const { data, error } = await supabase.rpc("find_entity_clusters", {
          p_min_shared_relations: minOccurrences,
          p_limit: limit,
        });

        if (error) {
          console.error("Error finding clusters:", error);
          return NextResponse.json(
            { error: error.message },
            { status: 500 }
          );
        }

        // Validate and map cluster data
        const clusters: EntityCluster[] = [];
        if (data && Array.isArray(data)) {
          for (const row of data) {
            if (
              !row ||
              typeof row !== "object" ||
              !("entity_a_id" in row) ||
              !("entity_b_id" in row)
            ) {
              continue;
            }

            clusters.push({
              entityAId: String(row.entity_a_id),
              entityAName: String(row.entity_a_name || "Unknown"),
              entityBId: String(row.entity_b_id),
              entityBName: String(row.entity_b_name || "Unknown"),
              sharedRelationsCount: Number(row.shared_relations_count) || 0,
              clusterStrength: Number(row.cluster_strength) || 0,
            });
          }
        }

        return NextResponse.json({ clusters });
      }

      default:
        return NextResponse.json(
          {
            error:
              "Invalid type. Use 'patterns', 'missing_links', 'path', or 'clusters'.",
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error in /api/kg/intelligence:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
