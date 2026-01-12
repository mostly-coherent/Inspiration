import { LoadingSpinner } from "./LoadingSpinner";
import { StopIcon } from "./StopIcon";

// Progress data for each phase
export interface ProgressPhaseData {
  // Request confirmation
  dateRange?: string;
  requestedItems?: number;
  temperature?: number;
  
  // Search phase
  conversationsFound?: number;
  daysWithActivity?: number;
  daysProcessed?: number;
  
  // Generation phase
  itemsGenerated?: number;
  itemsAfterSelfDedup?: number;
  sentToLibrary?: number;
  
  // Library integration
  itemsFiltered?: number;
  filterReason?: string;
  itemsCompared?: number;
  itemsAdded?: number;
  itemsMerged?: number;
  
  // Intra-phase progress
  currentItem?: number;
  totalItems?: number;
  progressLabel?: string;
  
  // Cost tracking
  tokensIn?: number;
  tokensOut?: number;
  cumulativeCost?: number;
  
  // Warnings
  warnings?: string[];
  
  // Performance summary (end of run)
  totalSeconds?: number;
  totalCost?: number;
}

// Current active phase
export type ProgressPhase = 
  | "confirming"
  | "searching" 
  | "generating"
  | "deduplicating"
  | "ranking"
  | "integrating"
  | "complete"
  | "stopping"
  | "stopped"
  | "error";

// Structured error explanation
export interface ErrorExplanation {
  phase: string;
  title: string;
  explanation: string;
  recommendation: string;
  canRetry: boolean;
  suggestSmallerRun: boolean;
}

interface ProgressPanelProps {
  progress: number;
  phase: ProgressPhase;
  phaseMessage: string;
  phaseData: ProgressPhaseData;
  elapsedSeconds: number;
  estimatedSeconds: number;
  tool: string;
  toolLabel: string;
  errorExplanation?: ErrorExplanation;
  onStop: () => void;
  onRetry?: () => void;
}

export function ProgressPanel({
  progress,
  phase,
  phaseMessage,
  phaseData,
  elapsedSeconds,
  estimatedSeconds,
  tool,
  toolLabel,
  errorExplanation,
  onStop,
  onRetry,
}: ProgressPanelProps) {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const formatCost = (cost: number): string => {
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const remainingSeconds = Math.max(0, estimatedSeconds - elapsedSeconds);
  const isStopping = phase === "stopping" || phase === "stopped";
  const isError = phase === "error";
  const isComplete = phase === "complete";

  // Determine which phases are done, active, or pending
  const phaseOrder: ProgressPhase[] = ["confirming", "searching", "generating", "deduplicating", "ranking", "integrating", "complete"];
  const currentPhaseIndex = phaseOrder.indexOf(phase);

  const getPhaseStatus = (p: ProgressPhase): "done" | "active" | "pending" => {
    const idx = phaseOrder.indexOf(p);
    if (idx < currentPhaseIndex) return "done";
    if (idx === currentPhaseIndex) return "active";
    return "pending";
  };

  // Check for slow phase warning
  const hasWarnings = phaseData.warnings && phaseData.warnings.length > 0;

  return (
    <div className="glass-card p-6 space-y-4" aria-live="polite">
      {/* Header with timer and stop button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-white flex items-center gap-3">
          {!isStopping && !isComplete && !isError && <LoadingSpinner />}
          {isComplete ? "✅ Complete!" : 
           isStopping ? "⏹ Stopping..." : 
           isError ? "❌ Error" :
           `Generating ${toolLabel}...`}
        </h3>
        <div className="flex items-center gap-4">
          {/* Cost display */}
          {phaseData.cumulativeCost !== undefined && phaseData.cumulativeCost > 0 && (
            <span className="text-sm text-green-400 font-mono">
              {formatCost(phaseData.cumulativeCost)}
            </span>
          )}
          <span className="text-sm text-adobe-gray-400">
            {formatTime(elapsedSeconds)} elapsed
          </span>
          {!isStopping && !isComplete && !isError && (
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

      {/* Warnings banner */}
      {hasWarnings && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg px-4 py-2 text-sm">
          <span className="text-yellow-400 font-medium">⚠️ Performance warning:</span>
          {phaseData.warnings?.map((w, i) => (
            <span key={i} className="text-yellow-300 ml-2">{w}</span>
          ))}
        </div>
      )}

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
              isError 
                ? "bg-red-400/50"
                : isStopping 
                  ? "bg-red-400/50" 
                  : isComplete
                    ? "bg-green-500"
                    : hasWarnings
                      ? "bg-gradient-to-r from-yellow-400 to-inspiration-insights"
                      : "bg-gradient-to-r from-inspiration-ideas to-inspiration-insights"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-adobe-gray-300">
            {phaseMessage}
            {/* Show intra-phase progress if available */}
            {phaseData.currentItem !== undefined && phaseData.totalItems !== undefined && (
              <span className="text-white font-medium ml-2">
                ({phaseData.currentItem} of {phaseData.totalItems} {phaseData.progressLabel || "items"})
              </span>
            )}
          </span>
          <span className="text-adobe-gray-400">
            {isStopping ? (
              <span className="text-red-400">Cancelled</span>
            ) : isComplete ? (
              <span className="text-green-400">Done!</span>
            ) : isError ? (
              <span className="text-red-400">Failed</span>
            ) : progress < 100 ? (
              <>~{formatTime(remainingSeconds)} remaining</>
            ) : (
              <span className="text-inspiration-ideas">Complete!</span>
            )}
          </span>
        </div>
      </div>

      {/* === STRUCTURED PROGRESS JOURNEY === */}
      <div className="mt-4 bg-black/30 rounded-lg p-4 space-y-3 font-mono text-sm">
        
        {/* Phase 1: Request Confirmation */}
        <PhaseBlock 
          status={getPhaseStatus("confirming")}
          icon="📋"
          title="Request"
          isFirst
        >
          {phaseData.dateRange && (
            <ProgressLine done>Date Range: {phaseData.dateRange}</ProgressLine>
          )}
          {phaseData.requestedItems !== undefined && (
            <ProgressLine done>Requested Items: {phaseData.requestedItems}</ProgressLine>
          )}
          {phaseData.temperature !== undefined && (
            <ProgressLine done>Temperature: {phaseData.temperature}</ProgressLine>
          )}
        </PhaseBlock>

        {/* Phase 2: Search Phase */}
        <PhaseBlock
          status={getPhaseStatus("searching")}
          icon="🔍"
          title="Search Phase"
        >
          {phaseData.conversationsFound !== undefined && (
            <ProgressLine done={getPhaseStatus("searching") === "done"} active={getPhaseStatus("searching") === "active"}>
              Meaningful Conversations Found: {phaseData.conversationsFound}
              <span className="text-adobe-gray-500 ml-1">(via semantic search)</span>
            </ProgressLine>
          )}
          {phaseData.daysWithActivity !== undefined && phaseData.daysProcessed !== undefined && (
            <ProgressLine done={getPhaseStatus("searching") === "done"} isFyi>
              Days with Meaningful Conversations: {phaseData.daysWithActivity} of {phaseData.daysProcessed}
              {phaseData.daysProcessed > phaseData.daysWithActivity && (
                <span className="text-adobe-gray-500 ml-1">
                  ({phaseData.daysProcessed - phaseData.daysWithActivity} days had no meaningful conversations)
                </span>
              )}
            </ProgressLine>
          )}
        </PhaseBlock>

        {/* Phase 3: Generation Phase */}
        <PhaseBlock
          status={getPhaseStatus("generating")}
          icon="🧠"
          title="Generation Phase"
        >
          {phaseData.itemsGenerated !== undefined && (
            <ProgressLine done={getPhaseStatus("deduplicating") === "done" || getPhaseStatus("generating") === "done"} active={getPhaseStatus("generating") === "active"}>
              New Items Generated: {phaseData.itemsGenerated}
              {phaseData.tokensIn !== undefined && (
                <span className="text-adobe-gray-500 ml-2">
                  (~{Math.round(phaseData.tokensIn / 1000)}k tokens in)
                </span>
              )}
            </ProgressLine>
          )}
          {phaseData.itemsAfterSelfDedup !== undefined && (
            <ProgressLine done={getPhaseStatus("deduplicating") === "done"} active={getPhaseStatus("deduplicating") === "active"}>
              After Self-Dedup: {phaseData.itemsAfterSelfDedup}
              {phaseData.itemsGenerated !== undefined && phaseData.itemsAfterSelfDedup === phaseData.itemsGenerated && (
                <span className="text-green-400/70 ml-1">(all unique)</span>
              )}
              {phaseData.itemsGenerated !== undefined && phaseData.itemsAfterSelfDedup < phaseData.itemsGenerated && (
                <span className="text-yellow-400/70 ml-1">({phaseData.itemsGenerated - phaseData.itemsAfterSelfDedup} duplicates removed)</span>
              )}
              <span className="text-adobe-gray-600 ml-2">← Dedup among NEW items only</span>
            </ProgressLine>
          )}
          {phaseData.sentToLibrary !== undefined && (
            <ProgressLine done={getPhaseStatus("ranking") === "done"} active={getPhaseStatus("ranking") === "active"} isLast>
              Sent to Library: {phaseData.sentToLibrary}
            </ProgressLine>
          )}
        </PhaseBlock>

        {/* Phase 4: Library Integration */}
        <PhaseBlock
          status={getPhaseStatus("integrating")}
          icon="📚"
          title="Library Integration"
        >
          {phaseData.itemsFiltered !== undefined && phaseData.itemsFiltered > 0 && (
            <ProgressLine done={getPhaseStatus("integrating") === "done"} isFyi>
              <span className="text-yellow-400/80">{phaseData.itemsFiltered} items filtered</span>
              {phaseData.filterReason && (
                <span className="text-adobe-gray-500 ml-1">({phaseData.filterReason})</span>
              )}
            </ProgressLine>
          )}
          {phaseData.itemsCompared !== undefined && (
            <ProgressLine done={getPhaseStatus("integrating") === "done"} active={getPhaseStatus("integrating") === "active"}>
              Compared to Library: {phaseData.itemsCompared}
              {/* Show intra-phase progress for integration */}
              {getPhaseStatus("integrating") === "active" && phaseData.currentItem !== undefined && phaseData.totalItems !== undefined && (
                <span className="text-inspiration-ideas ml-2">
                  (processing {phaseData.currentItem} of {phaseData.totalItems})
                </span>
              )}
            </ProgressLine>
          )}
          {phaseData.itemsAdded !== undefined && (
            <ProgressLine done={getPhaseStatus("integrating") === "done"}>
              <span className="text-inspiration-ideas">New (Added): +{phaseData.itemsAdded}</span>
              {phaseData.itemsAdded > 0 && <span className="text-adobe-gray-500 ml-1">(unique)</span>}
            </ProgressLine>
          )}
          {phaseData.itemsMerged !== undefined && (
            <ProgressLine done={getPhaseStatus("integrating") === "done"}>
              <span className="text-inspiration-insights">Existing (Merged): {phaseData.itemsMerged}</span>
              {phaseData.itemsMerged > 0 && <span className="text-adobe-gray-500 ml-1">(occurrence +1)</span>}
            </ProgressLine>
          )}
          {phaseData.itemsAdded !== undefined && phaseData.itemsMerged !== undefined && phaseData.itemsCompared !== undefined && (
            <ProgressLine done={getPhaseStatus("integrating") === "done"} isLast>
              <span className="text-green-400">
                ✓ Accounting: {phaseData.itemsAdded} new + {phaseData.itemsMerged} merged = {phaseData.itemsCompared} processed
              </span>
            </ProgressLine>
          )}
        </PhaseBlock>

        {/* Completion Message */}
        {isComplete && phaseData.itemsAdded !== undefined && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="text-green-400 font-semibold">
              ✅ {phaseData.itemsAdded} new {tool === "ideas" ? "ideas" : "insights"} added to your Library.
              {phaseData.itemsMerged !== undefined && phaseData.itemsMerged > 0 && (
                <> {phaseData.itemsMerged} existing items were reinforced.</>
              )}
            </div>
            {/* Performance summary */}
            {phaseData.totalSeconds !== undefined && (
              <div className="text-adobe-gray-400 text-xs mt-2">
                ⏱️ Total time: {formatTime(Math.round(phaseData.totalSeconds))}
                {phaseData.totalCost !== undefined && (
                  <> • Cost: {formatCost(phaseData.totalCost)}</>
                )}
                {phaseData.tokensIn !== undefined && phaseData.tokensOut !== undefined && (
                  <> • Tokens: {Math.round((phaseData.tokensIn + phaseData.tokensOut) / 1000)}k</>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error Message - Enhanced with structured explanation */}
        {isError && errorExplanation && (
          <div className="mt-3 pt-3 border-t border-red-400/30 space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-red-400 text-lg">❌</span>
              <div className="flex-1">
                <div className="text-red-400 font-semibold">{errorExplanation.title}</div>
                <div className="text-xs text-adobe-gray-500 mt-0.5">Failed during: {errorExplanation.phase} phase</div>
              </div>
            </div>
            
            <div className="bg-red-400/5 border border-red-400/20 rounded-lg p-3 space-y-2">
              <div className="text-adobe-gray-300 text-sm">
                <span className="font-medium text-adobe-gray-200">What happened:</span>{" "}
                {errorExplanation.explanation}
              </div>
              
              <div className="text-adobe-gray-300 text-sm">
                <span className="font-medium text-green-400">💡 What to do:</span>{" "}
                {errorExplanation.recommendation}
              </div>
            </div>
            
            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              {errorExplanation.canRetry && onRetry && (
                <button
                  onClick={onRetry}
                  className="px-3 py-1.5 text-sm font-medium text-green-400 bg-green-400/10 hover:bg-green-400/20 border border-green-400/30 rounded-lg transition-colors"
                >
                  🔄 Retry
                </button>
              )}
              {errorExplanation.suggestSmallerRun && (
                <span className="px-3 py-1.5 text-sm text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg">
                  💡 Try smaller date range or fewer items
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Progress percentage - smaller when we have detailed phases */}
      <div className="flex justify-center">
        <span 
          className={`text-2xl font-bold ${
            isError ? "text-red-400" :
            isStopping ? "text-red-400" : 
            isComplete ? "text-green-400" :
            hasWarnings ? "text-yellow-400" :
            "gradient-text"
          }`}
        >
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}

// === Helper Components for structured tree view ===

interface PhaseBlockProps {
  status: "done" | "active" | "pending";
  icon: string;
  title: string;
  children: React.ReactNode;
  isFirst?: boolean;
}

function PhaseBlock({ status, icon, title, children, isFirst }: PhaseBlockProps) {
  const statusColors = {
    done: "text-green-400",
    active: "text-inspiration-ideas animate-pulse",
    pending: "text-adobe-gray-600",
  };

  // Only render if active or done (do not show pending phases)
  if (status === "pending") return null;

  return (
    <div className={`${!isFirst ? "pt-2 border-t border-white/5" : ""}`}>
      <div className={`font-semibold ${statusColors[status]}`}>
        {icon} {title}
        {status === "done" && <span className="text-green-400/60 ml-2 text-xs">✓</span>}
        {status === "active" && <span className="text-inspiration-ideas/60 ml-2 text-xs">...</span>}
      </div>
      <div className="ml-4">
        {children}
      </div>
    </div>
  );
}

interface ProgressLineProps {
  children: React.ReactNode;
  done?: boolean;
  active?: boolean;
  isFyi?: boolean;
  isLast?: boolean;
}

function ProgressLine({ children, done, active, isFyi, isLast }: ProgressLineProps) {
  const prefix = isFyi ? "├─ FYI:" : isLast ? "└─" : "├─";
  const textColor = done ? "text-adobe-gray-300" : active ? "text-white" : "text-adobe-gray-500";
  
  return (
    <div className={`${textColor} ${active ? "font-medium" : ""}`}>
      <span className="text-adobe-gray-600">{prefix}</span>{" "}
      {children}
    </div>
  );
}
