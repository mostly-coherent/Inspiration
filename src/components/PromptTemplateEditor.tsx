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
  const [resetting, setResetting] = useState(false);
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

  const resetToDefault = async () => {
    if (!selectedPrompt) return;

    const confirmed = window.confirm(
      `Reset "${selectedPrompt.label}" to original default? Your customizations will be lost.`
    );
    if (!confirmed) return;

    setResetting(true);
    setError(null);

    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedPrompt.id,
          action: "reset",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditedContent(data.defaultContent);
        setSelectedPrompt({ ...selectedPrompt, content: data.defaultContent });
        setHasChanges(false);
        setSuccessMessage("Prompt reset to original default");
        loadPrompts();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(data.error || "Failed to reset prompt");
      }
    } catch (err) {
      setError(`Failed to reset prompt: ${err}`);
    } finally {
      setResetting(false);
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

      {/* Introduction */}
      <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-xs text-slate-400">
        <strong className="text-amber-400">🎯 Job to be done:</strong> Customize the exact instructions the AI follows when generating content.
        Select a template below to view and edit it. Changes take effect immediately — no refresh needed.
      </div>

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
              <button
                onClick={resetToDefault}
                disabled={resetting}
                className="px-3 py-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                {resetting ? "Resetting..." : "Reset to Default"}
              </button>
              {hasChanges && (
                <button
                  onClick={resetPrompt}
                  className="px-3 py-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Discard Changes
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
              <strong>Available variables:</strong>{" "}
              <code className="text-amber-400">{"{item_count}"}</code> (how many items to generate),{" "}
              <code className="text-amber-400">{"{voice_profile}"}</code> (your writing style),{" "}
              <code className="text-amber-400">{"{conversations}"}</code> (source chat history).
              A backup is created before each save.
            </p>
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="p-4 bg-slate-800/20 rounded-lg border border-slate-700/30">
        <h4 className="text-sm font-medium text-slate-300 mb-2">🎯 Job to be done: Customize How AI Writes for You</h4>
        <p className="text-xs text-slate-400 mb-3">
          Prompts are the instructions the AI follows. Edit them to change the style, format, or focus of generated content.
          Every time Inspiration generates ideas, insights, or use cases, it uses these templates.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div className="p-2 bg-slate-700/20 rounded">
            <div className="text-xs font-medium text-blue-400">📋 Base Template</div>
            <div className="text-xs text-slate-500">Global rules for all modes. Add your writing style, constraints, or voice here.</div>
          </div>
          <div className="p-2 bg-slate-700/20 rounded">
            <div className="text-xs font-medium text-amber-400">💡 Ideas / 🧠 Insights</div>
            <div className="text-xs text-slate-500">Mode-specific prompts. Control format, detail level, or focus for each type.</div>
          </div>
          <div className="p-2 bg-slate-700/20 rounded">
            <div className="text-xs font-medium text-purple-400">🔍 Use Cases</div>
            <div className="text-xs text-slate-500">How Seek synthesizes evidence. Adjust to change synthesis depth or structure.</div>
          </div>
          <div className="p-2 bg-slate-700/20 rounded">
            <div className="text-xs font-medium text-emerald-400">⭐ Item Ranker</div>
            <div className="text-xs text-slate-500">How items are ranked. Adjust criteria if rankings feel off.</div>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          <strong>💡 Tips:</strong>
          <ul className="mt-1 space-y-1 pl-3">
            <li>• Changes take effect immediately — no refresh needed</li>
            <li>• A backup is created automatically before each save</li>
            <li>• Use variables like <code className="text-amber-400">{"{item_count}"}</code> and <code className="text-amber-400">{"{voice_profile}"}</code></li>
            <li>• If results feel off, try tweaking the prompt before changing other settings</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

