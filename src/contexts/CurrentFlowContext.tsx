import {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from 'react'
import type { Node, Edge } from '@xyflow/react'

export interface CurrentFlow {
  nodes: Node[]
  edges: Edge[]
}

type CurrentFlowState = Record<string, CurrentFlow | null>

interface CurrentFlowContextValue {
  setCurrentFlow: (agentId: string | null, flow: CurrentFlow | null) => void
  getCurrentFlow: (agentId: string) => CurrentFlow | null
}

const CurrentFlowContext = createContext<CurrentFlowContextValue | null>(null)

export function CurrentFlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CurrentFlowState>(() => ({}))

  const setCurrentFlow = useCallback((agentId: string | null, flow: CurrentFlow | null) => {
    if (!agentId) return
    setState((prev) => ({ ...prev, [agentId]: flow }))
  }, [])

  const getCurrentFlow = useCallback(
    (agentId: string): CurrentFlow | null => state[agentId] ?? null,
    [state],
  )

  return (
    <CurrentFlowContext.Provider value={{ setCurrentFlow, getCurrentFlow }}>
      {children}
    </CurrentFlowContext.Provider>
  )
}

export function useCurrentFlow(): CurrentFlowContextValue {
  const ctx = useContext(CurrentFlowContext)
  if (!ctx) {
    return {
      setCurrentFlow: () => {},
      getCurrentFlow: () => null,
    }
  }
  return ctx
}
