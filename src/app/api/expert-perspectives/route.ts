import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getPythonPath } from "@/lib/pythonPath";

export const maxDuration = 30; // Allow up to 30s for embedding + search

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

      // Timeout after 25 seconds
      const timeout = setTimeout(() => {
        pythonProcess.kill();
        resolve({
          success: false,
          theme,
          quotes: [],
          indexed: false,
          error: "Search timed out",
        });
      }, 25000);

      pythonProcess.on("close", (code) => {
        clearTimeout(timeout);
        
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
          resolve({
            success: true,
            theme,
            quotes: result.quotes || [],
            indexed: result.indexed ?? true,
          });
        } catch (parseError) {
          console.error("Failed to parse expert perspectives:", parseError, stdout);
          resolve({
            success: false,
            theme,
            quotes: [],
            indexed: false,
            error: "Failed to parse results",
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
