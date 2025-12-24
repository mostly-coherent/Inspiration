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
  tool: ToolType;
  mode: PresetMode;
  // Custom overrides
  days?: number;
  bestOf?: number;
  temperature?: number;
  fromDate?: string;
  toDate?: string;
  dryRun?: boolean;
}

export interface GenerateResult {
  success: boolean;
  tool: ToolType;
  mode: PresetMode;
  outputFile?: string;
  content?: string;
  judgeContent?: string;
  stats: {
    daysProcessed: number;
    daysWithActivity: number;
    daysWithOutput: number;
    candidatesGenerated: number;
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
    script: "ideas.py",
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
    description: "LinkedIn posts to share learnings",
    icon: "✨",
    color: "inspiration-insights",
    script: "insights.py",
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

