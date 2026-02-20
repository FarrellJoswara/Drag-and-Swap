import type { ConnectedModel } from '../utils/buildConnectedModel'

/** A deployed agent stored in the user's collection */
export interface DeployedAgent {
  id: string
  name: string
  description?: string
  /** The connected model (nodes + edges) at deployment time */
  model: ConnectedModel
  /** Wallet address of the owner (from Privy at deploy time) */
  walletAddress: string
  /** Whether the agent is currently active/running */
  isActive: boolean
  deployedAt: string
  createdAt: string
}
