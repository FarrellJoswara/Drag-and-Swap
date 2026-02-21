# Plan: Green output handle when variable is used — fix

## Problem

When a variable (block output) is selected/used — i.e. when an edge connects from one block’s output to another block’s input — the **source** block’s output handle does not turn green. Only the target’s input handle turns green.

## Root cause

1. **Re-renders**: `GenericNode` gets the current edges by calling `getEdges()` from `useReactFlow()`. That is a getter, not a subscription. When a new edge is added, the **source** node’s props (id, data, selected, etc.) do not change, so React may not re-render it. So the source node never recomputes `outputConnections` after the new edge is added, and the output handle never gets the green class.

2. **Optional**: Edges created without `sourceHandle` (e.g. older saved flows or a missing handle id) would not match `e.sourceHandle === out.name`, so we could add a fallback for the first output when `sourceHandle` is missing.

## Fix

### 1. Subscribe to edges so the source node re-renders

**File**: [src/components/nodes/GenericNode.tsx](src/components/nodes/GenericNode.tsx)

- **Use `useEdges()`** from `@xyflow/react` instead of `getEdges()` to read the current edges.
- `useEdges()` subscribes to the React Flow store, so when edges change (add/remove), any node using it will re-render. Then `outputConnections` will recompute and the source block’s output handle will get the green class when it has at least one connection.

**Change**:  
- Import: `import { Handle, Position, useReactFlow, useEdges, type NodeProps } from '@xyflow/react'`.  
- Replace `const edges = getEdges()` with `const edges = useEdges()`.  
- Keep all `outputConnections` and output-handle logic as-is; only the source of `edges` changes.

### 2. (Optional) Fallback when `sourceHandle` is missing

In the same file, in the `outputConnections` useMemo, treat an edge as using an output when:

- `e.source === id` and `e.sourceHandle === out.name`, **or**
- `e.source === id` and `e.sourceHandle` is falsy and `out.name === definition.outputs[0]?.name` (first output).

So legacy or malformed edges still turn the first output green.

## Summary

| Item | File | Change |
|------|------|--------|
| Subscribe to edges | GenericNode.tsx | Use `useEdges()` instead of `getEdges()` so nodes re-render when edges change. |
| Optional fallback | GenericNode.tsx | In outputConnections, count edge with no sourceHandle as first output when e.source === id. |

After this, when a variable is selected (edge created from source output to target input), the source block’s output handle will turn green.
