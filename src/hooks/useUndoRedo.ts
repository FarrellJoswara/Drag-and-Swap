import { useCallback, useRef, useState } from 'react'
import type { Node, Edge } from '@xyflow/react'

interface Snapshot {
  nodes: Node[]
  edges: Edge[]
}

const MAX_HISTORY = 50

export function useUndoRedo(nodes: Node[], edges: Edge[]) {
  const past = useRef<Snapshot[]>([])
  const future = useRef<Snapshot[]>([])
  const [, rerender] = useState(0)

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges

  const takeSnapshot = useCallback(() => {
    past.current = [
      ...past.current.slice(-(MAX_HISTORY - 1)),
      {
        nodes: JSON.parse(JSON.stringify(nodesRef.current)),
        edges: JSON.parse(JSON.stringify(edgesRef.current)),
      },
    ]
    future.current = []
    rerender((c) => c + 1)
  }, [])

  const undo = useCallback(
    (
      setNodes: (nodes: Node[]) => void,
      setEdges: (edges: Edge[]) => void,
    ) => {
      const snapshot = past.current.pop()
      if (!snapshot) return false
      future.current.push({
        nodes: JSON.parse(JSON.stringify(nodesRef.current)),
        edges: JSON.parse(JSON.stringify(edgesRef.current)),
      })
      setNodes(snapshot.nodes)
      setEdges(snapshot.edges)
      rerender((c) => c + 1)
      return true
    },
    [],
  )

  const redo = useCallback(
    (
      setNodes: (nodes: Node[]) => void,
      setEdges: (edges: Edge[]) => void,
    ) => {
      const snapshot = future.current.pop()
      if (!snapshot) return false
      past.current.push({
        nodes: JSON.parse(JSON.stringify(nodesRef.current)),
        edges: JSON.parse(JSON.stringify(edgesRef.current)),
      })
      setNodes(snapshot.nodes)
      setEdges(snapshot.edges)
      rerender((c) => c + 1)
      return true
    },
    [],
  )

  return {
    takeSnapshot,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  }
}
