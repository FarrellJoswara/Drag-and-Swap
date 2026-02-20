/**
 * Uniswap SDK and contract helpers.
 * Used by services/uniswap.ts block functions only.
 *
 * Implemented with viem:
 * - getPoolId, getSlot0, getLiquidity: real chain reads (StateView + keccak256 poolId).
 * - quoteExactInputSingle: real when VITE_QUICKNODE_RPC_URL is set and pool exists; else stub.
 *
 * What you still need to do for full live execution:
 * 1. Set VITE_QUICKNODE_RPC_URL in .env.local (Ethereum RPC) for quotes and token price.
 * 2. Execute Swap: implement buildSwapCalldata using @uniswap/v4-sdk V4Planner, then in the
 *    service get the user's wallet (e.g. from Privy) and send a tx to the Universal Router
 *    with the calldata and value. Universal Router addresses: docs.uniswap.org/contracts/v4/deployments
 */

import {
  createPublicClient,
  http,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
  type Hash,
} from 'viem'
import { mainnet } from 'viem/chains'

// ─── Config ───

const RPC_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { VITE_QUICKNODE_RPC_URL?: string } }).env
      ?.VITE_QUICKNODE_RPC_URL) ||
  ''

/** Token symbol -> address (UI/sentinel). ETH uses zero address for Uniswap V4 pool keys. */
const TOKEN_ADDRESSES: Record<string, string> = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
}

const TOKEN_DECIMALS: Record<string, number> = {
  ETH: 18,
  USDC: 6,
  USDT: 6,
  WBTC: 8,
  DAI: 18,
}

const EMPTY_HOOKS = '0x0000000000000000000000000000000000000000'

/** Uniswap V4 uses 0x0 for native ETH in pool keys. */
const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000'

/** V4 contract addresses (Ethereum mainnet). Other chains: https://docs.uniswap.org/contracts/v4/deployments */
const QUOTER_ADDRESS = '0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203' as Address
const STATE_VIEW_ADDRESS = '0x7ffe42c4a5deea5b0fec41c94c136cf115597227' as Address

const publicClient = RPC_URL
  ? createPublicClient({
      chain: mainnet,
      transport: http(RPC_URL),
    })
  : null

// ─── Types ───

export interface PoolKey {
  currency0: string
  currency1: string
  fee: number
  tickSpacing: number
  hooks?: string
}

export interface PathKey {
  currency0: string
  currency1: string
  fee: number
  tickSpacing: number
  hooks: string
  hookData?: string
}

export interface QuoteExactInputSingleParams {
  poolKey: PoolKey
  zeroForOne: boolean
  amountIn: string
  hookData?: string
}

export interface QuoteExactInputParams {
  path: PathKey[]
  amountIn: string
}

export interface BuildSwapCalldataParams {
  path: PathKey[]
  amountIn: string
  amountOutMin: string
  recipient: string
  deadline: number
  slippageBips: number
}

// ─── Token / pool helpers ───

export function getTokenAddress(symbol: string): string {
  return TOKEN_ADDRESSES[symbol.toUpperCase()] ?? ''
}

export function getTokenDecimals(symbol: string): number {
  return TOKEN_DECIMALS[symbol.toUpperCase()] ?? 18
}

/** Normalize token address for V4 pool key (native ETH -> 0x0). */
function toPoolCurrency(addr: string): Address {
  const a = addr.toLowerCase()
  if (
    a === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
    a === '0x0000000000000000000000000000000000000000'
  )
    return NATIVE_ETH_ADDRESS as Address
  return addr as Address
}

/**
 * Compute V4 poolId from pool key: keccak256(abi.encode(poolKey)).
 * Matches Uniswap v4-core PoolId.toId(PoolKey).
 */
export function getPoolId(
  currency0: string,
  currency1: string,
  fee: number,
  tickSpacing: number,
  hooks: string = EMPTY_HOOKS
): Hash {
  const encoded = encodeAbiParameters(parseAbiParameters('address, address, uint24, int24, address'), [
    toPoolCurrency(currency0),
    toPoolCurrency(currency1),
    fee,
    tickSpacing,
    (hooks || EMPTY_HOOKS) as Address,
  ])
  return keccak256(encoded)
}

/** V4 Quoter ABI (quoteExactInputSingle). Params: (PoolKey, bool, uint128, bytes). */
const QUOTER_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            components: [
              { name: 'currency0', type: 'address' },
              { name: 'currency1', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              { name: 'hooks', type: 'address' },
            ],
          },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'exactAmount', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const

/**
 * Single-pool quote: amountIn -> amountOut via V4 Quoter.
 * Uses simulateContract (revert-with-result pattern). Falls back to stub if RPC missing or pool missing.
 */
export async function quoteExactInputSingle(
  params: QuoteExactInputSingleParams
): Promise<bigint> {
  const { poolKey, zeroForOne, amountIn, hookData = '0x' } = params
  const inNum = BigInt(amountIn)
  const mockOut = zeroForOne
    ? inNum * 1800n * 1_000_000n
    : inNum / (1800n * 1_000_000n)

  if (!publicClient) return mockOut

  const quoterParams = {
    poolKey: {
      currency0: toPoolCurrency(poolKey.currency0) as Address,
      currency1: toPoolCurrency(poolKey.currency1) as Address,
      fee: poolKey.fee,
      tickSpacing: poolKey.tickSpacing,
      hooks: (poolKey.hooks || EMPTY_HOOKS) as Address,
    },
    zeroForOne,
    exactAmount: inNum > 0xffffffffffffffffffffffffffffffffn ? 0xffffffffffffffffffffffffffffffffn : inNum,
    hookData: (hookData === '0x00' || !hookData ? '0x' : hookData) as `0x${string}`,
  }

  try {
    const result = await publicClient.simulateContract({
      address: QUOTER_ADDRESS,
      abi: QUOTER_ABI,
      functionName: 'quoteExactInputSingle',
      args: [quoterParams],
      account: '0x0000000000000000000000000000000000000000' as Address,
    })
    return result.result[0]
  } catch {
    return mockOut
  }
}

/**
 * Multi-hop quote. Use Quoter.quoteExactInput in production.
 */
export async function quoteExactInput(params: QuoteExactInputParams): Promise<bigint> {
  const { amountIn } = params
  return BigInt(amountIn) * 1800n * 1_000_000n
}

const STATE_VIEW_ABI = [
  {
    name: 'getSlot0',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'protocolFee', type: 'uint24' },
      { name: 'lpFee', type: 'uint24' },
    ],
  },
  {
    name: 'getLiquidity',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: 'liquidity', type: 'uint128' }],
  },
] as const

/**
 * StateView.getSlot0(poolId). Returns sqrtPriceX96 and tick for price derivation.
 * Falls back to stub if RPC is missing or call fails (e.g. pool does not exist).
 */
export async function getSlot0(
  poolId: Hash | string
): Promise<{ sqrtPriceX96: bigint; tick: number }> {
  if (!publicClient) {
    return { sqrtPriceX96: 79228162514264337593543950336n * 1800n, tick: -200000 }
  }
  try {
    const [sqrtPriceX96, tick] = await publicClient.readContract({
      address: STATE_VIEW_ADDRESS,
      abi: STATE_VIEW_ABI,
      functionName: 'getSlot0',
      args: [poolId as Hash],
    })
    return { sqrtPriceX96, tick: Number(tick) }
  } catch {
    return { sqrtPriceX96: 79228162514264337593543950336n * 1800n, tick: -200000 }
  }
}

/**
 * StateView.getLiquidity(poolId). For price impact estimation.
 */
export async function getLiquidity(poolId: Hash | string): Promise<bigint> {
  if (!publicClient) return 1_000_000_000_000n
  try {
    const liquidity = await publicClient.readContract({
      address: STATE_VIEW_ADDRESS,
      abi: STATE_VIEW_ABI,
      functionName: 'getLiquidity',
      args: [poolId as Hash],
    })
    return liquidity
  } catch {
    return 1_000_000_000_000n
  }
}

/**
 * Convert Q64.96 sqrtPrice to human-readable price (token1 per token0 or token0 per token1).
 * zeroForOne true => price of token0 in terms of token1.
 */
export function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  token0Decimals: number,
  token1Decimals: number,
  zeroForOne: boolean
): string {
  const Q96 = 2n ** 96n
  const ratio = Number((sqrtPriceX96 * sqrtPriceX96) / (Q96 * Q96))
  const dec0 = 10 ** token0Decimals
  const dec1 = 10 ** token1Decimals
  const raw = ratio * (dec0 / dec1)
  const price = zeroForOne ? raw : 1 / raw
  return price.toFixed(6)
}

/**
 * Build Universal Router calldata for a swap (V4Planner). Returns calldata and value (hex).
 *
 * NOT YET IMPLEMENTED: Requires @uniswap/v4-sdk (V4Planner). Install and use:
 *   import { V4Planner } from '@uniswap/v4-sdk'
 *   planner.addSwapExactInSingle(...) or addSwapExactIn(...), then planner.encode()
 * Then send the returned calldata + value to the Universal Router via a wallet (e.g. Privy).
 */
export async function buildSwapCalldata(
  params: BuildSwapCalldataParams
): Promise<{ calldata: string; value: string }> {
  void params
  return {
    calldata: '0x',
    value: '0x0',
  }
}
