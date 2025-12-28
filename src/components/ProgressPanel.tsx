import { LoadingSpinner } from "./LoadingSpinner";
import { StopIcon } from "./StopIcon";

interface ProgressPanelProps {
  progress: number;
  phase: string;
  elapsedSeconds: number;
  estimatedSeconds: number;
  tool: string;
  onStop: () => void;
}

export function ProgressPanel({
  progress,
  phase,
  elapsedSeconds,
  estimatedSeconds,
  tool,
  onStop,
}: ProgressPanelProps) {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const remainingSeconds = Math.max(0, estimatedSeconds - elapsedSeconds);
  const isStopping = phase === "Stopping..." || phase === "Stopped";

  return (
    <div className="glass-card p-6 space-y-4" aria-busy={!isStopping} aria-live="polite">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-white flex items-center gap-3">
          {!isStopping && <LoadingSpinner />}
          {isStopping ? phase : `Generating ${tool}...`}
        </h3>
        <div className="flex items-center gap-4">
          <span className="text-sm text-adobe-gray-400">
            {formatTime(elapsedSeconds)} elapsed
          </span>
          {!isStopping && (
            <button
              onClick={onStop}
              aria-label="Stop generation"
              className="px-4 py-2 text-sm font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 border border-red-400/30 rounded-lg transition-colors flex items-center gap-2"
            >
              <StopIcon />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div 
          className="h-3 bg-white/10 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Generation progress: ${Math.round(progress)}%`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              isStopping 
                ? "bg-red-400/50" 
                : "bg-gradient-to-r from-inspiration-ideas to-inspiration-insights"
            }`}
            style={{ width: `${progress}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-adobe-gray-300">{phase}</span>
          <span className="text-adobe-gray-400">
            {isStopping ? (
              <span className="text-red-400">Cancelled</span>
            ) : progress < 100 ? (
              <>~{formatTime(remainingSeconds)} remaining</>
            ) : (
              <span className="text-inspiration-ideas">Complete!</span>
            )}
          </span>
        </div>
      </div>

      {/* Progress percentage */}
      <div className="flex justify-center">
        <span 
          className={`text-4xl font-bold ${isStopping ? "text-red-400" : "gradient-text"}`}
          aria-hidden="true"
        >
          {Math.round(progress)}%
        </span>
        <span className="sr-only">
          {isStopping ? "Generation stopped" : `${Math.round(progress)} percent complete`}
        </span>
      </div>
    </div>
  );
}

