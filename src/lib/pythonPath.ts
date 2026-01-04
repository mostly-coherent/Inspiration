/**
 * Python Path Resolution
 * 
 * Resolves the full path to python3, working around macOS PATH issues
 * where GUI apps don't inherit shell PATH.
 */

import { execSync } from "child_process";
import { existsSync } from "fs";

// Common Python installation paths on macOS
const PYTHON_PATHS = [
  "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3",
  "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3",
  "/Library/Frameworks/Python.framework/Versions/3.10/bin/python3",
  "/opt/homebrew/bin/python3",
  "/usr/local/bin/python3",
  "/usr/bin/python3",
];

let cachedPythonPath: string | null = null;

/**
 * Get the full path to python3
 * 
 * Tries multiple methods:
 * 1. Check common installation paths
 * 2. Use `which python3` via shell
 * 3. Fall back to "python3" (relies on PATH)
 */
export function getPythonPath(): string {
  if (cachedPythonPath) {
    return cachedPythonPath;
  }

  // Method 1: Check common paths
  for (const pythonPath of PYTHON_PATHS) {
    if (existsSync(pythonPath)) {
      cachedPythonPath = pythonPath;
      return pythonPath;
    }
  }

  // Method 2: Try `which python3` via shell
  try {
    const result = execSync("which python3", { encoding: "utf-8" }).trim();
    if (result && existsSync(result)) {
      cachedPythonPath = result;
      return result;
    }
  } catch {
    // which command failed, continue to fallback
  }

  // Method 3: Fall back to PATH-based resolution
  cachedPythonPath = "python3";
  return "python3";
}

