# Plan: Reusable Side Panel (SideNode) & Option Tooltips

## Goal

1. **Reusable side panel component** — A generic component (e.g. **SideNode**) that any block can use: main content on the left, an arrow that opens a panel to the right. Not specific to Hyperliquid.
2. **Hyperliquid as first consumer** — Hyperliquid Stream uses this component: main = stream type; side panel = "Filters" with enable/disable toggle and all filter fields.
3. **Enable / disable filters** — When the panel's "Enable filters" is off, no filters are applied (receive all stream data).
4. **No filter applied** — Support via the disable toggle or by leaving options at All/None/empty.
5. **Option tooltips** — Hovering over dropdown options shows a short description (reusable for any block that defines `optionDescriptions`).

---

## Current State

- **GenericNode** ([`src/components/nodes/GenericNode.tsx`](src/components/nodes/GenericNode.tsx)): Renders one card per block; for non–streamDisplay blocks it maps `definition.inputs` and renders each with `BlockInput` in a single column. Block-type-specific branches exist (e.g. `manualTrigger`, `streamDisplay`).
- **NodeShell** ([`src/components/ui/NodeShell.tsx`](src/components/ui/NodeShell.tsx)): Fixed width `w-[220px]`; no variable width or side panel.
- **BlockInputs** ([`src/components/nodes/BlockInputs.tsx`](src/components/nodes/BlockInputs.tsx)): Renders `select` with native `<option>`; no per-option tooltips.
- **Block definition** ([`src/lib/blocks.ts`](src/lib/blocks.ts)): Hyperliquid Stream has flat inputs; no grouping or side-panel opt-in yet.

---

## 1. Reusable Component: SideNode (or NodeWithSidePanel)

### Purpose

A **modular wrapper** that any node can use to show "main" content in the primary card and "secondary" content in a panel that opens to the right. No block-specific logic inside the component.

### API (proposed)

- **Location:** New file `src/components/nodes/node-extension/SideNode.tsx` (see [File plan](#file-plan) below).
- **Props:**
  - `mainContent: ReactNode` — Rendered inside the main card (e.g. NodeShell with a subset of inputs).
  - `sidePanelContent: ReactNode` — Rendered in the panel when open (e.g. "Enable filters" + filter inputs).
  - `sidePanelLabel: string` — Title for the panel (e.g. `"Filters"`). Shown in the panel header.
  - `open: boolean` — Controlled open state.
  - `onOpenChange: (open: boolean) => void` — Called when the user toggles the arrow.
  - `mainWidth?: number | string` — Width of the main card (default e.g. `220` px).
  - `panelWidth?: number | string` — Width of the side panel when open (default e.g. `200` px).
  - `className?: string` — Optional class for the root wrapper.

### Layout

- **Root:** A flex container that grows when the panel is open: `[Main card] [Arrow button] [Panel when open]`.
- **Main card:** Fixed width (e.g. 220px); wraps `mainContent` (typically a NodeShell or a div with the same styling).
- **Arrow:** A vertical strip or button with a chevron (e.g. `ChevronRight` when closed, `ChevronLeft` when open). Click toggles open. Accessible (aria-expanded, aria-label).
- **Panel:** When `open` is true, a second column to the right of the arrow: same min-height as main card, fixed width (e.g. 200px), border/background consistent with the app. Contains a small header (e.g. `sidePanelLabel`) and `sidePanelContent` (scrollable if needed).

### Block definition opt-in (registry)

- Extend `BlockDefinition` in [`src/lib/blockRegistry.ts`](src/lib/blockRegistry.ts) with an optional field:
  - `sidePanel?: { label: string; mainInputNames: string[] }`
  - Meaning: "This block uses the side-panel layout. Put inputs whose names are in `mainInputNames` in the main card; put all other inputs in the side panel."

### Usage from GenericNode

- When `definition.sidePanel` is set:
  - Split `definition.inputs` into main (names in `sidePanel.mainInputNames`) and panel (rest).
  - Render **SideNode** with:
    - `mainContent` = NodeShell (or equivalent) containing only the main inputs.
    - `sidePanelContent` = the panel inputs (and any block-specific extra UI, e.g. "Enable filters" for Hyperliquid).
    - `sidePanelLabel` = `definition.sidePanel.label`.
    - `open` / `onOpenChange` from local state; optionally persist in `data.sidePanelOpen` so it survives reload.
  - Handles (left/right) remain on the **outer** wrapper (SideNode root) so they stay at the left edge of the main card and the right edge of the node (main + panel when open).

### Not in SideNode

- SideNode does **not** know about "filters", "Enable filters", or any specific block. It only knows: main content, panel content, label, open state. Block-specific toggles (e.g. "Enable filters") are just part of `sidePanelContent` passed in by GenericNode for that block type.

### Data model (per-block)

- For Hyperliquid: add input `filtersEnabled` (toggle). When `'false'`, subscribe logic builds empty filters. Optionally persist `data.sidePanelOpen` for panel state.

---

## 2. Enable / Disable Filters

- **UI:** In the filter panel, top row: "Enable filters" with a toggle (same as existing toggle input type). When off, all filter fields below are disabled (greyed out) and not sent to the API.
- **Block definition:** Add input `filtersEnabled` (type `toggle`, default `'true'`). Only relevant when the filter panel is open; when closed, "no filter" can be implied by "filters enabled but all values empty" or by defaulting `filtersEnabled` to `'false'` if you want "no filter" by default.
- **Subscribe logic** ([`src/lib/blocks.ts`](src/lib/blocks.ts)): When building `spec` / `filters`, if `inputs.filtersEnabled === 'false'` (or the toggle's stored value for "off"), set `filters = {}` and skip populating from coin, user, side, eventType, filterPreset, extraFilters. So the stream receives all data with no server-side filter.

---

## 3. No Filter Applied

- **When "Enable filters" is off:** No filters applied (handled above).
- **When "Enable filters" is on:** Keep current semantics: empty coin, "All" event type, "None" preset, empty extra JSON, "Both" side → effectively no filter. No extra UX change needed beyond the toggle and clear labels (e.g. "All", "None").

---

## 4. Option Descriptions (Tooltips on Hover)

### Requirement

When the user hovers over a **dropdown option** (stream type, coin, side, event type, preset, etc.), show a short description of what that option does (e.g. from [QuickNode filtering docs](https://www.quicknode.com/docs/hyperliquid/filtering)).

### Data model

- **Option A:** Extend `InputField` in [`src/lib/blockRegistry.ts`](src/lib/blockRegistry.ts) with an optional map of value → description:
  - `optionDescriptions?: Record<string, string>`
- **Option B:** Allow `options` to be `Array<{ value: string; label?: string; description?: string }>` and keep backward compatibility with `string[]` (if `optionDescriptions` is absent, use options as today).

Recommendation: **Option A** — add `optionDescriptions?: Record<string, string>` so existing blocks stay unchanged; only Hyperliquid (and any future block) can pass descriptions.

### UI

- **Native `<select>`:** `<option title="...">` only shows on hover in a basic way and is not very visible. Prefer a **custom dropdown** for fields that have `optionDescriptions`: a button that opens a list of options, each option rendered as a div/button with `title` or a small tooltip component on hover.
- **Where:** In [`BlockInputs.tsx`](src/components/nodes/BlockInputs.tsx), for the `select` type (or a new type like `selectWithTooltips`), when `field.optionDescriptions` is present, render a custom dropdown that shows `optionDescriptions[value]` on hover for each option. Otherwise keep current native select.
- **Content:** Define the description map in the Hyperliquid block definition (or a shared constant) per field, e.g.:
  - **Stream type:** trades = "Filled trades/executions", orders = "Order status updates", book_updates = "Order book changes", etc.
  - **Side:** B = "Bid/buy", A = "Ask/sell", Both = "No side filter"
  - **Event type:** deposit, withdraw, internalTransfer, etc. (one line each from QuickNode)
  - **Preset:** Liquidations only = "Only liquidation trades", TWAP only = "Only TWAP executions"

---

## 5. File Plan (minimal touches)

All new node-extension UI lives under **one new folder** so the number of modified files stays small and future extensions (e.g. other panel types) have a clear place.

### New folder and files

| Path | Purpose |
|------|--------|
| `src/components/nodes/node-extension/SideNode.tsx` | Reusable side-panel wrapper: mainContent + arrow + panel (sidePanelLabel, sidePanelContent); controlled open/onOpenChange; owns outer width so **NodeShell is not modified**. |
| `src/components/nodes/node-extension/SelectWithOptionTooltips.tsx` | Optional. Custom dropdown that shows `optionDescriptions[value]` on hover. When used, BlockInputs only imports and conditionally renders it for fields with `optionDescriptions`; the rest of BlockInputs is unchanged. |

### Modified files (exactly 4)

| File | Change |
|------|--------|
| `src/lib/blockRegistry.ts` | Add `optionDescriptions?: Record<string, string>` to `InputField`; add `sidePanel?: { label: string; mainInputNames: string[] }` to `BlockDefinition`. |
| `src/lib/blocks.ts` | Hyperliquid: add `filtersEnabled`; set `sidePanel: { label: 'Filters', mainInputNames: ['streamType'] }`; add `optionDescriptions` for relevant selects; in subscribe, when `filtersEnabled === 'false'` build empty filters. |
| `src/components/nodes/GenericNode.tsx` | When `definition.sidePanel` is set: split inputs by `mainInputNames`, render `SideNode` from `node-extension/SideNode` with main vs panel content; open state (optional `data.sidePanelOpen`). |
| `src/components/nodes/BlockInputs.tsx` | For `select`: when `field.optionDescriptions` is present, render `SelectWithOptionTooltips` from `node-extension` (or inline the tooltip dropdown here to avoid the second new file). Else keep existing native select. |

### Not modified

- **`src/components/ui/NodeShell.tsx`** — No change. SideNode wraps content in its own flex container and sets the outer node width when the panel is open; the main card can still use NodeShell inside with existing `w-[220px]`.
- **No other `nodes/` or `ui/` files** — Only GenericNode and BlockInputs are touched.

### Reducing touches further

- **Option A (recommended):** Add both `node-extension/SideNode.tsx` and `node-extension/SelectWithOptionTooltips.tsx`. Total: **2 new files, 4 modified**; BlockInputs change is a small conditional + import.
- **Option B:** Add only `node-extension/SideNode.tsx` and implement the tooltip dropdown logic **inside** BlockInputs. Total: **1 new file, 4 modified**; one fewer new file but a larger edit in BlockInputs.

---

## 6. File and Code Touch Points (reference)

| Area | File(s) | Change |
|------|--------|--------|
| Registry | `src/lib/blockRegistry.ts` | Add `optionDescriptions` and `sidePanel` (see File plan above). |
| New component | `src/components/nodes/node-extension/SideNode.tsx` | Reusable wrapper; no NodeShell change. |
| Optional | `src/components/nodes/node-extension/SelectWithOptionTooltips.tsx` | Tooltip dropdown; used by BlockInputs when `optionDescriptions` present. |
| GenericNode | `src/components/nodes/GenericNode.tsx` | Use SideNode when `definition.sidePanel` is set. |
| Block definition + subscribe | `src/lib/blocks.ts` | Hyperliquid: sidePanel, filtersEnabled, optionDescriptions, empty filters when disabled. |
| BlockInputs | `src/components/nodes/BlockInputs.tsx` | Use SelectWithOptionTooltips when `field.optionDescriptions` exists. |

---

## 7. Implementation Order

1. **Registry** — Add `optionDescriptions` to `InputField` and `sidePanel` to `BlockDefinition`; no UI change yet.
2. **SideNode component** — In `nodes/node-extension/SideNode.tsx`, implement the reusable wrapper (mainContent, sidePanelContent, sidePanelLabel, open, onOpenChange, widths). No block-specific logic.
3. **GenericNode** — When `definition.sidePanel` is present, split inputs and render SideNode; wire open state (and optional `data.sidePanelOpen`).
4. **Block definition (Hyperliquid)** — Add `filtersEnabled`; set `sidePanel: { label: 'Filters', mainInputNames: ['streamType'] }`; add `optionDescriptions` for stream type, side, event type, preset.
5. **BlockInputs** — When `optionDescriptions` is present, use custom dropdown with hover tooltips (implement in `node-extension/SelectWithOptionTooltips.tsx` or inline in BlockInputs).
6. **Subscribe** — Respect `filtersEnabled`: when off, pass no filters.
7. **Width** — SideNode sets wrapper width when panel is open; no NodeShell change.

---

## 8. Edge Cases and Notes

- **Output handles:** The node's output handles stay on the **right** of the whole node (main + panel when open). So when the panel is open, handles are on the right edge of the panel. React Flow's right handle position should remain correct if the node width is updated.
- **Handles on the left:** Only the main card has the left input handle(s); the stream type input might be the only one that accepts a variable. Filter panel fields don't need connection handles unless you want variable inputs there (current design keeps them as value inputs).
- **Mobile / small viewport:** Consider collapsing the filter panel when viewport is narrow, or making the panel scroll horizontally so it doesn't push the node off-screen.
- **Descriptions copy:** Pull short, user-friendly descriptions from [QuickNode Stream Filtering](https://www.quicknode.com/docs/hyperliquid/filtering) (e.g. stream types, event types, presets) so tooltips are accurate and consistent.
- **Future blocks:** Any block can opt into the side panel by adding `sidePanel: { label: string; mainInputNames: string[] }` to its definition; GenericNode will use SideNode and split inputs accordingly.

---

## Summary

- **Reusable SideNode:** A generic component (main content + arrow + side panel) that any block can use via `definition.sidePanel`. Hyperliquid Stream is the first consumer.
- **Hyperliquid layout:** Main card = stream type only; side panel = "Filters" with "Enable filters" toggle and all filter fields; node width grows when panel is open.
- **Enable/disable:** New `filtersEnabled` toggle; when off, subscribe sends no filters.
- **No filter:** Achieved by "Enable filters" off, or by leaving all filter fields at "All"/"None"/empty when on.
- **Option tooltips:** Add `optionDescriptions` to the registry; custom dropdown in BlockInputs when present; define descriptions in the Hyperliquid block for stream type, side, event type, and preset.
