"use client";

import { useState, useEffect } from "react";
import { Mode, ThemeType, ModeType } from "@/lib/types";
import { getModeAsync } from "@/lib/themes";

interface ModeSettingsEditorProps {
  theme: ThemeType;
  mode: ModeType;
  onSave?: () => void;
}

export function ModeSettingsEditor({ theme, mode, onSave }: ModeSettingsEditorProps) {
  const [modeData, setModeData] = useState<Mode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [goldenExamplesFolder, setGoldenExamplesFolder] = useState("");
  const [temperature, setTemperature] = useState<number | null>(null);
  const [minSimilarity, setMinSimilarity] = useState<number | null>(null);
  const [deduplicationThreshold, setDeduplicationThreshold] = useState<number | null>(null);
  const [semanticSearchQueries, setSemanticSearchQueries] = useState<string[]>([]);

  useEffect(() => {
    loadMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, mode]); // loadMode is stable, only re-run when theme/mode changes

  const loadMode = async () => {
    setLoading(true);
    try {
      const modeData = await getModeAsync(theme, mode);
      if (modeData) {
        setModeData(modeData);
        setGoldenExamplesFolder(modeData.settings.goldenExamplesFolder || "");
        setTemperature(modeData.settings.temperature);
        setMinSimilarity(modeData.settings.minSimilarity);
        setDeduplicationThreshold(modeData.settings.deduplicationThreshold ?? 0.85);
        setSemanticSearchQueries(modeData.settings.semanticSearchQueries || []);
      }
    } catch (error) {
      console.error("Failed to load mode:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!modeData) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      const updates = {
        settings: {
          ...modeData.settings,
          goldenExamplesFolder: goldenExamplesFolder || null,
          temperature: temperature,
          minSimilarity: minSimilarity,
          deduplicationThreshold: deduplicationThreshold,
          semanticSearchQueries: semanticSearchQueries.length > 0 ? semanticSearchQueries : null,
        },
      };

      const response = await fetch("/api/modes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeId: theme,
          modeId: mode,
          updates,
        }),
      });

      if (response.ok) {
        setSuccess("Settings saved successfully!");
        setTimeout(() => setSuccess(null), 3000);
        await loadMode();
        onSave?.();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to save settings");
      }
    } catch (error) {
      console.error("Failed to save mode settings:", error);
      setError("Failed to save mode settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-adobe-gray-400">Loading mode settings...</div>;
  }

  if (!modeData) {
    return <div className="text-adobe-gray-400">Mode not found</div>;
  }

  return (
    <div className="space-y-4">
      {/* Error/Success Messages */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400">
          {success}
        </div>
      )}
      
      <div>
        <h3 className="text-sm font-medium text-adobe-gray-300 mb-2">
          {modeData.name} Settings
        </h3>
        <p className="text-xs text-adobe-gray-400 mb-4">{modeData.description}</p>
      </div>

      {/* Temperature (for generation modes) */}
      {modeData.settings.temperature !== null && (
        <div>
          <label className="block text-sm text-adobe-gray-400 mb-1">
            Temperature (Mode-Specific Override)
          </label>
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={temperature ?? ""}
            onChange={(e) =>
              setTemperature(e.target.value ? parseFloat(e.target.value) : null)
            }
            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
          />
          <p className="text-xs text-adobe-gray-500 mt-1">
            Controls creativity for this specific mode. Low (0.2-0.3) = focused, predictable. High (0.7+) = creative, varied.
            <br />
            <span className="text-amber-500/70">⚠️ Use 1 decimal precision (0.1, 0.5, 0.7).</span> Leave blank to use global default.
          </p>
        </div>
      )}

      {/* Min Similarity (for seek modes) */}
      {modeData.settings.minSimilarity !== null && (
        <div>
          <label className="block text-sm text-adobe-gray-400 mb-1">
            Minimum Similarity (Mode-Specific Override)
          </label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={minSimilarity ?? ""}
            onChange={(e) =>
              setMinSimilarity(e.target.value ? parseFloat(e.target.value) : null)
            }
            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
          />
          <p className="text-xs text-adobe-gray-500 mt-1">
            Only include results at least this similar to your query. 0 = show all matches (broad). 0.5+ = only highly relevant (focused).
            Leave blank to use the global default from Settings → Advanced.
          </p>
        </div>
      )}

      {/* Deduplication Threshold (v2) */}
      <div>
        <label className="block text-sm text-adobe-gray-400 mb-1">
          Deduplication Threshold (Mode-Specific Override)
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0.5"
            max="0.99"
            step="0.01"
            value={deduplicationThreshold ?? 0.85}
            onChange={(e) => setDeduplicationThreshold(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-black/30 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-sm font-mono text-white w-12">
            {((deduplicationThreshold ?? 0.85) * 100).toFixed(0)}%
          </span>
        </div>
        <p className="text-xs text-adobe-gray-500 mt-1">
          Two items are considered duplicates if this similar. Lower (70%) = aggressive (removes more near-duplicates). Higher (90%) = strict (keeps more variations).
          <br />
          💡 Recommendation: 80% works well for most modes.
        </p>
      </div>

      {/* Golden Examples Folder */}
      <div>
        <label className="block text-sm text-adobe-gray-400 mb-1">
          Golden Examples Folder
        </label>
        <input
          type="text"
          value={goldenExamplesFolder}
          onChange={(e) => setGoldenExamplesFolder(e.target.value)}
          placeholder="/path/to/golden/examples"
          className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white font-mono text-sm"
        />
        <p className="text-xs text-adobe-gray-500 mt-1">
          Point to a folder with example outputs you love. The AI uses these as style references when generating.
          <br />
          💡 Example: For insights, use a folder of your best blog post drafts.
        </p>
      </div>

      {/* Semantic Search Queries (for generation and seek modes) */}
      {(mode === "idea" || mode === "insight" || mode === "use_case") && (
        <div>
          <label className="block text-sm text-adobe-gray-400 mb-1">
            Semantic Search Queries
          </label>
          <p className="text-xs text-adobe-gray-500 mb-2">
            Tell the AI what to look for in your chat history. One query per line — multiple queries find different angles.
            {mode === "use_case" && " These are combined with your search to find relevant examples."}
          </p>
          <textarea
            value={semanticSearchQueries.join("\n")}
            onChange={(e) => {
              const lines = e.target.value.split("\n").filter(line => line.trim());
              setSemanticSearchQueries(lines);
            }}
            placeholder={
              mode === "use_case"
                ? "Examples of similar projects\nRelated use cases and implementations"
                : "What did I learn? What problems did I solve?"
            }
            rows={4}
            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white font-mono text-sm"
          />
          <p className="text-xs text-adobe-gray-500 mt-1">
            💡 <strong>How it works:</strong> {mode === "use_case" 
              ? "These queries combine with your search term. For example, if you search 'chatbot' and have query 'Examples of similar projects', it finds chats about 'chatbot projects I worked on'."
              : "Each query finds different types of relevant conversations. 'What did I learn?' finds educational chats. 'What problems did I solve?' finds debugging sessions. More queries = broader coverage."}
          </p>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-inspiration-ideas/20 text-inspiration-ideas border border-inspiration-ideas/30 rounded-lg hover:bg-inspiration-ideas/30 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

