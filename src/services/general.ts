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

export async function timeLoop(inputs: Record<string, string>): Promise<{ elapsed: string }> {
  const seconds = Number(inputs.seconds)
  if (isNaN(seconds) || seconds <= 0) {
    throw new Error('Invalid seconds value')
  }
  const ms = seconds * 1000
  await new Promise((r) => setTimeout(r, ms))
  return { elapsed: `${seconds}s` }
}

// ─── General Filter ───────────────────────────────────────

export type GeneralFilterOperator =
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

export function generalFilter(inputs: Record<string, string>): {
  passed: 'true' | 'false'
  matchedValue: string
  data: string
} {
  const top = inputs.valueToFilterTop ?? ''
  const bottom = inputs.valueToFilterBottom ?? ''
  const operator = (inputs.operator ?? 'greater_than') as GeneralFilterOperator
  const passThrough = inputs.passThrough !== 'false'

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

  const matchedValue = top
  const data = passThrough && passed ? top : ''
  return {
    passed: passed ? 'true' : 'false',
    matchedValue,
    data,
  }
}
