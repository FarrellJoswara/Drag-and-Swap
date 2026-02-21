/**
 * Notification services: Telegram, Discord.
 * Telegram uses Bot API; Discord uses webhook URL.
 */

const CORS_PROXY = 'https://corsproxy.io/?'

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
