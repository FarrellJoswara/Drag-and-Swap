# Blocks & Block System — Implementation Report

**Date:** February 2026  
**Scope:** All items from the “Blocks & Block System” feature roadmap.

---

## Summary

All planned blocks and block-system features were implemented. The app builds successfully (`npm run build`), type-checks (`tsc --noEmit`), and the dev server runs. New blocks appear in the sidebar under Triggers, Actions, and Filters; execution uses the existing `runDownstreamGraph` pipeline with conditional branching and rate-limiting support.

---

## 1. New Triggers

### Webhook Trigger (`webhookTrigger`)
- **Purpose:** Fires when an HTTP request is received at a webhook URL.
- **Implementation:** Block is registered with a no-op `subscribe` (browser cannot receive arbitrary HTTP). Outputs: `body`, `method`, `headers`. Description instructs users to use a backend (e.g. Supabase Edge Function) to POST to the agent when a real webhook is needed.
- **Files:** [`src/lib/blocks.ts`](src/lib/blocks.ts) (registerBlock), no new service (placeholder for future backend).

### Wallet Event Trigger (`walletEventTrigger`)
- **Purpose:** Trigger on ERC20 `Transfer` events; optional filter by wallet (from or to).
- **Implementation:** Uses viem `createPublicClient` + `watchContractEvent` for `Transfer`. Chains: mainnet (1), Arbitrum (42161), Base (8453). Inputs: `chainId`, `contractAddress`, `filterWallet`, `rpcUrl`. Outputs: `from`, `to`, `value`, `txHash`, `blockNumber`.
- **Files:** [`src/services/walletEvent.ts`](src/services/walletEvent.ts), [`src/lib/blocks.ts`](src/lib/blocks.ts).

---

## 2. New Actions

### Send Telegram (`sendTelegram`)
- **Purpose:** Send a message via Telegram Bot API.
- **Implementation:** `POST` to `https://api.telegram.org/bot{token}/sendMessage` with `chat_id` and `text`. Optional CORS proxy for browser. Outputs: `ok`, `status`, `response`.
- **Files:** [`src/services/notifications.ts`](src/services/notifications.ts), [`src/lib/blocks.ts`](src/lib/blocks.ts).

### Send Discord (`sendDiscord`)
- **Purpose:** Send a message to a Discord channel via webhook URL.
- **Implementation:** `POST` to webhook URL with `content` and optional `username`. Optional CORS proxy. Outputs: `ok`, `status`, `response`.
- **Files:** [`src/services/notifications.ts`](src/services/notifications.ts), [`src/lib/blocks.ts`](src/lib/blocks.ts).

### Log / Debug (`logDebug`)
- **Purpose:** Log inputs to the browser console and pass through for debugging.
- **Implementation:** `console.log('[Block Log/Debug]', inputs)` and return `{ out: passthrough || JSON.stringify(inputs) }`.
- **Files:** [`src/services/general.ts`](src/services/general.ts) (`logDebug`), [`src/lib/blocks.ts`](src/lib/blocks.ts).

### Delay (`delay`)
- **Purpose:** Wait N seconds before continuing the flow.
- **Implementation:** `await new Promise(r => setTimeout(r, sec * 1000))` with `sec` clamped 0–300. Output: `done`.
- **Files:** [`src/services/general.ts`](src/services/general.ts) (`delay`), [`src/lib/blocks.ts`](src/lib/blocks.ts).

### Merge (`merge`)
- **Purpose:** Combine multiple inputs into one output.
- **Implementation:** Inputs `in1`, `in2`, `in3` (with `showHandleWhenEmpty`), mode: `first` | `concat` | `json`. Skips keys `mode` and `separator`. Output: `out`.
- **Files:** [`src/services/general.ts`](src/services/general.ts) (`mergeOutputs`), [`src/lib/blocks.ts`](src/lib/blocks.ts).

### Constant (`constant`)
- **Purpose:** Output a fixed value for use in expressions or connections.
- **Implementation:** Inputs `name` (reference), `value`. Output: `value`. Run returns `{ value: inputs.value ?? '' }`.
- **Files:** [`src/lib/blocks.ts`](src/lib/blocks.ts).

---

## 3. New Filters

### Numeric Range (`numericRangeFilter`)
- **Purpose:** Pass only when the connected value is within min and max (inclusive).
- **Implementation:** Parses `value`, `min`, `max`; sets `passed` and `inRange` to `'true'`/`'false'`; forwards `value` when in range.
- **Files:** [`src/services/general.ts`](src/services/general.ts) (`numericRangeFilter`), [`src/lib/blocks.ts`](src/lib/blocks.ts).

### String Match (`stringMatchFilter`)
- **Purpose:** Pass when value matches: contains, equals, or regex.
- **Implementation:** Mode `contains` / `equals` / `regex`; outputs `passed`, `matched`, `value`.
- **Files:** [`src/services/general.ts`](src/services/general.ts) (`stringMatchFilter`), [`src/lib/blocks.ts`](src/lib/blocks.ts).

### Rate Limit (`rateLimitFilter`)
- **Purpose:** Pass only when at least N seconds have passed since last pass (per agent/node).
- **Implementation:** Module-level `Map` keyed by `agentId:nodeId` (or `nodeId`) stores last run time. `RunContext` extended with `nodeId` and `agentId`; `runDownstreamGraph` and `subscribeToAgent` pass them so rate limit is per-node per-agent.
- **Files:** [`src/services/general.ts`](src/services/general.ts) (`rateLimitFilter`), [`src/lib/runAgent.ts`](src/lib/runAgent.ts) (RunContext, runOptions.agentId), [`src/lib/blocks.ts`](src/lib/blocks.ts).

### Conditional Branch (`conditionalBranch`)
- **Purpose:** Branch by condition: only the “true” or “false” output runs downstream.
- **Implementation:** Evaluates `condition` (truthy/falsy); returns `{ true: '1', false: '' }` or `{ true: '', false: '1' }`. Execution: only edges whose **source handle** has a truthy value in the block result are queued. `buildConnectedModel` now sets `sourceHandle` on `OutputConnection`; `runAgent` only enqueues targets when `result[out.sourceHandle]` is truthy.
- **Files:** [`src/services/general.ts`](src/services/general.ts) (`conditionalBranch`), [`src/utils/buildConnectedModel.ts`](src/utils/buildConnectedModel.ts) (sourceHandle on outputs), [`src/lib/runAgent.ts`](src/lib/runAgent.ts) (conditional queueing), [`src/lib/blocks.ts`](src/lib/blocks.ts).

---

## 4. Block Search & Favorites / Recent

### Search
- **Status:** Already present. Sidebar has “Search blocks…” and `filterBlocks()`; all sections (including Favorites and Recent) filter by query.

### Favorites
- **Implementation:** Star icon on each block (visible on hover). Favorites stored in `localStorage` under `drag-and-swap-favorite-blocks`. A “Favorites” section appears at the top when non-empty; blocks there also respect search.

### Recent
- **Implementation:** On drag start, block type is prepended to a list (max 6) and stored in `sessionStorage` under `drag-and-swap-recent-blocks`. A “Recent” section shows these blocks; list is filtered by search.

- **Files:** [`src/components/sidebar/Sidebar.tsx`](src/components/sidebar/Sidebar.tsx) (state, load/save helpers, Favorites/Recent sections, props passed to `DraggableBlock` and `CollapsibleCategorySection`).

---

## 5. Icons & Registry

- New icons in [`src/lib/blockRegistry.ts`](src/lib/blockRegistry.ts): `messageSquare`, `bug`, `gitBranch`, `merge`, `variable`, `radio` (from lucide-react).

---

## 6. Execution & Wiring

- **RunContext:** Extended with `nodeId` and `agentId`; set in `runDownstreamGraph` and passed into every block `run()`.
- **RunOptions:** Added `agentId`; `subscribeToAgent` builds `runOptions` with `agentId` so deployed agents get correct rate-limit keys.
- **Conditional branching:** Only downstream nodes connected to an output handle whose value is non-empty are scheduled; blocks like `generalComparator` (all outputs set) behave as before.

---

## 7. What Was Not Implemented

- **Subflow / reusable flow:** Deferred (would require loading another flow’s graph and mapping inputs/outputs).
- **Custom block icons/colors per instance:** Not added; all blocks use definition-level icon and color.

---

## 8. How to Verify

1. **Build:** `npm run build` — completes successfully.
2. **Type-check:** `npx tsc --noEmit` — no errors.
3. **Run:** `npm run dev` — open app, confirm new blocks in sidebar (Triggers: Webhook Trigger, Wallet Event; Actions: Send Telegram, Send Discord, Log/Debug, Delay, Merge, Constant; Filters: Numeric Range, String Match, Rate Limit, Conditional).
4. **Flow test:** Add “Trigger Manually” → “Conditional” (e.g. condition `1`). Connect “True” to “Log/Debug” and “False” to another block. Run; only the “True” branch should run (check console for Log/Debug).
5. **Sidebar:** Drag a block to canvas; it should appear under “Recent”. Star a block; it should appear under “Favorites”. Search should filter all sections.

---

## 9. Files Touched (Summary)

| File | Changes |
|------|--------|
| `src/services/general.ts` | delay, numericRangeFilter, stringMatchFilter, rateLimitFilter, conditionalBranch, mergeOutputs, logDebug |
| `src/services/notifications.ts` | **New:** sendTelegram, sendDiscord |
| `src/services/walletEvent.ts` | **New:** subscribeToTransfer (viem watchContractEvent) |
| `src/lib/blocks.ts` | All new registerBlock calls, imports |
| `src/lib/blockRegistry.ts` | New icons |
| `src/lib/runAgent.ts` | RunContext nodeId/agentId, runOptions.agentId, conditional queueing by sourceHandle |
| `src/utils/buildConnectedModel.ts` | sourceHandle on OutputConnection |
| `src/components/sidebar/Sidebar.tsx` | Favorites, Recent, search filtering, star and record callbacks |

No breaking changes to existing blocks or flows; new blocks are additive.
