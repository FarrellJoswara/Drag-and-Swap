/**
 * Info API — one request, one response. Current state (prices, book, user, vault, etc.).
 * Uses VITE_QUICKNODE_HYPERLIQUID_INFO_URL if set; otherwise falls back to public api.hyperliquid.xyz/info.
 */

const INFO_URL =
  (import.meta.env.VITE_QUICKNODE_HYPERLIQUID_INFO_URL as string | undefined) ??
  'https://api.hyperliquid.xyz/info'

/** Send a single POST to the Info endpoint. Body is { type: method, ...params }. Returns parsed JSON. */
export async function infoRequest<T = unknown>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const body = { type: method, ...params }
  const res = await fetch(INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.message ?? `Info API ${method} failed`)
  return json as T
}

/** Mid price for every coin. If the book is empty, last trade price is used. Returns e.g. { BTC: "43250.5", ETH: "2345.75" }. */
export async function getAllMids(dex = ''): Promise<Record<string, string>> {
  return infoRequest<Record<string, string>>('allMids', dex ? { dex } : {})
}

/** L2 order book snapshot for one coin. coin = perp symbol (e.g. BTC) or spot e.g. @107. Optional nSigFigs, nLevels. */
export async function getL2Book(coin: string, nSigFigs?: number, nLevels?: number): Promise<unknown> {
  const params: Record<string, unknown> = { coin }
  if (nSigFigs != null) params.nSigFigs = nSigFigs
  if (nLevels != null) params.nLevels = nLevels
  return infoRequest('l2Book', params)
}

/** Open orders for an address (42-char hex). Returns array of { coin, limitPx, oid, side, sz, timestamp, ... }. */
export async function getOpenOrders(user: string, dex = ''): Promise<unknown[]> {
  return infoRequest<unknown[]>('openOrders', { user, ...(dex ? { dex } : {}) })
}

/** Open orders with extra frontend fields (orderType, reduceOnly, triggerPx, etc.). */
export async function getFrontendOpenOrders(user: string, dex = ''): Promise<unknown[]> {
  return infoRequest<unknown[]>('frontendOpenOrders', { user, ...(dex ? { dex } : {}) })
}

/** User's clearinghouse state: positions, margin, balance. user = 42-char hex address. */
export async function getClearinghouseState(user: string): Promise<unknown> {
  return infoRequest('clearinghouseState', { user })
}

/** User's fills (recent). Optional aggregateByTime to merge partial fills. */
export async function getUserFills(user: string, aggregateByTime?: boolean): Promise<unknown[]> {
  return infoRequest<unknown[]>('userFills', { user, ...(aggregateByTime != null ? { aggregateByTime } : {}) })
}

/** Order status by order id (oid) or client order id (cloid). */
export async function getOrderStatus(oid?: number, cloid?: string): Promise<unknown> {
  if (oid != null) return infoRequest('orderStatus', { oid })
  if (cloid != null) return infoRequest('orderStatus', { cloid })
  throw new Error('getOrderStatus requires oid or cloid')
}

/** Historical orders for a user (time range). Pagination: max 500 per call; use startTime from last result for next page. */
export async function getHistoricalOrders(user: string, startTime: number, endTime?: number): Promise<unknown[]> {
  return infoRequest<unknown[]>('historicalOrders', { user, startTime, ...(endTime != null ? { endTime } : {}) })
}

/** Candle snapshot (OHLCV) for a coin. interval = 1m, 4h, etc.; startTime, endTime in ms. */
export async function getCandleSnapshot(coin: string, interval: string, startTime: number, endTime?: number): Promise<unknown[]> {
  return infoRequest<unknown[]>('candleSnapshot', { coin, interval, startTime, ...(endTime != null ? { endTime } : {}) })
}

/** Exchange metadata: list of perp/spot assets, names, indices. Use for coin lists and asset ids. */
export async function getMeta(): Promise<unknown> {
  return infoRequest('meta')
}

/** User's portfolio summary (equity, margin, etc.). */
export async function getPortfolio(user: string): Promise<unknown> {
  return infoRequest('portfolio', { user })
}

/** User's subaccounts. */
export async function getSubAccounts(user: string): Promise<unknown[]> {
  return infoRequest<unknown[]>('subAccounts', { user })
}

/** Vault details (by vault address or id). */
export async function getVaultDetails(vault: string): Promise<unknown> {
  return infoRequest('vaultDetails', { vault })
}

/** User's vault positions/equity. */
export async function getUserVaultEquities(user: string): Promise<unknown> {
  return infoRequest('userVaultEquities', { user })
}
