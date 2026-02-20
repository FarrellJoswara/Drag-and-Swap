import type { PrivyClientConfig } from '@privy-io/react-auth'

const raw = import.meta.env.VITE_PRIVY_APP_ID as string | undefined
export const PRIVY_APP_ID = raw && raw !== 'your-privy-app-id-here' ? raw : null

if (!PRIVY_APP_ID) {
  console.warn(
    '[Privy] VITE_PRIVY_APP_ID is not set. ' +
      'Add your Privy app ID to .env.local to enable authentication.',
  )
}

export const privyConfig: PrivyClientConfig = {
  loginMethods: ['email', 'wallet', 'google'],
  appearance: {
    theme: 'dark',
    accentColor: '#6366f1',
    showWalletLoginFirst: true,
  },
  embeddedWallets: {
    ethereum: {
      createOnLogin: 'users-without-wallets',
    },
  },
}
