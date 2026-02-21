import type { Edge, Node } from '@xyflow/react'
import type { ConnectedModel } from '../utils/buildConnectedModel'

/** Flow data for editing (nodes with position, edges) */
export interface FlowData {
  nodes: Node[]
  edges: Edge[]
}

/** A deployed agent stored in the user's collection */
export interface DeployedAgent {
  id: string
  name: string
  description?: string
  /** The connected model (nodes + edges) at deployment time */
  model: ConnectedModel
  /** Flow data for editing (nodes with position) — enables round-trip edit/redeploy. Optional for legacy agents. */
  flowData?: FlowData
  /** Wallet address of the owner (from Privy at deploy time) */
  walletAddress: string
  /** Whether the agent is currently active/running */
  isActive: boolean
  /** If true, this agent may use the app server signer to trade on your behalf when enabled in Settings. */
  allowTradeOnBehalf?: boolean
  deployedAt: string
  createdAt: string
}
