"use client";

import { useState, useEffect } from "react";

interface VectorDBConfig {
  provider: "supabase";
  url: string | null;
  anonKey: string | null;
  serviceRoleKey: string | null;
  initialized: boolean;
  lastSync: string | null;
}

interface ChatHistoryInfo {
  cursor: string | null;
  claudeCode: string | null;
  platform: "darwin" | "win32" | null;
  cursorExists: boolean;
  claudeCodeExists: boolean;
  isDetecting: boolean;
  onRefresh: () => void;
}

interface IndexingStatus {
  currentPercentage: number;
  indexedSizeMb: number;
  totalSizeMb: number;
  messageCount: number;
  totalMessages: number;
  dateRange: string;
  lastSyncDate: string;
}

interface VectorDBSectionProps {
  vectordb?: VectorDBConfig;
  chatHistory?: ChatHistoryInfo; // Made optional since it's now in a separate section
}

export function VectorDBSection({ vectordb, chatHistory: _chatHistory }: VectorDBSectionProps) {
  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus | null>(null);
  const [_loadingStatus, setLoadingStatus] = useState(false);
  const [showIndexMore, setShowIndexMore] = useState(false);

  // Fetch indexing status when component mounts or after indexing completes
  useEffect(() => {
    if (!vectordb?.initialized) return;
    
    let cancelled = false;
    
    const fetchStatus = async () => {
      setLoadingStatus(true);
      try {
        const res = await fetch("/api/vector-db/status");
        if (cancelled) return;
        
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          
          if (data.success && !cancelled) {
            setIndexingStatus(data);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch indexing status:", err);
        }
      } finally {
        if (!cancelled) {
          setLoadingStatus(false);
        }
      }
    };

    fetchStatus();
    
    return () => {
      cancelled = true;
    };
  }, [vectordb?.initialized]);

  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
        <h4 className="text-blue-400 font-medium mb-2">Why Vector DB?</h4>
        <p className="text-sm text-slate-400 mb-2">
          Vector DB enables fast semantic search across your entire chat history.
        </p>
        <p className="text-xs text-slate-500">
          💡 <strong>Setup:</strong> Create a free Supabase project, run the SQL script 
          (see link below), then enter your credentials here.
        </p>
      </div>

      {/* Indexing Status (NEW for v2.1) */}
      {vectordb?.initialized && indexingStatus && (
        <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-slate-200 font-medium">📊 Indexing Status</h4>
            {indexingStatus.currentPercentage < 100 && (
              <button
                onClick={() => setShowIndexMore(true)}
                className="text-xs px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 rounded text-indigo-400 transition-colors"
              >
                Index More History →
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500">Currently indexed:</span>
              <div className="text-white font-semibold">
                {indexingStatus.currentPercentage}% 
                <span className="text-slate-400 font-normal ml-1">
                  ({indexingStatus.indexedSizeMb}MB of {indexingStatus.totalSizeMb}MB)
                </span>
              </div>
            </div>

            <div>
              <span className="text-slate-500">Messages:</span>
              <div className="text-white font-semibold">
                {indexingStatus.messageCount.toLocaleString()}
                <span className="text-slate-400 font-normal ml-1">
                  of {indexingStatus.totalMessages.toLocaleString()}
                </span>
              </div>
            </div>

            <div>
              <span className="text-slate-500">Coverage:</span>
              <div className="text-white">{indexingStatus.dateRange}</div>
            </div>

            <div>
              <span className="text-slate-500">Last synced:</span>
              <div className="text-white">{indexingStatus.lastSyncDate}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="pt-2">
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                style={{ width: `${indexingStatus.currentPercentage}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Index More Modal */}
      {showIndexMore && indexingStatus && (
        <IndexMoreModal
          currentPercentage={indexingStatus.currentPercentage}
          totalSizeMb={indexingStatus.totalSizeMb}
          onClose={() => setShowIndexMore(false)}
          onComplete={() => {
            setShowIndexMore(false);
            // Refresh status
            fetch("/api/vector-db/status")
              .then(r => r.json())
              .then(data => {
                if (data.success) {
                  setIndexingStatus(data);
                }
              })
              .catch(err => {
                console.error("Failed to refresh indexing status:", err);
              });
          }}
        />
      )}

      {/* Supabase Credentials */}
      <SupabaseCredentialsSection vectordb={vectordb} />

      {/* Setup Instructions */}
      <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
        <h4 className="text-slate-200 font-medium mb-2">📋 Setup Instructions</h4>
        <ol className="text-sm text-slate-400 space-y-3 list-decimal list-inside">
          <li>
            Create a free Supabase project at{" "}
            <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              supabase.com
            </a>
            {" "}(sign up → New Project → choose a name and database password)
          </li>
          <li>
            <div className="mb-1.5">Run the SQL script in Supabase:</div>
            <div className="ml-4 space-y-2.5 text-xs text-slate-500">
              <div>
                <strong className="text-slate-400">Find the script:</strong> In your Inspiration project folder, open{" "}
                <code className="px-1.5 py-0.5 bg-slate-900 rounded text-xs text-amber-400 font-mono">
                  engine/scripts/init_vector_db.sql
                </code>
                {" "}(relative to the project root)
              </div>
              <div>
                <strong className="text-slate-400">In Supabase Dashboard:</strong>
                <ol className="ml-4 mt-1.5 space-y-1.5 list-decimal list-inside">
                  <li>Open your project dashboard (after creating the project)</li>
                  <li>In the left sidebar, click <span className="text-slate-300">&quot;SQL Editor&quot;</span></li>
                  <li>Click the <span className="text-slate-300">&quot;New query&quot;</span> button (top right)</li>
                  <li>Open <code className="px-1 py-0.5 bg-slate-900 rounded text-xs font-mono">init_vector_db.sql</code> in a text editor and copy <strong className="text-slate-300">all</strong> its contents</li>
                  <li>Paste the SQL into the Supabase query editor</li>
                  <li>Click <span className="text-slate-300">&quot;Run&quot;</span> (or press <kbd className="px-1 py-0.5 bg-slate-900 rounded text-xs">Cmd/Ctrl + Enter</kbd>)</li>
                  <li>You should see <span className="text-emerald-400">&quot;Success. No rows returned&quot;</span> — this is correct! The script creates tables and functions, so no data rows are returned.</li>
                </ol>
              </div>
            </div>
          </li>
          <li>
            Get your credentials:
            <ol className="ml-4 mt-1.5 space-y-1 text-xs text-slate-500 list-decimal list-inside">
              <li>In Supabase, go to <span className="text-slate-300">Project Settings</span> (gear icon in left sidebar)</li>
              <li>Click <span className="text-slate-300">&quot;API&quot;</span> in the settings menu</li>
              <li>Copy your <span className="text-slate-300">&quot;Project URL&quot;</span> (under Project URL section)</li>
              <li>Copy your <span className="text-slate-300">&quot;anon public&quot;</span> key (under Project API keys section)</li>
            </ol>
          </li>
          <li>
            Enter the credentials above:
            <ol className="ml-4 mt-1.5 space-y-1 text-xs text-slate-500 list-decimal list-inside">
              <li>Add them to your <code className="px-1 py-0.5 bg-slate-900 rounded text-xs font-mono">.env.local</code> file as <code className="px-1 py-0.5 bg-slate-900 rounded text-xs font-mono">SUPABASE_URL</code> and <code className="px-1 py-0.5 bg-slate-900 rounded text-xs font-mono">SUPABASE_ANON_KEY</code></li>
              <li>Restart your dev server if it&apos;s running</li>
              <li>Come back to this page and click <span className="text-slate-300">&quot;Test Connection&quot;</span></li>
            </ol>
          </li>
        </ol>
      </div>

      {/* Status */}
      {vectordb?.initialized && (
        <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
          <h4 className="text-emerald-400 font-medium mb-2">✓ Vector DB Configured</h4>
          <p className="text-sm text-slate-400">
            {vectordb.lastSync 
              ? `Last sync: ${new Date(vectordb.lastSync).toLocaleString()}`
              : "Ready to sync your chat history"}
          </p>
        </div>
      )}
    </div>
  );
}

// Supabase Credentials Sub-component
function SupabaseCredentialsSection({ vectordb }: { vectordb?: VectorDBConfig }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    details?: Record<string, unknown>;
  } | null>(null);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-supabase");
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Connection test failed: ${errorText.length > 100 ? res.status : errorText}`);
      }
      
      const data = await res.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (data && typeof data === 'object') {
        setTestResult(data);
      } else {
        setTestResult({
          success: false,
          error: "Invalid response structure",
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-slate-200 font-medium">🔐 Supabase Credentials</h4>
          <p className="text-xs text-slate-500 mt-1">
            Configured in <code className="px-1.5 py-0.5 bg-slate-900 rounded text-amber-400">.env.local</code>
          </p>
        </div>
        <button
          onClick={testConnection}
          disabled={testing || !vectordb?.url || !vectordb?.anonKey}
          className="text-xs px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          {testing ? (
            <>
              <span className="animate-spin">⟳</span>
              Testing...
            </>
          ) : (
            <>🔌 Test Connection</>
          )}
        </button>
      </div>
      
      <div className="space-y-2">
        {/* Supabase URL */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg">
          <span className="text-xs font-medium text-slate-500">SUPABASE_URL</span>
          {vectordb?.url ? (
            <span className="text-emerald-400 text-sm flex items-center gap-2">
              <span>✓</span>
              <span className="font-mono text-slate-400">•••••••••••••••</span>
            </span>
          ) : (
            <span className="text-amber-400 text-xs">Not set</span>
          )}
        </div>

        {/* Anon Key */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg">
          <span className="text-xs font-medium text-slate-500">SUPABASE_ANON_KEY</span>
          {vectordb?.anonKey ? (
            <span className="text-emerald-400 text-sm flex items-center gap-2">
              <span>✓</span>
              <span className="font-mono text-slate-400">•••••••••••••••</span>
            </span>
          ) : (
            <span className="text-amber-400 text-xs">Not set</span>
          )}
        </div>

        {/* Service Role Key (optional) */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg">
          <span className="text-xs font-medium text-slate-500">SUPABASE_SERVICE_ROLE_KEY</span>
          {vectordb?.serviceRoleKey ? (
            <span className="text-emerald-400 text-sm flex items-center gap-2">
              <span>✓</span>
              <span className="font-mono text-slate-400">•••••••••••••••</span>
            </span>
          ) : (
            <span className="text-slate-500 text-xs">Optional</span>
          )}
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`mt-3 p-3 rounded-lg border ${
          testResult.success 
            ? "bg-emerald-500/10 border-emerald-500/30" 
            : "bg-red-500/10 border-red-500/30"
        }`}>
          <p className={`text-sm ${testResult.success ? "text-emerald-400" : "text-red-400"}`}>
            {testResult.success ? "✓ " : "✗ "}
            {testResult.message || testResult.error}
          </p>
        </div>
      )}
    </div>
  );
}

// Index More Modal Component (NEW for v2.1)
interface IndexMoreModalProps {
  currentPercentage: number;
  totalSizeMb: number;
  onClose: () => void;
  onComplete: () => void;
}

function IndexMoreModal({ currentPercentage, totalSizeMb, onClose, onComplete }: IndexMoreModalProps) {
  const [targetPercentage, setTargetPercentage] = useState(Math.min(100, currentPercentage + 20));
  const [estimate, setEstimate] = useState<any>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [indexing, setIndexing] = useState(false);

  // Fetch estimate when percentage changes
  useEffect(() => {
    let cancelled = false;

    const fetchEstimate = async () => {
      setLoadingEstimate(true);
      try {
        const sizeMb = totalSizeMb * (targetPercentage / 100);
        const res = await fetch("/api/estimate-indexing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sizeMb }),
        });

        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();
          setEstimate(data);
        }
      } catch (err) {
        console.error("Failed to fetch estimate:", err);
      } finally {
        if (!cancelled) {
          setLoadingEstimate(false);
        }
      }
    };

    const timer = setTimeout(fetchEstimate, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [targetPercentage, totalSizeMb]);

  const handleIndexMore = async () => {
    setIndexing(true);

    try {
      const maxSizeMb = totalSizeMb * (targetPercentage / 100);
      
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "extend",
          targetPercentage,
          maxSizeMb,
        }),
      });

      if (!res.ok) {
        throw new Error("Indexing failed");
      }

      const data = await res.json();
      
      if (data.success) {
        // Show success toast (implementation depends on toast library)
        alert("Indexing started! Your Theme Map will update as more history is processed.");
        onComplete();
      } else {
        throw new Error(data.error || "Indexing failed");
      }
    } catch (err) {
      console.error("Index more failed:", err);
      alert("Failed to extend indexing. Please try again.");
    } finally {
      setIndexing(false);
    }
  };

  const additionalPercentage = targetPercentage - currentPercentage;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">Extend Indexing</h3>
          <button
            onClick={onClose}
            disabled={indexing}
            className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {/* Current Status */}
          <div className="p-3 bg-slate-800/50 rounded-lg text-sm">
            <div className="flex justify-between mb-2">
              <span className="text-slate-400">Currently indexed:</span>
              <span className="text-white font-semibold">{currentPercentage}%</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500"
                style={{ width: `${currentPercentage}%` }}
              />
            </div>
          </div>

          {/* Target Slider */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">
                Extend to:
              </label>
              <div className="text-3xl font-bold text-indigo-400">{targetPercentage}%</div>
            </div>

            <input
              type="range"
              min={currentPercentage + 5}
              max="100"
              step="5"
              value={targetPercentage}
              onChange={(e) => setTargetPercentage(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, rgb(16 185 129) 0%, rgb(16 185 129) ${currentPercentage}%, rgb(99 102 241) ${currentPercentage}%, rgb(99 102 241) ${targetPercentage}%, rgb(51 65 85) ${targetPercentage}%, rgb(51 65 85) 100%)`
              }}
            />

            <div className="text-xs text-slate-500 text-center">
              +{additionalPercentage}% additional indexing
            </div>
          </div>

          {/* Estimates */}
          {loadingEstimate ? (
            <div className="flex items-center justify-center gap-2 text-slate-400 py-4">
              <span className="animate-spin">⏳</span>
              <span>Calculating...</span>
            </div>
          ) : estimate && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">Additional Size</div>
                <div className="text-lg font-semibold text-white">
                  {(totalSizeMb * (additionalPercentage / 100)).toFixed(0)} MB
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">Est. Time</div>
                <div className="text-lg font-semibold text-white">
                  {estimate.timeMinutes} min
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">Est. Cost</div>
                <div className="text-lg font-semibold text-emerald-400">
                  ${estimate.costUsd.toFixed(2)}
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">Messages</div>
                <div className="text-lg font-semibold text-white">
                  +{(estimate.messages || 0).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-xs text-slate-300">
            <div className="flex items-start gap-2">
              <span>💡</span>
              <span>
                Indexing will happen in the background. Your Theme Map will automatically update as more history is processed.
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={indexing}
              className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleIndexMore}
              disabled={indexing || loadingEstimate}
              className="flex-[2] py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all"
            >
              {indexing ? "Indexing..." : `Index to ${targetPercentage}%`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
