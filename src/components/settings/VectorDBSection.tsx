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
  path: string | null;
  platform: "darwin" | "win32" | null;
  exists: boolean;
  isDetecting: boolean;
  onRefresh: () => void;
}

interface VectorDBSectionProps {
  vectordb?: VectorDBConfig;
  chatHistory: ChatHistoryInfo;
}

export function VectorDBSection({ vectordb, chatHistory }: VectorDBSectionProps) {
  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
        <h4 className="text-blue-400 font-medium mb-2">Why Vector DB?</h4>
        <p className="text-sm text-slate-400 mb-2">
          Vector DB enables fast semantic search across your entire chat history, 
          even with 2GB+ of conversations. It&apos;s required for Inspiration v1.
        </p>
        <p className="text-xs text-slate-500">
          💡 <strong>Setup:</strong> Create a free Supabase project, run the SQL script 
          (see link below), then enter your credentials here.
        </p>
      </div>

      {/* Supabase Credentials */}
      <SupabaseCredentialsSection vectordb={vectordb} />

      {/* Chat History Auto-Detection */}
      <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
        <div className="flex items-start justify-between mb-2">
          <h4 className="text-slate-200 font-medium">📁 Chat History Location</h4>
          <button
            onClick={chatHistory.onRefresh}
            disabled={chatHistory.isDetecting}
            className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 disabled:opacity-50 transition-colors"
          >
            {chatHistory.isDetecting ? "Detecting..." : "Refresh"}
          </button>
        </div>
        {chatHistory.isDetecting ? (
          <p className="text-sm text-slate-500">Detecting chat history location...</p>
        ) : chatHistory.path ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {chatHistory.exists ? (
                <span className="text-emerald-400">✓</span>
              ) : (
                <span className="text-yellow-400">⚠</span>
              )}
              <code className="flex-1 px-2 py-1 bg-slate-900 rounded text-xs text-slate-300 break-all">
                {chatHistory.path}
              </code>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>Platform: {chatHistory.platform === "darwin" ? "macOS" : chatHistory.platform === "win32" ? "Windows" : "Unknown"}</span>
              {chatHistory.exists ? (
                <span className="text-emerald-400">File exists</span>
              ) : (
                <span className="text-yellow-400">File not found (Cursor may not be installed)</span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Click &quot;Refresh&quot; to auto-detect your Cursor chat history location.
          </p>
        )}
      </div>

      {/* Setup Instructions */}
      <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
        <h4 className="text-slate-200 font-medium mb-2">📋 Setup Instructions</h4>
        <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
          <li>Create a free Supabase project at <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">supabase.com</a></li>
          <li>Run the SQL script: <code className="px-1.5 py-0.5 bg-slate-900 rounded text-xs">engine/scripts/init_vector_db.sql</code></li>
          <li>Copy your Project URL and Anon Key from Project Settings → API</li>
          <li>Enter them above and click &quot;Test Connection&quot;</li>
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
      const data = await res.json();
      setTestResult(data);
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
