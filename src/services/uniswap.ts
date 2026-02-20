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

// Token symbol -> address per chain. Native ETH = 0x000...000
const TOKEN_ADDRESSES: Record<number, Record<string, string>> = {
  1: {
    ETH: '0x0000000000000000000000000000000000000000',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    DAI: '0x6B175474E89094C44Da98b954Ee5cdeEF5FD7E5',
    ARB: '0xB50721BCf8d2c2919978F6619623101632BEC1ef',
    OP: '0x4200000000000000000000000000000000000042',
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

function resolveTokenAddress(symbol: string, chainId: number): string {
  const chainTokens = TOKEN_ADDRESSES[chainId]
  if (chainTokens?.[symbol]) return chainTokens[symbol]
  if (TOKEN_ADDRESSES[1]?.[symbol]) return TOKEN_ADDRESSES[1][symbol]
  if (/^0x[a-fA-F0-9]{40}$/.test(symbol)) return symbol
  throw new Error(`Unknown token "${symbol}" on chain ${chainId}`)
}

function toSmallestUnit(amount: string, symbol: string): string {
  const decimals = TOKEN_DECIMALS[symbol] ?? 18
  const [whole, frac = ''] = String(amount).split('.')
  const padded = whole + frac.padEnd(decimals, '0').slice(0, decimals)
  return padded.replace(/^0+/, '') || '0'
}

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/

/** Valid chain IDs for Uniswap Trading API */
const VALID_CHAIN_IDS = new Set([1, 10, 137, 42161, 56, 8453, 81457, 43114, 42220, 7777777, 324, 11155111, 1301, 480, 84532, 130, 1868, 143, 196])

const NUMERIC_AMOUNT_REGEX = /^\d+(\.\d+)?$/

function blockInputsToApiParams(inputs: Record<string, string>) {
  const rawChainId = inputs.chainId ?? '1'
  const chainId = VALID_CHAIN_IDS.has(Number(rawChainId)) ? Number(rawChainId) : 1
  const swapper = String(inputs.swapper ?? '').trim()
  if (!swapper || !ADDRESS_REGEX.test(swapper)) {
    throw new Error('Wallet Address is required. Enter a 0x... address, or sign in with Privy to use your connected wallet.')
  }
  let rawAmount = String(inputs.amount ?? '0').trim()
  if (!rawAmount || !NUMERIC_AMOUNT_REGEX.test(rawAmount) || Number(rawAmount) <= 0) {
    console.warn('[swap] Amount invalid (e.g. from trigger connection). Using 1. Enter a fixed value in the Amount field or connect a block that outputs a number.')
    rawAmount = '1'
  }
  return {
    amount: toSmallestUnit(rawAmount, inputs.fromToken || 'ETH'),
    tokenInChainId: chainId,
    tokenOutChainId: chainId,
    tokenIn: resolveTokenAddress(inputs.fromToken || 'ETH', chainId),
    tokenOut: resolveTokenAddress(inputs.toToken || 'USDC', chainId),
    swapper,
  }
}

async function getQuote(amount: string, tokenInChainId: number, tokenOutChainId: number, tokenIn: string, tokenOut: string, swapper: string) {
    const options = {
        method: 'POST',
        headers: {
            'x-universal-router-version': '2.0',
            'x-api-key': 'STAsVqAhbG5xJWS2P_dSkvs6NvjLODkrSkmhvm9ehYA',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            type: 'EXACT_INPUT',
            amount: amount, // Input
            tokenInChainId: tokenInChainId, // Input
            tokenOutChainId: tokenOutChainId, // Input
            tokenIn: tokenIn, // Input
            tokenOut: tokenOut, // Input
            swapper: swapper, // Input
            generatePermitAsTransaction: false,
            autoSlippage: 'DEFAULT',
            routingPreference: 'BEST_PRICE',
            protocols: ['V2'],
            hooksOptions: 'V4_HOOKS_INCLUSIVE',
            spreadOptimization: 'EXECUTION',
            urgency: 'urgent',
            permitAmount: 'FULL'
        })
    }
    return fetch('/api/uniswap/quote', options).then(res => res.json())
}

export type SwapContext = {
  sendTransaction?: ((tx: { to: string; from: string; data: string; value: string; chainId: number; gasLimit?: string }) => Promise<string>) | null
}

export async function swap(inputs: Record<string, string>, context?: SwapContext) {
    const params = blockInputsToApiParams(inputs)
    const quoteResponse = await getQuote(params.amount, params.tokenInChainId, params.tokenOutChainId, params.tokenIn, params.tokenOut, params.swapper)

    if (quoteResponse?.errorCode) {
        throw new Error(quoteResponse.detail ?? `Quote failed: ${quoteResponse.errorCode}`)
    }
    if (!quoteResponse?.quote) {
        throw new Error('Invalid quote response - missing quote data')
    }
    const options = {
        method: 'POST',
        headers: {
            'x-universal-router-version': '2.0',
            'x-api-key': 'STAsVqAhbG5xJWS2P_dSkvs6NvjLODkrSkmhvm9ehYA',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify((() => {
            const { permitData: pd, permitTransaction: pt, ...clean } = quoteResponse
            return { ...clean, ...(pd && typeof pd === 'object' ? { permitData: pd } : {}), includeGasInfo: false, refreshGasPrice: false, simulateTransaction: false, safetyMode: 'SAFE', urgency: 'urgent' }
        })())
    };
    const swapResponse = await fetch('/api/uniswap/swap', options).then(res => res.json())

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