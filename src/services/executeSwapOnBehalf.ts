/**
 * Client: call the server to execute a swap on behalf of the user (no wallet popup).
 * Requires server to be configured (PRIVY_AUTH_PRIVATE_KEY, etc.) and user to have
 * added the app's key quorum as a signer.
 */

export type ExecuteSwapOnBehalfParams = {
  walletAddress: string
  fromToken: string
  toToken: string
  amount: string
  amountDenomination: string
}

export type ExecuteSwapOnBehalfResult = {
  txHash: string
  amountOut: string
  gasUsed: string
}

export async function executeSwapOnBehalf(
  params: ExecuteSwapOnBehalfParams
): Promise<ExecuteSwapOnBehalfResult> {
  const res = await fetch('/api/execute-swap-on-behalf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletAddress: params.walletAddress,
      fromToken: params.fromToken,
      toToken: params.toToken,
      amount: params.amount,
      amountDenomination: params.amountDenomination,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error ?? `Server returned ${res.status}`)
  }
  return {
    txHash: data.txHash ?? '',
    amountOut: data.amountOut ?? '',
    gasUsed: data.gasUsed ?? '',
  }
}
