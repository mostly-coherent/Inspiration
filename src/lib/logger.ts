/**
 * Enhanced logger with structured logging and error tracking.
 * 
 * Features:
 * - Structured logging with context (component, action, metadata)
 * - Error tracking with stack traces and context
 * - Performance metrics (timing, cost tracking)
 * - Request ID correlation for tracing
 * - Development vs production modes
 */

const isDevelopment = process.env.NODE_ENV === "development";
const _isCloud = typeof window === "undefined" && (
  process.env.VERCEL || 
  process.env.RAILWAY_ENVIRONMENT || 
  process.env.RENDER
);

// Generate request ID for correlation
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get current request ID from context (if available)
let currentRequestId: string | null = null;

export function setRequestId(id: string | null) {
  currentRequestId = id;
}

export function getRequestId(): string | null {
  return currentRequestId;
}

interface LogContext {
  component?: string;
  action?: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

interface ErrorContext extends Omit<LogContext, 'error'> {
  error: Error | string;
  stack?: string;
  phase?: string; // e.g., "onboarding", "theme-generation", "indexing"
  userAction?: string; // What user was doing when error occurred
  recoverable?: boolean;
}

interface PerformanceMetric {
  operation: string;
  duration: number;
  unit: "ms" | "s";
  metadata?: Record<string, unknown>;
}

// Error tracking (can be extended to send to external service)
const errorLog: ErrorContext[] = [];
const MAX_ERROR_LOG_SIZE = 100;

function trackError(context: ErrorContext) {
  // Extract error separately to avoid conflicts
  const { error, ...restContext } = context;
  const errorEntry: ErrorContext = {
    ...restContext,
    error, // Explicitly set error property
    timestamp: new Date().toISOString(),
    requestId: context.requestId || currentRequestId || generateRequestId(),
  };

  errorLog.push(errorEntry);
  
  // Keep only recent errors
  if (errorLog.length > MAX_ERROR_LOG_SIZE) {
    errorLog.shift();
  }

  // In production, could send to error tracking service (Sentry, LogRocket, etc.)
  if (!isDevelopment && typeof window === "undefined") {
    // Server-side: Could send to error tracking service
    // Example: Sentry.captureException(errorEntry.error, { extra: errorEntry });
  }
}

export const logger = {
  /**
   * Standard log (development only)
   */
  log: (message: string, context?: LogContext) => {
    if (isDevelopment) {
      const logEntry = {
        level: "log",
        message,
        ...context,
        requestId: context?.requestId || currentRequestId,
        timestamp: new Date().toISOString(),
      };
      console.log("[LOG]", logEntry);
    }
  },

  /**
   * Error logging (always logged, tracked)
   */
  error: (message: string, err?: Error | string, context?: LogContext) => {
    const errorContext: ErrorContext = {
      ...context,
      error: err || message,
      stack: err instanceof Error ? err.stack : undefined,
      requestId: context?.requestId || currentRequestId || generateRequestId(),
    };

    // Always log errors
    const { error: _err, ...restContext } = errorContext;
    console.error("[ERROR]", {
      message,
      error: errorContext.error,
      stack: errorContext.stack,
      ...restContext,
      timestamp: new Date().toISOString(),
    });

    // Track error
    trackError(errorContext);
  },

  /**
   * Warning (development only)
   */
  warn: (message: string, context?: LogContext) => {
    if (isDevelopment) {
      const logEntry = {
        level: "warn",
        message,
        ...context,
        requestId: context?.requestId || currentRequestId,
        timestamp: new Date().toISOString(),
      };
      console.warn("[WARN]", logEntry);
    }
  },

  /**
   * Info logging (always logged)
   */
  info: (message: string, context?: LogContext) => {
    const logEntry = {
      level: "info",
      message,
      ...context,
      requestId: context?.requestId || currentRequestId,
      timestamp: new Date().toISOString(),
    };
    console.info("[INFO]", logEntry);
  },

  /**
   * Performance metric logging
   */
  performance: (metric: PerformanceMetric, context?: LogContext) => {
    const logEntry = {
      level: "performance",
      ...metric,
      ...context,
      requestId: context?.requestId || currentRequestId,
      timestamp: new Date().toISOString(),
    };

    if (isDevelopment) {
      console.log("[PERF]", logEntry);
    }

    // In production, could send to metrics service
    // Example: metrics.timing(metric.operation, metric.duration, metric.metadata);
  },

  /**
   * Get recent errors (for debugging)
   */
  getRecentErrors: (limit: number = 10): ErrorContext[] => {
    return errorLog.slice(-limit);
  },

  /**
   * Clear error log (for testing)
   */
  clearErrors: () => {
    errorLog.length = 0;
  },
};

