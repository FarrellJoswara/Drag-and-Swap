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
import Sidebar from './components/sidebar/Sidebar'
import Topbar from './components/ui/Topbar'
import ContextMenu from './components/ui/ContextMenu'
import MobileWarning from './components/ui/MobileWarning'
import { useToast } from './components/ui/Toast'
import { useUndoRedo } from './hooks/useUndoRedo'
import { getBlock, minimapColor } from './lib/blockRegistry'
import type { BlockColor } from './lib/blockRegistry'
import GenericNode from './components/nodes/GenericNode'
import './lib/blocks'

const nodeTypes: NodeTypes = {
  generic: GenericNode,
}

const initialNodes: Node[] = [
  {
    id: 'demo-1',
    type: 'generic',
    position: { x: 120, y: 180 },
    data: { blockType: 'watchWallet', walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
  },
  {
    id: 'demo-2',
    type: 'generic',
    position: { x: 500, y: 180 },
    data: { blockType: 'executeSwap', fromToken: 'ETH', toToken: 'USDC', slippage: '0.5' },
  },
]

const initialEdges: Edge[] = [
  {
    id: 'demo-e1',
    source: 'demo-1',
    target: 'demo-2',
    animated: true,
    style: { stroke: '#6366f1', strokeWidth: 2 },
  },
]

let idCounter = 10

function getNextId() {
  return `node-${++idCounter}`
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

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
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
      takeSnapshot()
      setEdges((eds) =>
        addEdge(
          { ...connection, animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
          eds,
        ),
      )
    },
    [setEdges, takeSnapshot],
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
        const newEdges = clipEdges
          .filter((ed) => idMap.has(ed.source) && idMap.has(ed.target))
          .map((ed) => ({
            ...ed,
            id: `edge-${getNextId()}`,
            source: idMap.get(ed.source)!,
            target: idMap.get(ed.target)!,
          }))

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
        const newEdges = currentEdges
          .filter((ed) => selectedIds.has(ed.source) && selectedIds.has(ed.target))
          .map((ed) => ({
            ...ed,
            id: `edge-${getNextId()}`,
            source: idMap.get(ed.source)!,
            target: idMap.get(ed.target)!,
          }))

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
