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
import { getEthBalance, getGasPrice, getTransactionCount } from '../services/quicknode'
import { getSwapQuote, executeSwap, getTokenPrice } from '../services/uniswap'
import { saveKeyValue } from '../services/supabase'
import { fetchRecentTrades, fetchRecentEvents, hlGetLatestBlocks } from '../services/hyperliquid'
import { sendWebhook, timeLoopRun } from '../services/general'

/** Placeholder run for streaming triggers — use useHyperstreamSockets when running the flow. */
const STREAMING_TRIGGER_MSG = 'Streaming trigger — start flow with useHyperstreamSockets to receive events.'

// ─── QuickNode Blocks ────────────────────────────────────

registerBlock({
  type: 'watchWallet',
  label: 'Whale Watcher',
  description: 'Monitor large wallet activity',
  category: 'trigger',
  color: 'violet',
  icon: 'eye',
  inputs: [
    { name: 'walletAddress', label: 'Wallet Address', type: 'address', allowVariable: true },
    { name: 'threshold', label: 'Min Value (USD)', type: 'slider', min: 1000, max: 500000, step: 1000, defaultValue: '50000' },
  ],
  outputs: [
    { name: 'txHash', label: 'Transaction Hash' },
    { name: 'value', label: 'Value (USD)' },
    { name: 'from', label: 'Sender Address' },
    { name: 'to', label: 'Receiver Address' },
  ],
  run: async (inputs) => {
    const balance = await getEthBalance(inputs.walletAddress)
    return { txHash: '', value: balance, from: inputs.walletAddress, to: '' }
  },
})

registerBlock({
  type: 'ethBalance',
  label: 'ETH Balance',
  description: 'Check ETH balance of a wallet',
  category: 'trigger',
  color: 'violet',
  icon: 'wallet',
  inputs: [
    { name: 'walletAddress', label: 'Wallet Address', type: 'address', allowVariable: true },
  ],
  outputs: [
    { name: 'balance', label: 'Balance (ETH)' },
    { name: 'balanceUsd', label: 'Balance (USD)' },
  ],
  run: async (inputs) => {
    const balance = await getEthBalance(inputs.walletAddress)
    return { balance, balanceUsd: '' }
  },
})

registerBlock({
  type: 'txHistory',
  label: 'TX History',
  description: 'Get recent transactions for a wallet',
  category: 'trigger',
  color: 'violet',
  icon: 'clock',
  inputs: [
    { name: 'walletAddress', label: 'Wallet Address', type: 'address', allowVariable: true },
    { name: 'limit', label: 'Max Results', type: 'number', placeholder: '10', defaultValue: '10', min: 1, max: 100 },
  ],
  outputs: [
    { name: 'transactions', label: 'Transaction List' },
    { name: 'count', label: 'Transaction Count' },
  ],
  run: async (inputs) => {
    const count = await getTransactionCount(inputs.walletAddress)
    return { transactions: '[]', count }
  },
})

// ─── Hyperliquid Blocks (QuickNode Data Streams) ───────────
// Streaming triggers: run() returns placeholder; use useHyperstreamSockets to drive flows.

registerBlock({
  type: 'tradeAlert',
  label: 'Trade Alert',
  description: 'Trigger when a trade executes (Hyperliquid). Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  color: 'violet',
  icon: 'activity',
  inputs: [
    { name: 'coin', label: 'Coin', type: 'tokenSelect', tokens: ['BTC', 'ETH', 'SOL', 'HYPE', 'ARB', 'OP', 'DOGE', 'AVAX', 'LINK', 'MATIC'], defaultValue: 'BTC', allowVariable: true },
    { name: 'side', label: 'Side', type: 'select', options: ['B', 'A', 'Both'], defaultValue: 'Both' },
    { name: 'user', label: 'User Address (optional)', type: 'address', placeholder: '0x...', allowVariable: true },
  ],
  outputs: [
    { name: 'coin', label: 'Coin' },
    { name: 'price', label: 'Price' },
    { name: 'size', label: 'Size' },
    { name: 'side', label: 'Side' },
    { name: 'direction', label: 'Direction' },
    { name: 'user', label: 'User' },
    { name: 'hash', label: 'Tx Hash' },
    { name: 'fee', label: 'Fee' },
    { name: 'tradeId', label: 'Trade ID' },
  ],
  run: async () => ({
    coin: '', price: '', size: '', side: '', direction: '', user: '', hash: '', fee: '', tradeId: STREAMING_TRIGGER_MSG,
  }),
})

registerBlock({
  type: 'liquidationWatcher',
  label: 'Liquidation Watcher',
  description: 'Trigger when a liquidation occurs (Hyperliquid). Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  color: 'rose',
  icon: 'zap',
  inputs: [
    { name: 'coin', label: 'Coin (optional)', type: 'tokenSelect', tokens: ['BTC', 'ETH', 'SOL', 'CRV', 'HYPE'], allowVariable: true },
  ],
  outputs: [
    { name: 'coin', label: 'Coin' },
    { name: 'price', label: 'Price' },
    { name: 'size', label: 'Size' },
    { name: 'side', label: 'Side' },
    { name: 'liquidatedUser', label: 'Liquidated User' },
    { name: 'markPrice', label: 'Mark Price' },
    { name: 'method', label: 'Method' },
    { name: 'closedPnl', label: 'Closed PnL' },
  ],
  run: async () => ({
    coin: '', price: '', size: '', side: '', liquidatedUser: '', markPrice: '', method: '', closedPnl: STREAMING_TRIGGER_MSG,
  }),
})

registerBlock({
  type: 'whaleTrade',
  label: 'Whale Trade',
  description: 'Trigger when a large trade executes (Hyperliquid). Filter by min size in useHyperstreamSockets.',
  category: 'trigger',
  color: 'violet',
  icon: 'eye',
  inputs: [
    { name: 'coin', label: 'Coin', type: 'tokenSelect', tokens: ['BTC', 'ETH', 'SOL', 'HYPE'], defaultValue: 'BTC', allowVariable: true },
    { name: 'minSize', label: 'Min Size', type: 'number', placeholder: '10', defaultValue: '1', allowVariable: true },
    { name: 'side', label: 'Side', type: 'select', options: ['B', 'A', 'Both'], defaultValue: 'Both' },
  ],
  outputs: [
    { name: 'coin', label: 'Coin' },
    { name: 'price', label: 'Price' },
    { name: 'size', label: 'Size' },
    { name: 'side', label: 'Side' },
    { name: 'user', label: 'User' },
    { name: 'direction', label: 'Direction' },
    { name: 'hash', label: 'Tx Hash' },
  ],
  run: async () => ({
    coin: '', price: '', size: '', side: '', user: '', direction: '', hash: STREAMING_TRIGGER_MSG,
  }),
})

registerBlock({
  type: 'recentTrades',
  label: 'Recent Trades',
  description: 'Fetch recent trades for a coin (Hyperliquid JSON-RPC).',
  category: 'filter',
  color: 'blue',
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
  run: async (inputs) => fetchRecentTrades(inputs.coin || 'BTC', Math.min(200, Math.max(1, parseInt(inputs.count || '10', 10)))),
})

registerBlock({
  type: 'orderFillAlert',
  label: 'Order Fill Alert',
  description: 'Trigger when an order is filled (Hyperliquid). Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  color: 'violet',
  icon: 'bell',
  inputs: [
    { name: 'user', label: 'User Address', type: 'address', allowVariable: true },
    { name: 'coin', label: 'Coin (optional)', type: 'tokenSelect', tokens: ['BTC', 'ETH', 'SOL', 'ZEC'], allowVariable: true },
    { name: 'statusFilter', label: 'Status', type: 'select', options: ['filled', 'open', 'canceled', 'triggered', 'marginCanceled', 'all'], defaultValue: 'filled' },
  ],
  outputs: [
    { name: 'user', label: 'User' },
    { name: 'coin', label: 'Coin' },
    { name: 'side', label: 'Side' },
    { name: 'status', label: 'Status' },
    { name: 'limitPrice', label: 'Limit Price' },
    { name: 'size', label: 'Remaining Size' },
    { name: 'origSize', label: 'Original Size' },
    { name: 'orderType', label: 'Order Type' },
    { name: 'orderId', label: 'Order ID' },
    { name: 'hash', label: 'Tx Hash' },
  ],
  run: async () => ({
    user: '', coin: '', side: '', status: '', limitPrice: '', size: '', origSize: '', orderType: '', orderId: '', hash: STREAMING_TRIGGER_MSG,
  }),
})

registerBlock({
  type: 'orderRejectionMonitor',
  label: 'Order Rejection Monitor',
  description: 'Trigger when an order is rejected (Hyperliquid). Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  color: 'rose',
  icon: 'shield',
  inputs: [
    { name: 'user', label: 'User Address', type: 'address', allowVariable: true },
    { name: 'rejectionType', label: 'Rejection Type', type: 'select', options: ['perpMarginRejected', 'spotMarginRejected', 'all'], defaultValue: 'all' },
  ],
  outputs: [
    { name: 'user', label: 'User' },
    { name: 'coin', label: 'Coin' },
    { name: 'status', label: 'Rejection Status' },
    { name: 'side', label: 'Side' },
    { name: 'size', label: 'Size' },
    { name: 'limitPrice', label: 'Limit Price' },
  ],
  run: async () => ({
    user: '', coin: '', status: '', side: '', size: '', limitPrice: STREAMING_TRIGGER_MSG,
  }),
})

registerBlock({
  type: 'bookUpdateMonitor',
  label: 'Book Update Monitor',
  description: 'Trigger on order book changes (Hyperliquid). Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  color: 'violet',
  icon: 'barChart',
  inputs: [
    { name: 'coin', label: 'Coin', type: 'tokenSelect', tokens: ['BTC', 'ETH', 'SOL'], defaultValue: 'BTC', allowVariable: true },
    { name: 'side', label: 'Side', type: 'select', options: ['B', 'A', 'Both'], defaultValue: 'Both' },
  ],
  outputs: [
    { name: 'coin', label: 'Coin' },
    { name: 'side', label: 'Side' },
    { name: 'price', label: 'Price Level' },
    { name: 'size', label: 'Size' },
    { name: 'action', label: 'Action' },
    { name: 'user', label: 'User' },
    { name: 'orderId', label: 'Order ID' },
  ],
  run: async () => ({
    coin: '', side: '', price: '', size: '', action: '', user: '', orderId: STREAMING_TRIGGER_MSG,
  }),
})

registerBlock({
  type: 'bookSnapshot',
  label: 'Book Snapshot',
  description: 'Fetch recent order book updates (Hyperliquid). Stream name: book.',
  category: 'filter',
  color: 'blue',
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
  run: async (inputs) => {
    const count = Math.min(200, Math.max(1, parseInt(inputs.count || '5', 10)))
    const blocks = await hlGetLatestBlocks('book', count)
    const coin = inputs.coin || 'BTC'
    const out: unknown[] = []
    let bestBid = ''
    let bestAsk = ''
    for (const b of blocks) {
      const events = (b.events ?? []) as { coin?: string; side?: string; px?: string; raw_book_diff?: unknown }[]
      for (const ev of events) {
        if (ev.coin === coin) {
          out.push(ev)
          if (ev.side === 'B' && ev.px) bestBid = ev.px
          if (ev.side === 'A' && ev.px) bestAsk = bestAsk ? (parseFloat(ev.px) < parseFloat(bestAsk) ? ev.px : bestAsk) : ev.px
        }
      }
    }
    const spread = bestBid && bestAsk ? String(parseFloat(bestAsk) - parseFloat(bestBid)) : ''
    return {
      updates: JSON.stringify(out),
      updateCount: String(out.length),
      bestBid,
      bestAsk,
      spread,
    }
  },
})

registerBlock({
  type: 'twapStatusAlert',
  label: 'TWAP Status Alert',
  description: 'Trigger on TWAP order status changes (Hyperliquid). Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  color: 'violet',
  icon: 'clock',
  inputs: [
    { name: 'user', label: 'User (optional)', type: 'address', allowVariable: true },
    { name: 'coin', label: 'Coin (optional)', type: 'tokenSelect', tokens: ['BTC', 'ETH', 'HYPE', 'xyz:NVDA'], allowVariable: true },
    { name: 'statusFilter', label: 'Status', type: 'select', options: ['activated', 'finished', 'terminated', 'all'], defaultValue: 'all' },
  ],
  outputs: [
    { name: 'twapId', label: 'TWAP ID' },
    { name: 'coin', label: 'Coin' },
    { name: 'user', label: 'User' },
    { name: 'side', label: 'Side' },
    { name: 'totalSize', label: 'Total Size' },
    { name: 'executedSize', label: 'Executed Size' },
    { name: 'executedNotional', label: 'Executed Notional (USD)' },
    { name: 'minutes', label: 'Duration (min)' },
    { name: 'status', label: 'Status' },
    { name: 'progress', label: 'Progress (%)' },
  ],
  run: async () => ({
    twapId: '', coin: '', user: '', side: '', totalSize: '', executedSize: '', executedNotional: '', minutes: '', status: '', progress: STREAMING_TRIGGER_MSG,
  }),
})

registerBlock({
  type: 'depositMonitor',
  label: 'Deposit Monitor',
  description: 'Trigger when a USDC deposit lands (Hyperliquid). Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  color: 'violet',
  icon: 'wallet',
  inputs: [
    { name: 'user', label: 'User (optional)', type: 'address', allowVariable: true },
    { name: 'minAmount', label: 'Min Amount (USD)', type: 'number', placeholder: '0', allowVariable: true },
  ],
  outputs: [
    { name: 'user', label: 'User' },
    { name: 'amount', label: 'Amount (USDC)' },
    { name: 'hash', label: 'Tx Hash' },
    { name: 'timestamp', label: 'Time' },
  ],
  run: async () => ({ user: '', amount: '', hash: '', timestamp: STREAMING_TRIGGER_MSG }),
})

registerBlock({
  type: 'withdrawalMonitor',
  label: 'Withdrawal Monitor',
  description: 'Trigger on USDC withdrawals (Hyperliquid). Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  color: 'violet',
  icon: 'send',
  inputs: [
    { name: 'user', label: 'User (optional)', type: 'address', allowVariable: true },
    { name: 'minAmount', label: 'Min Amount (USD)', type: 'number', placeholder: '0', allowVariable: true },
  ],
  outputs: [
    { name: 'user', label: 'User' },
    { name: 'amount', label: 'Amount (USDC)' },
    { name: 'fee', label: 'Fee' },
    { name: 'hash', label: 'Tx Hash' },
  ],
  run: async () => ({ user: '', amount: '', fee: '', hash: STREAMING_TRIGGER_MSG }),
})

registerBlock({
  type: 'transferMonitor',
  label: 'Transfer Monitor',
  description: 'Trigger on internal transfers (Hyperliquid). Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  color: 'violet',
  icon: 'arrowLeftRight',
  inputs: [
    { name: 'user', label: 'User (optional)', type: 'address', allowVariable: true },
    { name: 'transferType', label: 'Transfer Type', type: 'select', options: ['send', 'spotTransfer', 'subAccountTransfer', 'accountClassTransfer', 'all'], defaultValue: 'all' },
  ],
  outputs: [
    { name: 'type', label: 'Transfer Type' },
    { name: 'user', label: 'From User' },
    { name: 'destination', label: 'Destination' },
    { name: 'token', label: 'Token' },
    { name: 'amount', label: 'Amount' },
    { name: 'usdcValue', label: 'USDC Value' },
    { name: 'hash', label: 'Tx Hash' },
  ],
  run: async () => ({
    type: '', user: '', destination: '', token: '', amount: '', usdcValue: '', hash: STREAMING_TRIGGER_MSG,
  }),
})

registerBlock({
  type: 'vaultActivityMonitor',
  label: 'Vault Activity Monitor',
  description: 'Trigger on vault deposit/withdrawal (Hyperliquid). Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  color: 'violet',
  icon: 'database',
  inputs: [
    { name: 'vault', label: 'Vault (optional)', type: 'address', allowVariable: true },
    { name: 'operationType', label: 'Operation', type: 'select', options: ['vaultDeposit', 'vaultWithdraw', 'vaultCreate', 'all'], defaultValue: 'all' },
  ],
  outputs: [
    { name: 'type', label: 'Operation Type' },
    { name: 'vault', label: 'Vault Address' },
    { name: 'user', label: 'User' },
    { name: 'amount', label: 'Amount (USDC)' },
    { name: 'commission', label: 'Commission' },
    { name: 'hash', label: 'Tx Hash' },
  ],
  run: async () => ({
    type: '', vault: '', user: '', amount: '', commission: '', hash: STREAMING_TRIGGER_MSG,
  }),
})

registerBlock({
  type: 'fundingPayment',
  label: 'Funding Payment',
  description: 'Trigger on hourly funding (Hyperliquid). Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  color: 'amber',
  icon: 'clock',
  inputs: [
    { name: 'user', label: 'User (optional)', type: 'address', allowVariable: true },
  ],
  outputs: [
    { name: 'user', label: 'User' },
    { name: 'data', label: 'Funding Data (JSON)' },
    { name: 'hash', label: 'Tx Hash' },
  ],
  run: async () => ({ user: '', data: '', hash: STREAMING_TRIGGER_MSG }),
})

registerBlock({
  type: 'crossChainMonitor',
  label: 'Bridge Monitor',
  description: 'Trigger on cross-chain deposit/withdrawal (Hyperliquid). Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  color: 'violet',
  icon: 'globe',
  inputs: [
    { name: 'user', label: 'User (optional)', type: 'address', allowVariable: true },
    { name: 'direction', label: 'Direction', type: 'select', options: ['CDeposit', 'CWithdrawal', 'both'], defaultValue: 'both' },
  ],
  outputs: [
    { name: 'user', label: 'User' },
    { name: 'amount', label: 'Amount' },
    { name: 'direction', label: 'Direction' },
    { name: 'isFinalized', label: 'Finalized' },
    { name: 'hash', label: 'Tx Hash' },
  ],
  run: async () => ({ user: '', amount: '', direction: '', isFinalized: '', hash: STREAMING_TRIGGER_MSG }),
})

registerBlock({
  type: 'delegationMonitor',
  label: 'Delegation Monitor',
  description: 'Trigger on staking delegation/undelegation (Hyperliquid). Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  color: 'amber',
  icon: 'shield',
  inputs: [
    { name: 'user', label: 'User (optional)', type: 'address', allowVariable: true },
    { name: 'validator', label: 'Validator (optional)', type: 'address', allowVariable: true },
  ],
  outputs: [
    { name: 'user', label: 'User' },
    { name: 'validator', label: 'Validator' },
    { name: 'amount', label: 'Amount' },
    { name: 'isUndelegate', label: 'Is Undelegation' },
    { name: 'hash', label: 'Tx Hash' },
  ],
  run: async () => ({ user: '', validator: '', amount: '', isUndelegate: '', hash: STREAMING_TRIGGER_MSG }),
})

registerBlock({
  type: 'recentEvents',
  label: 'Recent Events',
  description: 'Fetch recent events (Hyperliquid). Filter by type for mid-flow checks.',
  category: 'filter',
  color: 'blue',
  icon: 'filter',
  inputs: [
    { name: 'eventType', label: 'Event Type', type: 'select', options: ['deposit', 'withdraw', 'send', 'spotTransfer', 'vaultDeposit', 'vaultWithdraw', 'funding', 'all'], defaultValue: 'all' },
    { name: 'count', label: 'Block Count', type: 'number', placeholder: '10', defaultValue: '10', min: 1, max: 200 },
  ],
  outputs: [
    { name: 'events', label: 'Events (JSON)' },
    { name: 'eventCount', label: 'Event Count' },
    { name: 'passed', label: 'Has Events' },
  ],
  run: async (inputs) => fetchRecentEvents(inputs.eventType || 'all', Math.min(200, Math.max(1, parseInt(inputs.count || '10', 10)))),
})

registerBlock({
  type: 'systemTransferMonitor',
  label: 'System Transfer Monitor',
  description: 'Trigger on system spot token transfers / bridge (Hyperliquid). Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  color: 'violet',
  icon: 'globe',
  inputs: [
    { name: 'user', label: 'System User (optional)', type: 'address', allowVariable: true },
    { name: 'tokenId', label: 'Token ID (optional)', type: 'number', placeholder: '299' },
  ],
  outputs: [
    { name: 'user', label: 'User' },
    { name: 'destination', label: 'Destination' },
    { name: 'tokenId', label: 'Token ID' },
    { name: 'amount', label: 'Amount (wei)' },
    { name: 'actionType', label: 'Action Type' },
    { name: 'evmTxHash', label: 'EVM Tx Hash' },
    { name: 'nonce', label: 'Nonce' },
  ],
  run: async () => ({
    user: '', destination: '', tokenId: '', amount: '', actionType: '', evmTxHash: '', nonce: STREAMING_TRIGGER_MSG,
  }),
})

// ─── Uniswap Blocks ─────────────────────────────────────

registerBlock({
  type: 'swapQuote',
  label: 'Swap Quote',
  description: 'Get a token swap quote from Uniswap',
  category: 'action',
  color: 'emerald',
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
  run: async (inputs) => {
    return await getSwapQuote(inputs.fromToken, inputs.toToken, inputs.amount)
  },
})

registerBlock({
  type: 'executeSwap',
  label: 'Execute Swap',
  description: 'Execute a token swap on Uniswap V3',
  category: 'action',
  color: 'emerald',
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
  run: async (inputs) => {
    return await executeSwap(inputs.fromToken, inputs.toToken, inputs.amount, inputs.slippage)
  },
})

registerBlock({
  type: 'tokenPrice',
  label: 'Token Price',
  description: 'Get current token price in USD',
  category: 'action',
  color: 'emerald',
  icon: 'barChart',
  inputs: [
    { name: 'token', label: 'Token', type: 'tokenSelect', defaultValue: 'ETH' },
  ],
  outputs: [
    { name: 'price', label: 'Price (USD)' },
    { name: 'change24h', label: '24h Change (%)' },
  ],
  run: async (inputs) => {
    return await getTokenPrice(inputs.token)
  },
})

// ─── Price / Alert Blocks ────────────────────────────────

registerBlock({
  type: 'priceAlert',
  label: 'Price Alert',
  description: 'Trigger when token price crosses threshold',
  category: 'trigger',
  color: 'amber',
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
  run: async (inputs) => {
    const { price } = await getTokenPrice(inputs.token)
    const crossed =
      (inputs.condition === 'above' && parseFloat(price) > parseFloat(inputs.price)) ||
      (inputs.condition === 'below' && parseFloat(price) < parseFloat(inputs.price)) ||
      inputs.condition === 'crosses'
    return { currentPrice: price, triggered: String(crossed) }
  },
})

// ─── Filter Blocks ───────────────────────────────────────

registerBlock({
  type: 'valueFilter',
  label: 'Value Filter',
  description: 'Filter by transaction value',
  category: 'filter',
  color: 'blue',
  icon: 'filter',
  inputs: [
    { name: 'minValue', label: 'Min Value', type: 'number', placeholder: '0', allowVariable: true },
    { name: 'maxValue', label: 'Max Value', type: 'number', placeholder: '1000000', allowVariable: true },
    { name: 'passThrough', label: 'Pass All Data Through', type: 'toggle', defaultValue: 'true' },
  ],
  outputs: [
    { name: 'passed', label: 'Passed Filter' },
    { name: 'value', label: 'Matched Value' },
  ],
  run: async (inputs) => {
    const min = parseFloat(inputs.minValue || '0')
    const max = parseFloat(inputs.maxValue || 'Infinity')
    const val = 0 // TODO: receive value from upstream block
    return { passed: String(val >= min && val <= max), value: String(val) }
  },
})

registerBlock({
  type: 'gasGuard',
  label: 'Gas Guard',
  description: 'Skip when gas is too high',
  category: 'filter',
  color: 'rose',
  icon: 'shield',
  inputs: [
    { name: 'maxGwei', label: 'Max Gas (Gwei)', type: 'slider', min: 5, max: 200, step: 5, defaultValue: '50' },
    { name: 'retryOnFail', label: 'Retry If Too High', type: 'toggle', defaultValue: 'false' },
  ],
  outputs: [
    { name: 'currentGas', label: 'Current Gas (Gwei)' },
    { name: 'passed', label: 'Below Threshold' },
  ],
  run: async (inputs) => {
    const gwei = await getGasPrice()
    return { currentGas: gwei, passed: String(parseFloat(gwei) <= parseFloat(inputs.maxGwei)) }
  },
})

registerBlock({
  type: 'delayTimer',
  label: 'Delay Timer',
  description: 'Wait before continuing the flow',
  category: 'filter',
  color: 'blue',
  icon: 'clock',
  inputs: [
    { name: 'seconds', label: 'Delay (seconds)', type: 'slider', min: 1, max: 300, step: 1, defaultValue: '10' },
  ],
  outputs: [
    { name: 'elapsed', label: 'Time Elapsed' },
  ],
  run: async (inputs) => {
    const ms = parseFloat(inputs.seconds) * 1000
    await new Promise((r) => setTimeout(r, ms))
    return { elapsed: `${inputs.seconds}s` }
  },
})

// ─── Utility Blocks ──────────────────────────────────────

registerBlock({
  type: 'webhook',
  label: 'Webhook',
  description: 'Send data to an external URL',
  category: 'action',
  color: 'blue',
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
  run: async (inputs) => sendWebhook(inputs),
})

registerBlock({
  type: 'sendToken',
  label: 'Send Token',
  description: 'Transfer tokens to an address',
  category: 'action',
  color: 'emerald',
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
  run: async (_inputs) => {
    // TODO: wire up real token transfer via ethers / viem
    throw new Error('Not implemented — requires a connected wallet to send tokens')
  },
})

registerBlock({
  type: 'dataStore',
  label: 'Data Store',
  description: 'Save key/value data for later use',
  category: 'action',
  color: 'blue',
  icon: 'database',
  inputs: [
    { name: 'data', label: 'Data Pairs', type: 'keyValue', defaultValue: '[]' },
  ],
  outputs: [
    { name: 'saved', label: 'Save Confirmed' },
  ],
  run: async (inputs) => {
    const pairs = JSON.parse(inputs.data || '[]') as { key: string; value: string }[]
    return await saveKeyValue(pairs)
  },
})


registerBlock({
  type: 'timeLoop',
  label: 'Time Loop',
  description: 'Trigger every x seconds (interrupt-based)',
  category: 'trigger',
  color: 'amber',
  icon: 'clock',
  inputs: [
    { name: 'seconds', label: 'Seconds', type: 'slider', min: 1, max: 300, step: 1, defaultValue: '10' },
  ],
  outputs: [
    { name: 'elapsed', label: 'Time Elapsed' },
  ],
  run: async (inputs) => timeLoopRun(parseFloat(inputs.seconds || '10')),
  subscribe: (inputs, onTrigger) => {
    const seconds = parseFloat(inputs.seconds || '10')
    const ms = Math.max(1000, seconds * 1000)
    const id = setInterval(() => onTrigger({ elapsed: `${seconds}s` }), ms)
    return () => clearInterval(id)
  },
})

