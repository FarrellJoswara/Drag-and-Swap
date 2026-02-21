import { createContext, useContext, type ReactNode } from 'react'

const AgentIdContext = createContext<string | undefined>(undefined)

export function AgentIdProvider({
  agentId,
  children,
}: {
  agentId: string | undefined
  children: ReactNode
}) {
  return (
    <AgentIdContext.Provider value={agentId}>
      {children}
    </AgentIdContext.Provider>
  )
}

export function useAgentId(): string | undefined {
  return useContext(AgentIdContext)
}
