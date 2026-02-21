/**
 * Vercel serverless API: proxy Telegram sendMessage to avoid CORS.
 * Client sends botToken, chatId, message; server forwards to Telegram API.
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

  const botToken = (body.botToken ?? '').trim()
  const chatId = (body.chatId ?? '').trim()
  const text = (body.message ?? '').trim()
  if (!botToken || !chatId) {
    return new Response(
      JSON.stringify({ error: 'botToken and chatId are required' }),
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
