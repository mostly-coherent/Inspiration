import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";

interface ThemeItem {
  id: string;
  title: string;
  description?: string;
}

interface SynthesizeRequest {
  themeName: string;
  items: ThemeItem[];
  itemType?: "all" | "idea" | "insight" | "use_case"; // Which type of items
}

const PROMPTS_DIR = path.join(process.cwd(), "engine", "prompts");

// Load default prompt from file
async function loadDefaultPrompt(itemType: string): Promise<string> {
  const fileMap: Record<string, string> = {
    all: "theme_synthesis_all.md",
    idea: "theme_synthesis_idea.md",
    insight: "theme_synthesis_insight.md",
    use_case: "theme_synthesis_use_case.md",
  };

  const fileName = fileMap[itemType] || fileMap["all"];
  const filePath = path.join(PROMPTS_DIR, fileName);

  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    // Fallback to minimal prompt if file doesn't exist
    return `Synthesize patterns in ${itemType === "all" ? "these items" : itemType + "s"}.`;
  }
}

// Load synthesis config from config.json and .md files
async function loadSynthesisConfig(itemType: string = "all") {
  try {
    const configPath = path.join(process.cwd(), "data", "config.json");
    let config: any = {};
    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      config = JSON.parse(configContent);
    } catch {
      // Config doesn't exist, use defaults
    }
    
    // Get prompt: custom from config > default from file
    const customPrompts = config.themeSynthesis?.prompts || {};
    let prompt: string;
    
    if (customPrompts[itemType]) {
      prompt = customPrompts[itemType];
    } else if (customPrompts["all"]) {
      prompt = customPrompts["all"];
    } else {
      // Load from .md file
      prompt = await loadDefaultPrompt(itemType);
    }
    
    return {
      maxItemsToSynthesize: config.themeSynthesis?.maxItemsToSynthesize ?? 15,
      maxTokens: config.themeSynthesis?.maxTokens ?? 800,
      maxDescriptionLength: config.themeSynthesis?.maxDescriptionLength ?? 200,
      prompt,
    };
  } catch (error) {
    // Fallback to defaults
    console.error("Failed to load synthesis config, using defaults:", error);
    return { 
      maxItemsToSynthesize: 15, 
      maxTokens: 800, 
      maxDescriptionLength: 200,
      prompt: await loadDefaultPrompt(itemType),
    };
  }
}

export async function POST(request: Request) {
  try {
    const body: SynthesizeRequest = await request.json();
    const { themeName, items, itemType = "all" } = body;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "No items provided" },
        { status: 400 }
      );
    }

    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Anthropic API key not configured" },
        { status: 500 }
      );
    }

    // Load synthesis config with prompt for this item type
    const synthesisConfig = await loadSynthesisConfig(itemType);
    const { maxItemsToSynthesize, maxTokens, maxDescriptionLength, prompt } = synthesisConfig;

    // Prepare items context - optimize by limiting description length
    const itemsContext = items
      .slice(0, maxItemsToSynthesize)
      .map((item, i) => {
        const desc = item.description
          ? item.description.slice(0, maxDescriptionLength) + (item.description.length > maxDescriptionLength ? "..." : "")
          : "";
        return `${i + 1}. "${item.title}"${desc ? `\n   ${desc}` : ""}`;
      })
      .join("\n\n");

    const userMessage = `Theme: "${themeName}"

Items in this theme (${items.length} total${items.length > maxItemsToSynthesize ? `, showing first ${maxItemsToSynthesize}` : ""}):

${itemsContext}

Please synthesize the pattern and insights from these items.`;

    // Call Claude with the type-specific prompt
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: `${prompt}\n\n${userMessage}`,
        },
      ],
    });

    // Extract text from response
    const synthesis = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return NextResponse.json({
      success: true,
      themeName,
      itemCount: items.length,
      synthesis,
      model: "claude-sonnet-4-20250514",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
  } catch (error) {
    console.error("Error synthesizing theme:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to synthesize theme",
      },
      { status: 500 }
    );
  }
}
