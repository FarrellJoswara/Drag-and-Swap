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

/** One getUpdates poll per bot token to avoid Telegram 409 (only one poll allowed per bot). */
const telegramOffsetByToken: Record<string, number> = {}
/** Global "request in flight" per token so we never start a new request until the previous one finishes (even after effect cleanup/re-subscribe). */
const telegramRequestInFlight: Record<string, boolean> = {}
const TELEGRAM_409_MSG =
  'Telegram 409: only one getUpdates connection allowed per bot. Close other tabs, or remove the bot webhook (BotFather / setWebhook).'

type TelegramListener = {
  chatIdFilter: string
  fromHandleFilter: string
  onMessage: (out: Record<string, string>) => void
}
type TelegramPollerState = {
  token: string
  useCorsProxy: boolean
  intervalMs: number
  timeoutId: ReturnType<typeof setTimeout> | null
  listeners: Set<TelegramListener>
  initialAckDone: boolean
  cancelled: boolean
}
const telegramPollers: Record<string, TelegramPollerState> = {}

/**
 * Fetch pending updates from Telegram Bot API. Used by the Telegram message trigger.
 * Uses server proxy when available (no CORS). Does NOT fall back to CORS on 409 (would double the conflict).
 */
async function getTelegramUpdates(
  botToken: string,
  offset: number,
  useCorsProxy: boolean,
): Promise<{ updates: TelegramMessageUpdate[]; nextOffset: number; is409?: boolean }> {
  if (!botToken.trim()) return { updates: [], nextOffset: offset }
  const token = botToken.trim()

  const apiRes = await fetch('/api/telegram-get-updates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botToken: token, offset }),
  }).catch(() => null)

  const status = apiRes?.status
  const isJson = apiRes?.headers.get('content-type')?.includes('application/json')
  let data: { ok?: boolean; result?: unknown[]; description?: string } = {}

  if (apiRes != null && isJson) {
    data = (await apiRes.json().catch(() => ({}))) as { ok?: boolean; result?: unknown[]; description?: string }
  }

  if (status === 409 || data?.description?.toLowerCase().includes('conflict')) {
    console.warn('[Telegram trigger]', TELEGRAM_409_MSG)
    return { updates: [], nextOffset: offset, is409: true }
  }

  if (apiRes?.ok && isJson && data?.ok && Array.isArray(data.result)) {
    const updates: TelegramMessageUpdate[] = []
    let nextOffset = offset
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
    return { updates, nextOffset }
  }

  if (apiRes?.ok) {
    return { updates: [], nextOffset: offset }
  }

  const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&limit=100&timeout=30`
  const target = useCorsProxy ? withCorsProxy(url) : url
  const res = await fetch(target, { method: 'GET' })
  const fallbackData = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown[]; description?: string }
  if (res.status === 409 || fallbackData?.description?.toLowerCase().includes('conflict')) {
    console.warn('[Telegram trigger]', TELEGRAM_409_MSG)
    return { updates: [], nextOffset: offset, is409: true }
  }
  const updates: TelegramMessageUpdate[] = []
  let nextOffset = offset
  if (fallbackData?.ok && Array.isArray(fallbackData.result)) {
    for (const u of fallbackData.result) {
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

function scheduleNextPoll(key: string, state: TelegramPollerState) {
  if (state.cancelled || state.listeners.size === 0 || state.timeoutId != null) return
  state.timeoutId = setTimeout(() => {
    state.timeoutId = null
    runTelegramPoller(key, state)
  }, state.intervalMs)
}

function runTelegramPoller(key: string, state: TelegramPollerState) {
  if (state.cancelled || state.listeners.size === 0) return
  if (telegramRequestInFlight[key]) return
  telegramRequestInFlight[key] = true
  const offset = telegramOffsetByToken[key] ?? 0
  getTelegramUpdates(state.token, offset, state.useCorsProxy)
    .then(({ updates, nextOffset, is409 }) => {
      if (state.cancelled) return
      telegramOffsetByToken[key] = nextOffset
      if (!state.initialAckDone) {
        state.initialAckDone = true
        return
      }
      if (is409) return
      for (const u of updates) {
        for (const listener of state.listeners) {
          if (listener.chatIdFilter && u.chatId !== listener.chatIdFilter) continue
          if (listener.fromHandleFilter && normalizeHandle(u.username) !== listener.fromHandleFilter) continue
          try {
            listener.onMessage({
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
      }
    })
    .catch((e) => console.warn('[Telegram trigger] getUpdates failed:', e))
    .finally(() => {
      telegramRequestInFlight[key] = false
      if (!state.cancelled && state.listeners.size > 0) scheduleNextPoll(key, state)
    })
}

/**
 * Start polling Telegram getUpdates and call onMessage for each new message.
 * Shares a single getUpdates loop per bot token; never starts a new request until the previous one finishes (avoids 409).
 * Returns a cleanup function to stop receiving (and stop the shared poll if no listeners left).
 */
export function startTelegramMessagePolling(
  botToken: string,
  options: { useCorsProxy?: boolean; chatIdFilter?: string; fromHandleFilter?: string; pollIntervalSeconds?: number },
  onMessage: (out: Record<string, string>) => void,
): () => void {
  const token = (botToken ?? '').trim()
  if (!token) {
    console.warn('[Telegram trigger] No bot token; add VITE_TELEGRAM_BOT_TOKEN to .env.local')
    return () => {}
  }

  const useCorsProxy = options.useCorsProxy !== false
  const chatIdFilter = (options.chatIdFilter ?? '').trim()
  const fromHandleFilter = normalizeHandle(options.fromHandleFilter ?? '')
  const intervalMs = Math.max(2000, Math.min(60000, (options.pollIntervalSeconds ?? 5) * 1000))
  const key = token

  if (!telegramPollers[key]) {
    telegramPollers[key] = {
      token,
      useCorsProxy,
      intervalMs,
      timeoutId: null,
      listeners: new Set(),
      initialAckDone: false,
      cancelled: false,
    }
  }
  const state = telegramPollers[key]
  const listener: TelegramListener = { chatIdFilter, fromHandleFilter, onMessage }
  state.listeners.add(listener)

  if (state.timeoutId == null && !telegramRequestInFlight[key]) {
    runTelegramPoller(key, state)
  }

  return () => {
    state.listeners.delete(listener)
    if (state.listeners.size === 0) {
      state.cancelled = true
      if (state.timeoutId != null) {
        clearTimeout(state.timeoutId)
        state.timeoutId = null
      }
      delete telegramPollers[key]
    }
  }
}
