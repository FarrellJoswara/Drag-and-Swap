#!/usr/bin/env node
/**
 * One-time setup: generate a P-256 keypair for Privy app authorization (trade on my behalf).
 * Writes:
 *   - public.pem (paste into Privy Dashboard → Authorization keys → Register key quorum)
 *   - .privy-auth-key.base64 (value for PRIVY_AUTH_PRIVATE_KEY in Vercel / server env)
 * Both paths are in .gitignore. Run from repo root: node scripts/generate-privy-auth-key.mjs
 */

import { generateP256KeyPair } from '@privy-io/node'
import { writeFileSync } from 'fs'
import { join } from 'node:path'

const keypair = await generateP256KeyPair()
const cwd = process.cwd()

// Public key as PEM (for Privy Dashboard)
const b64 = keypair.publicKey
const lines = []
for (let i = 0; i < b64.length; i += 64) {
  lines.push(b64.slice(i, i + 64))
}
const publicPem = `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----\n`
writeFileSync(join(cwd, 'public.pem'), publicPem, 'utf8')

// Private key as base64 (for PRIVY_AUTH_PRIVATE_KEY)
writeFileSync(join(cwd, '.privy-auth-key.base64'), keypair.privateKey, 'utf8')

console.log('Generated keypair (files are in .gitignore):')
console.log('  - public.pem')
console.log('  - .privy-auth-key.base64')
console.log('')
console.log('Next steps:')
console.log('  1. Open https://dashboard.privy.io → your app → Authorization keys → New key → Register key quorum instead')
console.log('  2. Paste the contents of public.pem into the Public keys field. Set Authorization threshold to 1, name the quorum, save.')
console.log('  3. Copy the key quorum ID and set VITE_PRIVY_KEY_QUORUM_ID in .env.local')
console.log('  4. For server swap (no popup): set PRIVY_AUTH_PRIVATE_KEY in Vercel (or server env) to the contents of .privy-auth-key.base64')
console.log('  5. Delete .privy-auth-key.base64 after copying to Vercel (keep it secret).')
