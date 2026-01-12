import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { GenerateRequest, GenerateResult, TOOL_CONFIG, PRESET_MODES, getToolPath, ThemeType, ModeType, ToolType, GenerationDefaults } from "@/lib/types";
import { logger } from "@/lib/logger";
import { parseRankedItems, extractEstimatedCost } from "@/lib/resultParser";
import { resolveThemeModeFromTool, validateThemeMode, getModeSettings, getMode } from "@/lib/themes";
import { getPythonPath } from "@/lib/pythonPath";

// Default generation settings (fallback if config not found)
const DEFAULT_GENERATION: GenerationDefaults = {
  temperature: 0.5,
  deduplicationThreshold: 0.80,
  maxTokens: 4000,
  maxTokensJudge: 500,
  softCap: 50,
};

// Load generation defaults from config
async function loadGenerationDefaults(): Promise<GenerationDefaults> {
  try {
    const configPath = path.join(process.cwd(), "data", "config.json");
    if (existsSync(configPath)) {
      const content = await readFile(configPath, "utf-8");
      const config = JSON.parse(content);
      if (config.generationDefaults) {
        return { ...DEFAULT_GENERATION, ...config.generationDefaults };
      }
    }
  } catch (error) {
    logger.error("[Generate] Failed to load generation defaults:", error);
  }
  return DEFAULT_GENERATION;
}

// Performance note (v2 Item-Centric Architecture):
// - UX-1: itemCount removed - system extracts all quality items with soft cap
// - deduplication: Quick cosine similarity check (batch embeddings)
// - ranking: Single LLM call to rank items
// Typical times: ~30-90s depending on date range
export const maxDuration = 300; // 5 minutes (reduced from 10 - v2 is faster)

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { tool, theme, modeId, mode, days, temperature, deduplicationThreshold, fromDate, toDate, dryRun } = body;
    
    // Get abort signal from request
    const signal = request.signal;

    // Resolve theme and mode (support both v0 tool and v1 theme/mode)
    let resolvedTheme: ThemeType;
    let resolvedMode: ModeType;
    let resolvedTool: ToolType;

    if (theme && modeId) {
      // v1: Explicit theme/mode
      if (!validateThemeMode(theme, modeId)) {
        return NextResponse.json(
          { success: false, error: `Invalid theme/mode combination: ${theme}/${modeId}` },
          { status: 400 }
        );
      }
      resolvedTheme = theme;
      resolvedMode = modeId;
      // Map mode back to tool for backward compatibility with generate.py
      resolvedTool = modeId === "idea" ? "ideas" : modeId === "insight" ? "insights" : "ideas";
    } else if (tool) {
      // v0: Backward compatibility - resolve from tool
      const resolved = resolveThemeModeFromTool(tool);
      if (!resolved) {
        return NextResponse.json(
          { success: false, error: `Unknown tool: ${tool}` },
          { status: 400 }
        );
      }
      resolvedTheme = resolved.theme;
      resolvedMode = resolved.mode;
      resolvedTool = tool;
    } else {
      return NextResponse.json(
        { success: false, error: "Either 'tool' (v0) or 'theme' + 'modeId' (v1) must be provided" },
        { status: 400 }
      );
    }

    // Get tool config (for script path)
    const toolConfig = TOOL_CONFIG[resolvedTool];
    if (!toolConfig) {
      return NextResponse.json(
        { success: false, error: `Unknown tool: ${resolvedTool}` },
        { status: 400 }
      );
    }

    // Get mode config (for defaults)
    const modeConfig = PRESET_MODES.find((m) => m.id === mode);
    
    // Get mode settings from themes.json (v1)
    const modeSettings = getModeSettings(resolvedTheme, resolvedMode);
    const themeMode = getMode(resolvedTheme, resolvedMode); // v2: For accessing defaultItemCount
    
    // Note: 90-day limit removed in v1 - Vector DB enables unlimited date ranges
    
    // Build command arguments
    const args: string[] = [];
    
    // Add --mode parameter (required for unified generate.py)
    // Use resolvedMode which maps to generate.py's mode parameter
    args.push("--mode", resolvedMode === "idea" ? "ideas" : resolvedMode === "insight" ? "insights" : resolvedMode);
    
    if (mode !== "custom" && modeConfig) {
      // Use preset mode
      args.push(`--${mode}`);
    } else {
      // Custom mode - use explicit args
      if (fromDate && toDate) {
        // Use explicit date range (enables IMP-17 topic filter)
        const from = new Date(fromDate);
        const to = new Date(toDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day
        from.setHours(0, 0, 0, 0);
        to.setHours(0, 0, 0, 0);
        
        // Validate: end date cannot be in the future
        if (to > today) {
          return NextResponse.json(
            {
              success: false,
              tool,
              mode,
              error: `End date cannot be in the future.`,
              stats: { daysProcessed: 0, daysWithActivity: 0, daysWithOutput: 0, itemsGenerated: 0, itemsAfterDedup: 0, itemsReturned: 0 },
              timestamp: new Date().toISOString(),
            },
            { status: 400 }
          );
        }
        
        // Validate: start date must be before or equal to end date
        if (from > to) {
          return NextResponse.json(
            {
              success: false,
              tool,
              mode,
              error: `Start date must be before or equal to end date.`,
              stats: { daysProcessed: 0, daysWithActivity: 0, daysWithOutput: 0, itemsGenerated: 0, itemsAfterDedup: 0, itemsReturned: 0 },
              timestamp: new Date().toISOString(),
            },
            { status: 400 }
          );
        }
        
        // Use explicit --start-date and --end-date (enables IMP-17 topic filter)
        args.push("--start-date", fromDate);
        args.push("--end-date", toDate);
        args.push("--source-tracking"); // Enable coverage tracking + topic filter
      } else if (days) {
        // Note: No 90-day limit in v1 - Vector DB enables unlimited ranges
        args.push("--days", days.toString());
      }
    }

    // Load global generation defaults from config
    const generationDefaults = await loadGenerationDefaults();
    
    // Override with custom values if provided, or use mode defaults, or use global defaults
    // Priority: per-request > per-mode > global config > hardcoded fallback
    // UX-1: itemCount is now softCap from config - Python extracts all quality items up to this limit
    const effectiveTemperature = temperature ?? modeSettings?.temperature ?? modeConfig?.temperature ?? generationDefaults.temperature;
    const effectiveDeduplicationThreshold = deduplicationThreshold ?? modeSettings?.deduplicationThreshold ?? generationDefaults.deduplicationThreshold;
    const effectiveSoftCap = generationDefaults.softCap ?? 50;
    
    args.push("--temperature", effectiveTemperature.toString());
    args.push("--dedup-threshold", effectiveDeduplicationThreshold.toString());
    args.push("--item-count", effectiveSoftCap.toString());

    if (dryRun) {
      args.push("--dry-run");
    }

    // Get tool path dynamically
    const toolPath = getToolPath(resolvedTool);
    const pythonPath = getPythonPath();
    
    logger.log(`[Inspiration] Running: ${pythonPath} ${toolConfig.script} ${args.join(" ")}`);
    logger.log(`[Inspiration] Working directory: ${toolPath}`);

    // Execute Python script with abort signal support
    const result = await runPythonScript(toolPath, toolConfig.script, args, signal);

    // Check for script errors
    if (result.exitCode !== 0) {
      // Log both stdout and stderr for debugging
      logger.error(`[Inspiration] Script error (exit ${result.exitCode})`);
      if (result.stdout) {
        logger.error(`[Inspiration] stdout:`, result.stdout.slice(-2000)); // Last 2000 chars
      }
      if (result.stderr) {
        logger.error(`[Inspiration] stderr:`, result.stderr.slice(-2000)); // Last 2000 chars
      }
      
      // Combine stdout and stderr for error extraction (Python sometimes prints errors to stdout)
      const combinedOutput = [result.stderr || '', result.stdout || ''].join('\n');
      
      // Extract actual error message from combined output (filter out progress messages)
      let errorMessage = result.stderr || result.stdout || 'Unknown error';
      
      // Look for actual error patterns (Traceback, Error:, Failed:, RuntimeError, etc.)
      const errorPatterns = [
        /Traceback \(most recent call last\):[\s\S]*?(?=\n\n|\n🔍|\n📥|\n✅|\n⚠️|$)/, // Full traceback
        /(?:Error|Failed|RuntimeError|Exception|Traceback):[^\n]*(?:\n[^\n]*)*/gi, // Error lines
        /❌[^\n]*(?:\n[^\n]*)*/g, // Error emoji lines
      ];
      
      let extractedError: string | null = null;
      for (const pattern of errorPatterns) {
        const match = combinedOutput.match(pattern);
        if (match && match[0]) {
          extractedError = match[0].trim();
          break;
        }
      }
      
      // If we found a specific error, use it; otherwise show last portion of output
      if (extractedError) {
        errorMessage = extractedError;
      } else {
        // Show last portion of combined output (most recent messages) which likely contains the error
        const lines = combinedOutput.split('\n');
        const errorLines = lines.filter(line => 
          line.includes('Error') || 
          line.includes('Failed') || 
          line.includes('Traceback') ||
          line.includes('❌') ||
          line.includes('Exception') ||
          line.includes('RuntimeError')
        );
        
        if (errorLines.length > 0) {
          // Show context around error lines (last 50 lines)
          const lastLines = lines.slice(-50).join('\n');
          errorMessage = lastLines;
        } else {
          // Fallback: show last 1000 chars of combined output
          errorMessage = combinedOutput.slice(-1000);
        }
      }
      
      // Truncate if still too long
      const errorPreview = errorMessage.length > 2000 
        ? `${errorMessage.slice(0, 2000)}\n... (truncated, ${result.stderr.length} total chars in stderr)`
        : errorMessage;
      
      return NextResponse.json(
        {
          success: false,
          tool: resolvedTool,
          mode,
          error: `Script failed (exit ${result.exitCode}): ${errorPreview}`,
          stats: { daysProcessed: 0, daysWithActivity: 0, daysWithOutput: 0, candidatesGenerated: 0 },
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    // Parse output to find generated file
    // v2: Matches ideas_output/ or insights_output/ paths
    // Example: /path/to/data/ideas_output/ideas_2025-12-18_to_2025-12-31.judge.md
    // Or relative: ideas_output/ideas_2025-12-18_to_2025-12-31.judge.md
    const outputFileMatch = result.stdout.match(/(?:ideas_output|insights_output|use_cases_output)\/[\w_]+[\d-]+(?:_to_[\d-]+)?\.(?:judge\.md|judge-no-(?:idea|post)\.md|md)/);
    const outputFile = outputFileMatch ? outputFileMatch[0] : undefined;

    // Read the generated file content if available
    let content: string | undefined;
    let judgeContent: string | undefined;
    if (outputFile) {
      // Output files are in data/ directory (e.g., data/ideas_output/ideas_2025-12-18_to_2025-12-31.judge.md)
      const fullPath = path.join(toolPath, '..', 'data', outputFile);
      logger.log(`[Generate] Looking for output file at: ${fullPath}`);
      try {
        content = await readFile(fullPath, "utf-8");
        judgeContent = content; // Judge file is the main output now
        logger.log(`[Generate] Successfully read output file (${content.length} chars)`);
      } catch (err) {
        logger.log(`[Generate] Could not read output file: ${fullPath}`, err);
        // Try interpreting outputFile as full path (Python may print full path)
        const fullPathMatch = result.stdout.match(/📄 Output: ([^\n]+)/);
        if (fullPathMatch) {
          const absolutePath = fullPathMatch[1].trim();
          try {
            content = await readFile(absolutePath, "utf-8");
            judgeContent = content;
            logger.log(`[Generate] Read from absolute path: ${absolutePath} (${content.length} chars)`);
          } catch (err2) {
            logger.log(`[Generate] Could not read absolute path either: ${absolutePath}`, err2);
          }
        }
      }
    } else {
      // Try to extract absolute path directly from "📄 Output:" line
      const fullPathMatch = result.stdout.match(/📄 Output: ([^\n]+)/);
      if (fullPathMatch) {
        const absolutePath = fullPathMatch[1].trim();
        logger.log(`[Generate] No regex match, trying absolute path: ${absolutePath}`);
        try {
          content = await readFile(absolutePath, "utf-8");
          judgeContent = content;
          logger.log(`[Generate] Read from absolute path: ${absolutePath} (${content.length} chars)`);
        } catch (err) {
          logger.log(`[Generate] Could not read absolute path: ${absolutePath}`, err);
        }
      }
    }

    // Parse stats from output
    const stats = parseStats(result.stdout);

    // Parse ranked items from content
    const items = content ? parseRankedItems(content, resolvedTool) : undefined;
    
    // Extract estimated cost
    const estimatedCost = content ? extractEstimatedCost(content, stats.itemsGenerated) : undefined;

    // Determine success: script ran successfully AND (content generated OR items harmonized to library)
    const hasContent = !!content && content.trim().length > 0;
    const hasItems = !!(items && items.length > 0);
    // v3: Harmonization success counts as success even if file was deleted
    const harmonizedItems = stats.harmonization?.itemsAdded ?? 0;
    const actuallySuccessful = !!(hasContent || hasItems || harmonizedItems > 0);
    
    logger.log(`[Generate] Success check: hasContent=${hasContent}, hasItems=${hasItems}, harmonizedItems=${harmonizedItems}, success=${actuallySuccessful}`);
    
    const response: GenerateResult = {
      success: actuallySuccessful, // Only true if content was actually generated
      tool: resolvedTool, // Return resolved tool for backward compatibility
      mode,
      outputFile, // Deprecated - kept for backward compatibility
      content,
      judgeContent,
      items, // v1: Ranked items
      estimatedCost, // Estimated LLM cost
      stats,
      timestamp: new Date().toISOString(),
    };
    
    // If no content generated, add helpful error message with context
    // Note: "conversations" here means individual Cursor chat sessions (not message count).
    // The count reflects RELEVANT conversations found via semantic search, not the total in the date range.
    if (!actuallySuccessful) {
      const conversationsCount = stats.conversationsAnalyzed ?? 0;
      const itemType = resolvedTool === "ideas" ? "ideas" : "insights";
      
      const harmonization = stats.harmonization;
      const itemsProcessed = harmonization?.itemsProcessed ?? 0;
      const itemsAdded = harmonization?.itemsAdded ?? 0;
      const itemsDeduplicated = harmonization?.itemsDeduplicated ?? 0;
      
      if (hasContent && !hasItems) {
        // Content exists but couldn't be parsed into items
        response.error = `The AI generated a response, but it couldn't be parsed into ${itemType}. ${conversationsCount} relevant chat sessions were analyzed. This sometimes happens when the conversations don't contain clear ${itemType}-worthy patterns. Try a different date range or adjust the temperature.`;
      } else if (itemsProcessed > 0 && itemsAdded === 0 && itemsDeduplicated > 0) {
        // All items were duplicates of existing library items
        response.error = `${itemsProcessed} ${itemType} ${itemsProcessed === 1 ? 'was' : 'were'} generated from ${conversationsCount} chat sessions, but all ${itemsDeduplicated} ${itemsDeduplicated === 1 ? 'was' : 'were'} duplicates of items already in your Library. This means you've already captured these ${itemType} in previous runs — great coverage!`;
      } else if (conversationsCount === 0) {
        // No conversations found - semantic search found nothing relevant
        response.error = `No relevant conversations found in the selected date range. The app uses semantic search to find chat sessions likely to contain ${itemType}, and none matched the search criteria. This could mean: (1) you didn't use Cursor during this period, (2) the chat history hasn't been synced yet, or (3) the conversations were routine work without ${itemType}-worthy patterns.`;
      } else {
        // Conversations found but LLM generated no items
        response.error = `${conversationsCount} relevant chat session${conversationsCount === 1 ? ' was' : 's were'} found via semantic search, but no ${itemType} were generated. This is not a bug — it means the AI analyzed the conversations but didn't find content worth extracting as ${itemType}. The conversations may have been routine work (debugging, configuration, etc.) without notable patterns. Try: (1) a different date range, (2) higher temperature for more creative extraction, or (3) check that your semantic search queries in Settings match the type of ${itemType} you're looking for.`;
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    logger.error("[Inspiration] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runPythonScript(
  cwd: string,
  script: string,
  args: string[],
  signal?: AbortSignal
): Promise<ScriptResult> {
  const pythonPath = getPythonPath();
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonPath, [script, ...args], {
      cwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
    });

    let stdout = "";
    let stderr = "";
    let isAborted = false;

    // Handle abort signal
    if (signal) {
      signal.addEventListener("abort", () => {
        isAborted = true;
        logger.log("[Inspiration] Request aborted, killing Python process...");
        try {
          proc.kill("SIGTERM");
          // Force kill after 2 seconds if still running
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill("SIGKILL");
            }
          }, 2000);
        } catch (err) {
          logger.error("[Inspiration] Error killing process:", err);
        }
        resolve({
          stdout,
          stderr,
          exitCode: 130, // SIGTERM exit code
        });
      });
    }

    proc.stdout.on("data", (data) => {
      if (!isAborted) {
        stdout += data.toString();
        logger.log(`[stdout] ${data.toString().trim()}`);
      }
    });

    proc.stderr.on("data", (data) => {
      if (!isAborted) {
        stderr += data.toString();
        logger.error(`[stderr] ${data.toString().trim()}`);
      }
    });

    proc.on("close", (code) => {
      if (!isAborted) {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      }
    });

    proc.on("error", (err) => {
      if (!isAborted) {
        reject(err);
      }
    });
  });
}

function parseStats(stdout: string): GenerateResult["stats"] {
  // Parse progress markers from stdout (structured format, more reliable than regex)
  // Falls back to regex parsing for backward compatibility
  
  // Extract stats from [STAT:key=value] markers
  const statMarkers: Record<string, number> = {};
  const statPattern = /\[STAT:(\w+)=([^\]]+)\]/g;
  let statMatch;
  while ((statMatch = statPattern.exec(stdout)) !== null) {
    const key = statMatch[1];
    const value = statMatch[2];
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      statMarkers[key] = numValue;
    }
  }
  
  // Extract harmonization stats from emit_integration_complete markers
  let harmonization: GenerateResult["stats"]["harmonization"] | undefined;
  const integrationCompletePattern = /\[STAT:itemsCompared=(\d+)\].*?\[STAT:itemsAdded=(\d+)\].*?\[STAT:itemsMerged=(\d+)\]/s;
  const integrationMatch = stdout.match(integrationCompletePattern);
  if (integrationMatch) {
    harmonization = {
      itemsProcessed: parseInt(integrationMatch[1]),
      itemsAdded: parseInt(integrationMatch[2]),
      itemsUpdated: parseInt(integrationMatch[3]),
      itemsDeduplicated: parseInt(integrationMatch[3]), // itemsMerged = itemsDeduplicated
    };
  }
  
  // Fallback to regex parsing if markers not found (backward compatibility)
  if (Object.keys(statMarkers).length === 0 && !harmonization) {
    // Parse summary section from output (legacy regex parsing)
    const daysProcessedMatch = stdout.match(/Days processed:\s*(\d+)/i);
    const daysWithActivityMatch = stdout.match(/Days with activity:\s*(\d+)/i);
    const daysWithOutputMatch = stdout.match(/Days with (?:ideas|posts):\s*(\d+)/i);
    
    const itemsGeneratedMatch = stdout.match(/Items generated:\s*(\d+)/i);
    const itemsAfterDedupMatch = stdout.match(/Items after dedup:\s*(\d+)/i);
    const itemsReturnedMatch = stdout.match(/Items returned:\s*(\d+)/i);
    
    const conversationsMatch = stdout.match(/Conversations analyzed:\s*(\d+)/i) || stdout.match(/(\d+)\s+conversations/i);
    
    const harmonizationMatch = stdout.match(/Harmonization Stats:\s*(\d+)\s+processed,\s*(\d+)\s+added,\s*(\d+)\s+updated,\s*(\d+)\s+deduplicated/i);
    
    const daysProcessed = daysProcessedMatch 
      ? parseInt(daysProcessedMatch[1]) 
      : (daysWithActivityMatch ? parseInt(daysWithActivityMatch[1]) : 0);
    
    return {
      daysProcessed,
      daysWithActivity: daysWithActivityMatch ? parseInt(daysWithActivityMatch[1]) : daysProcessed,
      daysWithOutput: daysWithOutputMatch ? parseInt(daysWithOutputMatch[1]) : 0,
      itemsGenerated: itemsGeneratedMatch ? parseInt(itemsGeneratedMatch[1]) : 0,
      itemsAfterDedup: itemsAfterDedupMatch ? parseInt(itemsAfterDedupMatch[1]) : (itemsGeneratedMatch ? parseInt(itemsGeneratedMatch[1]) : 0),
      itemsReturned: itemsReturnedMatch ? parseInt(itemsReturnedMatch[1]) : (itemsAfterDedupMatch ? parseInt(itemsAfterDedupMatch[1]) : (itemsGeneratedMatch ? parseInt(itemsGeneratedMatch[1]) : 0)),
      conversationsAnalyzed: conversationsMatch ? parseInt(conversationsMatch[1]) : 0,
      harmonization: harmonizationMatch ? {
        itemsProcessed: parseInt(harmonizationMatch[1]),
        itemsAdded: parseInt(harmonizationMatch[2]),
        itemsUpdated: parseInt(harmonizationMatch[3]),
        itemsDeduplicated: parseInt(harmonizationMatch[4]),
      } : undefined,
    };
  }
  
  // Use structured markers (preferred)
  return {
    daysProcessed: statMarkers.daysProcessed || statMarkers.daysWithActivity || 0,
    daysWithActivity: statMarkers.daysWithActivity || statMarkers.daysProcessed || 0,
    daysWithOutput: statMarkers.daysWithOutput || 0,
    itemsGenerated: statMarkers.itemsGenerated || 0,
    itemsAfterDedup: statMarkers.itemsAfterSelfDedup || statMarkers.itemsGenerated || 0,
    itemsReturned: statMarkers.sentToLibrary || statMarkers.itemsAfterSelfDedup || statMarkers.itemsGenerated || 0,
    conversationsAnalyzed: statMarkers.conversationsFound || 0,
    harmonization,
  };
}

