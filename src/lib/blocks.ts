/**
 * Block definitions — this is where you register new blocks.
 *
 * To add a new block:
 *   1. Write your function in the appropriate service file (services/quicknode.ts, etc.)
 *   2. Add a registerBlock() call below pointing to that function
 *   3. Done — it shows up in the sidebar and canvas automatically
 *
 * Available input types:
 *   text         → single-line string
 *   number       → numeric value (supports min / max / step)
 *   select       → dropdown with fixed options
 *   toggle       → on / off switch
 *   textarea     → multi-line text
 *   address      → wallet address (mono font, wallet icon)
 *   slider       → range slider with min / max / step
 *   tokenSelect  → token picker (uses DEFAULT_TOKENS or custom list)
 *   variable     → dropdown referencing outputs from other blocks
 *   keyValue     → dynamic list of key / value pairs
 *
 * Any input with  allowVariable: true  gets a { } toggle button so the user
 * can switch between typing a fixed value or referencing another block's output.
 */

import { registerBlock } from './blockRegistry'
import { getHyperliquidStreamOutputs } from './hyperliquidStreamOutputs'
import {
  buildFiltersFromSpec,
  validateFilterLimits,
  parseCommaSeparated,
} from '../services/hyperliquid/filters'
import { FILTER_LIMITS, type HyperliquidStreamType, type HyperliquidStreamMessage } from '../services/hyperliquid/types'
import type { HyperliquidFilters } from '../services/hyperliquid/types'
import {
  subscribe,
  normalizeStreamEventToUnifiedOutputs,
} from '../services/hyperliquid/streams'
import {
  getFilterSpecForStreamTrigger,
  createStreamTriggerCallback,
  recordVolumeAndCheckSpike,
} from '../services/hyperliquid/streamTriggerHandlers'
import { getAllMids } from '../services/hyperliquid/info'
import type { RunContext } from './runAgent'

/** Skip sending variable placeholders (e.g. {{nodeId.out}}) to the API. */
function isVariablePlaceholder(s: string): boolean {
  return /^\s*\{\{[^}]*\}\}\s*$/.test(String(s).trim())
}

/** Client-side: return true if this event's outputs match the requested filters (so we only trigger when relevant). */
function eventMatchesFilters(
  streamType: HyperliquidStreamType,
  filters: HyperliquidFilters,
  outputs: Record<string, string>,
): boolean {
  if (Object.keys(filters).length === 0) return true
  const coinMatch = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  if (streamType === 'trades') {
    const coin = (outputs.coin ?? '').trim()
    const side = (outputs.side ?? '').trim()
    const user = (outputs.user ?? '').trim()
    if (filters.coin?.length && !filters.coin.some((c) => coinMatch(c, coin))) return false
    if (filters.side?.length && !filters.side.some((s) => coinMatch(s, side))) return false
    if (filters.user?.length && !filters.user.some((u) => u.toLowerCase() === user.toLowerCase())) return false
    if (filters.liquidation?.includes('*') && !(outputs.liquidatedUser ?? '').trim()) return false
    // twapId filter: we don't expose twapId in normalized trade outputs; rely on server filter
  }
  if (streamType === 'orders') {
    if (filters.coin?.length && !filters.coin.some((c) => coinMatch(c, (outputs.coin ?? '').trim()))) return false
    if (filters.side?.length && !filters.side.some((s) => coinMatch(s, (outputs.side ?? '').trim()))) return false
    if (filters.user?.length && !filters.user.some((u) => u.toLowerCase() === (outputs.user ?? '').trim().toLowerCase())) return false
  }
  if (streamType === 'book_updates') {
    if (filters.coin?.length && !filters.coin.some((c) => coinMatch(c, (outputs.coin ?? '').trim()))) return false
    if (filters.side?.length && !filters.side.some((s) => coinMatch(s, (outputs.side ?? '').trim()))) return false
  }
  if (streamType === 'events') {
    if (filters.users?.length && !filters.users.some((u) => u.toLowerCase() === (outputs.user ?? '').trim().toLowerCase())) return false
    if (filters.type?.length && !filters.type.includes((outputs.status ?? '').trim())) return false
  }
  if (streamType === 'writer_actions') {
    if (filters.user?.length && !filters.user.some((u) => u.toLowerCase() === (outputs.user ?? '').trim().toLowerCase())) return false
    if (filters.type?.length && !filters.type.includes((outputs.status ?? (outputs as Record<string, string>).actionType ?? '').trim())) return false
  }
  return true
}
import { swap, blockInputsToApiParams, getQuote } from '../services/uniswap'
import {
  webhook,
  timeLoop,
  intervalToMs,
  generalComparator,
  delay,
  transformDataType,
  priceChangeWithBuffer,
  // numericRangeFilter,
  // stringMatchFilter,
  // rateLimitFilter,
  // conditionalBranch,
  // mergeOutputs,
  // logDebug,
} from '../services/general'
import { sendTelegram, startTelegramMessagePolling } from '../services/notifications'
import { getWalletBalance } from '../services/walletBalance'
// import { subscribeToTransfer } from '../services/walletEvent'

// ─── Unified Hyperliquid Stream Block ───────────────────

registerBlock({
  type: 'hyperliquidStream',
  label: 'Hyperliquid Stream',
  description: 'Unified streaming block for all Hyperliquid stream types. Select stream type and configure filters.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'emerald',
  icon: 'activity',
  sidePanel: { label: 'Filters', mainInputNames: ['streamType'] },
  inputs: [
    {
      name: 'streamType',
      label: 'Stream Type',
      type: 'select',
      options: ['trades', 'orders', 'book_updates', 'twap', 'events', 'writer_actions'],
      defaultValue: 'trades',
      optionDescriptions: {
        trades: 'Filled trades / executions',
        orders: 'Order status updates',
        book_updates: 'Order book changes',
        twap: 'TWAP execution status',
        events: 'Account events (deposits, withdrawals, etc.)',
        writer_actions: 'Core writer actions',
      },
    },
    {
      name: 'filtersEnabled',
      label: 'Enable filters',
      type: 'toggle',
      defaultValue: 'true',
    },
    {
      name: 'coin',
      label: 'Filter: Coin',
      type: 'tokenSelect',
      tokens: ['BTC', 'ETH', 'SOL', 'HYPE', 'ARB', 'OP', 'DOGE', 'AVAX', 'LINK', 'MATIC', 'UNI', 'ATOM', 'LTC', 'XRP', 'ADA', 'DOT', 'AAVE', 'CRV', 'MKR', 'SNX'],
      placeholder: 'All coins',
      allowVariable: true,
    },
    {
      name: 'user',
      label: 'Filter: User address(es)',
      type: 'address',
      placeholder: '0x... or comma-separated for multiple',
      allowVariable: true,
    },
    {
      name: 'side',
      label: 'Filter: Side',
      type: 'select',
      options: ['Both', 'B', 'A'],
      defaultValue: 'Both',
      optionDescriptions: {
        Both: 'No side filter',
        B: 'Bid / buy only',
        A: 'Ask / sell only',
      },
    },
    {
      name: 'eventType',
      label: 'Filter: Event / action type',
      type: 'select',
      options: [
        'All',
        'deposit',
        'withdraw',
        'internalTransfer',
        'spotTransfer',
        'liquidation',
        'funding',
        'vaultDeposit',
        'vaultWithdraw',
        'SystemSpotSendAction',
        'SystemPerpsAction',
        'CoreWriterAction',
      ],
      defaultValue: 'All',
      optionDescriptions: {
        All: 'No event type filter',
        deposit: 'Deposit events',
        withdraw: 'Withdrawal events',
        internalTransfer: 'Internal transfer',
        spotTransfer: 'Spot transfer',
        liquidation: 'Liquidation events',
        funding: 'Funding events',
        vaultDeposit: 'Vault deposit',
        vaultWithdraw: 'Vault withdraw',
        SystemSpotSendAction: 'System spot send',
        SystemPerpsAction: 'System perps action',
        CoreWriterAction: 'Core writer action',
      },
    },
    {
      name: 'filterPreset',
      label: 'Filter: Preset (trades)',
      type: 'select',
      options: ['None', 'Liquidations only', 'TWAP only'],
      defaultValue: 'None',
      optionDescriptions: {
        None: 'No preset filter',
        'Liquidations only': 'Only liquidation trades',
        'TWAP only': 'Only TWAP executions',
      },
    },
    {
      name: 'extraFilters',
      label: 'Filter: Extra (JSON)',
      type: 'textarea',
      placeholder: 'e.g. {"coin":["BTC","ETH"]} or {"liquidation":["*"]} or {"twapId":["*"]}',
      rows: 2,
      allowVariable: true,
    },
    {
      name: 'filterName',
      label: 'Filter name (optional)',
      type: 'text',
      placeholder: 'Name for unsubscribe',
      allowVariable: true,
    },
  ],
  outputs: [
    { name: 'streamType', label: 'Stream Type', type: 'string' },
    { name: 'data', label: 'Event Data (JSON)', type: 'json' },
    { name: 'user', label: 'User Address', type: 'address' },
    { name: 'coin', label: 'Coin', type: 'string' },
    { name: 'hash', label: 'Tx Hash', type: 'string' },
    { name: 'timestamp', label: 'Timestamp', type: 'string' },
    { name: 'price', label: 'Price', type: 'number' },
    { name: 'size', label: 'Size', type: 'number' },
    { name: 'amount', label: 'Amount', type: 'number' },
    { name: 'status', label: 'Status', type: 'string' },
    { name: 'side', label: 'Side', type: 'string' },
  ],
  getOutputs: (inputs) => getHyperliquidStreamOutputs(inputs.streamType ?? 'trades'),
  getVisibleInputs: (inputs) => {
    const streamType = (inputs.streamType ?? 'trades').trim()
    const base = ['streamType', 'filtersEnabled', 'extraFilters', 'filterName']
    switch (streamType) {
      case 'trades':
        return [...base, 'coin', 'user', 'side', 'filterPreset']
      case 'orders':
        return [...base, 'coin', 'user', 'side']
      case 'book_updates':
        return [...base, 'coin', 'side']
      case 'events':
        return [...base, 'user', 'eventType']
      case 'writer_actions':
        return [...base, 'user', 'eventType']
      case 'twap':
      default:
        return base
    }
  },
  run: async (inputs) => {
    // Placeholder outputs for manual run
    return {
      streamType: inputs.streamType || 'trades',
      data: '{}',
      user: '',
      coin: '',
      hash: '',
      timestamp: '',
      price: '0',
      size: '0',
      amount: '0',
      status: '',
      side: '',
    }
  },
  subscribe: (inputs, onTrigger) => {
    const rawStreamType = (inputs.streamType || 'trades').trim()
    const hasWsUrl = !!(import.meta.env.VITE_QUICKNODE_HYPERLIQUID_WS_URL as string | undefined)?.trim()
    console.log('[hyperliquidStream] Setting up stream:', rawStreamType, hasWsUrl ? '(WS URL set)' : '(WS URL missing — set VITE_QUICKNODE_HYPERLIQUID_WS_URL in .env.local and restart dev server)')
    // Allow both friendly labels and raw values for future compatibility
    const streamTypeMap: Record<string, HyperliquidStreamType> = {
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
    const streamType =
      (streamTypeMap[rawStreamType] as HyperliquidStreamType | undefined) ?? 'trades'

    const filtersEnabled = inputs.filtersEnabled !== 'false'
    let spec: Record<string, string[] | undefined> = {}

    if (filtersEnabled) {
      const coinVal = (inputs.coin ?? '').trim()
      const coinArr = coinVal && !isVariablePlaceholder(coinVal) ? [coinVal] : []
      const userArr = parseCommaSeparated(inputs.user, FILTER_LIMITS.maxUserValues).filter((u) => !isVariablePlaceholder(u))
      const eventTypeRaw = (inputs.eventType ?? 'All').trim()
      const eventTypeVal = eventTypeRaw === 'All' ? '' : eventTypeRaw
      const typeArr = eventTypeVal && !isVariablePlaceholder(eventTypeVal) ? [eventTypeVal] : []
      if (coinArr.length) spec.coin = coinArr
      if (userArr.length) spec.user = userArr
      if (typeArr.length) spec.type = typeArr
      if (inputs.side && inputs.side !== 'Both' && !isVariablePlaceholder(inputs.side)) {
        if (streamType === 'trades' || streamType === 'orders' || streamType === 'book_updates') {
          spec.side = [inputs.side]
        } else {
          console.warn(
            `[hyperliquidStream] Side filter does not apply to stream type "${streamType}", ignoring side filter`,
          )
        }
      }
      const preset = (inputs.filterPreset ?? 'None').trim()
      if (streamType === 'trades' && preset === 'Liquidations only') spec.liquidation = ['*']
      if (streamType === 'trades' && preset === 'TWAP only') spec.twapId = ['*']
      // Merge extra filters JSON (e.g. {"coin":["BTC","ETH"],"liquidation":["*"]})
      const extraRaw = inputs.extraFilters?.trim()
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
          console.warn('[hyperliquidStream] Invalid Filter: Extra (JSON), ignoring')
        }
      }
    }

    const filters = buildFiltersFromSpec(streamType, spec)
    const validation = validateFilterLimits(streamType, filters)
    if (!validation.valid) {
      console.warn('[hyperliquidStream] Filter validation:', validation.errors.join('; '))
    }

    const filterName = inputs.filterName?.trim() || undefined
    const unsubscribe = subscribe(
      streamType,
      filters,
      (msg: HyperliquidStreamMessage) => {
      const eventsFromData = msg.data?.events
      const legacyEvents =
        eventsFromData == null
          ? (msg as HyperliquidStreamMessage & { events?: unknown[] }).events
          : undefined
      const events = eventsFromData ?? legacyEvents ?? []
      if (!Array.isArray(events) || events.length === 0) return

      for (const ev of events) {
        try {
          const outputs = normalizeStreamEventToUnifiedOutputs(streamType, ev, msg)
          if (!eventMatchesFilters(streamType, filters, outputs)) continue
          onTrigger(outputs)
        } catch (e) {
          console.warn('[hyperliquidStream] normalize error', e)
        }
      }
    },
      filterName
    )

    return unsubscribe
  },
})

/**
 * Shared subscribe helper for reskinned Hyperliquid stream blocks.
 * Builds filter spec from block type + inputs, then subscribes with createStreamTriggerCallback.
 */
function subscribeReskinnedStream(
  blockType: string,
  streamType: HyperliquidStreamType,
  inputs: Record<string, string>,
  onTrigger: (outputs: Record<string, string>) => void,
  context?: RunContext,
): () => void {
  const spec = getFilterSpecForStreamTrigger(blockType, inputs, streamType)
  let filters: ReturnType<typeof buildFiltersFromSpec>
  try {
    filters = buildFiltersFromSpec(streamType, spec)
  } catch (e) {
    console.warn('[subscribeReskinnedStream] buildFiltersFromSpec failed:', blockType, e)
    return () => {}
  }
  const validation = validateFilterLimits(streamType, filters)
  if (!validation.valid) {
    console.warn('[subscribeReskinnedStream] Filter validation:', blockType, validation.errors?.join('; '))
  }
  const callback = createStreamTriggerCallback(streamType, blockType, inputs, onTrigger, context)
  return subscribe(streamType, filters, callback)
}

// ─── Stream Triggers (subscribe with filters; connect from Hyperliquid Stream) ───

registerBlock({
  type: 'liquidationAlert',
  label: 'Liquidation alert',
  description: 'Only pass when the event is a liquidation. Subscribes to the trades stream (liquidation filter).',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'emerald',
  icon: 'activity',
  inputs: [],
  outputs: getHyperliquidStreamOutputs('trades'),
  run: async (inputs) => ({ ...inputs }),
  subscribe: (inputs, onTrigger, context) =>
    subscribeReskinnedStream('liquidationAlert', 'trades', inputs, onTrigger, context),
})

registerBlock({
  type: 'filterByUser',
  label: 'Filter by user(s)',
  description: 'Only trades for the given wallet address(es). Subscribes to the trades stream.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'blue',
  icon: 'users',
  inputs: [
    {
      name: 'user',
      label: 'User address(es)',
      type: 'address',
      placeholder: '0x... or comma-separated for multiple',
      allowVariable: true,
    },
  ],
  outputs: getHyperliquidStreamOutputs('trades'),
  run: async (inputs) => ({ ...inputs }),
  subscribe: (inputs, onTrigger, context) =>
    subscribeReskinnedStream('filterByUser', 'trades', inputs, onTrigger, context),
})

registerBlock({
  type: 'twapFillNotifier',
  label: 'TWAP fill notifier',
  description: 'TWAP execution updates. Subscribes to the TWAP stream. Optionally filter by user.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'violet',
  icon: 'trending-up',
  inputs: [
    {
      name: 'user',
      label: 'User address(es) (optional)',
      type: 'address',
      placeholder: '0x... or comma-separated',
      allowVariable: true,
    },
  ],
  outputs: getHyperliquidStreamOutputs('twap'),
  run: async (inputs) => ({ ...inputs }),
  subscribe: (inputs, onTrigger, context) =>
    subscribeReskinnedStream('twapFillNotifier', 'twap', inputs, onTrigger, context),
})

const ORDER_STREAM_TOKENS = ['BTC', 'ETH', 'SOL', 'HYPE', 'ARB', 'OP', 'DOGE', 'AVAX', 'LINK', 'MATIC', 'UNI', 'ATOM', 'LTC', 'XRP', 'ADA', 'DOT', 'AAVE', 'CRV', 'MKR', 'SNX']

registerBlock({
  type: 'orderFillAlert',
  label: 'Order fill alert',
  description: 'Order fill events. Subscribes to the orders stream. Optionally filter by coin, user, or side.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'amber',
  icon: 'check-circle',
  inputs: [
    {
      name: 'coin',
      label: 'Filter: Coin',
      type: 'tokenSelect',
      tokens: ORDER_STREAM_TOKENS,
      placeholder: 'All coins',
      allowVariable: true,
    },
    {
      name: 'user',
      label: 'Filter: User address(es)',
      type: 'address',
      placeholder: '0x... or comma-separated for multiple',
      allowVariable: true,
    },
    {
      name: 'side',
      label: 'Filter: Side',
      type: 'select',
      options: ['Both', 'B', 'A'],
      defaultValue: 'Both',
      optionDescriptions: {
        Both: 'No side filter',
        B: 'Bid / buy only',
        A: 'Ask / sell only',
      },
    },
  ],
  outputs: getHyperliquidStreamOutputs('orders'),
  run: async (inputs) => ({ ...inputs }),
  subscribe: (inputs, onTrigger, context) =>
    subscribeReskinnedStream('orderFillAlert', 'orders', inputs, onTrigger, context),
})

registerBlock({
  type: 'newOrderAlert',
  label: 'New order alert',
  description: 'New order events. Subscribes to the orders stream. Optionally filter by coin, user, or side.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'amber',
  icon: 'plus-circle',
  inputs: [
    {
      name: 'coin',
      label: 'Filter: Coin',
      type: 'tokenSelect',
      tokens: ORDER_STREAM_TOKENS,
      placeholder: 'All coins',
      allowVariable: true,
    },
    {
      name: 'user',
      label: 'Filter: User address(es)',
      type: 'address',
      placeholder: '0x... or comma-separated for multiple',
      allowVariable: true,
    },
    {
      name: 'side',
      label: 'Filter: Side',
      type: 'select',
      options: ['Both', 'B', 'A'],
      defaultValue: 'Both',
      optionDescriptions: {
        Both: 'No side filter',
        B: 'Bid / buy only',
        A: 'Ask / sell only',
      },
    },
  ],
  outputs: getHyperliquidStreamOutputs('orders'),
  run: async (inputs) => ({ ...inputs }),
  subscribe: (inputs, onTrigger, context) =>
    subscribeReskinnedStream('newOrderAlert', 'orders', inputs, onTrigger, context),
})

registerBlock({
  type: 'depositWithdrawalAlert',
  label: 'Deposit / withdrawal alert',
  description: 'Deposit and withdrawal events. Subscribes to the events stream (Deposit & Withdrawal only).',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'rose',
  icon: 'arrow-down-up',
  inputs: [],
  outputs: getHyperliquidStreamOutputs('events'),
  run: async (inputs) => ({ ...inputs }),
  subscribe: (inputs, onTrigger, context) =>
    subscribeReskinnedStream('depositWithdrawalAlert', 'events', inputs, onTrigger, context),
})

registerBlock({
  type: 'fundingRateAlert',
  label: 'Funding rate alert',
  description: 'Funding rate events. Subscribes to the events stream (Funding only).',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'rose',
  icon: 'percent',
  inputs: [],
  outputs: getHyperliquidStreamOutputs('events'),
  run: async (inputs) => ({ ...inputs }),
  subscribe: (inputs, onTrigger, context) =>
    subscribeReskinnedStream('fundingRateAlert', 'events', inputs, onTrigger, context),
})

registerBlock({
  type: 'writerActionMonitor',
  label: 'Writer action monitor',
  description: 'HyperCore ↔ HyperEVM bridge/transfer events. Subscribes to the writer_actions stream. Optionally filter by user.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'blue',
  icon: 'repeat',
  inputs: [
    {
      name: 'user',
      label: 'User address(es) (optional)',
      type: 'address',
      placeholder: '0x... or comma-separated',
      allowVariable: true,
    },
  ],
  outputs: getHyperliquidStreamOutputs('writer_actions'),
  run: async (inputs) => ({ ...inputs }),
  subscribe: (inputs, onTrigger, context) =>
    subscribeReskinnedStream('writerActionMonitor', 'writer_actions', inputs, onTrigger, context),
})

// ─── Hybrid Hyperliquid triggers (filter in run(); subscribe to trades) ───

registerBlock({
  type: 'largeTradeAlert',
  label: 'Large trade alert',
  description: 'Only pass when trade size meets or exceeds minimum. Subscribes to the trades stream.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'amber',
  icon: 'activity',
  inputs: [
    { name: 'minSize', label: 'Min size', type: 'number', placeholder: 'e.g. 1', defaultValue: '1' },
  ],
  outputs: getHyperliquidStreamOutputs('trades'),
  run: async (inputs) => {
    const size = Number.parseFloat(String(inputs.size ?? '').trim()) || 0
    const minSize = Number.parseFloat(String(inputs.minSize ?? '0').trim()) || 0
    const passed = minSize > 0 && size >= minSize
    return { ...inputs, passed: passed ? 'true' : 'false' }
  },
  subscribe: (inputs, onTrigger, context) =>
    subscribeReskinnedStream('largeTradeAlert', 'trades', inputs, onTrigger, context),
})

registerBlock({
  type: 'priceCross',
  label: 'Price cross alert',
  description: 'Only pass when price crosses above or below a level. Subscribes to the trades stream.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'violet',
  icon: 'activity',
  inputs: [
    { name: 'direction', label: 'Direction', type: 'select', options: ['above', 'below'], defaultValue: 'above' },
    { name: 'priceLevel', label: 'Price level', type: 'number', placeholder: 'e.g. 50000' },
  ],
  outputs: getHyperliquidStreamOutputs('trades'),
  run: async (inputs) => {
    const price = Number.parseFloat(String(inputs.price ?? '').trim()) || 0
    const level = Number.parseFloat(String(inputs.priceLevel ?? '').trim()) || 0
    const dir = (inputs.direction ?? 'above').trim().toLowerCase()
    let passed = false
    if (level > 0) {
      if (dir === 'above') passed = price >= level
      else if (dir === 'below') passed = price <= level
    }
    return { ...inputs, passed: passed ? 'true' : 'false' }
  },
  subscribe: (inputs, onTrigger, context) =>
    subscribeReskinnedStream('priceCross', 'trades', inputs, onTrigger, context),
})

registerBlock({
  type: 'volumeSpike',
  label: 'Volume spike alert',
  description: 'Only pass when volume in the time window meets or exceeds threshold. Subscribes to the trades stream.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'rose',
  icon: 'barChart',
  inputs: [
    { name: 'windowSeconds', label: 'Window (seconds)', type: 'number', placeholder: '60', defaultValue: '60' },
    { name: 'volumeThreshold', label: 'Volume threshold', type: 'number', placeholder: '100' },
  ],
  outputs: getHyperliquidStreamOutputs('trades'),
  run: async (inputs, context?: RunContext) => {
    const size = Number.parseFloat(String(inputs.size ?? '').trim()) || 0
    const windowSec = Number.parseFloat(String(inputs.windowSeconds ?? '60').trim()) || 60
    const threshold = Number.parseFloat(String(inputs.volumeThreshold ?? '0').trim()) || 0
    const windowMs = Math.max(1000, windowSec * 1000)
    const passed = recordVolumeAndCheckSpike(context?.agentId, context?.nodeId, windowMs, threshold, size)
    return { ...inputs, passed: passed ? 'true' : 'false' }
  },
  subscribe: (inputs, onTrigger, context) =>
    subscribeReskinnedStream('volumeSpike', 'trades', inputs, onTrigger, context),
})

// ─── General Comparator ────────────────────────────────────────

registerBlock({
  type: 'generalComparator',
  label: 'General Comparator',
  description: 'Compare two values: connect blocks to top/bottom or type literals. Empty field shows connection handle; filled field uses that value and hides the handle.',
  category: 'filter',
  color: 'yellow',
  icon: 'filter',
  inputs: [
    {
      name: 'valueToFilterTop',
      label: 'Top',
      type: 'text',
      placeholder: 'Connect or type value',
      allowVariable: true,
      accepts: ['json', 'string', 'number'],
      showHandleWhenEmpty: true,
    },
    {
      name: 'operator',
      label: 'Operator',
      type: 'select',
      options: [
        'equals',
        'not_equals',
        'greater_than',
        'less_than',
        'gte',
        'lte',
        'contains',
        'not_contains',
        'exists',
        'not_exists',
        'empty',
        'not_empty',
      ],
      defaultValue: 'greater_than',
      optionDescriptions: {
        equals: 'Top equals bottom',
        not_equals: 'Top does not equal bottom',
        greater_than: 'Top > bottom',
        less_than: 'Top < bottom',
        gte: 'Top >= bottom',
        lte: 'Top <= bottom',
        contains: 'Top contains bottom (string)',
        not_contains: 'Top does not contain bottom',
        exists: 'Top is non-empty',
        not_exists: 'Top is empty or missing',
        empty: 'Top is empty',
        not_empty: 'Top is non-empty',
      },
    },
    {
      name: 'valueToFilterBottom',
      label: 'Bottom',
      type: 'text',
      placeholder: 'Connect or type value',
      allowVariable: true,
      accepts: ['json', 'string', 'number'],
      showHandleWhenEmpty: true,
    },
    {
      name: 'passThrough',
      label: 'Pass through when matched',
      type: 'toggle',
      defaultValue: 'true',
    },
  ],
  outputs: [
    { name: 'passed', label: 'Passed', type: 'boolean' },
  ],
  run: async (inputs) => generalComparator(inputs),
})

// ─── Output Display Block (Visualization / Debug) ──────────

function getStreamDisplayOutputs(inputs: Record<string, string>): { name: string; label: string; type?: 'string' | 'number' | 'address' | 'json' | 'boolean' }[] {
  const raw = (inputs.data ?? '').trim()
  if (!raw) return [{ name: 'lastEvent', label: 'Last Event (JSON)', type: 'json' }]
  try {
    const parsed = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.keys(parsed).map((key) => ({
        name: key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        type: 'string' as const,
      }))
    }
  } catch {
    /* ignore */
  }
  return [{ name: 'lastEvent', label: 'Last Event (JSON)', type: 'json' }]
}

registerBlock({
  type: 'streamDisplay',
  label: 'Output Display',
  description:
    'Connect a block and choose which outputs to show. Live output appears in the console below.',
  category: 'display',
  color: 'blue',
  icon: 'eye',
  inputs: [
    {
      name: 'data',
      label: 'Source',
      type: 'textarea',
      placeholder: '',
      rows: 1,
      allowVariable: true,
      accepts: ['json', 'string', 'number'],
    },
    {
      name: 'fields',
      label: 'Fields to Show',
      type: 'text',
      placeholder: '[]',
    },
  ],
  outputs: [
    {
      name: 'lastEvent',
      label: 'Last Event (JSON)',
      type: 'json',
    },
  ],
  getOutputs: getStreamDisplayOutputs,
  run: async (inputs): Promise<Record<string, string>> => {
    const raw = inputs.data ?? ''
    let selectedFields: string[] | null = null
    try {
      const fieldsRaw = (inputs.fields ?? '').trim()
      if (fieldsRaw) {
        const arr = JSON.parse(fieldsRaw)
        if (Array.isArray(arr) && arr.length > 0) {
          selectedFields = arr.filter((x): x is string => typeof x === 'string')
        }
      }
    } catch {
      /* ignore */
    }

    const filterKeys = (obj: Record<string, string>): Record<string, string> => {
      if (selectedFields == null || selectedFields.length === 0) return obj
      const result: Record<string, string> = {}
      for (const k of selectedFields) {
        if (k in obj) result[k] = obj[k]
      }
      return result
    }

    if (typeof raw !== 'string') {
      const obj = raw as Record<string, unknown>
      const result: Record<string, string> = {}
      for (const k of Object.keys(obj)) result[k] = String(obj[k] ?? '')
      return filterKeys(result)
    }
    if (!raw.trim()) {
      return { lastEvent: '' }
    }
    try {
      const parsed = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const result: Record<string, string> = {}
        for (const [k, v] of Object.entries(parsed)) {
          result[k] = v == null ? '' : String(v)
        }
        return filterKeys(result)
      }
    } catch {
      /* ignore */
    }
    return { lastEvent: typeof raw === 'string' ? raw : '' }
  },
})

// ─── General Filter Block ───────────────────────────────

function inferOutputType(v: unknown): 'string' | 'number' | 'address' | 'json' | 'boolean' {
  if (v === null || v === undefined) return 'string'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  if (typeof v === 'object') return 'json'
  return 'string'
}

function getGeneralFilterOutputs(inputs: Record<string, string>): { name: string; label: string; type?: 'string' | 'number' | 'address' | 'json' | 'boolean' }[] {
  const fieldsRaw = (inputs.fields ?? '').trim()
  let sample: Record<string, unknown> | null = null
  const dataRaw = (inputs.data ?? '').trim()
  if (dataRaw) {
    try {
      const parsed = JSON.parse(dataRaw)
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) sample = parsed
    } catch {
      /* ignore */
    }
  }
  if (fieldsRaw) {
    try {
      const arr = JSON.parse(fieldsRaw)
      if (Array.isArray(arr) && arr.length > 0) {
        const names = arr.filter((x): x is string => typeof x === 'string')
        if (names.length > 0) {
          return names.map((key) => {
            const type = sample && key in sample ? inferOutputType(sample[key]) : 'string'
            return {
              name: key,
              label: key.charAt(0).toUpperCase() + key.slice(1),
              type,
            }
          })
        }
      }
    } catch {
      /* ignore */
    }
  }
  return [{ name: 'filtered', label: 'Filtered (JSON)', type: 'json' }]
}

/** Serialize a value so the output string can be parsed back to the same type (primitives as string form, objects/arrays as JSON). */
function toOutputValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function runGeneralFilter(inputs: Record<string, string>): Promise<Record<string, string>> {
  const raw = inputs.data ?? ''
  let selectedFields: string[] | null = null
  try {
    const fieldsRaw = (inputs.fields ?? '').trim()
    if (fieldsRaw) {
      const arr = JSON.parse(fieldsRaw)
      if (Array.isArray(arr) && arr.length > 0) {
        selectedFields = arr.filter((x): x is string => typeof x === 'string')
      }
    }
  } catch {
    /* ignore */
  }

  const filterKeys = (obj: Record<string, string>): Record<string, string> => {
    if (selectedFields == null || selectedFields.length === 0) return obj
    const result: Record<string, string> = {}
    for (const k of selectedFields) {
      if (k in obj) result[k] = obj[k]
    }
    return result
  }

  const buildResult = (obj: Record<string, unknown>): Record<string, string> => {
    const result: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj)) {
      result[k] = toOutputValue(v)
    }
    return filterKeys(result)
  }

  if (typeof raw !== 'string') {
    const obj = raw as Record<string, unknown>
    return Promise.resolve(buildResult(obj))
  }
  if (!raw.trim()) {
    return Promise.resolve({ filtered: '' })
  }
  try {
    const parsed = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Promise.resolve(buildResult(parsed as Record<string, unknown>))
    }
  } catch {
    /* ignore */
  }
  return Promise.resolve({ filtered: typeof raw === 'string' ? raw : '' })
}

registerBlock({
  type: 'generalFilter',
  label: 'General Filter',
  description:
    'Pass through only selected fields from the connected data. Single input; choose which fields appear on the output.',
  category: 'filter',
  color: 'yellow',
  icon: 'filter',
  inputs: [
    {
      name: 'data',
      label: 'Source',
      type: 'textarea',
      placeholder: '',
      rows: 1,
      allowVariable: true,
      accepts: ['json', 'string', 'number'],
    },
    {
      name: 'fields',
      label: 'Fields to pass',
      type: 'text',
      placeholder: '[]',
    },
  ],
  outputs: [
    { name: 'filtered', label: 'Filtered (JSON)', type: 'json' },
  ],
  getOutputs: getGeneralFilterOutputs,
  run: runGeneralFilter,
})

// ─── Live Token Price (trigger) ───────────────────────────

const LIVE_PRICE_TOKENS = [
  'BTC', 'ETH', 'SOL', 'HYPE', 'ARB', 'OP', 'DOGE', 'AVAX', 'LINK', 'MATIC', 'UNI', 'ATOM', 'LTC', 'XRP', 'ADA', 'DOT', 'AAVE', 'CRV', 'MKR', 'SNX',
]

registerBlock({
  type: 'liveTokenPrice',
  label: 'Live Token Price',
  description: 'Real-time price via stream (every trade) or poll mid at an interval. Use Stream for maximum detail.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'emerald',
  icon: 'trending-up',
  inputs: [
    {
      name: 'coin',
      label: 'Token',
      type: 'tokenSelect',
      tokens: LIVE_PRICE_TOKENS,
      defaultValue: 'BTC',
    },
    {
      name: 'source',
      label: 'Source',
      type: 'select',
      options: ['Stream', 'Poll'],
      defaultValue: 'Stream',
      optionDescriptions: {
        Stream: 'Every trade (real-time). Requires VITE_QUICKNODE_HYPERLIQUID_WS_URL.',
        Poll: 'Mid price from API at a fixed interval.',
      },
    },
    {
      name: 'intervalSeconds',
      label: 'Poll interval (seconds)',
      type: 'number',
      placeholder: '1',
      defaultValue: '1',
      min: 0.5,
      max: 3600,
    },
  ],
  outputs: [
    { name: 'price', label: 'Price', type: 'number' },
    { name: 'coin', label: 'Coin', type: 'string' },
    { name: 'timestamp', label: 'Timestamp', type: 'string' },
  ],
  getVisibleInputs: (inputs) => {
    const src = (inputs.source ?? 'Stream').trim()
    return src === 'Poll' ? ['coin', 'source', 'intervalSeconds'] : ['coin', 'source']
  },
  run: async (inputs) => {
    const coin = (inputs.coin ?? 'BTC').trim() || 'BTC'
    const mids = await getAllMids()
    const price = mids[coin] ?? mids[coin.toUpperCase()] ?? '0'
    const timestamp = String(Date.now())
    return { price, coin, timestamp }
  },
  subscribe: (inputs, onTrigger) => {
    const coin = (inputs.coin ?? 'BTC').trim() || 'BTC'
    const source = (inputs.source ?? 'Stream').trim() as string

    if (source === 'Stream') {
      const filters = buildFiltersFromSpec('trades', { coin: [coin] })
      const unsub = subscribe('trades', filters, (msg) => {
        const events = msg.data?.events ?? []
        if (!Array.isArray(events)) return
        for (const ev of events) {
          try {
            const out = normalizeStreamEventToUnifiedOutputs('trades', ev, msg)
            const price = out.price ?? '0'
            const ts = out.timestamp ?? String(Date.now())
            onTrigger({ price, coin, timestamp: ts })
          } catch (e) {
            console.warn('[liveTokenPrice] normalize trade failed:', e)
          }
        }
      })
      return unsub
    }

    const seconds = Math.max(0.5, Math.min(3600, Number(inputs.intervalSeconds) || 1))
    const ms = Math.round(seconds * 1000)
    const id = setInterval(async () => {
      try {
        const mids = await getAllMids()
        const price = mids[coin] ?? mids[coin.toUpperCase()] ?? '0'
        const timestamp = String(Date.now())
        onTrigger({ price, coin, timestamp })
      } catch (e) {
        console.warn('[liveTokenPrice] getAllMids failed:', e)
        onTrigger({ price: '0', coin, timestamp: String(Date.now()) })
      }
    }, ms)
    return () => clearInterval(id)
  },
})

// ─── Price at level (trigger when price meets target for a coin) ──────────

function priceAtLevelMatches(
  price: number,
  targetPrice: number,
  condition: string,
  tolerancePercent: number,
): boolean {
  if (!Number.isFinite(targetPrice) || targetPrice <= 0 || !Number.isFinite(price)) return false
  const cond = (condition ?? 'above').trim().toLowerCase()
  if (cond === 'above') return price >= targetPrice
  if (cond === 'below') return price <= targetPrice
  if (cond === 'at') {
    const tol = Math.max(0, Math.min(100, tolerancePercent))
    const pct = Math.abs(price - targetPrice) / targetPrice * 100
    return pct <= tol
  }
  return false
}

registerBlock({
  type: 'priceAtLevel',
  label: 'Price at level',
  description: 'Trigger when the selected coin\'s price is above, below, or at a target level. Connect to actions or displays.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'violet',
  icon: 'activity',
  inputs: [
    {
      name: 'coin',
      label: 'Token',
      type: 'tokenSelect',
      tokens: LIVE_PRICE_TOKENS,
      defaultValue: 'BTC',
    },
    { name: 'targetPrice', label: 'Target price', type: 'number', placeholder: 'e.g. 50000' },
    {
      name: 'condition',
      label: 'Condition',
      type: 'select',
      options: ['above', 'below', 'at'],
      defaultValue: 'above',
      optionDescriptions: {
        above: 'Fire when price >= target',
        below: 'Fire when price <= target',
        at: 'Fire when price within tolerance % of target',
      },
    },
    { name: 'tolerancePercent', label: 'Tolerance % (for "at")', type: 'number', placeholder: '0.1', defaultValue: '0.1', min: 0, max: 100 },
    {
      name: 'source',
      label: 'Source',
      type: 'select',
      options: ['Stream', 'Poll'],
      defaultValue: 'Stream',
      optionDescriptions: {
        Stream: 'Every trade (real-time). Requires VITE_QUICKNODE_HYPERLIQUID_WS_URL.',
        Poll: 'Mid price from API at a fixed interval.',
      },
    },
    { name: 'intervalSeconds', label: 'Poll interval (seconds)', type: 'number', placeholder: '1', defaultValue: '1', min: 0.5, max: 3600 },
  ],
  outputs: [
    { name: 'price', label: 'Price', type: 'number' },
    { name: 'coin', label: 'Coin', type: 'string' },
    { name: 'timestamp', label: 'Timestamp', type: 'string' },
  ],
  getVisibleInputs: (inputs) => {
    const src = (inputs.source ?? 'Stream').trim()
    const base = ['coin', 'targetPrice', 'condition', 'source']
    if ((inputs.condition ?? '').trim().toLowerCase() === 'at') base.push('tolerancePercent')
    if (src === 'Poll') base.push('intervalSeconds')
    return base
  },
  run: async (inputs) => {
    const coin = (inputs.coin ?? 'BTC').trim() || 'BTC'
    const mids = await getAllMids()
    const price = mids[coin] ?? mids[coin.toUpperCase()] ?? '0'
    const timestamp = String(Date.now())
    return { price, coin, timestamp }
  },
  subscribe: (inputs, onTrigger) => {
    const coin = (inputs.coin ?? 'BTC').trim() || 'BTC'
    const targetPrice = Number.parseFloat(String(inputs.targetPrice ?? '').trim()) || 0
    const condition = (inputs.condition ?? 'above').trim()
    const tolerancePercent = Math.max(0, Math.min(100, Number.parseFloat(String(inputs.tolerancePercent ?? '0.1').trim()) || 0.1))
    const source = (inputs.source ?? 'Stream').trim() as string

    const maybeTrigger = (priceStr: string, ts: string) => {
      const price = Number.parseFloat(priceStr) || 0
      if (priceAtLevelMatches(price, targetPrice, condition, tolerancePercent)) {
        onTrigger({ price: priceStr, coin, timestamp: ts })
      }
    }

    if (source === 'Stream') {
      const filters = buildFiltersFromSpec('trades', { coin: [coin] })
      const unsub = subscribe('trades', filters, (msg) => {
        const events = msg.data?.events ?? []
        if (!Array.isArray(events)) return
        for (const ev of events) {
          try {
            const out = normalizeStreamEventToUnifiedOutputs('trades', ev, msg)
            const price = out.price ?? '0'
            const ts = out.timestamp ?? String(Date.now())
            maybeTrigger(price, ts)
          } catch (e) {
            console.warn('[priceAtLevel] normalize trade failed:', e)
          }
        }
      })
      return unsub
    }

    const seconds = Math.max(0.5, Math.min(3600, Number(inputs.intervalSeconds) || 1))
    const ms = Math.round(seconds * 1000)
    const id = setInterval(async () => {
      try {
        const mids = await getAllMids()
        const price = mids[coin] ?? mids[coin.toUpperCase()] ?? '0'
        const ts = String(Date.now())
        maybeTrigger(price, ts)
      } catch (e) {
        console.warn('[priceAtLevel] getAllMids failed:', e)
      }
    }, ms)
    return () => clearInterval(id)
  },
})

// ─── Live Token Prices (3 coins for Multigraph) ───────────

registerBlock({
  type: 'liveTokenPrices',
  label: 'Live Token Prices (3)',
  description: 'Poll 3 token mid prices at an interval. Use with Multigraph to plot BTC, ETH, SOL (or any 3).',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'emerald',
  icon: 'trending-up',
  inputs: [
    { name: 'coin1', label: 'Token 1', type: 'tokenSelect', tokens: LIVE_PRICE_TOKENS, defaultValue: 'BTC' },
    { name: 'coin2', label: 'Token 2', type: 'tokenSelect', tokens: LIVE_PRICE_TOKENS, defaultValue: 'ETH' },
    { name: 'coin3', label: 'Token 3', type: 'tokenSelect', tokens: LIVE_PRICE_TOKENS, defaultValue: 'SOL' },
    { name: 'intervalSeconds', label: 'Interval (seconds)', type: 'number', placeholder: '1', defaultValue: '1', min: 0.5, max: 3600 },
  ],
  outputs: [
    { name: 'price1', label: 'Price 1', type: 'number' },
    { name: 'price2', label: 'Price 2', type: 'number' },
    { name: 'price3', label: 'Price 3', type: 'number' },
    { name: 'timestamp', label: 'Timestamp', type: 'string' },
  ],
  run: async (inputs) => {
    const mids = await getAllMids()
    const ts = String(Date.now())
    const get = (key: string) => {
      const c = (inputs[key] ?? '').trim() || 'BTC'
      return mids[c] ?? mids[c.toUpperCase()] ?? '0'
    }
    return { price1: get('coin1'), price2: get('coin2'), price3: get('coin3'), timestamp: ts }
  },
  subscribe: (inputs, onTrigger) => {
    const seconds = Math.max(0.5, Math.min(3600, Number(inputs.intervalSeconds) || 1))
    const ms = Math.round(seconds * 1000)
    const id = setInterval(async () => {
      try {
        const mids = await getAllMids()
        const ts = String(Date.now())
        const get = (key: string) => {
          const c = (inputs[key] ?? '').trim() || 'BTC'
          return mids[c] ?? mids[c.toUpperCase()] ?? '0'
        }
        onTrigger({ price1: get('coin1'), price2: get('coin2'), price3: get('coin3'), timestamp: ts })
      } catch (e) {
        console.warn('[liveTokenPrices] getAllMids failed:', e)
        onTrigger({ price1: '0', price2: '0', price3: '0', timestamp: String(Date.now()) })
      }
    }, ms)
    return () => clearInterval(id)
  },
})

// ─── Graph Display ───────────────────────────────────────

registerBlock({
  type: 'graphDisplay',
  label: 'Graph Display',
  description: 'Plot numeric values over time. Connect a value (e.g. price) from an upstream block.',
  category: 'display',
  color: 'blue',
  icon: 'barChart',
  inputs: [
    {
      name: 'value',
      label: 'Value',
      type: 'number',
      placeholder: 'Connect price or number',
      allowVariable: true,
      accepts: ['number'],
    },
  ],
  outputs: [
    { name: 'lastValue', label: 'Last Value', type: 'number' },
    { name: 'lastTimestamp', label: 'Last Timestamp', type: 'string' },
  ],
  run: async (inputs): Promise<Record<string, string>> => {
    const raw = (inputs.value ?? '').trim()
    const num = raw === '' ? NaN : Number(raw)
    const value = Number.isFinite(num) ? String(num) : '0'
    const timestamp = String(Date.now())
    return { lastValue: value, lastTimestamp: timestamp }
  },
})

// ─── Multigraph (multi-series + legend + pause) ────────────

const MULTIGRAPH_N = 5

registerBlock({
  type: 'multigraph',
  label: 'Multigraph',
  description: 'Graph 2–5 series with a legend. Series can update at different times. Pause to freeze.',
  category: 'display',
  color: 'blue',
  icon: 'barChart',
  inputs: [
    { name: 'numberOfSeries', label: 'Number of series', type: 'select', options: ['2', '3', '4', '5'], defaultValue: '3' },
    { name: 'value1', label: 'Value 1', type: 'number', placeholder: 'Connect (e.g. BTC)', allowVariable: true, accepts: ['number'] },
    { name: 'label1', label: 'Label 1', type: 'text', placeholder: 'e.g. BTC', defaultValue: 'Series 1' },
    { name: 'value2', label: 'Value 2', type: 'number', placeholder: 'Connect (e.g. ETH)', allowVariable: true, accepts: ['number'] },
    { name: 'label2', label: 'Label 2', type: 'text', placeholder: 'e.g. ETH', defaultValue: 'Series 2' },
    { name: 'value3', label: 'Value 3', type: 'number', placeholder: 'Connect (e.g. SOL)', allowVariable: true, accepts: ['number'] },
    { name: 'label3', label: 'Label 3', type: 'text', placeholder: 'e.g. SOL', defaultValue: 'Series 3' },
    { name: 'value4', label: 'Value 4', type: 'number', placeholder: 'Connect', allowVariable: true, accepts: ['number'] },
    { name: 'label4', label: 'Label 4', type: 'text', placeholder: 'e.g. Series 4', defaultValue: 'Series 4' },
    { name: 'value5', label: 'Value 5', type: 'number', placeholder: 'Connect', allowVariable: true, accepts: ['number'] },
    { name: 'label5', label: 'Label 5', type: 'text', placeholder: 'e.g. Series 5', defaultValue: 'Series 5' },
  ],
  outputs: [
    { name: 'lastValue1', label: 'Last Value 1', type: 'number' },
    { name: 'lastValue2', label: 'Last Value 2', type: 'number' },
    { name: 'lastValue3', label: 'Last Value 3', type: 'number' },
    { name: 'lastValue4', label: 'Last Value 4', type: 'number' },
    { name: 'lastValue5', label: 'Last Value 5', type: 'number' },
    { name: 'lastTimestamp', label: 'Last Timestamp', type: 'string' },
  ],
  getVisibleInputs: (inputs) => {
    const n = Math.min(5, Math.max(2, parseInt(inputs.numberOfSeries ?? '3', 10) || 3))
    const names: string[] = ['numberOfSeries']
    for (let i = 1; i <= n; i++) {
      names.push(`value${i}`, `label${i}`)
    }
    return names
  },
  run: async (inputs): Promise<Record<string, string>> => {
    const ts = String(Date.now())
    const out: Record<string, string> = { lastTimestamp: ts }
    for (let i = 1; i <= MULTIGRAPH_N; i++) {
      const raw = (inputs[`value${i}`] ?? '').trim()
      const num = raw === '' ? NaN : Number(raw)
      out[`lastValue${i}`] = Number.isFinite(num) ? String(num) : ''
    }
    return out
  },
})

// ─── Transform Data Type ───────────────────────────────────

registerBlock({
  type: 'transformDataType',
  label: 'Transform Data Type',
  description: 'Convert the input value to a chosen data type: Number, String, Boolean, or JSON. Use to connect string/JSON outputs (e.g. token price) to number inputs like Graph Display.',
  category: 'filter',
  color: 'yellow',
  icon: 'arrow-down-up',
  inputs: [
    {
      name: 'value',
      label: 'Value',
      type: 'text',
      placeholder: 'Connect any value',
      allowVariable: true,
      accepts: ['string', 'json', 'number', 'boolean'],
    },
    {
      name: 'targetType',
      label: 'Output data type',
      type: 'select',
      options: ['number', 'string', 'boolean', 'json'],
      defaultValue: 'number',
      optionDescriptions: {
        number: 'Parse as number (e.g. for Graph Display)',
        string: 'Keep or coerce to string',
        boolean: 'Convert to true/false (truthy/falsy)',
        json: 'Parse and re-serialize as JSON',
      },
    },
  ],
  outputs: [
    { name: 'value', label: 'Value', type: 'string' },
  ],
  getOutputs: (inputs): { name: string; label: string; type?: 'string' | 'number' | 'address' | 'json' | 'boolean' }[] => {
    const t = (inputs.targetType ?? 'number').toLowerCase()
    const type = t === 'number' || t === 'string' || t === 'boolean' || t === 'json' ? t : 'string'
    return [{ name: 'value', label: 'Value', type }]
  },
  run: async (inputs): Promise<Record<string, string>> => {
    const out = transformDataType(inputs.value ?? '', inputs.targetType ?? 'number')
    return { value: out }
  },
})

// ─── Price change % (single input, built-in buffer) ──────────

registerBlock({
  type: 'priceChange',
  label: 'Price change %',
  description:
    'Connect one price (e.g. Live Token Price). Computes % change from the previous value it saw; stores the last value internally so you only need one input. Use with General Comparator to alert when move exceeds a threshold.',
  category: 'filter',
  color: 'yellow',
  icon: 'percent',
  inputs: [
    {
      name: 'value',
      label: 'Price',
      type: 'number',
      placeholder: 'Connect current price',
      allowVariable: true,
      accepts: ['number', 'string'],
    },
  ],
  outputs: [
    { name: 'percentChange', label: 'Percent change', type: 'string' },
    { name: 'previousPrice', label: 'Previous price', type: 'string' },
  ],
  run: async (inputs, context): Promise<Record<string, string>> => {
    const nodeId = context?.nodeId ?? ''
    const { percentChange, previousPrice } = priceChangeWithBuffer(nodeId, inputs.value ?? '')
    return { percentChange, previousPrice }
  },
})

// ─── Uniswap Blocks ─────────────────────────────────────

registerBlock({
  type: 'swap',
  label: 'Swap',
  description: 'Execute a token swap via Uniswap Trading API',
  category: 'action',
  service: 'uniswap',
  color: 'rose',
  icon: 'zap',
  inputs: [
    { name: 'fromToken', label: 'From Token', type: 'tokenSelect', defaultValue: 'ETH', allowVariable: true },
    { name: 'toToken', label: 'To Token', type: 'tokenSelect', defaultValue: 'USDC', allowVariable: true },
    { name: 'amount', label: 'Amount', type: 'number', placeholder: '1.0', allowVariable: true },
    { name: 'amountDenomination', label: 'Amount in', type: 'select', options: ['Token', 'USD'], defaultValue: 'Token' },
  ],
  outputs: [
    { name: 'txHash', label: 'Transaction Hash' },
    { name: 'amountOut', label: 'Amount Received' },
    { name: 'gasUsed', label: 'Gas Used' },
  ],
  run: async (inputs, context) => swap(inputs, context),
})

registerBlock({
  type: 'getQuote',
  label: 'Get Quote',
  description: 'Fetch a swap quote without executing. Use with Value Filter to swap only when output meets threshold.',
  category: 'action',
  service: 'uniswap',
  color: 'rose',
  icon: 'barChart',
  inputs: [
    { name: 'fromToken', label: 'From Token', type: 'tokenSelect', defaultValue: 'ETH', allowVariable: true },
    { name: 'toToken', label: 'To Token', type: 'tokenSelect', defaultValue: 'USDC', allowVariable: true },
    { name: 'amount', label: 'Amount', type: 'number', placeholder: '1.0', allowVariable: true },
    { name: 'amountDenomination', label: 'Amount in', type: 'select', options: ['Token', 'USD'], defaultValue: 'Token' },
  ],
  outputs: [
    { name: 'amountOut', label: 'Amount Out (raw)', type: 'string' },
    { name: 'gasFeeUSD', label: 'Gas Fee (USD)', type: 'string' },
    { name: 'routing', label: 'Routing Type', type: 'string' },
    { name: 'quote', label: 'Quote (JSON)', type: 'json' },
  ],
  run: async (inputs) => {
    const params = await blockInputsToApiParams(inputs)
    const res = await getQuote(params)
    if (res?.errorCode) throw new Error(res.detail ?? `Quote failed: ${res.errorCode}`)
    const quote = res?.quote ?? res
    const outputAmount = quote?.output?.amount ?? quote?.outputAmount ?? ''
    const gasFeeUSD = quote?.gasFeeUSD ?? res?.gasFeeUSD ?? ''
    const routing = res?.routing ?? ''
    return {
      amountOut: String(outputAmount),
      gasFeeUSD: String(gasFeeUSD),
      routing: String(routing),
      quote: JSON.stringify(res),
    }
  },
})


// ─── Utility Blocks ──────────────────────────────────────

registerBlock({
  type: 'webhook',
  label: 'Webhook',
  description: 'Send data to an external URL (POST, GET, PUT, or DELETE). Use for alerts or external automation.',
  category: 'action',
  color: 'yellow',
  icon: 'globe',
  inputs: [
    { name: 'url', label: 'Webhook URL', type: 'text', placeholder: 'https://...', allowVariable: true },
    { name: 'method', label: 'Method', type: 'select', options: ['POST', 'GET', 'PUT', 'DELETE'], defaultValue: 'POST' },
    { name: 'useCorsProxy', label: 'Use CORS proxy (for browser)', type: 'toggle', defaultValue: 'true' },
    { name: 'headers', label: 'Headers', type: 'keyValue', defaultValue: '[]' },
    { name: 'body', label: 'Request Body', type: 'textarea', placeholder: '{"key": "value"}', rows: 3, allowVariable: true },
  ],
  outputs: [
    { name: 'status', label: 'Status Code', type: 'string' },
    { name: 'response', label: 'Response Body', type: 'string' },
  ],
  run: async (inputs) => webhook(inputs),
})

registerBlock({
  type: 'timeLoop',
  label: 'Time Loop',
  description: 'Trigger at a fixed interval (seconds, minutes, hours, days, etc.)',
  category: 'trigger',
  color: 'yellow',
  icon: 'clock',
  inputs: [
    { name: 'interval', label: 'Interval', type: 'number', placeholder: '10', defaultValue: '10' },
    {
      name: 'unit',
      label: 'Unit',
      type: 'select',
      options: ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months', 'years'],
      defaultValue: 'seconds',
    },
  ],
  outputs: [
    { name: 'elapsed', label: 'Time Elapsed' },
  ],
  run: async (inputs) => timeLoop(inputs),
  subscribe: (inputs, onTrigger) => {
    const value = parseFloat(inputs.interval || '10')
    const unit = inputs.unit || 'seconds'
    const ms = Math.max(1000, intervalToMs(value, unit))
    const label = `${value} ${unit}`
    const id = setInterval(() => onTrigger({ elapsed: label }), ms)
    return () => clearInterval(id)
  },
})

registerBlock({
  type: 'manualTrigger',
  label: 'Trigger Manually',
  description: 'Run the agent once with the button (no deploy needed)',
  category: 'trigger',
  color: 'yellow',
  icon: 'zap',
  inputs: [],
  outputs: [
    { name: 'triggered', label: 'Triggered' },
  ],
  run: async () => ({ triggered: 'true' }),
})

// ─── HTTP / Webhook Trigger (no server in browser; use backend to POST) ───

registerBlock({
  type: 'webhookTrigger',
  label: 'Webhook Trigger',
  description: 'Fires when an HTTP request is received at your webhook URL. Use a backend (e.g. Supabase Edge Function) to POST to your agent.',
  category: 'trigger',
  color: 'blue',
  icon: 'radio',
  inputs: [
    { name: 'webhookPath', label: 'Webhook path (for reference)', type: 'text', placeholder: 'e.g. /webhook/agent-id' },
  ],
  outputs: [
    { name: 'body', label: 'Request Body', type: 'string' },
    { name: 'method', label: 'Method', type: 'string' },
    { name: 'headers', label: 'Headers (JSON)', type: 'json' },
  ],
  run: async (inputs) => ({
    body: inputs.body ?? '',
    method: inputs.method ?? 'POST',
    headers: inputs.headers ?? '{}',
  }),
  subscribe: (_inputs, _onTrigger) => () => {},
})

// ─── Wallet / Contract Event Trigger ──────────────────────────────────────
// registerBlock({
//   type: 'walletEventTrigger',
//   label: 'Wallet Event',
//   description: 'Trigger on ERC20 Transfer events. Optionally filter by wallet (from or to).',
//   category: 'trigger',
//   color: 'violet',
//   icon: 'wallet',
//   inputs: [
//     { name: 'chainId', label: 'Chain ID', type: 'number', defaultValue: '1', placeholder: '1' },
//     { name: 'contractAddress', label: 'Contract Address', type: 'address', placeholder: '0x...' },
//     { name: 'filterWallet', label: 'Filter: wallet (from or to)', type: 'address', placeholder: 'Optional' },
//     { name: 'rpcUrl', label: 'RPC URL (optional)', type: 'text', placeholder: 'Leave empty for default' },
//   ],
//   outputs: [
//     { name: 'from', label: 'From', type: 'address' },
//     { name: 'to', label: 'To', type: 'address' },
//     { name: 'value', label: 'Value', type: 'string' },
//     { name: 'txHash', label: 'Tx Hash', type: 'string' },
//     { name: 'blockNumber', label: 'Block Number', type: 'string' },
//   ],
//   run: async () => ({}),
//   subscribe: (inputs, onTrigger) => subscribeToTransfer(inputs, onTrigger),
// })

// ─── Telegram message trigger (get updates) ───────────────────────────────

registerBlock({
  type: 'telegramMessageTrigger',
  label: 'Get Telegram',
  description: 'Trigger when your bot receives a message. Polls the Telegram Bot API for new messages. Connect to actions (e.g. Send Telegram) or filters.',
  category: 'trigger',
  color: 'blue',
  icon: 'messageSquare',
  inputs: [
    { name: 'botToken', label: 'Bot Token', type: 'text', placeholder: '123:ABC...' },
    { name: 'chatIdFilter', label: 'Chat ID filter (optional)', type: 'text', placeholder: 'Only trigger for this chat; leave empty for all' },
    { name: 'pollIntervalSeconds', label: 'Poll interval (seconds)', type: 'number', placeholder: '5', defaultValue: '5', min: 2, max: 60 },
    { name: 'useCorsProxy', label: 'Use CORS proxy', type: 'toggle', defaultValue: 'true' },
  ],
  outputs: [
    { name: 'messageText', label: 'Message text', type: 'string' },
    { name: 'chatId', label: 'Chat ID', type: 'string' },
    { name: 'fromId', label: 'From user ID', type: 'string' },
    { name: 'username', label: 'Username', type: 'string' },
    { name: 'firstName', label: 'First name', type: 'string' },
    { name: 'updateId', label: 'Update ID', type: 'string' },
    { name: 'messageId', label: 'Message ID', type: 'string' },
    { name: 'date', label: 'Date (Unix)', type: 'string' },
  ],
  run: async () => ({
    messageText: '',
    chatId: '',
    fromId: '',
    username: '',
    firstName: '',
    updateId: '',
    messageId: '',
    date: '',
  }),
  subscribe: (inputs, onTrigger) => {
    const botToken = (inputs.botToken ?? '').trim()
    if (!botToken) {
      console.warn('[Get Telegram] Bot token is required')
      return () => {}
    }
    return startTelegramMessagePolling(
      botToken,
      {
        useCorsProxy: inputs.useCorsProxy !== 'false',
        chatIdFilter: (inputs.chatIdFilter ?? '').trim() || undefined,
        pollIntervalSeconds: Math.max(2, Math.min(60, Number(inputs.pollIntervalSeconds) || 5)),
      },
      onTrigger,
    )
  },
})

// ─── Send Notification: Telegram ─────────────────────────────────────────

registerBlock({
  type: 'sendTelegram',
  label: 'Send Telegram',
  description: 'Send a message via Telegram Bot API. Create a bot with @BotFather and get chat ID from @userinfobot.',
  category: 'action',
  color: 'blue',
  icon: 'messageSquare',
  inputs: [
    { name: 'botToken', label: 'Bot Token', type: 'text', placeholder: '123:ABC...' },
    { name: 'chatId', label: 'Chat ID', type: 'text', placeholder: 'e.g. -1001234567890' },
    { name: 'message', label: 'Message', type: 'textarea', rows: 3, allowVariable: true },
    { name: 'parseMode', label: 'Parse mode', type: 'select', options: ['HTML', 'Markdown', 'MarkdownV2'], defaultValue: 'HTML' },
    { name: 'useCorsProxy', label: 'Use CORS proxy', type: 'toggle', defaultValue: 'true' },
  ],
  outputs: [
    { name: 'ok', label: 'OK', type: 'boolean' },
    { name: 'status', label: 'Status', type: 'string' },
    { name: 'response', label: 'Response', type: 'json' },
  ],
  run: async (inputs) => sendTelegram(inputs),
})

// ─── Get wallet balance ──────────────────────────────────────────────────

registerBlock({
  type: 'getWalletBalance',
  label: 'Get wallet balance',
  description: 'Return native (ETH) or ERC20 token balance for an address. Leave wallet empty to use the connected wallet.',
  category: 'action',
  color: 'blue',
  icon: 'wallet',
  inputs: [
    { name: 'wallet', label: 'Wallet address', type: 'address', placeholder: '0x... or leave empty for connected', allowVariable: true },
    { name: 'token', label: 'Token (optional)', type: 'address', placeholder: 'Leave empty for native ETH' },
    { name: 'chainId', label: 'Chain ID', type: 'number', placeholder: '1', defaultValue: '1' },
    { name: 'rpcUrl', label: 'RPC URL (optional)', type: 'text', placeholder: 'Leave empty for default' },
  ],
  outputs: [
    { name: 'balance', label: 'Balance (raw)', type: 'string' },
    { name: 'balanceFormatted', label: 'Balance (formatted)', type: 'string' },
  ],
  run: async (inputs) => getWalletBalance(inputs),
})

// ─── Send Notification: Discord ───────────────────────────────────────────
// registerBlock({
//   type: 'sendDiscord',
//   label: 'Send Discord',
//   description: 'Send a message to a Discord channel via webhook URL.',
//   category: 'action',
//   color: 'violet',
//   icon: 'messageSquare',
//   inputs: [
//     { name: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: 'https://discord.com/api/webhooks/...' },
//     { name: 'message', label: 'Message', type: 'textarea', rows: 3, allowVariable: true },
//     { name: 'username', label: 'Username (optional)', type: 'text', placeholder: 'Bot name' },
//     { name: 'useCorsProxy', label: 'Use CORS proxy', type: 'toggle', defaultValue: 'true' },
//   ],
//   outputs: [
//     { name: 'ok', label: 'OK', type: 'boolean' },
//     { name: 'status', label: 'Status', type: 'string' },
//     { name: 'response', label: 'Response', type: 'string' },
//   ],
//   run: async (inputs) => sendDiscord(inputs),
// })

// ─── Log / Debug ──────────────────────────────────────────────────────────
// registerBlock({
//   type: 'logDebug',
//   label: 'Log / Debug',
//   description: 'Log inputs to the browser console and pass through. Useful for debugging flows.',
//   category: 'action',
//   color: 'amber',
//   icon: 'bug',
//   inputs: [
//     { name: 'passthrough', label: 'Pass through value', type: 'text', placeholder: 'Optional', allowVariable: true },
//   ],
//   outputs: [
//     { name: 'out', label: 'Out', type: 'string' },
//   ],
//   run: async (inputs) => logDebug(inputs),
// })

// ─── Numeric range filter ─────────────────────────────────────────────────
// registerBlock({
//   type: 'numericRangeFilter',
//   label: 'Numeric Range',
//   description: 'Pass only when the connected value is within min and max (inclusive).',
//   category: 'filter',
//   color: 'yellow',
//   icon: 'filter',
//   inputs: [
//     { name: 'value', label: 'Value', type: 'number', allowVariable: true, accepts: ['number', 'string'] },
//     { name: 'min', label: 'Min', type: 'number', defaultValue: '0' },
//     { name: 'max', label: 'Max', type: 'number', defaultValue: '100' },
//   ],
//   outputs: [
//     { name: 'passed', label: 'Passed', type: 'string' },
//     { name: 'value', label: 'Value', type: 'string' },
//     { name: 'inRange', label: 'In Range', type: 'string' },
//   ],
//   run: async (inputs) => numericRangeFilter(inputs),
// })

// ─── String match filter ─────────────────────────────────────────────────
// registerBlock({
//   type: 'stringMatchFilter',
//   label: 'String Match',
//   description: 'Pass when value matches: contains, equals, or regex pattern.',
//   category: 'filter',
//   color: 'yellow',
//   icon: 'filter',
//   inputs: [
//     { name: 'value', label: 'Value', type: 'text', allowVariable: true, accepts: ['string', 'json'] },
//     { name: 'mode', label: 'Mode', type: 'select', options: ['contains', 'equals', 'regex'], defaultValue: 'contains' },
//     { name: 'pattern', label: 'Pattern', type: 'text', placeholder: 'Substring, exact string, or regex' },
//   ],
//   outputs: [
//     { name: 'passed', label: 'Passed', type: 'string' },
//     { name: 'matched', label: 'Matched', type: 'string' },
//     { name: 'value', label: 'Value', type: 'string' },
//   ],
//   run: async (inputs) => stringMatchFilter(inputs),
// })

// ─── Rate limit / debounce ────────────────────────────────────────────────
// registerBlock({
//   type: 'rateLimitFilter',
//   label: 'Rate Limit',
//   description: 'Pass only when at least N seconds have passed since last pass (per agent).',
//   category: 'filter',
//   color: 'amber',
//   icon: 'clock',
//   inputs: [
//     { name: 'intervalSeconds', label: 'Min interval (seconds)', type: 'number', defaultValue: '60', min: 1, max: 86400 },
//   ],
//   outputs: [
//     { name: 'passed', label: 'Passed', type: 'string' },
//     { name: 'elapsed', label: 'Elapsed since last', type: 'string' },
//     { name: 'nextAllowedIn', label: 'Next allowed in (s)', type: 'string' },
//   ],
//   run: async (inputs, context) =>
//     rateLimitFilter(inputs, context?.nodeId ?? '', context?.agentId),
// })

// ─── Delay (sleep) ────────────────────────────────────────────────────────

registerBlock({
  type: 'delay',
  label: 'Delay',
  description: 'Wait N seconds before continuing the flow.',
  category: 'action',
  color: 'yellow',
  icon: 'clock',
  inputs: [
    { name: 'seconds', label: 'Seconds', type: 'slider', min: 0, max: 300, step: 1, defaultValue: '1' },
  ],
  outputs: [
    { name: 'done', label: 'Done', type: 'string' },
  ],
  run: async (inputs) => delay(inputs),
})

// ─── Conditional branch (if/else) ──────────────────────────────────────────
// registerBlock({
//   type: 'conditionalBranch',
//   label: 'Conditional',
//   description: 'Branch by condition: connect the value; "true" and "false" outputs run only the matching branch.',
//   category: 'filter',
//   color: 'blue',
//   icon: 'gitBranch',
//   inputs: [
//     { name: 'condition', label: 'Condition', type: 'text', allowVariable: true, accepts: ['string', 'number', 'boolean'] },
//   ],
//   outputs: [
//     { name: 'true', label: 'True', type: 'string' },
//     { name: 'false', label: 'False', type: 'string' },
//   ],
//   run: async (inputs) => conditionalBranch(inputs),
// })

// ─── Merge ────────────────────────────────────────────────────────────────
// registerBlock({
//   type: 'merge',
//   label: 'Merge',
//   description: 'Combine multiple inputs into one output. Connect values to input handles or leave empty.',
//   category: 'action',
//   color: 'violet',
//   icon: 'merge',
//   inputs: [
//     { name: 'mode', label: 'Mode', type: 'select', options: ['first', 'concat', 'json'], defaultValue: 'first' },
//     { name: 'separator', label: 'Separator (for concat)', type: 'text', defaultValue: ', ' },
//     { name: 'in1', label: 'In 1', type: 'text', allowVariable: true, showHandleWhenEmpty: true },
//     { name: 'in2', label: 'In 2', type: 'text', allowVariable: true, showHandleWhenEmpty: true },
//     { name: 'in3', label: 'In 3', type: 'text', allowVariable: true, showHandleWhenEmpty: true },
//   ],
//   outputs: [
//     { name: 'out', label: 'Out', type: 'string' },
//   ],
//   run: async (inputs) => mergeOutputs(inputs),
// })

// ─── Constant ─────────────────────────────────────────────────────────────

registerBlock({
  type: 'constant',
  label: 'Constant',
  description:
    'Output a fixed value. Drag into the canvas and connect its output to any block input, or reference it in expressions as {{constantNodeId.value}}.',
  category: 'action',
  color: 'blue',
  icon: 'variable',
  inputs: [
    { name: 'value', label: 'Value', type: 'text', placeholder: 'e.g. 0.5 or 100', allowVariable: false },
  ],
  outputs: [
    { name: 'value', label: 'Value', type: 'string' },
  ],
  run: async (inputs) => ({ value: inputs.value ?? '' }),
})

