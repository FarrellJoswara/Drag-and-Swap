# Plan: Green only when used, allow typing when connected, “Connected to” at top

## Goals

1. **Green output handle only when actively used**: An output handle should turn green only when that specific output is the one selected on the edge (i.e. `edge.sourceHandle === out.name`). Do not treat “no sourceHandle” as the first output so that connecting without a chosen variable does not light up the first output.
2. **Allow typing when connected**: For blocks with text (or similar) inputs that have a connection, do not replace the field with only the variable dropdown. Show both the output selector and an editable text field so the user can type (e.g. literal override or default). At run time: if the user has entered a non-empty value, use it (after variable resolution); otherwise use the connected value.
3. **“Connected to [nodes]” at top**: When one or more blocks are connected to this node, show a single line at the top of the node body: “Connected to: [Block1], [Block2]” (unique source block labels). Do not repeat “From X:” above every connected input; show only the per-input dropdown (and optional text field) with the field label.

---

## 1. Green only when that output is selected

**Cause**: `outputConnections` currently counts an edge with no `sourceHandle` as the first output (`!e.sourceHandle && firstOutputName === out.name`), so the first output lights up as soon as an edge exists even before the user picks a variable.

**Change**: [src/components/nodes/GenericNode.tsx](src/components/nodes/GenericNode.tsx)  
In the `outputConnections` useMemo, **remove** the fallback that assigns edges without `sourceHandle` to the first output. Count only when `e.sourceHandle === out.name`. If an edge has no `sourceHandle`, it will not light any handle until the user selects an output (dropdown or default when edge is created).

- Remove the `firstOutputName` variable and the condition `if (!e.sourceHandle && firstOutputName === out.name) return true`.
- Keep only: `if (e.source !== id) return false` and `if (e.sourceHandle === out.name) return true`.

**Risk**: Edges created without `sourceHandle` (e.g. very old saves) will not light any output until the user opens the dropdown (which normalizes the edge). Acceptable.

---

## 2. Allow typing when connected (dropdown + text input)

**Current**: When an input has `connectionInfo`, BlockInput renders only `ConnectedInputDropdown` (dropdown to pick which output). The user cannot type.

**Desired**: When connected and the field type supports text (e.g. text, textarea, number with allowVariable), show:
- The output dropdown (which variable from the source block), and
- An editable text input so the user can type a literal or override.

**Runner behavior**: When a connection exists and the stored value (user-typed) is non-empty, use the stored value (after variable resolution). When the stored value is empty, use the connected value. So: “typed override wins when present.”

**Files**:

- [src/components/nodes/BlockInputs.tsx](src/components/nodes/BlockInputs.tsx)  
  - In the dispatcher, when `connectionInfo != null` and `onSourceOutputChange != null` and the field is not walletAddress:
    - For field types that support both connection and literal (e.g. `text`, `textarea`, `number` when `allowVariable`), render a **combined** row: output dropdown (compact, e.g. “Variable: [dropdown]”) plus the normal text/textarea/number input below or beside it, so the user can type. Pass through `value` and `onChange` so the typed value is stored in node data.
    - For other types (e.g. `select`, `tokenSelect`), keep current behavior: only the connected dropdown (no second input).
  - Ensure the dropdown still updates the edge’s `sourceHandle` via `onSourceOutputChange`; the text input updates node data via `onChange`.

- [src/lib/runAgent.ts](src/lib/runAgent.ts)  
  - When resolving input values for a field that has a connection: if the **stored** value (after trimming) is non-empty, use it (and then `resolveVariables` as today). If the stored value is empty, use the connected value. So:  
    `val = (storedVal.trim() !== '' ? storedVal : (connectedVal ?? storedVal))` (with existing number/type handling preserved).

**Edge cases**:  
- Do not show the combined “dropdown + text” for fields that are not allowVariable or that are not text/textarea/number (or that should never show literal).  
- Keep existing behavior for swap’s wallet address and other special inputs.

---

## 3. “Connected to [nodes]” at top of node

**Current**: Each connected input shows “From {sourceBlockLabel}:” above its dropdown.

**Desired**:  
- One line at the **top** of the node body (first line inside the main content area): “Connected to: Block1, Block2” (comma-separated, unique source block labels for all edges where `target === id`).  
- Per connected input: show only the field label and the dropdown (and optional text field from goal 2), **without** repeating “From X:” above each one.

**Files**:

- [src/components/nodes/GenericNode.tsx](src/components/nodes/GenericNode.tsx)  
  - Add a useMemo: from `edges` and `getNodes()`, compute `connectedSourceLabels: string[]` — unique list of source block labels for edges with `e.target === id`.  
  - At the top of the node content (first child inside the main `div` with `gap-2`), when `connectedSourceLabels.length > 0`, render one line: e.g. “Connected to: {connectedSourceLabels.join(', ')}”.  
  - Pass a prop to BlockInput (e.g. `hideSourceLabel?: boolean`) when we are showing the global “Connected to” at top, and when `hideSourceLabel` is true, ConnectedInputDropdown (or the combined dropdown+text) does not render the “From {sourceBlockLabel}:” line.

- [src/components/nodes/BlockInputs.tsx](src/components/nodes/BlockInputs.tsx)  
  - In `ConnectedInputDropdown` (and any new combined component), accept `hideSourceLabel?: boolean`. When true, do not render the “From {sourceBlockLabel}:” span; only the dropdown (and optional text input).

**Result**: One “Connected to A, B” at the top; below it, each input only shows its label and the dropdown (and text field when applicable).

---

## 4. Implementation order and safety

1. **Green-handle fix** (GenericNode only): Remove the fallback in `outputConnections`. Low risk; no runner or BlockInputs change.  
2. **“Connected to” at top** (GenericNode + BlockInputs): Add `connectedSourceLabels`, top line, and `hideSourceLabel`; stop showing “From X:” per input when the top line is shown.  
3. **Allow typing when connected** (BlockInputs + runAgent): Add combined UI for text/textarea/number with connection; add “use stored when non-empty” in runAgent.  
4. **Manual test**: Connect Time Loop to Recent Trades — only the selected output handle (or none until selection) should be green. Open a text input that has a connection — dropdown and text field both visible; typing stores and runner uses it when non-empty. Node with two connections shows “Connected to: Time Loop, Recent Trades” once at top.

---

## 5. Summary table

| Goal | File(s) | Change |
|------|---------|--------|
| Green only when used | GenericNode.tsx | In outputConnections, count only when e.sourceHandle === out.name; remove first-output fallback. |
| Connected to at top | GenericNode.tsx | Compute connectedSourceLabels, render “Connected to: X, Y” at top; pass hideSourceLabel to BlockInput. |
| Hide “From X” per input | BlockInputs.tsx | ConnectedInputDropdown accepts hideSourceLabel; when true, omit “From {sourceBlockLabel}:”. |
| Dropdown + text when connected | BlockInputs.tsx | For text/textarea/number+allowVariable with connection, render dropdown + text input; both wired. |
| Use typed value when non-empty | runAgent.ts | When connection exists, use stored value if non-empty (after trim), else connected value. |

No changes to block definitions or build; all changes are UI and one runner rule.
