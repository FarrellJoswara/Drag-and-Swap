/**
 * Historical blocks — pull past data via HyperCore JSON-RPC.
 * A "block" is a batch of events (trades, orders, etc.) in a time window.
 * Env: VITE_QUICKNODE_HYPERLIQUID_HTTP_URL (HyperCore JSON-RPC path).
 */

import { tradeEventToOutputs } from './streams'
import type { TradeEvent } from './types'

const HTTP_URL =
  (import.meta.env.VITE_QUICKNODE_HYPERLIQUID_HTTP_URL as string | undefined) ?? ''

/** Generic JSON-RPC call to HyperCore. Used for hl_getLatestBlocks, hl_getBlock, hl_getBatchBlocks. */
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

/** Fetch the latest N blocks for a stream (e.g. 'trades', 'orders', 'events'). Each block has block_number, block_time, events[]. */
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

/** Fetch a single block by stream name and block number. */
export async function hlGetBlock(
  stream: string,
  blockNumber: number
): Promise<{ block_number: number; block_time: string; local_time: string; events: unknown[] }> {
  return hlRpc('hl_getBlock', [stream, blockNumber])
}

/**
 * Get recent trades from the last N blocks, optionally filter by coin. Returns JSON string of
 * flattened trades plus tradeCount and lastPrice — shape expected by the Recent Trades block.
 */
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

/**
 * Get recent events from the last N blocks, filter by eventType (or 'all'). Returns JSON string
 * of events plus eventCount and passed ('true'/'false') — for Recent Events block.
 */
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

// ─── Block-facing stubs (RPC-based blocks) ───
// When wired, recentTrades/recentEvents can call fetchRecentTrades/fetchRecentEvents with inputs; for now return empty.

export async function recentTrades(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('recentTrades')
  return { trades: '', tradeCount: '', lastPrice: '' }
}

export async function recentEvents(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('recentEvents')
  return { events: '', eventCount: '', passed: '' }
}

export async function bookSnapshot(_inputs: Record<string, string>): Promise<Record<string, string>> {
  console.log('bookSnapshot')
  return { updates: '', updateCount: '', bestBid: '', bestAsk: '', spread: '' }
}
