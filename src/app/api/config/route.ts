import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const CONFIG_PATH = path.join(process.cwd(), "data", "config.json");

// Initialize Supabase if configured
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

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
    provider: "anthropic" | "openai" | "openrouter";
    model: string;
    fallbackProvider: "anthropic" | "openai" | "openrouter" | null;
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
    linkedInSync: {
      enabled: boolean;
      postsDirectory: string | null;
    };
    solvedStatusSync: {
      enabled: boolean;
    };
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
    linkedInSync: {
      enabled: false,
      postsDirectory: null,
    },
    solvedStatusSync: {
      enabled: false,
    },
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
    if (supabase) {
      const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'user_config')
        .single();
      
      if (!error && data?.value) {
        return { ...DEFAULT_CONFIG, ...data.value };
      }
    }

    if (existsSync(CONFIG_PATH)) {
      const content = await readFile(CONFIG_PATH, "utf-8");
      const userConfig = JSON.parse(content);
      // Merge with defaults
      return { ...DEFAULT_CONFIG, ...userConfig };
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
    if (supabase) {
      const { error } = await supabase
        .from('app_config')
        .upsert({ 
          key: 'user_config', 
          value: config,
          updated_at: new Date().toISOString()
        });
      
      if (error) {
        console.error("[Config] Failed to save to Supabase:", error);
      } else {
        success = true;
      }
    }

    // Save to local file (Localhost development)
    try {
      // Safety check: prevent creating files in wrong directory
      const cwd = process.cwd();
      if (cwd.includes("MyPrivateTools") || cwd.includes("OtherBuilders")) {
        console.error("[Config] ERROR: Running from invalid directory:", cwd);
        if (!supabase) {
          return false;
        }
        // If Supabase succeeded, we can continue
      } else {
        // Ensure data directory exists
        const dataDir = path.dirname(CONFIG_PATH);
        if (!existsSync(dataDir)) {
          await mkdir(dataDir, { recursive: true });
        }
        await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
        success = true;
      }
    } catch (fsError) {
      // Ignore FS errors if Supabase succeeded (likely Vercel environment)
      if (!supabase) {
        console.error("[Config] Failed to save to local file:", fsError);
        return false;
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
    return NextResponse.json({ success: true, config });
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
    const updatedConfig: AppConfig = {
      ...currentConfig,
      ...body,
      llm: { ...currentConfig.llm, ...body.llm },
      features: {
        linkedInSync: { ...currentConfig.features.linkedInSync, ...body.features?.linkedInSync },
        solvedStatusSync: { ...currentConfig.features.solvedStatusSync, ...body.features?.solvedStatusSync },
        customVoice: { ...currentConfig.features.customVoice, ...body.features?.customVoice },
      },
      ui: { ...currentConfig.ui, ...body.ui },
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

// PUT /api/config - Replace entire configuration
export async function PUT(request: NextRequest) {
  try {
    const config: AppConfig = await request.json();
    const saved = await saveConfig(config);
    
    if (saved) {
      return NextResponse.json({ success: true, config });
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

