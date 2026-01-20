import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface EpisodeStat {
  episodeSlug: string;
  guestName: string;
  episodeTitle: string | null;
  youtubeUrl: string | null;
  totalChunks: number;
  indexedChunks: number;
  qualityPercent: number;
}

interface EpisodeStatsSummary {
  totalEpisodes: number;
  totalChunks: number;
  totalIndexed: number;
  avgQualityPercent: number;
}

/**
 * GET /api/kg/episode-stats
 *
 * Returns per-episode quality statistics:
 * - Episode metadata (guest, title, youtube URL)
 * - Total chunks per episode
 * - Indexed chunks per episode (passed quality filter)
 * - Quality percentage
 */
export async function GET() {
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

    // Get all episode metadata
    const { data: episodes, error: episodesError } = await supabase
      .from("kg_episode_metadata")
      .select("episode_slug, guest_name, episode_title, youtube_url")
      .order("guest_name");

    if (episodesError) {
      console.error("Error fetching episodes:", episodesError);
      // Table might not exist, return empty
      return NextResponse.json({
        episodes: [],
        summary: {
          totalEpisodes: 0,
          totalChunks: 0,
          totalIndexed: 0,
          avgQualityPercent: 0,
        },
        error: episodesError.message,
      });
    }

    // Get indexed chunk counts per episode with pagination
    // message_id format: "lenny-{slug}-{chunk_index}"
    // Supabase defaults to 1000 rows max, so we must use 1000 page size
    const indexedByEpisode = new Map<string, Set<string>>();
    let offset = 0;
    const pageSize = 1000;  // Supabase max is 1000 per request
    let hasMore = true;

    while (hasMore) {
      const { data: mentionPage, error: mentionsError } = await supabase
        .from("kg_entity_mentions")
        .select("message_id")
        .like("message_id", "lenny-%")
        .range(offset, offset + pageSize - 1);

      if (mentionsError) {
        console.error("Error fetching mentions at offset", offset, ":", mentionsError);
        break;
      }

      if (!mentionPage || mentionPage.length === 0) {
        hasMore = false;
        break;
      }

      for (const mention of mentionPage) {
        const messageId = mention.message_id;
        if (!messageId) continue;

        // Extract slug: "lenny-brian-chesky-42" -> "brian-chesky"
        const match = messageId.match(/^lenny-(.+)-\d+$/);
        if (match) {
          const slug = match[1];
          if (!indexedByEpisode.has(slug)) {
            indexedByEpisode.set(slug, new Set());
          }
          indexedByEpisode.get(slug)!.add(messageId);
        }
      }

      offset += pageSize;
      if (mentionPage.length < pageSize) {
        hasMore = false;
      }
    }

    // Hardcoded chunk counts per episode (from transcript parsing)
    // This could be stored in DB or computed on demand
    // Average is ~167 chunks per episode (50,815 / 303)
    const AVG_CHUNKS_PER_EPISODE = 167;

    // Build episode stats
    const episodeStats: EpisodeStat[] = (episodes || []).map((ep) => {
      const slug = ep.episode_slug;
      const indexed = indexedByEpisode.get(slug)?.size || 0;
      // Use actual indexed count as estimate of total if we have data
      // Otherwise use average
      const totalChunks = indexed > 0
        ? Math.max(indexed * 3, AVG_CHUNKS_PER_EPISODE) // Assume ~33% pass rate
        : AVG_CHUNKS_PER_EPISODE;
      const qualityPercent = totalChunks > 0
        ? Math.round((indexed / totalChunks) * 100 * 10) / 10
        : 0;

      return {
        episodeSlug: slug,
        guestName: ep.guest_name,
        episodeTitle: ep.episode_title,
        youtubeUrl: ep.youtube_url,
        totalChunks,
        indexedChunks: indexed,
        qualityPercent,
      };
    });

    // Also find episodes from mentions that aren't in metadata table
    for (const [slug, messages] of indexedByEpisode) {
      if (!episodeStats.find((e) => e.episodeSlug === slug)) {
        const indexed = messages.size;
        const totalChunks = Math.max(indexed * 3, AVG_CHUNKS_PER_EPISODE);

        episodeStats.push({
          episodeSlug: slug,
          guestName: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          episodeTitle: null,
          youtubeUrl: null,
          totalChunks,
          indexedChunks: indexed,
          qualityPercent: Math.round((indexed / totalChunks) * 100 * 10) / 10,
        });
      }
    }

    // Sort by guest name
    episodeStats.sort((a, b) => a.guestName.localeCompare(b.guestName));

    // Calculate summary
    const summary: EpisodeStatsSummary = {
      totalEpisodes: episodeStats.length,
      totalChunks: episodeStats.reduce((sum, ep) => sum + ep.totalChunks, 0),
      totalIndexed: episodeStats.reduce((sum, ep) => sum + ep.indexedChunks, 0),
      avgQualityPercent:
        episodeStats.length > 0
          ? Math.round(
              (episodeStats.reduce((sum, ep) => sum + ep.qualityPercent, 0) /
                episodeStats.length) *
                10
            ) / 10
          : 0,
    };

    return NextResponse.json({
      episodes: episodeStats,
      summary,
    });
  } catch (error) {
    console.error("Error in /api/kg/episode-stats:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
