import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import AgentsHome from './pages/AgentsHome'
import './lib/blocks'
import { useAgents } from './contexts/AgentsContext'
import { useActiveAgentRunners } from './hooks/useActiveAgentRunners'
import { useWalletAddress } from './hooks/useWalletAddress'
import { useSendTransaction } from './hooks/useSendTransaction'
import { useSignTypedData } from './hooks/useSignTypedData'
import { DisplayValueProvider } from './contexts/DisplayValueContext'
import { CurrentFlowProvider } from './contexts/CurrentFlowContext'

function AgentRunners() {
  const { agents } = useAgents()
  const walletAddress = useWalletAddress()
  const sendTransaction = useSendTransaction()
  const signTypedData = useSignTypedData()
  useActiveAgentRunners(agents, (payload) => {
    console.log('[Agent trigger]', payload)
  }, { walletAddress: walletAddress ?? undefined, sendTransaction: sendTransaction ?? undefined, signTypedData: signTypedData ?? undefined })
  return null
}

export default function Router() {
  return (
    <BrowserRouter>
      <DisplayValueProvider>
        <CurrentFlowProvider>
          <AgentRunners />
          <Routes>
          <Route path="/" element={<AgentsHome />} />
          <Route path="/new" element={<App />} />
          <Route path="/agent/:id" element={<App />} />
          </Routes>
        </CurrentFlowProvider>
      </DisplayValueProvider>
    </BrowserRouter>
  )
}
