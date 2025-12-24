import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

const CONFIG_PATH = path.join(process.cwd(), "data", "config.json");

export interface AppConfig {
  version: number;
  setupComplete: boolean;
  workspaces: string[];
  llm: {
    provider: "anthropic" | "openai";
    model: string;
    fallbackProvider: "anthropic" | "openai" | null;
    fallbackModel: string | null;
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
  llm: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    fallbackProvider: "openai",
    fallbackModel: "gpt-4o",
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
  },
  ui: {
    defaultTool: "insights",
    defaultMode: "sprint",
  },
};

async function loadConfig(): Promise<AppConfig> {
  try {
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
    // Ensure data directory exists
    const dataDir = path.dirname(CONFIG_PATH);
    if (!existsSync(dataDir)) {
      await mkdir(dataDir, { recursive: true });
    }
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
    return true;
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

