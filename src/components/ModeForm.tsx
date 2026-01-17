"use client";

import { useState } from "react";
import { Mode, ThemeType } from "@/lib/types";

interface ModeFormProps {
  theme: ThemeType;
  mode?: Mode; // If provided, edit mode; otherwise create new
  onSave: () => void;
  onCancel: () => void;
}

export function ModeForm({ theme, mode, onSave, onCancel }: ModeFormProps) {
  const [name, setName] = useState(mode?.name || "");
  const [description, setDescription] = useState(mode?.description || "");
  const [icon, setIcon] = useState(mode?.icon || "📝");
  const [color, setColor] = useState(mode?.color || "inspiration-ideas");
  const [promptTemplate, setPromptTemplate] = useState(mode?.promptTemplate || "");
  const [temperature, setTemperature] = useState<number | null>(
    mode?.settings.temperature ?? null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const modeData = {
        id: mode?.id || name.toLowerCase().replace(/\s+/g, "_"),
        name,
        description,
        icon,
        color,
        promptTemplate: promptTemplate || null,
        settings: {
          temperature,
          minSimilarity: null,
          deduplicationThreshold: null,
          goldenExamplesFolder: null,
          semanticSearchQueries: null,
        },
        createdBy: "user",
        createdDate: new Date().toISOString().split("T")[0],
      };

      const url = mode
        ? `/api/modes?themeId=${theme}&modeId=${mode.id}`
        : "/api/modes";
      const method = mode ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode
            ? { themeId: theme, modeId: mode.id, updates: modeData }
            : { themeId: theme, mode: modeData }
        ),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        let errorData: any = {};
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // Not JSON, use text as error
        }
        throw new Error(
          (errorData && typeof errorData === 'object' && errorData.error) || errorText || "Failed to save mode"
        );
      }

      const data = await response.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });

      if (data && typeof data === 'object' && data.success !== false) {
        onSave();
      } else {
        throw new Error((data && typeof data === 'object' && data.error) || "Failed to save mode");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-400/10 border border-red-400/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-adobe-gray-300 mb-1">
          Mode Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-adobe-gray-300 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-adobe-gray-300 mb-1">
            Icon
          </label>
          <input
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="📝"
            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-adobe-gray-300 mb-1">
            Color Class
          </label>
          <select
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
          >
            <option value="inspiration-ideas">Ideas</option>
            <option value="inspiration-insights">Insights</option>
            <option value="inspiration-seek">Seek</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-adobe-gray-300 mb-1">
          Prompt Template (optional)
        </label>
        <input
          type="text"
          value={promptTemplate}
          onChange={(e) => setPromptTemplate(e.target.value)}
          placeholder="mode_synthesize.md"
          className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white font-mono text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-adobe-gray-300 mb-1">
          Temperature
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
          Use 1 decimal precision (0.1, 0.5, 0.7). Values are rounded to nearest 0.1.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="px-4 py-2 bg-inspiration-ideas/20 text-inspiration-ideas border border-inspiration-ideas/30 rounded-lg hover:bg-inspiration-ideas/30 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : mode ? "Update Mode" : "Create Mode"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-white/10 text-adobe-gray-300 rounded-lg hover:bg-white/20 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

