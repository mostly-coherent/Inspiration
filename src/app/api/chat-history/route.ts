import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

/**
 * Auto-detect Cursor database path based on platform
 */
export async function GET() {
  try {
    const platform = process.platform;
    let dbPath: string | null = null;
    let platformName: "darwin" | "win32" | null = null;

    if (platform === "darwin") {
      // macOS
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (homeDir) {
        dbPath = path.join(homeDir, "Library/Application Support/Cursor/User/globalStorage/state.vscdb");
        platformName = "darwin";
      }
    } else if (platform === "win32") {
      // Windows
      const appdata = process.env.APPDATA;
      if (appdata) {
        dbPath = path.join(appdata, "Cursor/User/globalStorage/state.vscdb");
        platformName = "win32";
      }
    } else {
      return NextResponse.json({
        success: false,
        error: "Unsupported platform. Inspiration v1 supports macOS and Windows only.",
        path: null,
        platform: null,
        autoDetected: false,
      });
    }

    if (!dbPath) {
      return NextResponse.json({
        success: false,
        error: "Could not determine home directory",
        path: null,
        platform: platformName,
        autoDetected: false,
      });
    }

    // Check if file exists
    const fs = await import("fs/promises");
    let exists = false;
    try {
      await fs.access(dbPath);
      exists = true;
    } catch {
      exists = false;
    }

    return NextResponse.json({
      success: true,
      path: exists ? dbPath : null,
      platform: platformName,
      autoDetected: true,
      exists,
      lastChecked: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: String(error),
        path: null,
        platform: null,
        autoDetected: false,
      },
      { status: 500 }
    );
  }
}

