import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface EvolutionDataPoint {
  period: string;
  periodStart: string;
  mentionCount: number;
}

interface EntityEvolution {
  entityId: string;
  entityName: string;
  entityType: string;
  data: EvolutionDataPoint[];
}

interface TrendingEntity {
  entityId: string;
  entityName: string;
  entityType: string;
  recentMentions: number;
  historicalMentions: number;
  trendScore: number;
  trendDirection: "rising" | "stable" | "declining";
}

interface ActivityTimeline {
  period: string;
  periodStart: string;
  totalMentions: number;
  uniqueEntities: number;
  newEntities: number;
}

/**
 * GET /api/kg/evolution
 *
 * Query params:
 * - entity_id: Single entity evolution (optional)
 * - entity_ids: Multiple entities for comparison (comma-separated, optional)
 * - type: Filter trending by entity type (optional)
 * - granularity: 'day' | 'week' | 'month' (default: 'month')
 * - limit: Number of periods (default: 12)
 * - mode: 'entity' | 'trending' | 'activity' (default: auto-detected)
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
    const entityId = searchParams.get("entity_id");
    const entityIdsParam = searchParams.get("entity_ids");
    const entityType = searchParams.get("type");
    const granularity = searchParams.get("granularity") || "month";
    const limitParam = searchParams.get("limit") || "12";
    const mode = searchParams.get("mode");

    // Validate granularity
    if (!["day", "week", "month"].includes(granularity)) {
      return NextResponse.json(
        { error: "Invalid granularity. Use 'day', 'week', or 'month'." },
        { status: 400 }
      );
    }

    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 12, 1), 52);

    // UUID validation pattern
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Mode detection and execution
    const detectedMode = mode || (entityId ? "entity" : entityIdsParam ? "compare" : "trending");

    switch (detectedMode) {
      case "entity": {
        // Single entity evolution
        if (!entityId) {
          return NextResponse.json(
            { error: "entity_id required for entity mode" },
            { status: 400 }
          );
        }

        if (!uuidPattern.test(entityId)) {
          return NextResponse.json(
            { error: "Invalid entity_id format" },
            { status: 400 }
          );
        }

        const { data, error } = await supabase.rpc("get_entity_evolution", {
          p_entity_id: entityId,
          p_granularity: granularity,
          p_limit: limit,
        });

        if (error) {
          console.error("Error fetching entity evolution:", error);
          return NextResponse.json(
            { error: error.message },
            { status: 500 }
          );
        }

        // Get entity details
        const { data: entityData, error: entityError } = await supabase
          .from("kg_entities")
          .select("canonical_name, entity_type")
          .eq("id", entityId)
          .single();

        // Handle case where entity doesn't exist
        if (entityError || !entityData) {
          return NextResponse.json(
            { error: "Entity not found" },
            { status: 404 }
          );
        }

        // Validate and map evolution data
        const evolutionData: EvolutionDataPoint[] = [];
        if (data && Array.isArray(data)) {
          for (const row of data) {
            if (
              row &&
              typeof row === "object" &&
              "period" in row &&
              "period_start" in row &&
              "mention_count" in row
            ) {
              evolutionData.push({
                period: String(row.period),
                periodStart: String(row.period_start),
                mentionCount: Number(row.mention_count) || 0,
              });
            }
          }
        }

        const evolution: EntityEvolution = {
          entityId,
          entityName: entityData.canonical_name || "Unknown",
          entityType: entityData.entity_type || "unknown",
          data: evolutionData.reverse(), // Oldest first for charting
        };

        return NextResponse.json({ evolution });
      }

      case "compare": {
        // Multiple entities comparison
        if (!entityIdsParam) {
          return NextResponse.json(
            { error: "entity_ids required for compare mode" },
            { status: 400 }
          );
        }

        const entityIds = entityIdsParam
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
        
        // Validate all UUIDs
        for (const id of entityIds) {
          if (!uuidPattern.test(id)) {
            return NextResponse.json(
              { error: `Invalid entity_id format: ${id}` },
              { status: 400 }
            );
          }
        }

        if (entityIds.length > 10) {
          return NextResponse.json(
            { error: "Maximum 10 entities for comparison" },
            { status: 400 }
          );
        }

        const { data, error } = await supabase.rpc("get_entities_evolution", {
          p_entity_ids: entityIds,
          p_granularity: granularity,
          p_limit: limit,
        });

        if (error) {
          console.error("Error fetching entities evolution:", error);
          return NextResponse.json(
            { error: error.message },
            { status: 500 }
          );
        }

        // Group by entity
        const evolutionMap = new Map<string, EntityEvolution>();
        
        if (data && Array.isArray(data)) {
          for (const row of data) {
            if (
              !row ||
              typeof row !== "object" ||
              !("entity_id" in row) ||
              !("period" in row) ||
              !("period_start" in row) ||
              !("mention_count" in row)
            ) {
              continue; // Skip invalid rows
            }

            const key = String(row.entity_id);
            if (!evolutionMap.has(key)) {
              evolutionMap.set(key, {
                entityId: key,
                entityName: String(row.entity_name || "Unknown"),
                entityType: String(row.entity_type || "unknown"),
                data: [],
              });
            }
            
            const evolution = evolutionMap.get(key);
            if (evolution) {
              evolution.data.push({
                period: String(row.period),
                periodStart: String(row.period_start),
                mentionCount: Number(row.mention_count) || 0,
              });
            }
          }
        }

        // Reverse each entity's data (oldest first) - create new arrays
        const evolutions = Array.from(evolutionMap.values()).map((e) => ({
          ...e,
          data: [...e.data].reverse(), // Create new array before reversing
        }));

        return NextResponse.json({ evolutions });
      }

      case "trending": {
        // Get trending entities
        const { data, error } = await supabase.rpc("get_trending_entities", {
          p_entity_type: entityType,
          p_limit: limit,
          p_recent_periods: 3,
          p_historical_periods: 6,
        });

        if (error) {
          console.error("Error fetching trending entities:", error);
          return NextResponse.json(
            { error: error.message },
            { status: 500 }
          );
        }

        // Validate and map trending data
        const trending: TrendingEntity[] = [];
        if (data && Array.isArray(data)) {
          for (const row of data) {
            if (
              !row ||
              typeof row !== "object" ||
              !("entity_id" in row) ||
              !("trend_direction" in row)
            ) {
              continue; // Skip invalid rows
            }

            const direction = String(row.trend_direction);
            if (!["rising", "stable", "declining"].includes(direction)) {
              continue; // Skip invalid trend directions
            }

            trending.push({
              entityId: String(row.entity_id),
              entityName: String(row.entity_name || "Unknown"),
              entityType: String(row.entity_type || "unknown"),
              recentMentions: Number(row.recent_mentions) || 0,
              historicalMentions: Number(row.historical_mentions) || 0,
              trendScore: Number(row.trend_score) || 0,
              trendDirection: direction as "rising" | "stable" | "declining",
            });
          }
        }

        return NextResponse.json({ trending });
      }

      case "activity": {
        // Get overall activity timeline
        const { data, error } = await supabase.rpc("get_kg_activity_timeline", {
          p_granularity: granularity,
          p_limit: limit,
        });

        if (error) {
          console.error("Error fetching activity timeline:", error);
          return NextResponse.json(
            { error: error.message },
            { status: 500 }
          );
        }

        // Validate and map activity data
        const activity: ActivityTimeline[] = [];
        if (data && Array.isArray(data)) {
          for (const row of data) {
            if (
              !row ||
              typeof row !== "object" ||
              !("period" in row) ||
              !("period_start" in row)
            ) {
              continue; // Skip invalid rows
            }

            activity.push({
              period: String(row.period),
              periodStart: String(row.period_start),
              totalMentions: Number(row.total_mentions) || 0,
              uniqueEntities: Number(row.unique_entities) || 0,
              newEntities: Number(row.new_entities) || 0,
            });
          }
        }
        
        // Reverse to show oldest first
        activity.reverse();

        return NextResponse.json({ activity });
      }

      default:
        return NextResponse.json(
          { error: "Invalid mode. Use 'entity', 'compare', 'trending', or 'activity'." },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error in /api/kg/evolution:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
