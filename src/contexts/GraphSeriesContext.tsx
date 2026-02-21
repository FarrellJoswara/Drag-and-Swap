import {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from 'react'

const MAX_POINTS = 200

export type GraphPoint = { timestamp: number; value: number }

/** agentId -> nodeId -> points (oldest first, newest last) */
type GraphSeriesState = Record<string, Record<string, GraphPoint[]>>

interface GraphSeriesContextValue {
  getSeries: (agentId: string | undefined, nodeId: string) => GraphPoint[]
  appendPoint: (agentId: string, nodeId: string, point: GraphPoint) => void
  clearSeries: (agentId: string, nodeId: string) => void
}

const GraphSeriesContext = createContext<GraphSeriesContextValue | null>(null)

const FALLBACK: GraphSeriesContextValue = {
  getSeries: () => [],
  appendPoint: () => {},
  clearSeries: () => {},
}

export function GraphSeriesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GraphSeriesState>(() => ({}))

  const appendPoint = useCallback((agentId: string, nodeId: string, point: GraphPoint) => {
    setState((prev) => {
      const agent = prev[agentId] ?? {}
      const points = agent[nodeId] ?? []
      const next = [...points, point].slice(-MAX_POINTS)
      return {
        ...prev,
        [agentId]: { ...agent, [nodeId]: next },
      }
    })
  }, [])

  const clearSeries = useCallback((agentId: string, nodeId: string) => {
    setState((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], [nodeId]: [] },
    }))
  }, [])

  const getSeries = useCallback(
    (agentId: string | undefined, nodeId: string): GraphPoint[] => {
      if (!agentId) return []
      return state[agentId]?.[nodeId] ?? []
    },
    [state],
  )

  return (
    <GraphSeriesContext.Provider value={{ getSeries, appendPoint, clearSeries }}>
      {children}
    </GraphSeriesContext.Provider>
  )
}

export function useGraphSeries(): GraphSeriesContextValue {
  const ctx = useContext(GraphSeriesContext)
  if (!ctx) return FALLBACK
  return ctx
}
