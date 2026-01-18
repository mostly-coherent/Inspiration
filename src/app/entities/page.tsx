"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isFeatureEnabled } from "@/lib/featureFlags";
import EntityExplorer from "@/components/EntityExplorer";
import EvolutionTimeline from "@/components/EvolutionTimeline";
import IntelligencePanel from "@/components/IntelligencePanel";

interface KGStats {
  totalEntities: number;
  totalMentions: number;
  byType: Record<string, number>;
  indexed: boolean;
}

type ViewTab = "entities" | "trends" | "intelligence";

export default function EntitiesPage() {
  const router = useRouter();
  const [stats, setStats] = useState<KGStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("entities");
  const isMountedRef = useRef(true);

  // Feature flag: Redirect to home if KG is disabled
  useEffect(() => {
    if (!isFeatureEnabled("KNOWLEDGE_GRAPH")) {
      router.push("/");
    }
  }, [router]);

  useEffect(() => {
    isMountedRef.current = true;
    async function fetchStats() {
      if (!isMountedRef.current) return;
      
      try {
        const res = await fetch("/api/kg/stats");
        if (!isMountedRef.current) return;

        if (!res.ok) {
          const errorText = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(`Failed to fetch stats: ${errorText.length > 100 ? res.status : errorText}`);
        }

        const data = await res.json().catch((parseError) => {
          throw new Error(`Invalid response format: ${parseError.message}`);
        });
        
        if (!isMountedRef.current) return;

        setStats(data);
        setError(null);
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error("Failed to fetch KG stats:", err);
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    }
    fetchStats();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                ← Back
              </Link>
              <h1 className="text-xl font-semibold text-slate-100">
                🔮 Knowledge Graph
              </h1>
            </div>

            <div className="flex items-center gap-4">
              {/* View Tabs */}
              <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg">
                <button
                  onClick={() => setViewTab("entities")}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    viewTab === "entities"
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  📋 Entities
                </button>
                <button
                  onClick={() => setViewTab("trends")}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    viewTab === "trends"
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  📈 Trends
                </button>
                <button
                  onClick={() => setViewTab("intelligence")}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    viewTab === "intelligence"
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🧠 Intelligence
                </button>
              </div>

              {/* Graph View Link */}
              <Link
                href="/graph"
                className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <span>🔮</span> Graph View
              </Link>

              {/* Stats */}
              {!loading && stats && (
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-slate-400">
                    <span className="text-slate-200 font-medium">
                      {stats.totalEntities}
                    </span>{" "}
                    entities
                  </div>
                  <div className="text-slate-400">
                    <span className="text-slate-200 font-medium">
                      {stats.totalMentions}
                    </span>{" "}
                    mentions
                  </div>
                  {Object.entries(stats.byType).slice(0, 4).map(([type, count]) => (
                    <div key={type} className="text-slate-500">
                      {type}: {count}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-[60vh] text-slate-400">
            Loading Knowledge Graph...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-semibold text-slate-200 mb-2">
              Failed to Load Stats
            </h2>
            <p className="text-red-400 max-w-md mb-6">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : !stats?.indexed ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center">
            <div className="text-6xl mb-4">🔮</div>
            <h2 className="text-2xl font-semibold text-slate-200 mb-2">
              Knowledge Graph Empty
            </h2>
            <p className="text-slate-400 max-w-md mb-6">
              Run the entity indexer to extract entities from your chat history
              and build your personal knowledge graph.
            </p>
            <div className="bg-slate-800/50 rounded-lg p-4 text-left font-mono text-sm text-slate-300">
              <div className="text-slate-500 mb-1"># Run from Inspiration folder:</div>
              <div>python3 engine/scripts/index_entities.py --limit 200</div>
            </div>
          </div>
        ) : viewTab === "trends" ? (
          <div className="h-[calc(100vh-140px)] bg-slate-900/30 rounded-xl border border-slate-800/50 p-6">
            <EvolutionTimeline
              initialMode="trending"
              onEntityClick={(entityId, entityName) => {
                console.log("Entity clicked:", entityId, entityName);
                setViewTab("entities");
                // Could also pass selected entity to EntityExplorer
              }}
            />
          </div>
        ) : viewTab === "intelligence" ? (
          <div className="h-[calc(100vh-140px)] bg-slate-900/30 rounded-xl border border-slate-800/50 p-6 overflow-y-auto">
            <IntelligencePanel
              onEntityClick={(entityId, entityName) => {
                console.log("Entity clicked:", entityId, entityName);
                setViewTab("entities");
                // Could also pass selected entity to EntityExplorer
              }}
            />
          </div>
        ) : (
          <div className="h-[calc(100vh-140px)]">
            <EntityExplorer />
          </div>
        )}
      </main>
    </div>
  );
}
