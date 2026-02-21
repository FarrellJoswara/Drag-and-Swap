/**
 * Vercel serverless API: execute a Uniswap swap on behalf of a user using the app's
 * Privy authorization key (server signer). No wallet popup — runs automatically.
 *
 * Requires: PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTH_PRIVATE_KEY (base64 PKCS8 or PEM).
 * User must have added the app's key quorum as a signer (Allow app to trade on my behalf).
 */

import { PrivyClient } from '@privy-io/node'

const UNISWAP_BASE = 'https://trade-api.gateway.uniswap.org/v1'
const UNISWAP_HEADERS = {
  'x-universal-router-version': '2.0',
  'x-api-key': 'STAsVqAhbG5xJWS2P_dSkvs6NvjLODkrSkmhvm9ehYA',
  'Content-Type': 'application/json',
} as const

// Minimal token/chain data for server-side param building (mirrors client TOKEN_ADDRESSES)
const TOKEN_ADDRESSES: Record<number, Record<string, string>> = {
  1: {
    ETH: '0x0000000000000000000000000000000000000000',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    ARB: '0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1',
    LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    MATIC: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
  },
  10: {
    ETH: '0x0000000000000000000000000000000000000000',
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    OP: '0x4200000000000000000000000000000000000042',
  },
  8453: {
    ETH: '0x0000000000000000000000000000000000000000',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  },
  42161: {
    ETH: '0x0000000000000000000000000000000000000000',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
  137: {
    ETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    MATIC: '0x0000000000000000000000000000000000001010',
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  },
}
const TOKEN_DECIMALS: Record<string, number> = {
  ETH: 18,
  USDC: 6,
  USDT: 6,
  WBTC: 8,
  DAI: 18,
  ARB: 18,
  OP: 18,
  LINK: 18,
  UNI: 18,
  MATIC: 18,
}
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/

function getChainsForToken(symbol: string): number[] {
  const chains: number[] = []
  for (const [chainIdStr, tokens] of Object.entries(TOKEN_ADDRESSES)) {
    const chainId = Number(chainIdStr)
    if (tokens[symbol]) chains.push(chainId)
  }
  return chains.sort((a, b) => (a === 1 ? -1 : b === 1 ? 1 : a - b))
}

function getChainForSwap(fromToken: string, toToken: string): number {
  const fromChains = getChainsForToken(fromToken)
  const toChains = getChainsForToken(toToken)
  const common = fromChains.filter((c) => toChains.includes(c))
  if (common.length === 0) throw new Error(`No chain supports both ${fromToken} and ${toToken}`)
  return common[0]
}

function resolveTokenAddress(symbol: string, chainId: number): string {
  const chainTokens = TOKEN_ADDRESSES[chainId]
  if (chainTokens?.[symbol]) return chainTokens[symbol]
  if (TOKEN_ADDRESSES[1]?.[symbol]) return TOKEN_ADDRESSES[1][symbol]
  if (ADDRESS_REGEX.test(symbol)) return symbol
  throw new Error(`Unknown token "${symbol}" on chain ${chainId}`)
}

function toSmallestUnit(amount: string, symbol: string): string {
  const decimals = TOKEN_DECIMALS[symbol] ?? 18
  let s = String(amount).trim()
  if (s.startsWith('.')) s = '0' + s
  const [whole, frac = ''] = s.split('.')
  const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals)
  const combined = (whole || '0') + fracPadded
  return combined.replace(/^0+/, '') || '0'
}

/** Convert PEM private key to base64 PKCS8 for Privy (if needed). */
function toBase64Pkcs8(key: string): string {
  const trimmed = key.trim()
  if (!trimmed.includes('-----BEGIN')) return trimmed
  const base64 = trimmed
    .replace(/-----BEGIN EC PRIVATE KEY-----/, '')
    .replace(/-----END EC PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const der = Buffer.from(base64, 'base64')
  return der.toString('base64')
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const appId = process.env.PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET
  const authPrivateKeyRaw = process.env.PRIVY_AUTH_PRIVATE_KEY
  if (!appId || !appSecret || !authPrivateKeyRaw) {
    return new Response(
      JSON.stringify({
        error: 'Server not configured for swap-on-behalf. Set PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTH_PRIVATE_KEY.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let body: {
    walletAddress: string
    fromToken?: string
    toToken?: string
    amount?: string
    amountDenomination?: string
  }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const walletAddress = String(body.walletAddress ?? '').trim()
  if (!ADDRESS_REGEX.test(walletAddress)) {
    return new Response(JSON.stringify({ error: 'Invalid walletAddress' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const fromToken = body.fromToken ?? 'ETH'
  const toToken = body.toToken ?? 'USDC'
  const amountRaw = String(body.amount ?? '1').trim() || '1'
  const amountDenomination = (body.amountDenomination ?? 'Token').toUpperCase()
  const chainId = getChainForSwap(fromToken, toToken)
  const toTokenChains = getChainsForToken(toToken)
  const tokenOutChainId = toTokenChains.includes(chainId) ? chainId : toTokenChains[0] ?? chainId
  const tokenIn = resolveTokenAddress(fromToken, chainId)
  const tokenOut = resolveTokenAddress(toToken, tokenOutChainId)
  const swapType = 'EXACT_INPUT'
  const amount =
    amountDenomination === 'USD'
      ? await usdToTokenAmountServer(amountRaw, fromToken, tokenIn, chainId, walletAddress)
      : toSmallestUnit(amountRaw, fromToken)

  const quoteBody = {
    type: swapType,
    amount,
    tokenInChainId: chainId,
    tokenOutChainId,
    tokenIn,
    tokenOut,
    swapper: walletAddress,
    generatePermitAsTransaction: false,
    autoSlippage: 'DEFAULT',
    routingPreference: 'BEST_PRICE',
    protocols: ['V2', 'V3', 'V4'],
    hooksOptions: 'V4_HOOKS_INCLUSIVE',
    spreadOptimization: 'EXECUTION',
    urgency: 'urgent',
    permitAmount: 'FULL',
  }

  const quoteRes = await fetch(`${UNISWAP_BASE}/quote`, {
    method: 'POST',
    headers: UNISWAP_HEADERS,
    body: JSON.stringify(quoteBody),
  })
  const quoteResponse = await quoteRes.json()
  if (quoteResponse?.errorCode) {
    return new Response(
      JSON.stringify({ error: quoteResponse.detail ?? `Quote failed: ${quoteResponse.errorCode}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if (!quoteResponse?.quote) {
    return new Response(JSON.stringify({ error: 'Invalid quote response' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const routing = String(quoteResponse.routing ?? '').toUpperCase()
  const isUniswapX = ['DUTCH_V2', 'DUTCH_V3', 'PRIORITY', 'LIMIT_ORDER'].includes(routing)
  if (isUniswapX) {
    return new Response(
      JSON.stringify({
        error: 'Gasless/UniswapX routing not supported for server signer. Use a chain/token that uses standard swap.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const NATIVE_ETH = '0x0000000000000000000000000000000000000000'
  const authPrivateKey = toBase64Pkcs8(authPrivateKeyRaw)
  const privy = new PrivyClient({ appId, appSecret })

  // Optional: token approval (if not native in)
  if (tokenIn.toLowerCase() !== NATIVE_ETH.toLowerCase()) {
    const approvalRes = await fetch(`${UNISWAP_BASE}/check_approval`, {
      method: 'POST',
      headers: UNISWAP_HEADERS,
      body: JSON.stringify({
        walletAddress,
        token: tokenIn,
        amount,
        chainId,
        tokenOut,
        tokenOutChainId,
      }),
    })
    const approvalData = await approvalRes.json()
    if (!approvalData?.errorCode && approvalData?.approval?.to && approvalData?.approval?.data) {
      const walletId = await resolveWalletId(privy, walletAddress)
      if (walletId) {
        await privy.wallets().ethereum().sendTransaction(walletId, {
          caip2: `eip155:${approvalData.approval.chainId}`,
          params: {
            transaction: {
              to: approvalData.approval.to,
              from: approvalData.approval.from,
              data: approvalData.approval.data,
              value: approvalData.approval.value ?? '0',
              chain_id: approvalData.approval.chainId,
              gas_limit: approvalData.approval.gasLimit,
            },
          },
          authorization_context: { authorization_private_keys: [authPrivateKey] },
        })
      }
    }
  }

  const swapPayload = (() => {
    const { permitData: pd, permitTransaction: pt, ...clean } = quoteResponse
    return { ...clean, ...(pd && typeof pd === 'object' ? { permitData: pd } : {}), includeGasInfo: false, refreshGasPrice: false, simulateTransaction: false, safetyMode: 'SAFE', urgency: 'urgent' }
  })()

  const swapRes = await fetch(`${UNISWAP_BASE}/swap`, {
    method: 'POST',
    headers: UNISWAP_HEADERS,
    body: JSON.stringify(swapPayload),
  })
  const swapResponse = await swapRes.json()
  if (swapResponse?.errorCode) {
    return new Response(
      JSON.stringify({ error: swapResponse.detail ?? `Swap failed: ${swapResponse.errorCode}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const swapTx = swapResponse?.swap
  if (!swapTx?.to || !swapTx?.data) {
    return new Response(JSON.stringify({ error: 'No swap transaction in response' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const walletId = await resolveWalletId(privy, walletAddress)
  if (!walletId) {
    return new Response(
      JSON.stringify({ error: 'Could not resolve wallet ID for address. User may need to add server signer first.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const result = await privy.wallets().ethereum().sendTransaction(walletId, {
      caip2: `eip155:${swapTx.chainId}`,
      params: {
        transaction: {
          to: swapTx.to,
          from: swapTx.from,
          data: swapTx.data,
          value: swapTx.value ?? '0',
          chain_id: swapTx.chainId,
          gas_limit: swapTx.gasLimit,
        },
      },
      authorization_context: { authorization_private_keys: [authPrivateKey] },
    })

    const txHash = result?.hash ?? ''
    const amountOut = swapResponse?.quote?.output?.amount ?? swapResponse?.quote?.outputAmount ?? ''
    return new Response(
      JSON.stringify({ txHash, amountOut, gasUsed: swapTx.gasLimit ?? '' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function resolveWalletId(privy: PrivyClient, walletAddress: string): Promise<string | null> {
  try {
    const users = privy.users() as { getByWalletAddress?: (p: { address: string }) => Promise<{ id: string; linked_accounts?: Array<{ address?: string; wallet_id?: string; id?: string }> }> }
    const user = await users.getByWalletAddress?.({ address: walletAddress })
    if (!user) return null
    const la = user.linked_accounts ?? []
    for (const acc of la) {
      if (acc.address?.toLowerCase() === walletAddress.toLowerCase() && (acc.wallet_id ?? acc.id))
        return acc.wallet_id ?? acc.id ?? null
    }
    const firstPage = await privy.wallets().list({ user_id: user.id })
    const items = (firstPage as { data?: Array<{ id?: string; address?: string }> }).data ?? (firstPage as { getPaginatedItems?: () => Array<{ id?: string; address?: string }> }).getPaginatedItems?.() ?? []
    for (const w of items) {
      if (w.address?.toLowerCase() === walletAddress.toLowerCase()) return w.id ?? null
    }
  } catch {
    // ignore
  }
  return null
}

async function usdToTokenAmountServer(
  usdAmount: string,
  tokenSymbol: string,
  tokenAddress: string,
  chainId: number,
  swapper: string
): Promise<string> {
  const usdcAddress = TOKEN_ADDRESSES[chainId]?.USDC ?? TOKEN_ADDRESSES[1]?.USDC
  if (!usdcAddress) throw new Error('USDC not supported on this chain')
  const oneToken = '1' + '0'.repeat(TOKEN_DECIMALS[tokenSymbol] ?? 18)
  const priceRes = await fetch(`${UNISWAP_BASE}/quote`, {
    method: 'POST',
    headers: UNISWAP_HEADERS,
    body: JSON.stringify({
      type: 'EXACT_INPUT',
      amount: oneToken,
      tokenInChainId: chainId,
      tokenOutChainId: chainId,
      tokenIn: tokenAddress,
      tokenOut: usdcAddress,
      swapper,
      autoSlippage: 'DEFAULT',
      routingPreference: 'BEST_PRICE',
      protocols: ['V2', 'V3', 'V4'],
      urgency: 'urgent',
      permitAmount: 'FULL',
    }),
  })
  const priceQuote = await priceRes.json()
  if (priceQuote?.errorCode) throw new Error(priceQuote.detail ?? 'Price quote failed')
  const quote = priceQuote?.quote ?? priceQuote
  const amountOutUsdc = quote?.output?.amount ?? quote?.outputAmount ?? '0'
  const pricePerTokenUsd = Number(amountOutUsdc) / 1e6
  if (pricePerTokenUsd <= 0) throw new Error('Could not fetch token price')
  const usd = Number(usdAmount)
  if (!Number.isFinite(usd) || usd <= 0) throw new Error('Invalid USD amount')
  const tokenAmountHuman = usd / pricePerTokenUsd
  return toSmallestUnit(String(tokenAmountHuman), tokenSymbol)
}
