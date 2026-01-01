import { ToolType } from "@/lib/types";

interface ExpectedOutputProps {
  tool: ToolType;
  days: number;
  itemCount: number;
  temperature: number;
  estimatedCost: number;
}

export function ExpectedOutput({
  tool,
  days,
  itemCount,
  temperature,
  estimatedCost,
}: ExpectedOutputProps) {
  const toolLabel = tool === "ideas" ? "ideas" : "insights";
  
  return (
    <div className="mt-4 p-4 bg-gradient-to-r from-white/5 to-white/10 rounded-xl border border-white/10">
      <div className="grid grid-cols-3 gap-4 text-center">
        {/* Items Generated */}
        <div className="space-y-1">
          <div className="text-2xl font-bold text-inspiration-ideas">{itemCount}</div>
          <div className="text-xs text-adobe-gray-400">
            {itemCount === 1 ? "item" : "items"}
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
      
      {/* v2: Simplified Explanation - Item-centric flow */}
      <div className="mt-3 pt-3 border-t border-white/10 text-xs text-adobe-gray-500">
        <span className="text-adobe-gray-400">
          Generates {itemCount} {toolLabel} at temp {temperature.toFixed(1)}, deduplicates similar ones, then ranks by quality.
        </span>
      </div>
    </div>
  );
}
