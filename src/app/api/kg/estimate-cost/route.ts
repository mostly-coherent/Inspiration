import { NextRequest, NextResponse } from "next/server";
import { requireFeature } from "@/lib/featureFlags";

/**
 * POST /api/kg/estimate-cost
 *
 * Estimates cost and time for Knowledge Graph indexing.
 *
 * Request body:
 * {
 *   chunkCount: number,        // Number of chunks to process
 *   model?: string,            // LLM model (default: "claude-haiku-4-5")
 *   withRelations?: boolean,    // Extract relations (default: true)
 *   avgChunkSize?: number,      // Average tokens per chunk (default: 200)
 *   workers?: number            // Number of parallel workers (default: 4)
 * }
 *
 * Response:
 * {
 *   chunkCount: number,
 *   model: string,
 *   withRelations: boolean,
 *   costEstimate: {
 *     inputTokens: number,
 *     outputTokens: number,
 *     inputCostUsd: number,
 *     outputCostUsd: number,
 *     totalCostUsd: number,
 *     costPerChunk: number
 *   },
 *   timeEstimate: {
 *     hours: number,
 *     minutes: number,
 *     chunksPerMinute: number
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  // Feature flag: Return 404 if KG is disabled
  const featureCheck = requireFeature("KNOWLEDGE_GRAPH");
  if (featureCheck) return featureCheck;

  try {
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }
    const {
      chunkCount,
      model = "claude-haiku-4-5",
      withRelations = true,
      avgChunkSize = 200,
      workers = 4,
    } = body;

    if (!chunkCount || chunkCount <= 0) {
      return NextResponse.json(
        { error: "chunkCount is required and must be > 0" },
        { status: 400 }
      );
    }

    // Validate other numeric inputs
    if (avgChunkSize < 0) {
      return NextResponse.json(
        { error: "avgChunkSize must be >= 0" },
        { status: 400 }
      );
    }

    if (workers <= 0) {
      return NextResponse.json(
        { error: "workers must be > 0" },
        { status: 400 }
      );
    }

    // Model pricing (per 1M tokens) - matches Python estimate_indexing_cost
    const pricing: Record<
      string,
      { input: number; output: number }
    > = {
      "claude-haiku-4-5": {
        input: 1.0, // $1 per 1M input tokens
        output: 5.0, // $5 per 1M output tokens
      },
      "gpt-4o-mini": {
        input: 0.15,
        output: 0.6,
      },
      "gpt-4o": {
        input: 2.5,
        output: 10.0,
      },
    };

    const modelPricing = pricing[model] || pricing["claude-haiku-4-5"];

    // Input tokens: chunk + system prompt (~500 tokens)
    const inputTokensPerChunk = avgChunkSize + 500;
    const totalInputTokens = chunkCount * inputTokensPerChunk;

    // Output tokens: entity extraction (~300 tokens avg)
    let outputTokensPerChunk = 300;
    if (withRelations) {
      outputTokensPerChunk += 400; // Relation extraction adds ~400 tokens
    }
    const totalOutputTokens = chunkCount * outputTokensPerChunk;

    // Calculate costs
    const inputCostUsd =
      (totalInputTokens / 1_000_000) * modelPricing.input;
    const outputCostUsd =
      (totalOutputTokens / 1_000_000) * modelPricing.output;
    const totalCostUsd = inputCostUsd + outputCostUsd;
    const costPerChunk = totalCostUsd / chunkCount;

    // Time estimate (based on observed rates with parallel processing)
    // ~20 chunks/min with 4 workers (varies by chunk quality)
    const chunksPerMinute = workers * 5; // Conservative estimate
    const totalMinutes = chunkCount / chunksPerMinute;
    const hours = totalMinutes / 60;
    const minutes = totalMinutes % 60;

    return NextResponse.json({
      chunkCount,
      model,
      withRelations,
      costEstimate: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        inputCostUsd: parseFloat(inputCostUsd.toFixed(4)),
        outputCostUsd: parseFloat(outputCostUsd.toFixed(4)),
        totalCostUsd: parseFloat(totalCostUsd.toFixed(2)),
        costPerChunk: parseFloat(costPerChunk.toFixed(6)),
      },
      timeEstimate: {
        hours: parseFloat(hours.toFixed(1)),
        minutes: parseFloat(minutes.toFixed(0)),
        chunksPerMinute: parseFloat(chunksPerMinute.toFixed(1)),
      },
    });
  } catch (error) {
    console.error("Error estimating cost:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
