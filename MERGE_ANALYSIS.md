# Merge Conflict Analysis

## Summary

Two files have merge conflicts (Updated upstream vs Stashed changes):

1. **`src/lib/runAgent.ts`** (lines 118–165) – input resolution and trigger/streamDisplay handling
2. **`src/components/nodes/GenericNode.tsx`** (lines 177–195) – connection info for input dropdowns

---

## 1. `src/lib/runAgent.ts`

### Updated upstream (incoming)

- Resolves **source node and block def** for each connection: `sourceNode`, `sourceBlockType`, `sourceDef`, `sourceIsTrigger`.
- **Trigger rule**: if the source is a trigger block and the target is *not* streamDisplay’s `data` input, do **not** pass the trigger’s output into the input; keep stored/default (trigger only affects execution order).
- For streamDisplay’s `data` input: use the source’s **`data` output** when present (`useDataForDisplay` → `connectedVal = srcOuts[outName] ?? val`).
- Does **not** include the number-field validation for `connectedVal`.

### Stashed changes (yours)

- No trigger check; every connection passes output into the input.
- For streamDisplay’s `data` input: **pass full normalized outputs** as JSON (`useNormalizedForDisplay` → `connectedVal = JSON.stringify(srcOuts)`) so “Fields to Show” match.
- **Number validation**: when `field.type === 'number'` and `connectedVal` is set, validate finite and `> 0`; otherwise keep stored/default.

### Merge strategy (keep both behaviors)

1. **Keep upstream trigger logic**: resolve `sourceNode`, `sourceBlockType`, `sourceDef`, `sourceIsTrigger` and skip passing trigger output except for streamDisplay’s `data` input.
2. **Keep stashed streamDisplay behavior**: use `useNormalizedForDisplay` and `connectedVal = JSON.stringify(srcOuts)` for streamDisplay’s `data` so the display gets the full object and field selection works.
3. **Keep stashed number validation**: after `if (storedVal.trim() !== '') val = storedVal`, use the `else` branch with number validation and then `val = connectedVal`.

Result: triggers only affect execution order (except streamDisplay data), streamDisplay gets full normalized output as JSON, and number inputs are validated.

---

## 2. `src/components/nodes/GenericNode.tsx`

### Updated upstream (incoming)

- Uses **static outputs** from block def: `sourceDef = getBlock(sourceNode.data?.blockType)`, then `sourceDef?.outputs?.length` and `sourceDef.outputs` for `currentSourceHandle` and (implicitly) for building options.
- Optional: skip building connection info when source is a trigger and target is not streamDisplay’s `data` (so trigger connections don’t show a data dropdown).

### Stashed changes (yours)

- Uses **dynamic outputs** via `getOutputsForBlock(blockType, nodeData)`: `sourceBlockType = (sourceNode.data?.blockType as string) ?? sourceNode.type`, then `sourceOutputs = getOutputsForBlock(sourceBlockType, sourceNode.data ?? {})`.
- Uses `sourceOutputs` for length check, `currentSourceHandle`, and `availableOutputs` in `result[field.name]`.
- Supports blocks whose outputs depend on node data (e.g. stream type).

### Merge strategy (keep stashed + optional trigger skip)

1. **Use stashed resolution**: `sourceBlockType = (sourceNode.data?.blockType as string) ?? sourceNode.type`, `sourceDef = getBlock(sourceBlockType)`, `sourceOutputs = getOutputsForBlock(sourceBlockType, sourceNode.data ?? {})`.
2. **Keep stashed checks**: `if (!sourceDef) continue`, `if (!sourceOutputs.length) continue`.
3. **Optional from upstream**: add `if (sourceDef.category === 'trigger' && !(blockType === 'streamDisplay' && field.name === 'data')) continue` so connection info (and dropdown) are not built for trigger→non–streamDisplay-data connections.
4. **Use `sourceOutputs`** for `currentSourceHandle` and `availableOutputs` so dynamic outputs (and `result[field.name]`) stay correct.

Result: connection dropdowns use dynamic outputs and, if you add the trigger check, trigger-only connections don’t get data dropdowns except for streamDisplay’s data input.

---

## Summary table

| File              | Upstream adds                         | Stashed adds                          | Merge action                                                |
|-------------------|----------------------------------------|--------------------------------------|-------------------------------------------------------------|
| `runAgent.ts`     | Trigger skip; streamDisplay uses data  | Full JSON for streamDisplay; number  | Keep trigger skip; use JSON + number validation (stashed).  |
| `GenericNode.tsx` | Static `sourceDef.outputs`; trigger skip| `getOutputsForBlock`, `sourceOutputs`| Use `getOutputsForBlock` + `sourceOutputs`; optional trigger skip. |

Applying these resolutions keeps trigger semantics, streamDisplay behavior, number validation, and dynamic output support without losing functionality.
