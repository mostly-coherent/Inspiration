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
}

// Load synthesis config from config.json
async function loadSynthesisConfig() {
  try {
    const configPath = path.join(process.cwd(), "data", "config.json");
    const configContent = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configContent);
    return {
      maxItemsToSynthesize: config.themeSynthesis?.maxItemsToSynthesize ?? 15,
      maxTokens: config.themeSynthesis?.maxTokens ?? 800,
      maxDescriptionLength: config.themeSynthesis?.maxDescriptionLength ?? 200,
    };
  } catch {
    return { maxItemsToSynthesize: 15, maxTokens: 800, maxDescriptionLength: 200 };
  }
}

const SYNTHESIS_PROMPT = `You are helping a user reflect on patterns in their ideas and insights. Given a theme and its related items, synthesize a compelling narrative that:

1. **Identifies the Core Pattern**: What's the underlying thread connecting these items?
2. **Reveals the "So What"**: Why does this pattern matter? What does it suggest about the user's thinking or interests?
3. **Offers Actionable Insight**: What could the user do with this awareness? Any next steps or experiments to try?

Keep the tone conversational and insightful - like a thoughtful friend helping you see patterns you might have missed. Be specific, not generic. Reference the actual content of the items.

Format your response as a flowing narrative (2-3 paragraphs), not bullet points. Make it feel like a discovery, not a report.`;

export async function POST(request: Request) {
  try {
    const body: SynthesizeRequest = await request.json();
    const { themeName, items } = body;

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

    // Load synthesis config
    const synthesisConfig = await loadSynthesisConfig();
    const { maxItemsToSynthesize, maxTokens, maxDescriptionLength } = synthesisConfig;

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

    // Call Claude
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: `${SYNTHESIS_PROMPT}\n\n${userMessage}`,
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
