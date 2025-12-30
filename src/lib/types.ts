export type ToolType = "ideas" | "insights";

export type PresetMode = "daily" | "sprint" | "month" | "quarter" | "custom";

export interface ModeConfig {
  id: PresetMode;
  label: string;
  description: string;
  days: number;
  bestOf: number;
  temperature: number;
  icon: string;
}

export interface GenerateRequest {
  // v0 backward compatibility
  tool?: ToolType;
  mode: PresetMode;
  // v1 theme/mode support
  theme?: ThemeType;
  modeId?: ModeType; // User-defined mode ID (e.g., "idea", "insight", "use_case")
  // Custom overrides
  days?: number;
  bestOf?: number;
  temperature?: number;
  fromDate?: string;
  toDate?: string;
  dryRun?: boolean;
}

export interface RankedItem {
  id: string;
  rank: number;
  isBest: boolean;
  name: string;
  content: string;
  rawMarkdown: string;
  score?: number;
}

export interface GenerateResult {
  success: boolean;
  tool: ToolType;
  mode: PresetMode;
  outputFile?: string; // Deprecated - kept for backward compatibility
  content?: string;
  judgeContent?: string;
  items?: RankedItem[]; // v1: Ranked items (best first)
  estimatedCost?: number; // Estimated LLM cost
  stats: {
    daysProcessed: number;
    daysWithActivity: number;
    daysWithOutput: number;
    candidatesGenerated: number;
    conversationsAnalyzed?: number;
    harmonization?: {
      itemsProcessed: number;
      itemsAdded: number;
      itemsUpdated: number;
      itemsDeduplicated: number;
    };
  };
  error?: string;
  timestamp: string;
}

export interface RunHistoryItem {
  id: string;
  tool: ToolType;
  mode: PresetMode;
  timestamp: string;
  outputFile: string;
  preview: string;
}

export const PRESET_MODES: ModeConfig[] = [
  {
    id: "daily",
    label: "Today",
    description: "Today's activity",
    days: 1,
    bestOf: 3,
    temperature: 0.3,
    icon: "⚡",
  },
  {
    id: "sprint",
    label: "Last 14 days",
    description: "2-week patterns",
    days: 14,
    bestOf: 5,
    temperature: 0.4,
    icon: "🏃",
  },
  {
    id: "month",
    label: "Last 30 days",
    description: "Monthly patterns",
    days: 30,
    bestOf: 10,
    temperature: 0.5,
    icon: "📅",
  },
  {
    id: "quarter",
    label: "Last 90 days",
    description: "Full history",
    days: 90,
    bestOf: 15,
    temperature: 0.5,
    icon: "🎯",
  },
];

// Engine path - relative to project root
const ENGINE_PATH = process.env.ENGINE_PATH || "../engine";

export const TOOL_CONFIG = {
  ideas: {
    label: "Ideas",
    description: "Prototype & tool ideas worth building",
    icon: "💡",
    color: "inspiration-ideas",
    script: "generate.py",
    mode: "ideas",
    // Path will be resolved at runtime
    getPath: () => {
      // When running in Next.js, resolve relative to project root
      if (typeof window === 'undefined') {
        const path = require('path');
        return path.resolve(process.cwd(), 'engine');
      }
      return ENGINE_PATH;
    },
  },
  insights: {
    label: "Insights",
    description: "Social media posts to share learnings",
    icon: "✨",
    color: "inspiration-insights",
    script: "generate.py",
    mode: "insights",
    getPath: () => {
      if (typeof window === 'undefined') {
        const path = require('path');
        return path.resolve(process.cwd(), 'engine');
      }
      return ENGINE_PATH;
    },
  },
} as const;

// For backwards compatibility
export function getToolPath(tool: ToolType): string {
  const config = TOOL_CONFIG[tool];
  return config.getPath();
}

// Reverse Match Types
export interface ReverseMatchRequest {
  query: string;
  daysBack?: number;
  topK?: number;
  minSimilarity?: number;
  workspaces?: string[];
}

export interface ReverseMatchMessage {
  type: "user" | "assistant";
  text: string;
  timestamp: number;
  workspace?: string;
  chat_id?: string;
  chat_type?: "composer" | "chat";
}

export interface ReverseMatchResult {
  success: boolean;
  query: string;
  matches: Array<{
    message: ReverseMatchMessage;
    similarity: number;
    context: {
      before: ReverseMatchMessage[];
      after: ReverseMatchMessage[];
    };
  }>;
  stats: {
    totalMessages: number;
    matchesFound: number;
    daysSearched: number;
    startDate?: string;
    endDate?: string;
    conversationsExamined?: number;
  };
  error?: string;
}

// v1 Unified Items/Categories Types
export type ThemeType = "generation" | "seek";
export type ModeType = string; // User-defined: "idea", "insight", "use_case", etc.

export interface Item {
  id: string;
  mode: ModeType;
  theme: ThemeType;
  name: string;
  content: Record<string, any>; // Original item data (varies by mode)
  occurrence: number;
  firstSeen: string; // ISO date string
  lastSeen: string; // ISO date string
  categoryId: string | null;
  implemented: boolean;
  implementedDate: string | null; // ISO date string
  implementedSource: string | null; // File path if found via cosine similarity
  embedding?: number[]; // For category grouping
  metadata?: {
    generatedDate?: string;
    generationMode?: string;
    candidatesGenerated?: number;
  };
}

export interface Category {
  id: string;
  name: string;
  theme: ThemeType;
  mode: ModeType;
  itemIds: string[];
  similarityThreshold: number;
  createdDate: string; // ISO date string
}

export interface ItemsBank {
  version: number;
  items: Item[];
  categories: Category[];
  last_updated?: string;
}

export interface ItemsBankStats {
  totalItems: number;
  totalCategories: number;
  byMode: Record<string, number>;
  byTheme: Record<string, number>;
  implemented: number;
}

// v1 Theme/Mode Types
export interface ModeSettings {
  temperature: number | null;
  minSimilarity: number | null;
  goldenExamplesFolder: string | null;
  implementedItemsFolder: string | null;
}

export interface Mode {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  promptTemplate: string | null;
  settings: ModeSettings;
  defaultBestOf: number;
  createdBy: "system" | "user";
  createdDate: string;
}

export interface Theme {
  id: ThemeType;
  label: string;
  description: string;
  modes: Mode[];
}

export interface ThemesConfig {
  version: number;
  themes: Theme[];
}

