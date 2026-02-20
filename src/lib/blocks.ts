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
import {
  recentTrades,
  bookSnapshot,
  recentEvents,
  subscribe,
  type HyperliquidStreamType,
  type HyperliquidFilters,
  type HyperliquidStreamMessage,
} from '../services/hyperliquid'
import { normalizeStreamEventToUnifiedOutputs } from '../services/hyperliquid/streams'
import { swapQuote, executeSwap, tokenPrice, priceAlert } from '../services/uniswap'
import { webhook, timeLoop, delayTimer, valueFilter, sendToken, manualTrigger } from '../services/general'

// ─── Hyperliquid Blocks (QuickNode Data Streams) ───────────

registerBlock({
  type: 'recentTrades',
  label: 'Recent Trades',
  description: 'Fetch recent trades for a coin via Hyperliquid JSON-RPC.',
  category: 'filter',
  service: 'hyperliquid',
  color: 'emerald',
  icon: 'activity',
  inputs: [
    { name: 'coin', label: 'Coin', type: 'tokenSelect', tokens: ['BTC', 'ETH', 'SOL', 'HYPE'], defaultValue: 'BTC', allowVariable: true },
    { name: 'count', label: 'Block Count', type: 'number', placeholder: '10', defaultValue: '10', min: 1, max: 200 },
  ],
  outputs: [
    { name: 'trades', label: 'Trade Data (JSON)' },
    { name: 'tradeCount', label: 'Trade Count' },
    { name: 'lastPrice', label: 'Last Price' },
  ],
  run: async (inputs) => recentTrades(inputs),
})

registerBlock({
  type: 'bookSnapshot',
  label: 'Book Snapshot',
  description: 'Fetch recent order book updates from Hyperliquid. Stream name: book.',
  category: 'filter',
  service: 'hyperliquid',
  color: 'emerald',
  icon: 'barChart',
  inputs: [
    { name: 'coin', label: 'Coin', type: 'tokenSelect', tokens: ['BTC', 'ETH', 'SOL'], defaultValue: 'BTC', allowVariable: true },
    { name: 'count', label: 'Block Count', type: 'number', placeholder: '5', defaultValue: '5', min: 1, max: 200 },
  ],
  outputs: [
    { name: 'updates', label: 'Updates (JSON)' },
    { name: 'updateCount', label: 'Update Count' },
    { name: 'bestBid', label: 'Best Bid' },
    { name: 'bestAsk', label: 'Best Ask' },
    { name: 'spread', label: 'Spread' },
  ],
  run: async (inputs) => bookSnapshot(inputs),
})

registerBlock({
  type: 'recentEvents',
  label: 'Recent Events',
  description: 'Fetch recent events from Hyperliquid. Filter by type for mid-flow checks.',
  category: 'filter',
  service: 'hyperliquid',
  color: 'emerald',
  icon: 'filter',
  inputs: [
    {
      name: 'eventType',
      label: 'Event Type',
      type: 'select',
      options: ['deposit', 'withdraw', 'send', 'spotTransfer', 'vaultDeposit', 'vaultWithdraw', 'funding', 'all'],
      defaultValue: 'all',
    },
    { name: 'count', label: 'Block Count', type: 'number', placeholder: '10', defaultValue: '10', min: 1, max: 200 },
  ],
  outputs: [
    { name: 'events', label: 'Events (JSON)' },
    { name: 'eventCount', label: 'Event Count' },
    { name: 'passed', label: 'Has Events' },
  ],
  run: async (inputs) => recentEvents(inputs),
})

// ─── Unified Hyperliquid Stream Block ───────────────────

registerBlock({
  type: 'hyperliquidStream',
  label: 'Hyperliquid Stream',
  description: 'Unified streaming block for all Hyperliquid stream types. Select stream type and configure filters.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'emerald',
  icon: 'activity',
  inputs: [
    {
      name: 'streamType',
      label: 'Stream Type',
      type: 'select',
      // Use underlying stream type values for now to remain backward compatible
      options: ['trades', 'orders', 'book_updates', 'twap', 'events', 'writer_actions'],
      defaultValue: 'trades',
    },
    {
      name: 'coin',
      label: 'Coin (optional)',
      type: 'tokenSelect',
      tokens: ['BTC', 'ETH', 'SOL', 'HYPE', 'ARB', 'OP', 'DOGE', 'AVAX', 'LINK', 'MATIC'],
      allowVariable: true,
    },
    {
      name: 'user',
      label: 'User Address (optional)',
      type: 'address',
      placeholder: '0x...',
      allowVariable: true,
    },
    {
      name: 'side',
      label: 'Side (optional)',
      type: 'select',
      options: ['B', 'A', 'Both'],
      defaultValue: 'Both',
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

    const filters: HyperliquidFilters = {}

    // Build filters based on stream type and provided inputs
    if (inputs.coin && inputs.coin.trim()) {
      filters.coin = [inputs.coin.trim()]
    }
    if (inputs.user && inputs.user.trim()) {
      filters.user = [inputs.user.trim()]
    }
    if (inputs.side && inputs.side !== 'Both') {
      // Side filter only applies to streams that support sides
      if (streamType === 'trades' || streamType === 'orders' || streamType === 'book_updates') {
        filters.side = [inputs.side]
      } else {
        console.warn(
          `[hyperliquidStream] Side filter does not apply to stream type "${streamType}", ignoring side filter`,
        )
      }
    }

    // Subscribe to the stream
    const unsubscribe = subscribe(streamType, filters, (msg: HyperliquidStreamMessage) => {
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
    })

    return unsubscribe
  },
})

// ─── Stream Display Block (Visualization / Debug) ──────────

registerBlock({
  type: 'streamDisplay',
  label: 'Stream Display',
  description:
    'Display events from a JSON data stream. Connect outputs like Hyperliquid Stream → data.',
  category: 'display',
  color: 'blue',
  icon: 'eye',
  inputs: [
    {
      name: 'data',
      label: 'Event Data',
      type: 'textarea',
      placeholder: 'Connect a JSON event stream output here',
      rows: 3,
      allowVariable: true,
      // Accept JSON or string outputs from upstream blocks
      accepts: ['json', 'string'],
    },
    {
      name: 'label',
      label: 'Feed Label',
      type: 'text',
      placeholder: 'BTC Trades',
      defaultValue: 'Stream Feed',
    },
    {
      name: 'fields',
      label: 'Fields to Show (comma-separated)',
      type: 'text',
      placeholder: 'price, side, coin',
    },
    {
      name: 'maxItems',
      label: 'Max Items',
      type: 'number',
      placeholder: '50',
      defaultValue: '50',
    },
    {
      name: 'compact',
      label: 'Compact View',
      type: 'toggle',
      defaultValue: 'true',
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
    const raw = inputs.data ?? ''
    let lastEvent = raw

    // Try to normalize to pretty JSON string; fall back to raw on error
    try {
      if (typeof raw === 'string' && raw.trim()) {
        const parsed = JSON.parse(raw)
        lastEvent = JSON.stringify(parsed)
      }
    } catch {
      // Keep raw value if it is not valid JSON
      lastEvent = raw
    }

    return {
      lastEvent,
    }
  },
})

// ─── Uniswap Blocks ─────────────────────────────────────

registerBlock({
  type: 'swapQuote',
  label: 'Swap Quote',
  description: 'Get a token swap quote from Uniswap V3',
  category: 'action',
  service: 'uniswap',
  color: 'rose',
  icon: 'arrowLeftRight',
  inputs: [
    { name: 'fromToken', label: 'From Token', type: 'tokenSelect', defaultValue: 'ETH', allowVariable: true },
    { name: 'toToken', label: 'To Token', type: 'tokenSelect', defaultValue: 'USDC', allowVariable: true },
    { name: 'amount', label: 'Amount', type: 'number', placeholder: '1.0', allowVariable: true },
  ],
  outputs: [
    { name: 'expectedOutput', label: 'You Receive' },
    { name: 'priceImpact', label: 'Price Impact' },
    { name: 'route', label: 'Route Path' },
  ],
  run: async (inputs) => swapQuote(inputs),
})

registerBlock({
  type: 'executeSwap',
  label: 'Execute Swap',
  description: 'Execute a token swap on Uniswap V3',
  category: 'action',
  service: 'uniswap',
  color: 'rose',
  icon: 'zap',
  inputs: [
    { name: 'fromToken', label: 'From Token', type: 'tokenSelect', defaultValue: 'ETH', allowVariable: true },
    { name: 'toToken', label: 'To Token', type: 'tokenSelect', defaultValue: 'USDC', allowVariable: true },
    { name: 'amount', label: 'Amount', type: 'number', placeholder: '1.0', allowVariable: true },
    { name: 'slippage', label: 'Max Slippage (%)', type: 'slider', min: 0.1, max: 50, step: 0.1, defaultValue: '0.5' },
  ],
  outputs: [
    { name: 'txHash', label: 'Transaction Hash' },
    { name: 'amountOut', label: 'Amount Received' },
    { name: 'gasUsed', label: 'Gas Used' },
  ],
  run: async (inputs) => executeSwap(inputs),
})

registerBlock({
  type: 'tokenPrice',
  label: 'Token Price',
  description: 'Get current token price in USD',
  category: 'action',
  service: 'uniswap',
  color: 'rose',
  icon: 'barChart',
  inputs: [
    { name: 'token', label: 'Token', type: 'tokenSelect', defaultValue: 'ETH' },
  ],
  outputs: [
    { name: 'price', label: 'Price (USD)' },
    { name: 'change24h', label: '24h Change (%)' },
  ],
  run: async (inputs) => tokenPrice(inputs),
})

// ─── Price / Alert Blocks ────────────────────────────────

registerBlock({
  type: 'priceAlert',
  label: 'Price Alert',
  description: 'Trigger when token price crosses threshold',
  category: 'trigger',
  service: 'uniswap',
  color: 'rose',
  icon: 'bell',
  inputs: [
    { name: 'token', label: 'Token', type: 'tokenSelect', tokens: ['ETH', 'USDC', 'WBTC', 'ARB', 'OP'], defaultValue: 'ETH' },
    { name: 'condition', label: 'Condition', type: 'select', options: ['above', 'below', 'crosses'], defaultValue: 'above' },
    { name: 'price', label: 'Price (USD)', type: 'number', placeholder: '3500', allowVariable: true },
  ],
  outputs: [
    { name: 'currentPrice', label: 'Current Price' },
    { name: 'triggered', label: 'Triggered' },
  ],
  run: async (inputs) => priceAlert(inputs),
})

// ─── Filter Blocks ───────────────────────────────────────

registerBlock({
  type: 'valueFilter',
  label: 'Value Filter',
  description: 'Filter by transaction value',
  category: 'filter',
  color: 'yellow',
  icon: 'filter',
  inputs: [
    {
      name: 'minValue',
      label: 'Min Value',
      type: 'number',
      placeholder: '0',
      allowVariable: true,
      accepts: ['number', 'string'],
    },
    {
      name: 'maxValue',
      label: 'Max Value',
      type: 'number',
      placeholder: '1000000',
      allowVariable: true,
      accepts: ['number', 'string'],
    },
    { name: 'passThrough', label: 'Pass All Data Through', type: 'toggle', defaultValue: 'true' },
  ],
  outputs: [
    { name: 'passed', label: 'Passed Filter' },
    { name: 'value', label: 'Matched Value' },
  ],
  run: async (inputs) => valueFilter(inputs),
})


registerBlock({
  type: 'delayTimer',
  label: 'Delay Timer',
  description: 'Wait before continuing the flow',
  category: 'filter',
  color: 'yellow',
  icon: 'clock',
  inputs: [
    { name: 'seconds', label: 'Delay (seconds)', type: 'slider', min: 1, max: 300, step: 1, defaultValue: '10' },
  ],
  outputs: [
    { name: 'elapsed', label: 'Time Elapsed' },
  ],
  run: async (inputs) => delayTimer(inputs),
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
  type: 'sendToken',
  label: 'Send Token',
  description: 'Transfer tokens to an address',
  category: 'action',
  color: 'yellow',
  icon: 'send',
  inputs: [
    { name: 'token', label: 'Token', type: 'tokenSelect', defaultValue: 'ETH' },
    { name: 'toAddress', label: 'Recipient', type: 'address', allowVariable: true },
    { name: 'amount', label: 'Amount', type: 'number', placeholder: '0.1', allowVariable: true },
    { name: 'confirmBeforeSend', label: 'Require Confirmation', type: 'toggle', defaultValue: 'true' },
  ],
  outputs: [
    { name: 'txHash', label: 'Transaction Hash' },
    { name: 'gasUsed', label: 'Gas Used' },
  ],
  run: async (inputs) => sendToken(inputs),
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
  run: async (inputs) => manualTrigger(inputs),
})

