/**
 * General-purpose services for blocks without external libraries.
 * Use for: webhook, time loop, delay, etc.
 */

const CORS_PROXY = 'https://corsproxy.io/?'

export async function webhook(inputs: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  try {
    const pairs = JSON.parse(inputs.headers || '[]') as { key: string; value: string }[]
    for (const p of pairs) headers[p.key] = p.value
  } catch {
    /* ignore bad JSON */
  }

  let url = inputs.url.startsWith('http') ? inputs.url : `https://${inputs.url}`
  if (inputs.useCorsProxy === 'true') {
    url = CORS_PROXY + encodeURIComponent(url)
  }

  const res = await fetch(url, {
    method: inputs.method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: inputs.method !== 'GET' ? inputs.body : undefined,
  })
  const text = await res.text()
  return { status: String(res.status), response: text }
}

const TIME_UNIT_MS: Record<string, number> = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  months: 30 * 24 * 60 * 60 * 1000,
  years: 365 * 24 * 60 * 60 * 1000,
}

export function intervalToMs(value: number, unit: string): number {
  const mult = TIME_UNIT_MS[unit] ?? TIME_UNIT_MS.seconds
  return value * mult
}

export async function timeLoop(inputs: Record<string, string>): Promise<{ elapsed: string }> {
  const value = Number(inputs.interval ?? inputs.seconds ?? '10')
  const unit = inputs.unit || 'seconds'
  if (isNaN(value) || value <= 0) {
    throw new Error('Invalid interval value')
  }
  const ms = intervalToMs(value, unit)
  await new Promise((r) => setTimeout(r, ms))
  return { elapsed: `${value} ${unit}` }
}

// ─── General Comparator ───────────────────────────────────────

export type GeneralComparatorOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'gte'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'not_exists'
  | 'empty'
  | 'not_empty'

function toComparable(a: unknown, b: unknown): { a: number | string; b: number | string; numeric: boolean } {
  const sa = a == null ? '' : String(a).trim()
  const sb = b == null ? '' : String(b).trim()
  const na = Number(sa)
  const nb = Number(sb)
  const numeric = Number.isFinite(na) && Number.isFinite(nb) && sa !== '' && sb !== ''
  return {
    a: numeric ? na : sa,
    b: numeric ? nb : sb,
    numeric,
  }
}

export function generalComparator(inputs: Record<string, string>): { passed: 'true' | 'false' } {
  const top = inputs.valueToFilterTop ?? ''
  const bottom = inputs.valueToFilterBottom ?? ''
  const operator = (inputs.operator ?? 'greater_than') as GeneralComparatorOperator

  let passed: boolean
  const { a: left, b: right, numeric } = toComparable(top, bottom)

  switch (operator) {
    case 'equals':
      passed = numeric ? (left as number) === (right as number) : (left as string) === (right as string)
      break
    case 'not_equals':
      passed = numeric ? (left as number) !== (right as number) : (left as string) !== (right as string)
      break
    case 'greater_than':
      passed = numeric ? (left as number) > (right as number) : (left as string) > (right as string)
      break
    case 'less_than':
      passed = numeric ? (left as number) < (right as number) : (left as string) < (right as string)
      break
    case 'gte':
      passed = numeric ? (left as number) >= (right as number) : (left as string) >= (right as string)
      break
    case 'lte':
      passed = numeric ? (left as number) <= (right as number) : (left as string) <= (right as string)
      break
    case 'contains':
      passed = String(top).includes(String(bottom))
      break
    case 'not_contains':
      passed = !String(top).includes(String(bottom))
      break
    case 'exists':
      passed = top != null && String(top).trim() !== ''
      break
    case 'not_exists':
      passed = top == null || String(top).trim() === ''
      break
    case 'empty':
      passed = top == null || String(top).trim() === ''
      break
    case 'not_empty':
      passed = top != null && String(top).trim() !== ''
      break
    default:
      passed = (left as string) === (right as string)
  }

  return {
    passed: passed ? 'true' : 'false',
  }
}

// ─── Delay (in-flow sleep) ─────────────────────────────────

export async function delay(inputs: Record<string, string>): Promise<{ done: string }> {
  const seconds = Number(inputs.seconds ?? '1')
  const sec = Math.max(0, Math.min(300, isNaN(seconds) ? 1 : seconds))
  await new Promise((r) => setTimeout(r, sec * 1000))
  return { done: `${sec}s` }
}

// ─── Numeric range filter ──────────────────────────────────

export function numericRangeFilter(inputs: Record<string, string>): Record<string, string> {
  const raw = inputs.value ?? ''
  const min = Number(inputs.min ?? '-Infinity')
  const max = Number(inputs.max ?? 'Infinity')
  const n = Number(raw)
  const valid = raw.trim() !== '' && Number.isFinite(n) && n >= min && n <= max
  return {
    passed: valid ? 'true' : 'false',
    value: valid ? String(n) : raw,
    inRange: valid ? 'true' : 'false',
  }
}

// ─── String match filter ───────────────────────────────────

export function stringMatchFilter(inputs: Record<string, string>): Record<string, string> {
  const value = inputs.value ?? ''
  const pattern = inputs.pattern ?? ''
  const mode = (inputs.mode ?? 'contains') as 'contains' | 'equals' | 'regex'
  let passed = false
  let matched = ''

  if (mode === 'contains') {
    passed = value.includes(pattern)
    matched = value
  } else if (mode === 'equals') {
    passed = value.trim() === pattern.trim()
    matched = value
  } else {
    try {
      const re = new RegExp(pattern)
      const m = value.match(re)
      passed = m != null
      matched = m ? m[0] : ''
    } catch {
      passed = false
    }
  }

  return {
    passed: passed ? 'true' : 'false',
    matched,
    value: passed ? value : '',
  }
}

// ─── Rate limit / debounce (per node key) ──────────────────

const rateLimitLastRun = new Map<string, number>()

export function rateLimitFilter(
  inputs: Record<string, string>,
  nodeId: string,
  agentId?: string,
): Record<string, string> {
  const intervalSec = Math.max(1, Number(inputs.intervalSeconds ?? '60') || 60)
  const key = agentId ? `${agentId}:${nodeId}` : nodeId
  const now = Date.now() / 1000
  const last = rateLimitLastRun.get(key) ?? 0
  const elapsed = now - last
  const allowed = elapsed >= intervalSec
  if (allowed) rateLimitLastRun.set(key, now)
  return {
    passed: allowed ? 'true' : 'false',
    elapsed: `${Math.floor(elapsed)}s`,
    nextAllowedIn: allowed ? '0' : String(Math.ceil(intervalSec - elapsed)),
  }
}

// ─── Conditional branch (if/else) ─────────────────────────

export function conditionalBranch(inputs: Record<string, string>): Record<string, string> {
  const raw = inputs.condition ?? ''
  const truthy = raw !== '' && raw.toLowerCase() !== 'false' && raw !== '0'
  return {
    true: truthy ? '1' : '',
    false: truthy ? '' : '1',
  }
}

// ─── Merge (combine or first value) ────────────────────────

const MERGE_SKIP_KEYS = new Set(['mode', 'separator'])

export function mergeOutputs(inputs: Record<string, string>): Record<string, string> {
  const mode = (inputs.mode ?? 'first') as 'first' | 'concat' | 'json'
  const values: string[] = []
  for (const [k, v] of Object.entries(inputs)) {
    if (MERGE_SKIP_KEYS.has(k)) continue
    if (v != null && String(v).trim() !== '') values.push(String(v).trim())
  }
  if (values.length === 0) return { out: '' }
  if (mode === 'first') return { out: values[0] ?? '' }
  if (mode === 'concat') return { out: values.join(inputs.separator ?? ', ') }
  return { out: JSON.stringify(values) }
}

// ─── Log / Debug ───────────────────────────────────────────

export function logDebug(inputs: Record<string, string>): Record<string, string> {
  console.log('[Block Log/Debug]', inputs)
  const passthrough = (inputs.passthrough ?? JSON.stringify(inputs)).trim()
  return { out: passthrough || JSON.stringify(inputs) }
}
