import { useState } from 'react'
import { Activity, CheckCircle, Power, PowerOff, Redo2, Rocket, Save, Trash2, Undo2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { Edge, Node } from '@xyflow/react'
import { buildConnectedModel } from '../../utils/buildConnectedModel'
import { useToast } from './Toast'
import { usePrivy } from '@privy-io/react-auth'
import { useWalletAddress } from '../../hooks/useWalletAddress'
import { useAgents } from '../../contexts/AgentsContext'
import DeployNameModal from './DeployNameModal'

interface TopbarProps {
  agentId?: string
  nodes: Node[]
  edges: Edge[]
  onClear: () => void
  onUndo: () => boolean
  onRedo: () => boolean
  canUndo: boolean
  canRedo: boolean
  /** When true, show unsaved indicator and warn when turning Run on */
  hasUnsavedChanges?: boolean
}

export default function Topbar({
  agentId,
  nodes,
  edges,
  onClear,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  hasUnsavedChanges = false,
}: TopbarProps) {
  const { toast } = useToast()
  const { authenticated, login } = usePrivy()
  const walletAddress = useWalletAddress()
  const { addAgent, updateAgentModel, getAgentById, toggleActive } = useAgents()
  const [showDeployModal, setShowDeployModal] = useState(false)
  const navigate = useNavigate()
  const defaultDeployName = `Agent ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

  const agent = agentId ? getAgentById(agentId) : undefined
  const isActive = agent?.isActive ?? false

  const doDeploy = (name?: string) => {
    if (nodes.length === 0) {
      toast('Add some blocks before deploying', 'warning')
      return
    }
    if (!walletAddress) {
      toast('Connect your wallet to deploy agents', 'warning')
      return
    }
    const connectedModel = buildConnectedModel(nodes, edges)
    const flowData = { nodes, edges }

    if (agentId) {
      const agent = getAgentById(agentId)
      if (agent) {
        updateAgentModel(agentId, {
          model: connectedModel,
          flowData,
          name: agent.name,
        })
        toast('Agent updated', 'success')
      }
    } else {
      addAgent({
        name: name ?? defaultDeployName,
        model: connectedModel,
        flowData,
        walletAddress,
        isActive: true,
      })
      toast('Agent deployed', 'success')
      setShowDeployModal(false)
    }
    navigate(`/`)
  }

  const handleDeploy = () => {
    if (agentId) {
      doDeploy()
    } else {
      setShowDeployModal(true)
    }
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

  const handleSave = () => {
    if (!agentId || !agent || nodes.length === 0) return
    if (!walletAddress) {
      toast('Connect your wallet to save', 'warning')
      return
    }
    const connectedModel = buildConnectedModel(nodes, edges)
    const flowData = { nodes, edges }
    updateAgentModel(agentId, {
      model: connectedModel,
      flowData,
      name: agent.name,
    })
    toast('Flow saved', 'success')
  }

  const handleToggleActive = () => {
    if (!agentId) return
    if (!isActive && hasUnsavedChanges) {
      toast('Save or Redeploy to run the latest version', 'warning')
      return
    }
    toggleActive(agentId)
  }

  return (
    <header className="app-topbar">
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
          to="/"
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          My Agents
        </Link>
        {agentId && agent && (
          <>
            <button
              onClick={handleToggleActive}
              title={isActive ? 'Stop agent' : 'Run agent'}
              className={`
                flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150
                ${isActive ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-slate-800/80 text-slate-500 hover:bg-slate-700 hover:text-slate-300'}
              `}
            >
              {isActive ? <Power size={14} className="text-emerald-400" /> : <PowerOff size={14} />}
            </button>
            <button
              onClick={handleSave}
              disabled={!walletAddress || nodes.length === 0}
              title="Save flow (stay on canvas)"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 bg-transparent hover:bg-slate-800 rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={12} />
              Save
            </button>
            {hasUnsavedChanges && (
              <span className="text-[10px] text-amber-500/90 font-medium">Unsaved</span>
            )}
          </>
        )}
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
            title={!walletAddress ? 'Connect wallet to deploy' : agentId ? 'Redeploy and go to My Agents' : undefined}
            className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Rocket size={12} />
            {agentId ? 'Redeploy' : 'Deploy Agent'}
          </button>
        )}
      </div>

      <DeployNameModal
        isOpen={showDeployModal}
        defaultName={defaultDeployName}
        onConfirm={(name) => doDeploy(name)}
        onCancel={() => setShowDeployModal(false)}
      />
    </header>
  )
}
