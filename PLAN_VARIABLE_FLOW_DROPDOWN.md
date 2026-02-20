# Plan B: Dropdown in connected block — implementation only

Single approach: when an input has an incoming edge, show a dropdown on that input to choose which output of the source block flows. Only **2 files** are edited; no changes to `runAgent`, `buildConnectedModel`, `App.tsx`, or types.

---

## 1. Files to edit

| File | Role |
|------|------|
| [src/components/nodes/GenericNode.tsx](src/components/nodes/GenericNode.tsx) | Compute connection info per input, pass to BlockInput, handle edge updates |
| [src/components/nodes/BlockInputs.tsx](src/components/nodes/BlockInputs.tsx) | Optional props + "From [block]: output" dropdown when connected |

No other files are modified. Runtime already uses `edge.sourceHandle`; updating it via `setEdges` is enough.

---

## 2. GenericNode.tsx — changes

**2.1** Add `setEdges` to `useReactFlow()` (line 37):

```ts
const { setNodes, getNodes, getEdges, setEdges } = useReactFlow()
```

**2.2** Add a `useMemo` that builds connection info for each input that has an incoming edge (place after `inputConnections` useMemo, ~line 96):

- `nodes = getNodes()`
- For each `definition.inputs` with `field.name`:
  - `edge = edges.find(e => e.target === id && e.targetHandle === field.name)` — use first edge only
  - If no `edge`, skip
  - `sourceNode = nodes.find(n => n.id === edge.source)`; if !sourceNode, skip
  - `sourceDef = getBlock(sourceNode.data?.blockType as string)`; if !sourceDef or !sourceDef.outputs?.length, skip
  - Store: `{ edgeId: edge.id, sourceBlockLabel: sourceDef.label, availableOutputs: sourceDef.outputs.map(o => ({ name: o.name, label: o.label })), currentSourceHandle: edge.sourceHandle ?? sourceDef.outputs[0].name }`
- Return a `Record<string, typeof that object>` keyed by `field.name` (only for inputs that have valid connection info)

Use a stable type: define **ConnectionInfo** once in BlockInputs.tsx (see section 3.1), export it, and in GenericNode use `Record<string, ConnectionInfo>` for the useMemo return type so both sides stay in sync. Dependencies for the useMemo: `[edges, id, definition.inputs, getNodes]` — call `getNodes()` inside the useMemo body to get current nodes; `getNodes` is stable in React Flow.

**2.3** Add callback to update edge sourceHandle (e.g. after the useMemos):

```ts
const onSourceOutputChange = useCallback(
  (fieldName: string, outputName: string) => {
    const edge = edges.find(e => e.target === id && e.targetHandle === fieldName)
    if (!edge) return
    setEdges(eds =>
      eds.map(e => (e.id === edge.id ? { ...e, sourceHandle: outputName } : e))
    )
  },
  [id, edges, setEdges]
)
```

**2.4** When rendering `BlockInput` (lines 132–141), pass two optional props only when the input has connection info:

- `connectionInfo={connectionInfoByInput[field.name] ?? undefined}`
- `onSourceOutputChange={outputName => onSourceOutputChange(field.name, outputName)}`

So the BlockInput call becomes:

```tsx
<BlockInput
  key={field.name}
  field={field}
  value={inputs[field.name] ?? ''}
  onChange={(val) => updateInput(field.name, val)}
  color={definition.color}
  connectionInfo={connectionInfoByInput[field.name]}
  onSourceOutputChange={
    connectionInfoByInput[field.name]
      ? (outputName) => onSourceOutputChange(field.name, outputName)
      : undefined
  }
/>
```

Guard so `onSourceOutputChange` is only passed when there is connection info (avoids no-op calls).

---

## 3. BlockInputs.tsx — changes

**3.1** Define and export the connection type, then extend `BlockInputProps` (lines 89–95):

```ts
export type ConnectionInfo = {
  edgeId: string
  sourceBlockLabel: string
  availableOutputs: Array<{ name: string; label: string }>
  currentSourceHandle: string
}

// In BlockInputProps add:
connectionInfo?: ConnectionInfo
onSourceOutputChange?: (outputName: string) => void
```

**3.2** Add a small “connected input” component that renders only the dropdown (no other input type). Use existing styling (e.g. `baseInput`, `focusColorClass`, or a compact select). Example structure:

- Label: same as other inputs (`field.label`)
- Row: “From [sourceBlockLabel]:” + `<select>` with `availableOutputs` as options, `value={connectionInfo.currentSourceHandle}`, `onChange={e => onSourceOutputChange(e.target.value)}`
- Use `nodrag` on the select so it doesn’t trigger canvas drag. Use existing `ChevronDown` and select styling for consistency.

**3.3** In the main `BlockInput` dispatcher (the default export, lines 375–378):

- If `props.connectionInfo` is defined **and** `props.field.type !== 'walletAddress'`, return the new “connected input” dropdown component (with `connectionInfo` and `onSourceOutputChange`). Do **not** render the type-specific renderer in that case.
- Otherwise, keep current behavior: `const Renderer = renderers[props.field.type] ?? TextInput; return <Renderer {...props} />`.

This way existing renderers are unchanged and never receive `connectionInfo`; they are only used when the input is not connected. No changes to any of the individual input components (TextInput, NumberInput, etc.).

**3.4** TypeScript: Ensure the connected-input component receives only the props it needs (connectionInfo, onSourceOutputChange, field for label). The rest of BlockInputProps (value, onChange, color) can be omitted when rendering the connected state since the value is dictated by the connection.

---

## 4. Safety and edge cases

- **Missing source node** (e.g. deleted): Do not add to `connectionInfoByInput` if `sourceNode` or `sourceDef` is missing; that input then renders as a normal (disconnected) input.
- **Missing sourceHandle on edge**: Use `edge.sourceHandle ?? sourceDef.outputs[0].name` so the dropdown always has a valid selection.
- **walletAddress**: Never show the connection dropdown for `field.type === 'walletAddress'`; it already has no handle and doesn’t accept connections.
- **One edge per input**: Use `edges.find(...)` so at most one connection is considered per input; matches runAgent which uses the first matching connection.
- **Stale closure**: `onSourceOutputChange` uses `edges` and `id` from the current render; `setEdges` is stable. No need for refs.

---

## 5. What stays unchanged

- **App.tsx**: No changes to `onConnect` or edge options.
- **runAgent.ts** / **buildConnectedModel**: Already use `sourceHandle` from edges; no code changes.
- **connectionValidation.ts**: Not used for dropdown selection; optional later to filter outputs by `accepts` on the input.
- **Other nodes/UI**: No new components; no new files.

---

## 6. Order of implementation

1. **BlockInputs.tsx**: Add optional props to the interface, add the connected-input dropdown component, add the dispatcher branch (if connectionInfo + not walletAddress → dropdown, else existing renderer). This is backward compatible: when `connectionInfo` is undefined, behavior is identical to today.
2. **GenericNode.tsx**: Add `setEdges`, add `useMemo` for `connectionInfoByInput`, add `onSourceOutputChange`, pass `connectionInfo` and `onSourceOutputChange` into `BlockInput`. Call `getNodes()` inside the useMemo body; use deps `[edges, id, definition.inputs, getNodes]`. and that you don’t call `getNodes()` inside the useMemo in a way that changes reference every render — call `getNodes()` once at the top of the component (e.g. `const nodes = getNodes()`) and depend on `nodes` in the useMemo, or depend on `edges` and `id` and call `getNodes()` inside the useMemo (getNodes is stable in React Flow). Prefer `const nodes = getNodes()` before the useMemo and use `[edges, id, nodes, definition.inputs]` as deps so the memo is stable when the graph hasn’t changed.

Applying these two files only, in this order, keeps the change set minimal and avoids introducing errors in unrelated code.
