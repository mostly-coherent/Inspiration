import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

/**
 * GET /api/kg/index-progress?jobId=<jobId>
 *
 * Returns progress for a specific indexing job, or the most recent running job.
 *
 * Response:
 * {
 *   success: boolean,
 *   progress: {
 *     jobId: string,
 *     status: "running" | "completed" | "failed" | "stopped",
 *     startTime: number,
 *     endTime?: number,
 *     totalConversations: number,
 *     processedConversations: number,
 *     entitiesCreated: number,
 *     entitiesDeduplicated: number,
 *     relationsCreated: number,
 *     decisionsCreated: number,
 *     error?: string,
 *     phase?: string,
 *     progressPercent?: number,
 *     elapsedSeconds?: number,
 *     estimatedSecondsRemaining?: number
 *   }
 * }
 */

const PROGRESS_FILE = join(process.cwd(), "data", "kg_indexing_progress.json");

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!existsSync(PROGRESS_FILE)) {
      return NextResponse.json({
        success: false,
        error: "No indexing jobs found",
      });
    }

    const content = await readFile(PROGRESS_FILE, "utf-8");
    let allProgress: Record<string, any> = {};
    try {
      allProgress = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse progress file:", parseError);
      return NextResponse.json({
        success: false,
        error: "Progress file is corrupted",
      }, { status: 500 });
    }

    let progress;
    if (jobId) {
      progress = allProgress[jobId];
    } else {
      // Return most recent running job, or most recent job if none running
      const running = Object.values(allProgress).find(
        (p: any) => p.status === "running"
      );
      if (running) {
        progress = running;
      } else {
        // Return most recent job
        const sorted = Object.values(allProgress).sort(
          (a: any, b: any) => b.startTime - a.startTime
        );
        progress = sorted[0];
      }
    }

    if (!progress) {
      return NextResponse.json({
        success: false,
        error: "Job not found",
      });
    }

    // Calculate derived fields
    const progressPercent =
      progress.totalConversations > 0
        ? Math.round(
            (progress.processedConversations / progress.totalConversations) *
              100
          )
        : 0;

    const elapsedSeconds = progress.endTime
      ? Math.round((progress.endTime - progress.startTime) / 1000)
      : Math.round((Date.now() - progress.startTime) / 1000);

    let estimatedSecondsRemaining;
    if (
      progress.status === "running" &&
      progress.processedConversations > 0 &&
      progress.totalConversations > 0 &&
      elapsedSeconds > 0
    ) {
      const rate = progress.processedConversations / elapsedSeconds;
      const remaining = progress.totalConversations - progress.processedConversations;
      estimatedSecondsRemaining = rate > 0 ? Math.round(remaining / rate) : undefined;
    }

    return NextResponse.json({
      success: true,
      progress: {
        ...progress,
        progressPercent,
        elapsedSeconds,
        estimatedSecondsRemaining,
      },
    });
  } catch (error) {
    console.error("Error fetching progress:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
