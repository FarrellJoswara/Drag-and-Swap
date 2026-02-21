import { useCallback, useState } from 'react'
import { useSigners, usePrivy } from '@privy-io/react-auth'
import { PRIVY_KEY_QUORUM_ID } from '../utils/privy'

export type AddServerSignerResult = { success: boolean; error?: string }

/**
 * Hook to add the app's server signer (key quorum) to the user's embedded wallet.
 * Enables "trade on my behalf": your server can execute transactions from the user's wallet
 * when they're offline (e.g. limit orders, rebalancing). Requires VITE_PRIVY_KEY_QUORUM_ID.
 * See https://docs.privy.io/recipes/wallets/user-and-server-signers
 *
 * "Address to add signers to is not associated with current user": the address must be the
 * user's Privy embedded wallet (from linked_accounts with wallet_client === 'privy'), not an external wallet.
 */
export function useAddServerSigner(): {
  addServerSigner: () => Promise<AddServerSignerResult>
  isLoading: boolean
  isAvailable: boolean
  error: string | null
} {
  const { addSigners } = useSigners()
  const { user } = usePrivy()
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // addSigners only accepts the embedded wallet address. Resolve from linked_accounts where wallet_client === 'privy'.
  const embeddedAddress = (() => {
    if (!user) return null
    const u = user as {
      wallet?: { address?: string }
      linked_accounts?: Array<{ type?: string; address?: string; wallet_client?: string }>
      linkedAccounts?: Array<{ type?: string; address?: string; walletClientType?: string }>
    }
    const accounts = u.linkedAccounts ?? u.linked_accounts ?? []
    const embedded = accounts.find(
      (a) =>
        (a as { type?: string }).type === 'wallet' &&
        ((a as { wallet_client?: string }).wallet_client === 'privy' ||
          (a as { walletClientType?: string }).walletClientType === 'privy')
    ) as { address?: string } | undefined
    if (embedded?.address) return embedded.address
    return u.wallet?.address ?? null
  })()
  const isAvailable = Boolean(PRIVY_KEY_QUORUM_ID && embeddedAddress && addSigners)

  const addServerSigner = useCallback(async (): Promise<AddServerSignerResult> => {
    setError(null)
    if (!PRIVY_KEY_QUORUM_ID) {
      const msg = 'Server signer not configured. Set VITE_PRIVY_KEY_QUORUM_ID (Privy Dashboard → Authorization keys → Key quorum ID).'
      setError(msg)
      return { success: false, error: msg }
    }
    if (!embeddedAddress) {
      const msg =
        'No embedded wallet. "Trade on my behalf" requires a Privy embedded wallet (e.g. sign in with email). If you only connected an external wallet (e.g. MetaMask), add an embedded wallet in your account first.'
      setError(msg)
      return { success: false, error: msg }
    }
    if (!addSigners) {
      const msg = 'Privy addSigners not available.'
      setError(msg)
      return { success: false, error: msg }
    }

    setLoading(true)
    try {
      await addSigners({
        address: embeddedAddress,
        signers: [
          {
            signerId: PRIVY_KEY_QUORUM_ID,
            policyIds: [], // full permission; add policy IDs to restrict
          },
        ],
      })
      return { success: true }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      setError(err)
      return { success: false, error: err }
    } finally {
      setLoading(false)
    }
  }, [addSigners, embeddedAddress])

  return { addServerSigner, isLoading, isAvailable, error }
}
