import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";

const execAsync = promisify(exec);

export const maxDuration = 600; // 10 minutes for large import

interface ImportResponse {
  success: boolean;
  message: string;
  error?: string;
  stats?: {
    entities: number;
    mentions: number;
    relations: number;
    conversations: number;
  };
}

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

/**
 * Download KG files from GitHub Releases
 */
async function downloadFromGitHubReleases(dataDir: string): Promise<{ success: boolean; message: string; error?: string }> {
  const GITHUB_RELEASE_URL = "https://github.com/mostly-coherent/Inspiration/releases/download/v1.0.0-lenny-kg";
  const files = [
    "lenny_kg_manifest.json",
    "lenny_kg_entities.json",
    "lenny_kg_mentions.json",
    "lenny_kg_relations.json",
  ];

  try {
    await fs.promises.mkdir(dataDir, { recursive: true });

    for (const file of files) {
      const filePath = path.join(dataDir, file);
      
      // Skip if already downloaded
      if (fs.existsSync(filePath)) {
        continue;
      }

      console.log(`[Lenny KG Import] Downloading ${file}...`);
      const response = await fetch(`${GITHUB_RELEASE_URL}/${file}`);
      
      if (!response.ok) {
        // Some files are optional (e.g., conversations)
        if (file === "lenny_kg_conversations.json") {
          console.warn(`[Lenny KG Import] Optional file not found: ${file}`);
          continue;
        }
        return { success: false, message: `Failed to download ${file}`, error: `HTTP ${response.status}` };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.promises.writeFile(filePath, buffer);
      console.log(`[Lenny KG Import] Downloaded ${file}`);
    }

    return { success: true, message: "Downloaded KG files from GitHub Releases" };
  } catch (error: any) {
    return { success: false, message: "GitHub download failed", error: error.message || String(error) };
  }
}

/**
 * Run import script
 */
async function runImportScript(dataDir: string): Promise<{ success: boolean; message: string; stats?: any; error?: string }> {
  const scriptPath = path.resolve(process.cwd(), "engine", "scripts", "import_lenny_kg.py");

  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      message: "Import script not found",
      error: `Script not found at: ${scriptPath}`,
    };
  }

  try {
    // Run import script
    const { stdout, stderr } = await execAsync(
      `python3 "${scriptPath}" --data-dir "${dataDir}"`,
      {
        cwd: process.cwd(),
        timeout: 600000, // 10 minute timeout
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      }
    );

    // Parse stats from stdout (if available)
    const statsMatch = stdout.match(/Entities: (\d+)[,\s]+Mentions: (\d+)[,\s]+Relations: (\d+)/);
    const stats = statsMatch
      ? {
          entities: parseInt(statsMatch[1], 10),
          mentions: parseInt(statsMatch[2], 10),
          relations: parseInt(statsMatch[3], 10),
          conversations: 0,
        }
      : undefined;

    if (stderr && stderr.includes("❌")) {
      return {
        success: false,
        message: "Import failed",
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
      message: "Import script failed",
      error: execError.stderr || execError.message || "Script execution failed",
    };
  }
}

/**
 * POST /api/lenny-kg-import
 *
 * Downloads and imports Lenny's Knowledge Graph from GitHub Releases.
 * Idempotent: skips already-imported data.
 */
export async function POST(): Promise<NextResponse<ImportResponse>> {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        {
          success: false,
          message: "Supabase not configured",
          error: "SUPABASE_URL and SUPABASE_ANON_KEY required",
        },
        { status: 400 }
      );
    }

    const isCloud = isCloudEnvironment();
    const dataDir = isCloud ? "/tmp/lenny-kg" : path.resolve(process.cwd(), "data", "lenny-kg");

    // Step 1: Download KG files from GitHub Releases
    console.log("[Lenny KG Import] Downloading KG files...");
    const downloadResult = await downloadFromGitHubReleases(dataDir);

    if (!downloadResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to download KG files",
          error: downloadResult.error,
        },
        { status: 500 }
      );
    }

    // Step 2: Run import script
    console.log("[Lenny KG Import] Importing KG data...");
    const importResult = await runImportScript(dataDir);

    if (!importResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Import failed",
          error: importResult.error,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Lenny's Knowledge Graph imported successfully",
      stats: importResult.stats,
    });
  } catch (error: any) {
    console.error("Lenny KG import API error:", error);

    if (error.code === "ETIMEDOUT" || error.signal === "SIGTERM") {
      return NextResponse.json(
        {
          success: false,
          message: "Import timed out",
          error: "Import took too long. Please try again.",
        },
        { status: 408 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Import failed",
        error: error.message || String(error),
      },
      { status: 500 }
    );
  }
}
