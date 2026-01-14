import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { validatePromptTemplate, formatValidationErrors } from "@/lib/promptValidator";

const PROMPTS_DIR = path.join(process.cwd(), "engine", "prompts");

// List of prompt templates grouped by category
const PROMPT_FILES = [
  // Generation prompts
  { id: "base", file: "base_synthesize.md", label: "Base Template", description: "Common rules for all modes", category: "generation" },
  { id: "ideas", file: "ideas_synthesize.md", label: "Ideas", description: "Idea generation prompt", category: "generation" },
  { id: "insights", file: "insights_synthesize.md", label: "Insights", description: "Insight generation prompt", category: "generation" },
  { id: "use_case", file: "use_case_synthesize.md", label: "Use Cases", description: "Use case synthesis prompt", category: "generation" },
  { id: "item_ranker", file: "item_ranker.md", label: "Item Ranker", description: "Item ranking/judging prompt", category: "generation" },
  // Counter-Intuitive prompts (Theme Explorer)
  { id: "counter_intuitive", file: "counter_intuitive.md", label: "Counter-Intuitive (Single)", description: "Generate one counter-perspective for a theme", category: "counter_intuitive" },
  { id: "counter_intuitive_batch", file: "counter_intuitive_batch.md", label: "Counter-Intuitive (Batch)", description: "Generate multiple counter-perspectives efficiently", category: "counter_intuitive" },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const promptId = searchParams.get("id");

    // If specific prompt requested, return its content
    if (promptId) {
      const promptConfig = PROMPT_FILES.find((p) => p.id === promptId);
      if (!promptConfig) {
        return NextResponse.json({ success: false, error: "Prompt not found" }, { status: 404 });
      }

      const filePath = path.join(PROMPTS_DIR, promptConfig.file);
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ success: false, error: "Prompt file not found" }, { status: 404 });
      }

      const content = fs.readFileSync(filePath, "utf-8");
      return NextResponse.json({
        success: true,
        prompt: {
          ...promptConfig,
          content,
        },
      });
    }

    // Return list of all prompts
    const prompts = PROMPT_FILES.map((p) => {
      const filePath = path.join(PROMPTS_DIR, p.file);
      const exists = fs.existsSync(filePath);
      const stats = exists ? fs.statSync(filePath) : null;
      return {
        ...p,
        exists,
        size: stats ? stats.size : 0,
        lastModified: stats ? stats.mtime.toISOString() : null,
      };
    });

    return NextResponse.json({ success: true, prompts });
  } catch (error) {
    console.error("Error reading prompts:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, content, action } = body;

    // Handle reset action
    if (action === "reset") {
      if (!id) {
        return NextResponse.json(
          { success: false, error: "Missing id" },
          { status: 400 }
        );
      }

      const promptConfig = PROMPT_FILES.find((p) => p.id === id);
      if (!promptConfig) {
        return NextResponse.json(
          { success: false, error: "Prompt not found" },
          { status: 404 }
        );
      }

      const filePath = path.join(PROMPTS_DIR, promptConfig.file);
      
      // Find the most recent backup
      const backupDir = path.dirname(filePath);
      const backupName = path.basename(filePath, ".md");
      
      let backups: string[] = [];
      try {
        const files = fs.readdirSync(backupDir);
        backups = files
          .filter((f) => f.startsWith(`${backupName}.backup.`) && f.endsWith(".md"))
          .sort()
          .reverse();
      } catch (error) {
        // Directory doesn't exist or can't read - no backups
        return NextResponse.json(
          { success: false, error: "No backup found to restore" },
          { status: 404 }
        );
      }

      if (backups.length === 0) {
        return NextResponse.json(
          { success: false, error: "No backup found to restore" },
          { status: 404 }
        );
      }

      // Restore from most recent backup
      const mostRecentBackup = path.join(backupDir, backups[0]);
      let defaultContent: string;
      try {
        defaultContent = fs.readFileSync(mostRecentBackup, "utf-8");
      } catch (error) {
        return NextResponse.json(
          { success: false, error: "Failed to read backup file" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Prompt reset to original default",
        defaultContent,
      });
    }

    // Handle save action
    if (!id || content === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing id or content" },
        { status: 400 }
      );
    }

    const promptConfig = PROMPT_FILES.find((p) => p.id === id);
    if (!promptConfig) {
      return NextResponse.json(
        { success: false, error: "Prompt not found" },
        { status: 404 }
      );
    }

    const filePath = path.join(PROMPTS_DIR, promptConfig.file);

    // Validate prompt template before saving
    const validationResult = validatePromptTemplate(content);
    if (!validationResult.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: `Prompt validation failed:\n\n${formatValidationErrors(validationResult)}`,
        },
        { status: 400 }
      );
    }

    // Create backup before overwriting (only if this is the first edit)
    if (fs.existsSync(filePath)) {
      const backupDir = path.dirname(filePath);
      const backupName = path.basename(filePath, ".md");
      const files = fs.readdirSync(backupDir);
      const backups = files.filter((f) => f.startsWith(`${backupName}.backup.`));
      
      // Only create backup if no backups exist (preserve original)
      if (backups.length === 0) {
        const backupPath = filePath.replace(".md", `.backup.${Date.now()}.md`);
        fs.copyFileSync(filePath, backupPath);
      }
    }

    // Write new content
    fs.writeFileSync(filePath, content, "utf-8");

    return NextResponse.json({
      success: true,
      message: "Prompt updated successfully",
    });
  } catch (error) {
    console.error("Error updating prompt:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

