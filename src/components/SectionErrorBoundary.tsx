"use client";

import React from "react";

interface SectionErrorBoundaryProps {
  children: React.ReactNode;
  sectionName: string;
  fallback?: React.ReactNode;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Granular error boundary for individual sections
 * Allows other sections to continue working if one fails
 */
export class SectionErrorBoundary extends React.Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (process.env.NODE_ENV === "development") {
      console.error(`[${this.props.sectionName}] Error caught by boundary:`, error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="glass-card p-6 border-red-500/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-red-400">⚠️</span>
            <h3 className="text-lg font-medium text-red-400">
              {this.props.sectionName} Error
            </h3>
          </div>
          <p className="text-adobe-gray-400 text-sm mb-4">
            {this.state.error?.message || "An unexpected error occurred in this section"}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: undefined });
              window.location.reload();
            }}
            className="btn-secondary text-sm"
            aria-label={`Retry ${this.props.sectionName}`}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

