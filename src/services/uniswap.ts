// async function getQuote(amount: string, tokenInChainId: number, tokenOutChainId: number, tokenIn: string, tokenOut: string, swapper: string) {
//     const options = {
//         method: 'POST',
//         headers: {
//             'x-universal-router-version': '2.0',
//             'x-api-key': 'STAsVqAhbG5xJWS2P_dSkvs6NvjLODkrSkmhvm9ehYA',
//             'Content-Type': 'application/json'
//         },
//         body: JSON.stringify({
//             type: 'EXACT_INPUT',
//             amount: amount, // Input
//             tokenInChainId: tokenInChainId, // Input
//             tokenOutChainId: tokenOutChainId, // Input
//             tokenIn: tokenIn, // Input
//             tokenOut: tokenOut, // Input
//             swapper: swapper, // Input
//             generatePermitAsTransaction: false,
//             autoSlippage: 'DEFAULT',
//             routingPreference: 'BEST_PRICE',
//             protocols: ['V2'],
//             hooksOptions: 'V4_HOOKS_INCLUSIVE',
//             spreadOptimization: 'EXECUTION',
//             urgency: 'urgent',
//             permitAmount: 'FULL'
//         })
//     }
//     return fetch('https://trade-api.gateway.uniswap.org/v1/quote', options).then(res => res.json())
// }

// export async function swap(amount: string, tokenInChainId: number, tokenOutChainId: number, tokenIn: string, tokenOut: string, swapper: string) {
//     const quote = await getQuote(amount, Number(tokenInChainId), Number(tokenOutChainId), tokenIn, tokenOut, swapper)
//     console.log('quote', quote)
//     const options = {
//         method: 'POST',
//         headers: {
//             'x-universal-router-version': '2.0',
//             'x-api-key': 'STAsVqAhbG5xJWS2P_dSkvs6NvjLODkrSkmhvm9ehYA',
//             'Content-Type': 'application/json'
//         },
//         body: JSON.stringify({
//             quote: quote.quote,
//             // signature: quote.signature,
//             includeGasInfo: false,
//             refreshGasPrice: false,
//             simulateTransaction: false,
//             // permitData: { domain: {}, values: {}, types: {} },
//             safetyMode: 'SAFE',
//             // deadline: Date.now() + 1000 * 60 * 60 * 24,
//             urgency: 'urgent'
//         })
//     };
//     return fetch('https://trade-api.gateway.uniswap.org/v1/swap', options).then(res => res.json())
// }

/** Token symbol -> address per chain. Native ETH = 0x000...000. Exported for chain auto-selection. */
export const TOKEN_ADDRESSES: Record<number, Record<string, string>> = {
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
  10: { ETH: '0x0000000000000000000000000000000000000000', USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', OP: '0x4200000000000000000000000000000000000042' },
  8453: { ETH: '0x0000000000000000000000000000000000000000', USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' },
  42161: { ETH: '0x0000000000000000000000000000000000000000', USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548' },
  137: { ETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', MATIC: '0x0000000000000000000000000000000000001010', USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
}

const TOKEN_DECIMALS: Record<string, number> = {
  ETH: 18, USDC: 6, USDT: 6, WBTC: 8, DAI: 18, ARB: 18, OP: 18, LINK: 18, UNI: 18, MATIC: 18,
}

/** Chain IDs that support a given token symbol. Prefer ETH mainnet (1) when available. */
export function getChainsForToken(symbol: string): number[] {
  const chains: number[] = []
  for (const [chainIdStr, tokens] of Object.entries(TOKEN_ADDRESSES)) {
    const chainId = Number(chainIdStr)
    if (tokens[symbol] && !chains.includes(chainId)) chains.push(chainId)
  }
  return chains.sort((a, b) => (a === 1 ? -1 : b === 1 ? 1 : a - b))
}

/** Chain that supports both tokens. Prefers Ethereum (1) when available. */
export function getChainForSwap(fromToken: string, toToken: string): number {
  const fromChains = getChainsForToken(fromToken)
  const toChains = getChainsForToken(toToken)
  const common = fromChains.filter((c) => toChains.includes(c))
  if (common.length === 0) {
    throw new Error(`No chain supports both ${fromToken} and ${toToken}. Try different tokens.`)
  }
  return common[0]
}

function resolveTokenAddress(symbol: string, chainId: number): string {
  const chainTokens = TOKEN_ADDRESSES[chainId]
  if (chainTokens?.[symbol]) return chainTokens[symbol]
  if (TOKEN_ADDRESSES[1]?.[symbol]) return TOKEN_ADDRESSES[1][symbol]
  if (/^0x[a-fA-F0-9]{40}$/.test(symbol)) return symbol
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

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/
const NATIVE_ETH = '0x0000000000000000000000000000000000000000'

async function checkApproval(
  walletAddress: string,
  token: string,
  amount: string,
  chainId: number,
  tokenOut?: string,
  tokenOutChainId?: number
): Promise<{ approval: { to: string; from: string; data: string; value: string; chainId: number; gasLimit?: string } | null }> {
  const body: Record<string, unknown> = {
    walletAddress,
    token,
    amount,
    chainId,
  }
  if (tokenOut) body.tokenOut = tokenOut
  if (tokenOutChainId) body.tokenOutChainId = tokenOutChainId

  const res = await fetch('/api/uniswap/check_approval', {
    method: 'POST',
    headers: UNISWAP_HEADERS,
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (data?.errorCode) throw new Error(data.detail ?? `Check approval failed: ${data.errorCode}`)
  return { approval: data.approval ?? null }
}

/** Allows integers, decimals, and leading-decimal fractions like .000001 */
const NUMERIC_AMOUNT_REGEX = /^(\d+\.?\d*|\.\d+)$/

const UNISWAP_HEADERS = {
  'x-universal-router-version': '2.0',
  'x-api-key': 'STAsVqAhbG5xJWS2P_dSkvs6NvjLODkrSkmhvm9ehYA',
  'Content-Type': 'application/json',
} as const

async function usdToTokenAmount(
  usdAmount: string,
  tokenSymbol: string,
  tokenAddress: string,
  chainId: number,
  swapper: string
): Promise<string> {
  const decimals = TOKEN_DECIMALS[tokenSymbol] ?? 18
  const oneToken = '1' + '0'.repeat(decimals)
  const usdcAddress = TOKEN_ADDRESSES[chainId]?.USDC ?? TOKEN_ADDRESSES[1]?.USDC
  if (!usdcAddress) throw new Error('USDC not supported on this chain for USD conversion')

  const priceQuote = await fetch('/api/uniswap/quote', {
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
  }).then((r) => r.json())

  if (priceQuote?.errorCode) {
    throw new Error(priceQuote.detail ?? `Price quote failed: ${priceQuote.errorCode}`)
  }

  const quote = priceQuote?.quote ?? priceQuote
  const amountOutUsdc = quote?.output?.amount ?? quote?.outputAmount ?? '0'
  const pricePerTokenUsd = Number(amountOutUsdc) / 1e6
  if (pricePerTokenUsd <= 0) throw new Error('Could not fetch token price')

  const usd = Number(usdAmount)
  if (!Number.isFinite(usd) || usd <= 0) throw new Error('Invalid USD amount')

  const tokenAmountHuman = usd / pricePerTokenUsd
  return toSmallestUnit(String(tokenAmountHuman), tokenSymbol)
}

export function blockInputsToApiParams(inputs: Record<string, string>): Promise<{
  amount: string
  tokenInChainId: number
  tokenOutChainId: number
  tokenIn: string
  tokenOut: string
  swapper: string
  type: 'EXACT_INPUT' | 'EXACT_OUTPUT'
  protocols: string[]
  routingPreference: string
}> {
  const fromToken = inputs.fromToken || 'ETH'
  const toToken = inputs.toToken || 'USDC'
  const chainId = getChainForSwap(fromToken, toToken)
  const toTokenChains = getChainsForToken(toToken)
  const tokenOutChainId = toTokenChains.includes(chainId) ? chainId : (toTokenChains[0] ?? chainId)

  const swapper = String(inputs.swapper ?? '').trim()
  if (!swapper || !ADDRESS_REGEX.test(swapper)) {
    throw new Error('Wallet must be connected. Sign in with Privy to execute swaps.')
  }
  let rawAmount = String(inputs.amount ?? '0').trim()
  if (!rawAmount || !NUMERIC_AMOUNT_REGEX.test(rawAmount) || Number(rawAmount) <= 0) {
    console.warn('[swap] Amount invalid. Using 1.')
    rawAmount = '1'
  }

  const swapType = (inputs.swapType ?? 'EXACT_INPUT').toUpperCase() as 'EXACT_INPUT' | 'EXACT_OUTPUT'
  const amountDenomination = (inputs.amountDenomination ?? 'Token').toUpperCase()

  const protocolsStr = inputs.protocols ?? 'V2,V3,V4'
  const protocols = protocolsStr.split(',').map((p) => p.trim()).filter(Boolean)
  if (protocols.length === 0) protocols.push('V2', 'V3', 'V4')
  const routingPreference = inputs.routingPreference ?? 'BEST_PRICE'

  const base = {
    tokenInChainId: chainId,
    tokenOutChainId,
    tokenIn: resolveTokenAddress(fromToken, chainId),
    tokenOut: resolveTokenAddress(toToken, tokenOutChainId),
    swapper,
    type: swapType,
    protocols,
    routingPreference,
  }

  if (amountDenomination === 'USD') {
    const tokenSymbol = swapType === 'EXACT_INPUT' ? fromToken : toToken
    const tokenAddress = resolveTokenAddress(tokenSymbol, chainId)
    return usdToTokenAmount(rawAmount, tokenSymbol, tokenAddress, chainId, swapper).then((amount) => ({
      ...base,
      amount,
    }))
  }

  const amount = toSmallestUnit(rawAmount, swapType === 'EXACT_INPUT' ? fromToken : toToken)
  return Promise.resolve({ ...base, amount })
}

export async function getQuote(params: {
  amount: string
  tokenInChainId: number
  tokenOutChainId: number
  tokenIn: string
  tokenOut: string
  swapper: string
  type: 'EXACT_INPUT' | 'EXACT_OUTPUT'
  protocols: string[]
  routingPreference: string
}) {
  const body = {
    type: params.type,
    amount: params.amount,
    tokenInChainId: params.tokenInChainId,
    tokenOutChainId: params.tokenOutChainId,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    swapper: params.swapper,
    generatePermitAsTransaction: false,
    autoSlippage: 'DEFAULT',
    routingPreference: params.routingPreference,
    protocols: params.protocols,
    hooksOptions: 'V4_HOOKS_INCLUSIVE',
    spreadOptimization: 'EXECUTION',
    urgency: 'urgent',
    permitAmount: 'FULL',
  }
  const res = await fetch('/api/uniswap/quote', {
    method: 'POST',
    headers: UNISWAP_HEADERS,
    body: JSON.stringify(body),
  })
  return res.json()
}

const UNISWAPX_ROUTINGS = new Set(['DUTCH_V2', 'DUTCH_V3', 'PRIORITY', 'LIMIT_ORDER'])

export type SwapContext = {
  sendTransaction?: ((tx: { to: string; from: string; data: string; value: string; chainId: number; gasLimit?: string }) => Promise<string>) | null
  signTypedData?: ((params: { domain: object; types: Record<string, Array<{ name: string; type: string }>>; primaryType: string; message: Record<string, unknown> }) => Promise<string>) | null
  /** When set, swap is executed on the server (no wallet approval popup). */
  sendTransactionServer?: ((params: { walletAddress: string; fromToken: string; toToken: string; amount: string; amountDenomination: string }) => Promise<{ txHash: string; amountOut: string; gasUsed: string }>) | null
}

export async function swap(inputs: Record<string, string>, context?: SwapContext) {
  const params = await blockInputsToApiParams(inputs)

  // Server signer path: execute swap on backend (no popup). Used by "Trade on my behalf" block (always) or when swap block has useServerSigner.
  const useServer = inputs.useServerSigner === 'true'
  if (useServer && context?.sendTransactionServer && params.swapper && ADDRESS_REGEX.test(params.swapper)) {
    const result = await context.sendTransactionServer({
      walletAddress: params.swapper,
      fromToken: inputs.fromToken ?? 'ETH',
      toToken: inputs.toToken ?? 'USDC',
      amount: inputs.amount ?? '1',
      amountDenomination: inputs.amountDenomination ?? 'Token',
    })
    return result
  }

  if (
    params.tokenIn.toLowerCase() !== NATIVE_ETH.toLowerCase() &&
    context?.sendTransaction
  ) {
    const { approval } = await checkApproval(
      params.swapper,
      params.tokenIn,
      params.amount,
      params.tokenInChainId,
      params.tokenOut,
      params.tokenOutChainId
    )
    if (approval?.to && approval?.data) {
      await context.sendTransaction({
        to: approval.to,
        from: approval.from,
        data: approval.data,
        value: approval.value ?? '0',
        chainId: approval.chainId,
        gasLimit: approval.gasLimit,
      })
    }
  }

  const quoteResponse = await getQuote(params)

  if (quoteResponse?.errorCode) {
    throw new Error(quoteResponse.detail ?? `Quote failed: ${quoteResponse.errorCode}`)
  }
  if (!quoteResponse?.quote) {
    throw new Error('Invalid quote response - missing quote data')
  }

  const routing = String(quoteResponse.routing ?? '').toUpperCase()
  const isUniswapX = UNISWAPX_ROUTINGS.has(routing)
  const permitData = quoteResponse.permitData as { domain?: object; types?: Record<string, Array<{ name: string; type: string }>>; primaryType?: string; message?: Record<string, unknown>; value?: Record<string, unknown> } | undefined

  if (isUniswapX && permitData && context?.signTypedData) {
    const { domain, types, primaryType } = permitData
    const message = permitData.message ?? permitData.value
    if (!domain || !types || !primaryType || !message) {
      throw new Error('UniswapX quote missing permitData (domain, types, primaryType, message)')
    }
    const signature = await context.signTypedData({
      domain: domain as { name?: string; version?: string; chainId?: number; verifyingContract?: `0x${string}` },
      types,
      primaryType,
      message,
    })
    const orderHeaders = { ...UNISWAP_HEADERS } as Record<string, string>
    if (params.tokenIn.toLowerCase() === NATIVE_ETH.toLowerCase()) {
      orderHeaders['x-erc20eth-enabled'] = 'true'
    }
    const orderResponse = await fetch('/api/uniswap/order', {
      method: 'POST',
      headers: orderHeaders,
      body: JSON.stringify({ ...quoteResponse, signature }),
    }).then((r) => r.json())
    if (orderResponse?.errorCode) {
      throw new Error(orderResponse.detail ?? `Order failed: ${orderResponse.errorCode}`)
    }
    const amountOut = quoteResponse?.quote?.output?.amount ?? quoteResponse?.quote?.outputAmount ?? ''
    return {
      txHash: orderResponse.orderId ?? '',
      amountOut: String(amountOut),
      gasUsed: '0',
    }
  }

  if (isUniswapX && !context?.signTypedData) {
    throw new Error('Sign in with Privy to submit the gasless order. Your wallet is required to sign the permit.')
  }

  const swapOptions = {
    method: 'POST',
    headers: UNISWAP_HEADERS,
    body: JSON.stringify((() => {
      const { permitData: pd, permitTransaction: pt, ...clean } = quoteResponse
      return { ...clean, ...(pd && typeof pd === 'object' ? { permitData: pd } : {}), includeGasInfo: false, refreshGasPrice: false, simulateTransaction: false, safetyMode: 'SAFE', urgency: 'urgent' }
    })()),
  }
  const swapResponse = await fetch('/api/uniswap/swap', swapOptions).then((res) => res.json())

  if (swapResponse?.errorCode) {
    throw new Error(swapResponse.detail ?? `Swap failed: ${swapResponse.errorCode}`)
  }

  const swapTx = swapResponse?.swap
  if (swapTx?.to && swapTx?.data && context?.sendTransaction) {
    const txHash = await context.sendTransaction({
      to: swapTx.to,
      from: swapTx.from,
      data: swapTx.data,
      value: swapTx.value ?? '0',
      chainId: swapTx.chainId,
      gasLimit: swapTx.gasLimit,
    })
    const amountOut = swapResponse?.quote?.output?.amount ?? ''
    return { txHash, amountOut, gasUsed: swapTx.gasLimit ?? '' }
  }

  if (swapTx?.to && swapTx?.data && !context?.sendTransaction) {
    throw new Error('Sign in with Privy to execute the swap. Your wallet is required to sign the transaction.')
  }

  return {
    txHash: '',
    amountOut: swapResponse?.quote?.output?.amount ?? '',
    gasUsed: swapTx?.gasLimit ?? '',
  }
}

// const main = async () => {
//     const amount = '1000000000000000000' // Input
//     const tokenInChainId = 1
//     const tokenOutChainId = 1
//     const tokenIn = '0x0000000000000000000000000000000000000000'
//     const tokenOut = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
//     const swapper = '0x27677cD05185395be6DCe86b1c251410EC3c6239'

//     const swapResponse = await swap(amount, tokenInChainId, tokenOutChainId, tokenIn, tokenOut, swapper)
//     console.log('swapResponse', swapResponse)
// }

// main()