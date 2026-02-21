import { useEffect, useRef, useCallback } from 'react'
import { subscribeToAgent, type TriggerPayload, type RunContext } from '../lib/runAgent'
import type { DeployedAgent } from '../types/agent'
import { useDisplayValue } from '../contexts/DisplayValueContext'
import { useCurrentFlow } from '../contexts/CurrentFlowContext'
import { buildConnectedModel } from '../utils/buildConnectedModel'

/**
 * Subscribes to interrupt-based triggers for all active agents.
 * Cleans up when agents are deactivated or component unmounts.
 * Pass walletAddress to auto-fill Swap block's Wallet Address when empty.
 * Updates display value store when streamDisplay nodes run (for TV preview).
 * Uses current editor flow when available so "Fields to Show" toggles apply without saving.
 */
export function useActiveAgentRunners(
  agents: DeployedAgent[],
  onTrigger?: (payload: TriggerPayload) => void,
  context?: RunContext,
) {
  const onTriggerRef = useRef(onTrigger)
  onTriggerRef.current = onTrigger
  const { setDisplayValue } = useDisplayValue()
  const { getCurrentFlow } = useCurrentFlow()

  const getModel = useCallback(
    (agentId: string) => {
      const flow = getCurrentFlow(agentId)
      if (!flow?.nodes?.length) return null
      return buildConnectedModel(flow.nodes, flow.edges)
    },
    [getCurrentFlow],
  )

  useEffect(() => {
    const active = agents.filter((a) => a.isActive)
    const cleanups: Array<() => void> = []

    for (const agent of active) {
      const unsub = subscribeToAgent(
        agent.id,
        agent.model,
        (payload) => onTriggerRef.current?.(payload),
        context,
        {
          onDisplayUpdate: (nodeId, value) => setDisplayValue(agent.id, nodeId, value),
          getModel,
        },
      )
      cleanups.push(unsub)
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [agents, setDisplayValue, getModel])
}
