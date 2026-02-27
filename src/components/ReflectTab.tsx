"use client";

/**
 * Reflect Tab (v6 — Socratic Mode)
 * 
 * Purpose: Generate probing questions that challenge the user's patterns,
 * surface blind spots, and prompt genuine self-reflection.
 * 
 * Merges Counter-Intuitive perspectives into a unified reflection experience.
 * 
 * Actions per question:
 * - [Sit With This] → Marks as resonated (tracks engagement)
 * - [Not Relevant] → Dismisses (excluded from future generations)
 * - [Explore] → Navigates to relevant section
 * 
 * Data Sources:
 * - Patterns (Library clusters)
 * - Unexplored (Memory gaps)
 * - Counter-Intuitive (opposing perspectives)
 * - Library stats (temporal/type distribution)
 * - Expert perspectives (Lenny KG)
 * - Temporal shifts
 */

import { useState, useEffect, useCallback } from "react";
import { BuilderAssessment } from "./BuilderAssessment";

interface SocraticQuestion {
  id: string;
  question: string;
  category: "pattern" | "gap" | "tension" | "temporal" | "expert" | "alignment";
  evidence: string;
  difficulty: "comfortable" | "uncomfortable" | "confrontational";
}

const CATEGORY_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  pattern: { icon: "🎨", label: "Pattern", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30" },
  gap: { icon: "🧭", label: "Gap", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  tension: { icon: "⚡", label: "Tension", color: "text-rose-400 bg-rose-500/10 border-rose-500/30" },
  temporal: { icon: "⏳", label: "Temporal", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
  expert: { icon: "🎙️", label: "Expert", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  alignment: { icon: "📐", label: "Alignment", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
};

const DIFFICULTY_CONFIG: Record<string, { icon: string; label: string; borderColor: string }> = {
  comfortable: { icon: "💭", label: "Think", borderColor: "border-l-slate-500" },
  uncomfortable: { icon: "⚡", label: "Challenge", borderColor: "border-l-amber-500" },
  confrontational: { icon: "🔥", label: "Confront", borderColor: "border-l-rose-500" },
};

export function ReflectTab() {
  const [questions, setQuestions] = useState<SocraticQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [resonatedIds, setResonatedIds] = useState<Set<string>>(new Set());

  const fetchQuestions = useCallback(async (force: boolean = false) => {
    try {
      if (force) {
        setIsRegenerating(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const res = await fetch(`/api/themes/socratic${force ? "?force=true" : ""}`);
      const data = await res.json();

      if (data.success && data.questions) {
        setQuestions(data.questions);
      } else if (data.error) {
        setError(data.error);
      } else {
        setQuestions([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load questions");
    } finally {
      setIsLoading(false);
      setIsRegenerating(false);
    }
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleDismiss = useCallback(async (questionId: string) => {
    try {
      await fetch("/api/themes/socratic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", questionId }),
      });
      setDismissedIds(prev => new Set([...prev, questionId]));
    } catch (e) {
      console.error("Failed to dismiss:", e);
    }
  }, []);

  const handleResonate = useCallback(async (questionId: string) => {
    try {
      await fetch("/api/themes/socratic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resonate", questionId }),
      });
      setResonatedIds(prev => new Set([...prev, questionId]));
    } catch (e) {
      console.error("Failed to mark resonated:", e);
    }
  }, []);

  // Filter out dismissed questions
  const visibleQuestions = questions.filter(q => !dismissedIds.has(q.id));

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <div className="animate-spin text-3xl mb-4">🪞</div>
        <p className="text-sm">Preparing your reflection questions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <button
            onClick={() => fetchQuestions(true)}
            className="px-4 py-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm font-medium transition-all"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (visibleQuestions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">🪞</div>
          <h3 className="text-lg font-semibold text-slate-200 mb-2">
            No Reflection Questions Yet
          </h3>
          <p className="text-sm text-slate-400 mb-6">
            Generate Library items and sync your Memory to unlock Socratic reflection.
            The more patterns you build, the deeper the questions get.
          </p>
          <button
            onClick={() => fetchQuestions(true)}
            className="px-4 py-2 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/30 text-sm font-medium transition-all"
          >
            Generate Questions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            🪞 Reflection Questions
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {visibleQuestions.length} questions based on your patterns, gaps, and expert perspectives
          </p>
        </div>
        <button
          onClick={() => fetchQuestions(true)}
          disabled={isRegenerating}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            isRegenerating
              ? "bg-amber-500/20 text-amber-300 animate-pulse cursor-wait"
              : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-600/50"
          }`}
        >
          <span className={isRegenerating ? "animate-spin" : ""}>
            {isRegenerating ? "⏳" : "🔄"}
          </span>
          {isRegenerating ? "Generating..." : "Ask harder questions"}
        </button>
      </div>

      {/* Question Cards */}
      {visibleQuestions.map((question) => {
        const category = CATEGORY_CONFIG[question.category] || CATEGORY_CONFIG.pattern;
        const difficulty = DIFFICULTY_CONFIG[question.difficulty] || DIFFICULTY_CONFIG.comfortable;
        const isResonated = resonatedIds.has(question.id);

        return (
          <div
            key={question.id}
            className={`relative bg-slate-900/80 border border-slate-700/50 rounded-xl p-5 
              border-l-4 ${difficulty.borderColor}
              transition-all duration-200 hover:border-slate-600/70
              ${isResonated ? "ring-1 ring-indigo-500/30" : ""}
            `}
          >
            {/* Category + Difficulty badges */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${category.color}`}>
                {category.icon} {category.label}
              </span>
              <span className="text-[10px] text-slate-500">
                {difficulty.icon} {difficulty.label}
              </span>
            </div>

            {/* Question */}
            <p className="text-slate-100 text-sm leading-relaxed font-medium mb-3">
              {question.question}
            </p>

            {/* Evidence */}
            <p className="text-xs text-slate-400 mb-4 italic">
              Based on: {question.evidence}
            </p>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleResonate(question.id)}
                disabled={isResonated}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isResonated
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                    : "bg-slate-800/50 text-slate-300 hover:bg-indigo-500/10 hover:text-indigo-300 border border-slate-600/50 hover:border-indigo-500/30"
                }`}
              >
                {isResonated ? "✓ Resonated" : "💭 Sit With This"}
              </button>
              <button
                onClick={() => handleDismiss(question.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium 
                  bg-slate-800/50 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 
                  border border-slate-700/50 transition-all"
              >
                Not Relevant
              </button>
            </div>
          </div>
        );
      })}

      {/* Footer */}
      <div className="text-center pt-4">
        <p className="text-[10px] text-slate-600">
          Questions generated from your Library patterns, Memory gaps, and expert perspectives.
          Cached for 24 hours. Click &quot;Ask harder questions&quot; to regenerate.
        </p>
      </div>

      {/* Builder Assessment — Deep weakness analysis */}
      <BuilderAssessment />
    </div>
  );
}
