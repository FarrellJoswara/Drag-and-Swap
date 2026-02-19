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
import WhaleWatcherNode from './components/nodes/WhaleWatcherNode'
import PriceAlertNode from './components/nodes/PriceAlertNode'
import UniswapSwapNode from './components/nodes/UniswapSwapNode'
import Sidebar from './components/sidebar/Sidebar'
import Topbar from './components/ui/Topbar'
import ContextMenu from './components/ui/ContextMenu'
import MobileWarning from './components/ui/MobileWarning'
import { useToast } from './components/ui/Toast'
import { useUndoRedo } from './hooks/useUndoRedo'
import type { NodeType } from './components/sidebar/Sidebar'

const nodeTypes: NodeTypes = {
  whaleWatcher: WhaleWatcherNode,
  priceAlert: PriceAlertNode,
  uniswapSwap: UniswapSwapNode,
}

const initialNodes: Node[] = [
  {
    id: 'demo-1',
    type: 'whaleWatcher',
    position: { x: 120, y: 180 },
    data: { walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
  },
  {
    id: 'demo-2',
    type: 'uniswapSwap',
    position: { x: 450, y: 180 },
    data: { fromToken: 'ETH', toToken: 'USDC', slippage: '0.5' },
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
      const type = event.dataTransfer.getData('application/reactflow') as NodeType

      if (!type || !reactFlowWrapper.current) return

      takeSnapshot()

      const bounds = reactFlowWrapper.current.getBoundingClientRect()
      const position = (reactFlowInstance.current as any)?.screenToFlowPosition?.({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      }) ?? { x: event.clientX - bounds.left - 110, y: event.clientY - bounds.top - 50 }

      const defaultData: Record<NodeType, Record<string, unknown>> = {
        whaleWatcher: { walletAddress: '' },
        priceAlert: { token: 'ETH', condition: 'above', amount: '' },
        uniswapSwap: { fromToken: 'ETH', toToken: 'USDC', slippage: '0.5' },
      }

      const newNode: Node = {
        id: getNextId(),
        type,
        position,
        data: defaultData[type],
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

  // Context menu handlers
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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleUndo, handleRedo])

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
            deleteKeyCode="Backspace"
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
                if (n.type === 'whaleWatcher') return '#7c3aed'
                if (n.type === 'priceAlert') return '#d97706'
                if (n.type === 'uniswapSwap') return '#059669'
                return '#334155'
              }}
              maskColor="rgba(10,10,15,0.85)"
              style={{ bottom: 16, right: 16 }}
            />
          </ReactFlow>

          {/* Empty state overlay */}
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

          {/* Node context menu */}
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
