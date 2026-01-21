import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/kg/nodes-dates
 *
 * Returns a mapping of node IDs to their associated dates.
 * Used for date-based filtering in the graph view.
 *
 * Returns:
 * {
 *   [nodeId]: { date: "YYYY-MM-DD", type: "conversation" | "episode" | "entity" }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Supabase not configured", dates: {} }, { status: 200 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const nodeDates: Record<string, { date: string; type: string }> = {};

    // 1. Get conversation nodes (conv-{message_id}) from kg_conversations
    // Note: kg_conversations.id = 'conv-{conversation_id}', and conversation_id = message_id from kg_entity_mentions
    const { data: conversations, error: convError } = await supabase
      .from("kg_conversations")
      .select("id, conversation_id, date_day, date_month");

    if (!convError && conversations) {
      for (const conv of conversations) {
        // The node ID in kg_entities is 'conv-{conversation_id}' where conversation_id = message_id
        // kg_conversations.id is already 'conv-{conversation_id}', so we can use it directly
        const nodeId = conv.id; // Already in format 'conv-{conversation_id}'
        const date = conv.date_day || conv.date_month;
        if (date) {
          nodeDates[nodeId] = { date, type: "conversation" };
        }
      }
    }

    // 2. Get episode nodes (episode-{slug}) from kg_episode_metadata
    const { data: episodes, error: episodeError } = await supabase
      .from("kg_episode_metadata")
      .select("episode_slug, published_date");

    if (!episodeError && episodes) {
      for (const episode of episodes) {
        const nodeId = `episode-${episode.episode_slug}`;
        if (episode.published_date) {
          // Extract date from published_date (might be timestamp or date string)
          const date = episode.published_date instanceof Date
            ? episode.published_date.toISOString().split("T")[0]
            : episode.published_date.toString().split("T")[0];
          nodeDates[nodeId] = { date, type: "episode" };
        }
      }
    }

    // 3. Get entity nodes with their earliest mention dates from kg_entity_mentions
    // Join with kg_conversations to get actual dates (not timestamps)
    const { data: mentions, error: mentionError } = await supabase
      .from("kg_entity_mentions")
      .select("entity_id, message_id");

    if (!mentionError && mentions && mentions.length > 0) {
      // Get unique message_ids and fetch their dates from kg_conversations
      const messageIds = [...new Set(mentions.map((m) => m.message_id).filter((id): id is string => Boolean(id)))];
      
      if (messageIds.length === 0) {
        // No valid message IDs, skip entity date mapping
      } else {
        const { data: convDates, error: convDatesError } = await supabase
          .from("kg_conversations")
          .select("conversation_id, date_day, date_month")
          .in("conversation_id", messageIds);
        
        if (convDatesError) {
          console.error("Error fetching conversation dates:", convDatesError);
        } else if (convDates) {

          // Create a map of message_id -> date
          const messageDateMap = new Map<string, string>();
          for (const conv of convDates) {
            const date = conv.date_day || conv.date_month;
            if (date) {
              messageDateMap.set(conv.conversation_id, date);
            }
          }

          // Group by entity_id and find earliest date
          const entityDates = new Map<string, string>();
          for (const mention of mentions) {
            const date = messageDateMap.get(mention.message_id);
            if (date) {
              const current = entityDates.get(mention.entity_id);
              if (!current || date < current) {
                entityDates.set(mention.entity_id, date);
              }
            }
          }

          // Add to nodeDates
          for (const [entityId, date] of entityDates.entries()) {
            nodeDates[entityId] = { date, type: "entity" };
          }
        }
      }
    }

    return NextResponse.json({ dates: nodeDates });
  } catch (error) {
    console.error("Error in /api/kg/nodes-dates:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        dates: {},
      },
      { status: 500 }
    );
  }
}
