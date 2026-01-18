"use client";

import { useState } from "react";

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

interface VectorDBSectionProps {
  vectordb?: VectorDBConfig;
  chatHistory?: ChatHistoryInfo; // Made optional since it's now in a separate section
}

export function VectorDBSection({ vectordb, chatHistory }: VectorDBSectionProps) {
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
