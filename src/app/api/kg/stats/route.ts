import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Simple in-memory cache (for serverless, consider Redis/Vercel KV for production)
interface CacheEntry {
  data: {
    totalEntities: number;
    byType: Record<string, number>;
    totalMentions: number;
    totalRelations: number;
    indexed: boolean;
    sourceType: string;
    error?: string;
  };
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 1000; // 30 seconds cache
const MAX_CACHE_SIZE = 100;

function getCached(key: string): CacheEntry["data"] | null {
  try {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    if (cached) {
      // Expired, remove it
      cache.delete(key);
    }
    return null;
  } catch (error) {
    // If cache operations fail, return null (fallback to database)
    console.warn("Cache read error:", error);
    return null;
  }
}

function setCache(key: string, data: CacheEntry["data"]): void {
  try {
    cache.set(key, { data, timestamp: Date.now() });
    
    // Clean up old entries (keep cache size reasonable)
    // Delete oldest entries by timestamp, not insertion order
    if (cache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(cache.entries());
      // Sort by timestamp (oldest first)
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      // Delete oldest entries until we're under the limit
      const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE + 1);
      for (const [keyToDelete] of toDelete) {
        cache.delete(keyToDelete);
      }
    }
  } catch (error) {
    // If cache operations fail, log but don't throw (cache is optional)
    console.warn("Cache write error:", error);
  }
}

/**
 * GET /api/kg/stats?sourceType=user|expert|both|all
 *
 * Returns Knowledge Graph statistics:
 * - totalEntities: Total number of unique entities
 * - byType: Breakdown by entity type (tool, pattern, problem, etc.)
 * - totalMentions: Total entity-message links
 * - totalRelations: Total entity-entity relationships
 * - indexed: Whether any entities have been indexed
 * 
 * Query params:
 * - sourceType: Filter by source ("user" for your chat history, "expert" for Lenny's podcast, "both" for entities in both, "all" for everything)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sourceType = searchParams.get("sourceType") || "all"; // Default to "all"
  
  try {
    
    // Check cache first
    const cacheKey = `kg_stats_${sourceType}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          totalEntities: 0,
          byType: {},
          totalMentions: 0,
          totalRelations: 0,
          indexed: false,
          error: "Supabase not configured",
        },
        { status: 200 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try optimized RPC function first (supports all source types)
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_kg_stats_by_source_type",
        { p_source_type: sourceType }
      );
      
      if (!rpcError && rpcData) {
        const result = {
          totalEntities: rpcData.totalEntities || 0,
          byType: rpcData.byType || {},
          totalMentions: rpcData.totalMentions || 0,
          totalRelations: rpcData.totalRelations || 0,
          indexed: rpcData.indexed || false,
          sourceType,
        };
        setCache(cacheKey, result);
        return NextResponse.json(result);
      }
    } catch (e) {
      console.warn("RPC get_kg_stats_by_source_type not available, falling back:", e);
    }

    // Fallback: Try original RPC for "all" source type
    if (sourceType === "all") {
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc("get_kg_stats");
        if (!rpcError && rpcData) {
          // Ensure totalRelations is included (RPC might not have it)
          let totalRelations = rpcData.totalRelations;
          if (totalRelations === undefined) {
            const { count } = await supabase
              .from("kg_relations")
              .select("id", { count: "exact", head: true });
            totalRelations = count || 0;
          }
          const result = {
            ...rpcData,
            totalRelations,
            sourceType: "all",
          };
          setCache(cacheKey, result);
          return NextResponse.json(result);
        }
      } catch (e) {
        console.warn("RPC get_kg_stats not available, using manual queries:", e);
      }
    }

    // For filtered queries, use efficient count queries
    let entitiesCountQuery = supabase.from("kg_entities").select("id", { count: "exact", head: true });
    let entitiesTypeQuery = supabase.from("kg_entities").select("entity_type, source_type");

    // Apply source_type filter
    if (sourceType === "user") {
      entitiesCountQuery = entitiesCountQuery.eq("source_type", "user");
      entitiesTypeQuery = entitiesTypeQuery.eq("source_type", "user");
    } else if (sourceType === "expert") {
      entitiesCountQuery = entitiesCountQuery.eq("source_type", "expert");
      entitiesTypeQuery = entitiesTypeQuery.eq("source_type", "expert");
    } else if (sourceType === "both") {
      entitiesCountQuery = entitiesCountQuery.eq("source_type", "both");
      entitiesTypeQuery = entitiesTypeQuery.eq("source_type", "both");
    }

    // Execute count query (efficient, no pagination limit)
    const countResult = await entitiesCountQuery;

    // Check if tables exist
    if (countResult.error?.code === "42P01") {
      // Table doesn't exist
      return NextResponse.json({
        totalEntities: 0,
        byType: {},
        totalMentions: 0,
        totalRelations: 0,
        indexed: false,
        error: "Knowledge Graph tables not created. Run init_knowledge_graph.sql first.",
      });
    }

    const totalEntities = countResult.count || 0;

    // For byType breakdown, we need to fetch entity types
    // Use pagination to handle large datasets (fetch in chunks if needed)
    const byType: Record<string, number> = {};
    if (totalEntities > 0) {
      // Fetch entity types with pagination support
      let allEntityTypes: Array<{ entity_type: string }> = [];
      let offset = 0;
      const pageSize = 1000; // Supabase default limit
      
      while (true) {
        const typeQuery = entitiesTypeQuery.range(offset, offset + pageSize - 1);
        const typeResult = await typeQuery;
        
        if (typeResult.error) {
          console.error("Error fetching entity types:", typeResult.error);
          break;
        }
        
        const types = typeResult.data || [];
        if (types.length === 0) break;
        
        allEntityTypes = allEntityTypes.concat(types);
        
        // If we got fewer than pageSize, we've reached the end
        if (types.length < pageSize) break;
        
        offset += pageSize;
      }
      
      // Count by type
      for (const entity of allEntityTypes) {
        const type = entity.entity_type;
        byType[type] = (byType[type] || 0) + 1;
      }
    }

    // Count mentions - use source column directly (more efficient than filtering through entities)
    let totalMentions = 0;
    const mentionsQuery = supabase
      .from("kg_entity_mentions")
      .select("id", { count: "exact", head: true });
    
    if (sourceType === "all") {
      // Count all mentions
      const mentionsResult = await mentionsQuery;
      totalMentions = mentionsResult.count || 0;
    } else if (sourceType === "user") {
      // Count user mentions (source = 'user' or message_id NOT LIKE 'lenny-%')
      const { count } = await mentionsQuery.eq("source", "user");
      totalMentions = count || 0;
      // Fallback: if source column not populated, use message_id pattern
      if (totalMentions === 0) {
        const { count: patternCount } = await supabase
          .from("kg_entity_mentions")
          .select("id", { count: "exact", head: true })
          .not("message_id", "like", "lenny-%");
        totalMentions = patternCount || 0;
      }
    } else if (sourceType === "expert") {
      // Count expert/Lenny mentions (source = 'expert' or 'lenny' or message_id LIKE 'lenny-%')
      const { count } = await mentionsQuery.in("source", ["expert", "lenny"]);
      totalMentions = count || 0;
      // Fallback: if source column not populated, use message_id pattern
      if (totalMentions === 0) {
        const { count: patternCount } = await supabase
          .from("kg_entity_mentions")
          .select("id", { count: "exact", head: true })
          .like("message_id", "lenny-%");
        totalMentions = patternCount || 0;
      }
    } else if (sourceType === "both") {
      // Count mentions for entities that appear in both sources
      // This requires checking entity source_type, so we need to join
      let allEntityIds: string[] = [];
      let offset = 0;
      const pageSize = 1000;
      
      while (true) {
        const idResult = await supabase
          .from("kg_entities")
          .select("id")
          .eq("source_type", "both")
          .range(offset, offset + pageSize - 1);
        
        if (idResult.error || !idResult.data || idResult.data.length === 0) break;
        
        allEntityIds = allEntityIds.concat(idResult.data.map((e: any) => e.id));
        
        if (idResult.data.length < pageSize) break;
        offset += pageSize;
      }
      
      // Count mentions for these entities
      if (allEntityIds.length > 0) {
        const chunkSize = 1000;
        for (let i = 0; i < allEntityIds.length; i += chunkSize) {
          const chunk = allEntityIds.slice(i, i + chunkSize);
          const { count } = await supabase
            .from("kg_entity_mentions")
            .select("id", { count: "exact", head: true })
            .in("entity_id", chunk);
          totalMentions += count || 0;
        }
      }
    }

    // Count relations - try multiple approaches
    let totalRelations = 0;
    
    if (sourceType === "all") {
      // Count all relations
      const { count } = await supabase
        .from("kg_relations")
        .select("id", { count: "exact", head: true });
      totalRelations = count || 0;
    } else if (sourceType === "expert") {
      // Strategy 1: Filter by source column
      try {
        const { count, error } = await supabase
          .from("kg_relations")
          .select("id", { count: "exact", head: true })
          .in("source", ["expert", "lenny"]);
        if (!error && count !== null) {
          totalRelations = count;
          console.log(`Relations by source column: ${totalRelations}`);
        }
      } catch (e) {
        console.warn("Error filtering relations by source column:", e);
      }
      
      // Strategy 2: If still 0, try message_id pattern
      if (totalRelations === 0) {
        try {
          const { count: patternCount, error: patternError } = await supabase
            .from("kg_relations")
            .select("id", { count: "exact", head: true })
            .like("message_id", "lenny-%");
          if (!patternError && patternCount !== null) {
            totalRelations = patternCount;
            console.log(`Relations by message_id pattern: ${totalRelations}`);
          }
        } catch (e) {
          console.warn("Error filtering relations by message_id pattern:", e);
        }
      }
      
      // Strategy 3: If still 0, filter by entity source_type (check if source or target entity is expert)
      if (totalRelations === 0 && totalEntities > 0) {
        try {
          // Get all expert entity IDs
          let expertEntityIds: string[] = [];
          let offset = 0;
          const pageSize = 1000;
          
          while (true) {
            const { data, error } = await supabase
              .from("kg_entities")
              .select("id")
              .eq("source_type", "expert")
              .range(offset, offset + pageSize - 1);
            
            if (error || !data || data.length === 0) break;
            
            expertEntityIds = expertEntityIds.concat(data.map((e: any) => e.id));
            
            if (data.length < pageSize) break;
            offset += pageSize;
          }
          
          // Count relations where source_entity_id OR target_entity_id is in expert entities
          if (expertEntityIds.length > 0) {
            const chunkSize = 1000;
            const countedRelationIds = new Set<string>();
            
            for (let i = 0; i < expertEntityIds.length; i += chunkSize) {
              const chunk = expertEntityIds.slice(i, i + chunkSize);
              
              // Relations where source entity is expert
              const { data: sourceRels } = await supabase
                .from("kg_relations")
                .select("id")
                .in("source_entity_id", chunk);
              
              // Relations where target entity is expert
              const { data: targetRels } = await supabase
                .from("kg_relations")
                .select("id")
                .in("target_entity_id", chunk);
              
              if (sourceRels) {
                sourceRels.forEach((r: any) => countedRelationIds.add(r.id));
              }
              if (targetRels) {
                targetRels.forEach((r: any) => countedRelationIds.add(r.id));
              }
            }
            
            totalRelations = countedRelationIds.size;
            console.log(`Relations by entity source_type: ${totalRelations} (from ${expertEntityIds.length} expert entities)`);
          }
        } catch (e) {
          console.warn("Error filtering relations by entity source_type:", e);
        }
      }
      
      // Debug: Check total relations count
      const { count: totalCount } = await supabase
        .from("kg_relations")
        .select("id", { count: "exact", head: true });
      console.log(`Total relations in database: ${totalCount || 0}`);
      
    } else if (sourceType === "user") {
      // Count user relations (source = 'user' or message_id NOT LIKE 'lenny-%')
      const { count } = await supabase
        .from("kg_relations")
        .select("id", { count: "exact", head: true })
        .eq("source", "user");
      totalRelations = count || 0;
      // Fallback: if source column not populated, use message_id pattern
      if (totalRelations === 0) {
        const { count: patternCount } = await supabase
          .from("kg_relations")
          .select("id", { count: "exact", head: true })
          .not("message_id", "like", "lenny-%");
        totalRelations = patternCount || 0;
      }
    } else if (sourceType === "both") {
      // Count relations for entities that appear in both sources
      // This requires checking entity source_type, so we need to join
      let allEntityIds: string[] = [];
      let offset = 0;
      const pageSize = 1000;
      
      while (true) {
        const idResult = await supabase
          .from("kg_entities")
          .select("id")
          .eq("source_type", "both")
          .range(offset, offset + pageSize - 1);
        
        if (idResult.error || !idResult.data || idResult.data.length === 0) break;
        
        allEntityIds = allEntityIds.concat(idResult.data.map((e: any) => e.id));
        
        if (idResult.data.length < pageSize) break;
        offset += pageSize;
      }
      
      // Count relations where either source or target is in our filtered entities
      if (allEntityIds.length > 0) {
        const chunkSize = 1000;
        const countedRelationIds = new Set<string>(); // Track counted relations to avoid double-counting
        
        for (let i = 0; i < allEntityIds.length; i += chunkSize) {
          const chunk = allEntityIds.slice(i, i + chunkSize);
          
          // Count relations where source_entity_id is in chunk
          const { data: sourceRels } = await supabase
            .from("kg_relations")
            .select("id")
            .in("source_entity_id", chunk);
          
          // Count relations where target_entity_id is in chunk
          const { data: targetRels } = await supabase
            .from("kg_relations")
            .select("id")
            .in("target_entity_id", chunk);
          
          // Add unique relation IDs
          if (sourceRels) {
            sourceRels.forEach((r: any) => countedRelationIds.add(r.id));
          }
          if (targetRels) {
            targetRels.forEach((r: any) => countedRelationIds.add(r.id));
          }
        }
        
        totalRelations = countedRelationIds.size;
      }
    }

    // Debug logging for expert source type
    if (sourceType === "expert") {
      console.log(`KG Stats API (expert): entities=${totalEntities}, mentions=${totalMentions}, relations=${totalRelations}`);
    }
    
    const result = {
      totalEntities,
      byType,
      totalMentions,
      totalRelations,
      indexed: totalEntities > 0,
      sourceType, // Include filter in response
    };
    
    // Cache the result
    setCache(cacheKey, result);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching KG stats:", error);
    const errorResponse = {
      totalEntities: 0,
      byType: {},
      totalMentions: 0,
      totalRelations: 0,
      indexed: false,
      sourceType,
      error: error instanceof Error ? error.message : "Unknown error",
    };
    // Don't cache error responses
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
