import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { useState, useCallback } from 'react'
import {
  getBlock,
  getBlockIcon,
  iconColorClass,
} from '../../lib/blockRegistry'
import BlockInput from './BlockInputs'
import NodeShell from '../ui/NodeShell'

export default function GenericNode({ id, data, selected }: NodeProps) {
  const blockType = data.blockType as string
  const definition = getBlock(blockType)
  const { setNodes } = useReactFlow()

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
        {definition.inputs.map((field) => (
          <BlockInput
            key={field.name}
            field={field}
            value={inputs[field.name]}
            onChange={(val) => updateInput(field.name, val)}
            color={definition.color}
          />
        ))}

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
