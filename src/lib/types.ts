export type ToolType = "ideas" | "insights";

// v3: LLM Provider Types
export type LLMProviderType = "anthropic" | "openai" | "openrouter";

// v3: Advanced LLM Configuration
export interface LLMTaskConfig {
  provider: LLMProviderType;
  model: string;
}

export interface AdvancedLLMConfig {
  generation: LLMTaskConfig;
  judge: LLMTaskConfig;
  embedding: LLMTaskConfig;
  compression: LLMTaskConfig;
}

// v3: Global Thresholds
export interface GlobalThresholds {
  categorySimilarity: number; // Default: 0.75 - for grouping items into categories
  judgeTemperature: number; // Default: 0.0 - for ranking/judging
  compressionTokenThreshold: number; // Default: 10000 - when to compress
  compressionDateThreshold: number; // Default: 7 - skip compression for ranges under this
}

// v3: Time Preset Configuration
export interface TimePreset {
  id: string;
  label: string;
  days: number;
  hours?: number;
  isCustom: boolean;
}

export type PresetMode = "daily" | "sprint" | "month" | "quarter" | "custom";

export interface ModeConfig {
  id: PresetMode;
  label: string;
  description: string;
  days: number;
  hours?: number; // For time-based windows (e.g., last 24 hours)
  itemCount: number; // v2: Number of items to generate (replaces bestOf)
  bestOf?: number; // Deprecated: kept for backward compatibility
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
  hours?: number; // For time-based windows (e.g., last 24 hours)
  itemCount?: number; // v2: Number of items to generate
  bestOf?: number; // Deprecated: use itemCount instead
  temperature?: number;
  deduplicationThreshold?: number; // v2: Similarity threshold for deduplication (0.0-1.0)
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
  items?: RankedItem[]; // v2: Ranked items (best first)
  estimatedCost?: number; // Estimated LLM cost
  stats: {
    daysProcessed: number;
    daysWithActivity: number;
    daysWithOutput: number;
    itemsGenerated: number; // v2: Items initially generated (before dedup)
    itemsAfterDedup: number; // v2: Items after deduplication
    itemsReturned: number; // v2: Items returned in output file
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
    label: "Last 24 hours",
    description: "Last 24 hours of activity",
    days: 0, // Not used when hours is set
    hours: 24,
    itemCount: 5,
    temperature: 0.3,
    icon: "⚡",
  },
  {
    id: "sprint",
    label: "Last 14 days",
    description: "2-week patterns",
    days: 14,
    itemCount: 10,
    temperature: 0.4,
    icon: "🏃",
  },
  {
    id: "month",
    label: "Last 30 days",
    description: "Monthly patterns",
    days: 30,
    itemCount: 15,
    temperature: 0.5,
    icon: "📅",
  },
  {
    id: "quarter",
    label: "Last 90 days",
    description: "Full history",
    days: 90,
    itemCount: 20,
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
        // eslint-disable-next-line @typescript-eslint/no-require-imports
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
        // eslint-disable-next-line @typescript-eslint/no-require-imports
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

// Seek Types (Theme: Seek, Mode: Use Case)
export interface SeekRequest {
  query: string;
  daysBack?: number;
  topK?: number;
  minSimilarity?: number;
  workspaces?: string[];
}

export interface SeekMessage {
  type: "user" | "assistant";
  text: string;
  timestamp: number;
  workspace?: string;
  chat_id?: string;
  chat_type?: "composer" | "chat";
}

export interface SeekResult {
  success: boolean;
  query: string;
  content?: string; // Synthesized use cases (markdown)
  items?: Array<{
    title: string;
    what?: string;
    how?: string;
    context?: string;
    similarity?: string;
    takeaways?: string;
  }>; // Parsed use case items
  stats: {
    conversationsAnalyzed: number;
    daysSearched: number;
    useCasesFound: number;
  };
  outputFile?: string;
  error?: string;
}

// v2 Unified Items/Categories Types
export type ThemeType = "generation" | "seek";
export type ModeType = string; // User-defined: "idea", "insight", "use_case", etc.
export type ItemType = "insight" | "idea" | "use_case";
export type ItemStatus = "active" | "implemented" | "posted" | "archived";

export interface Item {
  id: string;
  // v2 unified fields
  itemType: ItemType;
  title: string;
  description: string;
  tags: string[];
  status: ItemStatus;
  sourceConversations: number; // Number of distinct conversations
  // Core metadata
  occurrence: number;
  firstSeen: string; // ISO date string
  lastSeen: string; // ISO date string
  categoryId: string | null;
  // Legacy fields (for backward compatibility)
  mode?: ModeType;
  theme?: ThemeType;
  name?: string; // Maps to title
  content?: Record<string, unknown>; // Deprecated - use title + description
  implemented?: boolean; // Deprecated - use status
  implementedDate?: string | null;
  implementedSource?: string | null;
  embedding?: number[]; // For category grouping
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
  deduplicationThreshold: number | null; // v2: Similarity threshold for item deduplication (0.0-1.0)
  goldenExamplesFolder: string | null;
  implementedItemsFolder: string | null;
  semanticSearchQueries: string[] | null; // Semantic search queries for finding relevant conversations
}

export interface Mode {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  promptTemplate: string | null;
  settings: ModeSettings;
  defaultItemCount: number; // v2: Default number of items to generate
  defaultBestOf?: number; // Deprecated: kept for backward compatibility
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

