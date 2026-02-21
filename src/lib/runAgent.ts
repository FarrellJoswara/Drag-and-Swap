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

export type SwapTx = {
  to: string
  from: string
  data: string
  value: string
  chainId: number
  gasLimit?: string
}

export type SignTypedDataParams = {
  domain: { name?: string; version?: string; chainId?: number; verifyingContract?: `0x${string}` }
  types: Record<string, Array<{ name: string; type: string }>>
  primaryType: string
  message: Record<string, unknown>
}

export type RunContext = {
  /** Connected wallet address (e.g. from Privy). Used when swap block's Wallet Address is empty. */
  walletAddress?: string | null
  /** Send a transaction (e.g. Uniswap swap). When provided, swap block will sign and broadcast. */
  sendTransaction?: ((tx: SwapTx) => Promise<string>) | null
  /** Sign EIP-712 typed data (e.g. UniswapX permit). When provided, swap block can submit gasless orders. */
  signTypedData?: ((params: SignTypedDataParams) => Promise<string>) | null
}

export type RunOptions = {
  /** When a streamDisplay node completes, called with its node id and lastEvent value (for TV preview). */
  onDisplayUpdate?: (nodeId: string, value: string) => void
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
  options?: RunOptions,
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
      const storedVal = (node.data[field.name] != null ? String(node.data[field.name]) : field.defaultValue ?? '') as string
      let val = storedVal

      const conn = node.inputs.find((c) => c.targetHandle === field.name)
      if (conn) {
        const srcOuts = outputs.get(conn.sourceNodeId)
        if (srcOuts) {
          // Stream Display "data" input: always use source's "data" output (full event JSON) when present, so user sees useful output instead of e.g. "A"/"B" from "side"
          const useDataForDisplay =
            def.type === 'streamDisplay' &&
            field.name === 'data' &&
            srcOuts.data != null &&
            String(srcOuts.data).trim() !== ''
          const outName = useDataForDisplay
            ? 'data'
            : (conn.sourceHandle ?? Object.keys(srcOuts)[0])
          const connectedVal = srcOuts[outName] ?? val
          if (storedVal.trim() !== '') {
            val = storedVal
          } else {
            if (field.type === 'number' && connectedVal) {
              const n = Number(connectedVal)
              if (!Number.isFinite(n) || n <= 0) val = storedVal || (field.defaultValue ?? '')
              else val = connectedVal
            } else {
              val = connectedVal
            }
          }
        }
      }
      inputs[field.name] = resolveVariables(val, outputs)
    }

    // Swap and Get Quote blocks: always use connected wallet (no explicit wallet input)
    if ((def.type === 'swap' || def.type === 'getQuote') && context?.walletAddress && ADDRESS_REGEX.test(context.walletAddress)) {
      inputs.swapper = context.walletAddress
    }

    try {
      const result = await def.run(inputs, context)
      outputs.set(nodeId, result)
      processed.add(nodeId)
      if (def.type === 'streamDisplay' && options?.onDisplayUpdate) {
        const val = (result as { lastEvent?: string }).lastEvent
        options.onDisplayUpdate(nodeId, typeof val === 'string' ? val : '')
      }
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

export type SubscribeOptions = {
  /** When a streamDisplay node completes, called with its node id and lastEvent value (for TV preview). */
  onDisplayUpdate?: (nodeId: string, value: string) => void
  /** When provided, use this model (e.g. current editor flow) instead of saved model when running downstream. Enables "Fields to Show" toggles without saving. */
  getModel?: (agentId: string) => ConnectedModel | null
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
  subscribeOptions?: SubscribeOptions,
): () => void {
  const cleanups: Array<() => void> = []
  const runOptions: RunOptions | undefined =
    subscribeOptions?.onDisplayUpdate
      ? { onDisplayUpdate: subscribeOptions.onDisplayUpdate }
      : undefined
  const getModel = subscribeOptions?.getModel

  for (const node of model.nodes) {
    const blockType = (node.data?.blockType as string) ?? (node.type as string)
    const def = getBlock(blockType)
    if (!def?.subscribe || def.category !== 'trigger') continue

    console.log('[runAgent] Subscribing to trigger:', blockType, 'nodeId:', node.id)
    const inputs: Record<string, string> = {}
    for (const field of def.inputs) {
      const val = node.data[field.name]
      inputs[field.name] = val != null ? String(val) : (field.defaultValue ?? '')
    }

    const unsub = def.subscribe!(inputs, (outputs) => {
      const payload: TriggerPayload = { agentId, nodeId: node.id, outputs }
      const modelToUse = getModel?.(agentId) ?? model
      runDownstreamGraph(modelToUse, node.id, outputs, context, runOptions).catch((err) =>
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
