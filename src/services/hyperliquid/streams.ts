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

const WS_URL =
  (import.meta.env.VITE_QUICKNODE_HYPERLIQUID_WS_URL as string | undefined) ?? ''

let wsId = 0

/**
 * Subscribe to a Hyperliquid stream (trades, orders, etc.). Server pushes messages;
 * onMessage is called for each data block. Returns an unsubscribe function — call it
 * to send hl_unsubscribe and close the socket.
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
      if (msg.result?.subscribed) return
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

// ─── Block-facing stubs (stream triggers) ───
// Real data is injected by useHyperstreamSockets when the flow runs; run() here just returns empty outputs.

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

export async function orderFillAlert(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('orderFillAlert')
  return {
    user: '', coin: '', side: '', status: '', limitPrice: '', size: '', origSize: '', orderType: '', orderId: '', hash: '',
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

export async function twapStatusAlert(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('twapStatusAlert')
  return {
    twapId: '', coin: '', user: '', side: '', totalSize: '', executedSize: '', executedNotional: '', minutes: '', status: '', progress: '',
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

export async function systemTransferMonitor(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('systemTransferMonitor')
  return {
    user: '', destination: '', tokenId: '', amount: '', actionType: '', evmTxHash: '', nonce: '',
  }
}
