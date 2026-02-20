import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { useState, useCallback, useMemo } from 'react'
import { Play } from 'lucide-react'
import {
  getBlock,
  getBlockIcon,
  iconColorClass,
} from '../../lib/blockRegistry'
import BlockInput from './BlockInputs'
import NodeShell from '../ui/NodeShell'
import { buildConnectedModel } from '../../utils/buildConnectedModel'
import { runDownstreamGraph } from '../../lib/runAgent'
import { useToast } from '../ui/Toast'
import { useWalletAddress } from '../../hooks/useWalletAddress'

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

  // #region agent log
  fetch('http://127.0.0.1:7567/ingest/1bc99ae9-bfe4-4e0d-a202-4de374468249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'62c44c'},body:JSON.stringify({sessionId:'62c44c',location:'GenericNode.tsx:33',message:'GenericNode rendering',data:{nodeId:id,blockType,hasDefinition:!!definition,inputCount:definition?.inputs.length,outputCount:definition?.outputs.length,category:definition?.category},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
  // #endregion

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

  const updateInput = useCallback(
    (name: string, value: string) => {
      setInputs((prev) => ({ ...prev, [name]: value }))
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id
            ? { ...n, data: { ...n.data, [name]: value } }
            : n,
        ),
      )
    },
    [id, setNodes],
  )

  const Icon = getBlockIcon(definition.icon)
  const edges = getEdges()

  // Count connections for each output
  const outputConnections = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const out of definition.outputs) {
      counts[out.name] = edges.filter(
        (e) => e.source === id && e.sourceHandle === out.name,
      ).length
    }
    return counts
  }, [edges, id, definition.outputs])

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

  const handleManualRun = useCallback(async () => {
    const nodes = getNodes()
    const edges = getEdges()
    const model = buildConnectedModel(nodes, edges)
    try {
      await runDownstreamGraph(model, id, { triggered: 'true' }, { walletAddress: walletAddress ?? undefined })
      toast('Agent ran successfully', 'success')
    } catch (err) {
      console.error('[manualTrigger] Run failed:', err)
      toast(err instanceof Error ? err.message : 'Run failed', 'error')
    }
  }, [id, getNodes, getEdges, toast, walletAddress])

  return (
    <div className="relative">
      <NodeShell
        selected={selected}
        label={definition.label}
        icon={<Icon size={14} className={iconColorClass[definition.color]} />}
        category={definition.category}
        badge={definition.category.toUpperCase()}
        badgeColor={definition.color}
      >
        <div className="flex flex-col gap-2">
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
            definition.inputs.map((field) => (
              <BlockInput
                key={field.name}
                field={field}
                value={inputs[field.name]}
                onChange={(val) => updateInput(field.name, val)}
                color={definition.color}
              />
            ))
          )}

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

      {/* Input handles on left side, aligned with inputs */}
      {definition.category !== 'trigger' && (
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center gap-1 -ml-[5px]">
          {definition.inputs.map((field) => {
            const isConnected = inputConnections[field.name]
            // #region agent log
            fetch('http://127.0.0.1:7567/ingest/1bc99ae9-bfe4-4e0d-a202-4de374468249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'62c44c'},body:JSON.stringify({sessionId:'62c44c',location:'GenericNode.tsx:178',message:'Rendering input handle',data:{nodeId:id,fieldName:field.name,inputCount:definition.inputs.length,isConnected},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
            // #endregion
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
          // #region agent log
          fetch('http://127.0.0.1:7567/ingest/1bc99ae9-bfe4-4e0d-a202-4de374468249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'62c44c'},body:JSON.stringify({sessionId:'62c44c',location:'GenericNode.tsx:197',message:'Rendering output handle',data:{nodeId:id,outputName:out.name,outputCount:definition.outputs.length},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          return (
            <Handle
              key={out.name}
              type="source"
              position={Position.Right}
              id={out.name}
            />
          )
        })}
      </div>
    </div>
  )
}
