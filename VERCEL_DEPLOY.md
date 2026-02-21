# Deploy on Vercel (keys stay hidden)

Your app is set up to deploy on Vercel. **Never put secrets in the repo** — use Vercel’s environment variables so keys stay hidden.

## 1. Connect the repo

- Go to [vercel.com](https://vercel.com) and sign in.
- **Add New** → **Project** and import your GitHub repo `Drag-and-Swap`.
- Leave build settings as detected (Vite); deploy.

## 2. Add environment variables (secrets stay on Vercel)

In the Vercel dashboard:

1. Open your project → **Settings** → **Environment Variables**.
2. Add each variable below. Use **Production** (and **Preview** if you want them in PR previews).
3. For sensitive values, leave **Value** as secret; they are encrypted and never shown in the UI or in the repo.

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_PRIVY_APP_ID` | Yes | Privy app ID (wallet auth) |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key (public key, but keep in env) |
| `VITE_QUICKNODE_RPC_URL` | For Uniswap | Ethereum RPC for quotes/price |
| `VITE_QUICKNODE_HYPERLIQUID_HTTP_URL` | For HL blocks | Hyperliquid HTTP endpoint |
| `VITE_QUICKNODE_HYPERLIQUID_WS_URL` | For HL streaming | Hyperliquid WebSocket endpoint |
| `VITE_QUICKNODE_HYPERLIQUID_INFO_URL` | Optional | Defaults to public API if unset |
| `VITE_DEBUG_INGEST_URL` | Optional | Debug log ingest |
| `VITE_DEBUG_SESSION_ID` | Optional | Debug session id |

Names must match exactly (including `VITE_` prefix) so Vite injects them at build time.

## 3. Redeploy after adding variables

After adding or changing env vars, trigger a new deploy: **Deployments** → **⋯** on latest → **Redeploy**.

---

- `.env` and `.env.local` are in `.gitignore` — never commit them.
- Use `.env.example` as a checklist; it contains no real values.
