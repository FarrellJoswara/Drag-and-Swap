# Plan: Stream Display — Fields multi-select, remove label/maxItems

## Goal

1. **Fields to Show**: Replace the free-text "Fields to Show (comma-separated)" with a **multi-select** whose options are the **outputs of the connected input block** (the same block wired to "Event Data").
2. **Remove**: "Feed Label" input and "Max Items" input. Treat the display as a **stream** (no max-items cap) and drop the label section.

---

## Current state

- **Stream Display** ([src/lib/blocks.ts](src/lib/blocks.ts)) has inputs: `data` (textarea, allowVariable), `label`, `fields` (text), `maxItems`, `compact`.
- The TV header in [GenericNode.tsx](src/components/nodes/GenericNode.tsx) uses `inputs.label` for the header text.
- `run()` returns `lastEvent` (the connected data, optionally pretty-printed); it does not currently use `fields` or `maxItems` for filtering.

---

## 1. Block definition changes ([src/lib/blocks.ts](src/lib/blocks.ts))

- **Remove** the `label` input (Feed Label).
- **Remove** the `maxItems` input (Max Items).
- **Replace** the `fields` input:
  - Keep `name: 'fields'`.
  - Change from `type: 'text'` to a new type that the UI will treat specially, e.g. **`type: 'multiSelectFromConnection'`** (or keep `type: 'text'` and handle it only in the node UI; see below). Stored value: **JSON array string** of selected output names, e.g. `["price","side","coin"]`, so `run()` can parse it.
  - Option A (recommended): Introduce a new `InputFieldType`: `'multiSelectFromConnection'` with an optional `sourceInputName?: string` (default `'data'`). The renderer will need the connection info for that source input to get `availableOutputs`.  
  - Option B: Keep `fields` as `type: 'text'` in the block def; in **GenericNode** only, when rendering streamDisplay, render a custom multi-select for the `fields` field instead of the default text input. Options come from `connectionInfoByInput['data']?.availableOutputs`; value stored as JSON array string.

Recommendation: **Option B** — no new type in the registry; special-case streamDisplay in GenericNode for the `fields` input. Block def can use a placeholder type (e.g. `type: 'text'` with a hint) or we add a minimal type like `'multiSelect'` with no options in the def; options are supplied at render time from connection info.

Minimal registry change: add **`multiSelect`** to `InputFieldType` in [blockRegistry.ts](src/lib/blockRegistry.ts). The `options` for a multiSelect could be left empty in the block def; for streamDisplay we pass options from connection info in GenericNode. So we need a way to pass "dynamic options" — either a new prop on BlockInput (e.g. `dynamicOptions?: Array<{ name: string; label: string }>`) or render the fields control only in GenericNode for streamDisplay.

Simplest: **In GenericNode, for streamDisplay only**, when iterating over `definition.inputs`:
- Skip rendering `label` and `maxItems` (they’re removed from the def, so they disappear).
- For the input with `name === 'fields'`, don’t render `<BlockInput ... />`; render a **custom multi-select** that:
  - Reads options from `connectionInfoByInput['data']?.availableOutputs` (same source as the data connection).
  - When `data` is not connected: show a disabled or placeholder state: "Connect a block above to choose fields".
  - Value: `inputs['fields']` stored as JSON array string, e.g. `["price","side"]`. Toggle an option by parsing, adding/removing, then stringifying back and calling `updateInput('fields', newValue)`.
- All other inputs (e.g. `data`, `compact`) render via BlockInput as today.

So the block definition only needs: remove `label`, remove `maxItems`, and change `fields` to something we can recognize—e.g. keep `type: 'text'` and in GenericNode check `blockType === 'streamDisplay' && field.name === 'fields'` to render the custom control. No new type required.

---

## 2. Run logic ([src/lib/blocks.ts](src/lib/blocks.ts) `run`)

- **Remove** any use of `inputs.label` and `inputs.maxItems`.
- **Use** `inputs.fields`: parse as JSON array of strings (e.g. `["price","side","coin"]`). If the connected `data` is a JSON object, filter to only those keys (or build a small object with those keys from the parsed data) and set `lastEvent` to that filtered JSON string. If `fields` is empty or invalid, show full `data` as today. So the TV and `lastEvent` show only the selected fields when provided.

---

## 3. GenericNode ([src/components/nodes/GenericNode.tsx](src/components/nodes/GenericNode.tsx))

- **TV header**: Stop using `inputs.label`. Use a fixed label (e.g. "Live") or no text, just the green dot.
- **Input list**: When rendering inputs for streamDisplay:
  - For `field.name === 'fields'`: render the **custom multi-select**:
    - Options: `connectionInfoByInput['data']?.availableOutputs` (array of `{ name, label }`).
    - Value: parse `inputs['fields']` as JSON array; default to `[]`.
    - UI: checkboxes or a multi-select dropdown (e.g. each option is a checkbox; store value as JSON array string).
  - For all other fields, keep using `<BlockInput ... />` (so `data` and `compact` behave as now).
- No other references to `label` or `maxItems` (they’re gone from the def).

---

## 4. Files to touch

| File | Changes |
|------|--------|
| [src/lib/blocks.ts](src/lib/blocks.ts) | Remove `label` and `maxItems` inputs. Keep `fields` with a label like "Fields to show"; type can stay `text` (UI overridden in GenericNode). In `run()`, parse `fields` as JSON array; if `data` is JSON object, filter to those keys for `lastEvent`. |
| [src/components/nodes/GenericNode.tsx](src/components/nodes/GenericNode.tsx) | StreamDisplay: (1) TV header use fixed "Live" (or similar), not `inputs.label`. (2) When mapping definition.inputs, for `fields` render custom multi-select using `connectionInfoByInput['data']?.availableOutputs`; value = JSON array string via `updateInput('fields', ...)`. |

---

## 5. Multi-select UI (GenericNode)

- **When `data` is connected**: Show a list of checkboxes (or a compact multi-select) for each item in `connectionInfoByInput['data'].availableOutputs`. Selected list stored as JSON array string in `inputs['fields']`.
- **When `data` is not connected**: Show placeholder text: "Connect a block to choose fields" and optionally disable the control or show an empty list.
- **Persistence**: Value is a string, e.g. `'["price","side","coin"]'`. Parse with `JSON.parse` (catch to `[]`), then add/remove by name and `JSON.stringify` back.

---

## 6. Summary

- **Removed**: Feed Label input, Max Items input; label in TV header.
- **Replaced**: "Fields to Show" text field → multi-select whose options = outputs of the block connected to "Event Data"; value = JSON array of selected output names.
- **run()**: Uses `fields` to filter the incoming event (when it’s JSON) to only selected keys for `lastEvent` / TV; stream-style output (no max-items).

No new block-registry input type is strictly required if we special-case streamDisplay’s `fields` in GenericNode; the block def just keeps `fields` as a text-like input for storage shape.
