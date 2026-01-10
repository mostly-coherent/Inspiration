"use client";

import React from "react";
import Link from "next/link";
import { CoverageDashboard } from "@/components/CoverageDashboard";

export default function CoveragePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-slate-400 hover:text-slate-200">
              ← Back
            </Link>
            <h1 className="text-xl font-semibold text-slate-100">
              📊 Coverage Intelligence
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/themes"
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              Theme Explorer →
            </Link>
            <Link
              href="/settings"
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              ⚙️ Settings
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Description */}
        <div className="mb-8 bg-slate-800/30 rounded-xl p-6 border border-slate-700/50">
          <h2 className="text-lg font-medium text-slate-200 mb-2">
            Keep your Library in sync with your Memory
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Coverage Intelligence analyzes your Memory terrain (chat history density by week) 
            and compares it to your Library coverage. It identifies gaps—weeks where you had 
            many conversations but few or no Library items—and suggests generation runs to 
            fill those gaps. No more manual date range guessing.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              <span>High priority: Many conversations, no items</span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
              <span>Medium: Some coverage, could use more</span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              <span>Low: Minor gap, optional</span>
            </div>
          </div>
        </div>

        {/* Coverage Dashboard */}
        <CoverageDashboard />

        {/* Setup Instructions (if SQL not run) */}
        <div className="mt-8 bg-slate-800/30 rounded-xl p-6 border border-slate-700/50">
          <h3 className="text-md font-medium text-slate-300 mb-3">
            🛠 First-Time Setup
          </h3>
          <p className="text-slate-400 text-sm mb-3">
            If you see an error about missing functions, you need to run the coverage 
            SQL migration in Supabase:
          </p>
          <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
            <li>Go to your Supabase Dashboard → SQL Editor</li>
            <li>
              Open and run{" "}
              <code className="bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">
                engine/scripts/add_coverage_tables.sql
              </code>
            </li>
            <li>Refresh this page</li>
          </ol>
        </div>
      </main>
    </div>
  );
}
