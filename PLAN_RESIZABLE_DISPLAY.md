# Plan: Resizable Stream Display window (modular, minimal files)

## Goal

Make the Stream Display’s “TV” area resizable by the user. Resizing the display (e.g. by dragging the bottom edge) should change the panel height and **resize the node** (the node’s height grows/shrinks with the content). Implement with as few file touches as possible and a reusable, modular component.

---

## Approach

- **Store size in node data** so it persists and drives layout: e.g. `streamDisplayHeight` (pixels).
- **Reusable UI component** that only handles “resizable panel” behavior: given height + callbacks, it renders children and a drag handle; on drag it computes new height and calls back. No knowledge of React Flow or node data.
- **GenericNode** wires the component to the Stream Display: reads height from `data.streamDisplayHeight`, passes it to the resizable component, and on height change updates the node via `setNodes`. The TV content div uses that height so the node’s content (and thus the node) resizes.

**Scope:** Height-only resizing (vertical resize). Width can be added later with the same pattern (optional `streamDisplayWidth` + handle + NodeShell width override).

---

## 1. New component: `ResizablePanel` (height only)

**File:** `src/components/ui/ResizablePanel.tsx` (new)

**Responsibility:** Presentational, reusable. Renders a vertical panel with a fixed height and a draggable bottom edge; when the user drags, it calls `onHeightChange` with the new height (clamped to min/max).

**Props:**

- `height: number` – current height in px
- `onHeightChange: (height: number) => void` – called when the user finishes a drag (or on every move for live resize)
- `minHeight?: number` – default e.g. 48
- `maxHeight?: number` – default e.g. 400
- `children: ReactNode` – content to show inside the panel

**Behavior:**

- Wrapper div with `style={{ height }}` (or minHeight) so the panel has that height.
- Bottom edge: a thin strip (e.g. 6px) with `cursor: ns-resize`, `className="nodrag"` so React Flow doesn’t move the node. Optional visual cue (e.g. three horizontal lines or “drag” hint).
- **Drag logic:**  
  - On **mousedown** on the handle: record `startY = e.clientY`, `startHeight = height`. Attach **mousemove** and **mouseup** to `document`.  
  - On **mousemove**: `deltaY = e.clientY - startY`, `newHeight = clamp(startHeight + deltaY, minHeight, maxHeight)`, call `onHeightChange(newHeight)`.  
  - On **mouseup**: remove listeners.
- Use `e.preventDefault()` on mousedown where appropriate so the drag doesn’t select text or start other behaviors.

**No imports** from React Flow or node logic; keep the component generic so it could be reused elsewhere.

---

## 2. GenericNode: wire display height to node data and ResizablePanel

**File:** `src/components/nodes/GenericNode.tsx`

**Changes (only in the Stream Display TV block):**

- **Read height:** `const displayHeight = (data.streamDisplayHeight != null ? Number(data.streamDisplayHeight) : null) ?? 96` (or another default, e.g. 96px).
- **Persist height:** `const setDisplayHeight = (h: number) => setNodes(nodes => nodes.map(n => n.id === id ? { ...n, data: { ...n.data, streamDisplayHeight: h } } : n))`.
- **Wrap the TV** (the existing div that contains the “Live” header and the scrollable content) in `<ResizablePanel height={displayHeight} onHeightChange={setDisplayHeight} minHeight={48} maxHeight={400}>`. The **outer** div of the TV (the one with “Live” and the content area) should be the one whose height is controlled: give that outer div `style={{ height: displayHeight }}` or let ResizablePanel wrap it and apply height to its inner content area so the total TV block height is `displayHeight`. Easiest: ResizablePanel wraps the whole TV block and renders `children` in a div with `style={{ height: displayHeight - handleHeight }}` or similar; or ResizablePanel’s root has the height and the children are inside it, with the handle at the bottom. So structure: `<ResizablePanel ...><div header>Live</div><div content scrollable>...</div></ResizablePanel>`. ResizablePanel renders `<div style={{ height }}><div flex-1 overflow-auto>{children}</div><div handle /></div>`. So the **content** passed as children is the current TV content (header + body). Then the wrapper inside ResizablePanel applies the height. So we pass the current TV content as children; ResizablePanel wraps it in a container with the given height and adds the handle below. So the TV block becomes:
  ```tsx
  <ResizablePanel height={displayHeight} onHeightChange={setDisplayHeight} minHeight={48} maxHeight={400}>
    <div className="rounded-md border ... existing classes">
      <div header>Live</div>
      <div content>...</div>
    </div>
  </ResizablePanel>
  ```
  and ResizablePanel’s root is a div with height and the handle; its single child is the TV div. So the outer structure is: ResizablePanel root (height = displayHeight) contains [TV div (flex-1 min-h-0 so it shrinks) + handle]. So we need ResizablePanel to do:
  ```tsx
  <div style={{ height }} className="flex flex-col">
    <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    <div ref={handleRef} className="h-1.5 cursor-ns-resize ... nodrag" onMouseDown={...}>...</div>
  </div>
  ```
  So the **node** gets taller because the ResizablePanel root has a larger height. Good.

- **Import:** `import ResizablePanel from '../ui/ResizablePanel'`.

No change to block definitions or runAgent; no change to NodeShell unless we add width later.

---

## 3. File list and risk

| File | Change |
|------|--------|
| **New** `src/components/ui/ResizablePanel.tsx` | New component: height prop, onHeightChange, min/max, drag handle, no deps on flow/node. |
| `src/components/nodes/GenericNode.tsx` | For `blockType === 'streamDisplay'`, read `data.streamDisplayHeight`, add setDisplayHeight, wrap TV block in ResizablePanel. |

**Risks:** None expected. Node data is already extensible (we add `streamDisplayHeight`). If the component is used only for streamDisplay, other nodes are unaffected. Optional: when loading an old flow without `streamDisplayHeight`, default 96 keeps current approximate size.

---

## 4. Optional later: width resizing

- Add `streamDisplayWidth` to node.data and a right-edge (or corner) handle in ResizablePanel; pass optional `width` and `onWidthChange`.
- In NodeShell, add optional prop `width?: number`; when set, use `style={{ width }}` instead of `w-[220px]`.
- In GenericNode, for streamDisplay pass `width={data.streamDisplayWidth}` into NodeShell when present. Then the node would resize horizontally as well.

---

## 5. Summary

- **New:** `ResizablePanel.tsx` – height-only resizable container with bottom drag handle; controlled height + onHeightChange; min/max.
- **Modified:** `GenericNode.tsx` – streamDisplay TV block uses ResizablePanel, height from `data.streamDisplayHeight`, updates via setNodes so the node resizes with the display.

This keeps the implementation minimal (2 files, 1 new), modular (resize logic in one reusable component), and safe (only Stream Display and its node data are touched).
