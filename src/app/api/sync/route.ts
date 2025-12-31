import { NextResponse } from "next/server";
import { callPythonEngine } from "@/lib/pythonEngine";

export const maxDuration = 300; // 5 minutes

export async function POST() {
  try {
    // Execute Python script via HTTP or local spawn
    const result = await callPythonEngine("sync", {}, undefined);
    
    if (result.exitCode !== 0) {
      // Check for specific "Database not found" error
      if (result.stderr.includes("Database not found") || result.stderr.includes("not found at")) {
        return NextResponse.json(
          { 
            success: false, 
            error: "Cannot sync from cloud environment. The app cannot access your local Cursor database when running on Vercel. Please run the app locally to sync." 
          },
          { status: 400 }
        );
      } else {
        return NextResponse.json(
          { success: false, error: result.stderr || "Unknown error occurred during sync" },
          { status: 500 }
        );
      }
    }
    
    // Parse stdout for stats
    const indexedMatch = result.stdout.match(/Indexed: (\d+)/);
    const failedMatch = result.stdout.match(/Failed: (\d+)/);
    const skippedMatch = result.stdout.match(/Already indexed.*?(\d+)/);
    const indexed = indexedMatch ? parseInt(indexedMatch[1]) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
    const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;
    
    // Check if there were no new messages
    if (result.stdout.includes("No new messages to sync")) {
      return NextResponse.json({ 
        success: true, 
        message: "Brain is up to date",
        stats: { indexed: 0, skipped, failed }
      });
    } else {
      return NextResponse.json({ 
        success: true, 
        message: "Sync completed successfully",
        stats: { indexed, skipped, failed }
      });
    }
  } catch (error) {
    console.error("Sync API error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

