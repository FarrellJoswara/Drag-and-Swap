import { Handle, Position, useReactFlow, useEdges, type NodeProps } from '@xyflow/react'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Play, Loader2 } from 'lucide-react'
import {
  getBlock,
  getBlockIcon,
  getOutputsForBlock,
  iconColorClass,
} from '../../lib/blockRegistry'
import BlockInput, { type ConnectionInfo } from './BlockInputs'
import NodeShell from '../ui/NodeShell'
import ResizablePanel from '../ui/ResizablePanel'
import SideNode, { SIDE_NODE_DEFAULT_WIDTH } from './node-extension/SideNode'
import { buildConnectedModel } from '../../utils/buildConnectedModel'
import { EXEC_IN_HANDLE, EXEC_OUT_HANDLE } from '../../utils/executionHandles'
import { runFromNode } from '../../lib/runAgent'
import { useToast } from '../ui/Toast'
import { useWalletAddress } from '../../hooks/useWalletAddress'
import { useSendTransaction } from '../../hooks/useSendTransaction'
import { useSignTypedData } from '../../hooks/useSignTypedData'
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
  const { setNodes, getNodes, getEdges } = useReactFlow()
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
  const [runLoading, setRunLoading] = useState(false)
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
      setInputs((prev) => ({ ...prev, [name]: value }))
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, [name]: value } } : n,
        ),
      )
    },
    [id, setNodes],
  )

  const Icon = getBlockIcon(definition.icon)
  const edges = useEdges()

  // Resolved outputs (dynamic per stream type / settings); fallback to definition.outputs
  // For streamDisplay: use inputSources.data when set (execution-upstream data binding), else no outputs
  const resolvedOutputs = useMemo(() => {
    if (blockType === 'streamDisplay') {
      const inputSources = (data.inputSources as Record<string, { sourceNodeId: string; outputName: string }> | undefined) ?? {}
      const dataSource = inputSources['data']
      if (dataSource) {
        const nodes = getNodes()
        const sourceNode = nodes.find((n) => n.id === dataSource.sourceNodeId)
        if (sourceNode) {
          const sourceBlockType = (sourceNode.data?.blockType as string) ?? sourceNode.type
          const sourceOutputs = getOutputsForBlock(sourceBlockType, sourceNode.data ?? {})
          if (sourceOutputs.length > 0) return sourceOutputs
        }
      }
      return []
    }
    return getOutputsForBlock(blockType, data)
  }, [blockType, data, id, getNodes])

  // Count execution edges from this node (single exec-out handle)
  const outputConnections = useMemo(() => {
    const count = edges.filter((e) => e.source === id && (e.sourceHandle === EXEC_OUT_HANDLE || e.sourceHandle == null)).length
    return { [EXEC_OUT_HANDLE]: count } as Record<string, number>
  }, [edges, id])

  // Execution upstream: nodes that feed into this node via execution edges (for data source picker)
  const executionUpstreamNodeIds = useMemo(() => {
    const seen = new Set<string>()
    const stack: string[] = []
    for (const e of edges) {
      if (e.target === id && (e.targetHandle === EXEC_IN_HANDLE || e.targetHandle == null)) {
        stack.push(e.source)
      }
    }
    while (stack.length > 0) {
      const nid = stack.pop()!
      if (seen.has(nid)) continue
      seen.add(nid)
      for (const e of edges) {
        if (e.target === nid && (e.targetHandle === EXEC_IN_HANDLE || e.targetHandle == null)) {
          stack.push(e.source)
        }
      }
    }
    return Array.from(seen)
  }, [edges, id])

  // Available data sources: upstream nodes with their outputs (for "From upstream" dropdown)
  const availableDataSources = useMemo(() => {
    const nodes = getNodes()
    return executionUpstreamNodeIds.map((nodeId) => {
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return null
      const blockType = (node.data?.blockType as string) ?? node.type
      const outputs = getOutputsForBlock(blockType, node.data ?? {})
      const def = getBlock(blockType)
      return { nodeId, nodeLabel: def?.label ?? blockType, outputs }
    }).filter(Boolean) as Array<{ nodeId: string; nodeLabel: string; outputs: Array<{ name: string; label: string }> }>
  }, [executionUpstreamNodeIds, getNodes])

  // Connection info per input: from inputSources (data binding) + availableDataSources for dropdown
  const connectionInfoByInput = useMemo(() => {
    const inputSources = (data.inputSources as Record<string, { sourceNodeId: string; outputName: string }> | undefined) ?? {}
    const result: Record<string, ConnectionInfo> = {}
    for (const field of definition.inputs) {
      const binding = inputSources[field.name]
      if (!binding) continue
      const source = availableDataSources.find((s) => s.nodeId === binding.sourceNodeId)
      if (!source) continue
      const currentSourceHandle = source.outputs.some((o) => o.name === binding.outputName) ? binding.outputName : source.outputs[0]?.name
      result[field.name] = {
        sourceNodeId: binding.sourceNodeId,
        sourceBlockLabel: source.nodeLabel,
        availableOutputs: source.outputs.map((o) => ({ name: o.name, label: o.label })),
        currentSourceHandle: currentSourceHandle ?? binding.outputName,
      }
    }
    return result
  }, [data.inputSources, definition.inputs, availableDataSources])

  // Labels of execution-upstream blocks ("Connected to X, Y")
  const connectedSourceLabels = useMemo(() => {
    return availableDataSources.map((s) => s.nodeLabel)
  }, [availableDataSources])

  // For streamDisplay: source block outputs for "Fields to Show" (from inputSources.data)
  const streamDisplaySourceOutputs = useMemo(() => {
    if (blockType !== 'streamDisplay') return []
    const dataConn = connectionInfoByInput['data']
    if (dataConn?.availableOutputs?.length) return dataConn.availableOutputs
    const inputSources = (data.inputSources as Record<string, { sourceNodeId: string; outputName: string }> | undefined) ?? {}
    const dataBinding = inputSources['data']
    if (dataBinding) {
      const nodes = getNodes()
      const sourceNode = nodes.find((n) => n.id === dataBinding.sourceNodeId)
      if (sourceNode) {
        const sourceBlockType = (sourceNode.data?.blockType as string) ?? sourceNode.type
        const outputs = getOutputsForBlock(sourceBlockType, sourceNode.data ?? {})
        if (outputs.length > 0) return outputs.map((o) => ({ name: o.name, label: o.label }))
      }
    }
    return []
  }, [blockType, connectionInfoByInput, data.inputSources, getNodes])

  const onSourceOutputChange = useCallback(
    (fieldName: string, outputName: string) => {
      const binding = (data.inputSources as Record<string, { sourceNodeId: string; outputName: string }> | undefined)?.[fieldName]
      if (!binding) return
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  inputSources: {
                    ...((n.data?.inputSources as Record<string, { sourceNodeId: string; outputName: string }>) ?? {}),
                    [fieldName]: { sourceNodeId: binding.sourceNodeId, outputName },
                  },
                },
              }
            : n,
        ),
      )
    },
    [id, data.inputSources, setNodes],
  )

  const onInputSourceChange = useCallback(
    (fieldName: string, binding: { sourceNodeId: string; outputName: string } | null) => {
      setNodes((nodes) =>
        nodes.map((n) => {
          if (n.id !== id) return n
          const current = (n.data?.inputSources as Record<string, { sourceNodeId: string; outputName: string }>) ?? {}
          if (binding) {
            return { ...n, data: { ...n.data, inputSources: { ...current, [fieldName]: binding } } }
          }
          const next = { ...current }
          delete next[fieldName]
          return { ...n, data: { ...n.data, inputSources: next } }
        }),
      )
    },
    [id, setNodes],
  )

  const handleRunBlock = useCallback(async () => {
    const nodes = getNodes()
    const edges = getEdges()
    const model = buildConnectedModel(nodes, edges)
    const displayAgentId = agentId ?? 'editor'
    const runOptions = {
      onDisplayUpdate: (nodeId: string, value: string) =>
        setDisplayValue(displayAgentId, nodeId, value),
    }
    const context = {
      walletAddress: walletAddress ?? undefined,
      sendTransaction: sendTransaction ?? undefined,
      signTypedData: signTypedData ?? undefined,
    }
    setRunLoading(true)
    try {
      await runFromNode(model, id, context, runOptions)
      toast('Block ran successfully', 'success')
    } catch (err) {
      console.error('[runBlock] Run failed:', err)
      toast(err instanceof Error ? err.message : 'Run failed', 'error')
    } finally {
      setRunLoading(false)
    }
  }, [id, getNodes, getEdges, toast, walletAddress, sendTransaction, signTypedData, agentId, setDisplayValue])

  const runDisabled = (blockType === 'swap' || blockType === 'getQuote') && !walletAddress
  const runButton =
    definition.category === 'action' ? (
      <button
        type="button"
        onClick={handleRunBlock}
        disabled={runDisabled || runLoading}
        title={runDisabled ? 'Connect wallet to run' : 'Run this block (and downstream) for testing'}
        className={[
          'nodrag flex items-center justify-center w-5 h-5 rounded border transition-colors',
          runDisabled
            ? 'bg-slate-700/50 text-slate-500 border-slate-600/60 cursor-not-allowed'
            : 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30 hover:text-amber-300',
        ].join(' ')}
      >
        {runLoading ? (
          <Loader2 size={10} className="animate-spin" />
        ) : (
          <Play size={10} fill="currentColor" />
        )}
      </button>
    ) : null

  const mainInputNames = definition.sidePanel
    ? new Set(definition.sidePanel.mainInputNames)
    : null
  const hiddenInputNames = (blockType === 'swap' || blockType === 'getQuote') ? new Set(['amountDenomination']) : new Set<string>()
  const visibleNames = definition.getVisibleInputs ? new Set(definition.getVisibleInputs(inputs)) : null
  const isVisible = (name: string) => !visibleNames || visibleNames.has(name)
  const mainInputs = mainInputNames
    ? definition.inputs.filter((f) => mainInputNames!.has(f.name) && !hiddenInputNames.has(f.name) && isVisible(f.name))
    : []
  const panelInputs = mainInputNames
    ? definition.inputs.filter((f) => !mainInputNames.has(f.name) && !hiddenInputNames.has(f.name) && isVisible(f.name))
    : []

  const execOutCount = outputConnections[EXEC_OUT_HANDLE] ?? 0
  const renderOutputsSection = () =>
    resolvedOutputs.length > 0 ? (
      <div className="flex flex-col gap-0.5 pt-1 border-t border-slate-800/60">
        <span className="text-[9px] font-medium text-slate-600 uppercase tracking-wider">
          Outputs
        </span>
        {resolvedOutputs.map((out) => {
          const connectionCount = execOutCount
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
        ? (inputs.fromToken || 'ETH')
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
          headerAction={runButton}
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
                availableDataSources={availableDataSources}
                onInputSourceChange={onInputSourceChange}
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
              availableDataSources={availableDataSources}
              onInputSourceChange={onInputSourceChange}
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
      headerAction={blockType === 'manualTrigger' ? undefined : runButton}
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
              onClick={handleRunBlock}
              className="nodrag w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-amber-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors"
            >
              <Play size={12} fill="currentColor" />
              Run Once
            </button>
          ) : (
            definition.inputs.filter((f) => !hiddenInputNames.has(f.name)).map((field) => {
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
                        {availableDataSources.length > 0
                          ? 'Select a source in the Source field above to choose which fields to display.'
                          : 'Connect a block above, then select its source in the Source field to choose fields.'}
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
              const inputRow = (
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
                  availableDataSources={availableDataSources}
                  onInputSourceChange={onInputSourceChange}
                  hideSourceLabel={connectedSourceLabels.length > 0}
                  suffix={field.name === 'amount' ? amountSuffix : undefined}
                  onSuffixClick={field.name === 'amount' ? onAmountSuffixClick : undefined}
                />
              )
              return inputRow
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

          {resolvedOutputs.length > 0 && (
            <div className="flex flex-col gap-0.5 pt-1 border-t border-slate-800/60">
              <span className="text-[9px] font-medium text-slate-600 uppercase tracking-wider">
                Outputs
              </span>
              {resolvedOutputs.map((out) => {
                const connectionCount = execOutCount
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
    <div className="relative" title={`Block ID: ${id}`}>
      {nodeContent}

      {/* Execution input handle (one per non-trigger block) */}
      {definition.category !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Left}
          id={EXEC_IN_HANDLE}
          className={(edges.some((e) => e.target === id && (e.targetHandle === EXEC_IN_HANDLE || e.targetHandle == null)) ? '!bg-emerald-400 !border-emerald-500' : '') + ' -left-[6px]'}
          style={{ top: '50%', transform: 'translateY(-50%)' }}
        />
      )}

      {/* Execution output handle (one per block) */}
      <Handle
        type="source"
        position={Position.Right}
        id={EXEC_OUT_HANDLE}
        className={(execOutCount > 0 ? '!bg-emerald-400 !border-emerald-500' : '') + ' -right-[5px]'}
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />
    </div>
  )
}
