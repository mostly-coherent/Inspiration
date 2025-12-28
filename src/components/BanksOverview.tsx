"use client";

import { useState, useEffect, memo } from "react";
import ReactMarkdown from "react-markdown";
import { copyToClipboard, downloadFile } from "@/lib/utils";

export const BanksOverview = memo(function BanksOverview() {
  const [ideaStats, setIdeaStats] = useState<{ total: number; unsolved: number; partial: number; solved: number } | null>(null);
  const [insightStats, setInsightStats] = useState<{ total: number; unshared: number; partial: number; shared: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedBank, setExpandedBank] = useState<"idea" | "insight" | null>(null);
  const [bankMarkdown, setBankMarkdown] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBankStats();
  }, []);

  const loadBankStats = async () => {
    setError(null);
    try {
      const [ideaRes, insightRes] = await Promise.all([
        fetch("/api/banks?type=idea"),
        fetch("/api/banks?type=insight"),
      ]);
      
      if (ideaRes.ok) {
        const data = await ideaRes.json();
        if (data.success && data.stats) {
          setIdeaStats(data.stats);
        } else if (!data.success) {
          setError(`Failed to load idea bank: ${data.error || "Unknown error"}`);
        }
      } else {
        setError(`Failed to load idea bank: HTTP ${ideaRes.status}`);
      }
      
      if (insightRes.ok) {
        const data = await insightRes.json();
        if (data.success && data.stats) {
          setInsightStats(data.stats);
        } else if (!data.success) {
          setError(`Failed to load insight bank: ${data.error || "Unknown error"}`);
        }
      } else {
        setError(`Failed to load insight bank: HTTP ${insightRes.status}`);
      }
    } catch (err) {
      setError(`Failed to load banks: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const loadBankContent = async (type: "idea" | "insight") => {
    if (expandedBank === type) {
      setExpandedBank(null);
      setBankMarkdown("");
      setError(null);
      return;
    }
    
    setError(null);
    try {
      const res = await fetch(`/api/banks?type=${type}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.markdown) {
          setBankMarkdown(data.markdown);
          setExpandedBank(type);
        } else {
          setError(`Failed to load ${type} bank content: ${data.error || "Unknown error"}`);
        }
      } else {
        setError(`Failed to load ${type} bank content: HTTP ${res.status}`);
      }
    } catch (err) {
      setError(`Failed to load ${type} bank content: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const downloadMarkdown = (type: "idea" | "insight", content: string) => {
    const filename = type === "idea" ? "IDEA_BANK.md" : "INSIGHT_BANK.md";
    downloadFile(content, filename);
  };

  if (loading) return null;
  if (!ideaStats && !insightStats && !error) return null;

  return (
    <section className="glass-card p-6 space-y-4 mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-adobe-gray-300 flex items-center gap-2">
          <span>🏦</span> Your Banks
        </h2>
        {error && (
          <button
            onClick={() => loadBankStats()}
            className="text-sm text-inspiration-ideas hover:text-inspiration-ideas/80 transition-colors"
            aria-label="Retry loading banks"
          >
            Retry
          </button>
        )}
      </div>
      
      {error && (
        <div className="p-3 bg-red-400/10 border border-red-400/30 rounded-lg text-sm text-red-400" role="alert">
          {error}
        </div>
      )}
      
      <div className="grid grid-cols-2 gap-4">
        {/* Idea Bank */}
        {ideaStats && ideaStats.total > 0 && (
          <button
            onClick={() => loadBankContent("idea")}
            aria-label={`Idea Bank: ${ideaStats.total} ideas, ${ideaStats.unsolved} unsolved, ${ideaStats.partial} partial, ${ideaStats.solved} solved. Click to ${expandedBank === "idea" ? "collapse" : "expand"}`}
            aria-expanded={expandedBank === "idea"}
            className={`p-4 rounded-xl border transition-all text-left ${
              expandedBank === "idea"
                ? "border-inspiration-ideas bg-inspiration-ideas/10"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl" aria-hidden="true">💡</span>
              <div>
                <h3 className="font-semibold">Idea Bank</h3>
                <p className="text-sm text-adobe-gray-400">{ideaStats.total} ideas</p>
              </div>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 bg-slate-700/50 rounded-full">
                🔲 {ideaStats.unsolved} unsolved
              </span>
              {ideaStats.partial > 0 && (
                <span className="px-2 py-1 bg-amber-500/20 rounded-full text-amber-400">
                  🔶 {ideaStats.partial}
                </span>
              )}
              {ideaStats.solved > 0 && (
                <span className="px-2 py-1 bg-emerald-500/20 rounded-full text-emerald-400">
                  ✅ {ideaStats.solved}
                </span>
              )}
            </div>
          </button>
        )}

        {/* Insight Bank */}
        {insightStats && insightStats.total > 0 && (
          <button
            onClick={() => loadBankContent("insight")}
            aria-label={`Insight Bank: ${insightStats.total} insights, ${insightStats.unshared} unshared, ${insightStats.partial} partial, ${insightStats.shared} shared. Click to ${expandedBank === "insight" ? "collapse" : "expand"}`}
            aria-expanded={expandedBank === "insight"}
            className={`p-4 rounded-xl border transition-all text-left ${
              expandedBank === "insight"
                ? "border-inspiration-insights bg-inspiration-insights/10"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl" aria-hidden="true">✨</span>
              <div>
                <h3 className="font-semibold">Insight Bank</h3>
                <p className="text-sm text-adobe-gray-400">{insightStats.total} insights</p>
              </div>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 bg-slate-700/50 rounded-full">
                📝 {insightStats.unshared} unshared
              </span>
              {insightStats.partial > 0 && (
                <span className="px-2 py-1 bg-amber-500/20 rounded-full text-amber-400">
                  📤 {insightStats.partial}
                </span>
              )}
              {insightStats.shared > 0 && (
                <span className="px-2 py-1 bg-emerald-500/20 rounded-full text-emerald-400">
                  ✅ {insightStats.shared}
                </span>
              )}
            </div>
          </button>
        )}
      </div>

      {/* Expanded Bank View */}
      {expandedBank && bankMarkdown && (
        <div className="mt-4">
          {/* Export Actions */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => downloadMarkdown(expandedBank, bankMarkdown)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              aria-label={`Download ${expandedBank} bank as markdown`}
            >
              <span aria-hidden="true">📥</span> Export .md
            </button>
            <button
              onClick={() => copyToClipboard(bankMarkdown)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              aria-label={`Copy ${expandedBank} bank to clipboard`}
            >
              <span aria-hidden="true">📋</span> Copy
            </button>
          </div>
          {/* Bank Content */}
          <div className="p-4 bg-black/30 rounded-xl border border-white/10 max-h-96 overflow-y-auto">
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{bankMarkdown}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </section>
  );
});

