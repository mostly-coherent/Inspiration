import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const THEMES_PATH = join(process.cwd(), "data", "themes.json");

// Default themes config (fallback when themes.json is not available, e.g., on Vercel)
const DEFAULT_THEMES = {
  version: 2,
  themes: [
    {
      id: "generation",
      label: "Generate",
      description: "Generate content from chat history",
      modes: [
        {
          id: "idea",
          name: "Ideas",
          description: "Product ideas worth building",
          icon: "💡",
          color: "inspiration-ideas",
          promptTemplate: "ideas_synthesize.md",
          settings: {
            temperature: 0.4,
            minSimilarity: null,
            deduplicationThreshold: null,
            goldenExamplesFolder: null,
            implementedItemsFolder: null,
            semanticSearchQueries: null,
          },
          defaultItemCount: 10,
          createdBy: "user",
          createdDate: "2025-01-01",
        },
        {
          id: "insight",
          name: "Insights",
          description: "Insights and patterns worth further research and sharing",
          icon: "✨",
          color: "inspiration-insights",
          promptTemplate: "insights_synthesize.md",
          settings: {
            temperature: 0.3,
            minSimilarity: null,
            deduplicationThreshold: null,
            goldenExamplesFolder: null,
            implementedItemsFolder: null,
            semanticSearchQueries: null,
          },
          defaultItemCount: 10,
          createdBy: "user",
          createdDate: "2025-01-01",
          defaultBestOf: 5,
        },
      ],
    },
    {
      id: "seek",
      label: "Seek",
      description: "Search chat history for evidence",
      modes: [
        {
          id: "use_case",
          name: "Use Cases",
          description: "Find chat history evidence for use cases",
          icon: "🔍",
          color: "inspiration-seek",
          promptTemplate: null,
          settings: {
            temperature: null,
            minSimilarity: 0,
            deduplicationThreshold: 0.8,
            goldenExamplesFolder: null,
            implementedItemsFolder: null,
            semanticSearchQueries: [
              "Examples of similar projects",
              "Related use cases and implementations",
              "Similar approaches and solutions",
            ],
          },
          defaultItemCount: 5,
          createdBy: "user",
          createdDate: "2025-01-01",
        },
      ],
    },
  ],
};

export async function GET() {
  try {
    if (existsSync(THEMES_PATH)) {
      const content = await readFile(THEMES_PATH, "utf-8");
      const themes = JSON.parse(content);
      return NextResponse.json({ success: true, themes });
    } else {
      // File not found (e.g., on Vercel where data/themes.json is gitignored)
      // Return default themes config so the app works
      console.warn("[Themes API] themes.json not found, using default themes config");
      return NextResponse.json({ success: true, themes: DEFAULT_THEMES });
    }
  } catch (error) {
    console.error("[Themes API] Error loading themes:", error);
    // On error, return default themes so app doesn't break
    return NextResponse.json({ success: true, themes: DEFAULT_THEMES });
  }
}

