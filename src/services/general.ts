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
