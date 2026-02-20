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
    { name: 'headers', label: 'Headers', type: 'keyValue', defaultValue: '[]' },
    { name: 'body', label: 'Request Body', type: 'textarea', placeholder: '{"key": "value"}', rows: 3, allowVariable: true },
  ],
  outputs: [
    { name: 'status', label: 'Status Code' },
    { name: 'response', label: 'Response Body' },
  ],
  run: async (inputs) => {
    const headers: Record<string, string> = {}
    try {
      const pairs = JSON.parse(inputs.headers || '[]') as { key: string; value: string }[]
      for (const p of pairs) headers[p.key] = p.value
    } catch { /* ignore bad JSON */ }

    const res = await fetch(inputs.url, {
      method: inputs.method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: inputs.method !== 'GET' ? inputs.body : undefined,
    })
    const text = await res.text()
    return { status: String(res.status), response: text }
  },
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

