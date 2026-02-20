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
  tradeAlert,
  liquidationWatcher,
  whaleTrade,
  recentTrades,
  orderFillAlert,
  orderRejectionMonitor,
  bookUpdateMonitor,
  bookSnapshot,
  twapStatusAlert,
  depositMonitor,
  withdrawalMonitor,
  transferMonitor,
  vaultActivityMonitor,
  fundingPayment,
  crossChainMonitor,
  delegationMonitor,
  recentEvents,
  systemTransferMonitor,
} from '../services/hyperliquid'
import { swapQuote, executeSwap, tokenPrice, priceAlert } from '../services/uniswap'
import { dataStore } from '../utils/supabase'
import { webhook, timeLoop, delayTimer, valueFilter, sendToken, manualTrigger } from '../services/general'

/** Placeholder run for streaming triggers — use useHyperstreamSockets when running the flow. */
const STREAMING_TRIGGER_MSG = 'Streaming trigger — start flow with useHyperstreamSockets to receive events.'

// ─── QuickNode Blocks ────────────────────────────────────

registerBlock({
  type: 'watchWallet',
  label: 'Whale Watcher',
  description: 'Monitor large wallet activity on EVM chains',
  category: 'trigger',
  service: 'quicknode',
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
  run: async (inputs) => watchWallet(inputs),
})

registerBlock({
  type: 'ethBalance',
  label: 'ETH Balance',
  description: 'Check ETH balance of a wallet. Use as trigger or mid-flow action.',
  category: 'trigger',
  categories: ['trigger', 'action'],
  service: 'quicknode',
  color: 'violet',
  icon: 'wallet',
  inputs: [
    { name: 'walletAddress', label: 'Wallet Address', type: 'address', allowVariable: true },
  ],
  outputs: [
    { name: 'balance', label: 'Balance (ETH)' },
    { name: 'balanceUsd', label: 'Balance (USD)' },
  ],
  run: async (inputs) => ethBalance(inputs),
})

registerBlock({
  type: 'txHistory',
  label: 'TX History',
  description: 'Get recent transactions for a wallet. Use as trigger or mid-flow action.',
  category: 'trigger',
  categories: ['trigger', 'action'],
  service: 'quicknode',
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
  run: async (inputs) => txHistory(inputs),
})

// ─── Hyperliquid Blocks (QuickNode Data Streams) ───────────
// Streaming triggers: run() returns placeholder; use useHyperstreamSockets to drive flows.

registerBlock({
  type: 'tradeAlert',
  label: 'Trade Alert',
  description: 'Trigger when a trade executes on Hyperliquid. Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  service: 'hyperliquid',
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
  run: async (inputs) => {
    const out = await tradeAlert(inputs)
    return { ...out, tradeId: STREAMING_TRIGGER_MSG }
  },
})

registerBlock({
  type: 'liquidationWatcher',
  label: 'Liquidation Watcher',
  description: 'Trigger when a liquidation occurs on Hyperliquid. Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'violet',
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
  run: async (inputs) => {
    const out = await liquidationWatcher(inputs)
    return { ...out, closedPnl: STREAMING_TRIGGER_MSG }
  },
})

registerBlock({
  type: 'whaleTrade',
  label: 'Whale Trade',
  description: 'Trigger when a large trade executes on Hyperliquid. Filter by min size in useHyperstreamSockets.',
  category: 'trigger',
  service: 'hyperliquid',
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
  run: async (inputs) => {
    const out = await whaleTrade(inputs)
    return { ...out, hash: STREAMING_TRIGGER_MSG }
  },
})

registerBlock({
  type: 'recentTrades',
  label: 'Recent Trades',
  description: 'Fetch recent trades for a coin via Hyperliquid JSON-RPC.',
  category: 'filter',
  service: 'hyperliquid',
  color: 'violet',
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
  type: 'orderFillAlert',
  label: 'Order Fill Alert',
  description: 'Trigger when an order is filled on Hyperliquid. Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  service: 'hyperliquid',
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
  run: async (inputs) => {
    const out = await orderFillAlert(inputs)
    return { ...out, hash: STREAMING_TRIGGER_MSG }
  },
})

registerBlock({
  type: 'orderRejectionMonitor',
  label: 'Order Rejection Monitor',
  description: 'Trigger when an order is rejected on Hyperliquid. Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'violet',
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
  run: async (inputs) => {
    const out = await orderRejectionMonitor(inputs)
    return { ...out, limitPrice: STREAMING_TRIGGER_MSG }
  },
})

registerBlock({
  type: 'bookUpdateMonitor',
  label: 'Book Update Monitor',
  description: 'Trigger on order book changes on Hyperliquid. Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  service: 'hyperliquid',
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
  run: async (inputs) => {
    const out = await bookUpdateMonitor(inputs)
    return { ...out, orderId: STREAMING_TRIGGER_MSG }
  },
})

registerBlock({
  type: 'bookSnapshot',
  label: 'Book Snapshot',
  description: 'Fetch recent order book updates from Hyperliquid. Stream name: book.',
  category: 'filter',
  service: 'hyperliquid',
  color: 'violet',
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
  type: 'twapStatusAlert',
  label: 'TWAP Status Alert',
  description: 'Trigger on TWAP order status changes on Hyperliquid. Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  service: 'hyperliquid',
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
  run: async (inputs) => {
    const out = await twapStatusAlert(inputs)
    return { ...out, progress: STREAMING_TRIGGER_MSG }
  },
})

registerBlock({
  type: 'depositMonitor',
  label: 'Deposit Monitor',
  description: 'Trigger when a USDC deposit lands on Hyperliquid. Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  service: 'hyperliquid',
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
  run: async (inputs) => {
    const out = await depositMonitor(inputs)
    return { ...out, timestamp: STREAMING_TRIGGER_MSG }
  },
})

registerBlock({
  type: 'withdrawalMonitor',
  label: 'Withdrawal Monitor',
  description: 'Trigger on USDC withdrawals from Hyperliquid. Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  service: 'hyperliquid',
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
  run: async (inputs) => {
    const out = await withdrawalMonitor(inputs)
    return { ...out, hash: STREAMING_TRIGGER_MSG }
  },
})

registerBlock({
  type: 'transferMonitor',
  label: 'Transfer Monitor',
  description: 'Trigger on internal transfers on Hyperliquid. Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  service: 'hyperliquid',
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
  run: async (inputs) => {
    const out = await transferMonitor(inputs)
    return { ...out, hash: STREAMING_TRIGGER_MSG }
  },
})

registerBlock({
  type: 'vaultActivityMonitor',
  label: 'Vault Activity Monitor',
  description: 'Trigger on vault deposit/withdrawal on Hyperliquid. Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  service: 'hyperliquid',
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
  run: async (inputs) => {
    const out = await vaultActivityMonitor(inputs)
    return { ...out, hash: STREAMING_TRIGGER_MSG }
  },
})

registerBlock({
  type: 'fundingPayment',
  label: 'Funding Payment',
  description: 'Trigger on hourly funding on Hyperliquid. Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'violet',
  icon: 'clock',
  inputs: [
    { name: 'user', label: 'User (optional)', type: 'address', allowVariable: true },
  ],
  outputs: [
    { name: 'user', label: 'User' },
    { name: 'data', label: 'Funding Data (JSON)' },
    { name: 'hash', label: 'Tx Hash' },
  ],
  run: async (inputs) => {
    const out = await fundingPayment(inputs)
    return { ...out, hash: STREAMING_TRIGGER_MSG }
  },
})

registerBlock({
  type: 'crossChainMonitor',
  label: 'Bridge Monitor',
  description: 'Trigger on cross-chain deposit/withdrawal on Hyperliquid. Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  service: 'hyperliquid',
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
  run: async (inputs) => {
    const out = await crossChainMonitor(inputs)
    return { ...out, hash: STREAMING_TRIGGER_MSG }
  },
})

registerBlock({
  type: 'delegationMonitor',
  label: 'Delegation Monitor',
  description: 'Trigger on staking delegation/undelegation on Hyperliquid. Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  service: 'hyperliquid',
  color: 'violet',
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
  run: async (inputs) => {
    const out = await delegationMonitor(inputs)
    return { ...out, hash: STREAMING_TRIGGER_MSG }
  },
})

registerBlock({
  type: 'recentEvents',
  label: 'Recent Events',
  description: 'Fetch recent events from Hyperliquid. Filter by type for mid-flow checks.',
  category: 'filter',
  service: 'hyperliquid',
  color: 'violet',
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
  run: async (inputs) => recentEvents(inputs),
})

registerBlock({
  type: 'systemTransferMonitor',
  label: 'System Transfer Monitor',
  description: 'Trigger on system spot token transfers / bridge on Hyperliquid. Use useHyperstreamSockets for real-time.',
  category: 'trigger',
  service: 'hyperliquid',
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
  run: async (inputs) => {
    const out = await systemTransferMonitor(inputs)
    return { ...out, nonce: STREAMING_TRIGGER_MSG }
  },
})

// ─── Uniswap Blocks ─────────────────────────────────────

registerBlock({
  type: 'swapQuote',
  label: 'Swap Quote',
  description: 'Get a token swap quote from Uniswap V3',
  category: 'action',
  service: 'uniswap',
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
  run: async (inputs) => swapQuote(inputs),
})

registerBlock({
  type: 'executeSwap',
  label: 'Execute Swap',
  description: 'Execute a token swap on Uniswap V3',
  category: 'action',
  service: 'uniswap',
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
  run: async (inputs) => executeSwap(inputs),
})

registerBlock({
  type: 'tokenPrice',
  label: 'Token Price',
  description: 'Get current token price in USD',
  category: 'action',
  service: 'uniswap',
  color: 'emerald',
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
  color: 'emerald',
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
    { name: 'minValue', label: 'Min Value', type: 'number', placeholder: '0', allowVariable: true },
    { name: 'maxValue', label: 'Max Value', type: 'number', placeholder: '1000000', allowVariable: true },
    { name: 'passThrough', label: 'Pass All Data Through', type: 'toggle', defaultValue: 'true' },
  ],
  outputs: [
    { name: 'passed', label: 'Passed Filter' },
    { name: 'value', label: 'Matched Value' },
  ],
  run: async (inputs) => valueFilter(inputs),
})

registerBlock({
  type: 'gasGuard',
  label: 'Gas Guard',
  description: 'Skip when gas is too high',
  category: 'filter',
  service: 'quicknode',
  color: 'violet',
  icon: 'shield',
  inputs: [
    { name: 'maxGwei', label: 'Max Gas (Gwei)', type: 'slider', min: 5, max: 200, step: 5, defaultValue: '50' },
    { name: 'retryOnFail', label: 'Retry If Too High', type: 'toggle', defaultValue: 'false' },
  ],
  outputs: [
    { name: 'currentGas', label: 'Current Gas (Gwei)' },
    { name: 'passed', label: 'Below Threshold' },
  ],
  run: async (inputs) => gasGuard(inputs),
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
  type: 'dataStore',
  label: 'Data Store',
  description: 'Save key/value data for later use',
  category: 'action',
  service: 'supabase',
  color: 'blue',
  icon: 'database',
  inputs: [
    { name: 'data', label: 'Data Pairs', type: 'keyValue', defaultValue: '[]' },
  ],
  outputs: [
    { name: 'saved', label: 'Save Confirmed' },
  ],
  run: async (inputs) => dataStore(inputs),
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

