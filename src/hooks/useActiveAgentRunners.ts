import { useEffect, useRef } from 'react'
import { subscribeToAgent, type TriggerPayload } from '../lib/runAgent'
import type { DeployedAgent } from '../types/agent'

/**
 * Subscribes to interrupt-based triggers for all active agents.
 * Cleans up when agents are deactivated or component unmounts.
 */
export function useActiveAgentRunners(
  agents: DeployedAgent[],
  onTrigger?: (payload: TriggerPayload) => void,
) {
  const onTriggerRef = useRef(onTrigger)
  onTriggerRef.current = onTrigger

  useEffect(() => {
    const active = agents.filter((a) => a.isActive)
    const cleanups: Array<() => void> = []

    for (const agent of active) {
      const unsub = subscribeToAgent(
        agent.id,
        agent.model,
        (payload) => onTriggerRef.current?.(payload),
      )
      cleanups.push(unsub)
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [agents])
}
