/**
 * Vite plugin: proxy /api/telegram-send and /api/telegram-get-updates during local dev.
 * Bypasses CORS by making the request from the Vite dev server (Node) to Telegram.
 */
import type { Plugin } from 'vite'

export function telegramApiPlugin(): Plugin {
  return {
    name: 'telegram-api-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST') return next()
        const url = req.url ?? ''
        if (!url.startsWith('/api/telegram-send') && !url.startsWith('/api/telegram-get-updates')) return next()

        const body = await new Promise<string>((resolve, reject) => {
          let data = ''
          req.on('data', (chunk: Buffer) => { data += chunk.toString() })
          req.on('end', () => resolve(data))
          req.on('error', reject)
        })
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(body || '{}')
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON body' }))
          return
        }

        if (url.startsWith('/api/telegram-send')) {
          const botToken = String(parsed.botToken ?? '').trim()
          const chatId = String(parsed.chatId ?? '').trim()
          const text = String(parsed.message ?? '').trim()
          if (!botToken || !chatId) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'botToken and chatId are required' }))
            return
          }
          if (!text) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'message cannot be empty' }))
            return
          }
          const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text,
              parse_mode: parsed.parseMode || 'HTML',
            }),
          })
          const data = await tgRes.json().catch(() => ({}))
          res.writeHead(tgRes.status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(data))
          return
        }

        if (url.startsWith('/api/telegram-get-updates')) {
          const botToken = String(parsed.botToken ?? '').trim()
          const offset = Number(parsed.offset ?? 0)
          if (!botToken) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'botToken is required' }))
            return
          }
          const tgRes = await fetch(
            `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&limit=100&timeout=50`,
            { method: 'GET' }
          )
          const data = await tgRes.json().catch(() => ({}))
          res.writeHead(tgRes.status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(data))
          return
        }

        next()
      })
    },
  }
}
