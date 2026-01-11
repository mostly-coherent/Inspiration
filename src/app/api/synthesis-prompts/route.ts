import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

interface SynthesisPrompts {
  all: string;
  idea: string;
  insight: string;
  use_case: string;
}

// Default prompts
const DEFAULT_PROMPTS: SynthesisPrompts = {
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

const PROMPT_METADATA: Record<keyof SynthesisPrompts, { label: string; description: string }> = {
  all: {
    label: "All Items (General)",
    description: "Used when viewing themes across all item types",
  },
  idea: {
    label: "Ideas",
    description: "Used when viewing themes filtered to Ideas only",
  },
  insight: {
    label: "Insights",
    description: "Used when viewing themes filtered to Insights only",
  },
  use_case: {
    label: "Use Cases",
    description: "Used when viewing themes filtered to Use Cases only",
  },
};

// GET - Retrieve synthesis prompts
export async function GET() {
  try {
    const configPath = path.join(process.cwd(), "data", "config.json");
    const configContent = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configContent);

    const prompts = config.themeSynthesis?.prompts || {};

    // Return prompts with metadata
    const promptsWithMeta = Object.entries(PROMPT_METADATA).map(([key, meta]) => ({
      id: key,
      label: meta.label,
      description: meta.description,
      content: prompts[key] || DEFAULT_PROMPTS[key as keyof SynthesisPrompts],
      isDefault: !prompts[key],
    }));

    return NextResponse.json({
      success: true,
      prompts: promptsWithMeta,
    });
  } catch (error) {
    console.error("Error loading synthesis prompts:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load synthesis prompts" },
      { status: 500 }
    );
  }
}

// PUT - Update a synthesis prompt
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, content } = body;

    // Validate
    if (!id || !["all", "idea", "insight", "use_case"].includes(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid prompt ID" },
        { status: 400 }
      );
    }

    if (typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Content cannot be empty" },
        { status: 400 }
      );
    }

    // Read current config
    const configPath = path.join(process.cwd(), "data", "config.json");
    const configContent = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configContent);

    // Ensure themeSynthesis structure exists
    if (!config.themeSynthesis) {
      config.themeSynthesis = {
        maxItemsToSynthesize: 15,
        maxTokens: 800,
        maxDescriptionLength: 200,
        prompts: {},
      };
    }
    if (!config.themeSynthesis.prompts) {
      config.themeSynthesis.prompts = {};
    }

    // Update the prompt
    config.themeSynthesis.prompts[id] = content;

    // Save config
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

    return NextResponse.json({
      success: true,
      message: `Synthesis prompt for "${id}" updated successfully`,
    });
  } catch (error) {
    console.error("Error saving synthesis prompt:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save synthesis prompt" },
      { status: 500 }
    );
  }
}

// POST - Reset a prompt to default
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, action } = body;

    if (action !== "reset") {
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 }
      );
    }

    if (!id || !["all", "idea", "insight", "use_case"].includes(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid prompt ID" },
        { status: 400 }
      );
    }

    // Read current config
    const configPath = path.join(process.cwd(), "data", "config.json");
    const configContent = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configContent);

    // Reset by removing custom prompt (will fall back to default)
    if (config.themeSynthesis?.prompts) {
      delete config.themeSynthesis.prompts[id];
    }

    // Save config
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

    return NextResponse.json({
      success: true,
      message: `Synthesis prompt for "${id}" reset to default`,
      defaultContent: DEFAULT_PROMPTS[id as keyof SynthesisPrompts],
    });
  } catch (error) {
    console.error("Error resetting synthesis prompt:", error);
    return NextResponse.json(
      { success: false, error: "Failed to reset synthesis prompt" },
      { status: 500 }
    );
  }
}
