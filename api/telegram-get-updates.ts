/**
 * Vercel serverless API: proxy Telegram getUpdates to avoid CORS.
 * Uses server env TELEGRAM_BOT_TOKEN when client does not send botToken (recommended; keeps token out of browser).
 */

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { botToken?: string; offset?: number }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const clientToken = (body.botToken ?? '').trim()
  const botToken = clientToken || (process.env.TELEGRAM_BOT_TOKEN ?? '').trim()
  const offset = Number(body.offset ?? 0)
  if (!botToken) {
    return new Response(
      JSON.stringify({
        error: 'Telegram bot token required. Set TELEGRAM_BOT_TOKEN in Vercel (or send botToken in body).',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&limit=100&timeout=50`
  const res = await fetch(url, { method: 'GET' })
  const data = await res.json().catch(() => ({}))
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
