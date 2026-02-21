# Plan: Fix App.tsx JSX, Hooks, and Hyperliquid Runner Issues

## Summary of Reported Issues

1. **Vite/React:** `Unterminated JSX contents` in `App.tsx` at line 700.
2. **React Flow:** Warning that `nodeTypes` or `edgeTypes` is created inside the component (error #002).
3. **React Hooks:** Order of hooks changed in `AgentRunners`; `useEffect` dependency array size changed between renders.
4. **User:** "Hyperliquid block has issues when running."

---

## 1. Unterminated JSX in App.tsx

### Analysis

- In the current `App.tsx`, the return has:
  - Line 592: `<div className="flex h-screen...">` (outer)
  - Line 597: `<div className="flex flex-col...">` (main content column)
  - Line 611: `<div ref={reactFlowWrapper}>` (canvas wrapper)
  - Lines 696–698: three closing `</div>` (close 611, 597, 592)
  - Line 699: `</AgentIdProvider>`
  - Line 700: `)`

- **Structural balance:** There are three opening layout `<div>`s (592, 597, 611) and three matching `</div>`s (696, 697, 698). So the tree is balanced in the current file.

- **Why the parser might still complain:**
  - **Indentation:** The main content `<div>` at 597 uses the same indentation (6 spaces) as the outer `<div>` at 592, so it looks like a sibling. That can confuse developers and some tooling; it does not change JSX semantics but can make an “unterminated” error point at the wrong line (e.g. 700).
  - **Extra/missing tag in your build:** If your saved file ever had an extra `</div>` (e.g. a fourth `</div>` before `</AgentIdProvider>`) or a missing opening tag, the parser would report “Unterminated JSX contents” near the end of the return.

### Recommended fix (do not implement yet)

- **Indentation:** Make the main content div clearly a child of the outer div by indenting lines 597–697 by 2 spaces so the nesting is obvious.
- **Audit tags:** Count all `<div>` and `</div>` in the return; ensure there are no extra closing tags and that every `</div>` has a matching opening `<div>`.
- If the error persists, check for non-printable characters or BOM around line 700 and ensure the file is saved and the dev server has picked up the latest version.

---

## 2. React Flow nodeTypes / edgeTypes warning (#002)

### Analysis

- In `App.tsx`, `nodeTypes` is defined at **module scope** (lines 34–36):

  ```ts
  const nodeTypes: NodeTypes = {
    generic: GenericNode,
  }
  ```

- React Flow’s warning means it is seeing a **new object reference** on each render. That can happen if:
  - The module is re-evaluated (e.g. HMR) and the warning is from a transition, or
  - Something else (e.g. a wrapper or conditional) is passing a new object.

### Recommended fix (do not implement yet)

- Keep `nodeTypes` at module level (already done).
- If the warning still appears after fixing JSX and hooks, pass a **memoized** value so the reference is stable inside the component, e.g.:

  ```ts
  const nodeTypes = useMemo<NodeTypes>(() => ({ generic: GenericNode }), [])
  ```

- Ensure no other code path creates a new `nodeTypes` or `edgeTypes` object on each render.

---

## 3. Hooks order and useEffect dependency array (AgentRunners / useActiveAgentRunners)

### Analysis

- **useActiveAgentRunners** (e.g. in `src/hooks/useActiveAgentRunners.ts`):
  - Calls `useDisplayValue()` (which uses `useContext(DisplayValueContext)`).
  - Uses `useEffect(..., [agents, setDisplayValue])`.

- **“Order of Hooks changed”:**  
  If an earlier version of the hook did **not** call `useDisplayValue()`, the hook order would have been: `useRef` → `useEffect`. After adding `useDisplayValue()`, it became: `useRef` → `useDisplayValue()` (useContext) → `useEffect`. React compares previous vs current render; if the previous render was from the old code (e.g. HMR), it will report a hook order change. After a full reload, the order is stable.

- **“The final argument passed to useEffect changed size between renders”:**  
  React is saying the **dependency array** of `useEffect` had a different **length** in the previous render vs the current one, e.g.:
  - Previous: `[agents]` (length 1)
  - Incoming: `[agents, setDisplayValue]` (length 2)

  That can happen when:
  - The hook was updated to add `setDisplayValue` to the deps and HMR is comparing old vs new run, or
  - There is conditional logic that sometimes passes 1 and sometimes 2 arguments to `useEffect` (there is none in the current code).

- **Why this can break the Hyperliquid block:**  
  When the effect’s dependency array changes length or identity, React may run cleanup and then re-run the effect. That can:
  - Unsubscribe the Hyperliquid WebSocket and immediately re-subscribe (possible flicker or duplicate subscriptions), or
  - Leave the runner in an inconsistent state (e.g. cleanup ran but the new effect did not run as expected). So fixing the effect deps and hook stability is part of making “Hyperliquid when running” reliable.

### Recommended fix (do not implement yet)

- **Stable dependency array:**  
  Always pass the same number and shape of dependencies to `useEffect`. Keep `[agents, setDisplayValue]` and **ensure `setDisplayValue` is stable** so the array content does not change identity every render.

- **Stable `setDisplayValue` when context is null:**  
  In `DisplayValueContext.tsx`, `useDisplayValue()` returns an inline object when `ctx` is null:

  ```ts
  return {
    getDisplayValue: () => undefined,
    setDisplayValue: () => {},
  }
  ```

  That creates a **new object and new function references every time**, which can make the `useEffect` in `useActiveAgentRunners` see a “new” `setDisplayValue` and re-run or confuse React’s dependency comparison. So:

  - **Memoize the fallback:** Define the fallback value once (e.g. module-level or with `useMemo`) and return that same reference when `ctx` is null, so that `setDisplayValue` does not change between renders when outside the provider.

- **Optional (if needed):** If you want the effect to depend only on `agents`, store `setDisplayValue` in a ref and use that inside the effect so the effect’s dependency array is just `[agents]`. Then the effect never re-runs because of `setDisplayValue` identity.

- **Ensure AgentRunners always runs inside DisplayValueProvider:**  
  In `Router.tsx`, `AgentRunners` is already a child of `DisplayValueProvider`, so normally `useDisplayValue()` always gets the real context. The fallback is only for edge cases (e.g. misuse of the hook). Making the fallback stable still improves robustness and avoids unnecessary effect re-runs if the hook is ever used before the provider is mounted.

---

## 4. Hyperliquid block “has issues when running”

### Analysis

- From the earlier Hyperliquid review:
  - The block only runs when the **agent is deployed and Run agent is on** (subscription is started by `subscribeToAgent` for active agents).
  - **VITE_QUICKNODE_HYPERLIQUID_WS_URL** must be set; otherwise the stream is a no-op.

- From this session:
  - **Unterminated JSX** can prevent the app (and thus the runner) from mounting or updating correctly.
  - **Hooks order / useEffect dependency array** can cause the agent runner effect to re-run or cleanup at the wrong time, which can:
    - Tear down the Hyperliquid WebSocket subscription and re-create it repeatedly, or
    - Leave the subscription in a bad state so that “when running” the block appears not to work or to be flaky.

So “Hyperliquid block has issues when running” may be a combination of:

1. **Env:** Missing or wrong `VITE_QUICKNODE_HYPERLIQUID_WS_URL`.
2. **Runner lifecycle:** Unstable hooks/effect in `useActiveAgentRunners` causing subscribe/unsubscribe churn or inconsistent state.
3. **App not loading:** JSX error preventing the runner from ever mounting correctly.

### Recommended fix (do not implement yet)

- **Fix the app first:** Resolve the JSX and hooks/effect issues above so that:
  - The app compiles and the runner mounts.
  - The runner’s `useEffect` has a stable dependency array and a stable `setDisplayValue`, so subscriptions are not constantly torn down and recreated.

- **Then verify Hyperliquid specifically:**
  - Confirm `VITE_QUICKNODE_HYPERLIQUID_WS_URL` is set in `.env.local`.
  - Deploy a flow that contains a Hyperliquid Stream block and turn **Run agent** on.
  - Check the browser console for `[Hyperliquid WS]` logs (connection, errors, or “streaming disabled”).
  - Connect the block’s output to a Stream Display and confirm that events appear when the agent is running.

- If the block still fails after that, the next step is to add minimal logging (or reuse existing debug ingest) around `subscribeToAgent` and the Hyperliquid `subscribe` callback to see whether:
  - The effect runs once and stays stable,
  - Messages are received from the WebSocket,
  - And `onTrigger` is called with normalized outputs.

---

## Implementation order (recommended)

1. **App.tsx JSX:** Fix indentation and verify div count so the “Unterminated JSX contents” error is gone and the file parses.
2. **DisplayValueContext:** Memoize the fallback in `useDisplayValue()` so the returned object and `setDisplayValue` are stable when context is null.
3. **useActiveAgentRunners:** Confirm the effect dependency array is `[agents, setDisplayValue]` and that there is no conditional that changes the number of deps; after (2), `setDisplayValue` will be stable and the effect will not churn.
4. **React Flow:** If the nodeTypes warning persists after (1)–(3), add `useMemo` for `nodeTypes` in `App.tsx` as in section 2.
5. **Hyperliquid:** Re-test with Run agent on and a deployed flow; confirm env var and console/Stream Display behavior; only then add more targeted logging if the block still misbehaves.

---

## Files to touch (for implementation phase)

| File | Change |
|------|--------|
| `src/App.tsx` | Indent main content div (597–697) so nesting is clear; verify no extra/missing `</div>`; optionally memoize `nodeTypes` if warning remains. |
| `src/contexts/DisplayValueContext.tsx` | Return a stable fallback from `useDisplayValue()` when `ctx` is null (e.g. module-level or `useMemo`). |
| `src/hooks/useActiveAgentRunners.ts` | No change required if `setDisplayValue` is stable; ensure effect deps are always `[agents, setDisplayValue]`. |

No implementation was done in this step; the above is the analysis and plan only.
