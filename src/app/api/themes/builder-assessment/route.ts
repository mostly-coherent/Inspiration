import { NextRequest, NextResponse } from "next/server";
import { generateBuilderAssessment, getLatestAssessment, saveAssessmentResponses } from "@/lib/socratic";

export const maxDuration = 120;

/**
 * GET /api/themes/builder-assessment
 *
 * - Default: Generate a fresh Builder Assessment (evidence-backed weakness analysis).
 *   Automatically loads previous assessment for longitudinal comparison.
 * - ?latest=true: Return the most recently stored assessment without regenerating.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const latestOnly = searchParams.get("latest") === "true";

  try {
    if (latestOnly) {
      const stored = await getLatestAssessment();
      return NextResponse.json({
        success: true,
        assessment: stored,
        stored: true,
      });
    }

    const result = await generateBuilderAssessment();

    if (!result.assessment) {
      return NextResponse.json({
        success: true,
        assessment: null,
        message: result.message || "Could not generate assessment.",
      });
    }

    return NextResponse.json({
      success: true,
      assessment: result.assessment,
    });
  } catch (error) {
    console.error("Builder Assessment API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        assessment: null,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/themes/builder-assessment
 *
 * Save user responses to a specific assessment.
 * Body: { assessmentId: string, responses: Record<weaknessId, responseText> }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { assessmentId, responses } = body;

    if (!assessmentId || !responses || typeof responses !== "object") {
      return NextResponse.json(
        { success: false, error: "Missing assessmentId or responses" },
        { status: 400 }
      );
    }

    const saved = await saveAssessmentResponses(assessmentId, responses);

    if (!saved) {
      return NextResponse.json(
        { success: false, error: "Failed to save responses. Supabase table may not exist — run migration 007_builder_assessments.sql." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Builder Assessment POST error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
