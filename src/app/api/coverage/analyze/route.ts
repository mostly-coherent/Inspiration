import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30; // 30 seconds for coverage analysis

// Cost estimation constants (USD)
const COST_PER_ITEM = {
  idea: 0.025,
  insight: 0.02,
  use_case: 0.03,
};

const CONVERSATIONS_PER_ITEM = 10; // 1 item per 10 conversations is healthy coverage

interface WeekDensity {
  week_label: string;
  week_start: string;
  week_end: string;
  conversation_count: number;
  message_count: number;
}

interface WeekCoverage {
  week_label: string;
  week_start: string;
  item_count: number;
}

interface CoverageGap {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  conversationCount: number;
  messageCount: number;
  existingItems: number;
  expectedItems: number;
  severity: "high" | "medium" | "low";
  gapScore: number;
}

interface SuggestedRun {
  weekLabel: string;
  startDate: string;
  endDate: string;
  itemType: string;
  expectedItems: number;
  conversationCount: number;
  messageCount: number;
  existingItems: number;
  priority: "high" | "medium" | "low";
  reason: string;
  estimatedCost: number;
}

/**
 * GET /api/coverage/analyze
 * 
 * Get coverage analysis comparing Memory terrain to Library coverage.
 * Returns gaps and suggested runs.
 */
export async function GET() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { success: false, error: "Supabase not configured" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get memory density by week
    const { data: memoryData, error: memoryError } = await supabase.rpc(
      "get_memory_density_by_week"
    );

    if (memoryError) {
      console.error("Error getting memory density:", memoryError);
      // Try to provide a helpful error message
      if (memoryError.message.includes("does not exist")) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Coverage functions not found. Please run add_coverage_tables.sql in Supabase SQL Editor.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { success: false, error: memoryError.message },
        { status: 500 }
      );
    }

    // Get library coverage by week
    const { data: libraryData, error: libraryError } = await supabase.rpc(
      "get_library_coverage_by_week"
    );

    if (libraryError) {
      console.error("Error getting library coverage:", libraryError);
      return NextResponse.json(
        { success: false, error: libraryError.message },
        { status: 500 }
      );
    }

    const memoryDensity: WeekDensity[] = memoryData || [];
    const libraryCoverage: WeekCoverage[] = libraryData || [];

    // Build coverage map
    const coverageMap = new Map<string, number>();
    for (const cov of libraryCoverage) {
      coverageMap.set(cov.week_label, cov.item_count);
    }

    // Detect gaps
    const gaps: CoverageGap[] = [];

    for (const week of memoryDensity) {
      const conversations = week.conversation_count;
      if (conversations === 0) continue;

      const existingItems = coverageMap.get(week.week_label) || 0;
      const expected = Math.max(1, Math.floor(conversations / CONVERSATIONS_PER_ITEM));

      if (existingItems >= expected) continue; // Well covered

      // Calculate gap score
      const deficitRatio = (expected - existingItems) / expected;
      const gapScore = conversations * deficitRatio;

      // Assign severity
      let severity: "high" | "medium" | "low";
      if (existingItems === 0 && conversations >= 20) {
        severity = "high";
      } else if (existingItems === 0 || existingItems < expected / 2) {
        severity = "medium";
      } else {
        severity = "low";
      }

      gaps.push({
        weekLabel: week.week_label,
        weekStart: week.week_start,
        weekEnd: week.week_end,
        conversationCount: conversations,
        messageCount: week.message_count,
        existingItems,
        expectedItems: expected,
        severity,
        gapScore,
      });
    }

    // Sort gaps by severity then gap score
    const severityOrder = { high: 0, medium: 1, low: 2 };
    gaps.sort((a, b) => {
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return b.gapScore - a.gapScore;
    });

    // Generate suggested runs (both ideas and insights for each gap)
    const suggestedRuns: SuggestedRun[] = [];
    const itemTypes = ["idea", "insight"] as const;
    
    for (const gap of gaps.slice(0, 10)) {
      // Calculate run size based on severity and conversation count
      let expectedItems: number;
      if (gap.severity === "high") {
        expectedItems = gap.conversationCount >= 50 ? 10 : gap.conversationCount >= 30 ? 8 : 5;
      } else if (gap.severity === "medium") {
        expectedItems = 5;
      } else {
        expectedItems = 3;
      }

      // Build reason
      const baseReason =
        gap.existingItems === 0
          ? `${gap.conversationCount} conversations with no items covering this period`
          : `${gap.conversationCount} conversations with only ${gap.existingItems} items (expected ${gap.expectedItems})`;

      // Create a run for each item type
      for (const itemType of itemTypes) {
        const estimatedCost = Number(
          (expectedItems * COST_PER_ITEM[itemType]).toFixed(4)
        );

        suggestedRuns.push({
          weekLabel: gap.weekLabel,
          startDate: gap.weekStart,
          endDate: gap.weekEnd,
          itemType,
          expectedItems,
          conversationCount: gap.conversationCount,
          messageCount: gap.messageCount,
          existingItems: gap.existingItems,
          priority: gap.severity,
          reason: baseReason,
          estimatedCost,
        });
      }
    }
    
    // Sort: high priority first, then by week, then ideas before insights
    suggestedRuns.sort((a, b) => {
      if (severityOrder[a.priority] !== severityOrder[b.priority]) {
        return severityOrder[a.priority] - severityOrder[b.priority];
      }
      if (a.weekLabel !== b.weekLabel) {
        return b.weekLabel.localeCompare(a.weekLabel); // Newer weeks first
      }
      return a.itemType === "idea" ? -1 : 1; // Ideas before insights
    });

    // Calculate coverage score
    const totalWeeks = memoryDensity.filter((w) => w.conversation_count > 0).length;
    const coveredWeeks = memoryDensity.filter(
      (w) => w.conversation_count > 0 && (coverageMap.get(w.week_label) || 0) > 0
    ).length;
    const coverageScore = totalWeeks > 0 ? Math.round((coveredWeeks / totalWeeks) * 100) : 100;

    // Count gaps by severity
    const gapCounts = {
      high: gaps.filter((g) => g.severity === "high").length,
      medium: gaps.filter((g) => g.severity === "medium").length,
      low: gaps.filter((g) => g.severity === "low").length,
    };

    // Calculate totals
    const totalConversations = memoryDensity.reduce((sum, w) => sum + w.conversation_count, 0);
    const totalMessages = memoryDensity.reduce((sum, w) => sum + w.message_count, 0);
    const totalItems = libraryCoverage.reduce((sum, w) => sum + w.item_count, 0);

    // Get date range
    const earliestDate = memoryDensity.length > 0 ? memoryDensity[0].week_start : null;
    const latestDate = memoryDensity.length > 0 ? memoryDensity[memoryDensity.length - 1].week_end : null;

    return NextResponse.json({
      success: true,
      coverageScore,
      gapCounts,
      gaps: gaps.slice(0, 20), // Limit to 20 gaps
      suggestedRuns,
      memory: {
        totalWeeks: memoryDensity.length,
        totalConversations,
        totalMessages,
        earliestDate,
        latestDate,
        weeks: memoryDensity.map((w) => ({
          weekLabel: w.week_label,
          weekStart: w.week_start,
          weekEnd: w.week_end,
          conversationCount: w.conversation_count,
          messageCount: w.message_count,
        })),
      },
      library: {
        totalItems,
        weeksWithItems: libraryCoverage.length,
        weeks: libraryCoverage.map((w) => ({
          weekLabel: w.week_label,
          weekStart: w.week_start,
          itemCount: w.item_count,
        })),
      },
      analyzedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Coverage Analyze] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
