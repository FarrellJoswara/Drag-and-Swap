/**
 * Vercel serverless API: proxy Telegram sendMessage to avoid CORS.
 * Uses server env TELEGRAM_BOT_TOKEN when client does not send botToken (recommended; keeps token out of browser).
 * Otherwise accepts botToken, chatId, message from client.
 */

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { botToken?: string; chatId?: string; message?: string; parseMode?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const chatId = (body.chatId ?? '').trim()
  const text = (body.message ?? '').trim()
  const clientToken = (body.botToken ?? '').trim()
  const botToken = clientToken || (process.env.TELEGRAM_BOT_TOKEN ?? '').trim()
  if (!botToken) {
    return new Response(
      JSON.stringify({
        error: 'Telegram bot token required. Set TELEGRAM_BOT_TOKEN in Vercel (or send botToken in body).',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if (!chatId) {
    return new Response(
      JSON.stringify({ error: 'chatId is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if (!text) {
    return new Response(
      JSON.stringify({ error: 'message cannot be empty' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: body.parseMode || 'HTML',
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
