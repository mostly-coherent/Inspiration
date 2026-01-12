import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

interface SynthesisPrompts {
  all: string;
  idea: string;
  insight: string;
  use_case: string;
}

const PROMPTS_DIR = path.join(process.cwd(), "engine", "prompts");

// Load default prompts from files
async function loadDefaultPrompts(): Promise<SynthesisPrompts> {
  const prompts: SynthesisPrompts = {
    all: "",
    idea: "",
    insight: "",
    use_case: "",
  };

  try {
    prompts.all = await fs.readFile(
      path.join(PROMPTS_DIR, "theme_synthesis_all.md"),
      "utf-8"
    );
  } catch {
    prompts.all = "Synthesize patterns across all item types.";
  }

  try {
    prompts.idea = await fs.readFile(
      path.join(PROMPTS_DIR, "theme_synthesis_idea.md"),
      "utf-8"
    );
  } catch {
    prompts.idea = "Synthesize patterns in ideas for building.";
  }

  try {
    prompts.insight = await fs.readFile(
      path.join(PROMPTS_DIR, "theme_synthesis_insight.md"),
      "utf-8"
    );
  } catch {
    prompts.insight = "Synthesize patterns in insights worth sharing.";
  }

  try {
    prompts.use_case = await fs.readFile(
      path.join(PROMPTS_DIR, "theme_synthesis_use_case.md"),
      "utf-8"
    );
  } catch {
    prompts.use_case = "Synthesize patterns in use cases.";
  }

  return prompts;
}

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
    const defaultPrompts = await loadDefaultPrompts();
    const configPath = path.join(process.cwd(), "data", "config.json");
    
    let customPrompts = {};
    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);
      customPrompts = config.themeSynthesis?.prompts || {};
    } catch {
      // Config doesn't exist yet, use defaults
    }

    // Return prompts with metadata
    const promptsWithMeta = Object.entries(PROMPT_METADATA).map(([key, meta]) => ({
      id: key,
      label: meta.label,
      description: meta.description,
      content: customPrompts[key] || defaultPrompts[key as keyof SynthesisPrompts],
      isDefault: !customPrompts[key],
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

    // Read current config (create if doesn't exist)
    const configPath = path.join(process.cwd(), "data", "config.json");
    let config: any = {};
    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      config = JSON.parse(configContent);
    } catch {
      // Config doesn't exist, start with empty object
      config = {};
    }

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

    // Load default from file
    const defaultPrompts = await loadDefaultPrompts();

    // Read current config (create if doesn't exist)
    const configPath = path.join(process.cwd(), "data", "config.json");
    let config: any = {};
    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      config = JSON.parse(configContent);
    } catch {
      // Config doesn't exist, nothing to reset
      return NextResponse.json({
        success: true,
        message: `Synthesis prompt for "${id}" reset to default`,
        defaultContent: defaultPrompts[id as keyof SynthesisPrompts],
      });
    }

    // Reset by removing custom prompt (will fall back to default)
    if (config.themeSynthesis?.prompts) {
      delete config.themeSynthesis.prompts[id];
    }

    // Save config
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

    return NextResponse.json({
      success: true,
      message: `Synthesis prompt for "${id}" reset to default`,
      defaultContent: defaultPrompts[id as keyof SynthesisPrompts],
    });
  } catch (error) {
    console.error("Error resetting synthesis prompt:", error);
    return NextResponse.json(
      { success: false, error: "Failed to reset synthesis prompt" },
      { status: 500 }
    );
  }
}
