# Plan: Stream Display Fields + Green Handle Fixes

## Problem Summary

1. **Green dots on all outputs**: Outputs (Price, Size, Timestamp, Stream Type, etc.) show as "connected" (green) even when only one wire is connected. This is because we count an output as connected if it's either (a) the edge's sourceHandle, or (b) listed in a downstream Stream Display's "Fields to Show". So selecting all fields makes all outputs show green, even though only the "data" handle is actually wired.

2. **Fields to Show not working**: User selects e.g. Stream Type, Coin, Price, Size, Timestamp, etc. but the console only shows `coin`, `side`, `user`. Root cause: we pass the **raw event JSON** (the `data` output = `JSON.stringify(event)`) to Stream Display. The raw event has API keys (`px`, `sz`, `coin`, `side`, `user`, ...), while "Fields to Show" uses the **block output names** (`price`, `size`, `streamType`, `coin`, `side`, `timestamp`, ...). So keys don't match — e.g. "price" isn't in the raw event (it's "px"), so the filter finds nothing for those.

3. **Coin filter**: User sets Filter: Coin = BTC but sees ETH, HYPE, etc. Filter construction in blocks.ts is correct (spec.coin = [coinVal]); this may be a server-side or subscription-timing issue. No code change in this plan; if still broken after 1–2, we can add logging or case normalization separately.

## Fix 1: Pass normalized outputs to Stream Display (Fields to Show)

**Where**: `src/lib/runAgent.ts` — when resolving the Stream Display's "data" input from a trigger.

**Current**: We pass `srcOuts['data']` (the raw event JSON string) so the display gets the full event but with wrong keys for Fields to Show.

**Change**: When the source has a "data" output and the target is Stream Display's "data" input, pass **the full normalized outputs object** as JSON: `JSON.stringify(srcOuts)`. Then the parsed object has keys `streamType`, `data`, `user`, `coin`, `price`, `size`, `side`, `timestamp`, etc., which exactly match the "Fields to Show" option names. The display's existing filter-by-selectedKeys logic will then show all selected fields.

**Risk**: Low. Only affects Stream Display when its "data" input is connected to a node that has a "data" output (e.g. triggers). Other blocks and other inputs unchanged. The "data" key in the normalized object is still the raw event string, so "Event Data (JSON)" still shows the full payload if selected.

## Fix 2: Green = only the actually connected output handle

**Where**: `src/components/nodes/GenericNode.tsx` — `outputConnections` useMemo.

**Current**: We increment count for an output if `sourceHandle === out.name` **OR** (target is streamDisplay and that display's "Fields to Show" includes `out.name`). So selecting all fields in a downstream display makes every output show green.

**Change**: Only increment when `sourceHandle === out.name`. Remove the `displayFields.includes(out.name)` branch. So only the output handle that actually has an edge (e.g. "data") shows the green dot / count.

**Risk**: Low. Purely visual. Downstream blocks still receive the same data (we're not changing which output is sent). Users might notice "only one output is green" when they have one wire to Output Display — that's the correct state.

## Implementation order

1. runAgent: use `JSON.stringify(srcOuts)` for Stream Display "data" when source has "data" output.
2. GenericNode: in outputConnections, only count when `sourceHandle === out.name`.

## Verification

- After 1: Connect Hyperliquid Stream (e.g. book_updates) → Output Display, select Fields to Show (e.g. Stream Type, Coin, Side, Price, Size, Timestamp). Console should show JSON with those keys and correct values (price/size from normalized outputs).
- After 2: Same setup; only the output handle that is actually connected (e.g. "Event Data (JSON)" or "data") should show the green dot; other outputs should not.
- Regression: Manual run, other blocks (e.g. swap, value filter) unchanged. Stream Display connected to non-trigger sources: still use normal edge resolution (conn.sourceHandle / first key); only when source has "data" do we pass full normalized object.
