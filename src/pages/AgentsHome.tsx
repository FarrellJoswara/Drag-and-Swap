import { usePrivy } from '@privy-io/react-auth'
import { Link } from 'react-router-dom'
import { Plus, Wallet, LayoutGrid, ArrowRight } from 'lucide-react'
import { useAgents } from '../contexts/AgentsContext'
import { useWalletAddress } from '../hooks/useWalletAddress'
import AgentCard from '../components/agents/AgentCard'

export default function AgentsHome() {
  const { ready, authenticated, login, logout } = usePrivy()
  const walletAddress = useWalletAddress()
  const { agents, toggleActive, removeAgent, updateAgent } = useAgents()

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="animate-pulse text-slate-500 text-sm">Loading…</div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mx-auto mb-6">
            <Wallet size={28} className="text-indigo-400" />
          </div>
          <h1 className="text-xl font-semibold text-slate-100 mb-2">
            Connect your wallet
          </h1>
          <p className="text-sm text-slate-500 mb-8">
            Sign in with Privy to view and manage your deployed agents. Your
            wallet is required when deploying agents.
          </p>
          <button
            onClick={login}
            className="w-full py-3 px-4 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <header className="app-topbar">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-slate-300 hover:text-slate-100 transition-colors"
          >
            <img src="/logo-alt.png" alt="Dragn Swap Logo" className="w-12 h-12 object-contain opacity-90 hover:opacity-100 transition-opacity flex-shrink-0" />
            <span className="text-sm font-semibold">Dragn Swap</span>
          </Link>
          <div className="h-3 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <LayoutGrid size={14} className="text-indigo-400" />
            <span className="text-xs font-semibold text-slate-100">
              My Agents
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {walletAddress && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <Wallet size={12} className="text-slate-500" />
              <span className="text-xs font-mono text-slate-400 truncate max-w-[140px]">
                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </span>
            </div>
          )}
          <button
            onClick={logout}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Disconnect
          </button>
          <Link
            to="/new"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
          >
            <Plus size={12} />
            Create Agent
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-6">
                <LayoutGrid size={36} className="text-slate-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-200 mb-2">
                No agents yet
              </h2>
              <p className="text-sm text-slate-500 mb-8 max-w-sm">
                Deploy agents from the canvas to see them here. Connect blocks,
                then click Deploy Agent. Your wallet must be connected.
              </p>
              <Link
                to="/new"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
              >
                <ArrowRight size={14} />
                Create your first agent
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-medium text-slate-500">
                  {agents.length} agent{agents.length !== 1 ? 's' : ''}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onToggleActive={toggleActive}
                    onRemove={removeAgent}
                    onRename={(id, name) => updateAgent(id, { name })}
                    editPath={`/agent/${agent.id}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
