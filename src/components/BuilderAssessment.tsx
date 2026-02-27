"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { BuilderWeakness } from "@/lib/socratic";

interface AssessmentData {
  id?: string;
  weaknesses: BuilderWeakness[];
  generatedAt: string;
  dataSourcesSummary: string;
  previousAssessmentId?: string;
  userResponses?: Record<string, string>;
  respondedAt?: string | null;
}

const SEVERITY_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  significant: { icon: "🔴", label: "Significant", color: "border-l-red-500 bg-red-500/5" },
  moderate: { icon: "🟡", label: "Moderate", color: "border-l-amber-500 bg-amber-500/5" },
  emerging: { icon: "🔵", label: "Emerging", color: "border-l-blue-500 bg-blue-500/5" },
};

export function BuilderAssessment() {
  const [assessment, setAssessment] = useState<AssessmentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStored, setIsLoadingStored] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [editingResponseId, setEditingResponseId] = useState<string | null>(null);
  const [savingResponses, setSavingResponses] = useState(false);
  const [responseSaveStatus, setResponseSaveStatus] = useState<string | null>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear status timeout on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    };
  }, []);

  // Load most recent stored assessment on mount
  useEffect(() => {
    let cancelled = false;
    const loadStored = async () => {
      try {
        const res = await fetch("/api/themes/builder-assessment?latest=true");
        if (cancelled) return;
        const data = await res.json();
        if (data.success && data.assessment) {
          setAssessment(data.assessment);
          if (data.assessment.userResponses) {
            setResponses(data.assessment.userResponses);
          }
        }
      } catch {
        // No stored assessment — that's fine
      } finally {
        if (!cancelled) setIsLoadingStored(false);
      }
    };
    loadStored();
    return () => { cancelled = true; };
  }, []);

  const runAssessment = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/themes/builder-assessment");
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "Assessment failed");
      }

      if (!data.assessment) {
        setError(data.message || "Not enough data to generate an assessment yet.");
        return;
      }

      setAssessment(data.assessment);
      setResponses({});
      setEditingResponseId(null);
      setResponseSaveStatus(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate assessment");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveResponses = useCallback(async () => {
    if (!assessment?.id) return;

    const nonEmptyResponses = Object.fromEntries(
      Object.entries(responses).filter(([, v]) => v.trim().length > 0)
    );

    if (Object.keys(nonEmptyResponses).length === 0) return;

    setSavingResponses(true);
    setResponseSaveStatus(null);

    try {
      const res = await fetch("/api/themes/builder-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId: assessment.id,
          responses: nonEmptyResponses,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResponseSaveStatus("saved");
        setEditingResponseId(null);
        if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = setTimeout(() => setResponseSaveStatus(null), 3000);
      } else {
        setResponseSaveStatus("error");
      }
    } catch {
      setResponseSaveStatus("error");
    } finally {
      setSavingResponses(false);
    }
  }, [assessment?.id, responses]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });

  // Initial loading of stored assessment
  if (isLoadingStored) {
    return null; // Don't show anything while checking for stored assessment
  }

  // Pre-assessment state (no stored assessment found)
  if (!assessment && !isLoading && !error) {
    return (
      <div className="mt-8 pt-8 border-t border-slate-700/50">
        <div className="max-w-2xl mx-auto text-center space-y-5">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-red-900/30 to-amber-900/30 border border-red-700/30">
            <span className="text-3xl">🪞</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-100">
              Builder Assessment
            </h3>
            <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
              Get a direct, evidence-backed analysis of your weaknesses and blind spots as a builder.
              Based on your Library patterns, project states, conversation history, and expert perspectives.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              This scans all your workspace projects and data. Takes 30-60 seconds.
            </p>
          </div>
          <button
            onClick={runAssessment}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-red-600/80 to-amber-600/80 hover:from-red-500/80 hover:to-amber-500/80 text-white font-medium text-sm shadow-lg shadow-red-900/20 transition-all hover:scale-105"
          >
            Run Builder Assessment
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="mt-8 pt-8 border-t border-slate-700/50">
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-4">
            <div className="relative">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-400"></div>
              <span className="absolute inset-0 flex items-center justify-center text-xl">🪞</span>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-300">Analyzing your work across all projects...</p>
              <p className="text-xs text-slate-500 mt-1">
                Scanning project docs, Library patterns, conversation history, and expert perspectives
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state (no assessment loaded)
  if (error && !assessment) {
    return (
      <div className="mt-8 pt-8 border-t border-slate-700/50">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <button
              onClick={runAssessment}
              className="px-4 py-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm font-medium transition-all"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!assessment) return null;

  const hasResponses = Object.values(responses).some((r) => r.trim().length > 0);
  const existingResponseCount = Object.values(assessment.userResponses || {}).filter((r) => r.trim().length > 0).length;

  return (
    <div className="mt-8 pt-8 border-t border-slate-700/50">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <span className="text-xl">🪞</span> Builder Assessment
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {formatDate(assessment.generatedAt)}
              {assessment.dataSourcesSummary && ` · ${assessment.dataSourcesSummary}`}
              {existingResponseCount > 0 && ` · ${existingResponseCount} response${existingResponseCount > 1 ? "s" : ""} recorded`}
            </p>
          </div>
          <button
            onClick={runAssessment}
            disabled={isLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isLoading
                ? "bg-slate-800/50 text-slate-500 cursor-wait"
                : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-600/50"
            }`}
          >
            {isLoading ? "⏳ Running..." : "🔄 Reassess"}
          </button>
        </div>

        {/* Previous assessment note */}
        {assessment.previousAssessmentId && (
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-4 py-2.5 text-xs text-indigo-300">
            This assessment was generated with awareness of your previous assessment and any responses you provided.
          </div>
        )}

        {/* Weakness Cards */}
        {assessment.weaknesses.map((weakness) => {
          const severity = SEVERITY_CONFIG[weakness.severity] || SEVERITY_CONFIG.moderate;
          const isExpanded = expandedId === weakness.id;
          const isEditingThis = editingResponseId === weakness.id;
          const existingResponse = (assessment.userResponses || {})[weakness.id];
          const draftResponse = responses[weakness.id] || "";

          return (
            <div
              key={weakness.id}
              className={`bg-slate-900/80 border border-slate-700/50 rounded-xl overflow-hidden border-l-4 ${severity.color} transition-all duration-200`}
            >
              {/* Clickable header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : weakness.id)}
                className="w-full text-left p-5 hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs">{severity.icon}</span>
                      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                        {severity.label}
                      </span>
                      {existingResponse && (
                        <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                          ✓ Responded
                        </span>
                      )}
                    </div>
                    <h4 className="text-base font-semibold text-slate-100">
                      {weakness.title}
                    </h4>
                    {!isExpanded && (
                      <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                        {weakness.evidence}
                      </p>
                    )}
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate-500 mt-1 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-5 pb-5 space-y-4">
                  <div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                      Evidence
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {weakness.evidence}
                    </p>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                      Why This Matters
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {weakness.whyItMatters}
                    </p>
                  </div>

                  <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                    <div className="text-xs font-medium text-indigo-400 uppercase tracking-wider mb-1.5">
                      Suggested Action
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed">
                      {weakness.suggestion}
                    </p>
                  </div>

                  {/* User Response Section */}
                  <div className="pt-3 border-t border-slate-700/30">
                    {existingResponse && !isEditingThis ? (
                      <div>
                        <div className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-1.5">
                          Your Response
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                          {existingResponse}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingResponseId(weakness.id);
                            setResponses((prev) => ({ ...prev, [weakness.id]: existingResponse }));
                          }}
                          className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          Edit response
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                          {existingResponse ? "Edit Your Response" : "Your Response"}
                        </div>
                        <p className="text-xs text-slate-500 mb-2">
                          Do you agree? What will you do about it? This feeds into your next assessment.
                        </p>
                        <textarea
                          value={draftResponse}
                          onChange={(e) => setResponses((prev) => ({ ...prev, [weakness.id]: e.target.value }))}
                          onFocus={() => setEditingResponseId(weakness.id)}
                          placeholder="I agree / disagree because... My plan is..."
                          rows={3}
                          className="w-full bg-slate-800/70 border border-slate-600/50 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 focus:outline-none resize-none"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Save Responses Button */}
        {assessment.id && hasResponses && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={saveResponses}
              disabled={savingResponses}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                savingResponses
                  ? "bg-slate-700/50 text-slate-400 cursor-wait"
                  : "bg-indigo-600/80 hover:bg-indigo-500/80 text-white shadow-lg shadow-indigo-900/20"
              }`}
            >
              {savingResponses ? "Saving..." : "Save Responses"}
            </button>
            {responseSaveStatus === "saved" && (
              <span className="text-xs text-emerald-400">✓ Saved — your next assessment will reference these.</span>
            )}
            {responseSaveStatus === "error" && (
              <span className="text-xs text-red-400">Failed to save. The builder_assessments table may not exist yet.</span>
            )}
          </div>
        )}

        {!assessment.id && (
          <div className="text-center pt-2">
            <p className="text-[10px] text-slate-600">
              Responses require the builder_assessments table in Supabase. Run migration 007_builder_assessments.sql to enable.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-2">
          <p className="text-[10px] text-slate-600">
            Assessment based on Library patterns, project states, conversation history, and expert perspectives.
            Each run is fresh — your data evolves, so will the assessment.
            {assessment.id && " Responses are stored and included in future assessments for longitudinal comparison."}
          </p>
        </div>
      </div>
    </div>
  );
}
