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

// Default prompts (fallback if config doesn't have them)
const DEFAULT_PROMPTS: Record<string, string> = {
  all: `You are helping a user reflect on patterns in their ideas and insights. Given a theme and its related items, synthesize a compelling narrative that:

1. **Identifies the Core Pattern**: What's the underlying thread connecting these items?
2. **Reveals the "So What"**: Why does this pattern matter? What does it suggest about the user's thinking or interests?
3. **Offers Actionable Insight**: What could the user do with this awareness? Any next steps or experiments to try?

Keep the tone conversational and insightful - like a thoughtful friend helping you see patterns you might have missed. Be specific, not generic. Reference the actual content of the items.

Format your response as a flowing narrative (2-3 paragraphs), not bullet points. Make it feel like a discovery, not a report.`,
  idea: `You are helping a user discover patterns in their IDEAS for tools, prototypes, and things to build. Given a theme and its related idea items, synthesize insights that:

1. **Identifies the Core Pattern**: What underlying problem or opportunity connects these ideas?
2. **Reveals the "So What"**: Why does this pattern matter for the user's builder journey?
3. **Suggests a Starting Point**: Which idea or combination might be worth prototyping first?

Keep the tone energizing and action-oriented - like a co-founder brainstorming with you. Be specific about what makes these ideas interesting together.

Format your response as a flowing narrative (2-3 paragraphs), not bullet points. End with a clear suggestion.`,
  insight: `You are helping a user understand patterns in their INSIGHTS - observations, learnings, and realizations worth sharing. Given a theme and its related insight items, synthesize a narrative that:

1. **Identifies the Core Pattern**: What worldview or perspective connects these insights?
2. **Reveals the "So What"**: What does this pattern reveal about the user's evolving expertise?
3. **Suggests Content Opportunities**: Could these insights form a blog post, talk, or thread?

Keep the tone reflective and intellectual - like a thought partner helping crystallize wisdom. Be specific about the unique angle these insights offer.

Format your response as a flowing narrative (2-3 paragraphs), not bullet points. Highlight what makes this perspective distinctive.`,
  use_case: `You are helping a user understand patterns in their USE CASES - real examples of how they've solved problems or applied techniques. Given a theme and its related use case items, synthesize insights that:

1. **Identifies the Core Pattern**: What skill, approach, or methodology connects these use cases?
2. **Reveals the "So What"**: What does this pattern suggest about the user's emerging expertise?
3. **Suggests Applications**: Where else could this approach be applied? Any teaching opportunities?

Keep the tone practical and evidence-based - like a mentor reviewing your portfolio. Be specific about what these use cases demonstrate.

Format your response as a flowing narrative (2-3 paragraphs), not bullet points. Ground insights in the actual evidence.`,
};

// Load synthesis config from config.json
async function loadSynthesisConfig(itemType: string = "all") {
  try {
    const configPath = path.join(process.cwd(), "data", "config.json");
    const configContent = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configContent);
    
    // Get prompt for this item type (fallback to "all", then to default)
    const prompts = config.themeSynthesis?.prompts || {};
    const prompt = prompts[itemType] || prompts["all"] || DEFAULT_PROMPTS[itemType] || DEFAULT_PROMPTS["all"];
    
    return {
      maxItemsToSynthesize: config.themeSynthesis?.maxItemsToSynthesize ?? 15,
      maxTokens: config.themeSynthesis?.maxTokens ?? 800,
      maxDescriptionLength: config.themeSynthesis?.maxDescriptionLength ?? 200,
      prompt,
    };
  } catch {
    return { 
      maxItemsToSynthesize: 15, 
      maxTokens: 800, 
      maxDescriptionLength: 200,
      prompt: DEFAULT_PROMPTS[itemType] || DEFAULT_PROMPTS["all"],
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
