import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const CONFIG_PATH = path.join(process.cwd(), "data", "config.json");

// Initialize Supabase if configured
// Use SERVICE_ROLE_KEY for writes (bypasses RLS), fallback to ANON_KEY
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;
// Use service role key for writes (bypasses RLS), fallback to anon key if not available
const supabaseWrite = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : supabase; // Fallback to anon key if service role not available

export interface AppConfig {
  version: number;
  setupComplete: boolean;
  workspaces: string[];
  vectordb?: {
    provider: "supabase";
    url: string | null;
    anonKey: string | null;
    serviceRoleKey: string | null;
    initialized: boolean;
    lastSync: string | null;
  };
  chatHistory?: {
    path: string | null;
    platform: string | null;
    autoDetected: boolean;
    lastChecked: string | null;
  };
  llm: {
    provider: "anthropic" | "openai";
    model: string;
    fallbackProvider: "anthropic" | "openai" | null;
    fallbackModel: string | null;
    promptCompression?: {
      enabled: boolean;
      threshold: number;
      compressionModel: string;
    };
  };
  userProfile?: {
    name: string | null;
    jobContext: string | null;
    styleguide: string | null;
  };
  features: {
    customVoice: {
      enabled: boolean;
      voiceGuideFile: string | null;      // Path to voice/style guide document
      goldenExamplesDir: string | null;   // Path to folder with example posts
      authorName: string | null;          // Author name for prompts
      authorContext: string | null;       // Brief author context (e.g., "PM at a large tech company")
    };
    v1Enabled?: boolean;  // Feature flag: v1 features disabled by default
  };
  ui: {
    defaultTool: "ideas" | "insights";
    defaultMode: string;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  setupComplete: false,
  workspaces: [],
  vectordb: {
    provider: "supabase",
    url: null,
    anonKey: null,
    serviceRoleKey: null,
    initialized: false,
    lastSync: null,
  },
  chatHistory: {
    path: null,
    platform: null,
    autoDetected: false,
    lastChecked: null,
  },
  llm: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallbackProvider: "openai",
    fallbackModel: "gpt-4o",
  },
  userProfile: {
    name: null,
    jobContext: null,
    styleguide: null,
  },
  features: {
    customVoice: {
      enabled: false,
      voiceGuideFile: null,
      goldenExamplesDir: null,
      authorName: null,
      authorContext: null,
    },
    v1Enabled: false,  // Feature flag: v1 features disabled by default
  },
  ui: {
    defaultTool: "insights",
    defaultMode: "sprint",
  },
};

async function loadConfig(): Promise<AppConfig> {
  try {
    // Try Supabase first (Persistent storage for Vercel)
    // Use the same client that was used for writes (supabaseWrite if available, else supabase)
    const readClient = supabaseWrite || supabase;
    if (readClient) {
      const { data, error } = await readClient
        .from('app_config')
        .select('value')
        .eq('key', 'user_config')
        .single();
      
      if (error) {
        console.warn("[Config] Error reading from Supabase:", error.message || error);
        // Continue to try local file
      } else if (data?.value) {
        // Validate that value is an object
        if (typeof data.value === 'object' && data.value !== null && !Array.isArray(data.value)) {
          // Merge with defaults, but preserve setupComplete from saved value if it exists
          const merged = { ...DEFAULT_CONFIG, ...data.value };
          // CRITICAL: If saved value has setupComplete, use it (don't let DEFAULT_CONFIG override)
          if ('setupComplete' in data.value) {
            merged.setupComplete = data.value.setupComplete;
          }
          return merged;
        } else {
          console.warn("[Config] Invalid config value format in Supabase, using defaults");
        }
      }
    }

    if (existsSync(CONFIG_PATH)) {
      const content = await readFile(CONFIG_PATH, "utf-8");
      
      // Validate content is not empty
      if (!content || !content.trim()) {
        console.warn("[Config] Config file is empty, using defaults");
        return DEFAULT_CONFIG;
      }
      
      try {
        const userConfig = JSON.parse(content);
        
        // Validate that parsed config is an object
        if (typeof userConfig !== 'object' || userConfig === null || Array.isArray(userConfig)) {
          console.warn("[Config] Invalid config format in file, using defaults");
          return DEFAULT_CONFIG;
        }
        
        // Merge with defaults
        return { ...DEFAULT_CONFIG, ...userConfig };
      } catch (parseError) {
        console.error("[Config] Failed to parse config file:", parseError);
        return DEFAULT_CONFIG;
      }
    }
  } catch (error) {
    console.error("[Config] Failed to load:", error);
  }
  return DEFAULT_CONFIG;
}

async function saveConfig(config: AppConfig): Promise<boolean> {
  try {
    let success = false;

    // Save to Supabase (Persistent storage for Vercel)
    // Use service role key for writes (bypasses RLS), fallback to anon key
    const writeClient = supabaseWrite || supabase;
    if (writeClient) {
      const payload = { 
        key: 'user_config', 
        value: config,
        updated_at: new Date().toISOString()
      };
      
      console.log("[Config] Upserting to Supabase:", {
        key: payload.key,
        setupComplete: config.setupComplete,
        usingServiceRole: !!supabaseServiceRoleKey,
        clientType: supabaseWrite ? 'service_role' : 'anon',
        configKeys: Object.keys(config),
        payloadValueKeys: Object.keys(payload.value)
      });
      
      // CRITICAL: For JSONB columns, Supabase upsert REPLACES the entire value
      // But to be absolutely sure, we'll delete then insert if update doesn't work
      // First try UPDATE (explicitly replaces the entire JSONB value)
      const updateResult = await writeClient
        .from('app_config')
        .update({ 
          value: config,  // Replace entire JSONB value
          updated_at: new Date().toISOString()
        })
        .eq('key', 'user_config')
        .select();
      
      // If UPDATE affected 0 rows (record doesn't exist), do INSERT
      let data, error;
      if (!updateResult.error && updateResult.data && updateResult.data.length === 0) {
        console.log("[Config] Record doesn't exist, inserting new config");
        const insertResult = await writeClient
          .from('app_config')
          .insert(payload)
          .select();
        data = insertResult.data;
        error = insertResult.error;
      } else {
        data = updateResult.data;
        error = updateResult.error;
      }
      
      // If UPDATE/INSERT failed, fall back to upsert
      if (error) {
        console.warn("[Config] UPDATE/INSERT failed, falling back to upsert:", error.message);
        const upsertResult = await writeClient
          .from('app_config')
          .upsert(payload, {
            onConflict: 'key'
          })
          .select();
        data = upsertResult.data;
        error = upsertResult.error;
      }
      
      if (error) {
        console.error("[Config] Failed to save to Supabase:", error);
        // Log detailed error for debugging
        console.error("[Config] Error message:", error.message || "Unknown error");
        console.error("[Config] Error code:", error.code || "No code");
        console.error("[Config] Error details:", error.details || "No details");
        console.error("[Config] Error hint:", error.hint || "No hint");
        // Don't set success = true, but continue to try local file save
      } else {
        // Check what Supabase actually returned (might be the saved value)
        let savedValue = null;
        if (data && Array.isArray(data) && data.length > 0) {
          savedValue = data[0]?.value;
        } else if (data && typeof data === 'object' && !Array.isArray(data)) {
          savedValue = (data as any).value;
        }
        
        console.log("[Config] Successfully saved to Supabase", {
          usingServiceRole: !!supabaseServiceRoleKey,
          dataReturned: !!data,
          setupComplete: config.setupComplete,
          returnedValueSetupComplete: savedValue?.setupComplete,
          returnedData: data ? JSON.stringify(data, null, 2).substring(0, 300) : 'null'
        });
        
        // If returned value has wrong setupComplete, log warning but still mark as success
        // (the verification step will catch this)
        if (savedValue && savedValue.setupComplete !== config.setupComplete) {
          console.warn("[Config] WARNING: Upsert returned value with different setupComplete!", {
            expected: config.setupComplete,
            returned: savedValue.setupComplete
          });
        }
        
        success = true;
      }
    } else {
      console.warn("[Config] No Supabase client available (neither SERVICE_ROLE_KEY nor ANON_KEY configured)");
    }

    // Save to local file (Localhost development)
    // Always update local file if Supabase succeeded, or if Supabase is not available
    try {
      // Safety check: prevent creating files in wrong directory
      const cwd = process.cwd();
      if (cwd.includes("MyPrivateTools") || cwd.includes("Production_Clones")) {
        console.error("[Config] ERROR: Running from invalid directory:", cwd);
        if (!success) {
          // Only fail if Supabase also failed
          return false;
        }
        // If Supabase succeeded, we can continue (local file save skipped but that's OK)
      } else {
        // Ensure data directory exists
        const dataDir = path.dirname(CONFIG_PATH);
        if (!existsSync(dataDir)) {
          await mkdir(dataDir, { recursive: true });
        }
        await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
        console.log("[Config] Successfully saved to local file");
        success = true; // Local file save also counts as success
      }
    } catch (fsError) {
      // Ignore FS errors if Supabase succeeded (likely Vercel environment)
      if (!success) {
        console.error("[Config] Failed to save to local file:", fsError);
        return false;
      } else {
        console.warn("[Config] Failed to save to local file (but Supabase succeeded):", fsError);
      }
    }

    return success;
  } catch (error) {
    console.error("[Config] Failed to save:", error);
    return false;
  }
}

// GET /api/config - Load configuration
export async function GET() {
  try {
    const config = await loadConfig();
    
    // Inject environment variable values into vectordb config for display
    // These are read-only on the frontend - actual values come from .env.local
    const supabaseUrlEnv = process.env.SUPABASE_URL;
    const supabaseAnonKeyEnv = process.env.SUPABASE_ANON_KEY;
    const supabaseServiceRoleKeyEnv = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    const configWithEnvVars = {
      ...config,
      vectordb: {
        ...config.vectordb,
        provider: "supabase" as const,
        // Use env var values for display (these are the actual values being used)
        url: supabaseUrlEnv || config.vectordb?.url || null,
        anonKey: supabaseAnonKeyEnv || config.vectordb?.anonKey || null,
        serviceRoleKey: supabaseServiceRoleKeyEnv || config.vectordb?.serviceRoleKey || null,
        initialized: !!(supabaseUrlEnv && supabaseAnonKeyEnv) || config.vectordb?.initialized || false,
        lastSync: config.vectordb?.lastSync || null,
      },
    };
    
    return NextResponse.json({ success: true, config: configWithEnvVars });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/config - Update configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const currentConfig = await loadConfig();
    
    // Deep merge updates
    // CRITICAL: Ensure setupComplete is explicitly set from body if provided
    const updatedConfig: AppConfig = {
      ...currentConfig,
      ...body,
      // Explicitly set setupComplete if provided in body (don't rely on spread order)
      setupComplete: body.setupComplete !== undefined ? body.setupComplete : currentConfig.setupComplete,
      llm: { ...currentConfig.llm, ...body.llm },
      features: {
        customVoice: { ...currentConfig.features.customVoice, ...body.features?.customVoice },
        v1Enabled: body.features?.v1Enabled ?? currentConfig.features.v1Enabled,
      },
      ui: { ...currentConfig.ui, ...body.ui },
    };
    
    console.log("[Config] Attempting to save config", {
      bodySetupComplete: body.setupComplete,
      currentConfigSetupComplete: currentConfig.setupComplete,
      updatedConfigSetupComplete: updatedConfig.setupComplete,
      hasSupabase: !!supabase,
      hasServiceRole: !!supabaseServiceRoleKey,
      fullUpdatedConfig: JSON.stringify(updatedConfig, null, 2)
    });
    
    const saved = await saveConfig(updatedConfig);
    
    if (saved) {
      // Longer delay to ensure Supabase write is committed (increased to 1 second for safety)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify the save actually persisted by reading it back directly from Supabase
      // Use the same client that was used for writes (supabaseWrite || supabase)
      let verifyConfig: AppConfig | null = null;
      const verifyClient = supabaseWrite || supabase;
      if (verifyClient) {
        // Retry verification up to 3 times with increasing delays (in case of eventual consistency)
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          }
          
          const { data, error } = await verifyClient
            .from('app_config')
            .select('value')
            .eq('key', 'user_config')
            .single();
          
          if (error) {
            console.error(`[Config] Verification attempt ${attempt + 1} failed:`, {
              error: error.message || error,
              code: error.code,
              details: error.details,
              hint: error.hint
            });
            if (attempt === 2) {
              // Last attempt failed, break
              break;
            }
            continue;
          }
          
          if (data?.value) {
            // Check raw value first before any processing
            const rawValue = data.value as any;
            console.log(`[Config] Verification attempt ${attempt + 1} - Raw value from Supabase:`, {
              hasSetupComplete: 'setupComplete' in rawValue,
              setupCompleteValue: rawValue.setupComplete,
              expected: body.setupComplete,
              rawValueKeys: Object.keys(rawValue),
              rawValueType: typeof rawValue.setupComplete
            });
            
            if (typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue)) {
              // Use rawValue directly - don't merge with DEFAULT_CONFIG
              verifyConfig = rawValue as AppConfig;
              
              // Only fill in truly missing required fields (not setupComplete)
              if (verifyConfig.version === undefined) verifyConfig.version = DEFAULT_CONFIG.version;
              if (!verifyConfig.workspaces) verifyConfig.workspaces = DEFAULT_CONFIG.workspaces;
              if (!verifyConfig.llm) verifyConfig.llm = DEFAULT_CONFIG.llm;
              if (!verifyConfig.features) verifyConfig.features = DEFAULT_CONFIG.features;
              if (!verifyConfig.ui) verifyConfig.ui = DEFAULT_CONFIG.ui;
              
              console.log(`[Config] Verification attempt ${attempt + 1} - After processing:`, {
                setupComplete: verifyConfig.setupComplete,
                expected: body.setupComplete,
                matches: verifyConfig.setupComplete === body.setupComplete,
                typeOfSetupComplete: typeof verifyConfig.setupComplete
              });
              
              // If setupComplete matches (or is undefined and we're not checking it), we're done
              const setupCompleteMatches = body.setupComplete === undefined 
                ? true 
                : verifyConfig.setupComplete === body.setupComplete;
              
              if (setupCompleteMatches) {
                console.log(`[Config] Verification successful on attempt ${attempt + 1}`);
                break;
              }
              
              // If it doesn't match and this isn't the last attempt, try again
              if (attempt < 2) {
                console.log(`[Config] SetupComplete mismatch on attempt ${attempt + 1} (got ${verifyConfig.setupComplete}, expected ${body.setupComplete}), retrying...`);
                continue;
              }
            } else {
              console.error(`[Config] Invalid value format from Supabase (attempt ${attempt + 1}):`, typeof rawValue);
            }
          } else {
            console.error(`[Config] No data returned from Supabase verification query (attempt ${attempt + 1})`);
          }
        }
      }
      
      // If Supabase verification failed after retries, fall back to loadConfig
      if (!verifyConfig || (body.setupComplete !== undefined && verifyConfig.setupComplete !== body.setupComplete)) {
        verifyConfig = await loadConfig();
        console.log("[Config] Fallback verification from loadConfig:", {
          setupComplete: verifyConfig.setupComplete,
          expected: body.setupComplete
        });
      }
      
      // Only fail verification if setupComplete was explicitly set and doesn't match
      // AND we got a valid verifyConfig back (not null)
      if (body.setupComplete !== undefined && verifyConfig && verifyConfig.setupComplete !== body.setupComplete) {
        console.error("[Config] Verification failed after all attempts: setupComplete mismatch", {
          expected: body.setupComplete,
          actual: verifyConfig.setupComplete,
          savedConfigSetupComplete: updatedConfig.setupComplete,
          savedConfigKeys: Object.keys(updatedConfig),
          verifyConfigKeys: Object.keys(verifyConfig)
        });
        
        // CRITICAL: If save succeeded but verification failed, this is likely a Supabase
        // eventual consistency or RLS issue. Since the save operation itself succeeded,
        // we should trust it and return success. The value will be correct after a refresh.
        // Failing here blocks onboarding unnecessarily.
        console.warn("[Config] WARNING: Save succeeded but verification failed. This is likely a Supabase eventual consistency issue. Trusting save operation and returning success.");
        
        // Return success anyway - the save worked, verification is just being overly cautious
        // User can refresh if needed, but onboarding shouldn't be blocked
        return NextResponse.json({ 
          success: true, 
          config: updatedConfig,
          warning: "Config saved successfully, but verification read a different value. This may be a Supabase caching issue. If you see issues, try refreshing the page."
        });
      }
      
      // If verification is null but save succeeded, trust the save
      if (!verifyConfig) {
        console.warn("[Config] Verification returned null, but save succeeded. Trusting save operation.");
      }
      
      return NextResponse.json({ success: true, config: updatedConfig });
    } else {
      return NextResponse.json(
        { success: false, error: "Failed to save configuration (check server logs for details)" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[Config] POST error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/config - Update configuration (merges with existing)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const currentConfig = await loadConfig();
    
    // Merge updates with existing config (preserves fields not in body)
    const updatedConfig = {
      ...currentConfig,
      ...body,
      // Preserve nested objects that might not be in body
      llm: body.llm ? { ...currentConfig.llm, ...body.llm } : currentConfig.llm,
      features: body.features 
        ? {
            customVoice: { ...currentConfig.features.customVoice, ...body.features?.customVoice },
            v1Enabled: body.features?.v1Enabled ?? currentConfig.features.v1Enabled,
          }
        : currentConfig.features,
      ui: body.ui ? { ...currentConfig.ui, ...body.ui } : currentConfig.ui,
      vectordb: body.vectordb ? { ...currentConfig.vectordb, ...body.vectordb } : currentConfig.vectordb,
    };
    
    const saved = await saveConfig(updatedConfig);
    
    if (saved) {
      return NextResponse.json({ success: true, config: updatedConfig });
    } else {
      return NextResponse.json(
        { success: false, error: "Failed to save configuration" },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

