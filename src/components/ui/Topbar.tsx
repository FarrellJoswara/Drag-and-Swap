import { Activity, CheckCircle, Redo2, Rocket, Trash2, Undo2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Edge, Node } from '@xyflow/react'
import { buildConnectedModel } from '../../utils/buildConnectedModel'
import { useToast } from './Toast'
import { usePrivy } from '@privy-io/react-auth'
import { useWalletAddress } from '../../hooks/useWalletAddress'
import { useAgents } from '../../hooks/useAgents'

interface TopbarProps {
  nodes: Node[]
  edges: Edge[]
  onClear: () => void
  onUndo: () => boolean
  onRedo: () => boolean
  canUndo: boolean
  canRedo: boolean
}

export default function Topbar({
  nodes,
  edges,
  onClear,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: TopbarProps) {
  const { toast } = useToast()
  const { authenticated, login } = usePrivy()
  const walletAddress = useWalletAddress()
  const { addAgent } = useAgents(walletAddress)

  const handleDeploy = () => {
    if (nodes.length === 0) {
      toast('Add some blocks before deploying', 'warning')
      return
    }
    if (!walletAddress) {
      toast('Connect your wallet to deploy agents', 'warning')
      return
    }
    const connectedModel = buildConnectedModel(nodes, edges)
    const name = `Agent ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    addAgent({
      name,
      model: connectedModel,
      walletAddress,
      isActive: false,
    })
    toast(`Agent deployed — view in My Agents`, 'success')
  }

  const handleClear = () => {
    onClear()
    toast('Canvas cleared', 'info')
  }

  const handleUndo = () => {
    if (!onUndo()) toast('Nothing to undo', 'info')
  }

  const handleRedo = () => {
    if (!onRedo()) toast('Nothing to redo', 'info')
  }

  return (
    <header className="h-12 flex-shrink-0 flex items-center justify-between px-4 bg-[#0a0a0f] border-b border-slate-800/60">
      {/* Status indicators */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Activity size={12} className="text-slate-600" />
          <span className="text-xs text-slate-500 font-mono">
            {nodes.length} nodes
          </span>
        </div>
        <div className="h-3 w-px bg-slate-800" />
        <div className="flex items-center gap-1.5">
          <CheckCircle size={12} className="text-slate-600" />
          <span className="text-xs text-slate-500 font-mono">
            {edges.length} edges
          </span>
        </div>
        {nodes.length > 0 && (
          <>
            <div className="h-3 w-px bg-slate-800" />
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-emerald-500/80">Ready</span>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="flex items-center justify-center w-8 h-8 text-slate-500 hover:text-slate-300 bg-transparent hover:bg-slate-800 rounded-lg transition-all duration-150 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500"
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="flex items-center justify-center w-8 h-8 text-slate-500 hover:text-slate-300 bg-transparent hover:bg-slate-800 rounded-lg transition-all duration-150 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500"
        >
          <Redo2 size={14} />
        </button>

        <div className="h-5 w-px bg-slate-800 mx-1" />

        {nodes.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-rose-400 bg-transparent hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-lg transition-all duration-150"
          >
            <Trash2 size={12} />
            Clear
          </button>
        )}

        <Link
          to="/agents"
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          My Agents
        </Link>
        {!authenticated ? (
          <button
            onClick={login}
            className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all duration-150"
          >
            Connect Wallet
          </button>
        ) : (
          <button
            onClick={handleDeploy}
            disabled={!walletAddress}
            title={!walletAddress ? 'Connect wallet to deploy' : undefined}
          className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <Rocket size={12} />
            Deploy Agent
          </button>
        )}
      </div>
    </header>
  )
}
