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

/**
 * Check Python version and return version info
 * 
 * @returns Object with version info or null if Python not found
 */
export function checkPythonVersion(): { version: string; major: number; minor: number; meetsRequirement: boolean } | null {
  try {
    const pythonPath = getPythonPath();
    const versionOutput = execSync(`${pythonPath} --version`, { encoding: "utf-8" }).trim();
    
    // Parse version string like "Python 3.9.5" or "Python 3.10.0"
    const match = versionOutput.match(/Python (\d+)\.(\d+)\.(\d+)/);
    if (!match) {
      return null;
    }
    
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const patch = parseInt(match[3], 10);
    const version = `${major}.${minor}.${patch}`;
    
    // Requirement: Python 3.10+
    const meetsRequirement = major > 3 || (major === 3 && minor >= 10);
    
    return { version, major, minor, meetsRequirement };
  } catch {
    return null;
  }
}
