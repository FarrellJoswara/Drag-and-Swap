import { useCallback } from 'react'
import { createWalletClient, custom } from 'viem'
import { mainnet, optimism, base, arbitrum, polygon } from 'viem/chains'
import { useWallets } from '@privy-io/react-auth'

export type SwapTx = {
  to: string
  from: string
  data: string
  value: string
  chainId: number
  gasLimit?: string
}

const CHAINS = [mainnet, optimism, base, arbitrum, polygon] as const

/**
 * Returns a function to send a transaction using the connected Privy wallet.
 * Use for executing Uniswap swap transactions. Returns null when no wallet is connected.
 */
export function useSendTransaction(): ((tx: SwapTx) => Promise<string>) | null {
  const { wallets } = useWallets()

  const sendTx = useCallback(
    async (tx: SwapTx): Promise<string> => {
      const wallet = wallets?.[0] as { address?: string; getEthereumProvider?: () => Promise<unknown>; switchChain?: (chainId: number) => Promise<void> } | undefined
      if (!wallet?.address || !wallet.getEthereumProvider) {
        throw new Error('No wallet connected. Sign in with Privy to execute swaps.')
      }

      if (wallet.switchChain) {
        await wallet.switchChain(tx.chainId)
      }

      const provider = await wallet.getEthereumProvider()
      const chain = CHAINS.find((c) => c.id === tx.chainId) ?? mainnet

      const walletClient = createWalletClient({
        account: wallet.address as `0x${string}`,
        chain,
        transport: custom(provider as import('viem').EIP1193Provider),
      })

      const hash = await walletClient.sendTransaction({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: BigInt(tx.value || '0'),
        gas: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
      })

      return hash
    },
    [wallets],
  )

  return wallets?.[0] ? sendTx : null
}
