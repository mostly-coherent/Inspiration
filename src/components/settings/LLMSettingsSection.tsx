"use client";

interface LLMConfig {
  provider: "anthropic" | "openai" | "openrouter";
  model: string;
  fallbackProvider: "anthropic" | "openai" | "openrouter" | null;
  fallbackModel: string | null;
  promptCompression?: {
    enabled: boolean;
    threshold: number;
    compressionModel: string;
  };
}

interface LLMSettingsSectionProps {
  llm: LLMConfig;
  localModel: string;
  setLocalModel: (value: string) => void;
  onSave: (updates: Partial<{ llm: Partial<LLMConfig> }>) => void;
}

export function LLMSettingsSection({
  llm,
  localModel,
  setLocalModel,
  onSave,
}: LLMSettingsSectionProps) {
  return (
    <div className="grid gap-4">
      <div>
        <label className="block text-sm font-medium text-slate-400 mb-2">
          Primary Provider
        </label>
        <select
          value={llm.provider}
          onChange={(e) =>
            onSave({
              llm: { ...llm, provider: e.target.value as "anthropic" | "openai" | "openrouter" },
            })
          }
          className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500/50"
        >
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI (GPT)</option>
          <option value="openrouter">OpenRouter (500+ Models)</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-400 mb-2">
          Model
        </label>
        <input
          type="text"
          value={localModel}
          onChange={(e) => setLocalModel(e.target.value)}
          onBlur={() => onSave({ llm: { ...llm, model: localModel } })}
          className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500/50"
        />
      </div>
      <div className="pt-4 border-t border-slate-700/50">
        <label className="flex items-center gap-3 text-sm text-slate-400 cursor-pointer">
          <input
            id="fallback-provider-toggle"
            type="checkbox"
            checked={llm.fallbackProvider !== null}
            onChange={(e) =>
              onSave({
                llm: {
                  ...llm,
                  fallbackProvider: e.target.checked ? "openai" : null,
                  fallbackModel: e.target.checked ? "gpt-4o" : null,
                },
              })
            }
            className="w-4 h-4 rounded bg-slate-800 border-slate-700"
          />
          Enable fallback provider
        </label>
        <p className="text-xs text-slate-500 mt-1 ml-7">
          If primary fails, automatically try the fallback
        </p>
      </div>
      
      {/* Prompt Compression */}
      <div className="pt-4 border-t border-slate-700/50">
        <label className="flex items-center gap-3 text-sm text-slate-400 cursor-pointer">
          <input
            id="prompt-compression-toggle"
            type="checkbox"
            checked={llm.promptCompression?.enabled ?? false}
            onChange={(e) =>
              onSave({
                llm: {
                  ...llm,
                  promptCompression: {
                    enabled: e.target.checked,
                    threshold: llm.promptCompression?.threshold ?? 10000,
                    compressionModel: llm.promptCompression?.compressionModel ?? "gpt-3.5-turbo",
                  },
                },
              })
            }
            className="w-4 h-4 rounded bg-slate-800 border-slate-700"
          />
          Enable prompt compression
        </label>
        <p className="text-xs text-slate-500 mt-1 ml-7">
          Automatically compress large conversation histories to reduce token usage and avoid rate limits
        </p>
        {llm.promptCompression?.enabled && (
          <div className="mt-3 ml-7 space-y-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Compression threshold (tokens)
              </label>
              <input
                type="number"
                value={llm.promptCompression.threshold}
                onChange={(e) =>
                  onSave({
                    llm: {
                      ...llm,
                      promptCompression: {
                        ...llm.promptCompression!,
                        threshold: parseInt(e.target.value) || 10000,
                      },
                    },
                  })
                }
                className="w-full px-3 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-amber-500/50"
                min="1000"
                max="100000"
                step="1000"
              />
              <p className="text-xs text-slate-600 mt-1">
                Compress prompts larger than this (default: 10,000)
              </p>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Compression model
              </label>
              <select
                value={llm.promptCompression.compressionModel}
                onChange={(e) =>
                  onSave({
                    llm: {
                      ...llm,
                      promptCompression: {
                        ...llm.promptCompression!,
                        compressionModel: e.target.value,
                      },
                    },
                  })
                }
                className="w-full px-3 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-amber-500/50"
              >
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo (cheapest)</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-4o">GPT-4o</option>
              </select>
              <p className="text-xs text-slate-600 mt-1">
                Model used for compression (cheaper = lower cost)
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
