/**
 * Single entry point for all Hyperliquid HyperCore access (Info, Data Streams, Historical RPC).
 * Import from '../services/hyperliquid' only; do not import from ./streams or ./rpc directly in app code.
 */

// Export all types (both type aliases and interfaces)
export type {
  HyperliquidStreamType,
  HyperliquidFilters,
  HyperliquidStreamMessage,
  TradeEvent,
  OrderEvent,
  BookUpdateEvent,
  TwapEvent,
  WriterActionEvent,
  UnifiedFilterSpec,
} from './types'
export { FILTER_LIMITS } from './types'
export {
  buildFiltersFromSpec,
  validateFilterLimits,
  parseCommaSeparated,
} from './filters'

// Export all Info API functions
export * from './info'

// Export streams functions
export {
  subscribe,
  tradeEventToOutputs,
  orderEventToOutputs,
  bookUpdateEventToOutputs,
  twapEventToOutputs,
  writerActionEventToOutputs,
  normalizeStreamEventToUnifiedOutputs,
} from './streams'

// Export RPC functions
export {
  hlRpc,
  hlGetLatestBlocks,
  hlGetBlock,
  fetchRecentTrades,
  fetchRecentEvents,
  recentTrades,
  recentEvents,
  bookSnapshot,
} from './rpc'
