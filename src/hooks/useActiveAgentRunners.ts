import { useEffect, useRef } from 'react'
import { subscribeToAgent, type TriggerPayload, type RunContext } from '../lib/runAgent'
import type { DeployedAgent } from '../types/agent'
import { useDisplayValue } from '../contexts/DisplayValueContext'

/**
 * Subscribes to interrupt-based triggers for all active agents.
 * Cleans up when agents are deactivated or component unmounts.
 * Pass walletAddress to auto-fill Swap block's Wallet Address when empty.
 * Updates display value store when streamDisplay nodes run (for TV preview).
 */
export function useActiveAgentRunners(
  agents: DeployedAgent[],
  onTrigger?: (payload: TriggerPayload) => void,
  context?: RunContext,
) {
  const onTriggerRef = useRef(onTrigger)
  onTriggerRef.current = onTrigger
  const { setDisplayValue } = useDisplayValue()

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
        },
      )
      cleanups.push(unsub)
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [agents, setDisplayValue])
}
