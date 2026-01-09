/**
 * User-Friendly Error Messages
 * 
 * Maps technical error messages to friendly explanations with actionable CTAs.
 */

export interface FriendlyError {
  title: string;
  message: string;
  cta?: {
    label: string;
    action: "retry" | "settings" | "external_link" | "harmonize";
    url?: string;
  };
  severity: "error" | "warning" | "info";
}

/**
 * Parse a raw error message and return user-friendly version
 */
export function getFriendlyError(rawError: string): FriendlyError {
  const errorLower = rawError.toLowerCase();
  
  // Credit/Payment Issues
  if (errorLower.includes("credit balance is too low") || errorLower.includes("402")) {
    if (errorLower.includes("anthropic")) {
      return {
        title: "Anthropic Credits Depleted",
        message: "Your Anthropic API account needs more credits to continue.",
        cta: {
          label: "Add Credits →",
          action: "external_link",
          url: "https://console.anthropic.com/settings/billing",
        },
        severity: "error",
      };
    }
    if (errorLower.includes("openrouter")) {
      return {
        title: "OpenRouter Credits Depleted",
        message: "Your OpenRouter account needs more credits to continue.",
        cta: {
          label: "Add Credits →",
          action: "external_link",
          url: "https://openrouter.ai/credits",
        },
        severity: "error",
      };
    }
    return {
      title: "API Credits Depleted",
      message: "One of your AI providers needs more credits.",
      cta: {
        label: "Check API Keys →",
        action: "settings",
      },
      severity: "error",
    };
  }
  
  // Rate Limits
  if (errorLower.includes("rate limit") || errorLower.includes("rate_limit")) {
    return {
      title: "Rate Limit Reached",
      message: "Too many requests. Wait a moment and try again.",
      cta: {
        label: "Retry",
        action: "retry",
      },
      severity: "warning",
    };
  }
  
  // Request Too Large
  if (errorLower.includes("request_too_large") || errorLower.includes("tokens exceeds")) {
    const tokensMatch = rawError.match(/~?([\d,]+)\s*tokens/);
    const tokens = tokensMatch ? tokensMatch[1] : "unknown";
    return {
      title: "Request Too Large",
      message: `Your request (~${tokens} tokens) exceeds model limits. Try a smaller date range.`,
      cta: {
        label: "Use Fewer Days",
        action: "retry",
      },
      severity: "error",
    };
  }
  
  // Models Exhausted
  if (errorLower.includes("models_exhausted") || errorLower.includes("both_providers_failed")) {
    return {
      title: "All AI Providers Failed",
      message: "Both primary and fallback providers failed. Check your API credits.",
      cta: {
        label: "Check Settings →",
        action: "settings",
      },
      severity: "error",
    };
  }
  
  // No API Key
  if (errorLower.includes("no llm provider available") || errorLower.includes("api key")) {
    return {
      title: "API Keys Not Configured",
      message: "Please add your API keys in Settings to use generation.",
      cta: {
        label: "Configure API Keys →",
        action: "settings",
      },
      severity: "error",
    };
  }
  
  // Vector DB Issues
  if (errorLower.includes("supabase") || errorLower.includes("vector db")) {
    return {
      title: "Database Connection Failed",
      message: "Cannot connect to the Vector Database. Check your Supabase configuration.",
      cta: {
        label: "Check Settings →",
        action: "settings",
      },
      severity: "error",
    };
  }
  
  // No Conversations Found
  if (errorLower.includes("no conversations") || errorLower.includes("no messages")) {
    return {
      title: "No Chat History Found",
      message: "No Cursor conversations found for the selected date range. Try different dates or sync your brain first.",
      cta: {
        label: "Retry",
        action: "retry",
      },
      severity: "warning",
    };
  }
  
  // Parsing Errors
  if (errorLower.includes("no items found") || errorLower.includes("failed to parse") || errorLower.includes("couldn't be parsed")) {
    return {
      title: "No Items Parsed",
      message: "The AI generated a response but it couldn't be parsed into structured items. Try a different date range or adjust the temperature.",
      cta: {
        label: "Try Different Dates",
        action: "retry",
      },
      severity: "warning",
    };
  }
  
  // No output generated (conversations found but no items)
  if (errorLower.includes("relevant chat session") && errorLower.includes("no") && (errorLower.includes("ideas") || errorLower.includes("insights"))) {
    // Extract conversation count from message
    const countMatch = errorLower.match(/(\d+)\s+relevant/);
    const count = countMatch ? countMatch[1] : "some";
    return {
      title: "No Items Generated",
      message: `${count} relevant conversations were analyzed, but no items were extracted. This is normal for routine work (debugging, configuration). Try a different date range or higher temperature.`,
      cta: {
        label: "Adjust Settings",
        action: "retry",
      },
      severity: "info",
    };
  }
  
  // All duplicates
  if (errorLower.includes("duplicates") && errorLower.includes("library")) {
    return {
      title: "All Items Already in Library",
      message: "Items were generated but they're all already in your Library. Great coverage! Try a different date range for new content.",
      cta: {
        label: "Try Different Dates",
        action: "retry",
      },
      severity: "info",
    };
  }
  
  // Sync/Harmonization Errors
  if (errorLower.includes("sync") || errorLower.includes("harmoniz")) {
    return {
      title: "Sync Issue",
      message: "There was a problem syncing your content. Your generated items may still be saved.",
      cta: {
        label: "Resume Harmonization",
        action: "harmonize",
      },
      severity: "warning",
    };
  }
  
  // Timeout
  if (errorLower.includes("timeout") || errorLower.includes("timed out")) {
    return {
      title: "Request Timed Out",
      message: "The request took too long. Try a smaller date range or retry.",
      cta: {
        label: "Retry",
        action: "retry",
      },
      severity: "warning",
    };
  }
  
  // Connection Errors
  if (errorLower.includes("network") || errorLower.includes("connection")) {
    return {
      title: "Connection Error",
      message: "Could not connect to the server. Check your internet connection and try again.",
      cta: {
        label: "Retry",
        action: "retry",
      },
      severity: "error",
    };
  }
  
  // OpenAI Embedding Errors (required for semantic search, deduplication, and sync)
  if (errorLower.includes("openai_api_key") && errorLower.includes("embedding")) {
    return {
      title: "Embeddings Not Configured",
      message: "OpenAI API key is required for semantic search, deduplication, and syncing your chat history. The app uses OpenAI embeddings to understand meaning and find similar content.",
      cta: {
        label: "Add OpenAI Key →",
        action: "settings",
      },
      severity: "error",
    };
  }
  
  // OpenAI Authentication Error
  if (errorLower.includes("openai") && (errorLower.includes("401") || errorLower.includes("authentication") || errorLower.includes("invalid_api_key"))) {
    return {
      title: "OpenAI Authentication Failed",
      message: "Your OpenAI API key is invalid or expired. Get a new key from the OpenAI dashboard.",
      cta: {
        label: "Get API Key →",
        action: "external_link",
        url: "https://platform.openai.com/account/api-keys",
      },
      severity: "error",
    };
  }
  
  // Anthropic Authentication Error
  if (errorLower.includes("anthropic") && (errorLower.includes("401") || errorLower.includes("authentication") || errorLower.includes("invalid"))) {
    return {
      title: "Anthropic Authentication Failed",
      message: "Your Anthropic API key is invalid or expired. Get a new key from the Anthropic console.",
      cta: {
        label: "Get API Key →",
        action: "external_link",
        url: "https://console.anthropic.com/settings/keys",
      },
      severity: "error",
    };
  }
  
  // Cloud Environment (can't access local Cursor DB)
  if (errorLower.includes("cloud environment") || errorLower.includes("cannot sync from cloud") || errorLower.includes("database not found")) {
    return {
      title: "Running in Cloud Mode",
      message: "The app is deployed to the cloud and cannot access your local Cursor database. To sync new conversations, run the app locally with 'npm run dev'.",
      cta: {
        label: "Learn More",
        action: "retry",
      },
      severity: "info",
    };
  }
  
  // Schema/Cursor Update Incompatibility
  if (errorLower.includes("schema") || errorLower.includes("extraction strategy") || errorLower.includes("extraction failed")) {
    return {
      title: "Cursor Database Changed",
      message: "Cursor has updated its internal database format and this version of Inspiration may not be compatible. Check for app updates or report an issue.",
      cta: {
        label: "Check GitHub →",
        action: "external_link",
        url: "https://github.com/mostly-coherent/Inspiration/issues",
      },
      severity: "error",
    };
  }
  
  // Seek (Use Case) - No matches for query
  if (errorLower.includes("no relevant conversations found for") && errorLower.includes("days")) {
    return {
      title: "No Matches Found",
      message: "No conversations matched your search query. The app uses semantic search to find related content. Try different keywords, broader phrasing, or a longer date range.",
      cta: {
        label: "Try Again",
        action: "retry",
      },
      severity: "info",
    };
  }
  
  // Script/Python Engine Errors
  if (errorLower.includes("script failed") || errorLower.includes("python") || errorLower.includes("traceback")) {
    return {
      title: "Engine Error",
      message: "The Python processing engine encountered an error. This is usually temporary — try again. If it persists, check that Python 3.10+ is installed.",
      cta: {
        label: "Retry",
        action: "retry",
      },
      severity: "error",
    };
  }
  
  // Invalid Date Range
  if (errorLower.includes("end date cannot be in the future") || errorLower.includes("start date must be before")) {
    return {
      title: "Invalid Date Range",
      message: "Please select a valid date range. The end date cannot be in the future, and the start date must be before the end date.",
      cta: {
        label: "Fix Dates",
        action: "retry",
      },
      severity: "warning",
    };
  }
  
  // Overloaded/Capacity Issues
  if (errorLower.includes("overloaded") || errorLower.includes("503") || errorLower.includes("capacity")) {
    return {
      title: "AI Provider Busy",
      message: "The AI service is currently overloaded. This is temporary — wait a moment and try again.",
      cta: {
        label: "Retry",
        action: "retry",
      },
      severity: "warning",
    };
  }
  
  // Default: show raw error but with retry option
  return {
    title: "Generation Failed",
    message: rawError.length > 200 ? rawError.substring(0, 200) + "..." : rawError,
    cta: {
      label: "Retry",
      action: "retry",
    },
    severity: "error",
  };
}

/**
 * Check if error indicates pending harmonization work
 */
export function hasPendingHarmonization(error: string): boolean {
  const errorLower = error.toLowerCase();
  return (
    errorLower.includes("harmoniz") ||
    errorLower.includes("sync operation failed") ||
    errorLower.includes("items are saved")
  );
}

