"use client";

interface PowerFeaturesSectionProps {
  linkedInEnabled: boolean;
  setLinkedInEnabled: (value: boolean) => void;
  linkedInDirectory: string;
  setLinkedInDirectory: (value: string) => void;
  solvedStatusEnabled: boolean;
  setSolvedStatusEnabled: (value: boolean) => void;
  onUnsavedChange: () => void;
}

export function PowerFeaturesSection({
  linkedInEnabled,
  setLinkedInEnabled,
  linkedInDirectory,
  setLinkedInDirectory,
  solvedStatusEnabled,
  setSolvedStatusEnabled,
  onUnsavedChange,
}: PowerFeaturesSectionProps) {
  return (
    <div className="space-y-6">
      {/* Social Media Sync */}
      <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
        <label className="flex items-center gap-3 text-slate-200 cursor-pointer">
          <input
            id="social-sync-toggle"
            type="checkbox"
            checked={linkedInEnabled}
            onChange={(e) => {
              setLinkedInEnabled(e.target.checked);
              onUnsavedChange();
            }}
            className="w-4 h-4 rounded bg-slate-800 border-slate-700"
          />
          Social Media Sync
        </label>
        <p className="text-xs text-slate-500 mt-1 ml-7">
          Mark insights as &quot;shared&quot; when they match your social media posts
        </p>
        {linkedInEnabled && (
          <div className="mt-3 ml-7">
            <input
              type="text"
              value={linkedInDirectory}
              onChange={(e) => {
                setLinkedInDirectory(e.target.value);
                onUnsavedChange();
              }}
              placeholder="/path/to/social/posts"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        )}
      </div>

      {/* Solved Status Sync */}
      <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
        <label className="flex items-center gap-3 text-slate-200 cursor-pointer">
          <input
            id="solved-status-sync-toggle"
            type="checkbox"
            checked={solvedStatusEnabled}
            onChange={(e) => {
              setSolvedStatusEnabled(e.target.checked);
              onUnsavedChange();
            }}
            className="w-4 h-4 rounded bg-slate-800 border-slate-700"
          />
          Solved Status Sync
        </label>
        <p className="text-xs text-slate-500 mt-1 ml-7">
          Mark ideas as &quot;solved&quot; when they match projects in your workspaces
        </p>
      </div>
    </div>
  );
}
