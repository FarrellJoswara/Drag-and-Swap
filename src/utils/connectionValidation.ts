import { getBlock } from '../lib/blockRegistry'
import type { OutputField, InputField } from '../lib/blockRegistry'
import type { Node } from '@xyflow/react'

/**
 * Check if a connection between source output and target input is valid based on types.
 * Returns { valid: boolean, reason?: string }
 */
export function isValidConnection(
  sourceNode: Node | undefined,
  targetNode: Node | undefined,
  sourceHandle: string | null,
  targetHandle: string | null
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

  // Find the output and input fields
  const sourceOutput = sourceBlock.outputs.find((o: OutputField) => o.name === sourceHandle)
  const targetInput = targetBlock.inputs.find((i: InputField) => i.name === targetHandle)

  // Allow if fields are missing (backward compatibility)
  if (!sourceOutput || !targetInput) {
    return { valid: true }
  }

  // If neither has type information, allow (backward compatibility)
  if (!sourceOutput.type && !targetInput.accepts) {
    return { valid: true }
  }

  // If source has no type but target has accepts, allow (backward compatibility)
  if (!sourceOutput.type && targetInput.accepts) {
    return { valid: true, reason: 'Source output has no type information' }
  }

  // If source has type but target has no accepts, allow (backward compatibility)
  if (sourceOutput.type && !targetInput.accepts) {
    return { valid: true, reason: 'Target input has no type restrictions' }
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
