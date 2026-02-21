import { useCallback } from 'react'
import { createWalletClient, custom } from 'viem'
import { mainnet, optimism, base, arbitrum, polygon } from 'viem/chains'
import { useWallets } from '@privy-io/react-auth'

export type SignTypedDataParams = {
  domain: { name?: string; version?: string; chainId?: number; verifyingContract?: `0x${string}` }
  types: Record<string, Array<{ name: string; type: string }>>
  primaryType: string
  message: Record<string, unknown>
}

const CHAINS = [mainnet, optimism, base, arbitrum, polygon] as const

/**
 * Returns a function to sign EIP-712 typed data using the connected Privy wallet.
 * Used for UniswapX gasless orders (permit signature). Returns null when no wallet is connected.
 */
export function useSignTypedData(): ((params: SignTypedDataParams) => Promise<string>) | null {
  const { wallets } = useWallets()

  const signTypedData = useCallback(
    async (params: SignTypedDataParams): Promise<string> => {
      const wallet = wallets?.[0] as { address?: string; getEthereumProvider?: () => Promise<unknown> } | undefined
      if (!wallet?.address || !wallet.getEthereumProvider) {
        throw new Error('No wallet connected. Sign in with Privy to sign orders.')
      }

      const provider = await wallet.getEthereumProvider()
      const chainId = params.domain?.chainId ?? 1
      const chain = CHAINS.find((c) => c.id === chainId) ?? mainnet

      const walletClient = createWalletClient({
        account: wallet.address as `0x${string}`,
        chain,
        transport: custom(provider as import('viem').EIP1193Provider),
      })

      const signature = await walletClient.signTypedData({
        account: wallet.address as `0x${string}`,
        domain: params.domain,
        types: params.types,
        primaryType: params.primaryType,
        message: params.message as Record<string, unknown>,
      })

      return signature
    },
    [wallets],
  )

  return wallets?.[0] ? signTypedData : null
}
