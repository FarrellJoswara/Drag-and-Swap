# Plan: Blocks Filter Fix + SideNode Visual and Sizing Fixes

**Status: Implemented.**

## Goals

1. **Fix blocks.ts errors** — Resolve filter-related imports and subscribe arity without changing any runtime behavior.
2. **Fix SideNode visuals** — When expanded, the panel should match the main card (same height, no “hanging”), with consistent borders and radius.
3. **Dynamic sizing** — SideNode should work for any node; sizes driven by props or main content, not hard-coded 220px.

---

## 1. Blocks.ts Filter and Subscribe Fixes

### Problem

- Linter/TS reports: `Module '"../services/hyperliquid"' has no exported member` for `buildFiltersFromSpec`, `validateFilterLimits`, `parseCommaSeparated`, `FILTER_LIMITS`.
- `Expected 3 arguments, but got 4` for `subscribe(streamType, filters, onMessage, filterName)`.

The hyperliquid **barrel** (`index.ts`) does re-export these; the errors are likely due to TypeScript resolution or a stale type. The **safest fix** is to import from the concrete modules so the compiler sees the real signatures and exports.

### Approach

- **Keep all behavior identical** — No logic or argument changes.
- **Change imports only** in `src/lib/blocks.ts`:
  - `buildFiltersFromSpec`, `validateFilterLimits`, `parseCommaSeparated` from `../services/hyperliquid/filters`
  - `FILTER_LIMITS` from `../services/hyperliquid/types`
  - `subscribe`, `normalizeStreamEventToUnifiedOutputs`, and stream types from `../services/hyperliquid/streams` (or keep types from barrel if preferred)
  - Keep `recentTrades`, `bookSnapshot`, `recentEvents` and any other symbols from `../services/hyperliquid` (index) so the rest of the file is unchanged.

### Files

- **Edit:** `src/lib/blocks.ts` — Replace the single hyperliquid import block with direct imports from `filters`, `types`, and `streams`; leave `subscribe` call as-is (4 arguments).

### Validation

- `npm run build` or `tsc --noEmit` passes.
- No runtime change: hyperliquidStream subscribe and filter building behave the same.

---

## 2. SideNode Visual Fixes (Same Size, No Hanging)

### Problem

- Expanded panel does not match the main node size and has parts that look like they’re “hanging” (height/border/radius mismatch).

### Approach

- **Unified height** — Use flex with `align-items: stretch` so the main column and panel column always share the same height (already in place); ensure the panel column is the one that stretches and the main column drives min height when needed.
- **Unified corners** — When the panel is open:
  - Main card wrapper: round only the **left** side (`rounded-l-xl`), **no** right radius (`rounded-r-none`) so it joins the arrow cleanly.
  - When panel is closed: main card wrapper keeps full `rounded-xl`.
- **Panel styling** — Panel uses the same visual language as NodeShell: same bg `#0f1117`, border `border-slate-800`, shadow `shadow-xl shadow-black/50`, and only round the **right** side (`rounded-r-xl`). Optional: add a thin top accent (e.g. gradient or border) to match NodeShell’s top strip.
- **Arrow strip** — Keep between main and panel; ensure it has the same effective height (stretch) and borders so it doesn’t look like a gap.

### Implementation

- **SideNode.tsx:**
  - Wrap `mainContent` in a div that applies:
    - When `open`: `rounded-l-xl rounded-r-none overflow-hidden` (and same bg/border/shadow as NodeShell if not inherited).
    - When `!open`: `rounded-xl overflow-hidden`.
  - Panel container: `rounded-r-xl` only; same bg, border, shadow as main; `flex flex-col` with header + scrollable body; column uses `flex-1 min-h-0` and `overflow-y-auto` for long content.
  - Root: `flex items-stretch`; no fixed pixel height so height stays content-driven and consistent between main and panel.

### Files

- **Edit:** `src/components/nodes/node-extension/SideNode.tsx` — Add wrapper div around main content with conditional radius; ensure panel column has matching border/shadow and right-only radius.

### Validation

- With Hyperliquid Stream, open the side panel: main and panel share one continuous height; no visible “hang”; corners and borders align.

---

## 3. Dynamic Sizing (No Hard-Coded 220)

### Problem

- SideNode uses constants `DEFAULT_MAIN_WIDTH = 220` and `DEFAULT_PANEL_WIDTH = 220`; we want it to work for any node, not a fixed size.

### Approach

- **Keep props as the single source of truth** — `mainWidth` and `panelWidth` remain optional; when omitted, use a single default (e.g. 220) so existing usage (GenericNode) does not need to pass widths.
- **GenericNode** — When rendering SideNode, pass explicit `mainWidth` and `panelWidth` derived from the same value. For now that value can be the same as NodeShell’s width (220); later it could come from a constant (e.g. `NODE_CARD_WIDTH`) shared with NodeShell, or from context/layout.
- **No hard-coded 220 inside SideNode layout logic** — Use only the computed `mainW` and `panelW` (from props or defaults). That way any consumer can pass different widths and the component stays generic.

### Implementation

- **SideNode.tsx:** Keep `DEFAULT_MAIN_WIDTH` and `DEFAULT_PANEL_WIDTH` as fallbacks only; all layout math uses `mainW` / `panelW` (already the case). Optionally: if `panelWidth` is not provided, set `panelW = mainW` so panel always matches main width by default.
- **GenericNode.tsx:** When rendering SideNode, pass `mainWidth={220}` and `panelWidth={220}` (or a shared constant like `NODE_SHELL_WIDTH = 220`) so the choice of size lives in one place and SideNode stays presentational.
- **Optional:** Add a single constant in `NodeShell.tsx` or a shared `constants.ts`, e.g. `NODE_CARD_WIDTH = 220`, and use it in NodeShell and GenericNode so we don’t duplicate the number.

### Files

- **Edit:** `src/components/nodes/node-extension/SideNode.tsx` — Default `panelWidth` to `mainWidth` when not provided (`panelWidth ?? mainWidth`).
- **Edit:** `src/components/nodes/GenericNode.tsx` — Pass explicit `mainWidth` and `panelWidth` (e.g. 220 or `NODE_CARD_WIDTH`).
- **Optional:** Add `NODE_CARD_WIDTH` and use in NodeShell + GenericNode.

### Validation

- SideNode still renders correctly when no widths are passed (defaults) and when GenericNode passes 220; future blocks can pass different widths without changing SideNode.

---

## 4. Implementation Order

1. **Blocks.ts** — Switch to direct imports from `filters`, `types`, and `streams`; verify build and that subscribe still receives 4 arguments.
2. **SideNode visuals** — Add main-content wrapper with conditional radius; align panel styling (border, shadow, rounded-r-xl); confirm stretch and scroll behavior.
3. **Dynamic sizing** — SideNode: `panelWidth ?? mainWidth`; GenericNode: pass explicit widths (and optionally introduce `NODE_CARD_WIDTH`).

---

## 5. Risk Mitigation

- **Blocks:** Only import paths and module sources change; no changes to filter logic, `subscribe` arguments, or callback bodies.
- **SideNode:** Purely presentational; no change to props API (only defaulting and wrapper divs). Existing callers (GenericNode) continue to work; we only add optional explicit widths.
- **Testing:** After each step, run `tsc --noEmit` and a quick manual check: add Hyperliquid Stream, open side panel, confirm no hanging and same height; collapse and confirm main card is fully rounded.
