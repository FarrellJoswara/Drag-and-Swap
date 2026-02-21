/**
 * Notification services: Telegram, Discord.
 * Telegram uses Bot API; Discord uses webhook URL.
 */

const CORS_PROXY = 'https://corsproxy.io/?'

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
    throw new Error('Telegram: bot token and chat ID are required')
  }
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: inputs.parseMode || 'HTML' })
  let target = url
  if (inputs.useCorsProxy === 'true') {
    target = CORS_PROXY + encodeURIComponent(url)
  }
  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  const data = await res.json().catch(() => ({}))
  const ok = data?.ok === true
  return {
    ok: ok ? 'true' : 'false',
    status: String(res.status),
    response: JSON.stringify(data),
  }
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
    target = CORS_PROXY + encodeURIComponent(webhookUrl)
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
 */
async function getTelegramUpdates(
  botToken: string,
  offset: number,
  useCorsProxy: boolean,
): Promise<{ updates: TelegramMessageUpdate[]; nextOffset: number }> {
  if (!botToken.trim()) return { updates: [], nextOffset: offset }
  const url = `https://api.telegram.org/bot${botToken.trim()}/getUpdates?offset=${offset}&limit=100&timeout=0`
  const target = useCorsProxy ? CORS_PROXY + encodeURIComponent(url) : url
  const res = await fetch(target, { method: 'GET' })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown[] }
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

/**
 * Start polling Telegram getUpdates and call onMessage for each new message.
 * Returns a cleanup function to stop polling.
 */
export function startTelegramMessagePolling(
  botToken: string,
  options: { useCorsProxy?: boolean; chatIdFilter?: string; pollIntervalSeconds?: number },
  onMessage: (out: Record<string, string>) => void,
): () => void {
  const useCorsProxy = options.useCorsProxy !== false
  const chatIdFilter = (options.chatIdFilter ?? '').trim()
  const intervalMs = Math.max(2000, Math.min(60000, (options.pollIntervalSeconds ?? 5) * 1000))
  let offset = 0
  const id = setInterval(async () => {
    try {
      const { updates, nextOffset } = await getTelegramUpdates(botToken, offset, useCorsProxy)
      offset = nextOffset
      for (const u of updates) {
        if (chatIdFilter && u.chatId !== chatIdFilter) continue
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
      }
    } catch (e) {
      console.warn('[Telegram trigger] getUpdates failed:', e)
    }
  }, intervalMs)
  return () => clearInterval(id)
}
