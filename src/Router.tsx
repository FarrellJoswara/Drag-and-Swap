import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import AgentsHome from './pages/AgentsHome'
import './lib/blocks'
import { useAgents } from './contexts/AgentsContext'
import { useActiveAgentRunners } from './hooks/useActiveAgentRunners'
import { useWalletAddress } from './hooks/useWalletAddress'
import { useSendTransaction } from './hooks/useSendTransaction'
import { useSignTypedData } from './hooks/useSignTypedData'
import { useAddServerSigner } from './hooks/useAddServerSigner'
import { executeSwapOnBehalf } from './services/executeSwapOnBehalf'
import { DisplayValueProvider } from './contexts/DisplayValueContext'
import { CurrentFlowProvider } from './contexts/CurrentFlowContext'
import { GraphSeriesProvider } from './contexts/GraphSeriesContext'
import { RunProgressProvider } from './contexts/RunProgressContext'

function AgentRunners() {
  const { agents } = useAgents()
  const walletAddress = useWalletAddress()
  const sendTransaction = useSendTransaction()
  const signTypedData = useSignTypedData()
  const { addServerSigner } = useAddServerSigner()
  useActiveAgentRunners(agents, (payload) => {
    console.log('[Agent trigger]', payload)
  }, {
    walletAddress: walletAddress ?? undefined,
    sendTransaction: sendTransaction ?? undefined,
    signTypedData: signTypedData ?? undefined,
    addServerSigner: addServerSigner ?? undefined,
    sendTransactionServer: executeSwapOnBehalf,
  })
  return null
}

export default function Router() {
  return (
    <BrowserRouter>
      <DisplayValueProvider>
        <GraphSeriesProvider>
          <RunProgressProvider>
          <CurrentFlowProvider>
            <AgentRunners />
            <Routes>
          <Route path="/" element={<AgentsHome />} />
          <Route path="/new" element={<App />} />
          <Route path="/agent/:id" element={<App />} />
            </Routes>
          </CurrentFlowProvider>
          </RunProgressProvider>
        </GraphSeriesProvider>
      </DisplayValueProvider>
    </BrowserRouter>
  )
}
