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
  if (errorLower.includes("no items found") || errorLower.includes("failed to parse")) {
    return {
      title: "No Content Generated",
      message: "The AI didn't produce parseable content for this date range. This can happen for days with minimal chat activity.",
      cta: {
        label: "Try Different Dates",
        action: "retry",
      },
      severity: "warning",
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

