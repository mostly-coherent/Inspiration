"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

// ── Configuration ──────────────────────────────────────────────
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity
const WARNING_SECONDS = 60; // 60-second countdown before auto-logout
const THROTTLE_MS = 5_000; // Minimum 5s between activity resets
const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "click",
] as const;

export function SessionGuard() {
  const pathname = usePathname();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(WARNING_SECONDS);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastResetRef = useRef<number>(Date.now());
  const isLoginPage = pathname === "/login";

  // ── Logout handler ──────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout failed:", error);
      setIsLoggingOut(false);
    }
  }, []);

  // ── Clear all timers ────────────────────────────────────────
  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // ── Start idle timer ────────────────────────────────────────
  const startIdleTimer = useCallback(() => {
    clearTimers();

    idleTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setCountdown(WARNING_SECONDS);

      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearTimers();
            handleLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, IDLE_TIMEOUT_MS);
  }, [clearTimers, handleLogout]);

  // ── Reset on user activity ──────────────────────────────────
  const resetIdleTimer = useCallback(() => {
    setShowWarning(false);
    setCountdown(WARNING_SECONDS);
    startIdleTimer();
  }, [startIdleTimer]);

  // ── Attach activity listeners ───────────────────────────────
  useEffect(() => {
    if (isLoginPage) return;

    startIdleTimer();

    const onActivity = () => {
      const now = Date.now();
      if (now - lastResetRef.current > THROTTLE_MS) {
        lastResetRef.current = now;
        resetIdleTimer();
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    return () => {
      clearTimers();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [isLoginPage, startIdleTimer, resetIdleTimer, clearTimers]);

  if (isLoginPage) return null;

  return (
    <>
      {/* ── Sign Out button (fixed, top-right) ────────────── */}
      <button
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="fixed top-3 right-3 z-[60] flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-white/10 backdrop-blur-sm transition-all text-xs disabled:opacity-50"
        title="Sign Out"
        aria-label="Sign Out"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
          />
        </svg>
        <span className="hidden sm:inline">Sign Out</span>
      </button>

      {/* ── Idle warning modal ─────────────────────────────── */}
      {showWarning && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="idle-warning-title"
          aria-describedby="idle-warning-desc"
        >
          <div className="bg-white rounded-xl p-8 max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-center space-y-4">
              <div className="text-4xl">&#128564;</div>
              <h2
                id="idle-warning-title"
                className="text-xl font-bold text-gray-900"
              >
                Still there?
              </h2>
              <p id="idle-warning-desc" className="text-gray-500 text-sm">
                You&apos;ve been inactive for a while. You&apos;ll be signed out
                in{" "}
                <span className="text-red-500 font-mono font-bold text-lg">
                  {countdown}s
                </span>{" "}
                for security.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={resetIdleTimer}
                  className="flex-1 py-2.5 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  I&apos;m here
                </button>
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition disabled:opacity-50 focus:ring-2 focus:ring-gray-400 focus:outline-none"
                >
                  {isLoggingOut ? "Signing out..." : "Sign out"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
