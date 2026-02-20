import { getBlock } from './blockRegistry'
import type { ConnectedModel } from '../utils/buildConnectedModel'

export type TriggerPayload = {
  agentId: string
  nodeId: string
  outputs: Record<string, string>
}

/** Resolve {{nodeId.outputName}} from outputs map. */
function resolveVariables(
  value: string,
  outputs: Map<string, Record<string, string>>,
): string {
  const match = value.match(/^\{\{(.+)\}\}$/)
  if (!match) return value
  const ref = match[1].trim()
  const dot = ref.indexOf('.')
  if (dot < 0) return value
  const nodeId = ref.slice(0, dot)
  const outputName = ref.slice(dot + 1)
  const nodeOutputs = outputs.get(nodeId)
  if (!nodeOutputs) return value
  return nodeOutputs[outputName] ?? value
}

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/

export type RunContext = {
  /** Connected wallet address (e.g. from Privy). Used when swap block's Wallet Address is empty. */
  walletAddress?: string | null
}

/**
 * Run all downstream nodes from a trigger. Resolves inputs from upstream outputs
 * and variable refs {{nodeId.outputName}}. Modular: triggers don't need to know
 * about downstream execution.
 */
export async function runDownstreamGraph(
  model: ConnectedModel,
  triggerNodeId: string,
  triggerOutputs: Record<string, string>,
  context?: RunContext,
): Promise<void> {
  const outputs = new Map<string, Record<string, string>>()
  outputs.set(triggerNodeId, triggerOutputs)

  const nodeMap = new Map(model.nodes.map((n) => [n.id, n]))
  const triggerNode = nodeMap.get(triggerNodeId)
  if (!triggerNode) return

  const blockType = (triggerNode.data?.blockType as string) ?? triggerNode.type
  const triggerDef = getBlock(blockType)
  if (!triggerDef) return

  const processed = new Set<string>([triggerNodeId])
  const canRun = (nodeId: string): boolean => {
    const n = nodeMap.get(nodeId)
    if (!n) return false
    return n.inputs.every((c) => processed.has(c.sourceNodeId))
  }

  const queue: string[] = []
  for (const out of triggerNode.outputs) {
    if (!queue.includes(out.targetNodeId)) queue.push(out.targetNodeId)
  }

  let iterations = 0
  const maxIterations = model.nodes.length * 2

  while (queue.length > 0 && iterations++ < maxIterations) {
    const nodeId = queue.shift()!
    if (processed.has(nodeId)) continue
    if (!canRun(nodeId)) {
      queue.push(nodeId)
      continue
    }

    const node = nodeMap.get(nodeId)
    if (!node) continue

    const def = getBlock((node.data?.blockType as string) ?? node.type)
    if (!def) continue

    const inputs: Record<string, string> = {}
    for (const field of def.inputs) {
      let val = (node.data[field.name] != null ? String(node.data[field.name]) : field.defaultValue ?? '') as string

      const conn = node.inputs.find((c) => c.targetHandle === field.name)
      if (conn) {
        const srcOuts = outputs.get(conn.sourceNodeId)
        if (srcOuts) {
          const outName = conn.sourceHandle ?? Object.keys(srcOuts)[0]
          val = srcOuts[outName] ?? val
        }
      }
      inputs[field.name] = resolveVariables(val, outputs)
    }

    // Swap block: use connected wallet when Wallet Address is empty or invalid
    if (def.type === 'swap' && context?.walletAddress && ADDRESS_REGEX.test(context.walletAddress)) {
      const swapper = (inputs.swapper ?? '').trim()
      if (!swapper || !ADDRESS_REGEX.test(swapper)) {
        inputs.swapper = context.walletAddress
      }
    }

    try {
      const result = await def.run(inputs)
      outputs.set(nodeId, result)
      processed.add(nodeId)
      console.log(`[runAgent] Ran ${def.type} (${nodeId}):`, result)
      for (const out of node.outputs) {
        if (!processed.has(out.targetNodeId) && !queue.includes(out.targetNodeId)) {
          queue.push(out.targetNodeId)
        }
      }
    } catch (err) {
      console.error(`[runAgent] Block ${nodeId} (${def.type}) failed:`, err)
    }
  }
}

/**
 * Subscribes to an agent's interrupt-based triggers. When a trigger fires,
 * runs the downstream graph and calls onTrigger. Returns cleanup.
 */
export function subscribeToAgent(
  agentId: string,
  model: ConnectedModel,
  onTrigger: (payload: TriggerPayload) => void,
  context?: RunContext,
): () => void {
  const cleanups: Array<() => void> = []

  for (const node of model.nodes) {
    const blockType = (node.data?.blockType as string) ?? (node.type as string)
    const def = getBlock(blockType)
    if (!def?.subscribe || def.category !== 'trigger') continue

    const inputs: Record<string, string> = {}
    for (const field of def.inputs) {
      const val = node.data[field.name]
      inputs[field.name] = val != null ? String(val) : (field.defaultValue ?? '')
    }

    const unsub = def.subscribe!(inputs, (outputs) => {
      const payload: TriggerPayload = { agentId, nodeId: node.id, outputs }
      runDownstreamGraph(model, node.id, outputs, context).catch((err) =>
        console.error('[runAgent] Downstream execution failed:', err),
      )
      onTrigger(payload)
    })
    cleanups.push(unsub)
  }

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}
