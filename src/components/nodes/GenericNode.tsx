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
import { useAddServerSigner } from '../../hooks/useAddServerSigner'
import { executeSwapOnBehalf } from '../../services/executeSwapOnBehalf'
import { useAgentId } from '../../contexts/AgentIdContext'
import { useDisplayValue } from '../../contexts/DisplayValueContext'
import { useGraphSeries, MULTIGRAPH_MAX_SERIES } from '../../contexts/GraphSeriesContext'
import { useRunProgress } from '../../contexts/RunProgressContext'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

export default function GenericNode({ id, data, selected }: NodeProps) {
  const blockType = data.blockType as string
  const definition = getBlock(blockType)
  const { setNodes, getNodes, getEdges } = useReactFlow()
  const { toast } = useToast()
  const walletAddress = useWalletAddress()
  const sendTransaction = useSendTransaction()
  const signTypedData = useSignTypedData()
  const { addServerSigner } = useAddServerSigner()
  const agentId = useAgentId()
  const { getDisplayValue, setDisplayValue, clearDisplayValue } = useDisplayValue()
  const { getSeries, getMultigraphSeries, appendPoint, clearSeries, setPaused, getPaused } = useGraphSeries()
  const { startRun, endRun, onBlockStart, onBlockComplete, currentBlockNodeId } = useRunProgress()

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
  const [hover, setHover] = useState(false)
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

  const setGraphHeight = useCallback(
    (h: number) =>
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, graphDisplayHeight: h } } : n,
        ),
      ),
    [id, setNodes],
  )

  const setGraphWidth = useCallback(
    (w: number) =>
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, graphDisplayWidth: w } } : n,
        ),
      ),
    [id, setNodes],
  )

  const setMultigraphHeight = useCallback(
    (h: number) =>
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, multigraphHeight: h } } : n,
        ),
      ),
    [id, setNodes],
  )

  const setMultigraphWidth = useCallback(
    (w: number) =>
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, multigraphWidth: w } } : n,
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

  // Outputs for this block (for hover popup)
  const outputFields = useMemo(
    () => getOutputsForBlock(blockType, data ?? {}),
    [blockType, data],
  )

  // Block width (match NodeShell so popup aligns)
  const blockWidth =
    blockType === 'streamDisplay'
      ? (data.streamDisplayWidth != null ? Number(data.streamDisplayWidth) : 220)
      : blockType === 'graphDisplay'
        ? (data.graphDisplayWidth != null ? Number(data.graphDisplayWidth) : 280)
        : blockType === 'multigraph'
          ? (data.multigraphWidth != null ? Number(data.multigraphWidth) : 320)
          : 220

  // Count execution edges from this node (single exec-out handle)
  const outputConnections = useMemo(() => {
    const count = edges.filter((e) => e.source === id && (e.sourceHandle === EXEC_OUT_HANDLE || e.sourceHandle == null)).length
    return { [EXEC_OUT_HANDLE]: count } as Record<string, number>
  }, [edges, id])
  const execOutCount = outputConnections[EXEC_OUT_HANDLE] ?? 0

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

  // For generalFilter: source block outputs for "Fields to pass" (from inputSources.data)
  const generalFilterSourceOutputs = useMemo(() => {
    if (blockType !== 'generalFilter') return []
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
      agentId: displayAgentId,
      onDisplayUpdate: (nodeId: string, value: string) =>
        setDisplayValue(displayAgentId, nodeId, value),
      onGraphPointUpdate: (aid: string, nodeId: string, point: { timestamp: number; value: number }) => {
        if (!getPaused(aid, nodeId)) appendPoint(aid, nodeId, point)
      },
      onMultigraphPointUpdate: (aid: string, nodeId: string, seriesIndex: number, point: { timestamp: number; value: number }) => {
        if (!getPaused(aid, nodeId)) appendPoint(aid, nodeId, point, seriesIndex)
      },
      onBlockStart,
      onBlockComplete,
    }
    const context = {
      walletAddress: walletAddress ?? undefined,
      sendTransaction: sendTransaction ?? undefined,
      signTypedData: signTypedData ?? undefined,
      addServerSigner: addServerSigner ?? undefined,
      sendTransactionServer: executeSwapOnBehalf,
      agentId: displayAgentId,
    }
    setRunLoading(true)
    startRun(id)
    try {
      await runFromNode(model, id, context, runOptions)
      toast('Block ran successfully', 'success')
    } catch (err) {
      console.error('[runBlock] Run failed:', err)
      toast(err instanceof Error ? err.message : 'Run failed', 'error')
    } finally {
      setRunLoading(false)
      endRun()
    }
  }, [id, getNodes, getEdges, toast, walletAddress, sendTransaction, signTypedData, addServerSigner, agentId, setDisplayValue, getPaused, appendPoint])

  const runDisabled = (blockType === 'swap' || blockType === 'getQuote' || blockType === 'swapOnBehalf') && !walletAddress
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
  const hiddenInputNames = (blockType === 'swap' || blockType === 'getQuote' || blockType === 'swapOnBehalf') ? new Set(['amountDenomination']) : new Set<string>()
  const visibleNames = definition.getVisibleInputs ? new Set(definition.getVisibleInputs(inputs)) : null
  const isVisible = (name: string) => !visibleNames || visibleNames.has(name)
  const mainInputs = mainInputNames
    ? definition.inputs.filter((f) => mainInputNames!.has(f.name) && !hiddenInputNames.has(f.name) && isVisible(f.name))
    : []
  const panelInputs = mainInputNames
    ? definition.inputs.filter((f) => !mainInputNames.has(f.name) && !hiddenInputNames.has(f.name) && isVisible(f.name))
    : []

  const isSwapOrQuote = blockType === 'swap' || blockType === 'getQuote' || blockType === 'swapOnBehalf'
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
          width={
            blockType === 'streamDisplay'
              ? (data.streamDisplayWidth != null ? Number(data.streamDisplayWidth) : 220)
              : blockType === 'graphDisplay'
                ? (data.graphDisplayWidth != null ? Number(data.graphDisplayWidth) : 280)
                : blockType === 'multigraph'
                  ? (data.multigraphWidth != null ? Number(data.multigraphWidth) : 320)
                  : undefined
          }
          headerAction={runButton}
          isRunning={id === currentBlockNodeId}
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
                  connectionInfoByInput[field.name] &&
                  !(blockType === 'streamDisplay' && field.name === 'data')
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
                connectionInfoByInput[field.name] &&
                !(blockType === 'streamDisplay' && field.name === 'data')
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
          width={
            blockType === 'streamDisplay'
              ? (data.streamDisplayWidth != null ? Number(data.streamDisplayWidth) : 220)
              : blockType === 'graphDisplay'
                ? (data.graphDisplayWidth != null ? Number(data.graphDisplayWidth) : 280)
                : blockType === 'multigraph'
                  ? (data.multigraphWidth != null ? Number(data.multigraphWidth) : 320)
                  : undefined
          }
          headerAction={blockType === 'manualTrigger' ? undefined : runButton}
          isRunning={id === currentBlockNodeId}
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
              disabled={runLoading}
              className="nodrag w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-amber-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {runLoading ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <Play size={12} fill="currentColor" />
                  Run Once
                </>
              )}
            </button>
          ) : (
            definition.inputs.filter((f) => !hiddenInputNames.has(f.name) && isVisible(f.name)).map((field) => {
              const isFieldsSelector =
                (blockType === 'streamDisplay' || blockType === 'generalFilter') && field.name === 'fields'
              if (isFieldsSelector) {
                const options =
                  blockType === 'streamDisplay' ? streamDisplaySourceOutputs : generalFilterSourceOutputs
                const emptyHint =
                  blockType === 'generalFilter'
                    ? (availableDataSources.length > 0
                        ? 'Select a source in the Source field above to choose which fields to pass.'
                        : 'Connect a block above, then select its source in the Source field to choose fields.')
                    : (availableDataSources.length > 0
                        ? 'Select a source in the Source field above to choose which fields to display.'
                        : 'Connect a block above, then select its source in the Source field to choose fields.')
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
                        {emptyHint}
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
                    connectionInfoByInput[field.name] &&
                    !(blockType === 'streamDisplay' && field.name === 'data')
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

          {blockType === 'graphDisplay' && (() => {
            const graphHeight = (data.graphDisplayHeight != null ? Number(data.graphDisplayHeight) : null) ?? 120
            const graphWidth = (data.graphDisplayWidth != null ? Number(data.graphDisplayWidth) : null) ?? 280
            const series = getSeries(displayAgentIdForValue, id)
            const chartData = series.map((p) => ({
              time: new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              value: p.value,
            }))
            const values = chartData.map((d) => d.value)
            const minVal = values.length ? Math.min(...values) : 0
            const maxVal = values.length ? Math.max(...values) : 1
            const range = maxVal - minVal
            const padding = range > 0 ? range * 0.05 : Math.abs(minVal) * 0.01 || 1
            const yDomain: [number, number] = values.length
              ? [minVal - padding, maxVal + padding]
              : [0, 1]
            const formatY = (v: number) => {
              if (range > 0 && range < 1) return v.toFixed(4)
              if (range >= 1 && range < 100) return v.toFixed(2)
              if (range >= 100 && range < 10000) return v.toFixed(2)
              return v >= 1000 ? `${(v / 1000).toFixed(2)}k` : String(v)
            }
            const formatExact = (v: number) => {
              if (!Number.isFinite(v)) return '—'
              if (Number.isInteger(v)) return String(v)
              const s = v.toFixed(12)
              return s.replace(/\.?0+$/, '')
            }
            const lastValue = series.length ? series[series.length - 1].value : null
            return (
              <ResizablePanel
                height={graphHeight}
                onHeightChange={setGraphHeight}
                minHeight={64}
                maxHeight={400}
                width={graphWidth}
                onWidthChange={setGraphWidth}
                minWidth={200}
                maxWidth={600}
              >
                <div className="rounded-md border border-slate-700 bg-slate-900/95 overflow-hidden flex-1 min-h-0 flex flex-col">
                  <div className="px-2 py-1 border-b border-slate-700/80 flex items-center justify-between gap-1.5 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500/80" aria-hidden />
                      <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                        Chart
                      </span>
                    </div>
                    <>
                      {lastValue != null && (
                        <span className="text-[10px] font-mono text-slate-300 truncate" title={formatExact(lastValue)}>
                          {formatExact(lastValue)}
                        </span>
                      )}
                      <button
                        type="button"
                        className="nodrag nopan text-[9px] text-slate-500 hover:text-slate-300 px-1.5 py-0.5 rounded border border-slate-600 hover:border-slate-500 transition-colors"
                        onClick={() => clearSeries(displayAgentIdForValue, id)}
                      >
                        Clear
                      </button>
                    </>
                  </div>
                  <div className="flex-1 min-h-0 min-w-0" style={{ width: graphWidth, height: graphHeight - 28 }}>
                    {chartData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-[10px] text-slate-500 italic">
                        {agentId == null
                          ? 'Save agent to see live chart'
                          : 'Connect a value (e.g. Live Token Price) and run'}
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                          <XAxis
                            dataKey="time"
                            tick={{ fontSize: 9, fill: '#94a3b8' }}
                            stroke="#475569"
                          />
                          <YAxis
                            tick={{ fontSize: 9, fill: '#94a3b8' }}
                            stroke="#475569"
                            domain={yDomain}
                            tickFormatter={(v) => formatY(Number(v))}
                            width={40}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', fontSize: 10 }}
                            labelStyle={{ color: '#94a3b8' }}
                            formatter={(value: number | undefined) => {
                              const v = value ?? 0
                              return [formatExact(v), 'Value']
                            }}
                            labelFormatter={(label) => `Time: ${label}`}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </ResizablePanel>
            )
          })()}

          {blockType === 'multigraph' && (() => {
            const mgHeight = (data.multigraphHeight != null ? Number(data.multigraphHeight) : null) ?? 140
            const mgWidth = (data.multigraphWidth != null ? Number(data.multigraphWidth) : null) ?? 320
            const seriesList = getMultigraphSeries(displayAgentIdForValue, id)
            const numberOfSeries = Math.min(MULTIGRAPH_MAX_SERIES, Math.max(2, parseInt(String(inputs.numberOfSeries ?? '3'), 10) || 3))
            const labels = Array.from({ length: MULTIGRAPH_MAX_SERIES }, (_, i) =>
              (inputs[`label${i + 1}`] ?? `Series ${i + 1}`).trim() || `Series ${i + 1}`,
            )
            const paused = getPaused(displayAgentIdForValue, id)
            const formatExact = (v: number) => {
              if (!Number.isFinite(v)) return '—'
              if (Number.isInteger(v)) return String(v)
              return v.toFixed(12).replace(/\.?0+$/, '')
            }
            const timeRows = new Map<number, Record<string, number>>()
            seriesList.forEach((pts, idx) => {
              const key = `value${idx + 1}`
              pts.forEach((p) => {
                let row = timeRows.get(p.timestamp)
                if (!row) {
                  row = {}
                  timeRows.set(p.timestamp, row)
                }
                row[key] = p.value
              })
            })
            const sortedTs = Array.from(timeRows.keys()).sort((a, b) => a - b)
            const chartData = sortedTs.map((ts) => {
              const row = timeRows.get(ts)!
              const out: Record<string, string | number | null> = {
                time: new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              }
              for (let i = 1; i <= MULTIGRAPH_MAX_SERIES; i++) out[`value${i}`] = row[`value${i}`] ?? null
              return out
            })
            const valueKeys = Array.from({ length: MULTIGRAPH_MAX_SERIES }, (_, i) => `value${i + 1}`)
            const allValues = chartData.flatMap((d) =>
              valueKeys.map((k) => (d as Record<string, number | null>)[k]).filter((v): v is number => v != null),
            )
            const minVal = allValues.length ? Math.min(...allValues) : 0
            const maxVal = allValues.length ? Math.max(...allValues) : 1
            const range = maxVal - minVal
            const padding = range > 0 ? range * 0.05 : Math.abs(minVal) * 0.01 || 1
            const yDomain: [number, number] = allValues.length ? [minVal - padding, maxVal + padding] : [0, 1]
            const MULTIGRAPH_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
            return (
              <ResizablePanel
                height={mgHeight}
                onHeightChange={setMultigraphHeight}
                minHeight={80}
                maxHeight={400}
                width={mgWidth}
                onWidthChange={setMultigraphWidth}
                minWidth={240}
                maxWidth={600}
              >
                <div className="rounded-md border border-slate-700 bg-slate-900/95 overflow-hidden flex-1 min-h-0 flex flex-col">
                  <div className="px-2 py-1 border-b border-slate-700/80 flex items-center justify-between gap-1.5 flex-shrink-0 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500/80" aria-hidden />
                      <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                        Multigraph
                      </span>
                      {paused && (
                        <span className="text-[9px] font-medium text-amber-400/90 border border-amber-500/40 rounded px-1">
                          Paused
                        </span>
                      )}
                    </div>
                    <>
                      <button
                        type="button"
                        className="nodrag nopan text-[9px] text-slate-500 hover:text-slate-300 px-1.5 py-0.5 rounded border border-slate-600 hover:border-slate-500 transition-colors"
                        onClick={() => setPaused(displayAgentIdForValue, id, !paused)}
                      >
                        {paused ? 'Resume' : 'Pause'}
                      </button>
                      <button
                        type="button"
                        className="nodrag nopan text-[9px] text-slate-500 hover:text-slate-300 px-1.5 py-0.5 rounded border border-slate-600 hover:border-slate-500 transition-colors"
                        onClick={() => clearSeries(displayAgentIdForValue, id)}
                      >
                        Clear
                      </button>
                    </>
                  </div>
                  <div className="flex-1 min-h-0 min-w-0" style={{ width: mgWidth, height: mgHeight - 28 }}>
                    {chartData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-[10px] text-slate-500 italic">
                        {agentId == null
                          ? 'Save agent to see chart'
                          : 'Connect one or more values (e.g. Live Token Price) and run'}
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                          <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#94a3b8' }} stroke="#475569" />
                          <YAxis
                            tick={{ fontSize: 9, fill: '#94a3b8' }}
                            stroke="#475569"
                            domain={yDomain}
                            width={40}
                            tickFormatter={(v) => (Number(v) >= 1000 ? `${(v / 1000).toFixed(2)}k` : String(v))}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', fontSize: 10 }}
                            labelStyle={{ color: '#94a3b8' }}
                            formatter={(value: number | undefined, name: string | undefined) => [value != null ? formatExact(value) : '—', name ?? 'Value']}
                            labelFormatter={(label) => `Time: ${label}`}
                          />
                          <Legend wrapperStyle={{ fontSize: 9 }} iconSize={8} />
                          {Array.from({ length: numberOfSeries }, (_, i) => i + 1).map((i) => (
                            <Line
                              key={i}
                              type="monotone"
                              dataKey={`value${i}`}
                              name={labels[i - 1]}
                              stroke={MULTIGRAPH_COLORS[i - 1]}
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                              connectNulls
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </ResizablePanel>
            )
          })()}

        </div>
      </NodeShell>
  )

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Hover popup: block ID + output variables */}
      {hover && (
        <div
          className="nodrag nopan absolute left-0 bottom-full mb-1.5 z-[100] px-2.5 py-2 rounded-lg bg-slate-800 border border-slate-600 shadow-xl text-left box-border"
          style={{ pointerEvents: 'none', width: blockWidth }}
        >
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Block ID
          </div>
          <div className="text-xs font-mono text-slate-200 break-all mb-2">
            {id}
          </div>
          {outputFields.length > 0 && (
            <>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Outputs
              </div>
              <ul className="space-y-0.5">
                {outputFields.map((out) => (
                  <li key={out.name} className="text-xs text-slate-300 flex items-baseline gap-1.5 flex-wrap">
                    <span className="font-mono text-slate-200 shrink-0">{out.name}</span>
                    {out.type != null && (
                      <span className="text-slate-500 text-[10px] shrink-0">({out.type})</span>
                    )}
                    {out.label !== out.name && (
                      <span className="text-slate-500 truncate">{out.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
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
