import { getBlock } from '../lib/blockRegistry'
import type { Node } from '@xyflow/react'
import { EXEC_IN_HANDLE, EXEC_OUT_HANDLE } from './executionHandles'

export type ConnectionValidationContext = {
  nodes: Node[]
  edges: Array<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>
}

/**
 * Validate execution-only connections: source must be exec-out, target must be exec-in.
 * Target block cannot be a trigger (no exec-in handle).
 */
export function isValidConnection(
  sourceNode: Node | undefined,
  targetNode: Node | undefined,
  sourceHandle: string | null,
  targetHandle: string | null,
  _context?: ConnectionValidationContext
): { valid: boolean; reason?: string } {
  if (!sourceNode || !targetNode) {
    return { valid: true }
  }

  const targetBlockType = (targetNode.data?.blockType as string) ?? targetNode.type
  const targetBlock = getBlock(targetBlockType)
  if (!targetBlock) return { valid: true }

  if (targetBlock.category === 'trigger') {
    return { valid: false, reason: 'Triggers cannot receive execution connections' }
  }

  if (sourceHandle != null && targetHandle != null) {
    if (sourceHandle !== EXEC_OUT_HANDLE || targetHandle !== EXEC_IN_HANDLE) {
      return { valid: false, reason: 'Only execution flow connections are allowed (one handle in, one out per block)' }
    }
  }

  return { valid: true }
}
