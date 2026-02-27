/**
 * Project Scanner — Reads PLAN.md, BUILD_LOG.md, README.md from sibling projects
 * in the workspace root to provide cross-project context for Socratic and Builder Assessment.
 *
 * Runs at generation time (no persistent storage). Reads files, extracts key signals:
 * - Project name and description
 * - Planned vs. completed items (from PLAN.md status tables)
 * - Last activity date (from BUILD_LOG.md headers)
 * - Stated next steps and priorities
 */

import { readFileSync, readdirSync, statSync, existsSync, openSync, readSync, closeSync } from "fs";
import { join, basename } from "path";

export interface ProjectSnapshot {
  name: string;
  description: string;
  plannedItems: string[];
  completedItems: string[];
  staleItems: string[];
  lastActivityDate: string | null;
  statedPriorities: string[];
  completionRate: number | null;
  daysSinceLastActivity: number | null;
}

export interface ProjectContext {
  projects: ProjectSnapshot[];
  scannedAt: string;
  workspaceRoot: string;
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".vercel", "dist", "build",
  "Production_Clones", ".cursor", "exports", "e2e-results",
]);

const SKIP_PREFIXES = [".", "_"];

function findWorkspaceRoot(): string | null {
  const cwd = process.cwd();
  const parent = join(cwd, "..");
  try {
    const entries = readdirSync(parent);
    const hasSiblingProjects = entries.some(
      (e) => e !== basename(cwd) && !e.startsWith(".") && statSync(join(parent, e)).isDirectory()
    );
    if (hasSiblingProjects) return parent;
  } catch {
    // Can't read parent — running in restricted env
  }
  return null;
}

function isProjectDir(dirPath: string): boolean {
  const hasPackageJson = existsSync(join(dirPath, "package.json"));
  const hasPlanMd = existsSync(join(dirPath, "PLAN.md"));
  const hasReadme = existsSync(join(dirPath, "README.md"));
  const hasClaudeMd = existsSync(join(dirPath, "CLAUDE.md"));
  return hasPackageJson || hasPlanMd || hasReadme || hasClaudeMd;
}

function readFileSafe(filePath: string, maxBytes: number = 50_000): string | null {
  try {
    if (!existsSync(filePath)) return null;
    const stat = statSync(filePath);
    if (stat.size > maxBytes) {
      const buf = Buffer.alloc(maxBytes);
      const fd = openSync(filePath, "r");
      readSync(fd, buf, 0, maxBytes, 0);
      closeSync(fd);
      return buf.toString("utf-8");
    }
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function extractStatusItems(markdown: string): {
  planned: string[];
  completed: string[];
  stale: string[];
} {
  const planned: string[] = [];
  const completed: string[] = [];
  const stale: string[] = [];

  const lines = markdown.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();

    // Match table rows with status indicators
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
      const statusCell = cells.find(
        (c) =>
          c.includes("✅") ||
          c.includes("Done") ||
          c.includes("Not Started") ||
          c.includes("Pending") ||
          c.includes("Building") ||
          c.includes("Planned") ||
          c.includes("🔧")
      );
      const featureCell = cells.find((c) => c.startsWith("**") || c.length > 20);

      if (statusCell && featureCell) {
        const cleanFeature = featureCell
          .replace(/\*\*/g, "")
          .replace(/~~.*?~~/g, "")
          .replace(/\s*—\s*.*/g, "")
          .trim();

        if (!cleanFeature || cleanFeature.startsWith("---")) continue;

        if (statusCell.includes("✅") || statusCell.includes("Done")) {
          completed.push(cleanFeature);
        } else if (
          statusCell.includes("Not Started") ||
          statusCell.includes("Pending") ||
          statusCell.includes("Planned")
        ) {
          planned.push(cleanFeature);
        } else if (statusCell.includes("Building") || statusCell.includes("🔧")) {
          planned.push(cleanFeature);
        }
      }
    }

    // Match checkbox items
    if (trimmed.startsWith("- [x]") || trimmed.startsWith("- [X]")) {
      completed.push(trimmed.replace(/^- \[[xX]\]\s*/, "").trim());
    } else if (trimmed.startsWith("- [ ]")) {
      planned.push(trimmed.replace(/^- \[ \]\s*/, "").trim());
    }
  }

  return { planned, completed, stale };
}

function extractLastActivityDate(buildLog: string): string | null {
  const datePattern = /## Progress - (\d{4}-\d{2}-\d{2})/g;
  let match: RegExpExecArray | null;
  let lastDate: string | null = null;

  while ((match = datePattern.exec(buildLog)) !== null) {
    const date = match[1];
    if (!lastDate || date > lastDate) {
      lastDate = date;
    }
  }

  return lastDate;
}

function extractPriorities(markdown: string): string[] {
  const priorities: string[] = [];
  const lines = markdown.split("\n");
  let inNextSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^#{1,3}\s*(Next|What.?s Next|Priorities|What to Build Next)/i.test(trimmed)) {
      inNextSection = true;
      continue;
    }

    if (inNextSection) {
      if (/^#{1,3}\s/.test(trimmed) && !/^#{1,3}\s*(Next|What.?s Next)/i.test(trimmed)) {
        inNextSection = false;
        continue;
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const item = trimmed.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim();
        if (item.length > 5 && item.length < 200) {
          priorities.push(item);
        }
      }
    }
  }

  return priorities.slice(0, 10);
}

function extractDescription(readme: string | null, plan: string | null): string {
  if (plan) {
    const visionMatch = plan.match(/>\s*\*\*Vision:\*\*\s*(.+)/);
    if (visionMatch) return visionMatch[1].trim();
  }
  if (readme) {
    const lines = readme.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 20 && !trimmed.startsWith("#") && !trimmed.startsWith(">") && !trimmed.startsWith("|")) {
        return trimmed.slice(0, 200);
      }
    }
  }
  return "";
}

function scanProject(dirPath: string): ProjectSnapshot | null {
  const name = basename(dirPath);
  const plan = readFileSafe(join(dirPath, "PLAN.md"));
  const buildLog = readFileSafe(join(dirPath, "BUILD_LOG.md"));
  const readme = readFileSafe(join(dirPath, "README.md"), 10_000);

  const description = extractDescription(readme, plan);

  let plannedItems: string[] = [];
  let completedItems: string[] = [];
  let staleItems: string[] = [];
  let statedPriorities: string[] = [];

  if (plan) {
    const statusItems = extractStatusItems(plan);
    plannedItems = statusItems.planned;
    completedItems = statusItems.completed;
    staleItems = statusItems.stale;
    statedPriorities = extractPriorities(plan);
  }

  let lastActivityDate: string | null = null;
  if (buildLog) {
    lastActivityDate = extractLastActivityDate(buildLog);
  }

  let daysSinceLastActivity: number | null = null;
  if (lastActivityDate) {
    const lastDate = new Date(lastActivityDate);
    const now = new Date();
    daysSinceLastActivity = Math.floor(
      (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  const totalItems = plannedItems.length + completedItems.length;
  const completionRate = totalItems > 0
    ? Math.round((completedItems.length / totalItems) * 100)
    : null;

  if (!description && plannedItems.length === 0 && completedItems.length === 0 && !lastActivityDate) {
    return null;
  }

  return {
    name,
    description,
    plannedItems,
    completedItems,
    staleItems,
    lastActivityDate,
    statedPriorities,
    completionRate,
    daysSinceLastActivity,
  };
}

/**
 * Scan all sibling projects in the workspace root for their documentation state.
 * Returns structured snapshots suitable for LLM consumption.
 */
export async function aggregateProjectContext(): Promise<ProjectContext | null> {
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    console.warn("[ProjectScanner] Could not determine workspace root");
    return null;
  }

  const projects: ProjectSnapshot[] = [];

  try {
    const entries = readdirSync(workspaceRoot);

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      if (SKIP_PREFIXES.some((p) => entry.startsWith(p))) continue;

      const dirPath = join(workspaceRoot, entry);
      try {
        if (!statSync(dirPath).isDirectory()) continue;
      } catch {
        continue;
      }

      if (!isProjectDir(dirPath)) continue;

      const snapshot = scanProject(dirPath);
      if (snapshot) {
        projects.push(snapshot);
      }
    }
  } catch (e) {
    console.error("[ProjectScanner] Failed to scan workspace:", e);
    return null;
  }

  if (projects.length === 0) return null;

  return {
    projects,
    scannedAt: new Date().toISOString(),
    workspaceRoot,
  };
}
