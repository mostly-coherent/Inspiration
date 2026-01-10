"use client";

interface SettingsSectionProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="mb-8 p-6 bg-slate-900/50 rounded-xl border border-slate-800/50">
      <h2 className="text-lg font-semibold text-slate-200 mb-1">{title}</h2>
      <p className="text-sm text-slate-500 mb-4">{description}</p>
      {children}
    </section>
  );
}

// Navigation buttons for wizard flow
interface WizardNavigationProps {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  saving?: boolean;
  isComplete?: boolean;
}

export function WizardNavigation({
  onBack,
  onNext,
  nextLabel = "Next →",
  nextDisabled = false,
  saving = false,
  isComplete = false,
}: WizardNavigationProps) {
  return (
    <div className="mt-6 flex justify-between">
      {onBack ? (
        <button
          onClick={onBack}
          className="px-6 py-2 text-slate-400 hover:text-slate-200 transition-colors"
        >
          ← Back
        </button>
      ) : (
        <div />
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled || saving}
        className={`px-6 py-2 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          isComplete
            ? "bg-emerald-500 text-slate-900 hover:bg-emerald-400"
            : "bg-amber-500 text-slate-900 hover:bg-amber-400"
        }`}
      >
        {saving ? "Saving..." : nextLabel}
      </button>
    </div>
  );
}
