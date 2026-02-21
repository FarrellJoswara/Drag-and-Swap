# Plan: General-Purpose Blocks (No External Services)

Blocks in this plan can be implemented entirely in `src/services/general.ts` and `src/lib/blocks.ts` — no APIs, no RPC, no wallet/chain calls.

---

## 1. Fix existing stubs (quick wins)

These blocks already exist; they just need real logic in `general.ts`.

| Block | Current state | Implementation idea |
|-------|----------------|---------------------|
| **Delay Timer** | Stub returns immediately | `setTimeout` for `inputs.seconds`, then return `{ elapsed: inputs.seconds }`. Reuse pattern from `timeLoopRun`. |
| **Value Filter** | Stub returns empty | Parse `minValue` / `maxValue` and a "value" from inputs (e.g. from variable). Output `passed: 'true'` if value in range, else `'false'`, and `value` as the number used. Need to decide where "value" comes from (e.g. required input `value` with `allowVariable: true`). |
| **Trigger Manually** | Stub | Can stay as-is (just signals "run now") or return a timestamp so downstream has something to use. |
| **Webhook** | Block calls stub | In `blocks.ts`, wire the Webhook block’s `run` to `sendWebhook` instead of `webhook`. Optional: remove stub `webhook()` from general.ts. |

---

## 2. Logic & comparison

Useful for conditional flows (e.g. "only continue if price > X").

| Block | Purpose | Inputs | Outputs |
|-------|---------|--------|---------|
| **Compare** | Compare two values | `a`, `b` (number or string), `operator`: eq / ne / gt / gte / lt / lte | `passed` (true/false), optional `result` (a or b) |
| **Threshold** | Simple one-sided check | `value`, `operator` (above / below), `threshold` | `passed`, `value` |
| **Boolean** | AND / OR / NOT | For AND/OR: two inputs (true/false or pass-through); for NOT: one input | `result` (true/false) |

---

## 3. Math

All inputs/outputs as strings; parse with `parseFloat` and handle NaN.

| Block | Purpose | Inputs | Outputs |
|-------|---------|--------|---------|
| **Math** | Binary operation | `a`, `b`, `operation`: add / subtract / multiply / divide / min / max | `result` |
| **Round** | Round to N decimals | `value`, `decimals` (0–10) | `result` |
| **Format number** | Display formatting | `value`, `decimals`, optional `prefix`/`suffix` (e.g. $) | `formatted` |

---

## 4. String

| Block | Purpose | Inputs | Outputs |
|-------|---------|--------|---------|
| **Concat** | Join strings | `a`, `b`, optional `separator` | `result` |
| **Coalesce** | First non-empty | `a`, `b`, optional `c` | `result` |
| **Slice string** | Substring | `text`, `start`, `length` (or start/end) | `result` |
| **Replace** | Simple replace | `text`, `search`, `replace` (first or all) | `result` |

---

## 5. Time & constants

| Block | Purpose | Inputs | Outputs |
|-------|---------|--------|---------|
| **Current time** | Timestamp when block runs | Optional: `format` (ms / iso / unix) | `timestamp`, `iso`, `ms` |
| **Constant** | Fixed value for wiring | `value` (text or number), optional label | `value` (passthrough) |

Constant is useful so users can inject a fixed number or label into a variable slot without typing in another block.

---

## 6. JSON & data shape

| Block | Purpose | Inputs | Outputs |
|-------|---------|--------|---------|
| **Get path** | Read from JSON by path | `json` (textarea or variable), `path` (e.g. `data.price` or `0.price`) | `value` (string), `exists` (true/false) |
| **Merge objects** | Combine two JSON objects | `a`, `b` (JSON strings) | `merged` (JSON string) |
| **Build object** | Key-value pairs → one object | `keyValue` input (same as webhook headers) | `json` |

---

## 7. Flow control (conceptual)

| Block | Purpose | Inputs | Outputs |
|-------|---------|--------|---------|
| **Branch** | If condition then A else B | `condition` (true/false), `thenValue`, `elseValue` | `result` (thenValue or elseValue) |
| **Gate** | Pass data only when condition true | `condition`, `data` (passthrough) | `passed` (data or empty), `blocked` (bool) |

These don’t need external services; they just need the runtime to pass the condition in (e.g. from a Compare block).

---

## 8. Suggested implementation order

**Phase A – Stubs and one generic**  
1. Wire Webhook block to `sendWebhook`.  
2. Implement Delay Timer (real delay).  
3. Implement Value Filter (min/max range with a `value` input).  
4. Add **Compare** block (high reuse for triggers/filters).  

**Phase B – Math and time**  
5. **Math** block (add, subtract, multiply, divide, min, max).  
6. **Round** / **Format number**.  
7. **Current time** block.  

**Phase C – String and JSON**  
8. **Concat** and **Coalesce**.  
9. **Get path** (JSON path).  
10. **Constant** block.  

**Phase D – Optional**  
11. Threshold, Boolean, Slice string, Replace.  
12. Merge objects, Build object.  
13. Branch, Gate (if runtime supports passing condition + then/else cleanly).  

---

## 9. Input/output conventions

- All block I/O via `Record<string, string>`; parse numbers/JSON inside the service.  
- Use `allowVariable: true` on inputs that should accept upstream outputs (e.g. value, json, a, b).  
- For Compare/Math, support both numeric and string comparison (e.g. Compare: if both parse as numbers, compare as numbers; else lexicographic).  
- Document in block `description` whether an input expects a number, JSON, or any string.

---

## 10. File changes (summary)

- **`src/services/general.ts`**  
  - Implement: `delayTimer`, `valueFilter` (and optionally keep `manualTrigger` as-is).  
  - Add: `compare`, `math`, `round`, `formatNumber`, `currentTime`, `concat`, `coalesce`, `getJsonPath`, `constant`, etc.  
  - Wire Webhook in blocks to `sendWebhook` (no new function needed).  

- **`src/lib/blocks.ts`**  
  - Change Webhook block `run` to call `sendWebhook`.  
  - Add one `registerBlock` per new block, reusing existing input types (`number`, `text`, `select`, `textarea`, `variable`).  

No new env vars or external services required for any of these.
