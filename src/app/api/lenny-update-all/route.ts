import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const execAsync = promisify(exec);

// 10 minutes timeout for downloading and importing both embeddings and KG
export const maxDuration = 600;

// Detect cloud environment
function isCloudEnvironment(): boolean {
  return !!(
    process.env.VERCEL || 
    process.env.RAILWAY_ENVIRONMENT || 
    process.env.RENDER ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}

// Check if Supabase is configured
function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

interface LennyUpdateAllResponse {
  success: boolean;
  action: "updated" | "partial" | "error" | "cloud_mode";
  message: string;
  embeddings?: {
    oldEpisodes?: number;
    newEpisodes?: number;
    updated: boolean;
  };
  kg?: {
    updated: boolean;
    stats?: {
      entities: number;
      mentions: number;
      relations: number;
    };
  };
  error?: string;
}

/**
 * Download KG files from GitHub Releases
 */
async function downloadKGFromGitHub(dataDir: string): Promise<{ success: boolean; message: string; error?: string }> {
  const GITHUB_RELEASE_URL = "https://github.com/mostly-coherent/Inspiration/releases/download/v1.0.0-lenny-kg";
  const files = [
    "lenny_kg_manifest.json",
    "lenny_kg_entities.json",
    "lenny_kg_mentions.json",
    "lenny_kg_relations.json",
  ];

  const downloadedFiles: string[] = [];

  try {
    await fs.promises.mkdir(dataDir, { recursive: true });

    for (const file of files) {
      const filePath = path.join(dataDir, file);
      
      // Delete existing file if it exists (for update)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      console.log(`[Lenny Update All] Downloading KG file: ${file}...`);
      const response = await fetch(`${GITHUB_RELEASE_URL}/${file}`);
      
      if (!response.ok) {
        // Conversations file is optional
        if (file === "lenny_kg_conversations.json") {
          console.warn(`[Lenny Update All] Optional file not found: ${file}`);
          continue;
        }
        // For required files, clean up any partially downloaded files and return error
        for (const downloadedFile of downloadedFiles) {
          try {
            if (fs.existsSync(downloadedFile)) {
              fs.unlinkSync(downloadedFile);
            }
          } catch (cleanupError) {
            console.warn(`[Lenny Update All] Failed to clean up ${downloadedFile}:`, cleanupError);
          }
        }
        return { 
          success: false, 
          message: `Failed to download ${file}`, 
          error: `HTTP ${response.status}: ${response.statusText}` 
        };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.promises.writeFile(filePath, buffer);
      downloadedFiles.push(filePath);
      console.log(`[Lenny Update All] Downloaded KG file: ${file}`);
    }

    return { success: true, message: "Downloaded KG files from GitHub Releases" };
  } catch (error: any) {
    // Clean up any partially downloaded files on error
    for (const downloadedFile of downloadedFiles) {
      try {
        if (fs.existsSync(downloadedFile)) {
          fs.unlinkSync(downloadedFile);
        }
      } catch (cleanupError) {
        console.warn(`[Lenny Update All] Failed to clean up ${downloadedFile}:`, cleanupError);
      }
    }
    return { 
      success: false, 
      message: "GitHub KG download failed", 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Upload embeddings to Supabase Storage
 */
async function uploadEmbeddingsToSupabaseStorage(
  embeddingsPath: string,
  metadataPath: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { success: false, message: "Supabase not configured", error: "SUPABASE_URL and SUPABASE_ANON_KEY required" };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const bucket = "lenny-embeddings";

  try {
    // Check if files exist locally
    if (!fs.existsSync(embeddingsPath)) {
      return { success: false, message: "Embeddings file not found", error: `File not found: ${embeddingsPath}` };
    }
    if (!fs.existsSync(metadataPath)) {
      return { success: false, message: "Metadata file not found", error: `File not found: ${metadataPath}` };
    }

    // Read files
    const embeddingsBuffer = fs.readFileSync(embeddingsPath);
    const metadataBuffer = fs.readFileSync(metadataPath);

    // Upload embeddings file
    console.log("[Lenny Update All] Uploading embeddings to Supabase Storage...");
    const { error: embeddingsError } = await supabase.storage
      .from(bucket)
      .upload("lenny_embeddings.npz", embeddingsBuffer, {
        contentType: "application/octet-stream",
        upsert: true, // Overwrite if exists
      });

    if (embeddingsError) {
      return { success: false, message: "Failed to upload embeddings", error: embeddingsError.message };
    }

    // Upload metadata file
    console.log("[Lenny Update All] Uploading metadata to Supabase Storage...");
    const { error: metadataError } = await supabase.storage
      .from(bucket)
      .upload("lenny_metadata.json", metadataBuffer, {
        contentType: "application/json",
        upsert: true, // Overwrite if exists
      });

    if (metadataError) {
      return { success: false, message: "Failed to upload metadata", error: metadataError.message };
    }

    return { success: true, message: "Uploaded embeddings to Supabase Storage" };
  } catch (error: any) {
    return { success: false, message: "Supabase upload failed", error: error.message || String(error) };
  }
}

/**
 * Run KG import script
 */
async function runKGImportScript(dataDir: string): Promise<{ success: boolean; message: string; stats?: any; error?: string }> {
  const scriptPath = path.resolve(process.cwd(), "engine", "scripts", "import_lenny_kg.py");

  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      message: "KG import script not found",
      error: `Script not found at: ${scriptPath}`,
    };
  }

  try {
    const { stdout, stderr } = await execAsync(
      `python3 "${scriptPath}" --data-dir "${dataDir}"`,
      {
        cwd: process.cwd(),
        timeout: 600000, // 10 minute timeout
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      }
    );

    // Parse stats from stdout
    const statsMatch = stdout.match(/Entities: (\d+)[,\s]+Mentions: (\d+)[,\s]+Relations: (\d+)/);
    const stats = statsMatch
      ? {
          entities: parseInt(statsMatch[1], 10),
          mentions: parseInt(statsMatch[2], 10),
          relations: parseInt(statsMatch[3], 10),
        }
      : undefined;

    if (stderr && stderr.includes("❌")) {
      return {
        success: false,
        message: "KG import failed",
        error: stderr.split("❌")[1]?.trim() || "Script reported errors",
      };
    }

    return {
      success: true,
      message: "KG import complete",
      stats,
    };
  } catch (execError: any) {
    return {
      success: false,
      message: "KG import script failed",
      error: execError instanceof Error 
        ? execError.message 
        : (execError.stderr || execError.message || "Script execution failed"),
    };
  }
}

/**
 * POST /api/lenny-update-all
 *
 * Updates both embeddings and Knowledge Graph from GitHub Releases.
 * Downloads from:
 * - v1.0.0-lenny (embeddings)
 * - v1.0.0-lenny-kg (Knowledge Graph)
 * 
 * Also uploads embeddings to Supabase Storage (if configured) for faster cloud deployments.
 */
export async function POST(): Promise<NextResponse<LennyUpdateAllResponse>> {
  try {
    // Fast path: Cloud environment
    if (isCloudEnvironment()) {
      return NextResponse.json({
        success: false,
        action: "cloud_mode",
        message: "Cannot update from cloud. Run locally to update.",
      });
    }

    const dataDir = path.resolve(process.cwd(), "data");
    const embeddingsPath = path.join(dataDir, "lenny_embeddings.npz");
    const metadataPath = path.join(dataDir, "lenny_metadata.json");
    
    const results: LennyUpdateAllResponse = {
      success: true,
      action: "updated",
      message: "",
      embeddings: { updated: false },
      kg: { updated: false },
    };

    // ============================================================
    // Step 1: Update Embeddings
    // ============================================================
    console.log("[Lenny Update All] Step 1: Updating embeddings...");
    
    let oldEpisodeCount = 0;
    if (fs.existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
        oldEpisodeCount = metadata.stats?.total_episodes || 0;
      } catch {
        // If metadata is corrupted, we'll re-download anyway
      }
    }

    // Delete existing embeddings files
    if (fs.existsSync(embeddingsPath)) {
      fs.unlinkSync(embeddingsPath);
    }
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }

    // Run embeddings download script
    const scriptsDir = path.resolve(process.cwd(), "scripts");
    const downloadScript = path.join(scriptsDir, "download-lenny-embeddings.sh");

    if (!fs.existsSync(downloadScript)) {
      return NextResponse.json({
        success: false,
        action: "error",
        message: "Embeddings download script not found",
        error: "scripts/download-lenny-embeddings.sh missing",
      }, { status: 500 });
    }

    try {
      execSync(`bash "${downloadScript}"`, {
        cwd: process.cwd(),
        encoding: "utf-8",
        timeout: 180000, // 3 minute timeout
        stdio: "pipe",
      });

      if (fs.existsSync(embeddingsPath) && fs.existsSync(metadataPath)) {
        let newEpisodeCount = 0;
        try {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
          newEpisodeCount = metadata.stats?.total_episodes || 0;
        } catch {
          // Continue even if we can't read new metadata
        }

        results.embeddings = {
          updated: true,
          oldEpisodes: oldEpisodeCount,
          newEpisodes: newEpisodeCount,
        };
        console.log("[Lenny Update All] Embeddings downloaded successfully");

        // Upload to Supabase Storage if configured (for cloud deployments)
        if (isSupabaseConfigured()) {
          console.log("[Lenny Update All] Uploading embeddings to Supabase Storage...");
          const uploadResult = await uploadEmbeddingsToSupabaseStorage(embeddingsPath, metadataPath);
          if (uploadResult.success) {
            console.log("[Lenny Update All] Embeddings uploaded to Supabase Storage successfully");
          } else {
            // Don't fail the whole update if Storage upload fails - local files are still updated
            console.warn("[Lenny Update All] Supabase Storage upload failed (non-critical):", uploadResult.error);
          }
        }
      }
    } catch (downloadError: any) {
      console.error("[Lenny Update All] Embeddings download error:", downloadError);
      // Continue to KG update even if embeddings fail
      results.embeddings = {
        updated: false,
      };
      // Log error details for debugging
      if (downloadError.message) {
        console.error("[Lenny Update All] Error details:", downloadError.message);
      }
    }

    // ============================================================
    // Step 2: Update Knowledge Graph (if Supabase configured)
    // ============================================================
    if (isSupabaseConfigured()) {
      console.log("[Lenny Update All] Step 2: Updating Knowledge Graph...");
      
      const kgDataDir = path.join(dataDir, "lenny-kg");
      
      // Download KG files
      const downloadResult = await downloadKGFromGitHub(kgDataDir);
      
      if (downloadResult.success) {
        // Run import script
        const importResult = await runKGImportScript(kgDataDir);
        
        if (importResult.success) {
          results.kg = {
            updated: true,
            stats: importResult.stats,
          };
          console.log("[Lenny Update All] KG updated successfully");
        } else {
          console.error("[Lenny Update All] KG import failed:", importResult.error);
          results.kg = {
            updated: false,
          };
        }
      } else {
        console.error("[Lenny Update All] KG download failed:", downloadResult.error);
        results.kg = {
          updated: false,
        };
      }
    } else {
      console.log("[Lenny Update All] Supabase not configured, skipping KG update");
      // Don't set kg.updated = false here - it's undefined, meaning "not attempted"
      // This allows us to distinguish between "skipped" and "failed"
    }

    // ============================================================
    // Build response message
    // ============================================================
    const messages: string[] = [];
    
    if (results.embeddings?.updated) {
      if (results.embeddings.oldEpisodes && results.embeddings.newEpisodes) {
        messages.push(`Embeddings: ${results.embeddings.oldEpisodes}→${results.embeddings.newEpisodes} episodes`);
      } else {
        messages.push("Embeddings updated");
      }
    }
    
    if (results.kg?.updated && results.kg.stats) {
      messages.push(`KG: ${results.kg.stats.entities.toLocaleString()} entities, ${results.kg.stats.mentions.toLocaleString()} mentions`);
    }

    // Determine success status
    if (messages.length === 0) {
      // Nothing updated
      results.success = false;
      results.action = "error";
      results.message = "Update failed for both embeddings and KG";
    } else if (results.embeddings?.updated && results.kg?.updated) {
      // Both succeeded
      results.action = "updated";
      results.message = `Updated: ${messages.join(", ")}`;
    } else if (results.embeddings?.updated && !results.kg) {
      // Embeddings succeeded, KG skipped (Supabase not configured)
      results.action = "updated";
      results.message = `Updated: ${messages.join(", ")} (KG skipped: Supabase not configured)`;
    } else {
      // Partial success (one succeeded, one failed)
      results.action = "partial";
      results.message = `Partially updated: ${messages.join(", ")}`;
      // Still mark as success since at least one component updated
      results.success = true;
    }

    return NextResponse.json(results);

  } catch (error) {
    console.error("Lenny update all error:", error);
    return NextResponse.json({
      success: false,
      action: "error",
      message: "Update failed. Check logs for details.",
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
