import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const maxDuration = 5;

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
  error?: string;
}

export async function GET(): Promise<NextResponse<LennyStats>> {
  try {
    const dataDir = path.resolve(process.cwd(), "data");
    const metadataPath = path.join(dataDir, "lenny_metadata.json");
    const embeddingsPath = path.join(dataDir, "lenny_embeddings.npz");

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
