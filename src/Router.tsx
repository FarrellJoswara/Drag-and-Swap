import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import AgentsHome from './pages/AgentsHome'
import './lib/blocks'
import { useAgents } from './contexts/AgentsContext'
import { useActiveAgentRunners } from './hooks/useActiveAgentRunners'
import { useWalletAddress } from './hooks/useWalletAddress'
import { useSendTransaction } from './hooks/useSendTransaction'

function AgentRunners() {
  const { agents } = useAgents()
  const walletAddress = useWalletAddress()
  const sendTransaction = useSendTransaction()
  useActiveAgentRunners(agents, (payload) => {
    console.log('[Agent trigger]', payload)
  }, { walletAddress: walletAddress ?? undefined, sendTransaction: sendTransaction ?? undefined })
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
