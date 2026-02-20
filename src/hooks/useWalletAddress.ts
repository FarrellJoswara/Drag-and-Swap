import { usePrivy, useWallets } from '@privy-io/react-auth'

/** Get the primary wallet address from Privy user/wallets */
export function useWalletAddress(): string | null {
  const { user } = usePrivy()
  const { wallets } = useWallets()

  if (!user) return null

  // Prefer embedded wallet from user
  const embedded = (user as { wallet?: { address?: string } }).wallet
  if (embedded?.address) return embedded.address

  // Fallback: first connected wallet from useWallets
  const primary = wallets?.[0] as { address?: string } | undefined
  if (primary?.address) return primary.address

  return null
}
