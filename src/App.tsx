import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
} from '@xyflow/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Sidebar from './components/sidebar/Sidebar'
import Topbar from './components/ui/Topbar'
import ContextMenu from './components/ui/ContextMenu'
import MobileWarning from './components/ui/MobileWarning'
import { useToast } from './components/ui/Toast'
import { useUndoRedo } from './hooks/useUndoRedo'
import { useWalletAddress } from './hooks/useWalletAddress'
import { useAgents } from './contexts/AgentsContext'
import { getBlock, minimapColor } from './lib/blockRegistry'
import type { BlockColor } from './lib/blockRegistry'
import GenericNode from './components/nodes/GenericNode'
import { isValidConnection } from './utils/connectionValidation'
import './lib/blocks'

const nodeTypes: NodeTypes = {
  generic: GenericNode,
}

const emptyNodes: Node[] = []
const emptyEdges: Edge[] = []

let idCounter = 10

function getNextId() {
  return `node-${++idCounter}`
}

/** Set idCounter so the next getNextId() won't collide with loaded node IDs. */
function resetNodeIdCounterAfterLoad(nodes: Node[]) {
  let max = 0
  for (const n of nodes) {
    const match = n.id.match(/^node-(\d+)$/)
    if (match) max = Math.max(max, parseInt(match[1], 10))
  }
  if (max > 0) idCounter = max
}

const defaultEdgeOptions = {
  animated: true,
  style: { stroke: '#6366f1', strokeWidth: 2 },
}

interface ContextMenuState {
  x: number
  y: number
  nodeId: string
}

const NODE_SPACING_X = 280
const NODE_SPACING_Y = 140

/** Build flowData from model when flowData is missing (legacy agents). Uses spacing consistent with editor. */
function modelToFlowData(model: {
  nodes: { id: string; type: string; data: Record<string, unknown> }[]
  edges: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }[]
}): { nodes: Node[]; edges: Edge[] } {
  // Dedupe nodes by id (keep first)
  const seenNodeIds = new Set<string>()
  const nodes: Node[] = []
  model.nodes.forEach((n) => {
    if (seenNodeIds.has(n.id)) return
    seenNodeIds.add(n.id)
    nodes.push({
      id: n.id,
      type: (n.type || 'generic') as 'generic',
      position: { x: 120 + (nodes.length % 3) * NODE_SPACING_X, y: 120 + Math.floor(nodes.length / 3) * NODE_SPACING_Y },
      data: n.data,
    })
  })
  // Edges: only where source/target exist, preserve handle IDs, dedupe by id
  const seenEdgeIds = new Set<string>()
  const rawEdges: Edge[] = model.edges
    .filter((e) => seenNodeIds.has(e.source) && seenNodeIds.has(e.target) && !seenEdgeIds.has(e.id) && (seenEdgeIds.add(e.id), true))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      ...(e.sourceHandle != null && { sourceHandle: e.sourceHandle }),
      ...(e.targetHandle != null && { targetHandle: e.targetHandle }),
      animated: true,
      style: { stroke: '#6366f1', strokeWidth: 2 },
    }))
  const normalized = normalizeEdgeHandles(nodes, rawEdges)
  const edges = validateAndFilterEdges(nodes, normalized)
  return { nodes, edges }
}

/** Assign default sourceHandle/targetHandle when missing so React Flow never sees undefined. Drops edges that can't be normalized. */
function normalizeEdgeHandles(nodes: Node[], edges: Edge[]): Edge[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const result: Edge[] = []
  for (const e of edges) {
    const sourceNode = nodeMap.get(e.source)
    const targetNode = nodeMap.get(e.target)
    if (!sourceNode || !targetNode) continue
    const sourceBlock = (sourceNode.data?.blockType as string) ?? sourceNode.type
    const targetBlock = (targetNode.data?.blockType as string) ?? targetNode.type
    const defSource = getBlock(sourceBlock)
    const defTarget = getBlock(targetBlock)
    if (!defSource || !defTarget) continue
    let sourceHandle = e.sourceHandle && String(e.sourceHandle).trim() ? e.sourceHandle : undefined
    let targetHandle = e.targetHandle && String(e.targetHandle).trim() ? e.targetHandle : undefined
    if (!sourceHandle) {
      const first = defSource.outputs[0]
      sourceHandle = first?.name
    }
    if (!targetHandle) {
      const firstConnectable = defTarget.inputs.find((i) => i.type !== 'walletAddress')
      targetHandle = firstConnectable?.name
    }
    if (!sourceHandle || !targetHandle) continue
    result.push({ ...e, sourceHandle, targetHandle })
  }
  return result
}

/** Keep only edges whose sourceHandle and targetHandle exist on the block defs and target is connectable (not walletAddress). */
function validateAndFilterEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  return edges.filter((e) => {
    if (!e.sourceHandle || !e.targetHandle) return false
    const sourceNode = nodeMap.get(e.source)
    const targetNode = nodeMap.get(e.target)
    if (!sourceNode || !targetNode) return false
    const sourceBlock = (sourceNode.data?.blockType as string) ?? sourceNode.type
    const targetBlock = (targetNode.data?.blockType as string) ?? targetNode.type
    const defSource = getBlock(sourceBlock)
    const defTarget = getBlock(targetBlock)
    if (!defSource || !defTarget) return false
    const sourceOk = defSource.outputs.some((o) => o.name === e.sourceHandle)
    if (!sourceOk) return false
    const targetInput = defTarget.inputs.find((i) => i.name === e.targetHandle)
    if (!targetInput || targetInput.type === 'walletAddress') return false
    return true
  })
}

/** Ensure node positions are valid { x, y } objects; dedupe nodes/edges by id. */
function normalizeFlowData(flowData: { nodes: Node[]; edges: Edge[] }): { nodes: Node[]; edges: Edge[] } {
  // Dedupe nodes by id (keep first)
  const seenNodeIds = new Set<string>()
  const nodes: Node[] = flowData.nodes
    .filter((n) => {
      if (seenNodeIds.has(n.id)) return false
      seenNodeIds.add(n.id)
      return true
    })
    .map((n) => ({
      ...n,
      position: {
        x: typeof n.position?.x === 'number' ? n.position.x : 0,
        y: typeof n.position?.y === 'number' ? n.position.y : 0,
      },
    }))
  // Edges: only where source/target in deduped set, dedupe by id, preserve sourceHandle/targetHandle
  const seenEdgeIds = new Set<string>()
  const rawEdges = flowData.edges
    .filter((e) => {
      if (!seenNodeIds.has(e.source) || !seenNodeIds.has(e.target)) return false
      const edgeId = e.id ?? `${e.source}-${e.target}-${e.sourceHandle ?? ''}-${e.targetHandle ?? ''}`
      if (seenEdgeIds.has(edgeId)) return false
      seenEdgeIds.add(edgeId)
      return true
    })
    .map((e) => ({
      ...e,
      animated: e.animated ?? true,
      style: e.style ?? { stroke: '#6366f1', strokeWidth: 2 },
    }))
  const normalized = normalizeEdgeHandles(nodes, rawEdges)
  const edges = validateAndFilterEdges(nodes, normalized)
  return { nodes, edges }
}

export default function App() {
  const { id: agentId } = useParams<{ id: string }>()
  const walletAddress = useWalletAddress()
  const { getAgentById } = useAgents()
  const [nodes, setNodes, onNodesChange] = useNodesState(emptyNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(emptyEdges)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const reactFlowInstance = useRef<Parameters<typeof ReactFlow>[0] & { screenToFlowPosition?: (pos: { x: number; y: number }) => { x: number; y: number } }>(null)

  const { toast } = useToast()
  const { takeSnapshot, undo, redo, canUndo, canRedo } = useUndoRedo(nodes, edges)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const clipboard = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] })
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges
  const getAgentByIdRef = useRef(getAgentById)
  getAgentByIdRef.current = getAgentById

  // Load agent when editing, clear when creating new. Only re-run when route/wallet changes, not when agents list updates.
  useEffect(() => {
    if (!agentId) {
      setNodes(emptyNodes)
      setEdges(emptyEdges)
      return
    }
    if (!walletAddress) return
    const agent = getAgentByIdRef.current(agentId)
    if (!agent) return
    const raw = agent.flowData
      ? agent.flowData
      : modelToFlowData(agent.model)
    const { nodes: n, edges: e } = normalizeFlowData(raw)
    resetNodeIdCounterAfterLoad(n)
    setNodes(n)
    setEdges(e)
  }, [agentId, walletAddress])

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const hasRemove = changes.some((c) => c.type === 'remove')
      if (hasRemove) takeSnapshot()
      onNodesChange(changes)
    },
    [onNodesChange, takeSnapshot],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const hasRemove = changes.some((c) => c.type === 'remove')
      if (hasRemove) takeSnapshot()
      onEdgesChange(changes)
    },
    [onEdgesChange, takeSnapshot],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      // Basic validation - ensure connection has required fields
      if (!connection.source || !connection.target) {
        console.warn('[Connection] Invalid connection object:', connection)
        return
      }

      // Get current nodes from state (use ref to avoid stale closure)
      const currentNodes = nodesRef.current

      // Validate connection types (only if both handles are present)
      const sourceNode = currentNodes.find((n) => n.id === connection.source)
      const targetNode = currentNodes.find((n) => n.id === connection.target)

      // Only validate types if we have complete information
      if (sourceNode && targetNode && connection.sourceHandle && connection.targetHandle) {
        try {
          const validation = isValidConnection(
            sourceNode,
            targetNode,
            connection.sourceHandle,
            connection.targetHandle,
          )

          if (!validation.valid) {
            toast(validation.reason || 'Invalid connection', 'warning')
            return // Reject connection
          }

          // Warn but allow if there's a reason (backward compatibility)
          if (validation.reason && validation.valid) {
            console.warn('[Connection]', validation.reason)
          }
        } catch (error) {
          // If validation throws an error, allow the connection (backward compatibility)
          console.warn('[Connection] Validation error, allowing connection:', error)
        }
      }

      // Create the edge
      takeSnapshot()
      setEdges((eds) =>
        addEdge(
          { ...connection, animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
          eds,
        ),
      )
    },
    [setEdges, takeSnapshot, toast],
  )

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const blockType = event.dataTransfer.getData('application/reactflow')

      if (!blockType || !reactFlowWrapper.current) return

      const definition = getBlock(blockType)
      if (!definition) return

      takeSnapshot()

      const bounds = reactFlowWrapper.current.getBoundingClientRect()
      const position = (reactFlowInstance.current as any)?.screenToFlowPosition?.({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      }) ?? { x: event.clientX - bounds.left - 110, y: event.clientY - bounds.top - 50 }

      const defaultData: Record<string, string> = { blockType }
      for (const field of definition.inputs) {
        if (field.defaultValue !== undefined) {
          defaultData[field.name] = field.defaultValue
        }
      }

      const newNode: Node = {
        id: getNextId(),
        type: 'generic',
        position,
        data: defaultData,
      }

      setNodes((nds) => [...nds, newNode])
    },
    [setNodes, takeSnapshot],
  )

  const onNodeDragStart = useCallback(() => {
    takeSnapshot()
  }, [takeSnapshot])

  const handleClear = useCallback(() => {
    takeSnapshot()
    setNodes([])
    setEdges([])
  }, [setNodes, setEdges, takeSnapshot])

  const handleUndo = useCallback(() => {
    return undo(setNodes, setEdges)
  }, [undo, setNodes, setEdges])

  const handleRedo = useCallback(() => {
    return redo(setNodes, setEdges)
  }, [redo, setNodes, setEdges])

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id })
    },
    [],
  )

  const handleDuplicate = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return
      takeSnapshot()
      const newNode: Node = {
        id: getNextId(),
        type: node.type,
        position: { x: node.position.x + 30, y: node.position.y + 30 },
        data: { ...node.data },
      }
      setNodes((nds) => [...nds, newNode])
      toast('Node duplicated', 'success')
    },
    [nodes, setNodes, takeSnapshot, toast],
  )

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      takeSnapshot()
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
      toast('Node deleted', 'info')
    },
    [setNodes, setEdges, takeSnapshot, toast],
  )

  useEffect(() => {
    const isInputFocused = () => {
      const el = document.activeElement
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      )
    }

    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key === 'z' && !e.shiftKey && !isInputFocused()) {
        e.preventDefault()
        handleUndo()
        return
      }
      if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey) || e.key === 'y') && !isInputFocused()) {
        e.preventDefault()
        handleRedo()
        return
      }

      if (isInputFocused()) return

      const currentNodes = nodesRef.current
      const currentEdges = edgesRef.current
      const selected = currentNodes.filter((n) => n.selected)

      // Delete selected nodes + connected edges
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected.length === 0) return
        takeSnapshot()
        const ids = new Set(selected.map((n) => n.id))
        setNodes((nds) => nds.filter((n) => !ids.has(n.id)))
        setEdges((eds) => eds.filter((ed) => !ids.has(ed.source) && !ids.has(ed.target)))
        toast(`Deleted ${selected.length} node${selected.length > 1 ? 's' : ''}`, 'info')
        return
      }

      // Ctrl+A — select all
      if (mod && e.key === 'a') {
        e.preventDefault()
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })))
        setEdges((eds) => eds.map((ed) => ({ ...ed, selected: true })))
        return
      }

      // Ctrl+C — copy selected
      if (mod && e.key === 'c') {
        if (selected.length === 0) return
        const ids = new Set(selected.map((n) => n.id))
        clipboard.current = {
          nodes: selected.map((n) => ({ ...n, data: { ...n.data } })),
          edges: currentEdges.filter((ed) => ids.has(ed.source) && ids.has(ed.target)),
        }
        toast(`Copied ${selected.length} node${selected.length > 1 ? 's' : ''}`, 'info')
        return
      }

      // Ctrl+V — paste
      if (mod && e.key === 'v') {
        const { nodes: clipNodes, edges: clipEdges } = clipboard.current
        if (clipNodes.length === 0) return
        e.preventDefault()
        takeSnapshot()

        const idMap = new Map<string, string>()
        const newNodes = clipNodes.map((n) => {
          const newId = getNextId()
          idMap.set(n.id, newId)
          return {
            ...n,
            id: newId,
            position: { x: n.position.x + 50, y: n.position.y + 50 },
            selected: true,
            data: { ...n.data },
          }
        })
        const newEdgesRaw = clipEdges
          .filter((ed) => idMap.has(ed.source) && idMap.has(ed.target))
          .map((ed) => ({
            ...ed,
            id: `edge-${getNextId()}`,
            source: idMap.get(ed.source)!,
            target: idMap.get(ed.target)!,
          }))
        const newEdges = validateAndFilterEdges(newNodes, normalizeEdgeHandles(newNodes, newEdgesRaw))

        setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes])
        setEdges((eds) => [...eds, ...newEdges])
        toast(`Pasted ${newNodes.length} node${newNodes.length > 1 ? 's' : ''}`, 'success')

        clipboard.current = {
          nodes: clipNodes.map((n) => ({ ...n, position: { x: n.position.x + 50, y: n.position.y + 50 } })),
          edges: clipEdges,
        }
        return
      }

      // Ctrl+D — duplicate selected
      if (mod && e.key === 'd') {
        e.preventDefault()
        if (selected.length === 0) return
        takeSnapshot()

        const idMap = new Map<string, string>()
        const newNodes = selected.map((n) => {
          const newId = getNextId()
          idMap.set(n.id, newId)
          return {
            ...n,
            id: newId,
            position: { x: n.position.x + 30, y: n.position.y + 30 },
            selected: true,
            data: { ...n.data },
          }
        })
        const selectedIds = new Set(selected.map((n) => n.id))
        const newEdgesRaw = currentEdges
          .filter((ed) => selectedIds.has(ed.source) && selectedIds.has(ed.target))
          .map((ed) => ({
            ...ed,
            id: `edge-${getNextId()}`,
            source: idMap.get(ed.source)!,
            target: idMap.get(ed.target)!,
          }))
        const newEdges = validateAndFilterEdges(newNodes, normalizeEdgeHandles(newNodes, newEdgesRaw))

        setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes])
        setEdges((eds) => [...eds, ...newEdges])
        toast(`Duplicated ${newNodes.length} node${newNodes.length > 1 ? 's' : ''}`, 'success')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleUndo, handleRedo, takeSnapshot, setNodes, setEdges, toast])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0a0f]">
      <MobileWarning />
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar
          agentId={agentId}
          nodes={nodes}
          edges={edges}
          onClear={handleClear}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
        />

        <div ref={reactFlowWrapper} className="flex-1 relative">
          <ReactFlow
            key={agentId ?? 'new'}
            ref={reactFlowInstance as any}
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeDragStart={onNodeDragStart}
            onNodeContextMenu={onNodeContextMenu}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
            className="bg-[#0a0a0f]"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#1e293b"
            />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n) => {
                const bt = n.data?.blockType as string | undefined
                if (bt) {
                  const def = getBlock(bt)
                  if (def) return minimapColor[def.color as BlockColor] ?? '#334155'
                }
                return '#334155'
              }}
              maskColor="rgba(10,10,15,0.85)"
              style={{ bottom: 16, right: 16 }}
            />
          </ReactFlow>

          {/* Color legend for minimap - positioned above the minimap */}
          <div
            className="absolute flex flex-col gap-1 rounded-lg bg-slate-900/95 border border-slate-700/80 px-2.5 py-2 pointer-events-none"
            style={{ bottom: 15, left: 100 }}
          >
            <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Block colors</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#eab308' }} />
                <span className="text-[10px] text-slate-400">General</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#059669' }} />
                <span className="text-[10px] text-slate-400">QuickNode / Hyperliquid</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f43f5e' }} />
                <span className="text-[10px] text-slate-400">Uniswap</span>
              </div>
            </div>
          </div>

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-600">Drop blocks here to start</p>
                <p className="text-xs text-slate-700 mt-1">Drag from the sidebar to build your agent</p>
              </div>
            </div>
          )}

          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              nodeId={contextMenu.nodeId}
              onClose={() => setContextMenu(null)}
              onDuplicate={handleDuplicate}
              onDelete={handleDeleteNode}
            />
          )}
        </div>
      </div>
    </div>
  )
}
