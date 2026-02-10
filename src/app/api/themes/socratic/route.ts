import { NextResponse } from "next/server";
import { generateSocraticQuestions } from "@/lib/socratic";

export const maxDuration = 120; // 120 seconds for LLM calls

/**
 * GET /api/themes/socratic
 *
 * Generate or return cached Socratic reflection questions.
 * Pure TypeScript — works on both local and Vercel.
 *
 * Query params:
 *   - force=true  → Force regeneration (ignore cache)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  try {
    const result = await generateSocraticQuestions(force);

    if (result.questions.length === 0) {
      return NextResponse.json({
        success: true,
        questions: [],
        message:
          result.message ||
          "No questions generated. Ensure you have Library items and indexed Memory.",
      });
    }

    return NextResponse.json({
      success: true,
      questions: result.questions,
      count: result.questions.length,
      cached: result.cached,
    });
  } catch (error) {
    console.error("Socratic API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        questions: [],
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/themes/socratic
 *
 * Handle question interactions (dismiss, resonate).
 * These are tracked client-side; the POST is fire-and-forget for analytics.
 *
 * Body: { action: "dismiss" | "resonate", questionId: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, questionId } = body;

    if (!action || !questionId) {
      return NextResponse.json(
        { success: false, error: "Missing action or questionId" },
        { status: 400 }
      );
    }

    // Client-side state handles the immediate UX.
    // This endpoint acknowledges the action for logging/analytics.
    // Future improvement: persist to Supabase table for cross-session tracking.

    return NextResponse.json({
      success: true,
      action,
      questionId,
    });
  } catch (error) {
    console.error("Socratic POST error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
