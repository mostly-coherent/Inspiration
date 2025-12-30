import { ToolType } from "@/lib/types";

interface ExpectedOutputProps {
  tool: ToolType;
  days: number;
  bestOf: number;
  temperature: number;
  estimatedCost: number;
}

export function ExpectedOutput({
  tool,
  days,
  bestOf,
  temperature,
  estimatedCost,
}: ExpectedOutputProps) {
  const toolLabel = tool === "ideas" ? "idea" : "insight";
  
  return (
    <div className="mt-4 p-4 bg-gradient-to-r from-white/5 to-white/10 rounded-xl border border-white/10">
      <div className="grid grid-cols-3 gap-4 text-center">
        {/* Candidates Generated */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-inspiration-ideas">{bestOf}</div>
          <div className="text-xs text-adobe-gray-400">
            {bestOf === 1 ? "candidate" : "candidates"}
          </div>
        </div>
        
        {/* Days Analyzed */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-white">{days || "—"}</div>
          <div className="text-xs text-adobe-gray-400">
            {days === 1 ? "day" : "days"}
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
        <span className="text-adobe-gray-400">Generates {bestOf} {bestOf === 1 ? "candidate" : "candidates"} at temp {temperature.toFixed(1)}, then selects the best {toolLabel}.</span>
      </div>
    </div>
  );
}

