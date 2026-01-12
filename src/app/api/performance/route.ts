import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { logger } from "@/lib/logger";

const PERF_LOGS_DIR = path.join(process.cwd(), "data", "performance_logs");

interface RunSummary {
  run_id: string;
  success: boolean;
  error?: string;
  total_elapsed_seconds: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  phase_timings: Record<string, number>;
}

interface PhaseAnalysis {
  avg_seconds: number;
  min_seconds: number;
  max_seconds: number;
  sample_count: number;
}

/**
 * GET /api/performance
 * 
 * Query parameters:
 * - action: "list" | "detail" | "analyze"
 * - run_id: (required for action=detail)
 * - limit: number of runs to return (default: 10)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "list";
    const runId = searchParams.get("run_id");
    const limit = parseInt(searchParams.get("limit") || "10");

    if (!existsSync(PERF_LOGS_DIR)) {
      return NextResponse.json({
        success: true,
        message: "No performance logs yet",
        runs: [],
      });
    }

    if (action === "list") {
      // List recent runs
      const files = await readdir(PERF_LOGS_DIR);
      const runFiles = files
        .filter((f) => f.startsWith("run_") && f.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, limit);

      const runs: RunSummary[] = [];
      for (const file of runFiles) {
        try {
          const content = await readFile(path.join(PERF_LOGS_DIR, file), "utf-8");
          const data = JSON.parse(content);
          if (data.summary) {
            runs.push(data.summary);
          }
        } catch (e) {
          logger.error(`Failed to read performance log ${file}:`, e);
        }
      }

      return NextResponse.json({
        success: true,
        runs,
        total: runFiles.length,
      });
    }

    if (action === "detail") {
      if (!runId) {
        return NextResponse.json(
          { success: false, error: "run_id is required for action=detail" },
          { status: 400 }
        );
      }

      const logFile = path.join(PERF_LOGS_DIR, `run_${runId}.json`);
      if (!existsSync(logFile)) {
        return NextResponse.json(
          { success: false, error: `Run ${runId} not found` },
          { status: 404 }
        );
      }

      const content = await readFile(logFile, "utf-8");
      const data = JSON.parse(content);

      return NextResponse.json({
        success: true,
        run: data,
      });
    }

    if (action === "analyze") {
      // Analyze phase performance across all runs
      const files = await readdir(PERF_LOGS_DIR);
      const runFiles = files
        .filter((f) => f.startsWith("run_") && f.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, limit);

      const phaseTimes: Record<string, number[]> = {};
      const costData: number[] = [];
      const durationData: number[] = [];
      let successCount = 0;
      let errorCount = 0;

      for (const file of runFiles) {
        try {
          const content = await readFile(path.join(PERF_LOGS_DIR, file), "utf-8");
          const data = JSON.parse(content);
          const summary = data.summary as RunSummary;

          if (summary.success) {
            successCount++;
            if (summary.total_elapsed_seconds) {
              durationData.push(summary.total_elapsed_seconds);
            }
            if (summary.total_cost_usd) {
              costData.push(summary.total_cost_usd);
            }
            for (const [phase, time] of Object.entries(summary.phase_timings || {})) {
              if (!phaseTimes[phase]) phaseTimes[phase] = [];
              phaseTimes[phase].push(time);
            }
          } else {
            errorCount++;
          }
        } catch (e) {
          logger.error(`Failed to analyze performance log ${file}:`, e);
        }
      }

      // Calculate phase analytics
      const phaseAnalysis: Record<string, PhaseAnalysis> = {};
      for (const [phase, times] of Object.entries(phaseTimes)) {
        if (times.length > 0) {
          phaseAnalysis[phase] = {
            avg_seconds: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100,
            min_seconds: Math.round(Math.min(...times) * 100) / 100,
            max_seconds: Math.round(Math.max(...times) * 100) / 100,
            sample_count: times.length,
          };
        }
      }

      // Sort phases by average time (descending) to identify bottlenecks
      const bottlenecks = Object.entries(phaseAnalysis)
        .sort(([, a], [, b]) => b.avg_seconds - a.avg_seconds)
        .map(([phase, stats]) => ({
          phase,
          ...stats,
          is_bottleneck: stats.avg_seconds > 30, // Flag phases taking >30s as bottlenecks
        }));

      return NextResponse.json({
        success: true,
        analysis: {
          runs_analyzed: successCount + errorCount,
          success_rate: successCount / (successCount + errorCount) || 0,
          avg_duration_seconds: durationData.length > 0 
            ? Math.round((durationData.reduce((a, b) => a + b, 0) / durationData.length) * 100) / 100 
            : 0,
          avg_cost_usd: costData.length > 0
            ? Math.round((costData.reduce((a, b) => a + b, 0) / costData.length) * 10000) / 10000
            : 0,
          phase_analysis: phaseAnalysis,
          bottlenecks,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    logger.error("[Performance API] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
