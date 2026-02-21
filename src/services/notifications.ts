/**
 * Notification services: Telegram, Discord.
 * Telegram uses Bot API; Discord uses webhook URL.
 */

function withCorsProxy(url: string): string {
  return `https://corsproxy.io/?url=${encodeURIComponent(url)}`
}

/** Telegram update from getUpdates (message part). */
export type TelegramMessageUpdate = {
  messageText: string
  chatId: string
  fromId: string
  username: string
  firstName: string
  updateId: string
  messageId: string
  date: string
}

export async function sendTelegram(inputs: Record<string, string>): Promise<Record<string, string>> {
  const botToken = (inputs.botToken ?? '').trim()
  const chatId = (inputs.chatId ?? '').trim()
  const text = (inputs.message ?? '').trim()
  if (!botToken || !chatId) {
    throw new Error('Telegram: bot token and chat ID are required. Connect Get Telegram\'s chatId to Send Telegram\'s Chat ID to reply to the same chat.')
  }
  if (!text) {
    throw new Error('Telegram: message cannot be empty. Enter text or connect Get Telegram\'s messageText.')
  }
  const parseMode = inputs.parseMode || 'HTML'
  const body = { botToken, chatId, message: text, parseMode }

  // Server proxy (Vercel) or Vite plugin (local dev) — bypasses CORS
  const apiRes = await fetch('/api/telegram-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null)

  const isJson = apiRes?.headers.get('content-type')?.includes('application/json')
  if (apiRes?.ok && isJson) {
    const data = (await apiRes.json().catch(() => ({}))) as { ok?: boolean; description?: string }
    const ok = data?.ok === true
    if (!ok && data?.description) throw new Error(`Telegram API: ${data.description}`)
    return { ok: ok ? 'true' : 'false', status: String(apiRes.status), response: JSON.stringify(data) }
  }

  // Fallback: CORS proxy (for local dev when /api is not available)
  const useCorsProxy = inputs.useCorsProxy !== 'false'
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const tgBody = JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode })
  const target = useCorsProxy ? withCorsProxy(url) : url
  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: tgBody,
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }
  const ok = data?.ok === true
  if (!ok && data?.description) throw new Error(`Telegram API: ${data.description}`)
  return { ok: ok ? 'true' : 'false', status: String(res.status), response: JSON.stringify(data) }
}

export async function sendDiscord(inputs: Record<string, string>): Promise<Record<string, string>> {
  const webhookUrl = (inputs.webhookUrl ?? '').trim()
  const content = (inputs.message ?? '').trim()
  if (!webhookUrl) {
    throw new Error('Discord: webhook URL is required')
  }
  const body = JSON.stringify({
    content: content || undefined,
    username: inputs.username || undefined,
  })
  let target = webhookUrl
  if (inputs.useCorsProxy === 'true') {
    target = withCorsProxy(webhookUrl)
  }
  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  const text = await res.text()
  return {
    ok: res.ok ? 'true' : 'false',
    status: String(res.status),
    response: text || String(res.status),
  }
}

// ─── Telegram getUpdates (for message trigger) ─────────────────────────────

/**
 * Fetch pending updates from Telegram Bot API. Used by the Telegram message trigger.
 * Uses server proxy when available (no CORS); falls back to CORS proxy for local dev.
 */
async function getTelegramUpdates(
  botToken: string,
  offset: number,
  useCorsProxy: boolean,
): Promise<{ updates: TelegramMessageUpdate[]; nextOffset: number }> {
  if (!botToken.trim()) return { updates: [], nextOffset: offset }
  const token = botToken.trim()

  // Server proxy (Vercel) or Vite plugin (local dev) — bypasses CORS
  const apiRes = await fetch('/api/telegram-get-updates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botToken: token, offset }),
  }).catch(() => null)

  const isJson = apiRes?.headers.get('content-type')?.includes('application/json')
  let data: { ok?: boolean; result?: unknown[] } = {}
  if (apiRes?.ok && isJson) {
    data = (await apiRes.json().catch(() => ({}))) as { ok?: boolean; result?: unknown[] }
  } else {
    // Fallback: CORS proxy (for local dev when /api is not available)
    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&limit=100&timeout=30`
    const target = useCorsProxy ? withCorsProxy(url) : url
    const res = await fetch(target, { method: 'GET' })
    data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown[] }
  }
  const updates: TelegramMessageUpdate[] = []
  let nextOffset = offset
  if (data?.ok && Array.isArray(data.result)) {
    for (const u of data.result) {
      const upd = u as { update_id?: number; message?: { text?: string; message_id?: number; from?: { id?: number; username?: string; first_name?: string }; chat?: { id?: number }; date?: number } }
      if (upd.update_id != null) nextOffset = Math.max(nextOffset, upd.update_id + 1)
      const msg = upd.message
      if (!msg || typeof msg.text !== 'string') continue
      const from = msg.from ?? {}
      const chat = msg.chat ?? {}
      updates.push({
        messageText: msg.text,
        chatId: String(chat.id ?? ''),
        fromId: String(from.id ?? ''),
        username: String(from.username ?? ''),
        firstName: String(from.first_name ?? ''),
        updateId: String(upd.update_id ?? ''),
        messageId: String(msg.message_id ?? ''),
        date: String(msg.date ?? ''),
      })
    }
  }
  return { updates, nextOffset }
}

/** Normalize handle for comparison: strip @ and lowercase. */
function normalizeHandle(h: string): string {
  return (h || '').trim().replace(/^@/, '').toLowerCase()
}

/**
 * Start polling Telegram getUpdates and call onMessage for each new message.
 * Skips all messages that were already pending when polling started (only fires for new messages).
 * Returns a cleanup function to stop polling.
 */
export function startTelegramMessagePolling(
  botToken: string,
  options: { useCorsProxy?: boolean; chatIdFilter?: string; fromHandleFilter?: string; pollIntervalSeconds?: number },
  onMessage: (out: Record<string, string>) => void,
): () => void {
  const useCorsProxy = options.useCorsProxy !== false
  const chatIdFilter = (options.chatIdFilter ?? '').trim()
  const fromHandleFilter = normalizeHandle(options.fromHandleFilter ?? '')
  const intervalMs = Math.max(2000, Math.min(60000, (options.pollIntervalSeconds ?? 5) * 1000))
  let offset = 0
  let pollInProgress = false
  let initialAckDone = false

  const doPoll = async (skipFiring = false) => {
    if (pollInProgress) return
    pollInProgress = true
    try {
      const { updates, nextOffset } = await getTelegramUpdates(botToken, offset, useCorsProxy)
      offset = nextOffset
      if (skipFiring) {
        initialAckDone = true
        return
      }
      if (!initialAckDone) return
      for (const u of updates) {
        if (chatIdFilter && u.chatId !== chatIdFilter) continue
        if (fromHandleFilter && normalizeHandle(u.username) !== fromHandleFilter) continue
        try {
          onMessage({
            messageText: u.messageText,
            chatId: u.chatId,
            fromId: u.fromId,
            username: u.username,
            firstName: u.firstName,
            updateId: u.updateId,
            messageId: u.messageId,
            date: u.date,
          })
        } catch (e) {
          console.warn('[Telegram trigger] onMessage failed for update', u.updateId, e)
        }
      }
    } catch (e) {
      console.warn('[Telegram trigger] getUpdates failed:', e)
    } finally {
      pollInProgress = false
    }
  }

  // Initial ack: consume all pending (old) updates without firing, so we only trigger for new messages
  let intervalId: ReturnType<typeof setInterval> | null = null
  let cancelled = false
  const run = async () => {
    await doPoll(true)
    if (cancelled) return
    intervalId = setInterval(() => doPoll(false), intervalMs)
    doPoll(false)
  }
  run()
  return () => {
    cancelled = true
    if (intervalId) clearInterval(intervalId)
  }
}
