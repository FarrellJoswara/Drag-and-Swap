#!/usr/bin/env node
/**
 * Register the public key (from public.pem) as a key quorum in Privy and write
 * VITE_PRIVY_KEY_QUORUM_ID to .env.local. Requires PRIVY_APP_SECRET in .env.local.
 * Run from repo root: node scripts/register-privy-key-quorum.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const cwd = process.cwd()

function loadEnvLocal() {
  const path = join(cwd, '.env.local')
  try {
    const text = readFileSync(path, 'utf8')
    const out = {}
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
    return out
  } catch {
    return {}
  }
}

function appendEnvLocal(line) {
  const path = join(cwd, '.env.local')
  const content = readFileSync(path, 'utf8')
  if (content.includes('VITE_PRIVY_KEY_QUORUM_ID=')) return
  writeFileSync(path, content.trimEnd() + '\n' + line + '\n', 'utf8')
}

const env = loadEnvLocal()
const appId = env.VITE_PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID
const appSecret = env.PRIVY_APP_SECRET || process.env.PRIVY_APP_SECRET

if (!appId) {
  console.error('Missing VITE_PRIVY_APP_ID in .env.local')
  process.exit(1)
}
if (!appSecret) {
  console.error('Missing PRIVY_APP_SECRET. Add it to .env.local (get from Privy Dashboard → your app → App secret), then re-run.')
  process.exit(1)
}

const pemPath = join(cwd, 'public.pem')
let pem
try {
  pem = readFileSync(pemPath, 'utf8')
} catch (e) {
  console.error('Run npm run setup:privy-key first to generate public.pem')
  process.exit(1)
}

const base64 = pem
  .replace(/-----BEGIN PUBLIC KEY-----/, '')
  .replace(/-----END PUBLIC KEY-----/, '')
  .replace(/\s/g, '')

const res = await fetch('https://api.privy.io/v1/key_quorums', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'privy-app-id': appId,
    Authorization: 'Basic ' + Buffer.from(appId + ':' + appSecret).toString('base64'),
  },
  body: JSON.stringify({
    public_keys: [base64],
    authorization_threshold: 1,
    display_name: 'App signer',
  }),
})

if (!res.ok) {
  const t = await res.text()
  console.error('Privy API error:', res.status, t)
  process.exit(1)
}

const data = await res.json()
const quorumId = data.id
if (!quorumId) {
  console.error('No key quorum id in response:', data)
  process.exit(1)
}

appendEnvLocal('VITE_PRIVY_KEY_QUORUM_ID=' + quorumId)
console.log('Registered key quorum:', quorumId)
console.log('Appended VITE_PRIVY_KEY_QUORUM_ID to .env.local')
