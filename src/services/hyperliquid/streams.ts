/**
 * Data Streams — live push only. WebSocket subscribe + event-to-output mappers.
 * Env: VITE_QUICKNODE_HYPERLIQUID_WS_URL (required for subscribe).
 */

import type {
  HyperliquidStreamType,
  HyperliquidFilters,
  HyperliquidStreamMessage,
  TradeEvent,
  OrderEvent,
  BookUpdateEvent,
  TwapEvent,
  WriterActionEvent,
} from './types'
import { debugIngest } from '../../utils/debugIngest'

export type {
  HyperliquidStreamType,
  HyperliquidFilters,
  HyperliquidStreamMessage,
  TradeEvent,
  OrderEvent,
  BookUpdateEvent,
  TwapEvent,
  WriterActionEvent,
} from './types'

const RAW_WS_URL =
  (import.meta.env.VITE_QUICKNODE_HYPERLIQUID_WS_URL as string | undefined) ?? ''

// QuickNode HyperCore WSS requires path /hypercore/ws (see QuickNode Hyperliquid endpoint docs)
function normalizeWsUrl(url: string): string {
  if (!url) return url
  if (url.includes('quiknode.pro') && !url.includes('/hypercore/ws')) {
    const base = url.replace(/\/?$/, '')
    return `${base}/hypercore/ws`
  }
  return url
}

const WS_URL = normalizeWsUrl(RAW_WS_URL)

let wsId = 0

/** Track active subscriptions by ID for unsubscribe functionality */
interface Subscription {
  ws: WebSocket
  streamType: HyperliquidStreamType
  id: number
  unsubscribe: () => void
}

const activeSubscriptions = new Map<number, Subscription>()

/**
 * Subscribe to a Hyperliquid stream (trades, orders, etc.). Server pushes messages;
 * onMessage is called for each data block. Returns an unsubscribe function — call it
 * to send hl_unsubscribe and close the socket.
 * Optional filterName: sent to QuickNode for unsubscribe-by-name and OR logic across named filters.
 */
export function subscribe(
  streamType: HyperliquidStreamType,
  filters: HyperliquidFilters,
  onMessage: (message: HyperliquidStreamMessage) => void,
  filterName?: string
): () => void {
  if (!WS_URL) {
    console.warn('VITE_QUICKNODE_HYPERLIQUID_WS_URL is not set — streaming disabled')
    // Fire one placeholder so downstream (e.g. Output Display) shows a message. Use trade-shaped
    // tuple so normalizeStreamEventToUnifiedOutputs('trades', ...) does not throw.
    const hint =
      'Set VITE_QUICKNODE_HYPERLIQUID_WS_URL in .env.local to enable the Hyperliquid stream. Then save/deploy and run the agent again.'
    try {
      onMessage({
        data: {
          block_number: 0,
          block_time: '',
          local_time: '',
          events: [
            [
              '',
              {
                coin: '',
                px: '',
                sz: '',
                side: '',
                dir: '',
                hash: '',
                fee: '',
                tid: 0,
                closedPnl: '',
                _hint: hint,
              },
            ],
          ],
        },
      })
    } catch (_) {
      // ignore
    }
    return () => {}
  }

  // #region agent log
  debugIngest({
    location: 'streams.ts:subscribe',
    message: 'WS subscribe attempt',
    data: {
      streamType,
      normalizedUrlHasPath: WS_URL.includes('/hypercore/ws'),
      rawUrlHadPath: RAW_WS_URL.includes('/hypercore/ws'),
    },
    timestamp: Date.now(),
    hypothesisId: 'H1',
  })
  // #endregion

  console.log('[Hyperliquid WS] Connecting to stream:', streamType, '| URL path:', WS_URL.includes('/hypercore/ws') ? '/hypercore/ws' : 'custom')
  const ws = new WebSocket(WS_URL)
  const id = ++wsId
  const name = filterName?.trim() || undefined

  const unsubscribeFn = () => {
    try {
      const params = name ? { filterName: name } : { streamType }
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'hl_unsubscribe',
          params,
          id: id + 1000,
        }),
      )
    } catch (error) {
      console.warn('[Hyperliquid WS] error sending unsubscribe', error)
    }
    ws.close()
    activeSubscriptions.delete(id)
  }

  // Store subscription for later unsubscribe by ID
  activeSubscriptions.set(id, {
    ws,
    streamType,
    id,
    unsubscribe: unsubscribeFn,
  })

  ws.onopen = () => {
    console.log('[Hyperliquid WS] Connected, sending hl_subscribe for', streamType)
    // #region agent log
    debugIngest({
      location: 'streams.ts:ws.onopen',
      message: 'Hyperliquid WS connected',
      data: { id, streamType },
      timestamp: Date.now(),
      hypothesisId: 'H1',
    })
    // #endregion
    const params: Record<string, unknown> = {
      streamType,
      ...(Object.keys(filters).length ? { filters } : {}),
      ...(name ? { filterName: name } : {}),
    }
    const payload: Record<string, unknown> = {
      jsonrpc: '2.0',
      method: 'hl_subscribe',
      params,
      id,
    }
    ws.send(JSON.stringify(payload))
  }

  ws.onmessage = (event) => {
    try {
      const raw = JSON.parse(event.data as string) as HyperliquidStreamMessage & { block?: { block_number?: number; block_time?: string; local_time?: string; events?: unknown[] }; type?: string }
      if (raw.error) {
        console.error('[Hyperliquid WS]', raw.error)
        return
      }
      if (raw.result?.subscribed) {
        console.log('[Hyperliquid WS] Subscription confirmed for', streamType)
        return
      }
      // QuickNode may send payload with "block" instead of "data"; normalize to our expected shape
      let msg: HyperliquidStreamMessage = raw
      if (raw.block != null && raw.data == null) {
        const b = raw.block
        msg = {
          ...raw,
          block_number: raw.block_number ?? b.block_number,
          data: {
            block_number: b.block_number ?? 0,
            block_time: b.block_time ?? '',
            local_time: b.local_time ?? '',
            events: Array.isArray(b.events) ? b.events : [],
          },
        }
      }
      const eventCount = msg.data?.events?.length ?? 0
      if (eventCount > 0) console.log('[Hyperliquid WS] Data block:', eventCount, 'event(s)')
      if (msg.data ?? msg.block_number != null) {
        onMessage(msg)
      }
    } catch (e) {
      console.error('[Hyperliquid WS] parse error', e)
    }
  }

  ws.onerror = (e) => {
    // #region agent log
    debugIngest({
      location: 'streams.ts:ws.onerror',
      message: 'Hyperliquid WS error',
      data: { id, streamType, type: (e as Event).type },
      timestamp: Date.now(),
      hypothesisId: 'H1',
    })
    // #endregion
    console.error('[Hyperliquid WS] error', e)
  }
  ws.onclose = (ev) => {
    console.log('[Hyperliquid WS] Closed:', ev.code, ev.reason || '(no reason)')
    // #region agent log
    debugIngest({
      location: 'streams.ts:ws.onclose',
      message: 'Hyperliquid WS closed',
      data: { id, streamType, code: ev.code, reason: ev.reason },
      timestamp: Date.now(),
      hypothesisId: 'H1',
    })
    // #endregion
    // Clean up subscription when socket closes
    activeSubscriptions.delete(id)
  }

  return unsubscribeFn
}

/**
 * Unsubscribe from a Hyperliquid stream by subscription ID.
 * Returns true if unsubscribed successfully, false if subscription not found.
 */
export function unsubscribe(subscriptionId: number): boolean {
  const subscription = activeSubscriptions.get(subscriptionId)
  if (!subscription) {
    console.warn(`[Hyperliquid WS] Subscription ${subscriptionId} not found`)
    return false
  }
  subscription.unsubscribe()
  return true
}

/**
 * Unsubscribe from all active subscriptions matching a stream type.
 * Returns the number of subscriptions unsubscribed.
 */
export function unsubscribeByStreamType(streamType: HyperliquidStreamType): number {
  let count = 0
  for (const sub of activeSubscriptions.values()) {
    if (sub.streamType === streamType) {
      sub.unsubscribe()
      count++
    }
  }
  return count
}

/**
 * Unsubscribe from all active subscriptions.
 * Returns the number of subscriptions unsubscribed.
 */
export function unsubscribeAll(): number {
  const count = activeSubscriptions.size
  for (const sub of activeSubscriptions.values()) {
    sub.unsubscribe()
  }
  return count
}

/**
 * Get all active subscription IDs.
 */
export function getActiveSubscriptionIds(): number[] {
  return Array.from(activeSubscriptions.keys())
}

/** Flatten a trade event into string key-value pairs for block outputs (coin, price, size, side, user, hash, etc.). */
export function tradeEventToOutputs([user, data]: TradeEvent): Record<string, string> {
  return {
    user,
    coin: data.coin ?? '',
    price: data.px ?? '',
    size: data.sz ?? '',
    side: data.side ?? '',
    direction: data.dir ?? '',
    hash: data.hash ?? '',
    fee: data.fee ?? '',
    tradeId: String(data.tid ?? ''),
    closedPnl: data.closedPnl ?? '',
    liquidatedUser: data.liquidation?.liquidatedUser ?? '',
    markPrice: data.liquidation?.markPx ?? '',
    method: data.liquidation?.method ?? '',
  }
}

/** Flatten an order event for block outputs (user, coin, side, status, limitPrice, size, orderId, hash). */
export function orderEventToOutputs(e: OrderEvent): Record<string, string> {
  return {
    user: e.user ?? '',
    coin: e.order?.coin ?? '',
    side: e.order?.side ?? '',
    status: e.status ?? '',
    limitPrice: e.order?.limitPx ?? '',
    size: e.order?.sz ?? '',
    origSize: e.order?.origSz ?? '',
    orderType: e.order?.orderType ?? '',
    orderId: String(e.order?.oid ?? ''),
    hash: e.hash ?? '',
  }
}

/** raw_book_diff: 'remove' means level was removed; otherwise { new: { sz } } is the new size at that price. */
export function bookUpdateEventToOutputs(e: BookUpdateEvent): Record<string, string> {
  const action = e.raw_book_diff === 'remove' ? 'remove' : 'new'
  const size = e.raw_book_diff === 'remove' ? '0' : (e.raw_book_diff as { new: { sz: string } }).new.sz
  return {
    coin: e.coin ?? '',
    side: e.side ?? '',
    price: e.px ?? '',
    size,
    action,
    user: e.user ?? '',
    orderId: String(e.oid ?? ''),
  }
}

/** TWAP progress: executedSz/sz gives progress %; outputs include totalSize, executedSize, status, progress. */
export function twapEventToOutputs(e: TwapEvent): Record<string, string> {
  const s = e.state
  const progress = s?.sz && parseFloat(s.sz) > 0
    ? ((parseFloat(s.executedSz) / parseFloat(s.sz)) * 100).toFixed(2)
    : '0'
  return {
    twapId: String(e.twap_id ?? ''),
    coin: s?.coin ?? '',
    user: s?.user ?? '',
    side: s?.side ?? '',
    totalSize: s?.sz ?? '',
    executedSize: s?.executedSz ?? '',
    executedNotional: s?.executedNtl ?? '',
    minutes: String(s?.minutes ?? ''),
    status: e.status ?? '',
    progress: `${progress}%`,
  }
}

/** Writer action (bridge/transfer): user, destination, tokenId, amount, actionType, evmTxHash, nonce. */
export function writerActionEventToOutputs(event: WriterActionEvent): Record<string, string> {
  const [, payload] = event
  const a = payload?.action
  return {
    user: payload?.user ?? '',
    destination: a?.destination ?? '',
    tokenId: String(a?.token ?? ''),
    amount: a?.wei ?? '',
    actionType: a?.type ?? '',
    evmTxHash: payload?.evm_tx_hash ?? '',
    nonce: String(payload?.nonce ?? ''),
  }
}

/**
 * Unified normalization function that converts any stream type event to unified outputs.
 * Returns streamlined outputs optimized for the connection system.
 */
export function normalizeStreamEventToUnifiedOutputs(
  streamType: HyperliquidStreamType,
  event: unknown,
  rawMessage?: HyperliquidStreamMessage
): Record<string, string> {
  const outputs: Record<string, string> = {
    streamType,
    data: '',
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

  // Parse the raw event data into JSON string
  try {
    outputs.data = JSON.stringify(event)
  } catch {
    outputs.data = ''
  }

  // Extract timestamp from raw message if available
  if (rawMessage?.data?.block_time) {
    outputs.timestamp = rawMessage.data.block_time
  }

  // Normalize based on stream type
  switch (streamType) {
    case 'trades': {
      const trade = tradeEventToOutputs(event as TradeEvent)
      outputs.user = trade.user ?? ''
      outputs.coin = trade.coin ?? ''
      outputs.hash = trade.hash ?? ''
      outputs.price = trade.price ?? '0'
      outputs.size = trade.size ?? '0'
      outputs.side = trade.side ?? ''
      break
    }
    case 'orders': {
      const order = orderEventToOutputs(event as OrderEvent)
      outputs.user = order.user ?? ''
      outputs.coin = order.coin ?? ''
      outputs.hash = order.hash ?? ''
      outputs.price = order.limitPrice ?? '0'
      outputs.size = order.size ?? '0'
      outputs.status = order.status ?? ''
      outputs.side = order.side ?? ''
      break
    }
    case 'book_updates': {
      const book = bookUpdateEventToOutputs(event as BookUpdateEvent)
      outputs.coin = book.coin ?? ''
      outputs.side = book.side ?? ''
      outputs.price = book.price ?? '0'
      outputs.size = book.size ?? '0'
      outputs.user = book.user ?? ''
      break
    }
    case 'twap': {
      const twap = twapEventToOutputs(event as TwapEvent)
      outputs.user = twap.user ?? ''
      outputs.coin = twap.coin ?? ''
      outputs.side = twap.side ?? ''
      outputs.size = twap.executedSize ?? '0'
      outputs.amount = twap.executedNotional ?? '0'
      outputs.status = twap.status ?? ''
      break
    }
    case 'writer_actions': {
      const writer = writerActionEventToOutputs(event as WriterActionEvent)
      outputs.user = writer.user ?? ''
      outputs.hash = writer.evmTxHash ?? ''
      outputs.amount = writer.amount ?? '0'
      break
    }
    case 'events': {
      // Events stream has nested inner types
      type EventsStreamPayload = {
        inner?: {
          LedgerUpdate?: {
            delta?: { user?: string; coin?: string; amount?: string; usdc?: string; usd?: string; type?: string }
            users?: [string, string?]
          }
          CDeposit?: { user?: string; amount?: string }
          CWithdrawal?: { user?: string; amount?: string }
          Delegation?: { user?: string; amount?: string }
        }
        hash?: string
        time?: string
      }

      const ev = event as EventsStreamPayload
      const inner = ev.inner
      if (inner?.LedgerUpdate) {
        const lu = inner.LedgerUpdate
        const delta = lu.delta ?? {}
        outputs.user = (lu.users?.[0] ?? delta.user ?? '') as string
        outputs.coin = (delta.coin ?? '') as string
        outputs.amount = (delta.amount ?? delta.usdc ?? delta.usd ?? '') as string
        outputs.status = (delta.type ?? '') as string
      }
      if (inner?.CDeposit) {
        outputs.user = inner.CDeposit.user ?? ''
        outputs.amount = inner.CDeposit.amount ?? ''
        outputs.status = 'CDeposit'
      }
      if (inner?.CWithdrawal) {
        outputs.user = inner.CWithdrawal.user ?? ''
        outputs.amount = inner.CWithdrawal.amount ?? ''
        outputs.status = 'CWithdrawal'
      }
      if (inner?.Delegation) {
        outputs.user = inner.Delegation.user ?? ''
        outputs.amount = inner.Delegation.amount ?? ''
        outputs.status = 'Delegation'
      }
      if (ev?.hash) outputs.hash = ev.hash
      if (ev?.time) outputs.timestamp = ev.time
      break
    }
  }

  return outputs
}
