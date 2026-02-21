/**
 * Stream-trigger filter blocks: filter specs for subscription and hybrid run logic.
 * Used by runAgent when a stream-trigger block is connected to the Hyperliquid Stream block.
 * Order-book imbalance and spread monitoring will be implemented later when book snapshot or equivalent is available.
 */

import type { UnifiedFilterSpec, HyperliquidStreamType, HyperliquidStreamMessage } from './types'
import { FILTER_LIMITS } from './types'
import { parseCommaSeparated } from './filters'
import { normalizeStreamEventToUnifiedOutputs } from './streams'
import { getBlock } from '../../lib/blockRegistry'
import type { RunContext } from '../../lib/runAgent'

function isVariablePlaceholder(s: string): boolean {
  return /^\s*\{\{[^}]*\}\}\s*$/.test(String(s).trim())
}

const STREAM_TYPE_MAP: Record<string, HyperliquidStreamType> = {
  trades: 'trades',
  'Trade Alert': 'trades',
  orders: 'orders',
  'Order Fill Alert': 'orders',
  book_updates: 'book_updates',
  'Book Update Monitor': 'book_updates',
  twap: 'twap',
  'TWAP Status Alert': 'twap',
  events: 'events',
  'Events Monitor': 'events',
  writer_actions: 'writer_actions',
  'Writer Actions': 'writer_actions',
}

export function normalizeStreamType(raw: string): HyperliquidStreamType {
  const key = (raw || 'trades').trim()
  return (STREAM_TYPE_MAP[key] as HyperliquidStreamType | undefined) ?? 'trades'
}

/** Canonical stream-trigger block types. Keep in sync with blocks.ts registerBlock({ type: '...' }). */
export const STREAM_TRIGGER_BLOCK_TYPES = {
  liquidationAlert: 'liquidationAlert',
  filterByUser: 'filterByUser',
  twapFillNotifier: 'twapFillNotifier',
  orderFillAlert: 'orderFillAlert',
  newOrderAlert: 'newOrderAlert',
  depositWithdrawalAlert: 'depositWithdrawalAlert',
  fundingRateAlert: 'fundingRateAlert',
  priceCross: 'priceCross',
  volumeSpike: 'volumeSpike',
  writerActionMonitor: 'writerActionMonitor',
  largeTradeAlert: 'largeTradeAlert',
} as const

const HYBRID_BLOCK_TYPES = new Set<string>([
  STREAM_TRIGGER_BLOCK_TYPES.largeTradeAlert,
  STREAM_TRIGGER_BLOCK_TYPES.priceCross,
  STREAM_TRIGGER_BLOCK_TYPES.volumeSpike,
])

/**
 * Build filter spec for subscription from stream-trigger block type and inputs.
 * Used by runAgent to subscribe with the correct filters.
 */
export function getFilterSpecForStreamTrigger(
  blockType: string,
  inputs: Record<string, string>,
  _streamType: string
): UnifiedFilterSpec {
  const spec: UnifiedFilterSpec = {}

  switch (blockType) {
    case STREAM_TRIGGER_BLOCK_TYPES.liquidationAlert:
      spec.liquidation = ['*']
      break
    case STREAM_TRIGGER_BLOCK_TYPES.filterByUser: {
      const users = parseCommaSeparated(inputs.users ?? inputs.user, FILTER_LIMITS.maxUserValues).filter(
        (u) => !isVariablePlaceholder(u)
      )
      if (users.length) spec.user = users
      break
    }
    case STREAM_TRIGGER_BLOCK_TYPES.twapFillNotifier:
      // TWAP stream: pass-through; optional user filter from inputs
      {
        const users = parseCommaSeparated(inputs.users ?? inputs.user, FILTER_LIMITS.maxUserValues).filter(
          (u) => !isVariablePlaceholder(u)
        )
        if (users.length) spec.user = users
      }
      break
    case STREAM_TRIGGER_BLOCK_TYPES.orderFillAlert:
      // Orders stream: server may support status filter; empty = all order events
      break
    case STREAM_TRIGGER_BLOCK_TYPES.newOrderAlert:
      break
    case STREAM_TRIGGER_BLOCK_TYPES.depositWithdrawalAlert:
      // Events stream: filter by deposit/withdrawal types
      spec.type = ['Deposit', 'Withdrawal']
      break
    case STREAM_TRIGGER_BLOCK_TYPES.fundingRateAlert:
      spec.type = ['Funding']
      break
    case STREAM_TRIGGER_BLOCK_TYPES.writerActionMonitor: {
      const users = parseCommaSeparated(inputs.users ?? inputs.user, FILTER_LIMITS.maxUserValues).filter(
        (u) => !isVariablePlaceholder(u)
      )
      if (users.length) spec.user = users
      break
    }
    case STREAM_TRIGGER_BLOCK_TYPES.largeTradeAlert:
    case STREAM_TRIGGER_BLOCK_TYPES.priceCross:
    case STREAM_TRIGGER_BLOCK_TYPES.volumeSpike:
      // Hybrid blocks use trades stream; no extra subscription filter
      break
    default:
      break
  }

  return spec
}

/**
 * Build Stream block spec from Stream node data (same rules as Stream block subscribe).
 * Skip variable placeholders. Then merge with streamTriggerSpec (stream-trigger keys override/add).
 */
export function mergeWithStreamSpec(
  streamNodeData: Record<string, unknown>,
  streamTriggerSpec: UnifiedFilterSpec
): UnifiedFilterSpec {
  const data = streamNodeData as Record<string, string>
  const filtersEnabled = (data.filtersEnabled ?? 'true') !== 'false'
  const rawStreamType = (data.streamType ?? 'trades').trim()
  const streamType = normalizeStreamType(rawStreamType)

  const spec: UnifiedFilterSpec = { ...streamTriggerSpec }

  if (!filtersEnabled) return spec

  const coinVal = (data.coin ?? '').trim()
  if (coinVal && !isVariablePlaceholder(coinVal)) spec.coin = [coinVal]

  const userArr = parseCommaSeparated(data.user, FILTER_LIMITS.maxUserValues).filter(
    (u) => !isVariablePlaceholder(u)
  )
  if (userArr.length) spec.user = userArr

  const eventTypeRaw = (data.eventType ?? 'All').trim()
  const eventTypeVal = eventTypeRaw === 'All' ? '' : eventTypeRaw
  if (eventTypeVal && !isVariablePlaceholder(eventTypeVal)) spec.type = [eventTypeVal]

  if (data.side && data.side !== 'Both' && !isVariablePlaceholder(data.side)) {
    if (streamType === 'trades' || streamType === 'orders' || streamType === 'book_updates') {
      spec.side = [data.side]
    }
  }

  const preset = (data.filterPreset ?? 'None').trim()
  if (streamType === 'trades' && preset === 'Liquidations only') spec.liquidation = ['*']
  if (streamType === 'trades' && preset === 'TWAP only') spec.twapId = ['*']

  const extraRaw = (data.extraFilters ?? '').trim()
  if (extraRaw) {
    try {
      const extra = JSON.parse(extraRaw) as Record<string, unknown>
      if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
        for (const [k, v] of Object.entries(extra)) {
          if (Array.isArray(v)) {
            const arr = v.map((x) => String(x).trim()).filter((x) => Boolean(x) && !isVariablePlaceholder(x))
            if (arr.length) spec[k] = arr
          } else if (v != null && v !== '' && !isVariablePlaceholder(String(v))) {
            spec[k] = [String(v).trim()]
          }
        }
      }
    } catch {
      // ignore invalid extraFilters
    }
  }

  return spec
}

export function isHybridBlock(blockType: string): boolean {
  return HYBRID_BLOCK_TYPES.has(blockType)
}

/** Per-run state for volume spike: key = agentId:nodeId, value = { windowMs, threshold, entries: { t, size }[] } */
const volumeSpikeState = new Map<
  string,
  { windowMs: number; threshold: number; entries: Array<{ t: number; size: number }> }
>()

/**
 * Record a trade size and check if volume in the rolling window meets or exceeds threshold.
 * Returns true if after this event the window volume >= threshold (caller sets passed = 'true' once).
 * State is kept per agent run (keyed by agentId and nodeId from context).
 */
export function recordVolumeAndCheckSpike(
  agentId: string | undefined,
  nodeId: string | undefined,
  windowMs: number,
  threshold: number,
  size: number
): boolean {
  const key = [agentId ?? '', nodeId ?? ''].join(':')
  if (!key || windowMs <= 0 || threshold <= 0) return false
  let state = volumeSpikeState.get(key)
  if (!state) {
    state = { windowMs, threshold, entries: [] }
    volumeSpikeState.set(key, state)
  }
  const now = Date.now()
  state.entries.push({ t: now, size })
  const cutoff = now - state.windowMs
  state.entries = state.entries.filter((e) => e.t >= cutoff)
  const sum = state.entries.reduce((a, e) => a + e.size, 0)
  return sum >= state.threshold
}

/**
 * For hybrid blocks, call the block's run() with event outputs + node config and return result.
 * For pure blocks, return outputs unchanged.
 */
export async function runHybridIfNeeded(
  blockType: string,
  outputs: Record<string, string>,
  nodeInputs: Record<string, string>,
  context?: RunContext
): Promise<Record<string, string>> {
  if (!isHybridBlock(blockType)) return Promise.resolve(outputs)
  const def = getBlock(blockType)
  if (!def?.run) return Promise.resolve(outputs)
  const inputs = { ...outputs, ...nodeInputs }
  return def.run(inputs, context)
}

export type RunDownstreamFn = (outputs: Record<string, string>) => void

/**
 * Returns a callback that subscribe(streamType, filters, callback) expects.
 * Receives raw HyperliquidStreamMessage, iterates events, normalizes each, runs hybrid check if needed, then calls runDownstream.
 */
export function createStreamTriggerCallback(
  streamType: HyperliquidStreamType,
  blockType: string,
  nodeInputs: Record<string, string>,
  runDownstream: RunDownstreamFn,
  context?: RunContext
): (msg: HyperliquidStreamMessage) => void {
  return (msg: HyperliquidStreamMessage) => {
    const eventsFromData = msg.data?.events
    const legacyEvents = (msg as HyperliquidStreamMessage & { events?: unknown[] }).events
    const events = eventsFromData ?? legacyEvents ?? []
    if (!Array.isArray(events) || events.length === 0) return

    for (const ev of events) {
      try {
        const outputs = normalizeStreamEventToUnifiedOutputs(streamType, ev, msg)
        if (isHybridBlock(blockType)) {
          runHybridIfNeeded(blockType, outputs, nodeInputs, context).then((result) => {
            if (result.passed === 'true') runDownstream(result)
          })
        } else {
          runDownstream(outputs)
        }
      } catch (e) {
        console.warn('[streamTriggerHandlers] normalize error', e)
      }
    }
  }
}
