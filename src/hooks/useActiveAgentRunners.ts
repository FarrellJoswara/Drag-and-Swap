import { useEffect, useRef } from 'react'
import { subscribeToAgent, type TriggerPayload, type RunContext } from '../lib/runAgent'
import type { DeployedAgent } from '../types/agent'

/**
 * Subscribes to interrupt-based triggers for all active agents.
 * Cleans up when agents are deactivated or component unmounts.
 * Pass walletAddress to auto-fill Swap block's Wallet Address when empty.
 */
export function useActiveAgentRunners(
  agents: DeployedAgent[],
  onTrigger?: (payload: TriggerPayload) => void,
  context?: RunContext,
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
        context,
      )
      cleanups.push(unsub)
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [agents])
}
