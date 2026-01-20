import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getPythonPath } from "@/lib/pythonPath";
import { createClient } from "@supabase/supabase-js";
import { isCloudEnvironment } from "@/lib/vercel";
import OpenAI from "openai";

export const maxDuration = 30; // Allow up to 30s for embedding + search

// Get OpenAI client for embeddings
function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new OpenAI({ apiKey });
}

// Get query embedding using OpenAI
async function getQueryEmbedding(query: string): Promise<number[] | null> {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }
  
  try {
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error("Failed to get embedding:", error);
    return null;
  }
}

interface ExpertQuote {
  guestName: string;
  speaker: string;
  timestamp: string;
  content: string;
  similarity: number;
  episodeFilename: string;
  // Rich metadata (v2, from GitHub format)
  episodeTitle?: string;
  youtubeUrl?: string;
  videoId?: string;
  duration?: string;
}

interface ExpertPerspectivesResponse {
  success: boolean;
  theme: string;
  quotes: ExpertQuote[];
  indexed: boolean;
  error?: string;
}

/**
 * GET /api/expert-perspectives?theme=<theme_name>&topK=3&minSimilarity=0.35
 * 
 * Searches Lenny's podcast archive for expert quotes relevant to the given theme.
 */
export async function GET(request: NextRequest): Promise<NextResponse<ExpertPerspectivesResponse>> {
  const searchParams = request.nextUrl.searchParams;
  const theme = searchParams.get("theme");
  const topK = parseInt(searchParams.get("topK") || "3", 10);
  const minSimilarity = parseFloat(searchParams.get("minSimilarity") || "0.35");

  if (!theme) {
    return NextResponse.json({
      success: false,
      theme: "",
      quotes: [],
      indexed: false,
      error: "Missing 'theme' parameter",
    }, { status: 400 });
  }

  // Try Supabase vector search first (works on Vercel)
  if (isCloudEnvironment()) {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({
          success: false,
          theme,
          quotes: [],
          indexed: false,
          error: "Supabase not configured",
        }, { status: 500 });
      }
      
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Check if Lenny's content is indexed
      const { count } = await supabase
        .from("cursor_messages")
        .select("*", { count: "exact", head: true })
        .eq("source", "lenny")
        .limit(1);
      
      if (!count || count === 0) {
        return NextResponse.json({
          success: true,
          theme,
          quotes: [],
          indexed: false,
        });
      }
      
      // Get query embedding
      const queryEmbedding = await getQueryEmbedding(theme);
      if (!queryEmbedding) {
        return NextResponse.json({
          success: false,
          theme,
          quotes: [],
          indexed: true,
          error: "Failed to generate query embedding",
        }, { status: 500 });
      }
      
      // Search using RPC function, then filter by source
      try {
        const { data, error } = await supabase.rpc("search_cursor_messages", {
          query_embedding: queryEmbedding,
          match_threshold: minSimilarity,
          match_count: topK * 3, // Get more results to filter by source
        });
        
        if (error) {
          throw error;
        }
        
        if (!data || data.length === 0) {
          return NextResponse.json({
            success: true,
            theme,
            quotes: [],
            indexed: true,
          });
        }
        
        // Batch fetch source and source_detail for all results
        const messageIds = data.map((row: any) => row.message_id);
        const { data: fullRows, error: fetchError } = await supabase
          .from("cursor_messages")
          .select("message_id, source, source_detail")
          .in("message_id", messageIds);
        
        if (fetchError) {
          throw fetchError;
        }
        
        // Create a map of message_id -> source_detail
        const sourceMap = new Map<string, any>();
        for (const row of fullRows || []) {
          if (row.source === "lenny") {
            sourceMap.set(row.message_id, row.source_detail || {});
          }
        }
        
        // Filter and transform results
        const quotes: ExpertQuote[] = [];
        for (const row of data) {
          const sourceDetail = sourceMap.get(row.message_id);
          if (sourceDetail) {
            quotes.push({
              guestName: sourceDetail.guest_name || "Unknown",
              speaker: sourceDetail.speaker || "Unknown",
              timestamp: sourceDetail.timestamp || "00:00:00",
              content: row.text || "",
              similarity: row.similarity || 0,
              episodeFilename: sourceDetail.episode_filename || "",
              episodeTitle: sourceDetail.episode_title,
              youtubeUrl: sourceDetail.youtube_url,
              videoId: sourceDetail.video_id,
              duration: sourceDetail.duration,
            });
            if (quotes.length >= topK) {
              break;
            }
          }
        }
        
        return NextResponse.json({
          success: true,
          theme,
          quotes,
          indexed: true,
        });
      } catch (rpcError: any) {
        console.warn("RPC search failed:", rpcError);
        return NextResponse.json({
          success: true,
          theme,
          quotes: [],
          indexed: true,
          error: "Vector search RPC function not available. Please run init_vector_db.sql in Supabase.",
        });
      }
    } catch (error) {
      console.error("Expert perspectives Supabase error:", error);
      return NextResponse.json({
        success: false,
        theme,
        quotes: [],
        indexed: false,
        error: String(error),
      }, { status: 500 });
    }
  }

  // Local environment: use Python script
  try {
    const enginePath = path.resolve(process.cwd(), "engine");
    const pythonPath = getPythonPath();

    // Run Python script to search Lenny archive
    const result = await new Promise<ExpertPerspectivesResponse>((resolve) => {
      const pythonProcess = spawn(pythonPath, [
        "-c",
        `
import sys
import json
sys.path.insert(0, '${enginePath}')

from common.lenny_search import search_lenny_archive, is_lenny_indexed

# Check if indexed
if not is_lenny_indexed():
    print(json.dumps({
        "success": True,
        "indexed": False,
        "quotes": []
    }))
    sys.exit(0)

# Search for expert perspectives
theme = ${JSON.stringify(theme)}
results = search_lenny_archive(
    query=theme,
    top_k=${topK},
    min_similarity=${minSimilarity}
)

quotes = [
    {
        "guestName": r.guest_name,
        "speaker": r.speaker,
        "timestamp": r.timestamp,
        "content": r.content,
        "similarity": r.similarity,
        "episodeFilename": r.episode_filename,
        "episodeTitle": r.episode_title,
        "youtubeUrl": r.youtube_url,
        "videoId": r.video_id,
        "duration": r.duration,
    }
    for r in results
]

print(json.dumps({
    "success": True,
    "indexed": True,
    "quotes": quotes
}))
        `,
      ], {
        cwd: enginePath,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      let resolved = false;

      // Timeout after 25 seconds
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          pythonProcess.kill("SIGTERM");
          // Force kill after 1 second if still running
          setTimeout(() => {
            if (!pythonProcess.killed) {
              pythonProcess.kill("SIGKILL");
            }
          }, 1000);
          resolve({
            success: false,
            theme,
            quotes: [],
            indexed: false,
            error: "Search timed out",
          });
        }
      }, 25000);

      pythonProcess.on("close", (code) => {
        clearTimeout(timeout);
        if (resolved) return; // Already handled by timeout
        resolved = true;
        
        if (code !== 0) {
          console.error("Expert perspectives script failed:", stderr);
          resolve({
            success: false,
            theme,
            quotes: [],
            indexed: false,
            error: stderr || "Script failed",
          });
          return;
        }

        try {
          const trimmedStdout = stdout.trim();
          if (!trimmedStdout) {
            throw new Error("Empty response from script");
          }
          const result = JSON.parse(trimmedStdout);
          
          // Validate result structure
          if (typeof result !== "object" || result === null) {
            throw new Error("Invalid response format (expected object)");
          }
          
          resolve({
            success: true,
            theme,
            quotes: Array.isArray(result.quotes) ? result.quotes : [],
            indexed: result.indexed ?? true,
          });
        } catch (parseError) {
          console.error("Failed to parse expert perspectives:", parseError, stdout);
          resolve({
            success: false,
            theme,
            quotes: [],
            indexed: false,
            error: `Failed to parse results: ${parseError instanceof Error ? parseError.message : "Invalid JSON"}`,
          });
        }
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Expert perspectives API error:", error);
    return NextResponse.json({
      success: false,
      theme,
      quotes: [],
      indexed: false,
      error: String(error),
    }, { status: 500 });
  }
}
