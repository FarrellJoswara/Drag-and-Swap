/**
 * React hook for Hyperliquid real-time streams.
 * Subscribes when enabled and cleans up on unmount or when params change.
 */

import { useEffect, useRef, useState } from 'react'
import {
  subscribe,
  type HyperliquidStreamType,
  type HyperliquidFilters,
  type HyperliquidStreamMessage,
  tradeEventToOutputs,
  orderEventToOutputs,
  bookUpdateEventToOutputs,
  twapEventToOutputs,
  writerActionEventToOutputs,
  type TradeEvent,
  type OrderEvent,
  type BookUpdateEvent,
  type TwapEvent,
  type WriterActionEvent,
} from '../services/hyperliquid/index'

export interface UseHyperstreamSocketsOptions {
  /** Stream to subscribe to */
  streamType: HyperliquidStreamType
  /** Filters (e.g. { coin: ['BTC'], side: ['B'] ). Omit or {} for no filter. */
  filters: HyperliquidFilters
  /** Called for each stream message that contains events */
  onEvent: (outputs: Record<string, string>, raw: HyperliquidStreamMessage) => void
  /** When false, no subscription is opened. Default true. */
  enabled?: boolean
}

/** Connection status for the active subscription */
export type HyperstreamStatus = 'idle' | 'connecting' | 'connected' | 'error'

/**
 * Subscribe to a Hyperliquid stream and call onEvent for each block of events.
 * Outputs are normalized to Record<string, string> per event (for use as trigger block outputs).
 * Unsubscribes on unmount or when streamType/filters/enabled change.
 */
export function useHyperstreamSockets({
  streamType,
  filters,
  onEvent,
  enabled = true,
}: UseHyperstreamSocketsOptions): { status: HyperstreamStatus; error: string | null } {
  const [status, setStatus] = useState<HyperstreamStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      setError(null)
      return
    }

    setStatus('connecting')
    setError(null)

    const unsubscribe = subscribe(streamType, filters, (msg: HyperliquidStreamMessage) => {
      setStatus('connected')
      const events = msg.data?.events ?? (msg as any).events
      if (!Array.isArray(events) || events.length === 0) return

      for (const ev of events) {
        try {
          const outputs = normalizeEventToOutputs(streamType, ev)
          if (outputs) onEventRef.current(outputs, msg)
        } catch (e) {
          console.warn('[useHyperstreamSockets] normalize error', e)
        }
      }
    })

    // We don't get a clear "connected" from the API until first message; treat as connected after subscribe
    setStatus('connected')

    return () => {
      unsubscribe()
      setStatus('idle')
    }
  }, [enabled, streamType, JSON.stringify(filters)])

  return { status, error }
}

/** Normalize a single event to block outputs by stream type */
function normalizeEventToOutputs(
  streamType: HyperliquidStreamType,
  ev: unknown
): Record<string, string> | null {
  switch (streamType) {
    case 'trades':
      return tradeEventToOutputs(ev as TradeEvent)
    case 'orders':
      return orderEventToOutputs(ev as OrderEvent)
    case 'book_updates':
      return bookUpdateEventToOutputs(ev as BookUpdateEvent)
    case 'twap':
      return twapEventToOutputs(ev as TwapEvent)
    case 'writer_actions':
      return writerActionEventToOutputs(ev as WriterActionEvent)
    case 'events':
      return eventsEventToOutputs(ev)
    default:
      return null
  }
}

/** Events stream has nested inner types; flatten common LedgerUpdate deltas */
function eventsEventToOutputs(ev: unknown): Record<string, string> {
  const o: Record<string, string> = {}
  const inner = (ev as any)?.inner
  if (!inner) return o

  if (inner.LedgerUpdate) {
    const lu = inner.LedgerUpdate
    const delta = lu.delta ?? {}
    o.type = delta.type ?? ''
    o.user = (lu.users?.[0] ?? delta.user ?? '') as string
    o.destination = (delta.destination ?? '') as string
    o.amount = (delta.amount ?? delta.usdc ?? delta.usd ?? '') as string
    o.token = (delta.token ?? '') as string
    o.usdcValue = (delta.usdcValue ?? '') as string
    o.fee = (delta.fee ?? '') as string
    o.vault = (delta.vault ?? '') as string
    o.netWithdrawnUsd = (delta.netWithdrawnUsd ?? '') as string
    o.commission = (delta.commission ?? '') as string
  }
  if (inner.CDeposit) {
    o.direction = 'CDeposit'
    o.user = inner.CDeposit.user ?? ''
    o.amount = inner.CDeposit.amount ?? ''
  }
  if (inner.CWithdrawal) {
    o.direction = 'CWithdrawal'
    o.user = inner.CWithdrawal.user ?? ''
    o.amount = inner.CWithdrawal.amount ?? ''
    o.isFinalized = String(inner.CWithdrawal.is_finalized ?? false)
  }
  if (inner.Delegation) {
    o.user = inner.Delegation.user ?? ''
    o.validator = inner.Delegation.validator ?? ''
    o.amount = inner.Delegation.amount ?? ''
    o.isUndelegate = String(inner.Delegation.is_undelegate ?? false)
  }
  const hash = (ev as any)?.hash
  if (hash) o.hash = hash
  const time = (ev as any)?.time
  if (time) o.timestamp = time
  return o
}
