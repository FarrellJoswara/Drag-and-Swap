/**
 * Build and validate Hyperliquid stream filters (QuickNode filter semantics).
 * Used by the Hyperliquid Stream block to build filters from block inputs.
 */

import type { HyperliquidStreamType, HyperliquidFilters, UnifiedFilterSpec } from './types'
import { FILTER_LIMITS } from './types'

/**
 * Build HyperliquidFilters from a unified spec. Maps spec.user → filters.users for events stream, else filters.user.
 * Trims values and drops empty arrays.
 */
export function buildFiltersFromSpec(
  streamType: HyperliquidStreamType,
  spec: UnifiedFilterSpec
): HyperliquidFilters {
  const filters: HyperliquidFilters = {}

  for (const [key, val] of Object.entries(spec)) {
    if (val == null || !Array.isArray(val)) continue
    const arr = val.map((v) => String(v).trim()).filter(Boolean)
    if (arr.length === 0) continue

    if (key === 'user') {
      if (streamType === 'events') {
        filters.users = arr
      } else {
        filters.user = arr
      }
      continue
    }
    if (key === 'users' && streamType === 'events') {
      filters.users = arr
      continue
    }
    filters[key] = arr
  }

  return filters
}

/**
 * Validate filters against QuickNode limits. Returns human-readable errors.
 */
export function validateFilterLimits(
  _streamType: HyperliquidStreamType,
  filters: HyperliquidFilters
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  let total = 0

  for (const [key, val] of Object.entries(filters)) {
    if (!Array.isArray(val)) continue
    const n = val.length
    total += n
    if (key === 'user' || key === 'users') {
      if (n > FILTER_LIMITS.maxUserValues) {
        errors.push(
          `Too many values for field '${key}': ${n} (max: ${FILTER_LIMITS.maxUserValues})`
        )
      }
    } else if (key === 'coin') {
      if (n > FILTER_LIMITS.maxCoinValues) {
        errors.push(
          `Too many values for field 'coin': ${n} (max: ${FILTER_LIMITS.maxCoinValues})`
        )
      }
    } else if (key === 'type') {
      if (n > FILTER_LIMITS.maxTypeValues) {
        errors.push(
          `Too many values for field 'type': ${n} (max: ${FILTER_LIMITS.maxTypeValues})`
        )
      }
    }
  }

  if (total > FILTER_LIMITS.maxTotalValues) {
    errors.push(
      `Too many total filter values: ${total} (max: ${FILTER_LIMITS.maxTotalValues})`
    )
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Parse comma-separated string into string array, trimmed, with empty strings removed, capped at max.
 */
export function parseCommaSeparated(value: string | undefined, max: number): string[] {
  if (value == null || String(value).trim() === '') return []
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max)
}
