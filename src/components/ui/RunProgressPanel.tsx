import { Loader2, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { useRunProgress } from '../../contexts/RunProgressContext'

const MAX_PREVIEW_LENGTH = 80

function truncateResult(result: Record<string, string>): string {
  const str = JSON.stringify(result)
  if (str.length <= MAX_PREVIEW_LENGTH) return str
  return str.slice(0, MAX_PREVIEW_LENGTH) + '…'
}

export default function RunProgressPanel() {
  const {
    isRunning,
    currentBlockNodeId,
    currentBlockLabel,
    currentBlockType,
    completedBlocks,
  } = useRunProgress()
  const [expanded, setExpanded] = useState(true)

  if (!isRunning && completedBlocks.length === 0) return null

  return (
    <div
      className="absolute bottom-[200px] right-8 z-10 w-72 rounded-lg border border-slate-700/80 bg-slate-900/95 shadow-xl backdrop-blur-sm"
      style={{ maxHeight: '40vh' }}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-slate-800/50 rounded-t-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 size={14} className="animate-spin text-amber-400" />
          ) : (
            <Check size={14} className="text-emerald-400" />
          )}
          <span className="text-xs font-medium text-slate-200">
            {isRunning
              ? currentBlockLabel
                ? `Running: ${currentBlockLabel}`
                : 'Running…'
              : 'Run complete'}
          </span>
        </div>
        {expanded ? (
          <ChevronDown size={14} className="text-slate-500" />
        ) : (
          <ChevronUp size={14} className="text-slate-500" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-700/80 overflow-y-auto max-h-64">
          {completedBlocks.map((b, i) => (
            <div
              key={`${b.nodeId}-${i}`}
              className="px-3 py-2 border-b border-slate-800/60 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <Check size={12} className="shrink-0 text-emerald-500" />
                <span className="text-[11px] font-medium text-slate-300">
                  {b.label}
                </span>
                <span className="text-[10px] text-slate-500">({b.blockType})</span>
              </div>
              {b.result && Object.keys(b.result).length > 0 && (
                <pre className="mt-1 text-[10px] text-slate-500 font-mono overflow-x-auto whitespace-pre-wrap break-all">
                  {truncateResult(b.result)}
                </pre>
              )}
            </div>
          ))}
          {isRunning && currentBlockNodeId && currentBlockLabel && (
            <div className="px-3 py-2 bg-amber-500/5 border-l-2 border-amber-500/50">
              <div className="flex items-center gap-2">
                <Loader2 size={12} className="shrink-0 animate-spin text-amber-400" />
                <span className="text-[11px] font-medium text-amber-300">
                  {currentBlockLabel}
                </span>
                <span className="text-[10px] text-slate-500">({currentBlockType})</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
