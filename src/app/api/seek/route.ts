import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { callPythonEngine } from "@/lib/pythonEngine";

export const maxDuration = 300; // 5 minutes for semantic search (embedding generation can take time)

export interface SeekRequest {
  query: string;
  daysBack?: number;
  topK?: number;
  minSimilarity?: number;
  workspaces?: string[];
}

export interface SeekResult {
  success: boolean;
  query: string;
  content?: string; // Synthesized use cases (markdown)
  items?: Array<{
    title: string;
    what?: string;
    how?: string;
    context?: string;
    similarity?: string;
    takeaways?: string;
  }>; // Parsed use case items
  stats: {
    conversationsAnalyzed: number;
    daysSearched: number;
    useCasesFound: number;
  };
  outputFile?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SeekRequest = await request.json();
    const { query, daysBack = 90, topK = 10, minSimilarity = 0.0, workspaces } = body;
    
    // Note: 90-day limit removed in v1 - Vector DB enables unlimited date ranges
    
    // Get abort signal from request
    const signal = request.signal;

    if (!query || !query.trim()) {
      return NextResponse.json(
        { success: false, error: "Query is required" },
        { status: 400 }
      );
    }
    
    // No 90-day limit - Vector DB enables unlimited ranges
    const effectiveDaysBack = daysBack;

    // Build command arguments (always use --json for structured output)
    const args: string[] = [
      "--query", query,
      "--days", effectiveDaysBack.toString(),
      "--top-k", topK.toString(),
      "--min-similarity", minSimilarity.toString(),
      "--json", // Always JSON for API
    ];

    if (workspaces && workspaces.length > 0) {
      for (const workspace of workspaces) {
        args.push("--workspace", workspace);
      }
    }

    // Build request body for Python engine
    const engineBody: any = {
      query,
      daysBack: effectiveDaysBack,
      topK,
      minSimilarity,
      workspaces,
    };

    // Execute Python script via HTTP or local spawn
    const result = await callPythonEngine("seek", engineBody, signal);

    // Check for script errors
    if (result.exitCode !== 0) {
      logger.error(`[Inspiration] Script error (exit ${result.exitCode}):`, result.stderr);
      
      // Try to extract error message from JSON output if available
      let errorMessage = result.stderr.slice(0, 500);
      try {
        const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const output = JSON.parse(jsonMatch[0]) as SeekResult;
          if (output.error) {
            errorMessage = output.error;
          }
        }
      } catch {
        // Use stderr if JSON parsing fails
      }
      
      return NextResponse.json(
        {
          success: false,
          query,
          stats: {
            conversationsAnalyzed: 0,
            daysSearched: effectiveDaysBack,
            useCasesFound: 0,
          },
          error: `Script failed: ${errorMessage}`,
        },
        { status: 500 }
      );
    }

    // Parse JSON output
    try {
      let output: any;
      
      if (process.env.PYTHON_ENGINE_URL) {
        // HTTP mode: stdout is JSON string
        output = JSON.parse(result.stdout);
      } else {
        // Local mode: find JSON in stdout (may have stderr messages before it)
        const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in script output");
        }
        output = JSON.parse(jsonMatch[0]);
      }
      
      const typedOutput = output as {
        query: string;
        content?: string;
        items?: Array<{
          title: string;
          what?: string;
          how?: string;
          context?: string;
          similarity?: string;
          takeaways?: string;
        }>;
        stats: {
          conversationsAnalyzed: number;
          daysSearched: number;
          useCasesFound: number;
        };
        outputFile?: string;
        error?: string;
      };
      
      const seekResult: SeekResult = {
        success: !typedOutput.error,
        query: typedOutput.query,
        content: typedOutput.content,
        items: typedOutput.items,
        stats: typedOutput.stats,
        outputFile: typedOutput.outputFile,
        error: typedOutput.error,
      };
      
      return NextResponse.json(seekResult);
    } catch (parseError) {
      logger.error("[Inspiration] Failed to parse JSON output:", result.stdout);
      return NextResponse.json(
        {
          success: false,
          query,
          stats: {
            conversationsAnalyzed: 0,
            daysSearched: effectiveDaysBack,
            useCasesFound: 0,
          },
          error: `Failed to parse script output: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error("[Inspiration] Error:", error);
      return NextResponse.json(
        {
          success: false,
          query: "",
          stats: {
            conversationsAnalyzed: 0,
            daysSearched: 0,
            useCasesFound: 0,
          },
          error: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
  }
}


