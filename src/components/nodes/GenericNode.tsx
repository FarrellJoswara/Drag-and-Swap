import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { useState, useCallback } from 'react'
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

export default function GenericNode({ id, data, selected }: NodeProps) {
  const blockType = data.blockType as string
  const definition = getBlock(blockType)
  const { setNodes, getNodes, getEdges } = useReactFlow()
  const { toast } = useToast()

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

  const handleManualRun = useCallback(async () => {
    const nodes = getNodes()
    const edges = getEdges()
    const model = buildConnectedModel(nodes, edges)
    try {
      await runDownstreamGraph(model, id, { triggered: 'true' })
      toast('Agent ran successfully', 'success')
    } catch (err) {
      console.error('[manualTrigger] Run failed:', err)
      toast(err instanceof Error ? err.message : 'Run failed', 'error')
    }
  }, [id, getNodes, getEdges, toast])

  return (
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
            {definition.outputs.map((out) => (
              <div key={out.name} className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-slate-600" />
                <span className="text-[10px] text-slate-500">{out.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {definition.category !== 'trigger' && (
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center gap-1 -ml-[5px]">
          {definition.inputs.map((field) => (
            <Handle
              key={field.name}
              type="target"
              position={Position.Left}
              id={field.name}
            />
          ))}
        </div>
      )}
      <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center gap-1 -mr-[5px]">
        {definition.outputs.map((out) => (
          <Handle
            key={out.name}
            type="source"
            position={Position.Right}
            id={out.name}
          />
        ))}
      </div>
    </NodeShell>
  )
}
