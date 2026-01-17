"use client";

import { useState } from "react";

interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  costPerChunk: number;
}

interface TimeEstimate {
  hours: number;
  minutes: number;
  chunksPerMinute: number;
}

interface EstimateResponse {
  chunkCount: number;
  model: string;
  withRelations: boolean;
  costEstimate: CostEstimate;
  timeEstimate: TimeEstimate;
}

interface CostEstimatorProps {
  defaultChunkCount?: number;
  onEstimate?: (estimate: EstimateResponse) => void;
}

/**
 * CostEstimator Component
 *
 * Displays cost and time estimates for KG indexing.
 * Can be used before starting indexing to show users what to expect.
 */
export default function CostEstimator({
  defaultChunkCount = 1000,
  onEstimate,
}: CostEstimatorProps) {
  const [chunkCount, setChunkCount] = useState(defaultChunkCount);
  const [model, setModel] = useState("claude-haiku-4-5");
  const [withRelations, setWithRelations] = useState(true);
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleEstimate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/kg/estimate-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chunkCount,
          model,
          withRelations,
        }),
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
          (errorData && typeof errorData === 'object' && errorData.error) || errorText || "Failed to estimate cost"
        );
      }

      const data = await response.json().catch((parseError) => {
        throw new Error(`Invalid response format: ${parseError.message}`);
      });

      // Validate response structure
      if (!data || typeof data !== 'object') {
        throw new Error("Invalid response structure");
      }

      setEstimate(data as EstimateResponse);
      onEstimate?.(data as EstimateResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-6 bg-white shadow-sm">
      <h3 className="text-lg font-semibold mb-4">💰 Cost & Time Estimator</h3>

      <div className="space-y-4">
        {/* Input Fields */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Chunk Count
          </label>
          <input
            type="number"
            value={chunkCount}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              setChunkCount(isNaN(value) ? 0 : Math.max(0, value));
            }}
            className="w-full px-3 py-2 border rounded-md"
            min="1"
            aria-label="Number of chunks to process"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 border rounded-md"
            aria-label="LLM model to use for indexing"
          >
            <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
            <option value="gpt-4o-mini">GPT-4o Mini</option>
            <option value="gpt-4o">GPT-4o</option>
          </select>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="withRelations"
            checked={withRelations}
            onChange={(e) => setWithRelations(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="withRelations" className="text-sm">
            Extract relations (adds ~400 output tokens per chunk)
          </label>
        </div>

        <button
          onClick={handleEstimate}
          disabled={loading || chunkCount <= 0}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Calculating..." : "Estimate Cost"}
        </button>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Estimate Display */}
        {estimate && (
          <div className="mt-6 space-y-4">
            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">💰 Cost Estimate</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Input tokens:</span>
                  <span className="font-mono">
                    {estimate.costEstimate.inputTokens.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Output tokens:</span>
                  <span className="font-mono">
                    {estimate.costEstimate.outputTokens.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-semibold">Total cost:</span>
                  <span className="font-mono font-semibold text-lg">
                    ${estimate.costEstimate.totalCostUsd.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Cost per chunk:</span>
                  <span className="font-mono">
                    ${estimate.costEstimate.costPerChunk.toFixed(6)}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">⏱️ Time Estimate</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Total time:</span>
                  <span className="font-mono">
                    {estimate.timeEstimate.hours > 0
                      ? `${estimate.timeEstimate.hours.toFixed(1)} hours`
                      : `${estimate.timeEstimate.minutes.toFixed(0)} minutes`}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Processing rate:</span>
                  <span className="font-mono">
                    ~{estimate.timeEstimate.chunksPerMinute.toFixed(1)}{" "}
                    chunks/min
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
