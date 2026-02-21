# Plan: Unified Filtering in Hyperliquid Stream Block

Based on [QuickNode Hyperliquid Stream Filtering](https://www.quicknode.com/docs/hyperliquid/filtering). Filtering happens **server-side at subscribe time** (QuickNode only pushes events that match). So filter config is subscription parameters, not a separate data-processing step. This plan adds service-layer filter utilities and **extends the existing Hyperliquid Stream block** with full filter options (multi-value, stream-specific fields, special values, validation)—no separate filter block.

---

## 1. QuickNode filtering recap

- **Protocol**: WebSocket `hl_subscribe` with `params: { streamType, filters?, filterName? }`.
- **Filter shape**: `filters` is `Record<string, string[]>` — each key is a field name, each value is an array of allowed values (OR within field; AND across fields).
- **Streams**: `trades`, `orders`, `book_updates`, `twap_orders`, `events`, `writer_actions`. (`blocks` has no filtering.)
- **Special values**: `"*"` / `"exists"` = field exists; `"null"` = field is null (e.g. non-TWAP trades).
- **Events vs others**: Events stream uses `users` (array); others use `user`.
- **Limits**: user/address 100, coin 50, type 20, total 500, named filters per stream 10.
- **filterName**: Optional; used to unsubscribe by name and for OR logic across multiple named subscriptions.

Stream-specific filter fields (relevant for UI/validation):

| Stream          | Key fields |
|-----------------|------------|
| trades          | user, coin, side, px, sz, dir, liquidation, twapId, builder, hash, oid, feeToken, crossed |
| orders          | coin, side, limit_px, sz, orig_sz, oid, timestamp |
| book_updates    | coin, side, px, sz |
| twap_orders     | user, coin, side, status |
| events          | users, type, usdc, token (type: deposit, withdraw, internalTransfer, spotTransfer, liquidation, funding, vaultDeposit, vaultWithdraw) |
| writer_actions  | user, nonce, evm_tx_hash, type (e.g. SystemSpotSendAction), destination, token, wei |

---

## 2. Current state in codebase

- **`src/services/hyperliquid/types.ts`**: `HyperliquidStreamType`, `HyperliquidFilters = Record<string, string[]>` — already matches QuickNode.
- **`src/services/hyperliquid/streams.ts`**: `subscribe(streamType, filters, onMessage)` sends `params: { streamType, ...(filters && { filters }) }`. No `filterName` yet. No validation.
- **`src/lib/blocks.ts`** — `hyperliquidStream` block: builds `filters` from three inputs only — `coin` (single), `user` (single), `side` (B/A/Both). No multi-coin/user, no stream-specific fields (liquidation, type, twapId, etc.), no special values, no filterName.

So the **gaps** are:

1. No central place to **build** filters from a unified spec (e.g. form or key-value list).
2. No **validation** against QuickNode limits (100 users, 50 coins, 500 total, etc.).
3. No **filterName** support in subscribe (optional; needed for unsubscribe-by-name and OR across filters).
4. The stream block only supports a small subset of filter fields.

---

## 3. Design choice: combined vs separate block

- **Filtering is server-side**: `hl_subscribe` sends `filters` once; the server only pushes matching events. There is no "filter after data is received."
- **Combined (chosen)**: One **Hyperliquid Stream** block that both subscribes and holds all filter options. Filter config is built inside the block and passed to `subscribe(streamType, filters)`. Simple mental model: one subscription, one place to configure it.
- **Separate block (rejected)**: A "Unified Filter" block that only outputs JSON would require a second block and a connection just to pass subscription parameters. The filter block would never receive data—it would only produce config—so the split adds indirection without a clear benefit.

**Goals**: One block; stream-type-aware filter fields and validation; multi-value (OR), special values `*` / `null`; respect QuickNode limits.

---

## 4. Service-layer additions (`src/services/hyperliquid/`)

### 4.1 Filter limits and stream-field metadata

- **New file or section in `types.ts`**: Define constants and optional metadata used by build/validate:
  - `FILTER_LIMITS`: `{ maxUserValues: 100, maxCoinValues: 50, maxTypeValues: 20, maxTotalValues: 500, maxNamedFiltersPerStream: 10 }`.
  - Optionally: `STREAM_FILTER_FIELDS: Record<HyperliquidStreamType, string[]>` listing allowed field names per stream (for validation and UI hints). Unknown fields are allowed by QuickNode but can be capped by `maxTotalValues`.

### 4.2 Build filters from unified spec

- **New function** (e.g. in `streams.ts` or new `filters.ts`):  
  `buildFiltersFromSpec(streamType: HyperliquidStreamType, spec: UnifiedFilterSpec): HyperliquidFilters`
  - **UnifiedFilterSpec**: e.g. `{ coin?: string[], user?: string[], side?: string[], type?: string[], [key: string]: string[] | undefined }` — allows arbitrary fields; stream type is used to map `user` → `users` for `events` and to validate/trim.
  - Behavior:
    - For `events`, map `spec.user` → `filters.users`; for other streams, `spec.user` → `filters.user`.
    - Copy other keys (e.g. `coin`, `side`, `type`, `liquidation`, `twapId`, `token`, …) into `filters` as string arrays (split comma or already array).
    - Normalize special values: allow `*`, `exists`, `null` as-is (QuickNode accepts them).
    - Trim and drop empty arrays.
  - Return value conforms to `HyperliquidFilters` for `subscribe`.

### 4.3 Validate filters against QuickNode limits

- **New function**: `validateFilterLimits(streamType: HyperliquidStreamType, filters: HyperliquidFilters): { valid: boolean; errors: string[] }`
  - Check: `user`/`users` length ≤ 100, `coin` ≤ 50, `type` ≤ 20, sum of all values ≤ 500.
  - Return list of human-readable errors (e.g. “Too many values for field 'user': 150 (max: 100)”).

### 4.4 Optional: filterName in subscribe

- **Change in `streams.ts`**: Extend `subscribe` to accept optional `filterName?: string` and send it in `params` when provided. This enables unsubscribe by name and future OR logic across named filters. No change to `HyperliquidFilters` type.

---

## 5. Extend Hyperliquid Stream block (no separate block)

Keep a single **Hyperliquid Stream** block; add full filter configuration to it.

- **Existing**: `streamType`, `coin`, `user`, `side` (single values only).
- **Add / extend**:
  - **coin**: Allow comma-separated (e.g. `BTC,ETH,SOL`) or keep tokenSelect with multi-select if the UI supports it; parse to array, max 50. `allowVariable` stays.
  - **user**: Allow comma-separated addresses; parse to array, max 100. For `streamType === 'events'` the service layer maps to `users`; else `user`. `allowVariable` stays.
  - **side**: Unchanged (B / A / Both); Both = omit from filters.
  - **type** (optional, stream-dependent): For `events` — select or text (deposit, withdraw, internalTransfer, spotTransfer, vaultDeposit, vaultWithdraw, funding, …). For `writer_actions` — e.g. SystemSpotSendAction, etc. Max 20 values; comma-separated if text.
  - **Extra filters** (optional): keyValue or textarea JSON, e.g. `liquidation: ["*"]`, `twapId: ["*"]`, `dir: ["Open Long"]`. Merged into the filter object; validated with `validateFilterLimits`.
  - **filterName** (optional text): Passed to `subscribe(streamType, filters, onMessage, filterName)` for unsubscribe-by-name.
- **Subscribe flow** (in blocks.ts): Build a spec from the above inputs (including parsing comma-separated and keyValue/JSON), call `buildFiltersFromSpec(streamType, spec)` → `validateFilterLimits(streamType, filters)`; if invalid, log warnings and optionally still subscribe with trimmed filters. Call `subscribe(streamType, filters, onMessage, filterName)`.

No second block; filtering is just part of the Stream block’s configuration.

---

## 6. Files to add or edit

| File | Action |
|------|--------|
| `src/services/hyperliquid/types.ts` | Add `FILTER_LIMITS`, optional `UnifiedFilterSpec` and `STREAM_FILTER_FIELDS` (or move to filters module). |
| `src/services/hyperliquid/filters.ts` (new) | Implement `buildFiltersFromSpec`, `validateFilterLimits`; optionally `parseUnifiedFilterInputs` (from block inputs to `UnifiedFilterSpec`). |
| `src/services/hyperliquid/streams.ts` | Optional: add `filterName?: string` to `subscribe` and include in `params`. |
| `src/services/hyperliquid/index.ts` | Export new filter functions (and types if in filters.ts). |
| `src/lib/blocks.ts` | Extend `hyperliquidStream` only: new/updated inputs (coin/user multi-value, type, extra filters, filterName); in `subscribe`, build spec → `buildFiltersFromSpec` → `validateFilterLimits` → `subscribe(streamType, filters, onMessage, filterName)`. |

---

## 7. Implementation order

1. **Types and constants** — `FILTER_LIMITS`, `UnifiedFilterSpec`, stream-field metadata in `types.ts` (or filters.ts).
2. **Filter service** — `buildFiltersFromSpec` and `validateFilterLimits` in `filters.ts`; map `user` → `users` for events.
3. **Stream API** — add `filterName` to `subscribe()` and `hl_unsubscribe` by name in `streams.ts`.
4. **Stream block** — extend `hyperliquidStream` inputs (multi coin/user, type, extra filters, filterName); in subscribe handler, build spec from inputs, call build + validate, then subscribe.

---

## 8. Summary

- **Filtering is server-side**: Config is sent at subscribe time; no separate "filter block" in the pipeline.
- **Single block**: One Hyperliquid Stream block with full filter options (multi-value, stream-specific fields, special values, validation).
- **Services**: `buildFiltersFromSpec`, `validateFilterLimits`, and optional `filterName` in subscribe.
