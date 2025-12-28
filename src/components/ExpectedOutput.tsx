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
      <h3 className="text-sm font-medium text-adobe-gray-300 mb-3 flex items-center gap-2">
        <span className="text-lg">📊</span> Expected Output
      </h3>
      <div className="grid grid-cols-5 gap-4 text-center">
        {/* Output Files */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-white">1</div>
          <div className="text-xs text-adobe-gray-400">output file</div>
        </div>
        
        {/* Candidates Generated */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-inspiration-ideas">{bestOf}</div>
          <div className="text-xs text-adobe-gray-400">
            {bestOf === 1 ? "candidate" : "candidates"}
          </div>
        </div>
        
        {/* Winning Output */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-inspiration-insights">1</div>
          <div className="text-xs text-adobe-gray-400">
            winning {toolLabel}
          </div>
        </div>
        
        {/* Days Analyzed */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-white">{days || "—"}</div>
          <div className="text-xs text-adobe-gray-400">
            {days === 1 ? "day" : "days"} analyzed
          </div>
        </div>

        {/* Estimated Cost */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-green-400">${estimatedCost.toFixed(2)}</div>
          <div className="text-xs text-adobe-gray-400">est. cost</div>
        </div>
      </div>
      
      {/* Explanation */}
      <div className="mt-3 pt-3 border-t border-white/10 text-xs text-adobe-gray-500 space-y-1">
        <div>
          <span className="text-adobe-gray-400">How it works:</span>{" "}
          {bestOf} {bestOf === 1 ? "candidate is" : "candidates are"} generated at temp {temperature.toFixed(1)}, 
          then judged at temp 0.0 to select the best {toolLabel}.
          {days > 1 && ` All ${days} days of conversations are analyzed together.`}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-adobe-gray-400">Model:</span>
          <code className="px-1.5 py-0.5 bg-white/10 rounded text-adobe-gray-300">claude-sonnet-4-20250514</code>
          <span className="text-adobe-gray-500">(generation & judging)</span>
        </div>
      </div>
    </div>
  );
}

