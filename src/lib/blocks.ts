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
import {
  subscribe,
  normalizeStreamEventToUnifiedOutputs,
} from '../services/hyperliquid/streams'
import { swap, blockInputsToApiParams, getQuote } from '../services/uniswap'
import { webhook, timeLoop } from '../services/general'

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
      const coinArr = coinVal ? [coinVal] : []
      const userArr = parseCommaSeparated(inputs.user, FILTER_LIMITS.maxUserValues)
      const eventTypeRaw = (inputs.eventType ?? 'All').trim()
      const eventTypeVal = eventTypeRaw === 'All' ? '' : eventTypeRaw
      const typeArr = eventTypeVal ? [eventTypeVal] : []
      if (coinArr.length) spec.coin = coinArr
      if (userArr.length) spec.user = userArr
      if (typeArr.length) spec.type = typeArr
      if (inputs.side && inputs.side !== 'Both') {
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
                const arr = v.map((x) => String(x).trim()).filter(Boolean)
                if (arr.length) spec[k] = arr
              } else if (v != null && v !== '') {
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

      // Process each event
      for (const ev of events) {
        try {
          const outputs = normalizeStreamEventToUnifiedOutputs(streamType, ev, msg)
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

// ─── Output Display Block (Visualization / Debug) ──────────

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
      accepts: ['json', 'string'],
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
  run: async (inputs) => {
    let lastEvent = ''
    try {
      const raw = inputs.data ?? ''
      if (typeof raw !== 'string') {
        lastEvent = JSON.stringify(raw)
        return { lastEvent }
      }
      if (!raw.trim()) {
        return { lastEvent: '' }
      }
      const parsed = JSON.parse(raw)
      let selectedKeys: string[] = []
      try {
        const fieldsRaw = (inputs.fields ?? '').trim()
        if (fieldsRaw) selectedKeys = JSON.parse(fieldsRaw)
        if (!Array.isArray(selectedKeys)) selectedKeys = []
      } catch {
        selectedKeys = []
      }
      if (selectedKeys.length > 0 && parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const filtered: Record<string, unknown> = {}
        for (const key of selectedKeys) {
          if (key in parsed) filtered[key] = (parsed as Record<string, unknown>)[key]
        }
        lastEvent = Object.keys(filtered).length > 0 ? JSON.stringify(filtered) : ''
      } else if (selectedKeys.length === 0) {
        lastEvent = ''
      } else {
        lastEvent = JSON.stringify(parsed)
      }
    } catch {
      lastEvent = typeof inputs.data === 'string' ? inputs.data : ''
    }
    return { lastEvent }
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
  category: 'filter',
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
      amountOut: outputAmount,
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
  description: 'Send data to an external URL',
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
    { name: 'status', label: 'Status Code' },
    { name: 'response', label: 'Response Body' },
  ],
  run: async (inputs) => webhook(inputs),
})

registerBlock({
  type: 'timeLoop',
  label: 'Time Loop',
  description: 'Trigger every x seconds (interrupt-based)',
  category: 'trigger',
  color: 'yellow',
  icon: 'clock',
  inputs: [
    { name: 'seconds', label: 'Seconds', type: 'slider', min: 1, max: 300, step: 1, defaultValue: '10' },
  ],
  outputs: [
    { name: 'elapsed', label: 'Time Elapsed' },
  ],
  run: async (inputs) => timeLoop(inputs),
  subscribe: (inputs, onTrigger) => {
    const seconds = parseFloat(inputs.seconds || '10')
    const ms = Math.max(1000, seconds * 1000)
    const id = setInterval(() => onTrigger({ elapsed: `${seconds}s` }), ms)
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

