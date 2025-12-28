import { PRESET_MODES } from "@/lib/types";

interface AdvancedSettingsProps {
  customDays: number;
  setCustomDays: (v: number) => void;
  customBestOf: number;
  setCustomBestOf: (v: number) => void;
  customTemperature: number;
  setCustomTemperature: (v: number) => void;
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
  useCustomDates: boolean;
  setUseCustomDates: (v: boolean) => void;
}

export function AdvancedSettings({
  customDays,
  setCustomDays,
  customBestOf,
  setCustomBestOf,
  customTemperature,
  setCustomTemperature,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  useCustomDates,
  setUseCustomDates,
}: AdvancedSettingsProps) {
  return (
    <div className="space-y-6 p-4 bg-white/5 rounded-xl">
      {/* Date Selection */}
      <fieldset className="space-y-3">
        <legend className="sr-only">Date range selection method</legend>
        <div className="flex items-center gap-4" role="radiogroup" aria-label="Date range selection">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="date-selection"
              checked={!useCustomDates}
              onChange={() => setUseCustomDates(false)}
              className="w-4 h-4 accent-inspiration-ideas"
              aria-describedby="last-n-days-desc"
            />
            <span id="last-n-days-desc">Last N days</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="date-selection"
              checked={useCustomDates}
              onChange={() => setUseCustomDates(true)}
              className="w-4 h-4 accent-inspiration-ideas"
              aria-describedby="custom-range-desc"
            />
            <span id="custom-range-desc">Custom date range</span>
          </label>
        </div>

        {!useCustomDates ? (
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={90}
              value={customDays}
              onChange={(e) => setCustomDays(parseInt(e.target.value))}
              className="slider-track flex-1"
              aria-label={`Number of days to analyze: ${customDays}`}
              aria-valuemin={1}
              aria-valuemax={90}
              aria-valuenow={customDays}
            />
            <span className="w-16 text-center font-mono" aria-hidden="true">{customDays} days</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label htmlFor="from-date" className="text-sm text-adobe-gray-400 block mb-1">From</label>
                <input
                  id="from-date"
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    const selectedFrom = e.target.value;
                    setFromDate(selectedFrom);
                    // Enforce 90-day maximum: if toDate is set, ensure range doesn't exceed 90 days
                    if (toDate && selectedFrom) {
                      const from = new Date(selectedFrom);
                      const to = new Date(toDate);
                      const diffDays = Math.ceil(Math.abs(to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                      if (diffDays > 90) {
                        // Auto-adjust toDate to maintain 90-day limit
                        const maxTo = new Date(from);
                        maxTo.setDate(maxTo.getDate() + 89); // 90 days inclusive
                        setToDate(maxTo.toISOString().split('T')[0]);
                      }
                    }
                  }}
                  max={toDate || new Date().toISOString().split('T')[0]}
                  className="input-field"
                  aria-label="Start date for analysis (maximum 90 days back)"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="to-date" className="text-sm text-adobe-gray-400 block mb-1">To</label>
                <input
                  id="to-date"
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    const selectedTo = e.target.value;
                    setToDate(selectedTo);
                    // Enforce 90-day maximum: if fromDate is set, ensure range doesn't exceed 90 days
                    if (fromDate && selectedTo) {
                      const from = new Date(fromDate);
                      const to = new Date(selectedTo);
                      const diffDays = Math.ceil(Math.abs(to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                      if (diffDays > 90) {
                        // Auto-adjust fromDate to maintain 90-day limit
                        const minFrom = new Date(to);
                        minFrom.setDate(minFrom.getDate() - 89); // 90 days inclusive
                        setFromDate(minFrom.toISOString().split('T')[0]);
                      }
                    }
                  }}
                  min={fromDate}
                  max={new Date().toISOString().split('T')[0]}
                  className="input-field"
                  aria-label="End date for analysis (maximum 90 days from start)"
                />
              </div>
            </div>
            {fromDate && toDate && (() => {
              const from = new Date(fromDate);
              const to = new Date(toDate);
              const diffDays = Math.ceil(Math.abs(to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              return diffDays > 90 ? (
                <p className="text-xs text-red-400">⚠️ Range exceeds 90 days (max allowed). Adjusting automatically...</p>
              ) : (
                <p className="text-xs text-adobe-gray-500">{diffDays} day{diffDays !== 1 ? 's' : ''} selected</p>
              );
            })()}
          </div>
        )}
      </fieldset>

      {/* Best-of Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-adobe-gray-300">
            Candidates to generate
            <span className="text-adobe-gray-500 text-sm ml-2">
              (more = more variety, slower)
            </span>
          </label>
          <span className="font-mono text-lg">{customBestOf}</span>
        </div>
        <input
          type="range"
          min={1}
          max={20}
          value={customBestOf}
          onChange={(e) => setCustomBestOf(parseInt(e.target.value))}
          className="slider-track w-full"
          aria-label={`Number of candidates to generate: ${customBestOf}`}
          aria-valuemin={1}
          aria-valuemax={20}
          aria-valuenow={customBestOf}
        />
        <div className="flex justify-between text-xs text-adobe-gray-500">
          <span>1 (fast)</span>
          <span>5 (balanced)</span>
          <span>10 (thorough)</span>
          <span>20 (exhaustive)</span>
        </div>
      </div>

      {/* Temperature Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-adobe-gray-300">
            Temperature
            <span className="text-adobe-gray-500 text-sm ml-2">
              (higher = more creative, riskier)
            </span>
          </label>
          <span className="font-mono text-lg">{customTemperature.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={customTemperature * 100}
          onChange={(e) => setCustomTemperature(parseInt(e.target.value) / 100)}
          className="slider-track w-full"
          aria-label={`Temperature setting: ${customTemperature.toFixed(2)}`}
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={customTemperature}
        />
        <div className="flex justify-between text-xs text-adobe-gray-500">
          <span>0.0 (focused)</span>
          <span>0.3 (safe)</span>
          <span>0.5 (balanced)</span>
          <span>0.7+ (creative)</span>
        </div>
      </div>

      {/* Quick preset buttons */}
      <div className="flex gap-2 pt-2" role="group" aria-label="Quick preset options">
        <span className="text-sm text-adobe-gray-400" id="presets-label">Quick presets:</span>
        {PRESET_MODES.map((preset) => (
          <button
            key={preset.id}
            onClick={() => {
              setCustomDays(preset.days);
              setCustomBestOf(preset.bestOf);
              setCustomTemperature(preset.temperature);
              setUseCustomDates(false);
            }}
            className="text-xs px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label={`Apply ${preset.label} preset: ${preset.days} days, ${preset.bestOf} candidates, temperature ${preset.temperature}`}
          >
            <span aria-hidden="true">{preset.icon}</span> {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

