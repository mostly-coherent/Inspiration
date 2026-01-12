import { ModeConfig } from "@/lib/types";

interface ModeCardProps {
  mode: ModeConfig;
  isSelected: boolean;
  onClick: () => void;
}

export function ModeCard({ mode, isSelected, onClick }: ModeCardProps) {
  // Build time range description
  const timeDescription = mode.hours 
    ? `${mode.hours} hours` 
    : `${mode.days} day${mode.days !== 1 ? "s" : ""}`;
  
  return (
    <button
      onClick={onClick}
      aria-label={`${mode.label} mode: ${mode.description}. ${timeDescription}.`}
      aria-pressed={isSelected}
      className={`mode-card ${isSelected ? "selected" : ""}`}
    >
      <span className="text-3xl" aria-hidden="true">{mode.icon}</span>
      <div>
        <h3 className="font-semibold text-lg">{mode.label}</h3>
        <p className="text-adobe-gray-400 text-sm">{mode.description}</p>
      </div>
      {mode.id === "sprint" && (
        <span className="text-xs text-inspiration-ideas bg-inspiration-ideas/20 px-2 py-1 rounded-full mx-auto">
          Recommended
        </span>
      )}
    </button>
  );
}

