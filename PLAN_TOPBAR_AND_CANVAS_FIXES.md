# Plan: Top bar consistency, canvas refresh fix, and auto-off on edit

## 1. Top bar not the same size (agent menu vs node building menu)

### Current state

- **Both headers** use the same Tailwind classes for the bar itself: `h-12 flex-shrink-0 px-4 bg-[#0a0a0f] border-b border-slate-800/60`.
- **Content differs**, so the **visual size** can still differ:
  - **AgentsHome** ([src/pages/AgentsHome.tsx](src/pages/AgentsHome.tsx)): Logo `w-7 h-7` (28px), "Create Agent" uses `py-2 text-sm` (taller button and larger text).
  - **Topbar** ([src/components/ui/Topbar.tsx](src/components/ui/Topbar.tsx)): No logo; all actions use `py-1.5 text-xs` and small icons.

So even with `h-12`, the home header’s content is larger (logo + `py-2` + `text-sm`), which can make the bar feel taller or cause layout shift. To make the bar **actually the same size** and stable:

### Proposed fix

1. **Lock bar height and prevent content from growing it**
   - Use a fixed height and alignment on both: e.g. keep `h-12` but add `min-h-[3rem] max-h-[3rem]` and `items-center` so the bar never grows or shrinks, and content is vertically centered.

2. **Standardize content height on both pages**
   - On **AgentsHome**, reduce the right-side CTA to match Topbar: change "Create Agent" from `py-2 text-sm` to `py-1.5 text-xs` so button height matches the builder Topbar.
   - Optionally shrink the logo on the home header to something like `w-6 h-6` so the left block doesn’t dominate, and use `text-xs` for "Dragn Swap" if needed.

3. **Optional: single source of truth**
   - Extract a shared layout constant or CSS class (e.g. in [src/index.css](src/index.css)) such as `.app-topbar` with `height: 3rem; min-height: 3rem; max-height: 3rem; display: flex; align-items: center; justify-content: space-between; padding: 0 1rem; flex-shrink: 0; background: #0a0a0f; border-bottom: ...` and use it on both `<header>` elements so padding, height, and background never drift.

**Files:** [src/components/ui/Topbar.tsx](src/components/ui/Topbar.tsx), [src/pages/AgentsHome.tsx](src/pages/AgentsHome.tsx), optionally [src/index.css](src/index.css).

---

## 2. Page “randomly” refreshes and deletes node progress

### Likely cause

The canvas is cleared by the **load effect** in [src/App.tsx](src/App.tsx) (lines 239–255). It runs when `agentId` or `walletAddress` changes:

```ts
useEffect(() => {
  if (!agentId) {
    setNodes(emptyNodes)
    setEdges(emptyEdges)
    return
  }
  // ... load agent
}, [agentId, walletAddress])
```

So **whenever the effect runs with `agentId === undefined`**, the canvas is cleared. That can happen even if the user never left the builder:

- **useParams flicker:** During React Router updates or re-renders (e.g. after context updates like Save or toggleActive), `useParams()` can briefly return `undefined` for `id` before settling back to the real value. One run with `agentId === undefined` is enough to wipe the canvas.
- **Strict Mode (dev):** With `<StrictMode>`, effects run twice. If there’s any timing where `agentId` is undefined on one of those runs, the clear branch runs and progress is lost.

So the bug is: **clearing the canvas whenever `!agentId`**, instead of only when the user is **intentionally** on the “new flow” page.

### Proposed fix

1. **Only clear when we’re on the “new” route**
   - Use `useLocation()` from React Router and clear nodes/edges only when the user is on the new-flow page, not whenever `agentId` is undefined:
   - Logic:  
     - If `pathname === '/new'`: set nodes/edges to empty (and optionally return).  
     - If `agentId` is defined: load that agent’s flow (current behavior).  
     - If `agentId` is undefined but pathname is **not** `/new` (e.g. pathname is `/agent/123` during a param flicker): **do nothing**; don’t clear.  
   - That way a transient `undefined` `agentId` while still on `/agent/:id` never clears the canvas.

2. **Optional hardening**
   - Keep using `getAgentByIdRef.current(agentId)` in the effect (no `getAgentById` in the dependency array) so agent list updates (Save, toggleActive) don’t re-run the effect.
   - If you ever need to “reset” the canvas from code, do it via an explicit action (e.g. navigate to `/new` or call a dedicated reset function), not as a side effect of `agentId` being briefly undefined.

**Files:** [src/App.tsx](src/App.tsx) — add `useLocation()`, and change the load effect to clear only when `pathname === '/new'`.

---

## 3. Run button finicky; auto-turn-off when there are unsaved changes

### Desired behavior

- In the builder, the user can turn the agent **on** (Run).
- When they **add or change something** (nodes/edges differ from saved), the agent should **automatically turn off** and stay off until they **Save** (or Redeploy). So the running agent always reflects the last saved flow; no “stale” runs.

### Proposed behavior

- When **hasUnsavedChanges** transitions from **false → true** (user just made an edit) and the current agent is **active** (`isActive === true`), call **toggleActive(agentId)** once to set the agent to inactive.
- Do **not** auto-turn **on** when they Save (leave that to the user via the Run button).
- Important: only react to the **transition** false → true, not to “we have unsaved changes” in general. Otherwise:
  - On first load of an active agent, the canvas is hydrated from stored flow so `hasUnsavedChanges` is false. Good.
  - If we reacted to “hasUnsavedChanges === true” alone, we could run on initial mount before nodes/edges are hydrated (empty canvas vs stored flow would be “unsaved”) and incorrectly turn off. So we need to run only when we **transition** to unsaved.

### Implementation approach

1. In **App** (or a small effect in the component that has `agentId`, `hasUnsavedChanges`, and `toggleActive`):
   - Keep a **ref** for the previous value of `hasUnsavedChanges`, e.g. `prevUnsavedRef.current`.
   - In a **useEffect**:
     - If `hasUnsavedChanges && !prevUnsavedRef.current` and the agent exists and is active (`getAgentById(agentId)?.isActive`), call `toggleActive(agentId)`.
     - Then set `prevUnsavedRef.current = hasUnsavedChanges`.
   - So we only trigger when we go from “no unsaved” to “unsaved”, and we don’t turn off again on every re-render while unsaved.

2. **Edge cases**
   - When the user navigates from one agent to another, `hasUnsavedChanges` is recalculated for the new agent; the ref should represent the previous value for the **current** agent. Resetting the ref when `agentId` changes is correct (e.g. `prevUnsavedRef.current = false` when `agentId` changes), so we don’t carry over “was unsaved” from a previous agent.

**Files:** [src/App.tsx](src/App.tsx) — add a ref and a small effect that calls `toggleActive(agentId)` when `hasUnsavedChanges` flips from false to true and the agent is active; reset the ref when `agentId` changes.

---

## Summary

| Issue | Root cause | Fix |
|-------|------------|-----|
| Top bar different size | Same `h-12`/`px-4` but different content (logo size, button `py-2`/`text-sm` on home) | Lock bar with min/max height; standardize button/text to `py-1.5`/`text-xs` on both; optional shared `.app-topbar` class. |
| Random refresh / progress lost | Load effect clears canvas whenever `!agentId`; `agentId` can flicker to `undefined` | Clear only when `pathname === '/new'`; when `agentId` is undefined but path is `/agent/:id`, do nothing. |
| Run button finicky; run stale flow | No automatic turn-off on edit | When `hasUnsavedChanges` goes false → true and agent is active, call `toggleActive(agentId)` once; use a ref to detect the transition and reset ref on `agentId` change. |

Implement in this order: (1) canvas refresh fix, (2) auto-off on unsaved edit, (3) top bar consistency — so data loss is fixed first, then behavior, then polish.
