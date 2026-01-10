"use client";

interface VoiceStyleSectionProps {
  authorName: string;
  setAuthorName: (value: string) => void;
  authorContext: string;
  setAuthorContext: (value: string) => void;
  goldenExamplesDir: string;
  setGoldenExamplesDir: (value: string) => void;
  voiceGuideFile: string;
  setVoiceGuideFile: (value: string) => void;
  onSave: (field: "authorName" | "authorContext" | "goldenExamplesDir" | "voiceGuideFile", value: string) => void;
}

export function VoiceStyleSection({
  authorName,
  setAuthorName,
  authorContext,
  setAuthorContext,
  goldenExamplesDir,
  setGoldenExamplesDir,
  voiceGuideFile,
  setVoiceGuideFile,
  onSave,
}: VoiceStyleSectionProps) {
  return (
    <div className="space-y-6">
      {/* Author Info */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">
            Your Name
          </label>
          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            onBlur={() => onSave("authorName", authorName)}
            placeholder="e.g., JM"
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">
            Brief Context
          </label>
          <input
            type="text"
            value={authorContext}
            onChange={(e) => setAuthorContext(e.target.value)}
            onBlur={() => onSave("authorContext", authorContext)}
            placeholder="e.g., PM at a tech company who builds with AI"
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>
      </div>

      {/* Golden Examples */}
      <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
        <div className="flex items-start gap-3">
          <span className="text-2xl">📝</span>
          <div className="flex-1">
            <h4 className="text-slate-200 font-medium mb-1">Golden Examples Folder</h4>
            <p className="text-xs text-slate-500 mb-3">
              Point to a folder with your actual social media posts or writing samples. 
              The AI will study these to match your voice, style, and depth.
            </p>
            <input
              type="text"
              value={goldenExamplesDir}
              onChange={(e) => setGoldenExamplesDir(e.target.value)}
              onBlur={() => onSave("goldenExamplesDir", goldenExamplesDir)}
              placeholder="/path/to/your/social-posts"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
            <p className="text-xs text-slate-600 mt-2">
              Tip: Save your best 5-10 posts as .md files in this folder
            </p>
          </div>
        </div>
      </div>

      {/* Voice Guide (Optional) */}
      <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
        <div className="flex items-start gap-3">
          <span className="text-2xl">📋</span>
          <div className="flex-1">
            <h4 className="text-slate-200 font-medium mb-1">Voice Guide (Optional)</h4>
            <p className="text-xs text-slate-500 mb-3">
              A markdown file with explicit voice rules: words you use, words you avoid, 
              sentence style preferences, emoji usage, etc.
            </p>
            <input
              type="text"
              value={voiceGuideFile}
              onChange={(e) => setVoiceGuideFile(e.target.value)}
              onBlur={() => onSave("voiceGuideFile", voiceGuideFile)}
              placeholder="/path/to/voice-guide.md"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>
      </div>

      {/* Preview of what's configured */}
      {(authorName || goldenExamplesDir) && (
        <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
          <h4 className="text-emerald-400 font-medium mb-2">✓ Voice Profile Active</h4>
          <ul className="text-sm text-slate-400 space-y-1">
            {authorName && <li>• Author: {authorName}</li>}
            {authorContext && <li>• Context: {authorContext}</li>}
            {goldenExamplesDir && <li>• Examples: {goldenExamplesDir}</li>}
            {voiceGuideFile && <li>• Voice Guide: {voiceGuideFile}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
