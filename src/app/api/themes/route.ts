import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const THEMES_PATH = join(process.cwd(), "data", "themes.json");

export async function GET() {
  try {
    if (existsSync(THEMES_PATH)) {
      const content = await readFile(THEMES_PATH, "utf-8");
      const themes = JSON.parse(content);
      return NextResponse.json({ success: true, themes });
    } else {
      return NextResponse.json({
        success: true,
        themes: { version: 1, themes: [] },
      });
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

