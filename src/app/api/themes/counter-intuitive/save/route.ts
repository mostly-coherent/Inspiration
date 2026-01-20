import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

interface SavedReflection {
  id: string;
  clusterTitle: string;
  clusterSize: number;
  counterPerspective: string;
  reasoning: string;
  suggestedAngles: string[];
  reflectionPrompt: string;
  savedAt: string;
  viewedCount: number;
}

const DATA_DIR = path.join(process.cwd(), "data");
const SAVED_FILE = path.join(DATA_DIR, "saved_reflections.json");
const DISMISSED_FILE = path.join(DATA_DIR, "dismissed_reflections.json");

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Directory exists
  }
}

async function loadSavedReflections(): Promise<SavedReflection[]> {
  try {
    const content = await fs.readFile(SAVED_FILE, "utf-8");
    if (!content || !content.trim()) {
      return [];
    }
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      console.error("Invalid saved reflections format, expected array");
      return [];
    }
    return parsed;
  } catch (error) {
    // File doesn't exist or is corrupted - return empty array
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Error loading saved reflections:", error);
    }
    return [];
  }
}

async function saveSavedReflections(reflections: SavedReflection[]) {
  try {
    await ensureDataDir();
    await fs.writeFile(SAVED_FILE, JSON.stringify(reflections, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving reflections:", error);
    throw new Error("Failed to save reflections");
  }
}

async function loadDismissedIds(): Promise<string[]> {
  try {
    const content = await fs.readFile(DISMISSED_FILE, "utf-8");
    if (!content || !content.trim()) {
      return [];
    }
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      console.error("Invalid dismissed IDs format, expected array");
      return [];
    }
    return parsed;
  } catch (error) {
    // File doesn't exist or is corrupted - return empty array
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Error loading dismissed IDs:", error);
    }
    return [];
  }
}

async function saveDismissedIds(ids: string[]) {
  try {
    await ensureDataDir();
    await fs.writeFile(DISMISSED_FILE, JSON.stringify(ids, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving dismissed IDs:", error);
    throw new Error("Failed to save dismissed IDs");
  }
}

// POST - Save a reflection ("Keep in Mind")
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { suggestion } = body;

    if (!suggestion || !suggestion.id) {
      return NextResponse.json(
        { success: false, error: "Invalid suggestion data" },
        { status: 400 }
      );
    }

    const reflections = await loadSavedReflections();

    // Check if already saved
    if (reflections.some((r) => r.id === suggestion.id)) {
      return NextResponse.json({
        success: true,
        message: "Already saved",
      });
    }

    // Add new reflection
    const newReflection: SavedReflection = {
      id: suggestion.id,
      clusterTitle: suggestion.clusterTitle,
      clusterSize: suggestion.clusterSize,
      counterPerspective: suggestion.counterPerspective,
      reasoning: suggestion.reasoning,
      suggestedAngles: suggestion.suggestedAngles,
      reflectionPrompt: suggestion.reflectionPrompt,
      savedAt: new Date().toISOString(),
      viewedCount: 0,
    };

    reflections.push(newReflection);
    await saveSavedReflections(reflections);

    return NextResponse.json({
      success: true,
      message: "Reflection saved",
      reflection: newReflection,
    });
  } catch (error) {
    console.error("Error saving reflection:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save reflection" },
      { status: 500 }
    );
  }
}

// GET - Get all saved reflections
export async function GET() {
  try {
    const reflections = await loadSavedReflections();
    return NextResponse.json({
      success: true,
      reflections,
      count: reflections.length,
    });
  } catch (error) {
    console.error("Error loading reflections:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load reflections", reflections: [] },
      { status: 500 }
    );
  }
}

// DELETE - Dismiss a suggestion
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing suggestion ID" },
        { status: 400 }
      );
    }

    const dismissed = await loadDismissedIds();

    if (!dismissed.includes(id)) {
      dismissed.push(id);
      await saveDismissedIds(dismissed);
    }

    return NextResponse.json({
      success: true,
      message: "Suggestion dismissed",
    });
  } catch (error) {
    console.error("Error dismissing suggestion:", error);
    return NextResponse.json(
      { success: false, error: "Failed to dismiss suggestion" },
      { status: 500 }
    );
  }
}
