import { X } from 'lucide-react'
import type { DeployedAgent } from '../../types/agent'

interface AgentSettingsModalProps {
  agent: DeployedAgent
  isOpen: boolean
  onClose: () => void
  onToggleTradeOnBehalf: (id: string, enabled: boolean) => void
}

export default function AgentSettingsModal({
  agent,
  isOpen,
  onClose,
  onToggleTradeOnBehalf,
}: AgentSettingsModalProps) {
  if (!isOpen) return null

  const enabled = agent.allowTradeOnBehalf === true

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-slate-800 bg-[#0f1117] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100">Agent settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/80 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500 mb-4">{agent.name}</p>
          <label className="flex items-center justify-between gap-3 cursor-pointer group">
            <span className="text-xs text-slate-300 group-hover:text-slate-200">
              Allow this agent to trade on my behalf
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => onToggleTradeOnBehalf(agent.id, !enabled)}
              className={`
                relative w-9 h-5 rounded-full transition-colors
                ${enabled ? 'bg-violet-500' : 'bg-slate-700'}
              `}
            >
              <span
                className={`
                  absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform
                  ${enabled ? 'left-4' : 'left-0.5'}
                `}
              />
            </button>
          </label>
          <p className="text-[10px] text-slate-500 mt-2">
            When on, this agent can use your wallet to execute swaps (e.g. when triggers run). You must enable “Allow apps to trade on my behalf” in Settings first.
          </p>
        </div>
      </div>
    </div>
  )
}
