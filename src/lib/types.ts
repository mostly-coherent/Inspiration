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
  judgeTemperature: number; // Default: 0.0 - for ranking/judging
  compressionTokenThreshold: number; // Default: 10000 - when to compress
  compressionDateThreshold: number; // Default: 7 - skip compression for ranges under this
}

// v3: Generation Defaults - Control how AI generates content
export interface GenerationDefaults {
  temperature: number; // 0.0-1.0, how creative the AI should be
  deduplicationThreshold: number; // 0.0-1.0, similarity to count as duplicate
  maxTokens: number; // Maximum tokens for generation
  maxTokensJudge: number; // Maximum tokens for judging
  softCap: number; // Maximum items to extract per run (UX-1: soft cap, extracts all quality items up to this limit)
}

// v3: Seek Mode Defaults - Control how Seek searches
export interface SeekDefaults {
  daysBack: number; // Days of history to search
  topK: number; // Maximum results
  minSimilarity: number; // Minimum relevance score
}

// v3: Semantic Search defaults
export interface SemanticSearchDefaults {
  defaultTopK: number; // Default number of results
  defaultMinSimilarity: number; // Default minimum relevance
}

// v3: Theme Explorer configuration
export interface ThemeExplorerConfig {
  defaultZoom: number; // Initial similarity level (0.5-0.9)
  sliderMin: number; // Minimum slider value
  sliderMax: number; // Maximum slider value
  maxThemesToDisplay: number; // Max themes in list
}

// v3: Theme Synthesis configuration
export interface ThemeSynthesisConfig {
  maxItemsToSynthesize: number; // Max items in AI analysis
  maxTokens: number; // Max length of AI insights
  maxDescriptionLength: number; // Max chars per item description
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
    temperature: 0.3,
    icon: "⚡",
  },
  {
    id: "sprint",
    label: "Last 14 days",
    description: "2-week patterns",
    days: 14,
    temperature: 0.4,
    icon: "🏃",
  },
  {
    id: "month",
    label: "Last 30 days",
    description: "Monthly patterns",
    days: 30,
    temperature: 0.5,
    icon: "📅",
  },
  {
    id: "quarter",
    label: "Last 90 days",
    description: "Full history",
    days: 90,
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
export type ItemStatus = "active" | "archived";

export interface Item {
  id: string;
  // Core fields
  itemType: ItemType; // "idea" | "insight" | "use_case"
  title: string;
  description: string;
  status: ItemStatus;
  // Metadata
  occurrence: number; // How many times this topic surfaced
  firstSeen: string; // YYYY-MM format
  lastSeen: string; // YYYY-MM format
  categoryId: string | null;
  // Source tracking
  sourceDates?: string[];
  sourceWorkspaces?: string[];
  // Theme tracking
  theme?: ThemeType; // "generation" | "seek"
  // Internal (not displayed)
  embedding?: number[];
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
}

// v1 Theme/Mode Types
export interface ModeSettings {
  temperature: number | null;
  minSimilarity: number | null;
  deduplicationThreshold: number | null; // v2: Similarity threshold for item deduplication (0.0-1.0)
  goldenExamplesFolder: string | null;
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

