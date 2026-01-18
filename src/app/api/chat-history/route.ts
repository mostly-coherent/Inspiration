import { NextResponse } from "next/server";
import path from "path";

/**
 * Auto-detect Cursor and Claude Code chat history paths based on platform
 */
export async function GET() {
  try {
    const platform = process.platform;
    const platformName: "darwin" | "win32" | null = platform === "darwin" ? "darwin" : platform === "win32" ? "win32" : null;
    
    if (!platformName) {
      return NextResponse.json({
        success: false,
        error: "Unsupported platform. Inspiration v1 supports macOS and Windows only.",
        cursor: null,
        claudeCode: null,
        platform: null,
        autoDetected: false,
      });
    }

    const fs = await import("fs/promises");
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const appdata = process.env.APPDATA;

    // Detect Cursor path
    let cursorPath: string | null = null;
    let cursorExists = false;
    
    if (platform === "darwin" && homeDir) {
      cursorPath = path.join(homeDir, "Library/Application Support/Cursor/User/globalStorage/state.vscdb");
    } else if (platform === "win32" && appdata) {
      cursorPath = path.join(appdata, "Cursor/User/globalStorage/state.vscdb");
    }

    if (cursorPath) {
      try {
        await fs.access(cursorPath);
        cursorExists = true;
      } catch {
        cursorExists = false;
      }
    }

    // Detect Claude Code path
    let claudeCodePath: string | null = null;
    let claudeCodeExists = false;
    
    if (platform === "darwin" && homeDir) {
      claudeCodePath = path.join(homeDir, ".claude/projects");
    } else if (platform === "win32") {
      if (appdata) {
        claudeCodePath = path.join(appdata, "Claude/projects");
      } else if (homeDir) {
        claudeCodePath = path.join(homeDir, ".claude/projects");
      }
    }

    if (claudeCodePath) {
      try {
        await fs.access(claudeCodePath);
        claudeCodeExists = true;
      } catch {
        claudeCodeExists = false;
      }
    }

    return NextResponse.json({
      success: true,
      cursor: cursorExists ? cursorPath : null,
      claudeCode: claudeCodeExists ? claudeCodePath : null,
      platform: platformName,
      autoDetected: true,
      cursorExists,
      claudeCodeExists,
      lastChecked: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: String(error),
        cursor: null,
        claudeCode: null,
        platform: null,
        autoDetected: false,
      },
      { status: 500 }
    );
  }
}

