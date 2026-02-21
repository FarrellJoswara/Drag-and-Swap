import {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from 'react'

export type CompletedBlock = {
  nodeId: string
  blockType: string
  label: string
  result?: Record<string, string>
}

interface RunProgressContextValue {
  /** Whether a run is in progress (from Run Once or action block) */
  isRunning: boolean
  /** Node ID of the block currently executing */
  currentBlockNodeId: string | null
  /** Block type of the current block (for display) */
  currentBlockType: string | null
  /** Label of the current block (for display) */
  currentBlockLabel: string | null
  /** Blocks that have completed, in order */
  completedBlocks: CompletedBlock[]
  /** Called when a run starts (trigger node id) */
  startRun: (triggerNodeId: string) => void
  /** Called when a run ends */
  endRun: () => void
  /** Called when a block starts executing */
  onBlockStart: (nodeId: string, blockType: string, label: string) => void
  /** Called when a block completes */
  onBlockComplete: (nodeId: string, blockType: string, label: string, result?: Record<string, string>) => void
}

const RunProgressContext = createContext<RunProgressContextValue | null>(null)

const FALLBACK: RunProgressContextValue = {
  isRunning: false,
  currentBlockNodeId: null,
  currentBlockType: null,
  currentBlockLabel: null,
  completedBlocks: [],
  startRun: () => {},
  endRun: () => {},
  onBlockStart: () => {},
  onBlockComplete: () => {},
}

export function RunProgressProvider({ children }: { children: ReactNode }) {
  const [isRunning, setIsRunning] = useState(false)
  const [currentBlockNodeId, setCurrentBlockNodeId] = useState<string | null>(null)
  const [currentBlockType, setCurrentBlockType] = useState<string | null>(null)
  const [currentBlockLabel, setCurrentBlockLabel] = useState<string | null>(null)
  const [completedBlocks, setCompletedBlocks] = useState<CompletedBlock[]>([])

  const startRun = useCallback((_triggerNodeId: string) => {
    setIsRunning(true)
    setCurrentBlockNodeId(null)
    setCurrentBlockType(null)
    setCurrentBlockLabel(null)
    setCompletedBlocks([])
  }, [])

  const endRun = useCallback(() => {
    setIsRunning(false)
    setCurrentBlockNodeId(null)
    setCurrentBlockType(null)
    setCurrentBlockLabel(null)
  }, [])

  const onBlockStart = useCallback((nodeId: string, blockType: string, label: string) => {
    setCurrentBlockNodeId(nodeId)
    setCurrentBlockType(blockType)
    setCurrentBlockLabel(label)
  }, [])

  const onBlockComplete = useCallback(
    (nodeId: string, blockType: string, label: string, result?: Record<string, string>) => {
      setCurrentBlockNodeId(null)
      setCurrentBlockType(null)
      setCurrentBlockLabel(null)
      setCompletedBlocks((prev) => [...prev, { nodeId, blockType, label, result }])
    },
    [],
  )

  const value: RunProgressContextValue = {
    isRunning,
    currentBlockNodeId,
    currentBlockType,
    currentBlockLabel,
    completedBlocks,
    startRun,
    endRun,
    onBlockStart,
    onBlockComplete,
  }

  return (
    <RunProgressContext.Provider value={value}>
      {children}
    </RunProgressContext.Provider>
  )
}

export function useRunProgress(): RunProgressContextValue {
  const ctx = useContext(RunProgressContext)
  if (!ctx) return FALLBACK
  return ctx
}
