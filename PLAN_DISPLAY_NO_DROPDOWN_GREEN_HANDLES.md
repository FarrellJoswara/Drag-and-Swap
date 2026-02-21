# Plan: Stream Display — Remove source dropdown; green output handles

## Goals

1. **Stream Display**: Remove the "From [Block]: [dropdown]" so the block only shows the "Fields to Show" section (and connection state). When a block is connected, show a minimal "Connected to [Block]" line with disconnect only; no output picker dropdown.
2. **Green symbol when output is selected**: When an output handle has at least one connection (i.e. that output is sent to a downstream block), style the output handle (the little circle on the right) green, matching the existing green style used for connected input handles.

---

## 1. Stream Display: remove source dropdown

**Current behavior**: When a block is connected to the Stream Display's "data" input, we show "From [Block]: [dropdown]" so the user can choose which output of the source block flows in.

**New behavior**: Do not show the dropdown. Only show:
- When **not connected**: "Connect a block to choose outputs" (unchanged).
- When **connected**: A single line like "Connected to [Block name]" with an optional disconnect button — no dropdown. The edge keeps its current `sourceHandle` (set at connection time, e.g. first output by default). The runner continues to use that handle; the user does not change it in the UI.

**Files**: [src/components/nodes/GenericNode.tsx](src/components/nodes/GenericNode.tsx)

**Change**: In the branch that renders streamDisplay's `data` field when `dataConn` exists, replace the dropdown block with a minimal row: "Connected to {sourceBlockLabel}" and the disconnect button. Remove the `<select>`, "From X:", and `onSourceOutputChange` usage for this block. Do not remove the connection or the edge's sourceHandle — only the UI for changing it.

**Runtime**: No change to runAgent or block def. The edge's `sourceHandle` remains (default or whatever was set when the user connected); the display still receives one value from that handle.

---

## 2. Green output handles when connected

**Current behavior**: Input (target) handles on the left turn green when they have an incoming edge (`!bg-emerald-400 !border-emerald-500`). Output (source) handles on the right have no conditional styling.

**New behavior**: When an output handle has at least one edge leaving from it (`source === id && sourceHandle === out.name`), style that output handle green with the same classes: `!bg-emerald-400 !border-emerald-500`.

**Files**: [src/components/nodes/GenericNode.tsx](src/components/nodes/GenericNode.tsx)

**Change**: In the output handles section, we already have `outputConnections` (a map of output name to connection count). Use it when rendering each `<Handle>`: add `className={outputConnections[out.name] > 0 ? '!bg-emerald-400 !border-emerald-500' : ''}` (or equivalent) so the handle turns green when that output is connected to at least one downstream block.

---

## Summary

| Item | File | Change |
|------|------|--------|
| Remove "From X" dropdown on Stream Display | GenericNode.tsx | When streamDisplay + data connected, render "Connected to [Block]" + disconnect only; remove select and onSourceOutputChange for this row. |
| Green output handles | GenericNode.tsx | For each output Handle, add green class when `outputConnections[out.name] > 0`. |

No changes to block definitions, runAgent, or other components.
