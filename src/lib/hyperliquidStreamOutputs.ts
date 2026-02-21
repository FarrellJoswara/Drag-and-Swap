/**
 * Output fields per Hyperliquid stream type.
 * Aligned with QuickNode Hyperliquid Data Streams and normalizeStreamEventToUnifiedOutputs():
 * https://www.quicknode.com/docs/hyperliquid/datasets
 */

import type { OutputField } from './blockRegistry'

const O = (name: string, label: string, type?: OutputField['type']): OutputField =>
  type ? { name, label, type } : { name, label }

/** Outputs per stream type: only fields actually populated by normalizeStreamEventToUnifiedOutputs. */
const OUTPUTS_BY_STREAM_TYPE: Record<string, OutputField[]> = {
  // TRADES: All executed trades with price, size, and direction (QuickNode)
  trades: [
    O('streamType', 'Stream Type', 'string'),
    O('data', 'Event Data (JSON)', 'json'),
    O('user', 'User Address', 'address'),
    O('coin', 'Coin', 'string'),
    O('hash', 'Tx Hash', 'string'),
    O('timestamp', 'Timestamp', 'string'),
    O('price', 'Price', 'number'),
    O('size', 'Size', 'number'),
    O('side', 'Side', 'string'),
  ],
  // ORDERS: Order lifecycle events, 18+ status types (QuickNode)
  orders: [
    O('streamType', 'Stream Type', 'string'),
    O('data', 'Event Data (JSON)', 'json'),
    O('user', 'User Address', 'address'),
    O('coin', 'Coin', 'string'),
    O('hash', 'Tx Hash', 'string'),
    O('timestamp', 'Timestamp', 'string'),
    O('price', 'Limit Price', 'number'),
    O('size', 'Size', 'number'),
    O('status', 'Status', 'string'),
    O('side', 'Side', 'string'),
  ],
  // BOOK_UPDATES: Order book changes with bid/ask prices and quantities (QuickNode)
  book_updates: [
    O('streamType', 'Stream Type', 'string'),
    O('data', 'Event Data (JSON)', 'json'),
    O('coin', 'Coin', 'string'),
    O('side', 'Side', 'string'),
    O('price', 'Price', 'number'),
    O('size', 'Size', 'number'),
    O('user', 'User Address', 'address'),
    O('timestamp', 'Timestamp', 'string'),
  ],
  // TWAP: TWAP execution data and algorithm progress (QuickNode)
  twap: [
    O('streamType', 'Stream Type', 'string'),
    O('data', 'Event Data (JSON)', 'json'),
    O('user', 'User Address', 'address'),
    O('coin', 'Coin', 'string'),
    O('side', 'Side', 'string'),
    O('size', 'Executed Size', 'number'),
    O('amount', 'Executed Notional', 'number'),
    O('status', 'Status', 'string'),
    O('timestamp', 'Timestamp', 'string'),
  ],
  // EVENTS: Balance changes, transfers, deposits, withdrawals, vault operations (QuickNode)
  events: [
    O('streamType', 'Stream Type', 'string'),
    O('data', 'Event Data (JSON)', 'json'),
    O('user', 'User Address', 'address'),
    O('coin', 'Coin', 'string'),
    O('amount', 'Amount', 'string'),
    O('status', 'Status / Type', 'string'),
    O('hash', 'Tx Hash', 'string'),
    O('timestamp', 'Timestamp', 'string'),
  ],
  // WRITER_ACTIONS: HyperCore ↔ HyperEVM asset transfers and bridge data (QuickNode)
  writer_actions: [
    O('streamType', 'Stream Type', 'string'),
    O('data', 'Event Data (JSON)', 'json'),
    O('user', 'User Address', 'address'),
    O('hash', 'EVM Tx Hash', 'string'),
    O('amount', 'Amount', 'string'),
  ],
}

/**
 * Returns output fields for the given stream type. Defaults to trades if unknown.
 */
export function getHyperliquidStreamOutputs(streamType: string): OutputField[] {
  const normalized = String(streamType || 'trades').trim().toLowerCase()
  return (
    OUTPUTS_BY_STREAM_TYPE[normalized] ??
    OUTPUTS_BY_STREAM_TYPE['trades']
  )
}
