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

// ─── Compare Filter ───────────────────────────────────────

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

export function compareFilter(inputs: Record<string, string>): {
  passed: 'true' | 'false'
  result: string
} {
  const top = inputs.top ?? ''
  const bottom = inputs.bottom ?? ''
  const operator = inputs.operator ?? '>'
  const { a: left, b: right, numeric } = toComparable(top, bottom)

  let passed: boolean
  switch (operator) {
    case '>':
      passed = numeric ? (left as number) > (right as number) : (left as string) > (right as string)
      break
    case '>=':
      passed = numeric ? (left as number) >= (right as number) : (left as string) >= (right as string)
      break
    case '<':
      passed = numeric ? (left as number) < (right as number) : (left as string) < (right as string)
      break
    case '<=':
      passed = numeric ? (left as number) <= (right as number) : (left as string) <= (right as string)
      break
    default:
      passed = numeric ? (left as number) > (right as number) : (left as string) > (right as string)
  }

  const result = passed ? top : bottom
  return {
    passed: passed ? 'true' : 'false',
    result,
  }
}
