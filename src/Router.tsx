import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import AgentsHome from './pages/AgentsHome'
import './lib/blocks'
import { useAgents } from './contexts/AgentsContext'
import { useActiveAgentRunners } from './hooks/useActiveAgentRunners'
import { useWalletAddress } from './hooks/useWalletAddress'

function AgentRunners() {
  const { agents } = useAgents()
  const walletAddress = useWalletAddress()
  useActiveAgentRunners(agents, (payload) => {
    console.log('[Agent trigger]', payload)
  }, { walletAddress: walletAddress ?? undefined })
  return null
}

export default function Router() {
  return (
    <BrowserRouter>
      <AgentRunners />
      <Routes>
        <Route path="/" element={<AgentsHome />} />
        <Route path="/new" element={<App />} />
        <Route path="/agent/:id" element={<App />} />
      </Routes>
    </BrowserRouter>
  )
}
