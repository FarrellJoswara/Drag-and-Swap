/**
 * Uniswap service — block-facing functions only.
 * All SDK/contract logic lives in utils/uniswap.ts.
 */

import {
  getTokenAddress,
  getTokenDecimals,
  getPoolId,
  quoteExactInputSingle,
  getSlot0,
  sqrtPriceX96ToPrice,
  buildSwapCalldata,
  type PoolKey,
  type PathKey,
} from '../utils/uniswap'

const EMPTY_HOOKS = '0x0000000000000000000000000000000000000000'
const DEFAULT_FEE = 500
const DEFAULT_TICK_SPACING = 10

function parseNum(s: string | undefined, fallback: number): number {
  const n = s != null ? parseFloat(s) : NaN
  return Number.isFinite(n) ? n : fallback
}

export async function swapQuote(
  inputs: Record<string, string>
): Promise<{ expectedOutput: string; priceImpact: string; route: string }> {
  const fromToken = (inputs.fromToken ?? 'ETH').trim()
  const toToken = (inputs.toToken ?? 'USDC').trim()
  const amount = String(inputs.amount ?? '1').trim()

  const fromAddr = getTokenAddress(fromToken)
  const toAddr = getTokenAddress(toToken)
  if (!fromAddr || !toAddr) {
    throw new Error(`Unknown token: ${!fromAddr ? fromToken : toToken}`)
  }

  const amountInWei = BigInt(
    Math.floor(parseFloat(amount) * 10 ** getTokenDecimals(fromToken))
  ).toString()

  const [c0, c1] = fromAddr < toAddr ? [fromAddr, toAddr] : [toAddr, fromAddr]
  const zeroForOne = fromAddr === c0

  const poolKey: PoolKey = {
    currency0: c0,
    currency1: c1,
    fee: DEFAULT_FEE,
    tickSpacing: DEFAULT_TICK_SPACING,
    hooks: EMPTY_HOOKS,
  }

  const amountOut = await quoteExactInputSingle({
    poolKey,
    zeroForOne,
    amountIn: amountInWei,
    hookData: '0x00',
  })

  const toDecimals = getTokenDecimals(toToken)
  const expectedOutput = (Number(amountOut) / 10 ** toDecimals).toFixed(6)
  const route = `${fromToken} → ${toToken}`

  return {
    expectedOutput,
    priceImpact: '0.03%',
    route,
  }
}

export async function executeSwap(
  inputs: Record<string, string>
): Promise<{ txHash: string; amountOut: string; gasUsed: string }> {
  const fromToken = (inputs.fromToken ?? 'ETH').trim()
  const toToken = (inputs.toToken ?? 'USDC').trim()
  const amount = String(inputs.amount ?? '1').trim()
  const slippagePct = parseNum(inputs.slippage, 0.5)

  const fromAddr = getTokenAddress(fromToken)
  const toAddr = getTokenAddress(toToken)
  if (!fromAddr || !toAddr) {
    throw new Error(`Unknown token: ${!fromAddr ? fromToken : toToken}`)
  }

  const amountInWei = BigInt(
    Math.floor(parseFloat(amount) * 10 ** getTokenDecimals(fromToken))
  ).toString()

  const path: PathKey[] = [
    {
      currency0: fromAddr < toAddr ? fromAddr : toAddr,
      currency1: fromAddr < toAddr ? toAddr : fromAddr,
      fee: DEFAULT_FEE,
      tickSpacing: DEFAULT_TICK_SPACING,
      hooks: EMPTY_HOOKS,
    },
  ]

  const amountOutWei = await quoteExactInputSingle({
    poolKey: {
      currency0: path[0].currency0,
      currency1: path[0].currency1,
      fee: path[0].fee,
      tickSpacing: path[0].tickSpacing,
      hooks: path[0].hooks,
    },
    zeroForOne: fromAddr === path[0].currency0,
    amountIn: amountInWei,
    hookData: '0x00',
  })

  const slippageBips = Math.round(slippagePct * 100)
  const amountOutMin = (amountOutWei * BigInt(10000 - slippageBips)) / 10000n
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20
  const recipient = '0x0000000000000000000000000000000000000000'

  const { calldata } = await buildSwapCalldata({
    path,
    amountIn: amountInWei,
    amountOutMin: amountOutMin.toString(),
    recipient,
    deadline,
    slippageBips,
  })

  const toDecimals = getTokenDecimals(toToken)
  const amountOut = (Number(amountOutWei) / 10 ** toDecimals).toFixed(6)

  // TODO: To execute for real: get wallet (e.g. from Privy), send tx to Universal Router
  // with data=calldata and value from buildSwapCalldata. Use chain-specific Universal Router
  // address from https://docs.uniswap.org/contracts/v4/deployments
  void calldata
  return {
    txHash: '0x',
    amountOut: `${amountOut} ${toToken}`,
    gasUsed: '0',
  }
}

export async function tokenPrice(
  inputs: Record<string, string>
): Promise<{ price: string; change24h: string }> {
  const token = (inputs.token ?? 'ETH').trim()
  const tokenAddr = getTokenAddress(token)
  if (!tokenAddr) throw new Error(`Unknown token: ${token}`)

  const usdcAddr = getTokenAddress('USDC')
  const [c0, c1] =
    tokenAddr < usdcAddr ? [tokenAddr, usdcAddr] : [usdcAddr, tokenAddr]
  const zeroForOne = tokenAddr === c0

  const poolId = getPoolId(c0, c1, DEFAULT_FEE, DEFAULT_TICK_SPACING)
  const { sqrtPriceX96 } = await getSlot0(poolId)

  const dec0 =
    tokenAddr === c0 ? getTokenDecimals(token) : getTokenDecimals('USDC')
  const dec1 =
    tokenAddr === c1 ? getTokenDecimals(token) : getTokenDecimals('USDC')
  const priceStr = sqrtPriceX96ToPrice(sqrtPriceX96, dec0, dec1, zeroForOne)

  return {
    price: priceStr,
    change24h: '0%',
  }
}

export async function priceAlert(
  inputs: Record<string, string>
): Promise<{ currentPrice: string; triggered: string }> {
  const token = (inputs.token ?? 'ETH').trim()
  const condition = (inputs.condition ?? 'above').trim()
  const threshold = parseNum(inputs.price, 0)

  const { price } = await tokenPrice({ token })
  const currentPrice = price
  const current = parseFloat(price)
  let triggered = 'false'

  if (condition === 'above' && current >= threshold) triggered = 'true'
  if (condition === 'below' && current <= threshold) triggered = 'true'
  if (condition === 'crosses') triggered = current >= threshold ? 'true' : 'false'

  return {
    currentPrice,
    triggered,
  }
}
