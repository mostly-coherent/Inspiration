/**
 * Run History Storage Utilities
 * 
 * Stores generation run history in localStorage.
 * Keeps last 100 runs (configurable).
 */

import { GenerateResult } from "./types";

const STORAGE_KEY = "inspiration_run_history";
const MAX_RUNS = 100; // Keep last 100 runs

export interface RunHistoryEntry {
  id: string;
  timestamp: string;
  result: GenerateResult;
}

/**
 * Save a run to history
 */
export function saveRunToHistory(result: GenerateResult): void {
  if (typeof window === "undefined") return;

  try {
    const history = getRunHistory();
    const entry: RunHistoryEntry = {
      id: `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      result,
    };

    // Add to beginning (most recent first)
    history.unshift(entry);

    // Keep only last MAX_RUNS runs
    if (history.length > MAX_RUNS) {
      history.splice(MAX_RUNS);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error("[RunHistory] Failed to save run:", error);
    // If storage is full, try to clear old entries
    try {
      const history = getRunHistory();
      // Keep only last 50 runs
      const trimmed = history.slice(0, 50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      // Retry saving
      trimmed.unshift({
        id: `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        result,
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (retryError) {
      console.error("[RunHistory] Failed to save even after cleanup:", retryError);
    }
  }
}

/**
 * Get all run history
 */
export function getRunHistory(): RunHistoryEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as RunHistoryEntry[];
  } catch (error) {
    console.error("[RunHistory] Failed to load history:", error);
    return [];
  }
}

/**
 * Get recent runs (last N)
 */
export function getRecentRuns(count: number = 10): RunHistoryEntry[] {
  const history = getRunHistory();
  return history.slice(0, count);
}

/**
 * Get run by ID
 */
export function getRunById(id: string): RunHistoryEntry | null {
  const history = getRunHistory();
  return history.find((entry) => entry.id === id) || null;
}

/**
 * Clear all run history
 */
export function clearRunHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("[RunHistory] Failed to clear history:", error);
  }
}

/**
 * Delete a specific run
 */
export function deleteRun(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const history = getRunHistory();
    const filtered = history.filter((entry) => entry.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("[RunHistory] Failed to delete run:", error);
  }
}

/**
 * Get storage size estimate (in bytes)
 */
export function getStorageSize(): number {
  if (typeof window === "undefined") return 0;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? new Blob([stored]).size : 0;
  } catch {
    return 0;
  }
}

