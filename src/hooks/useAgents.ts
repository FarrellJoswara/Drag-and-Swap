import { useCallback, useState, useEffect } from 'react'
import type { ConnectedModel } from '../utils/buildConnectedModel'
import type { DeployedAgent } from '../types/agent'
import type { Edge, Node } from '@xyflow/react'

const STORAGE_KEY = 'drag-and-swap-agents'

function loadAgents(walletAddress: string | null): DeployedAgent[] {
  if (!walletAddress) return []
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${walletAddress.toLowerCase()}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DeployedAgent[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveAgents(walletAddress: string, agents: DeployedAgent[]) {
  try {
    localStorage.setItem(
      `${STORAGE_KEY}:${walletAddress.toLowerCase()}`,
      JSON.stringify(agents),
    )
  } catch (e) {
    console.error('[useAgents] Failed to save:', e)
  }
}

export function useAgents(walletAddress: string | null) {
  const [agents, setAgents] = useState<DeployedAgent[]>([])

  useEffect(() => {
    setAgents(loadAgents(walletAddress))
  }, [walletAddress])

  const addAgent = useCallback(
    (agent: Omit<DeployedAgent, 'id' | 'createdAt' | 'deployedAt'>) => {
      if (!walletAddress) return null
      const now = new Date().toISOString()
      const newAgent: DeployedAgent = {
        ...agent,
        id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        deployedAt: now,
        createdAt: now,
      }
      setAgents((prev) => {
        const next = [...prev, newAgent]
        saveAgents(walletAddress, next)
        return next
      })
      return newAgent.id
    },
    [walletAddress],
  )

  const getAgentById = useCallback(
    (id: string): DeployedAgent | undefined => {
      return agents.find((a) => a.id === id)
    },
    [agents],
  )

  const updateAgentModel = useCallback(
    (
      id: string,
      updates: {
        model: ConnectedModel
        flowData: { nodes: Node[]; edges: Edge[] }
        name?: string
      },
    ) => {
      if (!walletAddress) return
      const now = new Date().toISOString()
      setAgents((prev) => {
        const next = prev.map((a) =>
          a.id === id
            ? {
                ...a,
                ...updates,
                deployedAt: now,
              }
            : a,
        )
        saveAgents(walletAddress, next)
        return next
      })
    },
    [walletAddress],
  )

  const toggleActive = useCallback(
    (id: string) => {
      if (!walletAddress) return
      setAgents((prev) => {
        const next = prev.map((a) =>
          a.id === id ? { ...a, isActive: !a.isActive } : a,
        )
        saveAgents(walletAddress, next)
        return next
      })
    },
    [walletAddress],
  )

  const removeAgent = useCallback(
    (id: string) => {
      if (!walletAddress) return
      setAgents((prev) => {
        const next = prev.filter((a) => a.id !== id)
        saveAgents(walletAddress, next)
        return next
      })
    },
    [walletAddress],
  )

  const updateAgent = useCallback(
    (id: string, updates: Partial<Pick<DeployedAgent, 'name' | 'description'>>) => {
      if (!walletAddress) return
      setAgents((prev) => {
        const next = prev.map((a) =>
          a.id === id ? { ...a, ...updates } : a,
        )
        saveAgents(walletAddress, next)
        return next
      })
    },
    [walletAddress],
  )

  return {
    agents,
    addAgent,
    getAgentById,
    updateAgentModel,
    toggleActive,
    removeAgent,
    updateAgent,
  }
}
