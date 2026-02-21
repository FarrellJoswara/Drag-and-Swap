import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Power, PowerOff, Pencil, Trash2, Settings } from 'lucide-react'
import type { DeployedAgent } from '../../types/agent'

interface AgentCardProps {
  agent: DeployedAgent
  onToggleActive: (id: string) => void
  onRemove: (id: string) => void
  onRename: (id: string, name: string) => void
  onOpenSettings: () => void
  editPath: string
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return d.toLocaleDateString()
}

export default function AgentCard({
  agent,
  onToggleActive,
  onRemove,
  onRename,
  onOpenSettings,
  editPath,
}: AgentCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(agent.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      setEditName(agent.name)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing, agent.name])

  const handleSaveRename = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== agent.name) {
      onRename(agent.id, trimmed)
    }
    setIsEditing(false)
  }

  const nodeCount = agent.model.nodes.length
  const edgeCount = agent.model.edges.length

  return (
    <Link
      to={editPath}
      className={`
        block group relative rounded-xl border transition-all duration-200
        bg-[#0f1117] border-slate-800/80
        hover:border-slate-700/80 hover:shadow-lg hover:shadow-black/20
        ${agent.isActive ? 'ring-1 ring-emerald-500/30' : ''}
      `}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    inputRef.current?.blur()
                  }
                  if (e.key === 'Escape') {
                    setEditName(agent.name)
                    setIsEditing(false)
                    inputRef.current?.blur()
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full px-2 py-1 text-sm font-semibold bg-slate-900 border border-slate-700 rounded text-slate-100 outline-none focus:border-indigo-500/50"
              />
            ) : (
              <div
                className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-800/50 rounded px-1 -mx-1 py-0.5 -my-0.5 transition-colors"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsEditing(true)
                }}
              >
                <h3 className="text-sm font-semibold text-slate-100 truncate flex-1 min-w-0">
                  {agent.name}
                </h3>
                <Pencil size={11} className="text-slate-600 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
              </div>
            )}
            {agent.description && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                {agent.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] text-slate-600 font-mono">
                {nodeCount} nodes · {edgeCount} edges
              </span>
              <span className="text-[10px] text-slate-600">
                {formatDate(agent.deployedAt)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.preventDefault()}>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onOpenSettings()
              }}
              title="Agent settings"
              className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/80 transition-all duration-150 opacity-0 group-hover:opacity-100"
            >
              <Settings size={14} />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onToggleActive(agent.id)
              }}
              title={agent.isActive ? 'Deactivate' : 'Activate'}
              className={`
                flex items-center justify-center w-9 h-9 rounded-lg
                transition-all duration-150
                ${
                  agent.isActive
                    ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                    : 'bg-slate-800/80 text-slate-500 hover:bg-slate-700 hover:text-slate-300'
                }
              `}
            >
              {agent.isActive ? (
                <Power size={14} className="text-emerald-400" />
              ) : (
                <PowerOff size={14} />
              )}
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onRemove(agent.id)
              }}
              title="Remove"
              className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-150 opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {(agent.isActive || agent.allowTradeOnBehalf) && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-800/60 flex-wrap">
            {agent.isActive && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-medium text-emerald-500/90">Active</span>
              </div>
            )}
            {agent.allowTradeOnBehalf && (
              <span className="text-[10px] font-medium text-violet-400/90">Can trade on my behalf</span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}
