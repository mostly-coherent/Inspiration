"use client";

import { useState, useEffect } from "react";

interface PromptInfo {
  id: string;
  file: string;
  label: string;
  description: string;
  exists: boolean;
  size: number;
  lastModified: string | null;
}

interface PromptWithContent extends PromptInfo {
  content: string;
}

export function PromptTemplateEditor() {
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptWithContent | null>(null);
  const [editedContent, setEditedContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load prompts list
  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    try {
      const res = await fetch("/api/prompts");
      const data = await res.json();
      if (data.success) {
        setPrompts(data.prompts);
      } else {
        setError(data.error || "Failed to load prompts");
      }
    } catch (err) {
      setError(`Failed to load prompts: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const loadPromptContent = async (id: string) => {
    setLoadingContent(true);
    setError(null);
    try {
      const res = await fetch(`/api/prompts?id=${id}`);
      const data = await res.json();
      if (data.success) {
        setSelectedPrompt(data.prompt);
        setEditedContent(data.prompt.content);
        setHasChanges(false);
      } else {
        setError(data.error || "Failed to load prompt content");
      }
    } catch (err) {
      setError(`Failed to load prompt: ${err}`);
    } finally {
      setLoadingContent(false);
    }
  };

  const savePrompt = async () => {
    if (!selectedPrompt) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedPrompt.id,
          content: editedContent,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Prompt saved successfully! A backup was created.");
        setHasChanges(false);
        // Refresh prompts list to update lastModified
        loadPrompts();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(data.error || "Failed to save prompt");
      }
    } catch (err) {
      setError(`Failed to save prompt: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const resetPrompt = () => {
    if (selectedPrompt) {
      setEditedContent(selectedPrompt.content);
      setHasChanges(false);
    }
  };

  const handleContentChange = (content: string) => {
    setEditedContent(content);
    setHasChanges(content !== selectedPrompt?.content);
  };

  if (loading) {
    return (
      <div className="text-slate-400 p-4">Loading prompt templates...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error/Success Messages */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400">
          {successMessage}
        </div>
      )}

      {/* Prompt Selector */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt.id}
            onClick={() => loadPromptContent(prompt.id)}
            className={`p-3 rounded-lg border text-left transition-colors ${
              selectedPrompt?.id === prompt.id
                ? "border-amber-500/50 bg-amber-500/10"
                : "border-slate-700/50 bg-slate-800/30 hover:border-slate-600"
            }`}
          >
            <div className="font-medium text-sm text-slate-200">{prompt.label}</div>
            <div className="text-xs text-slate-500 mt-1">{prompt.description}</div>
            {prompt.lastModified && (
              <div className="text-xs text-slate-600 mt-2">
                {new Date(prompt.lastModified).toLocaleDateString()}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Prompt Editor */}
      {selectedPrompt && (
        <div className="border border-slate-700/50 rounded-lg overflow-hidden">
          {/* Editor Header */}
          <div className="p-3 bg-slate-800/50 border-b border-slate-700/50 flex items-center justify-between">
            <div>
              <h4 className="font-medium text-slate-200">
                {selectedPrompt.label}
                {hasChanges && <span className="text-amber-400 ml-2">*</span>}
              </h4>
              <p className="text-xs text-slate-500">{selectedPrompt.file}</p>
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <button
                  onClick={resetPrompt}
                  className="px-3 py-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Reset
                </button>
              )}
              <button
                onClick={savePrompt}
                disabled={saving || !hasChanges}
                className="px-4 py-1 text-sm bg-amber-500 text-slate-900 font-medium rounded hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {/* Editor Content */}
          {loadingContent ? (
            <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : (
            <div className="relative">
              <textarea
                value={editedContent}
                onChange={(e) => handleContentChange(e.target.value)}
                className="w-full h-96 p-4 bg-slate-900 text-slate-200 font-mono text-sm resize-none focus:outline-none"
                placeholder="Prompt template content..."
                spellCheck={false}
              />
              <div className="absolute bottom-2 right-2 text-xs text-slate-600">
                {editedContent.length} chars
              </div>
            </div>
          )}

          {/* Editor Footer */}
          <div className="p-3 bg-slate-800/30 border-t border-slate-700/50 text-xs text-slate-500">
            <p>
              <strong>Tip:</strong> Use <code className="text-amber-400">{"{item_count}"}</code> for
              item count, <code className="text-amber-400">{"{voice_profile}"}</code> for voice
              settings. Changes create a backup before saving.
            </p>
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="p-4 bg-slate-800/20 rounded-lg border border-slate-700/30">
        <h4 className="text-sm font-medium text-slate-300 mb-2">📝 About Prompt Templates</h4>
        <ul className="text-xs text-slate-500 space-y-1">
          <li>• <strong>Base Template:</strong> Common rules applied to all modes</li>
          <li>• <strong>Ideas/Insights:</strong> Mode-specific generation prompts</li>
          <li>• <strong>Use Cases:</strong> Seek mode synthesis prompt</li>
          <li>• <strong>Judge:</strong> Ranking/filtering prompt for generated items</li>
          <li>• Changes are saved immediately; a backup is created automatically</li>
        </ul>
      </div>
    </div>
  );
}

