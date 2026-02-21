import { useEffect, useRef, useCallback, useMemo } from 'react'
import { subscribeToAgent, type TriggerPayload, type RunContext } from '../lib/runAgent'
import { getBlock } from '../lib/blockRegistry'
import type { DeployedAgent } from '../types/agent'
import { useDisplayValue } from '../contexts/DisplayValueContext'
import { useGraphSeries } from '../contexts/GraphSeriesContext'
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
  const { appendPoint } = useGraphSeries()
  const { getCurrentFlow } = useCurrentFlow()

  const getModel = useCallback(
    (agentId: string) => {
      const flow = getCurrentFlow(agentId)
      if (!flow?.nodes?.length) return null
      return buildConnectedModel(flow.nodes, flow.edges)
    },
    [getCurrentFlow],
  )

  const active = useMemo(() => agents.filter((a) => a.isActive), [agents])
  // Recompute every render so when user changes a filter (flow updates), we re-subscribe with new inputs
  const triggerInputsSignature =
    active
      .map((a) => {
        const flow = getCurrentFlow(a.id)
        const nodes = flow?.nodes ?? a.model.nodes
        if (!nodes?.length) return `${a.id}:empty`
        const triggerData = nodes
          .filter((n) => {
            const def = getBlock((n.data?.blockType ?? n.type) as string)
            return def?.subscribe && def.category === 'trigger'
          })
          .map((n) => JSON.stringify(n.data ?? {}))
          .sort()
          .join('|')
        return `${a.id}:${triggerData}`
      })
      .join(';')

  useEffect(() => {
    const cleanups: Array<() => void> = []

    for (const agent of active) {
      const unsub = subscribeToAgent(
        agent.id,
        agent.model,
        (payload) => onTriggerRef.current?.(payload),
        context,
        {
          onDisplayUpdate: (nodeId, value) => setDisplayValue(agent.id, nodeId, value),
          onGraphPointUpdate: (agentId, nodeId, point) => appendPoint(agentId, nodeId, point),
          getModel,
        },
      )
      cleanups.push(unsub)
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [active, triggerInputsSignature, setDisplayValue, appendPoint, getModel])
}
