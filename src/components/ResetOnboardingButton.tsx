"use client";

import { useState } from "react";
import { logger } from "@/lib/logger";

/**
 * Reset Onboarding Button Component
 * 
 * Allows users to reset onboarding state for testing purposes.
 * Only visible in development mode.
 */
export function ResetOnboardingButton() {
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message?: string;
    details?: string[];
  } | null>(null);

  const handleReset = async () => {
    if (!confirm("Reset onboarding state? This will clear:\n- Theme map cache\n- Onboarding tracking\n\nVector DB data will NOT be deleted.\n\nContinue?")) {
      return;
    }

    setResetting(true);
    setResult(null);

    try {
      logger.info("Resetting onboarding state", {
        component: "ResetOnboardingButton",
        action: "reset_onboarding",
      });

      const res = await fetch("/api/test/reset-onboarding", {
        method: "POST",
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setResult({
          success: true,
          message: data.message || "Onboarding state reset successfully",
          details: data.details,
        });

        logger.info("Onboarding state reset successful", {
          component: "ResetOnboardingButton",
          action: "reset_onboarding",
          details: data.details,
        });

        // Show success message
        alert("✅ Onboarding state reset!\n\n" + (data.details || []).join("\n"));
      } else {
        throw new Error(data.error || "Failed to reset onboarding state");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      const errorObj = error instanceof Error ? error : new Error(String(error));
      logger.error("Failed to reset onboarding state", errorObj, {
        component: "ResetOnboardingButton",
        action: "reset_onboarding",
        phase: "onboarding",
        recoverable: true,
      });

      setResult({
        success: false,
        message: errorMessage,
      });

      alert(`❌ Failed to reset onboarding state:\n\n${errorMessage}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-slate-200 font-medium mb-1">Reset Onboarding State</h4>
          <p className="text-xs text-slate-500">
            Clear theme map cache and onboarding tracking. Useful for testing onboarding flows.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={handleReset}
          disabled={resetting}
          className="w-full px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed border border-amber-500/30 rounded text-amber-400 text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {resetting ? (
            <>
              <span className="animate-spin">⟳</span>
              <span>Resetting...</span>
            </>
          ) : (
            <>
              <span>🔄</span>
              <span>Reset Onboarding State</span>
            </>
          )}
        </button>

        {result && (
          <div className={`p-3 rounded-lg border text-xs ${
            result.success
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}>
            <div className="font-medium mb-1">
              {result.success ? "✅ " : "❌ "}
              {result.message}
            </div>
            {result.details && result.details.length > 0 && (
              <ul className="mt-2 space-y-1 text-slate-400">
                {result.details.map((detail, idx) => (
                  <li key={idx} className="pl-2">• {detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="text-xs text-slate-500 pt-2 border-t border-slate-700/50">
          <strong className="text-slate-400">Note:</strong> This only clears cache and tracking. 
          Your Vector DB data, library items, and configuration remain intact.
        </div>
      </div>
    </div>
  );
}
