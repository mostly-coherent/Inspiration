"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import GraphView from "@/components/GraphView";

function GraphPageContent() {
  const searchParams = useSearchParams();
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntityName, setSelectedEntityName] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  // Load selected entity from URL params
  useEffect(() => {
    isMountedRef.current = true;
    const entityIdParam = searchParams.get("entity");
    if (entityIdParam) {
      // Validate UUID format
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidPattern.test(entityIdParam)) {
        setSelectedEntityId(entityIdParam);
        // Fetch entity name
        fetch(`/api/kg/entities?search=${encodeURIComponent(entityIdParam)}`)
          .then(async (res) => {
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`);
            }
            return res.json().catch((parseError) => {
              throw new Error(`Invalid response format: ${parseError.message}`);
            });
          })
          .then((data) => {
            if (isMountedRef.current && data.entities?.[0]) {
              setSelectedEntityName(data.entities[0].name);
            }
          })
          .catch((err) => {
            if (isMountedRef.current) {
              console.error("Failed to fetch entity name:", err);
              // Fail silently - entity name fetch is optional
            }
          });
      }
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [searchParams]);

  const handleEntityClick = (entityId: string, entityName: string) => {
    setSelectedEntityId(entityId);
    setSelectedEntityName(entityName);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-slate-400 hover:text-white transition-colors"
              >
                ← Home
              </Link>
              <div className="h-6 w-px bg-slate-700" />
              <h1 className="text-xl font-semibold text-white flex items-center gap-2">
                <span>🔮</span>
                Knowledge Graph
                <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                  🚧 Experimental
                </span>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/entities"
                className="px-3 py-1.5 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                📋 Entity List
              </Link>
              <Link
                href="/themes"
                className="px-3 py-1.5 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                🎨 Theme Explorer
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Experimental Feature Banner */}
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-xl">🚧</span>
            <div className="text-sm">
              <p className="text-amber-200 font-medium mb-1">Experimental Feature</p>
              <p className="text-slate-400">
                The Knowledge Graph visualizes entities and relationships extracted from your conversations. This is an experimental feature — the graph structure and entity extraction are still being refined.
              </p>
            </div>
          </div>
        </div>

        {/* Selected Entity Info */}
        {selectedEntityName && (
          <div className="mb-4 flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-slate-400 text-sm">Selected:</span>
              <span className="text-white font-medium">{selectedEntityName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/entities?selected=${selectedEntityId}`}
                className="px-3 py-1 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-950/50 hover:bg-indigo-950 rounded transition-colors"
              >
                View Details →
              </Link>
              <button
                onClick={() => {
                  setSelectedEntityId(null);
                  setSelectedEntityName(null);
                }}
                className="px-3 py-1 text-xs text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Graph Container */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden w-full" style={{ height: "calc(100vh - 280px)", minHeight: 600 }}>
          <GraphView
            centerEntityId={selectedEntityId || undefined}
            onEntityClick={handleEntityClick}
          />
        </div>

        {/* Instructions */}
        <div className="mt-4 text-center text-sm text-slate-500">
          <p>
            Click on entities to select them • Drag to pan • Scroll to zoom •
            Hover for details
          </p>
        </div>
      </main>
    </div>
  );
}

export default function GraphPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    }>
      <GraphPageContent />
    </Suspense>
  );
}
