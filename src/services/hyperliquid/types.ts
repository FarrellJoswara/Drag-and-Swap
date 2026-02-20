/**
 * Shared types for Hyperliquid HyperCore (streams, events, filters).
 * No env, no fetch, no WebSocket — types only.
 */

/** Which real-time stream to subscribe to (e.g. trades, orders, book changes). */
export type HyperliquidStreamType =
  | 'trades'
  | 'orders'
  | 'book_updates'
  | 'twap'
  | 'events'
  | 'writer_actions'

/** Filters sent with subscription: e.g. { coin: ['BTC'], side: ['B'] }. Key = filter name, value = list of allowed values. */
export type HyperliquidFilters = Record<string, string[]>

/**
 * WebSocket message from QuickNode: either a subscription confirmation (result.subscribed)
 * or a data block (data with block_number, block_time, events).
 */
export interface HyperliquidStreamMessage {
  stream?: string
  block_number?: number
  data?: {
    block_number: number
    block_time: string
    local_time: string
    events: unknown[]
  }
  result?: { subscribed?: string[] }
  error?: { code: number; message: string }
}

/** Trade event from stream: [userAddress, fillData]. Fired when a trade executes. */
export type TradeEvent = [string, {
  coin: string
  px: string
  sz: string
  side: string
  dir?: string
  hash?: string
  fee?: string
  tid?: number
  closedPnl?: string
  liquidation?: { liquidatedUser: string; markPx: string; method: string }
}]

/** Order event: new/cancel/fill/reject. Used for order and fill alerts. */
export interface OrderEvent {
  user: string
  hash: string | null
  status: string
  order: {
    coin: string
    side: string
    limitPx: string
    sz: string
    origSz: string
    oid: number
    orderType: string
  }
}

/**
 * Order book level change: add/remove/update. raw_book_diff is either 'remove'
 * or { new: { sz } } for the new size at that price level.
 */
export interface BookUpdateEvent {
  user: string
  oid: number
  coin: string
  side: string
  px: string
  raw_book_diff: 'remove' | { new: { sz: string } }
}

/** TWAP order progress update (executed size, notional, status). */
export interface TwapEvent {
  time: string
  twap_id: number
  state: {
    coin: string
    user: string
    side: string
    sz: string
    executedSz: string
    executedNtl: string
    minutes: number
  }
  status: string
}

/** Cross-chain or system writer action (e.g. bridge, transfer). [userKey, payload]. */
export type WriterActionEvent = [
  string,
  {
    user: string
    nonce: number
    evm_tx_hash: string
    action: { type: string; destination: string; token: number; wei: string }
  }
]
