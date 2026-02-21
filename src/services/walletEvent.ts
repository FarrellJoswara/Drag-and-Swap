/**
 * Wallet / contract event trigger using viem.
 * Subscribes to contract events (e.g. ERC20 Transfer) and fires the flow.
 */

import { createPublicClient, http, type Chain } from 'viem'
import { mainnet, arbitrum, base } from 'viem/chains'

const chains: Record<number, Chain> = {
  1: mainnet,
  42161: arbitrum,
  8453: base,
}

const transferAbi = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const

function getClient(chainId: number, rpcUrl?: string) {
  const chain = chains[chainId] ?? mainnet
  return createPublicClient({
    chain,
    transport: rpcUrl ? http(rpcUrl) : http(),
  })
}

export type Unsubscribe = () => void

export function subscribeToTransfer(
  inputs: Record<string, string>,
  onTrigger: (outputs: Record<string, string>) => void,
): Unsubscribe {
  const chainId = Number(inputs.chainId ?? '1')
  const address = (inputs.contractAddress ?? '').trim() as `0x${string}`
  const filterWallet = (inputs.filterWallet ?? '').trim().toLowerCase()
  const rpcUrl = (inputs.rpcUrl ?? '').trim() || undefined

  if (!address || !address.startsWith('0x')) {
    console.warn('[walletEvent] Invalid contract address')
    return () => {}
  }

  const client = getClient(chainId, rpcUrl)

  const unwatch = client.watchContractEvent({
    address,
    abi: transferAbi,
    eventName: 'Transfer',
    onLogs: (logs) => {
      for (const log of logs) {
        const args = (log as { args?: { from?: string; to?: string; value?: bigint } }).args
        if (!args) continue
        const from = (args.from ?? '').toLowerCase()
        const to = (args.to ?? '').toLowerCase()
        if (filterWallet && from !== filterWallet && to !== filterWallet) continue
        onTrigger({
          from: args.from ?? '',
          to: args.to ?? '',
          value: String(args.value ?? 0),
          txHash: log.transactionHash ?? '',
          blockNumber: String(log.blockNumber ?? 0),
        })
      }
    },
    onError: (err) => console.error('[walletEvent]', err),
  })

  return () => unwatch()
}
