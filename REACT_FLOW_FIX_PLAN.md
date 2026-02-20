# Plan: Zero React Flow Errors + Block/Canvas Fixes

This document is the single source of truth for the fix plan. Implementation must follow it so that **no React Flow errors** occur (including error 008 and duplicate key warnings), and so that new blocks persist and paste/duplicate work correctly.

---

## React Flow error sources (what we must prevent)

| Source | Cause | How we prevent it |
|--------|--------|-------------------|
| **Duplicate key warning** | Multiple nodes with same `id` in the nodes array | Dedupe nodes by `id` when loading (keep first). |
| **Error 008** – "Couldn't create edge for target handle id: …" | Edge has `sourceHandle` or `targetHandle` that doesn't exist on the node, or handle id is `undefined` | 1) Never pass edges with missing handle IDs when nodes have multiple handles. 2) Validate both handles against block definitions. 3) Normalize legacy edges by assigning valid default handles or dropping invalid edges. |
| **Wrong handle / wrong node** | Duplicate node IDs cause edges to attach to wrong instance; or handle removed from block but edge kept | Dedupe nodes; validate every edge’s sourceHandle/targetHandle against current block defs; drop edges that reference non-existent handles. |

---

## Fix 1: Deduplicate nodes and edges when loading

**Where:** `normalizeFlowData` and `modelToFlowData` in `App.tsx`.

**What:**
- **Nodes:** Dedupe by `id` (keep first occurrence). All downstream logic uses this single node set.
- **Edges:** Keep only edges whose `source` and `target` exist in the deduped node set. Dedupe edges by `id` (or stable composite id when `id` is missing) so no duplicate edge keys.

**Why:** Prevents React duplicate key warnings and ensures edges reference exactly one node per endpoint.

**Status:** Implemented.

---

## Fix 2: Prevent load effect from overwriting the canvas

**Where:** Load effect dependency array in `App.tsx` (effect that calls `setNodes` / `setEdges` from agent data).

**What:**
- Remove `getAgentById` from the effect dependency array.
- Keep a ref (e.g. `getAgentByIdRef`) that always holds the latest `getAgentById`. In the effect, call `getAgentByIdRef.current(agentId)` instead of `getAgentById(agentId)`.
- Dependencies: only `agentId`, `walletAddress`, `setNodes`, `setEdges`.

**Why:** When `agents` (and thus `getAgentById`) changes, the effect no longer re-runs, so the canvas is not reloaded and newly dropped blocks are not wiped.

**Status:** Implemented.

---

## Fix 3: Reset node ID counter after load

**Where:** Immediately after building `nodes` in the load effect, before `setNodes(n)`.

**What:**
- Implement `resetNodeIdCounterAfterLoad(nodes)`: scan node `id`s, parse numeric part for pattern `node-(\d+)`, set module-level `idCounter` to `max(parsedIds)`.
- Call it before `setNodes(n)` so the next `getNextId()` is always greater than any loaded id.

**Why:** New nodes (drop, paste, duplicate) never reuse loaded IDs, avoiding collisions and confusion.

**Status:** Implemented.

---

## Fix 4: Zero React Flow errors – handle validation and normalization

Goal: **No edge is ever passed to React Flow with a missing or invalid handle ID.** Our nodes have multiple handles (multiple inputs/outputs per block), so React Flow requires explicit, valid `sourceHandle` and `targetHandle`.

### 4a. Normalize missing handle IDs (legacy / model-loaded edges)

**Where:** Same pipeline that produces edges for React Flow: after building the edge list in `normalizeFlowData` and `modelToFlowData`, and before (or inside) the function that filters invalid edges.

**What:**
- For each edge, if `sourceHandle` is missing or empty:
  - Resolve source node and its block definition.
  - Set `sourceHandle` to the **first output** name of that block (e.g. `def.outputs[0]?.name`). If there are no outputs, the edge is invalid — drop it or mark for removal in the next step.
- For each edge, if `targetHandle` is missing or empty:
  - Resolve target node and its block definition.
  - Set `targetHandle` to the **first connectable input** (first input whose `type !== 'walletAddress'`). If there is no such input, drop the edge.
- Only then run validation (4b/4c). So every edge that survives has both `sourceHandle` and `targetHandle` set to real handle names.

**Why:** Legacy or model-saved edges often lack handle IDs. React Flow throws 008 when handle id is undefined or doesn’t exist. Assigning defaults ensures we never pass undefined/invalid handles.

### 4b. Validate target handle

**Where:** `filterInvalidEdges` (or a single “validate and filter edges” helper used by both load paths).

**What:**
- For each edge, resolve target node and its block definition.
- Require `targetHandle` to be a string that exists on the block’s `inputs` (by name).
- Exclude inputs with `type === 'walletAddress'` (not connectable).
- If `targetHandle` is missing, invalid, or walletAddress-only: **remove the edge**.

**Why:** Prevents error 008 for target handle. Already partially done; ensure we never keep edges without a valid targetHandle after normalization.

**Current gap:** Today we **keep** edges with no `targetHandle` (`if (!e.targetHandle) return true`). That can cause 008 when the node has multiple handles. Plan: after 4a, we no longer have edges without targetHandle; then 4b should **reject** any edge whose targetHandle is not in the target block’s connectable inputs.

### 4c. Validate source handle

**Where:** Same place as 4b (single edge-validation step).

**What:**
- For each edge, resolve source node and its block definition.
- Require `sourceHandle` to be a string that exists on the block’s `outputs` (by name).
- If `sourceHandle` is missing or not in `def.outputs`: **remove the edge**.

**Why:** Error 008 can occur for source handle as well; validating both sides guarantees no React Flow handle errors.

### 4d. Apply in both load paths

**Where:**
- **normalizeFlowData:** After deduping nodes/edges and mapping positions, run “normalize handle IDs” (4a) then “validate and filter edges” (4b + 4c). Return only nodes and edges that pass.
- **modelToFlowData:** Same: after building nodes/edges (and preserving any existing handle IDs from the model), run 4a then 4b+4c. So legacy model edges get default handles if missing, then invalid ones are dropped.

**Why:** Every edge that reaches `setEdges()` is valid for React Flow.

### 4e. Paste and duplicate

**Where:** Paste (Ctrl+V) and duplicate (Ctrl+D) in `App.tsx` when building new edges from clipboard/selection.

**What:**
- When mapping copied/duplicated edges, preserve `sourceHandle` and `targetHandle` from the original edge (already done via `...ed`).
- After building the new edge list (with new node ids and new edge ids), run the **same** “normalize handle IDs + validate” logic on the new edges (using the **new** nodes list). So if a pasted/duplicated edge somehow has a missing or invalid handle (e.g. block type changed), we fix or drop it instead of passing bad data to React Flow.

**Why:** Ensures paste/duplicate never introduce edges that would trigger 008.

---

## Implementation order

1. **Fix 1** – Deduplication (done).
2. **Fix 2** – Load effect deps + ref (done).
3. **Fix 3** – Reset ID counter (done).
4. **Fix 4** – Zero React Flow errors (done):
   - 4a. `normalizeEdgeHandles(nodes, edges)` assigns default sourceHandle/targetHandle when missing and drops edges that can’t be normalized.
   - 4b/4c. `validateAndFilterEdges(nodes, edges)` validates sourceHandle against source outputs and targetHandle against target connectable inputs; rejects missing/invalid handles.
   - 4d. Both `normalizeFlowData` and `modelToFlowData` run normalize then validate before returning edges.
   - 4e. Paste and duplicate run normalize + validate on new edges (with new nodes) before adding to the canvas.

---

## Verification (after implementation)

- No duplicate key warnings in console (Fix 1).
- Newly dropped blocks persist when switching agents or when agents list updates (Fix 2).
- New node IDs never collide with loaded IDs (Fix 3).
- No React Flow error 008 or other handle-related errors (Fix 4).
- Paste and duplicate produce only valid edges; no 008 from pasted/duplicated edges (Fix 4e).

---

## Option A/B (startsWith) – already done

- **GenericNode:** `value={inputs[field.name] ?? ''}` so value is always a string.
- **BlockInputs:** `value` optional with defaults; `DropZone` uses `value ?? ''` before `startsWith`.

No further changes required for the `startsWith` error.
