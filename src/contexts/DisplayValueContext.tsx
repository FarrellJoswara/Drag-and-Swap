import {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from 'react'

const MAX_CONSOLE_LINES = 200

function formatTime(d: Date): string {
  return d.toTimeString().slice(0, 8)
}

/** agentId -> nodeId -> console lines (newest last) */
type DisplayLogState = Record<string, Record<string, { time: string; value: string }[]>>

interface DisplayValueContextValue {
  getDisplayValue: (agentId: string | undefined, nodeId: string) => string | undefined
  setDisplayValue: (agentId: string, nodeId: string, value: string) => void
  clearDisplayValue: (agentId: string, nodeId: string) => void
}

const DisplayValueContext = createContext<DisplayValueContextValue | null>(null)

/** Stable fallback when context is null so consumers (e.g. useActiveAgentRunners) get a constant reference. */
const FALLBACK_DISPLAY_VALUE: DisplayValueContextValue = {
  getDisplayValue: () => undefined,
  setDisplayValue: () => {},
  clearDisplayValue: () => {},
}

export function DisplayValueProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DisplayLogState>(() => ({}))

  const setDisplayValue = useCallback((agentId: string, nodeId: string, value: string) => {
    const time = formatTime(new Date())
    setState((prev) => {
      const agent = prev[agentId] ?? {}
      const lines = agent[nodeId] ?? []
      const next = [...lines, { time, value }].slice(-MAX_CONSOLE_LINES)
      return {
        ...prev,
        [agentId]: { ...agent, [nodeId]: next },
      }
    })
  }, [])

  const clearDisplayValue = useCallback((agentId: string, nodeId: string) => {
    setState((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], [nodeId]: [] },
    }))
  }, [])

  const getDisplayValue = useCallback(
    (agentId: string | undefined, nodeId: string): string | undefined => {
      if (!agentId) return undefined
      const lines = state[agentId]?.[nodeId]
      if (!lines?.length) return undefined
      return lines.map(({ time, value }) => `[${time}] ${value}`).join('\n')
    },
    [state],
  )

  return (
    <DisplayValueContext.Provider value={{ getDisplayValue, setDisplayValue, clearDisplayValue }}>
      {children}
    </DisplayValueContext.Provider>
  )
}

export function useDisplayValue(): DisplayValueContextValue {
  const ctx = useContext(DisplayValueContext)
  if (!ctx) return FALLBACK_DISPLAY_VALUE
  return ctx
}
