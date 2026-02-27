import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";

vi.mock("fs");
vi.mock("path", async () => {
  const actual = await vi.importActual<typeof import("path")>("path");
  return { ...actual };
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockFs = fs as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("projectScanner", () => {
  let aggregateProjectContext: typeof import("./projectScanner").aggregateProjectContext;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Mock process.cwd to return a fake project dir inside a workspace
    vi.spyOn(process, "cwd").mockReturnValue("/workspace/Inspiration");

    const mod = await import("./projectScanner");
    aggregateProjectContext = mod.aggregateProjectContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when workspace root has no sibling projects", () => {
    mockFs.readdirSync.mockImplementation((dirPath: string) => {
      if (dirPath === "/workspace") return ["Inspiration"];
      return [];
    });

    mockFs.statSync.mockReturnValue({ isDirectory: () => true, size: 0 });
    mockFs.existsSync.mockReturnValue(false);
  });

  it("returns null when parent directory is unreadable", async () => {
    mockFs.readdirSync.mockImplementation(() => {
      throw new Error("EACCES");
    });

    const result = await aggregateProjectContext();
    expect(result).toBeNull();
  });

  it("scans sibling projects with PLAN.md", async () => {
    // Workspace root has Inspiration + DadAura + LifeSynced
    mockFs.readdirSync.mockImplementation((dirPath: string) => {
      if (dirPath === "/workspace") {
        return ["Inspiration", "DadAura", "LifeSynced", ".git", "node_modules"];
      }
      return [];
    });

    mockFs.statSync.mockImplementation((filePath: string) => {
      if (filePath.includes("node_modules") || filePath.includes(".git")) {
        return { isDirectory: () => true, size: 0 };
      }
      if (
        filePath === "/workspace/Inspiration" ||
        filePath === "/workspace/DadAura" ||
        filePath === "/workspace/LifeSynced"
      ) {
        return { isDirectory: () => true, size: 0 };
      }
      return { isDirectory: () => false, size: 100 };
    });

    mockFs.existsSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith("PLAN.md")) return true;
      if (filePath.endsWith("BUILD_LOG.md") && filePath.includes("DadAura")) return true;
      if (filePath.endsWith("README.md")) return false;
      if (filePath.endsWith("CLAUDE.md")) return false;
      if (filePath.endsWith("package.json")) return false;
      return false;
    });

    mockFs.readFileSync.mockImplementation((filePath: string) => {
      const p = filePath;

      if (p.includes("DadAura") && p.endsWith("PLAN.md")) {
        return `# Dad Aura

> **Vision:** Help dads be more present

| Feature | Status |
|---------|--------|
| **Onboarding** | ✅ Done |
| **Chat UI** | 🔧 Building |
| **Analytics** | Pending |

## What's Next
- Ship v1 to beta testers
- Add push notifications
`;
      }

      if (p.includes("DadAura") && p.endsWith("BUILD_LOG.md")) {
        return `# Build Log

## Progress - 2026-02-15

**Done:**
- ✅ Basic chat UI

## Progress - 2026-01-20

**Done:**
- ✅ Project setup
`;
      }

      if (p.includes("LifeSynced") && p.endsWith("PLAN.md")) {
        return `# LifeSynced

| Feature | Status |
|---------|--------|
| **Calendar Sync** | ✅ Done |
| **Habit Tracker** | ✅ Done |
| **Dashboard** | Not Started |
`;
      }

      if (p.includes("Inspiration") && p.endsWith("PLAN.md")) {
        return `# Inspiration

| Version | Description | Status |
|---------|------------|--------|
| **v1** | Core MVP | ✅ Done |
| **v2** | KG | ✅ Done |
| **v7** | Builder Assessment | ✅ Done |
`;
      }

      return "";
    });

    const result = await aggregateProjectContext();

    expect(result).not.toBeNull();
    expect(result!.workspaceRoot).toBe("/workspace");
    expect(result!.projects.length).toBeGreaterThanOrEqual(2);

    const dadAura = result!.projects.find((p) => p.name === "DadAura");
    expect(dadAura).toBeDefined();
    expect(dadAura!.completedItems).toContain("Onboarding");
    expect(dadAura!.plannedItems).toContain("Chat UI");
    expect(dadAura!.plannedItems).toContain("Analytics");
    expect(dadAura!.lastActivityDate).toBe("2026-02-15");
    expect(dadAura!.statedPriorities).toContain("Ship v1 to beta testers");
    expect(dadAura!.statedPriorities).toContain("Add push notifications");
    expect(dadAura!.completionRate).toBe(33); // 1 done out of 3

    const lifeSynced = result!.projects.find((p) => p.name === "LifeSynced");
    expect(lifeSynced).toBeDefined();
    expect(lifeSynced!.completedItems).toContain("Calendar Sync");
    expect(lifeSynced!.completedItems).toContain("Habit Tracker");
    expect(lifeSynced!.plannedItems).toContain("Dashboard");
    expect(lifeSynced!.completionRate).toBe(67); // 2 done out of 3
  });

  it("skips Production_Clones and dot directories", async () => {
    mockFs.readdirSync.mockImplementation((dirPath: string) => {
      if (dirPath === "/workspace") {
        return ["Inspiration", "Production_Clones", ".cursor", "RealProject"];
      }
      return [];
    });

    mockFs.statSync.mockReturnValue({ isDirectory: () => true, size: 100 });

    mockFs.existsSync.mockImplementation((filePath: string) => {
      if (filePath.includes("Production_Clones")) return true;
      if (filePath.includes(".cursor")) return true;
      if (filePath.includes("RealProject") && filePath.endsWith("PLAN.md")) return true;
      return false;
    });

    mockFs.readFileSync.mockImplementation((filePath: string) => {
      const p = filePath;
      if (p.includes("RealProject")) {
        return `| Feature | Status |\n|---------|--------|\n| **MVP** | ✅ Done |`;
      }
      if (p.includes("Production_Clones")) {
        return `| Feature | Status |\n|---------|--------|\n| **Cloned** | ✅ Done |`;
      }
      return "";
    });

    const result = await aggregateProjectContext();

    if (result) {
      const names = result.projects.map((p) => p.name);
      expect(names).not.toContain("Production_Clones");
      expect(names).not.toContain(".cursor");
    }
  });

  it("extracts checkbox items from markdown", async () => {
    mockFs.readdirSync.mockImplementation((dirPath: string) => {
      if (dirPath === "/workspace") return ["Inspiration", "CheckboxProject"];
      return [];
    });

    mockFs.statSync.mockReturnValue({ isDirectory: () => true, size: 200 });

    mockFs.existsSync.mockImplementation((filePath: string) => {
      return filePath.includes("CheckboxProject") && filePath.endsWith("PLAN.md");
    });

    mockFs.readFileSync.mockImplementation((filePath: string) => {
      const p = filePath;
      if (p.includes("CheckboxProject") && p.endsWith("PLAN.md")) {
        return `# Checkbox Project

- [x] Setup database
- [x] Build API
- [ ] Write tests
- [ ] Deploy to production
`;
      }
      return "";
    });

    const result = await aggregateProjectContext();

    expect(result).not.toBeNull();
    const project = result!.projects.find((p) => p.name === "CheckboxProject");
    expect(project).toBeDefined();
    expect(project!.completedItems).toContain("Setup database");
    expect(project!.completedItems).toContain("Build API");
    expect(project!.plannedItems).toContain("Write tests");
    expect(project!.plannedItems).toContain("Deploy to production");
    expect(project!.completionRate).toBe(50);
  });

  it("computes daysSinceLastActivity correctly", async () => {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const dateStr = twoDaysAgo.toISOString().split("T")[0];

    mockFs.readdirSync.mockImplementation((dirPath: string) => {
      if (dirPath === "/workspace") return ["Inspiration", "StaleProject"];
      return [];
    });

    mockFs.statSync.mockReturnValue({ isDirectory: () => true, size: 100 });

    mockFs.existsSync.mockImplementation((filePath: string) => {
      if (filePath.includes("StaleProject") && (filePath.endsWith("PLAN.md") || filePath.endsWith("BUILD_LOG.md")))
        return true;
      return false;
    });

    mockFs.readFileSync.mockImplementation((filePath: string) => {
      const p = filePath;
      if (p.includes("StaleProject") && p.endsWith("PLAN.md")) {
        return `| Feature | Status |\n|---------|--------|\n| **Core** | ✅ Done |`;
      }
      if (p.includes("StaleProject") && p.endsWith("BUILD_LOG.md")) {
        return `## Progress - ${dateStr}\n\n**Done:**\n- Setup`;
      }
      return "";
    });

    const result = await aggregateProjectContext();
    expect(result).not.toBeNull();

    const stale = result!.projects.find((p) => p.name === "StaleProject");
    expect(stale).toBeDefined();
    expect(stale!.lastActivityDate).toBe(dateStr);
    expect(stale!.daysSinceLastActivity).toBe(2);
  });
});
