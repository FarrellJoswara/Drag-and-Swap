/**
 * Hyperliquid Data Streams — QuickNode API
 * Service layer: HTTP JSON-RPC (historical/on-demand) + WebSocket (real-time subscriptions).
 *
 * Env: VITE_QUICKNODE_HYPERLIQUID_HTTP_URL (required for RPC)
 *      VITE_QUICKNODE_HYPERLIQUID_WS_URL (required for streaming triggers)
 */

const HTTP_URL =
  (import.meta.env.VITE_QUICKNODE_HYPERLIQUID_HTTP_URL as string | undefined) ?? ''
const WS_URL =
  (import.meta.env.VITE_QUICKNODE_HYPERLIQUID_WS_URL as string | undefined) ?? ''

export type HyperliquidStreamType =
  | 'trades'
  | 'orders'
  | 'book_updates'
  | 'twap'
  | 'events'
  | 'writer_actions'

export type HyperliquidFilters = Record<string, string[]>

/** Stream message envelope from QuickNode (WebSocket) */
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

/** Single trade event: [userAddress, fillData] */
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

/** Order event */
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

/** Book update event */
export interface BookUpdateEvent {
  user: string
  oid: number
  coin: string
  side: string
  px: string
  raw_book_diff: 'remove' | { new: { sz: string } }
}

/** TWAP event */
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

/** Writer action event: [userKey, payload] */
export type WriterActionEvent = [
  string,
  {
    user: string
    nonce: number
    evm_tx_hash: string
    action: { type: string; destination: string; token: number; wei: string }
  }
]

// ─── HTTP JSON-RPC ────────────────────────────────────────

/**
 * Call Hyperliquid JSON-RPC (historical / on-demand).
 * Methods: hl_getLatestBlocks, hl_getBlock, hl_getBatchBlocks
 */
export async function hlRpc<T = unknown>(
  method: string,
  params: Record<string, unknown> | unknown[]
): Promise<T> {
  if (!HTTP_URL) throw new Error('VITE_QUICKNODE_HYPERLIQUID_HTTP_URL is not set in .env.local')

  const res = await fetch(HTTP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: Array.isArray(params) ? params : params,
    }),
  })

  const json = await res.json()
  if (json.error) throw new Error(json.error.message ?? String(json.error))
  return json.result as T
}

/** Get latest blocks for a stream (e.g. trades, orders, events). */
export async function hlGetLatestBlocks(
  stream: string,
  count: number
): Promise<{ block_number: number; block_time: string; local_time: string; events: unknown[] }[]> {
  const blocks = await hlRpc<{ block_number: number; block_time: string; local_time: string; events: unknown[] }[]>(
    'hl_getLatestBlocks',
    { stream, count }
  )
  return blocks ?? []
}

/** Get a single block by stream and block number. */
export async function hlGetBlock(
  stream: string,
  blockNumber: number
): Promise<{ block_number: number; block_time: string; local_time: string; events: unknown[] }> {
  return hlRpc('hl_getBlock', [stream, blockNumber])
}

// ─── WebSocket subscription ──────────────────────────────

let wsId = 0

/**
 * Subscribe to a Hyperliquid stream via WebSocket.
 * Returns an unsubscribe function (closes socket and stops forwarding).
 */
export function subscribe(
  streamType: HyperliquidStreamType,
  filters: HyperliquidFilters,
  onMessage: (message: HyperliquidStreamMessage) => void
): () => void {
  if (!WS_URL) {
    console.warn('VITE_QUICKNODE_HYPERLIQUID_WS_URL is not set — streaming disabled')
    return () => {}
  }

  const ws = new WebSocket(WS_URL)
  const id = ++wsId

  ws.onopen = () => {
    const payload: Record<string, unknown> = {
      jsonrpc: '2.0',
      method: 'hl_subscribe',
      params: {
        streamType,
        ...(Object.keys(filters).length ? { filters } : {}),
      },
      id,
    }
    ws.send(JSON.stringify(payload))
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as HyperliquidStreamMessage
      if (msg.error) {
        console.error('[Hyperliquid WS]', msg.error)
        return
      }
      if (msg.result?.subscribed) return // subscription confirmation
      if (msg.data ?? msg.block_number != null) onMessage(msg)
    } catch (e) {
      console.error('[Hyperliquid WS] parse error', e)
    }
  }

  ws.onerror = (e) => console.error('[Hyperliquid WS] error', e)
  ws.onclose = () => {}

  return () => {
    try {
      ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'hl_unsubscribe', params: { streamType }, id: id + 1000 }))
    } catch {}
    ws.close()
  }
}

// ─── Helpers for block outputs ────────────────────────────

/** Map trade event tuple to flat outputs for blocks. */
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

/** Map order event to flat outputs. */
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

/** Map book update event to flat outputs. */
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

/** Map TWAP event to flat outputs. */
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

/** Map writer action event to flat outputs. */
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

// ─── On-demand RPC helpers for filter blocks ──────────────

/** Fetch recent trade blocks and return flattened trade list (for Recent Trades filter block). */
export async function fetchRecentTrades(
  coin: string,
  count: number
): Promise<{ trades: string; tradeCount: string; lastPrice: string }> {
  const blocks = await hlGetLatestBlocks('trades', count)
  const all: TradeEvent[] = []
  let lastPx = ''
  for (const b of blocks) {
    const events = (b.events ?? []) as TradeEvent[]
    for (const ev of events) {
      const data = ev?.[1]
      if (data && (!coin || data.coin === coin)) {
        all.push(ev)
        lastPx = data.px ?? lastPx
      }
    }
  }
  const trades = all.map((e) => tradeEventToOutputs(e))
  return {
    trades: JSON.stringify(trades),
    tradeCount: String(all.length),
    lastPrice: lastPx,
  }
}

/** Fetch recent event blocks and return count + JSON (for Recent Events filter block). */
export async function fetchRecentEvents(
  eventType: string,
  count: number
): Promise<{ events: string; eventCount: string; passed: string }> {
  const blocks = await hlGetLatestBlocks('events', count)
  const out: unknown[] = []
  for (const b of blocks) {
    const events = (b.events ?? []) as any[]
    for (const ev of events) {
      const type =
        ev?.inner?.LedgerUpdate?.delta?.type ??
        (ev?.inner?.CDeposit ? 'CDeposit' : ev?.inner?.CWithdrawal ? 'CWithdrawal' : '')
      if (eventType === 'all' || type === eventType) out.push(ev)
    }
  }
  return {
    events: JSON.stringify(out),
    eventCount: String(out.length),
    passed: out.length > 0 ? 'true' : 'false',
  }
}

// ─── Block-specific functions (stub: console.log + return outputs) ───

export async function tradeAlert(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('tradeAlert')
  return { coin: '', price: '', size: '', side: '', direction: '', user: '', hash: '', fee: '', tradeId: '' }
}

export async function liquidationWatcher(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('liquidationWatcher')
  return { coin: '', price: '', size: '', side: '', liquidatedUser: '', markPrice: '', method: '', closedPnl: '' }
}

export async function whaleTrade(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('whaleTrade')
  return { coin: '', price: '', size: '', side: '', user: '', direction: '', hash: '' }
}

export async function recentTrades(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('recentTrades')
  return { trades: '', tradeCount: '', lastPrice: '' }
}

export async function orderFillAlert(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('orderFillAlert')
  return {
    user: '',
    coin: '',
    side: '',
    status: '',
    limitPrice: '',
    size: '',
    origSize: '',
    orderType: '',
    orderId: '',
    hash: '',
  }
}

export async function orderRejectionMonitor(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('orderRejectionMonitor')
  return { user: '', coin: '', status: '', side: '', size: '', limitPrice: '' }
}

export async function bookUpdateMonitor(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('bookUpdateMonitor')
  return { coin: '', side: '', price: '', size: '', action: '', user: '', orderId: '' }
}

export async function bookSnapshot(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('bookSnapshot')
  return { updates: '', updateCount: '', bestBid: '', bestAsk: '', spread: '' }
}

export async function twapStatusAlert(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('twapStatusAlert')
  return {
    twapId: '',
    coin: '',
    user: '',
    side: '',
    totalSize: '',
    executedSize: '',
    executedNotional: '',
    minutes: '',
    status: '',
    progress: '',
  }
}

export async function depositMonitor(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('depositMonitor')
  return { user: '', amount: '', hash: '', timestamp: '' }
}

export async function withdrawalMonitor(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('withdrawalMonitor')
  return { user: '', amount: '', fee: '', hash: '' }
}

export async function transferMonitor(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('transferMonitor')
  return { type: '', user: '', destination: '', token: '', amount: '', usdcValue: '', hash: '' }
}

export async function vaultActivityMonitor(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('vaultActivityMonitor')
  return { type: '', vault: '', user: '', amount: '', commission: '', hash: '' }
}

export async function fundingPayment(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('fundingPayment')
  return { user: '', data: '', hash: '' }
}

export async function crossChainMonitor(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('crossChainMonitor')
  return { user: '', amount: '', direction: '', isFinalized: '', hash: '' }
}

export async function delegationMonitor(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('delegationMonitor')
  return { user: '', validator: '', amount: '', isUndelegate: '', hash: '' }
}

export async function recentEvents(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('recentEvents')
  return { events: '', eventCount: '', passed: '' }
}

export async function systemTransferMonitor(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('systemTransferMonitor')
  return {
    user: '',
    destination: '',
    tokenId: '',
    amount: '',
    actionType: '',
    evmTxHash: '',
    nonce: '',
  }
}
