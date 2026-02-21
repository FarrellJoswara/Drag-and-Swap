import { getBlock, type BlockDefinition } from './blockRegistry'
import type { ConnectedModel, ConnectedNode } from '../utils/buildConnectedModel'
import { subscribe } from '../services/hyperliquid/streams'
import { buildFiltersFromSpec, validateFilterLimits } from '../services/hyperliquid/filters'
import type { HyperliquidStreamType } from '../services/hyperliquid/types'
import {
  getFilterSpecForStreamTrigger,
  mergeWithStreamSpec,
  normalizeStreamType,
  createStreamTriggerCallback,
} from '../services/hyperliquid/streamTriggerHandlers'

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
  /** Current node id (for blocks that need identity, e.g. rate limit). */
  nodeId?: string
  /** Current agent id (for blocks that need identity, e.g. rate limit). */
  agentId?: string
}

export type RunOptions = {
  /** When a streamDisplay node completes, called with its node id and lastEvent value (for TV preview). */
  onDisplayUpdate?: (nodeId: string, value: string) => void
  /** Agent id when running from subscribeToAgent (for rate limit, etc.). */
  agentId?: string
}

/** Get all node IDs that feed into the given node (upstream dependencies). */
function getUpstreamNodeIds(model: ConnectedModel, nodeId: string): Set<string> {
  const seen = new Set<string>()
  const stack: string[] = []
  const node = model.nodes.find((n) => n.id === nodeId)
  if (!node) return seen
  for (const input of node.inputs) {
    stack.push(input.sourceNodeId)
  }
  while (stack.length > 0) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const n = model.nodes.find((n) => n.id === id)
    if (!n) continue
    for (const input of n.inputs) {
      stack.push(input.sourceNodeId)
    }
  }
  return seen
}

/** Topologically sort nodes so dependencies run first. */
function topologicalSortUpstream(model: ConnectedModel, nodeIds: Set<string>): string[] {
  const nodeMap = new Map(model.nodes.map((n) => [n.id, n]))
  const result: string[] = []
  const remaining = new Set(nodeIds)

  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => {
      const node = nodeMap.get(id)
      if (!node) return true
      return node.inputs.every((input) => !remaining.has(input.sourceNodeId))
    })
    if (ready.length === 0) {
      const first = [...remaining][0]
      ready.push(first)
    }
    for (const id of ready) {
      result.push(id)
      remaining.delete(id)
    }
  }
  return result
}

/**
 * Run a single block (and its downstream) for testing. Runs all upstream nodes first
 * to resolve inputs, then runs the target block, then runs downstream.
 */
export async function runFromNode(
  model: ConnectedModel,
  nodeId: string,
  context?: RunContext,
  options?: RunOptions,
): Promise<void> {
  const nodeMap = new Map(model.nodes.map((n) => [n.id, n]))
  const targetNode = nodeMap.get(nodeId)
  if (!targetNode) return

  const blockType = (targetNode.data?.blockType as string) ?? targetNode.type
  const def = getBlock(blockType)
  if (!def) return

  const outputs = new Map<string, Record<string, string>>()
  const upstreamIds = getUpstreamNodeIds(model, nodeId)
  const order = topologicalSortUpstream(model, upstreamIds)

  const runContext = {
    ...context,
    agentId: context?.agentId ?? options?.agentId,
  }

  for (const nid of order) {
    const node = nodeMap.get(nid)
    if (!node) continue
    const nodeDef = getBlock((node.data?.blockType as string) ?? node.type)
    if (!nodeDef) continue

    const inputs = resolveInputs(node, nodeDef, outputs)
    if ((nodeDef.type === 'swap' || nodeDef.type === 'getQuote') && context?.walletAddress && ADDRESS_REGEX.test(context.walletAddress)) {
      inputs.swapper = context.walletAddress
    }
    try {
      const result = await nodeDef.run(inputs, { ...runContext, nodeId: nid, agentId: runContext.agentId })
      outputs.set(nid, result)
      if (nodeDef.type === 'streamDisplay' && options?.onDisplayUpdate) {
        options.onDisplayUpdate(nid, JSON.stringify(result, null, 2))
      }
      console.log(`[runAgent] Ran ${nodeDef.type} (${nid}):`, result)
    } catch (err) {
      console.error(`[runAgent] Block ${nid} (${nodeDef.type}) failed:`, err)
      throw err
    }
  }

  const targetInputs = resolveInputs(targetNode, def, outputs)
  if ((def.type === 'swap' || def.type === 'getQuote') && context?.walletAddress && ADDRESS_REGEX.test(context.walletAddress)) {
    targetInputs.swapper = context.walletAddress
  }
  const targetResult = await def.run(targetInputs, { ...runContext, nodeId, agentId: runContext.agentId })
  outputs.set(nodeId, targetResult)
  if (def.type === 'streamDisplay' && options?.onDisplayUpdate) {
    options.onDisplayUpdate(nodeId, JSON.stringify(targetResult, null, 2))
  }
  console.log(`[runAgent] Ran ${def.type} (${nodeId}):`, targetResult)

  await runDownstreamGraph(model, nodeId, targetResult, context, options)
}

/** Resolve inputs for a node from outputs map and node data. */
function resolveInputs(
  node: ConnectedNode,
  def: BlockDefinition,
  outputs: Map<string, Record<string, string>>,
): Record<string, string> {
  const inputs: Record<string, string> = {}
  for (const field of def.inputs) {
    const storedVal = (node.data[field.name] != null ? String(node.data[field.name]) : field.defaultValue ?? '') as string
    let val = storedVal

    const conn = node.inputs.find((c) => c.targetHandle === field.name)
    if (conn) {
      const srcOuts = outputs.get(conn.sourceNodeId)
      if (srcOuts) {
        const useNormalizedForDisplay =
          def.type === 'streamDisplay' &&
          field.name === 'data' &&
          srcOuts != null &&
          typeof srcOuts === 'object'
        const outName = useNormalizedForDisplay ? 'data' : (conn.sourceHandle ?? Object.keys(srcOuts)[0])
        const connectedVal = useNormalizedForDisplay ? JSON.stringify(srcOuts) : (srcOuts[outName] ?? val)
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
  return inputs
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
          // Stream Display "data" input: pass full normalized outputs (same keys as "Fields to Show") so selected fields match and display correctly
          const useNormalizedForDisplay =
            def.type === 'streamDisplay' &&
            field.name === 'data' &&
            srcOuts != null &&
            typeof srcOuts === 'object'
          const outName = useNormalizedForDisplay
            ? 'data'
            : (conn.sourceHandle ?? Object.keys(srcOuts)[0])
          const connectedVal = useNormalizedForDisplay
            ? JSON.stringify(srcOuts)
            : (srcOuts[outName] ?? val)
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

    const runContext = {
      ...context,
      nodeId,
      agentId: context?.agentId ?? options?.agentId,
    }
    try {
      const result = await def.run(inputs, runContext)
      outputs.set(nodeId, result)
      processed.add(nodeId)
      if (def.type === 'streamDisplay' && options?.onDisplayUpdate) {
        options.onDisplayUpdate(nodeId, JSON.stringify(result, null, 2))
      }
      console.log(`[runAgent] Ran ${def.type} (${nodeId}):`, result)
      // Only queue targets for output handles that have a truthy value (enables conditional branching)
      for (const out of node.outputs) {
        const handleName = out.sourceHandle ?? Object.keys(result)[0]
        const outVal = handleName != null ? result[handleName] : undefined
        if (outVal != null && String(outVal).trim() !== '' && !processed.has(out.targetNodeId) && !queue.includes(out.targetNodeId)) {
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
  const runOptions: RunOptions = { agentId }
  if (subscribeOptions?.onDisplayUpdate) runOptions.onDisplayUpdate = subscribeOptions.onDisplayUpdate
  const getModel = subscribeOptions?.getModel
  const modelForInputs = getModel ? (getModel(agentId) ?? model) : model

  const nodeMap = new Map(modelForInputs.nodes.map((n) => [n.id, n]))

  for (const node of modelForInputs.nodes) {
    const blockType = (node.data?.blockType as string) ?? (node.type as string)
    const def = getBlock(blockType)
    if (!def?.subscribe || def.category !== 'trigger') continue

    // When Stream block has any downstream stream-trigger, do not subscribe from Stream; stream-triggers will subscribe instead.
    if (blockType === 'hyperliquidStream') {
      const hasStreamTriggerDownstream = node.outputs?.some((out) => {
        const target = nodeMap.get(out.targetNodeId)
        const targetDef = target ? getBlock((target.data?.blockType as string) ?? target.type) : null
        return targetDef?.category === 'streamTriggers'
      })
      if (hasStreamTriggerDownstream) {
        console.log('[runAgent] Skipping hyperliquidStream subscribe (stream-trigger(s) connected); stream-triggers will subscribe')
        continue
      }
    }

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

  // Stream-trigger blocks: each one connected from a Stream gets its own subscription with merged filters.
  for (const node of modelForInputs.nodes) {
    const blockType = (node.data?.blockType as string) ?? (node.type as string)
    const def = getBlock(blockType)
    if (def?.category !== 'streamTriggers') continue

    const streamConn = node.inputs?.find((c) => {
      const source = nodeMap.get(c.sourceNodeId)
      const sourceBlockType = (source?.data?.blockType as string) ?? source?.type
      return sourceBlockType === 'hyperliquidStream'
    })
    if (!streamConn) {
      console.warn('[runAgent] Stream-trigger node has no incoming connection from Hyperliquid Stream:', blockType, node.id)
      continue
    }

    const sourceNode = nodeMap.get(streamConn.sourceNodeId)
    if (!sourceNode) continue

    const rawStreamType = (sourceNode.data?.streamType as string) ?? 'trades'
    const streamType = normalizeStreamType(rawStreamType) as HyperliquidStreamType

    const nodeInputs: Record<string, string> = {}
    for (const field of def.inputs) {
      const val = node.data[field.name]
      nodeInputs[field.name] = val != null ? String(val) : (field.defaultValue ?? '')
    }

    const streamTriggerSpec = getFilterSpecForStreamTrigger(blockType, nodeInputs, streamType)
    const streamNodeData = (sourceNode.data ?? {}) as Record<string, unknown>
    const mergedSpec = mergeWithStreamSpec(streamNodeData, streamTriggerSpec)

    let filters: ReturnType<typeof buildFiltersFromSpec>
    try {
      filters = buildFiltersFromSpec(streamType, mergedSpec)
    } catch (e) {
      console.warn('[runAgent] buildFiltersFromSpec failed for stream-trigger:', blockType, e)
      continue
    }
    const validation = validateFilterLimits(streamType, filters)
    if (!validation.valid) {
      console.warn('[runAgent] Stream-trigger filter validation failed:', blockType, validation.errors)
      continue
    }

    const modelToUse = getModel?.(agentId) ?? model
    const runDownstream = (outputs: Record<string, string>) => {
      runDownstreamGraph(modelToUse, node.id, outputs, context, runOptions).catch((err) =>
        console.error('[runAgent] Downstream execution failed:', err),
      )
      onTrigger({ agentId, nodeId: node.id, outputs })
    }

    const runContext = { ...context, agentId, nodeId: node.id }
    const callback = createStreamTriggerCallback(streamType, blockType, nodeInputs, runDownstream, runContext)
    const unsub = subscribe(streamType, filters, callback)
    cleanups.push(unsub)
    console.log('[runAgent] Subscribing to stream-trigger:', blockType, 'nodeId:', node.id, 'streamType:', streamType)
  }

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}
