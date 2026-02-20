/**
 * General-purpose services for blocks without external libraries.
 * Use for: webhook, time loop, delay, etc.
 */

const CORS_PROXY = 'https://corsproxy.io/?'

export async function sendWebhook(inputs: Record<string, string>): Promise<Record<string, string>> {
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

export async function timeLoopRun(seconds: number): Promise<{ elapsed: string }> {
  const ms = seconds * 1000
  await new Promise((r) => setTimeout(r, ms))
  return { elapsed: `${seconds}s` }
}

// ─── Block-specific functions (stub: console.log + return outputs) ───

export async function manualTrigger(_inputs: Record<string, string>): Promise<{ triggered: string }> {
  console.log('manualTrigger')
  return { triggered: '' }
}

export async function webhook(_inputs: Record<string, string>): Promise<{ status: string; response: string }> {
  console.log('webhook')
  return { status: '', response: '' }
}

export async function timeLoop(_inputs: Record<string, string>): Promise<{ elapsed: string }> {
  console.log('timeLoop')
  return { elapsed: '' }
}

export async function delayTimer(_inputs: Record<string, string>): Promise<{ elapsed: string }> {
  console.log('delayTimer')
  return { elapsed: '' }
}

export async function valueFilter(_inputs: Record<string, string>): Promise<{ passed: string; value: string }> {
  console.log('valueFilter')
  return { passed: '', value: '' }
}

export async function sendToken(_inputs: Record<string, string>): Promise<{ txHash: string; gasUsed: string }> {
  console.log('sendToken')
  return { txHash: '', gasUsed: '' }
}
