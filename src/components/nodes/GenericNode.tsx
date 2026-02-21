import { Handle, Position, useReactFlow, useEdges, useStore, type NodeProps } from '@xyflow/react'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Play } from 'lucide-react'
import {
  getBlock,
  getBlockIcon,
  iconColorClass,
} from '../../lib/blockRegistry'
import BlockInput, { type ConnectionInfo } from './BlockInputs'
import NodeShell from '../ui/NodeShell'
import ResizablePanel from '../ui/ResizablePanel'
import SideNode, { SIDE_NODE_DEFAULT_WIDTH } from './node-extension/SideNode'
import { buildConnectedModel } from '../../utils/buildConnectedModel'
import { runDownstreamGraph } from '../../lib/runAgent'
import { useToast } from '../ui/Toast'
import { useWalletAddress } from '../../hooks/useWalletAddress'
import { useSendTransaction } from '../../hooks/useSendTransaction'
import { useSignTypedData } from '../../hooks/useSignTypedData'
import { getChainsForToken } from '../../services/uniswap'
import { useAgentId } from '../../contexts/AgentIdContext'
import { useDisplayValue } from '../../contexts/DisplayValueContext'

/** Get color class for output type */
function getTypeColor(type?: string): string {
  switch (type) {
    case 'number':
      return 'bg-green-500/20 text-green-400 border-green-500/30'
    case 'string':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'address':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    case 'json':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    case 'boolean':
      return 'bg-pink-500/20 text-pink-400 border-pink-500/30'
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
  }
}

export default function GenericNode({ id, data, selected }: NodeProps) {
  const blockType = data.blockType as string
  const definition = getBlock(blockType)
  const { setNodes, getNodes, getEdges, setEdges } = useReactFlow()
  const { toast } = useToast()
  const walletAddress = useWalletAddress()
  const sendTransaction = useSendTransaction()
  const signTypedData = useSignTypedData()
  const agentId = useAgentId()
  const { getDisplayValue, setDisplayValue, clearDisplayValue } = useDisplayValue()

  if (!definition) {
    return (
      <div className="p-3 bg-red-900/50 border border-red-800 rounded-lg text-xs text-red-300">
        Unknown block: {blockType}
      </div>
    )
  }

  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const field of definition.inputs) {
      initial[field.name] =
        (data[field.name] as string) ?? field.defaultValue ?? ''
    }
    return initial
  })

  const [sidePanelOpen, setSidePanelOpen] = useState<boolean>(
    () => (data.sidePanelOpen as boolean) ?? false,
  )
  const setSidePanelOpenAndPersist = useCallback(
    (open: boolean) => {
      setSidePanelOpen(open)
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, sidePanelOpen: open } } : n,
        ),
      )
    },
    [id, setNodes],
  )

  const setDisplayHeight = useCallback(
    (h: number) =>
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, streamDisplayHeight: h } } : n,
        ),
      ),
    [id, setNodes],
  )

  const setDisplayWidth = useCallback(
    (w: number) =>
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, streamDisplayWidth: w } } : n,
        ),
      ),
    [id, setNodes],
  )

  const displayAgentIdForValue = agentId ?? 'editor'
  const displayConsoleValue = blockType === 'streamDisplay' ? getDisplayValue(displayAgentIdForValue, id) : undefined
  const consoleScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (blockType === 'streamDisplay' && consoleScrollRef.current) {
      consoleScrollRef.current.scrollTop = consoleScrollRef.current.scrollHeight
    }
  }, [blockType, displayConsoleValue])

  const updateInput = useCallback(
    (name: string, value: string) => {
      const updates: Record<string, string> = { [name]: value }
      if ((blockType === 'swap' || blockType === 'getQuote') && (name === 'fromToken' || name === 'toToken')) {
        const chains = getChainsForToken(value)
        const currentChainId = String(inputs.chainId ?? '1')
        if (chains.length > 0 && !chains.includes(Number(currentChainId))) {
          updates.chainId = String(chains[0])
        }
      }
      setInputs((prev) => ({ ...prev, ...updates }))
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...updates } } : n,
        ),
      )
    },
    [id, setNodes, blockType, inputs.chainId],
  )

  const Icon = getBlockIcon(definition.icon)
  const edges = useEdges()

  // Subscribe to connected Output Display nodes' fields so we re-render when user changes "Fields to Show" (variable lights update)
  const targetDisplayFieldsSignature = useStore(
    useCallback(
      (state) => {
        const outEdges = state.edges.filter((e: { source: string }) => e.source === id)
        const targetIds = outEdges.map((e: { target: string }) => e.target)
        return targetIds
          .map((tid: string) => {
            const n = state.nodes.find((node: { id: string }) => node.id === tid)
            if ((n?.data?.blockType as string) !== 'streamDisplay') return ''
            return (n?.data?.fields as string) ?? ''
          })
          .join('|')
      },
      [id],
    ),
  )

  // Count connections for each output: lit when edge.sourceHandle matches OR when edge goes to Output Display and that display's Fields to Show includes this output
  const outputConnections = useMemo(() => {
    const nodes = getNodes()
    const counts: Record<string, number> = {}
    for (const out of definition.outputs) counts[out.name] = 0
    for (const e of edges) {
      if (e.source !== id) continue
      const sourceHandle = e.sourceHandle ?? null
      const targetNode = nodes.find((n) => n.id === e.target)
      const targetBlock = (targetNode?.data?.blockType as string) ?? targetNode?.type
      let displayFields: string[] = []
      if (targetBlock === 'streamDisplay' && targetNode?.data?.fields != null) {
        try {
          const raw = String(targetNode.data.fields).trim()
          if (raw) {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed)) displayFields = parsed
          }
        } catch {
          /* ignore */
        }
      }
      for (const out of definition.outputs) {
        if (sourceHandle === out.name || displayFields.includes(out.name)) {
          counts[out.name] = (counts[out.name] ?? 0) + 1
        }
      }
    }
    return counts
  }, [edges, id, definition.outputs, getNodes, targetDisplayFieldsSignature])

  // Check which inputs are connected
  const inputConnections = useMemo(() => {
    const connected: Record<string, boolean> = {}
    for (const input of definition.inputs) {
      connected[input.name] = edges.some(
        (e) => e.target === id && e.targetHandle === input.name,
      )
    }
    return connected
  }, [edges, id, definition.inputs])

  // Connection info for inputs that have an incoming edge (for output dropdown)
  // Skip trigger-only connections: triggers are for execution order, not data flow (except streamDisplay data)
  const connectionInfoByInput = useMemo(() => {
    const nodes = getNodes()
    const result: Record<string, ConnectionInfo> = {}
    for (const field of definition.inputs) {
      const edge = edges.find((e) => e.target === id && e.targetHandle === field.name)
      if (!edge) continue
      const sourceNode = nodes.find((n) => n.id === edge.source)
      if (!sourceNode) continue
      const sourceDef = getBlock(sourceNode.data?.blockType as string)
      if (!sourceDef?.outputs?.length) continue
      if (sourceDef.category === 'trigger' && !(blockType === 'streamDisplay' && field.name === 'data')) {
        continue // Trigger connections don't pass data; show literal input instead
      }
      const currentSourceHandle = sourceDef.outputs.some((o) => o.name === edge.sourceHandle)
        ? (edge.sourceHandle ?? sourceDef.outputs[0].name)
        : sourceDef.outputs[0].name
      result[field.name] = {
        edgeId: edge.id,
        sourceBlockLabel: sourceDef.label,
        availableOutputs: sourceDef.outputs.map((o) => ({ name: o.name, label: o.label })),
        currentSourceHandle,
      }
    }
    return result
  }, [edges, id, definition.inputs, getNodes, blockType])

  // Unique source block labels for all edges targeting this node ("Connected to X, Y")
  const connectedSourceLabels = useMemo(() => {
    const nodes = getNodes()
    const labels = new Set<string>()
    for (const e of edges) {
      if (e.target !== id) continue
      const sourceNode = nodes.find((n) => n.id === e.source)
      if (!sourceNode) continue
      const def = getBlock(sourceNode.data?.blockType as string)
      if (def?.label) labels.add(def.label)
    }
    return Array.from(labels)
  }, [edges, id, getNodes])

  // For streamDisplay: source block outputs for "Fields to Show" (from data connection or any incoming edge)
  const streamDisplaySourceOutputs = useMemo(() => {
    if (blockType !== 'streamDisplay') return []
    const dataConn = connectionInfoByInput['data']
    if (dataConn?.availableOutputs?.length) return dataConn.availableOutputs
    const nodes = getNodes()
    const edge = edges.find((e) => e.target === id)
    if (!edge) return []
    const sourceNode = nodes.find((n) => n.id === edge.source)
    if (!sourceNode) return []
    const sourceDef = getBlock(sourceNode.data?.blockType as string)
    if (!sourceDef?.outputs?.length) return []
    return sourceDef.outputs.map((o) => ({ name: o.name, label: o.label }))
  }, [blockType, connectionInfoByInput, edges, id, getNodes])

  const onSourceOutputChange = useCallback(
    (fieldName: string, outputName: string) => {
      const edge = edges.find((e) => e.target === id && e.targetHandle === fieldName)
      if (!edge) return
      setEdges((eds) =>
        eds.map((e) => (e.id === edge.id ? { ...e, sourceHandle: outputName } : e)),
      )
    },
    [id, edges, setEdges],
  )

  const handleManualRun = useCallback(async () => {
    const nodes = getNodes()
    const edges = getEdges()
    const model = buildConnectedModel(nodes, edges)
    const displayAgentId = agentId ?? 'editor'
    const runOptions = {
      onDisplayUpdate: (nodeId: string, value: string) =>
        setDisplayValue(displayAgentId, nodeId, value),
    }
    try {
      await runDownstreamGraph(
        model,
        id,
        { triggered: 'true' },
        { walletAddress: walletAddress ?? undefined, sendTransaction: sendTransaction ?? undefined, signTypedData: signTypedData ?? undefined },
        runOptions,
      )
      toast('Agent ran successfully', 'success')
    } catch (err) {
      console.error('[manualTrigger] Run failed:', err)
      toast(err instanceof Error ? err.message : 'Run failed', 'error')
    }
  }, [id, getNodes, getEdges, toast, walletAddress, sendTransaction, signTypedData, agentId, setDisplayValue])

  const mainInputNames = definition.sidePanel
    ? new Set(definition.sidePanel.mainInputNames)
    : null
  const hiddenInputNames = (blockType === 'swap' || blockType === 'getQuote') ? new Set(['amountDenomination']) : new Set<string>()
  const mainInputs = mainInputNames
    ? definition.inputs.filter((f) => mainInputNames.has(f.name) && !hiddenInputNames.has(f.name))
    : []
  const panelInputs = mainInputNames
    ? definition.inputs.filter((f) => !mainInputNames.has(f.name) && !hiddenInputNames.has(f.name))
    : []

  const renderOutputsSection = () =>
    definition.outputs.length > 0 ? (
      <div className="flex flex-col gap-0.5 pt-1 border-t border-slate-800/60">
        <span className="text-[9px] font-medium text-slate-600 uppercase tracking-wider">
          Outputs
        </span>
        {definition.outputs.map((out) => {
          const connectionCount = outputConnections[out.name] || 0
          return (
            <div key={out.name} className="flex items-center gap-1.5 group relative">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  connectionCount > 0 ? 'bg-emerald-400' : 'bg-slate-600'
                }`}
              />
              <span className="text-[10px] text-slate-500 flex-1">{out.label}</span>
              {out.type && (
                <span
                  className={`text-[8px] px-1 py-0.5 rounded border ${getTypeColor(
                    out.type,
                  )}`}
                  title={`Type: ${out.type}`}
                >
                  {out.type}
                </span>
              )}
              {connectionCount > 0 && (
                <span className="text-[9px] text-emerald-400 font-medium" title={`${connectionCount} connection(s)`}>
                  {connectionCount}
                </span>
              )}
            </div>
          )
        })}
      </div>
    ) : null

  const isSwapOrQuote = blockType === 'swap' || blockType === 'getQuote'
  const amountDenomination = (inputs.amountDenomination ?? 'Token').toUpperCase()
  const amountSuffix =
    isSwapOrQuote && amountDenomination === 'USD'
      ? 'USD'
      : isSwapOrQuote
        ? ((inputs.swapType ?? 'EXACT_INPUT').toUpperCase() === 'EXACT_OUTPUT'
            ? inputs.toToken
            : inputs.fromToken) || 'ETH'
        : undefined
  const onAmountSuffixClick = isSwapOrQuote
    ? () => updateInput('amountDenomination', amountDenomination === 'USD' ? 'Token' : 'USD')
    : undefined

  const nodeContent = definition.sidePanel ? (
    <SideNode
      mainContent={
        <NodeShell
          selected={selected}
          label={definition.label}
          icon={<Icon size={14} className={iconColorClass[definition.color]} />}
          category={definition.category}
          badge={definition.category.toUpperCase()}
          badgeColor={definition.color}
          width={blockType === 'streamDisplay' ? (data.streamDisplayWidth != null ? Number(data.streamDisplayWidth) : 220) : undefined}
        >
          <div className="max-h-[320px] overflow-y-auto overflow-x-hidden flex flex-col gap-2 overscroll-contain">
            {isSwapOrQuote && !walletAddress && (
              <div className="px-2.5 py-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-400/90 text-[11px]">
                Wallet must be connected. Sign in to execute swaps.
              </div>
            )}
            {mainInputs.map((field) => (
              <BlockInput
                key={field.name}
                field={field}
                value={inputs[field.name] ?? ''}
                onChange={(val) => updateInput(field.name, val)}
                color={definition.color}
                connectionInfo={connectionInfoByInput[field.name]}
                onSourceOutputChange={
                  connectionInfoByInput[field.name]
                    ? (outputName) => onSourceOutputChange(field.name, outputName)
                    : undefined
                }
                hideSourceLabel={connectedSourceLabels.length > 0}
                suffix={field.name === 'amount' ? amountSuffix : undefined}
                onSuffixClick={field.name === 'amount' ? onAmountSuffixClick : undefined}
              />
            ))}
            {renderOutputsSection()}
          </div>
        </NodeShell>
      }
      sidePanelContent={
        <div className="flex flex-col gap-2">
          {panelInputs.map((field) => (
            <BlockInput
              key={field.name}
              field={field}
              value={inputs[field.name] ?? ''}
              onChange={(val) => updateInput(field.name, val)}
              color={definition.color}
              connectionInfo={connectionInfoByInput[field.name]}
              onSourceOutputChange={
                connectionInfoByInput[field.name]
                  ? (outputName) => onSourceOutputChange(field.name, outputName)
                  : undefined
              }
              hideSourceLabel={connectedSourceLabels.length > 0}
            />
          ))}
        </div>
      }
      sidePanelLabel={definition.sidePanel.label}
      open={sidePanelOpen}
      onOpenChange={setSidePanelOpenAndPersist}
      mainWidth={SIDE_NODE_DEFAULT_WIDTH}
      panelWidth={SIDE_NODE_DEFAULT_WIDTH}
    />
  ) : (
    <NodeShell
      selected={selected}
      label={definition.label}
      icon={<Icon size={14} className={iconColorClass[definition.color]} />}
      category={definition.category}
      badge={definition.category.toUpperCase()}
      badgeColor={definition.color}
      width={blockType === 'streamDisplay' ? (data.streamDisplayWidth != null ? Number(data.streamDisplayWidth) : 220) : undefined}
    >
      <div className="flex flex-col gap-2">
          {connectedSourceLabels.length > 0 && blockType !== 'manualTrigger' && (
            <p className="text-[10px] text-slate-500">
              Connected to: {connectedSourceLabels.join(', ')}
            </p>
          )}
          {blockType === 'manualTrigger' ? (
            <button
              type="button"
              onClick={handleManualRun}
              className="nodrag w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-amber-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors"
            >
              <Play size={12} fill="currentColor" />
              Run Once
            </button>
          ) : (
            definition.inputs.map((field) => {
              if (blockType === 'streamDisplay' && field.name === 'data') {
                const dataConn = connectionInfoByInput['data']
                if (!dataConn) {
                  return (
                    <div key={field.name} className="flex flex-col gap-1">
                      <p className="text-[10px] text-slate-500 italic">Connect a block to choose outputs</p>
                    </div>
                  )
                }
                const { sourceBlockLabel } = dataConn
                return (
                  <div key={field.name} className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-400">Connected to {sourceBlockLabel}</span>
                  </div>
                )
              }
              if (blockType === 'streamDisplay' && field.name === 'fields') {
                const options = streamDisplaySourceOutputs
                let selected: string[] = []
                try {
                  const raw = (inputs.fields ?? '').trim()
                  if (raw) selected = JSON.parse(raw)
                  if (!Array.isArray(selected)) selected = []
                } catch {
                  selected = []
                }
                const toggle = (name: string) => {
                  const next = selected.includes(name)
                    ? selected.filter((s) => s !== name)
                    : [...selected, name]
                  updateInput('fields', JSON.stringify(next))
                }
                return (
                  <div key={field.name} className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                      {field.label}
                    </label>
                    {options.length === 0 ? (
                      <p className="text-[10px] text-slate-500 italic">
                        Connect a block above to choose fields
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {options.map((o) => (
                          <label
                            key={o.name}
                            className="nodrag nopan flex items-center gap-1.5 cursor-pointer select-none"
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(o.name)}
                              onChange={(e) => {
                                e.stopPropagation()
                                toggle(o.name)
                              }}
                              className="nodrag nopan rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                            />
                            <span className="text-[10px] text-slate-300">{o.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              }
              return (
                <BlockInput
                  key={field.name}
                  field={field}
                  value={inputs[field.name] ?? ''}
                  onChange={(val) => updateInput(field.name, val)}
                  color={definition.color}
                  connectionInfo={connectionInfoByInput[field.name]}
                  onSourceOutputChange={
                    connectionInfoByInput[field.name]
                      ? (outputName) => onSourceOutputChange(field.name, outputName)
                      : undefined
                  }
                  hideSourceLabel={connectedSourceLabels.length > 0}
                />
              )
            })
          )}

          {blockType === 'streamDisplay' && (() => {
            const displayHeight = (data.streamDisplayHeight != null ? Number(data.streamDisplayHeight) : null) ?? 96
            const displayWidth = (data.streamDisplayWidth != null ? Number(data.streamDisplayWidth) : null) ?? 220
            return (
              <ResizablePanel
                height={displayHeight}
                onHeightChange={setDisplayHeight}
                minHeight={48}
                maxHeight={400}
                width={displayWidth}
                onWidthChange={setDisplayWidth}
                minWidth={180}
                maxWidth={600}
              >
                <div className="rounded-md border border-slate-700 bg-slate-900/95 overflow-hidden flex-1 min-h-0 flex flex-col">
                  <div className="px-2 py-1 border-b border-slate-700/80 flex items-center justify-between gap-1.5 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" aria-hidden />
                      <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                        Console
                      </span>
                    </div>
                    <button
                      type="button"
                      className="nodrag nopan text-[9px] text-slate-500 hover:text-slate-300 px-1.5 py-0.5 rounded border border-slate-600 hover:border-slate-500 transition-colors"
                      onClick={() => clearDisplayValue(displayAgentIdForValue, id)}
                    >
                      Clear
                    </button>
                  </div>
                  <div
                    ref={consoleScrollRef}
                    className="flex-1 min-h-0 p-2 overflow-auto text-[10px] font-mono text-slate-300 break-all whitespace-pre-wrap"
                    style={{ boxShadow: 'inset 0 0 12px rgba(0,0,0,0.3)' }}
                  >
                    {agentId == null && (displayConsoleValue == null || displayConsoleValue === '') ? (
                      <span className="text-slate-500 italic">Save agent to see live data</span>
                    ) : displayConsoleValue == null || displayConsoleValue === '' ? (
                      <span className="text-slate-500 italic">
                        Connect a block and run (or wait for trigger)
                      </span>
                    ) : displayConsoleValue.trim() === '' ? (
                      <span className="text-slate-500 italic">No data yet</span>
                    ) : (
                      displayConsoleValue
                    )}
                  </div>
                </div>
              </ResizablePanel>
            )
          })()}

          {definition.outputs.length > 0 && (
            <div className="flex flex-col gap-0.5 pt-1 border-t border-slate-800/60">
              <span className="text-[9px] font-medium text-slate-600 uppercase tracking-wider">
                Outputs
              </span>
              {definition.outputs.map((out) => {
                const connectionCount = outputConnections[out.name] || 0
                return (
                  <div key={out.name} className="flex items-center gap-1.5 group relative">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        connectionCount > 0 ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                    <span className="text-[10px] text-slate-500 flex-1">{out.label}</span>
                    {out.type && (
                      <span
                        className={`text-[8px] px-1 py-0.5 rounded border ${getTypeColor(
                          out.type,
                        )}`}
                        title={`Type: ${out.type}`}
                      >
                        {out.type}
                      </span>
                    )}
                    {connectionCount > 0 && (
                      <span className="text-[9px] text-emerald-400 font-medium" title={`${connectionCount} connection(s)`}>
                        {connectionCount}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </NodeShell>
  )

  return (
    <div className="relative">
      {nodeContent}

      {/* Input handles on left side, aligned with inputs */}
      {definition.category !== 'trigger' && (
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center gap-1 -ml-[5px]">
          {definition.inputs.map((field) => {
            if (field.type === 'walletAddress') {
              return <div key={field.name} className="w-[5px]" aria-hidden />
            }
            if (blockType === 'streamDisplay' && field.name === 'fields') {
              return <div key={field.name} className="w-[5px]" aria-hidden />
            }
            const isConnected = inputConnections[field.name]
            return (
              <Handle
                key={field.name}
                type="target"
                position={Position.Left}
                id={field.name}
                className={`${isConnected ? '!bg-emerald-400 !border-emerald-500' : ''}`}
              />
            )
          })}
        </div>
      )}

      {/* Output handles on right side, aligned with outputs */}
      <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center gap-1 -mr-[5px]">
        {definition.outputs.map((out) => {
          const isConnected = (outputConnections[out.name] ?? 0) > 0
          return (
            <Handle
              key={out.name}
              type="source"
              position={Position.Right}
              id={out.name}
              className={isConnected ? '!bg-emerald-400 !border-emerald-500' : ''}
            />
          )
        })}
      </div>
    </div>
  )
}
