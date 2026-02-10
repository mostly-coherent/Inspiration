"use client";

interface ChatHistoryInfo {
  cursor: string | null;
  claudeCode: string | null;
  platform: "darwin" | "win32" | null;
  cursorExists: boolean;
  claudeCodeExists: boolean;
  isDetecting: boolean;
  onRefresh: () => void;
}

interface ChatHistorySectionProps {
  chatHistory: ChatHistoryInfo;
}

export function ChatHistorySection({ chatHistory }: ChatHistorySectionProps) {
  return (
    <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-slate-200 font-medium">📁 Chat History Locations</h4>
        <button
          onClick={chatHistory.onRefresh}
          disabled={chatHistory.isDetecting}
          className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 disabled:opacity-50 transition-colors"
        >
          {chatHistory.isDetecting ? "Detecting..." : "Refresh"}
        </button>
      </div>
      {chatHistory.isDetecting ? (
        <p className="text-sm text-slate-500">Detecting chat history locations...</p>
      ) : (chatHistory.cursor || chatHistory.claudeCode) ? (
        <div className="space-y-4">
          {/* Cursor Location */}
          {chatHistory.cursor && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-300">Cursor:</span>
                {chatHistory.cursorExists ? (
                  <span className="text-emerald-400">✓</span>
                ) : (
                  <span className="text-yellow-400">⚠</span>
                )}
              </div>
              <code className="block px-2 py-1 bg-slate-900 rounded text-xs text-slate-300 break-all">
                {chatHistory.cursor}
              </code>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>Platform: {chatHistory.platform === "darwin" ? "macOS" : chatHistory.platform === "win32" ? "Windows" : "Unknown"}</span>
                {chatHistory.cursorExists ? (
                  <span className="text-emerald-400">File exists</span>
                ) : (
                  <span className="text-yellow-400">File not found (Cursor may not be installed)</span>
                )}
              </div>
            </div>
          )}
          
          {/* Claude Code Location */}
          {chatHistory.claudeCode && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-300">Claude:</span>
                {chatHistory.claudeCodeExists ? (
                  <span className="text-emerald-400">✓</span>
                ) : (
                  <span className="text-yellow-400">⚠</span>
                )}
              </div>
              <code className="block px-2 py-1 bg-slate-900 rounded text-xs text-slate-300 break-all">
                {chatHistory.claudeCode}
              </code>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>Platform: {chatHistory.platform === "darwin" ? "macOS" : chatHistory.platform === "win32" ? "Windows" : "Unknown"}</span>
                {chatHistory.claudeCodeExists ? (
                  <span className="text-emerald-400">Directory exists</span>
                ) : (
                  <span className="text-yellow-400">Directory not found (Claude may not be installed)</span>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Click &quot;Refresh&quot; to auto-detect your Cursor and Claude chat history locations.
        </p>
      )}
    </div>
  );
}
