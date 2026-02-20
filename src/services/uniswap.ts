/**
 * Uniswap service — placeholder implementations.
 *
 * When you're ready to go live, install ethers / viem and
 * replace the stubs with real Uniswap SDK calls.
 */

const TOKEN_ADDRESSES: Record<string, string> = {
  ETH:  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  DAI:  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
}

export function getTokenAddress(symbol: string): string {
  return TOKEN_ADDRESSES[symbol.toUpperCase()] ?? ''
}

export async function getSwapQuote(
  fromToken: string,
  toToken: string,
  amount: string,
): Promise<{ expectedOutput: string; priceImpact: string; route: string }> {
  // TODO: replace with real Uniswap V3 Quoter call
  const _from = getTokenAddress(fromToken)
  const _to = getTokenAddress(toToken)
  if (!_from || !_to) throw new Error(`Unknown token: ${!_from ? fromToken : toToken}`)

  return {
    expectedOutput: `${(parseFloat(amount) * 1800).toFixed(2)}`,
    priceImpact: '0.03%',
    route: `${fromToken} → ${toToken}`,
  }
}

export async function getTokenPrice(
  token: string,
): Promise<{ price: string; change24h: string }> {
  // TODO: replace with CoinGecko / on-chain TWAP
  void getTokenAddress(token)

  return {
    price: '1800.00',
    change24h: '+2.4%',
  }
}

// ─── Block-specific functions (stub: console.log + return outputs) ───

export async function swapQuote(_inputs: Record<string, string>): Promise<{ expectedOutput: string; priceImpact: string; route: string }> {
  console.log('swapQuote')
  return { expectedOutput: '', priceImpact: '', route: '' }
}

export async function executeSwap(_inputs: Record<string, string>): Promise<{ txHash: string; amountOut: string; gasUsed: string }> {
  console.log('executeSwap')
  return { txHash: '', amountOut: '', gasUsed: '' }
}

export async function tokenPrice(_inputs: Record<string, string>): Promise<{ price: string; change24h: string }> {
  console.log('tokenPrice')
  return { price: '', change24h: '' }
}

export async function priceAlert(_inputs: Record<string, string>): Promise<{ currentPrice: string; triggered: string }> {
  console.log('priceAlert')
  return { currentPrice: '', triggered: '' }
}
