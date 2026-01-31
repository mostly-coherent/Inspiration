import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 5;

// Detect cloud environment
function isCloudEnvironment(): boolean {
  return !!(
    process.env.VERCEL || 
    process.env.RAILWAY_ENVIRONMENT || 
    process.env.RENDER ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}

interface LennyStats {
  success: boolean;
  indexed: boolean;
  episodeCount: number;
  chunkCount: number;
  wordCount: number;
  withRichMetadata: number;
  format: string;
  indexedAt: string | null;
  embeddingsSizeMB: number | null;
  cloudMode?: boolean;
  error?: string;
}

export async function GET(): Promise<NextResponse<LennyStats>> {
  try {
    const isCloud = isCloudEnvironment();
    
    // In cloud mode, check both Supabase AND /tmp files (files might exist before indexing)
    if (isCloud) {
      // First check Supabase (preferred - indexed content)
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      
      if (supabaseUrl && supabaseKey) {
        try {
          const supabase = createClient(supabaseUrl, supabaseKey);
          
          // Check if Lenny's content is indexed in Supabase
          const { count, error: countError } = await supabase
            .from("cursor_messages")
            .select("*", { count: "exact", head: true })
            .eq("source", "lenny")
            .limit(1);
          
          if (!countError && count && count > 0) {
            // Get chunk count
            const { count: chunkCount } = await supabase
              .from("cursor_messages")
              .select("*", { count: "exact", head: true })
              .eq("source", "lenny");
            
            // Get unique episode count by querying distinct episode filenames
            // Use a more efficient approach: sample and extrapolate, or use RPC if available
            let episodeCount = 0;
            let withRichMetadata = 0;
            
            try {
              // Try to get distinct episode filenames efficiently
              // Fetch a sample and count unique episodes
              const { data: sampleData } = await supabase
                .from("cursor_messages")
                .select("source_detail")
                .eq("source", "lenny")
                .limit(1000); // Sample up to 1000 rows
              
              if (sampleData && sampleData.length > 0) {
                const uniqueEpisodes = new Set<string>();
                let richMetadataCount = 0;
                
                for (const row of sampleData) {
                  const episodeFilename = row.source_detail?.episode_filename;
                  if (episodeFilename) {
                    uniqueEpisodes.add(episodeFilename);
                  }
                  if (row.source_detail?.episode_title) {
                    richMetadataCount++;
                  }
                }
                
                // If we got a full sample (1000 rows), we can estimate
                // Otherwise, use the unique count as-is (might be accurate if dataset is small)
                if (sampleData.length === 1000 && chunkCount && chunkCount > 1000) {
                  // Estimate: assume uniform distribution
                  // This is approximate but better than nothing
                  episodeCount = Math.ceil((uniqueEpisodes.size / sampleData.length) * (chunkCount || 0));
                } else {
                  // Use actual unique count (likely accurate for smaller datasets)
                  episodeCount = uniqueEpisodes.size;
                }
                
                withRichMetadata = richMetadataCount;
              }
            } catch (episodeError) {
              console.warn("Failed to get episode count:", episodeError);
              // Fallback: rough estimate based on chunk count
              episodeCount = Math.floor((chunkCount || 0) / 100); // ~100 chunks per episode
            }
            
            return NextResponse.json({
              success: true,
              indexed: true,
              episodeCount: episodeCount || Math.floor((chunkCount || 0) / 100),
              chunkCount: chunkCount || 0,
              wordCount: 0, // Not easily available from Supabase without full scan
              withRichMetadata,
              format: "supabase",
              indexedAt: null, // Could query from indexed_at column if needed
              embeddingsSizeMB: null, // Embeddings are in DB, not a file
              cloudMode: true,
            });
          }
        } catch (supabaseError) {
          console.warn("Supabase check failed, falling back to file check:", supabaseError);
          // Fall through to file check
        }
      }
      
      // Also check /tmp files in cloud mode (files might be downloaded but not yet indexed)
      // This handles the case where download succeeded but indexing hasn't happened yet
      // Note: On Vercel, /tmp persists during warm function invocations but not across cold starts
      const tmpMetadataPath = "/tmp/lenny-embeddings/lenny_metadata.json";
      const tmpEmbeddingsPath = "/tmp/lenny-embeddings/lenny_embeddings.npz";
      
      // Check if /tmp directory exists first
      const tmpDir = "/tmp/lenny-embeddings";
      if (fs.existsSync(tmpDir)) {
        console.log("[Lenny Stats] /tmp/lenny-embeddings directory exists");
        
        if (fs.existsSync(tmpMetadataPath)) {
          console.log("[Lenny Stats] Found metadata file in /tmp");
          try {
            // Read metadata from /tmp
            const metadataContent = fs.readFileSync(tmpMetadataPath, "utf-8");
            const metadata = JSON.parse(metadataContent);
            
            // Get embeddings file size
            let embeddingsSizeMB: number | null = null;
            if (fs.existsSync(tmpEmbeddingsPath)) {
              const stats = fs.statSync(tmpEmbeddingsPath);
              embeddingsSizeMB = Math.round((stats.size / (1024 * 1024)) * 10) / 10;
              console.log(`[Lenny Stats] Found embeddings file: ${embeddingsSizeMB}MB`);
            } else {
              console.warn("[Lenny Stats] Metadata exists but embeddings file missing");
            }
            
            const stats = {
              success: true,
              indexed: true,
              episodeCount: metadata.stats?.total_episodes || 0,
              chunkCount: metadata.stats?.total_chunks || 0,
              wordCount: metadata.stats?.total_words || 0,
              withRichMetadata: metadata.stats?.with_rich_metadata || 0,
              format: metadata.format || "legacy",
              indexedAt: metadata.indexed_at || null,
              embeddingsSizeMB,
              cloudMode: true,
            };
            
            console.log(`[Lenny Stats] Returning stats from /tmp: ${stats.episodeCount} episodes, ${stats.chunkCount} chunks`);
            return NextResponse.json(stats);
          } catch (fileError) {
            console.error("[Lenny Stats] Failed to read /tmp files:", fileError);
            // Fall through to return "not indexed"
          }
        } else {
          console.log("[Lenny Stats] /tmp directory exists but metadata file not found");
        }
      } else {
        console.log("[Lenny Stats] /tmp/lenny-embeddings directory does not exist");
      }
      
      // No Supabase content and no /tmp files - not indexed
      console.log("[Lenny Stats] No Supabase content and no /tmp files - returning not indexed");
      return NextResponse.json({
        success: true,
        indexed: false,
        episodeCount: 0,
        chunkCount: 0,
        wordCount: 0,
        withRichMetadata: 0,
        format: "none",
        indexedAt: null,
        embeddingsSizeMB: null,
        cloudMode: true,
      });
    }
    
    // Local mode: Check local files
    const tmpMetadataPath = "/tmp/lenny-embeddings/lenny_metadata.json";
    const tmpEmbeddingsPath = "/tmp/lenny-embeddings/lenny_embeddings.npz";
    const localDataDir = path.resolve(process.cwd(), "data");
    const localMetadataPath = path.join(localDataDir, "lenny_metadata.json");
    const localEmbeddingsPath = path.join(localDataDir, "lenny_embeddings.npz");

    // Determine which paths to use (cloud: /tmp, local: data/)
    const metadataPath = isCloud && fs.existsSync(tmpMetadataPath) 
      ? tmpMetadataPath 
      : localMetadataPath;
    const embeddingsPath = isCloud && fs.existsSync(tmpEmbeddingsPath)
      ? tmpEmbeddingsPath
      : localEmbeddingsPath;

    // Check if indexed
    if (!fs.existsSync(metadataPath)) {
      return NextResponse.json({
        success: true,
        indexed: false,
        episodeCount: 0,
        chunkCount: 0,
        wordCount: 0,
        withRichMetadata: 0,
        format: "none",
        indexedAt: null,
        embeddingsSizeMB: null,
        cloudMode: isCloud,
      });
    }

    // Read metadata
    const metadataContent = fs.readFileSync(metadataPath, "utf-8");
    const metadata = JSON.parse(metadataContent);

    // Get embeddings file size
    let embeddingsSizeMB: number | null = null;
    if (fs.existsSync(embeddingsPath)) {
      const stats = fs.statSync(embeddingsPath);
      embeddingsSizeMB = Math.round((stats.size / (1024 * 1024)) * 10) / 10;
    }

    return NextResponse.json({
      success: true,
      indexed: true,
      episodeCount: metadata.stats?.total_episodes || 0,
      chunkCount: metadata.stats?.total_chunks || 0,
      wordCount: metadata.stats?.total_words || 0,
      withRichMetadata: metadata.stats?.with_rich_metadata || 0,
      format: metadata.format || "legacy",
      indexedAt: metadata.indexed_at || null,
      embeddingsSizeMB,
      cloudMode: isCloud && metadataPath.startsWith("/tmp"),
    });
  } catch (error) {
    console.error("Lenny stats API error:", error);
    return NextResponse.json(
      {
        success: false,
        indexed: false,
        episodeCount: 0,
        chunkCount: 0,
        wordCount: 0,
        withRichMetadata: 0,
        format: "none",
        indexedAt: null,
        embeddingsSizeMB: null,
        error: String(error),
      },
      { status: 500 }
    );
  }
}
