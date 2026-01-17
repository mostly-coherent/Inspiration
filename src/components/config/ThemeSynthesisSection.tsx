"use client";

import { useState, useEffect, useRef } from "react";

// Default theme synthesis configuration (exported for compatibility)
export const DEFAULT_THEME_SYNTHESIS = {
  maxItemsToSynthesize: 15,
  maxTokens: 800,
  maxDescriptionLength: 200,
};

interface SynthesisPrompt {
  id: string;
  label: string;
  description: string;
  content: string;
  isDefault: boolean;
}

export function ThemeSynthesisSection() {
  const [prompts, setPrompts] = useState<SynthesisPrompt[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<SynthesisPrompt | null>(null);
  const [editedContent, setEditedContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const isMountedRef = useRef(true);

  // Load prompts
  useEffect(() => {
    isMountedRef.current = true;
    loadPrompts();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadPrompts = async () => {
    try {
      const res = await fetch("/api/synthesis-prompts");
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Failed to load prompts: ${errorText.length > 100 ? res.status : errorText}`);
      }
      
      const data = await res.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (data && typeof data === 'object' && data.success) {
        if (isMountedRef.current) {
          const promptsArray = Array.isArray(data.prompts) ? data.prompts : [];
          setPrompts(promptsArray);
          // Auto-select "all" prompt
          const allPrompt = promptsArray.find((p: SynthesisPrompt) => p.id === "all");
          if (allPrompt && !selectedPrompt) {
            setSelectedPrompt(allPrompt);
            setEditedContent(allPrompt.content);
          }
        }
      } else {
        if (isMountedRef.current) {
          setError((data && typeof data === 'object' && data.error) || "Failed to load prompts");
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(`Failed to load prompts: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const selectPrompt = (prompt: SynthesisPrompt) => {
    if (hasChanges) {
      const confirmed = window.confirm("You have unsaved changes. Discard them?");
      if (!confirmed) return;
    }
    setSelectedPrompt(prompt);
    setEditedContent(prompt.content);
    setHasChanges(false);
    setError(null);
    setSuccessMessage(null);
  };

  const handleContentChange = (content: string) => {
    setEditedContent(content);
    setHasChanges(content !== selectedPrompt?.content);
  };

  const savePrompt = async () => {
    if (!selectedPrompt) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/synthesis-prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedPrompt.id,
          content: editedContent,
        }),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        let errorData: any = {};
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // Not JSON, use text as error
        }
        throw new Error(
          (errorData && typeof errorData === 'object' && errorData.error) || errorText || "Failed to save prompt"
        );
      }
      
      const data = await res.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (data && typeof data === 'object' && data.success) {
        if (isMountedRef.current) {
          setSuccessMessage("Prompt saved! It takes effect on the next theme synthesis.");
          setHasChanges(false);
          // Refresh prompts to update isDefault status
          loadPrompts();
          setTimeout(() => setSuccessMessage(null), 3000);
        }
      } else {
        if (isMountedRef.current) {
          setError((data && typeof data === 'object' && data.error) || "Failed to save prompt");
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(`Failed to save prompt: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  };

  const resetToDefault = async () => {
    if (!selectedPrompt) return;

    const confirmed = window.confirm(
      `Reset "${selectedPrompt.label}" prompt to default? Your customizations will be lost.`
    );
    if (!confirmed) return;

    setResetting(true);
    setError(null);

    try {
      const res = await fetch("/api/synthesis-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedPrompt.id,
          action: "reset",
        }),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        let errorData: any = {};
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // Not JSON, use text as error
        }
        throw new Error(
          (errorData && typeof errorData === 'object' && errorData.error) || errorText || "Failed to reset prompt"
        );
      }
      
      const data = await res.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });
      
      if (data && typeof data === 'object' && data.success) {
        if (isMountedRef.current) {
          setEditedContent(data.defaultContent);
          setHasChanges(false);
          setSuccessMessage("Prompt reset to default");
          loadPrompts();
          setTimeout(() => setSuccessMessage(null), 3000);
        }
      } else {
        if (isMountedRef.current) {
          setError((data && typeof data === 'object' && data.error) || "Failed to reset prompt");
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(`Failed to reset prompt: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      if (isMountedRef.current) {
        setResetting(false);
      }
    }
  };

  const discardChanges = () => {
    if (selectedPrompt) {
      setEditedContent(selectedPrompt.content);
      setHasChanges(false);
    }
  };

  if (loading) {
    return (
      <div className="text-slate-400 p-4">Loading synthesis prompts...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Messages */}
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
      <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-xs text-slate-400">
        <strong className="text-indigo-400">✨ Theme Synthesis Prompts:</strong>{" "}
        Customize how AI synthesizes patterns when you click on a theme. Each item type (Ideas, Insights, Use Cases) can have its own prompt style.
          </div>

      {/* Prompt Tabs */}
      <div className="flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt.id}
            onClick={() => selectPrompt(prompt)}
            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              selectedPrompt?.id === prompt.id
                ? "border-indigo-500/50 bg-indigo-500/20 text-indigo-300"
                : "border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600 hover:text-slate-300"
            }`}
          >
            {prompt.id === "all" && "🎨 "}
            {prompt.id === "idea" && "💡 "}
            {prompt.id === "insight" && "✨ "}
            {prompt.id === "use_case" && "🔍 "}
            {prompt.label}
            {!prompt.isDefault && (
              <span className="ml-1 text-xs text-amber-400">●</span>
            )}
          </button>
        ))}
      </div>

      {/* Selected Prompt Editor */}
      {selectedPrompt && (
        <div className="border border-slate-700/50 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="p-3 bg-slate-800/50 border-b border-slate-700/50 flex items-center justify-between">
            <div>
              <h4 className="font-medium text-slate-200">
                {selectedPrompt.label}
                {hasChanges && <span className="text-amber-400 ml-2">*</span>}
              </h4>
              <p className="text-xs text-slate-500">{selectedPrompt.description}</p>
            </div>
            <div className="flex items-center gap-2">
              {!selectedPrompt.isDefault && (
                <button
                  onClick={resetToDefault}
                  disabled={resetting}
                  className="px-3 py-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {resetting ? "Resetting..." : "Reset to Default"}
                </button>
              )}
              {hasChanges && (
                <button
                  onClick={discardChanges}
                  className="px-3 py-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Discard
                </button>
              )}
              <button
                onClick={savePrompt}
                disabled={saving || !hasChanges}
                className="px-4 py-1 text-sm bg-indigo-500 text-white font-medium rounded hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {/* Editor */}
          <div className="relative">
            <textarea
              value={editedContent}
              onChange={(e) => handleContentChange(e.target.value)}
              className="w-full h-80 p-4 bg-slate-900 text-slate-200 font-mono text-sm resize-none focus:outline-none"
              placeholder="Enter synthesis prompt..."
              spellCheck={false}
            />
            <div className="absolute bottom-2 right-2 text-xs text-slate-600">
              {editedContent.length} chars
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 bg-slate-800/30 border-t border-slate-700/50 text-xs text-slate-500">
            <strong>Available in context:</strong>{" "}
            Theme name, list of item titles and descriptions. The prompt instructs Claude how to synthesize patterns.
          </div>
        </div>
      )}

      {/* Help */}
      <div className="p-4 bg-slate-800/20 rounded-lg border border-slate-700/30">
        <h4 className="text-sm font-medium text-slate-300 mb-2">💡 Tips</h4>
        <ul className="text-xs text-slate-400 space-y-1">
          <li>• <strong>All Items:</strong> Used when viewing general themes (all types mixed)</li>
          <li>• <strong>Ideas/Insights/Use Cases:</strong> Used when filtering Theme Explorer by type</li>
          <li>• Changes take effect immediately on the next theme click</li>
          <li>• <span className="text-amber-400">●</span> indicates customized prompt (not default)</li>
        </ul>
      </div>
    </div>
  );
}
