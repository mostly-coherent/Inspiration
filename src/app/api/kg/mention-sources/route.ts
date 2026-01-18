import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireFeature } from "@/lib/featureFlags";

/**
 * GET /api/kg/mention-sources
 *
 * Enriches mention IDs with episode metadata (YouTube URLs, titles, guest names).
 *
 * Query params:
 * - ids: Comma-separated list of mention IDs
 *
 * Returns:
 * - Array of enriched mentions with episode metadata
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
        { error: "Supabase not configured", sources: [] },
        { status: 200 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse query params
    const { searchParams } = new URL(request.url);
    const mentionIdsParam = searchParams.get("ids");

    if (!mentionIdsParam) {
      return NextResponse.json(
        { error: "ids parameter required (comma-separated mention IDs)" },
        { status: 400 }
      );
    }

    // Parse mention IDs
    const mentionIds = mentionIdsParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (mentionIds.length === 0) {
      return NextResponse.json({ sources: [] });
    }

    // Limit to prevent abuse
    if (mentionIds.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 mention IDs allowed per request" },
        { status: 400 }
      );
    }

    // Fetch mentions
    const { data: mentions, error: mentionsError } = await supabase
      .from("kg_entity_mentions")
      .select("*")
      .in("id", mentionIds);

    if (mentionsError) {
      console.error("Error fetching mentions:", mentionsError);
      return NextResponse.json(
        { error: mentionsError.message, sources: [] },
        { status: 500 }
      );
    }

    if (!mentions || mentions.length === 0) {
      return NextResponse.json({ sources: [] });
    }

    // Extract unique episode slugs from message_ids
    // Format: "lenny-ada-chen-rekhi-142" → "ada-chen-rekhi"
    const episodeSlugs = new Set<string>();
    for (const mention of mentions) {
      const messageId = mention.message_id || "";
      if (messageId.startsWith("lenny-")) {
        // Extract slug: "lenny-{slug}-{chunk_index}"
        const parts = messageId.split("-");
        if (parts.length >= 3) {
          // Remove "lenny" prefix and last part (chunk index)
          const slug = parts.slice(1, -1).join("-");
          episodeSlugs.add(slug);
        }
      }
    }

    // Fetch episode metadata for all unique slugs
    let episodeMetadata: Record<string, any> = {};
    if (episodeSlugs.size > 0) {
      const { data: episodes, error: episodesError } = await supabase
        .from("kg_episode_metadata")
        .select("*")
        .in("episode_slug", Array.from(episodeSlugs));

      if (episodesError) {
        console.warn("Error fetching episode metadata:", episodesError);
        // Continue without metadata rather than failing
      } else if (episodes) {
        // Build lookup map
        for (const episode of episodes) {
          episodeMetadata[episode.episode_slug] = episode;
        }
      }
    }

    // Enrich mentions with episode metadata
    const enrichedSources = mentions.map((mention) => {
      const messageId = mention.message_id || "";
      let episodeSlug: string | null = null;
      let chunkIndex: string | null = null;

      // Parse message_id: "lenny-{slug}-{chunk_index}"
      if (messageId.startsWith("lenny-")) {
        const parts = messageId.split("-");
        if (parts.length >= 3) {
          episodeSlug = parts.slice(1, -1).join("-");
          chunkIndex = parts[parts.length - 1];
        }
      }

      // Get episode metadata
      const episode = episodeSlug ? episodeMetadata[episodeSlug] : null;

      return {
        mentionId: mention.id,
        entityId: mention.entity_id,
        messageId: mention.message_id,
        contextSnippet: mention.context_snippet || "",
        timestamp: mention.message_timestamp || 0,

        // Episode metadata (if available)
        episodeSlug: episodeSlug,
        guestName: episode?.guest_name || null,
        episodeTitle: episode?.episode_title || null,
        youtubeUrl: episode?.youtube_url || null,
        videoId: episode?.video_id || null,
        durationHuman: episode?.duration_human || null,
        publishedDate: episode?.published_date || null,
        chunkIndex: chunkIndex,
      };
    });

    return NextResponse.json({ sources: enrichedSources });
  } catch (error) {
    console.error("Error in /api/kg/mention-sources:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        sources: [],
      },
      { status: 500 }
    );
  }
}
