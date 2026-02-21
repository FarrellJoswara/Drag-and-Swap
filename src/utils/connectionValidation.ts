import { getBlock, getOutputsForBlock } from '../lib/blockRegistry'
import type { InputField } from '../lib/blockRegistry'
import type { Node } from '@xyflow/react'

export type ConnectionValidationContext = {
  nodes: Node[]
  edges: Array<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>
}

/**
 * Check if a connection between source output and target input is valid based on types.
 * Returns { valid: boolean, reason?: string }
 * When context is provided and source is streamDisplay, uses the block connected to its data input for output list.
 */
export function isValidConnection(
  sourceNode: Node | undefined,
  targetNode: Node | undefined,
  sourceHandle: string | null,
  targetHandle: string | null,
  context?: ConnectionValidationContext
): { valid: boolean; reason?: string } {
  // Allow connections if nodes are missing (shouldn't happen, but be safe)
  if (!sourceNode || !targetNode) {
    return { valid: true } // Don't block if we can't validate
  }

  // Allow if handles are missing (ReactFlow might not always provide them)
  if (!sourceHandle || !targetHandle) {
    return { valid: true } // Allow connections without handles for backward compatibility
  }

  const sourceBlockType = (sourceNode.data?.blockType as string) ?? sourceNode.type
  const targetBlockType = (targetNode.data?.blockType as string) ?? targetNode.type

  const sourceBlock = getBlock(sourceBlockType)
  const targetBlock = getBlock(targetBlockType)

  // Allow if blocks are missing (backward compatibility)
  if (!sourceBlock || !targetBlock) {
    return { valid: true }
  }

  // Resolve source outputs: for Output Display use the block connected to its data input
  let sourceOutputs = getOutputsForBlock(sourceBlockType, sourceNode.data ?? {})
  if (sourceBlockType === 'streamDisplay' && context?.nodes && context?.edges) {
    const dataEdge = context.edges.find(
      (e) => e.target === sourceNode.id && e.targetHandle === 'data'
    )
    if (dataEdge) {
      const dataSourceNode = context.nodes.find((n) => n.id === dataEdge.source)
      if (dataSourceNode) {
        const dataSourceBlockType = (dataSourceNode.data?.blockType as string) ?? dataSourceNode.type
        const resolved = getOutputsForBlock(dataSourceBlockType, dataSourceNode.data ?? {})
        if (resolved.length > 0) sourceOutputs = resolved
      }
    }
  }

  const sourceOutput = sourceOutputs.find((o) => o.name === sourceHandle)
  const targetInput = targetBlock.inputs.find((i: InputField) => i.name === targetHandle)

  // Reject if target handle doesn't exist (e.g. slippage, swapper when no handle is rendered)
  if (!targetInput) {
    return { valid: false, reason: `Target input "${targetHandle}" does not exist on this block` }
  }
  // Reject if target is walletAddress - no handle is rendered for these
  if (targetInput.type === 'walletAddress') {
    return { valid: false, reason: 'Wallet inputs use the connected wallet and cannot receive connections' }
  }
  if (!sourceOutput) {
    return { valid: false, reason: 'Source output not available for current settings' }
  }

  // If neither has type information, allow (backward compatibility)
  if (!sourceOutput.type && !targetInput.accepts) {
    return { valid: true }
  }

  // If source has no type but target has accepts, allow (backward compatibility)
  if (!sourceOutput.type && targetInput.accepts) {
    return { valid: true }
  }

  // If source has type but target has no accepts, allow (backward compatibility)
  if (sourceOutput.type && !targetInput.accepts) {
    return { valid: true }
  }

  // Both have type information - validate
  if (sourceOutput.type && targetInput.accepts) {
    const isCompatible = targetInput.accepts.includes(sourceOutput.type)
    if (!isCompatible) {
      return {
        valid: false,
        reason: `Type mismatch: ${sourceOutput.type} cannot connect to input accepting ${targetInput.accepts.join(', ')}`,
      }
    }
  }

  return { valid: true }
}
