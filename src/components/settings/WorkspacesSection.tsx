"use client";

interface WorkspacesSectionProps {
  workspaces: string[];
  newWorkspace: string;
  setNewWorkspace: (value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

export function WorkspacesSection({
  workspaces,
  newWorkspace,
  setNewWorkspace,
  onAdd,
  onRemove,
}: WorkspacesSectionProps) {
  return (
    <div className="space-y-3">
      {workspaces.map((ws, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50"
        >
          <span className="flex-1 font-mono text-sm text-slate-300">{ws}</span>
          <button
            onClick={() => onRemove(i)}
            className="text-slate-500 hover:text-red-400 transition-colors"
            aria-label={`Remove workspace: ${ws}`}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          type="text"
          value={newWorkspace}
          onChange={(e) => setNewWorkspace(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder="/path/to/your/workspace"
          className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
        />
        <button
          onClick={onAdd}
          disabled={!newWorkspace.trim()}
          className="px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add
        </button>
      </div>
      {workspaces.length === 0 && (
        <p className="text-slate-500 text-sm">
          Add at least one workspace to get started. This is where Cursor stores your chat history.
        </p>
      )}
    </div>
  );
}
