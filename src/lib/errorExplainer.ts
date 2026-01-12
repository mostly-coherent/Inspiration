/**
 * Error Explainer - Translates technical errors into layman-friendly messages
 * with actionable recommendations.
 */

export interface ErrorExplanation {
  phase: string;
  title: string;
  explanation: string;
  recommendation: string;
  canRetry: boolean;
  suggestSmallerRun: boolean;
}

/**
 * Classify and explain an error from the generation process
 */
export function explainError(rawError: string, context?: {
  daysProcessed?: number;
  conversationsAnalyzed?: number;
  itemsGenerated?: number;
  itemsAfterDedup?: number;
}): ErrorExplanation {
  const error = rawError.toLowerCase();
  
  // === SEARCH PHASE ERRORS ===
  
  if (error.includes("no_messages_found") || error.includes("no relevant conversations")) {
    return {
      phase: "Search",
      title: "No conversations found in date range",
      explanation: "The app searched your chat history for this date range but found nothing relevant. This could mean you didn't use Cursor during this period, or your chat history (Memory) hasn't been synced recently.",
      recommendation: "Try: (1) Click 'Sync Memory' to update your chat history, (2) Pick a different date range when you know you used Cursor actively, or (3) Check that your workspaces are properly configured in Settings.",
      canRetry: false,
      suggestSmallerRun: false,
    };
  }
  
  if (error.includes("semantic search failed") || error.includes("embedding") && error.includes("error")) {
    return {
      phase: "Search",
      title: "Search system error",
      explanation: "The semantic search that finds relevant conversations failed. This is usually a temporary connection issue with the AI embedding service.",
      recommendation: "Wait 30 seconds and retry. If it keeps failing, check your OpenAI API key in Settings (used for embeddings).",
      canRetry: true,
      suggestSmallerRun: false,
    };
  }
  
  if (error.includes("supabase") || error.includes("vector db") || error.includes("database")) {
    return {
      phase: "Search",
      title: "Database connection issue",
      explanation: "Could not connect to the Vector Database (Supabase) where your chat history is stored.",
      recommendation: "Check your internet connection. If it persists, verify your Supabase credentials in Settings → Vector DB.",
      canRetry: true,
      suggestSmallerRun: false,
    };
  }
  
  // === GENERATION PHASE ERRORS ===
  
  if (error.includes("rate limit") || error.includes("429") || error.includes("too many requests")) {
    return {
      phase: "Generation",
      title: "AI rate limit reached",
      explanation: "Too many requests were sent to the AI in a short time. This happens when running many generations back-to-back.",
      recommendation: "Wait 1-2 minutes before retrying. If you need to run multiple generations, space them out.",
      canRetry: true,
      suggestSmallerRun: false,
    };
  }
  
  if (error.includes("context length") || error.includes("max_tokens") || error.includes("token limit")) {
    return {
      phase: "Generation",
      title: "Too much data for AI to process",
      explanation: "The chat history for this date range is too large for the AI to analyze in one go. The AI has a limit on how much text it can read at once.",
      recommendation: "Try a smaller date range (e.g., 3-5 days instead of 8) or reduce the number of items requested. The app will automatically compress conversations, but very busy periods may still exceed limits.",
      canRetry: false,
      suggestSmallerRun: true,
    };
  }
  
  if (error.includes("anthropic") && (error.includes("key") || error.includes("auth") || error.includes("401"))) {
    return {
      phase: "Generation",
      title: "Anthropic API key issue",
      explanation: "The AI service (Anthropic Claude) rejected the request due to an authentication problem.",
      recommendation: "Check your Anthropic API key in Settings → LLM Configuration. Make sure it's valid and has available credits.",
      canRetry: false,
      suggestSmallerRun: false,
    };
  }
  
  if (error.includes("openai") && (error.includes("key") || error.includes("auth") || error.includes("401"))) {
    return {
      phase: "Generation",
      title: "OpenAI API key issue",
      explanation: "The OpenAI service (used for embeddings and ranking) rejected the request due to an authentication problem.",
      recommendation: "Check your OpenAI API key in Settings → LLM Configuration. Make sure it's valid and has available credits.",
      canRetry: false,
      suggestSmallerRun: false,
    };
  }
  
  if (error.includes("timeout") || error.includes("timed out")) {
    return {
      phase: "Generation",
      title: "Request timed out",
      explanation: "The AI took too long to respond. This usually happens with very large date ranges or when the AI service is overloaded.",
      recommendation: "Try again with a smaller date range (fewer days) or fewer items. Peak usage times may cause slowdowns.",
      canRetry: true,
      suggestSmallerRun: true,
    };
  }
  
  if (error.includes("failed to generate items") || error.includes("generation failed")) {
    return {
      phase: "Generation",
      title: "AI generation failed",
      explanation: "The AI attempted to generate items but encountered an internal error. This is rare and usually temporary.",
      recommendation: "Retry the same request. If it keeps failing, try reducing the temperature setting (makes AI more predictable) or try a different date range.",
      canRetry: true,
      suggestSmallerRun: false,
    };
  }
  
  // === PARSING PHASE ERRORS ===
  
  if (error.includes("parsing failed") || error.includes("could not be parsed") || error.includes("regex issue")) {
    return {
      phase: "Parsing",
      title: "Could not understand AI response",
      explanation: "The AI generated a response, but it wasn't in the expected format. This can happen when conversations don't contain clear patterns worth extracting, or when the AI responds in an unexpected way.",
      recommendation: "Try: (1) Increase temperature slightly (0.5-0.7) for more creative responses, (2) Try a different date range with richer conversations, or (3) Retry the same request (AI responses vary).",
      canRetry: true,
      suggestSmallerRun: false,
    };
  }
  
  if (error.includes("no items") && (error.includes("parsed") || error.includes("extracted"))) {
    // Check if items were generated but all got filtered
    if (context?.itemsGenerated && context.itemsGenerated > 0) {
      return {
        phase: "Parsing",
        title: "Items generated but couldn't be processed",
        explanation: `The AI generated ${context.itemsGenerated} items, but they couldn't be properly formatted for your Library. This sometimes happens when conversations are mostly routine work (debugging, configuration) without notable patterns.`,
        recommendation: "Try a different date range when you had more exploratory or creative work. Higher temperature (0.6-0.8) may also help extract more creative insights.",
        canRetry: true,
        suggestSmallerRun: false,
      };
    }
    return {
      phase: "Parsing",
      title: "No extractable content found",
      explanation: "The AI analyzed your conversations but didn't find anything worth extracting. The conversations may have been routine work without notable insights or ideas.",
      recommendation: "Try a different date range. The best sources are days when you explored new technologies, solved tricky problems, or had 'aha moments.'",
      canRetry: false,
      suggestSmallerRun: false,
    };
  }
  
  // === HARMONIZATION PHASE ERRORS ===
  
  if (error.includes("write_failed") || error.includes("could not save")) {
    return {
      phase: "Library Integration",
      title: "Failed to save to Library",
      explanation: "The items were generated successfully, but couldn't be saved to your Library. This is usually a disk or permission issue.",
      recommendation: "Check that the app has permission to write to its data folder. If running locally, check disk space. If this persists, restart the app.",
      canRetry: true,
      suggestSmallerRun: false,
    };
  }
  
  if (error.includes("harmonization failed") || error.includes("bank") && error.includes("error")) {
    return {
      phase: "Library Integration",
      title: "Failed to add items to Library",
      explanation: "Items were generated but couldn't be integrated into your Library. The deduplication or categorization step failed.",
      recommendation: "Retry the request. If it keeps failing, try with fewer items (5-10 instead of 15-20) to reduce complexity.",
      canRetry: true,
      suggestSmallerRun: true,
    };
  }
  
  // === DEDUPLICATION PHASE ERRORS ===
  
  if (error.includes("all") && error.includes("duplicate")) {
    return {
      phase: "Library Integration",
      title: "All items were duplicates",
      explanation: "Every item generated was too similar to something already in your Library. This is actually good news — it means you've already captured these patterns!",
      recommendation: "Try a different date range that you haven't processed yet, or use 'Explore Coverage' to find gaps in your Library.",
      canRetry: false,
      suggestSmallerRun: false,
    };
  }
  
  // === NETWORK ERRORS ===
  
  if (error.includes("network") || error.includes("econnrefused") || error.includes("fetch failed")) {
    return {
      phase: "Connection",
      title: "Network connection error",
      explanation: "Could not connect to the required services. This is usually an internet connection issue.",
      recommendation: "Check your internet connection and retry. If you're behind a VPN or firewall, ensure the AI services (api.anthropic.com, api.openai.com) are accessible.",
      canRetry: true,
      suggestSmallerRun: false,
    };
  }
  
  // === SCRIPT/SYSTEM ERRORS ===
  
  if (error.includes("exit code") || error.includes("script failed")) {
    // Extract exit code if present
    const exitCodeMatch = error.match(/exit\s*(?:code)?:?\s*(\d+)/i);
    const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1]) : null;
    
    if (exitCode === 130) {
      return {
        phase: "Cancelled",
        title: "Generation was stopped",
        explanation: "You stopped the generation before it completed.",
        recommendation: "Start a new generation when you're ready. Partial results may have been saved to your Library.",
        canRetry: true,
        suggestSmallerRun: false,
      };
    }
    
    return {
      phase: "System",
      title: "Generation script crashed",
      explanation: "The generation process encountered an unexpected error and stopped. The detailed error log has been recorded.",
      recommendation: "Retry the request. If it keeps failing, try a smaller date range or fewer items. Check the browser console for detailed error logs.",
      canRetry: true,
      suggestSmallerRun: true,
    };
  }
  
  // === DEFAULT / UNKNOWN ===
  
  return {
    phase: "Unknown",
    title: "Something went wrong",
    explanation: "An unexpected error occurred during generation. The error details may provide more information.",
    recommendation: "Try retrying the request. If it persists, try a smaller date range or fewer items. Check Settings to verify your API keys are valid.",
    canRetry: true,
    suggestSmallerRun: true,
  };
}

/**
 * Format an error explanation for display
 */
export function formatErrorForDisplay(explanation: ErrorExplanation): string {
  const parts = [
    `**${explanation.title}**`,
    "",
    explanation.explanation,
    "",
    `**What to do:** ${explanation.recommendation}`,
  ];
  
  return parts.join("\n");
}
