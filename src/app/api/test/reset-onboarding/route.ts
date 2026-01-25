import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { isCloudEnvironment } from "@/lib/vercel";

export const dynamic = "force-dynamic";

// Only allow in development mode
const isDevelopment = process.env.NODE_ENV === "development";

/**
 * POST /api/test/reset-onboarding
 * Reset onboarding state for testing purposes
 * 
 * Clears:
 * - Theme map cache (all date ranges)
 * - Vector DB indexing status (doesn't delete data, just resets tracking)
 * - Onboarding completion flags (setupComplete, fastStartComplete)
 * 
 * ⚠️ DEV MODE ONLY - This endpoint is disabled in production
 */
export async function POST() {
  // Safety check: Only allow in development
  if (!isDevelopment) {
    return NextResponse.json(
      { 
        success: false, 
        error: "Reset onboarding is only available in development mode" 
      },
      { status: 403 }
    );
  }

  try {
    const results: string[] = [];

    // 1. Clear theme map cache from Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Delete all theme_map_* entries
        const { error } = await supabase
          .from('app_config')
          .delete()
          .like('key', 'theme_map_%');
        
        if (error) {
          results.push(`⚠️ Supabase theme map clear: ${error.message}`);
        } else {
          results.push('✅ Cleared theme map cache from Supabase');
        }

        // Reset config flags in Supabase
    const { data: configData } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'user_config')
          .maybeSingle(); // Use maybeSingle to avoid error if no row exists
        
        if (configData?.value) {
          const newConfig = { 
            ...configData.value, 
            setupComplete: false,
            fastStartComplete: false 
          };
          
          const { error: configError } = await supabase
            .from('app_config')
            .upsert({ 
              key: 'user_config', 
              value: newConfig,
              updated_at: new Date().toISOString()
            });
            
          if (configError) {
            results.push(`⚠️ Supabase config reset error: ${configError.message}`);
          } else {
            results.push('✅ Reset Supabase config flags');
          }
        } else {
          // No config found, create a default one with flags reset
          const defaultConfig = {
            version: 1,
            setupComplete: false,
            fastStartComplete: false,
            workspaces: [],
            llm: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
            features: { customVoice: { enabled: false }, v1Enabled: false },
            ui: { defaultTool: "insights", defaultMode: "sprint" }
          };
          
          const { error: createError } = await supabase
            .from('app_config')
            .insert({ 
              key: 'user_config', 
              value: defaultConfig,
              updated_at: new Date().toISOString()
            });
            
          if (createError) {
            results.push(`⚠️ Supabase config create error: ${createError.message}`);
          } else {
            results.push('✅ Created default Supabase config (reset state)');
          }
        }
      } catch (supabaseError) {
        results.push(`⚠️ Supabase error: ${supabaseError instanceof Error ? supabaseError.message : String(supabaseError)}`);
      }
    }

    // 2. Clear theme map cache from file system (local dev)
    if (!isCloudEnvironment()) {
      const themeMapsDir = path.join(process.cwd(), "data", "theme_maps");
      
      if (fs.existsSync(themeMapsDir)) {
        try {
          const files = fs.readdirSync(themeMapsDir);
          let deletedCount = 0;
          
          for (const file of files) {
            if (file.startsWith("theme_map_") && file.endsWith(".json")) {
              fs.unlinkSync(path.join(themeMapsDir, file));
              deletedCount++;
            }
          }
          
          if (deletedCount > 0) {
            results.push(`✅ Deleted ${deletedCount} theme map cache files`);
          } else {
            results.push('ℹ️ No theme map cache files found');
          }
        } catch (fsError) {
          results.push(`⚠️ File system error: ${fsError instanceof Error ? fsError.message : String(fsError)}`);
        }
      } else {
        results.push('ℹ️ Theme maps directory does not exist');
      }
    }

    // 3. Clear old theme_map.json (legacy single file)
    if (!isCloudEnvironment()) {
      const legacyFile = path.join(process.cwd(), "data", "theme_map.json");
      if (fs.existsSync(legacyFile)) {
        try {
          fs.unlinkSync(legacyFile);
          results.push('✅ Deleted legacy theme_map.json');
        } catch (fsError) {
          results.push(`⚠️ Failed to delete legacy file: ${fsError instanceof Error ? fsError.message : String(fsError)}`);
        }
      }
    }

    // 4. Reset local config.json flags
    if (!isCloudEnvironment()) {
      const configPath = path.join(process.cwd(), "data", "config.json");
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, "utf-8");
          const config = JSON.parse(content);
          
          config.setupComplete = false;
          config.fastStartComplete = false;
          
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
          results.push('✅ Reset local config.json flags');
        } catch (configError) {
          results.push(`⚠️ Failed to reset local config: ${configError instanceof Error ? configError.message : String(configError)}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Onboarding state reset",
      details: results,
      note: "Vector DB data was NOT deleted. Only cache and tracking were cleared."
    });
  } catch (error) {
    console.error("Reset onboarding error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to reset onboarding state",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
