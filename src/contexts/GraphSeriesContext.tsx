import {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from 'react'

const MAX_POINTS = 200
export const MULTIGRAPH_MAX_SERIES = 5

export type GraphPoint = { timestamp: number; value: number }

/** agentId -> nodeId -> seriesIndex ("0"|"1"|"2") -> points */
type GraphSeriesState = Record<string, Record<string, Record<string, GraphPoint[]>>>
/** agentId -> nodeId -> paused */
type PausedState = Record<string, Record<string, boolean>>

interface GraphSeriesContextValue {
  getSeries: (agentId: string | undefined, nodeId: string) => GraphPoint[]
  getMultigraphSeries: (agentId: string | undefined, nodeId: string) => GraphPoint[][]
  appendPoint: (agentId: string, nodeId: string, point: GraphPoint, seriesIndex?: number) => void
  clearSeries: (agentId: string, nodeId: string, seriesIndex?: number) => void
  setPaused: (agentId: string, nodeId: string, paused: boolean) => void
  getPaused: (agentId: string | undefined, nodeId: string) => boolean
}

const GraphSeriesContext = createContext<GraphSeriesContextValue | null>(null)

const FALLBACK: GraphSeriesContextValue = {
  getSeries: () => [],
  getMultigraphSeries: () => [],
  appendPoint: () => {},
  clearSeries: () => {},
  setPaused: () => {},
  getPaused: () => false,
}

function seriesKey(index: number): string {
  return String(index)
}

export function GraphSeriesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GraphSeriesState>(() => ({}))
  const [pausedState, setPausedState] = useState<PausedState>(() => ({}))

  const appendPoint = useCallback(
    (agentId: string, nodeId: string, point: GraphPoint, seriesIndex = 0) => {
      setState((prev) => {
        const agent = prev[agentId] ?? {}
        const node = agent[nodeId] ?? {}
        const key = seriesKey(seriesIndex)
        const points = node[key] ?? []
        const next = [...points, point].slice(-MAX_POINTS)
        return {
          ...prev,
          [agentId]: {
            ...agent,
            [nodeId]: { ...node, [key]: next },
          },
        }
      })
    },
    [],
  )

  const clearSeries = useCallback((agentId: string, nodeId: string, seriesIndex?: number) => {
    setState((prev) => {
      const agent = prev[agentId] ?? {}
      const node = agent[nodeId] ?? {}
      if (seriesIndex === undefined) {
        return {
          ...prev,
          [agentId]: { ...agent, [nodeId]: {} },
        }
      }
      const key = seriesKey(seriesIndex)
      const nextNode = { ...node, [key]: [] }
      return {
        ...prev,
        [agentId]: { ...agent, [nodeId]: nextNode },
      }
    })
  }, [])

  const getSeries = useCallback(
    (agentId: string | undefined, nodeId: string): GraphPoint[] => {
      if (!agentId) return []
      return state[agentId]?.[nodeId]?.[seriesKey(0)] ?? []
    },
    [state],
  )

  const getMultigraphSeries = useCallback(
    (agentId: string | undefined, nodeId: string): GraphPoint[][] => {
      if (!agentId) return []
      const node = state[agentId]?.[nodeId]
      if (!node) return Array.from({ length: MULTIGRAPH_MAX_SERIES }, () => [])
      return Array.from({ length: MULTIGRAPH_MAX_SERIES }, (_, i) => node[seriesKey(i)] ?? [])
    },
    [state],
  )

  const setPaused = useCallback((agentId: string, nodeId: string, paused: boolean) => {
    setPausedState((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], [nodeId]: paused },
    }))
  }, [])

  const getPaused = useCallback(
    (agentId: string | undefined, nodeId: string): boolean => {
      if (!agentId) return false
      return Boolean(pausedState[agentId]?.[nodeId])
    },
    [pausedState],
  )

  return (
    <GraphSeriesContext.Provider
      value={{
        getSeries,
        getMultigraphSeries,
        appendPoint,
        clearSeries,
        setPaused,
        getPaused,
      }}
    >
      {children}
    </GraphSeriesContext.Provider>
  )
}

export function useGraphSeries(): GraphSeriesContextValue {
  const ctx = useContext(GraphSeriesContext)
  if (!ctx) return FALLBACK
  return ctx
}
