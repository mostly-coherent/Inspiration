import { ToolType } from "@/lib/types";

interface ExpectedOutputProps {
  tool: ToolType;
  days: number;
  hours?: number; // For time-based windows (e.g., last 24 hours)
  temperature: number;
  estimatedCost: number;
}

export function ExpectedOutput({
  tool,
  days,
  hours,
  temperature,
  estimatedCost,
}: ExpectedOutputProps) {
  const toolLabel = tool === "ideas" ? "ideas" : "insights";
  
  // Determine time display - hours takes precedence over days
  const timeValue = hours ?? days;
  const timeLabel = hours ? (hours === 1 ? "hour" : "hours") : (days === 1 ? "day" : "days");
  
  return (
    <div className="mt-4 p-4 bg-gradient-to-r from-white/5 to-white/10 rounded-xl border border-white/10">
      <div className="grid grid-cols-3 gap-4 text-center">
        {/* Mode */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-inspiration-ideas">All</div>
          <div className="text-xs text-adobe-gray-400">
            quality {toolLabel}
          </div>
        </div>
        
        {/* Time Range Analyzed */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-white">{timeValue || "—"}</div>
          <div className="text-xs text-adobe-gray-400">
            {timeLabel}
          </div>
        </div>

        {/* Estimated Cost */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-green-400">${estimatedCost.toFixed(2)}</div>
          <div className="text-xs text-adobe-gray-400">est. cost</div>
        </div>
      </div>
      
      {/* Simplified Explanation */}
      <div className="mt-3 pt-3 border-t border-white/10 text-xs text-adobe-gray-500">
        <span className="text-adobe-gray-400">
          Extracts all quality {toolLabel} at temp {temperature.toFixed(1)}, deduplicates, and adds to Library.
        </span>
      </div>
    </div>
  );
}
