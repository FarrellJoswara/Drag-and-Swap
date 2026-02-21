# Drag-and-Swap

A visual agent builder for crypto and trading. Build flows by dragging blocks onto a canvas, connecting them, and running agents that react to triggers (Hyperliquid streams, Telegram, timers) and execute actions (swaps, notifications, etc.).

## Overview

- **Visual flow editor** — React Flow canvas with drag-and-drop blocks
- **Triggers** — Hyperliquid streams, Telegram messages, time loops, webhooks
- **Actions** — Uniswap swaps, Telegram/Discord notifications, wallet balance checks
- **Logic** — Comparators, delays, math, filters, rate limiting

## Uniswap

Swaps use the [Uniswap Trading API](https://trade-api.gateway.uniswap.org/v1):

- **Quote + Swap** — Get a quote, then execute via the connected wallet (Privy)
- **Chains** — Ethereum, Base, Arbitrum, Optimism, Polygon
- **Server signer** — Optional "trade on my behalf" via Privy key quorum; runs swaps without a wallet popup when the user has approved the app (`/api/execute-swap-on-behalf`)

Requires `VITE_QUICKNODE_RPC_URL` for quotes and token price.

## QuickNode Hypercore Streaming

Hyperliquid blocks use [QuickNode Hypercore](https://www.quicknode.com/) for real-time WebSocket streaming:

- **Stream types** — Trades, orders, book updates, TWAP, events, writer actions
- **Filters** — By coin, side, user, liquidation, etc.
- **Standalone triggers** — Order fill alert, liquidation alert, TWAP fill notifier, Filter by user — each subscribes directly; no separate Hyperliquid Stream block needed

Requires `VITE_QUICKNODE_HYPERLIQUID_WS_URL` (and optionally `VITE_QUICKNODE_HYPERLIQUID_HTTP_URL` for historical/info). The WSS URL is normalized to `/hypercore/ws` for QuickNode endpoints.

## Other Features

- **Telegram** — Get Telegram (message trigger) and Send Telegram; uses server proxy on Vercel or Vite plugin locally
- **Privy** — Wallet auth; optional server signer for gasless/automatic swaps
- **Deployment** — Vercel; live at [drag-and-swap.vercel.app](https://drag-and-swap.vercel.app)

## Setup

1. Copy `.env.example` to `.env.local`
2. Set `VITE_PRIVY_APP_ID` (required for wallet)
3. For Uniswap: `VITE_QUICKNODE_RPC_URL`
4. For Hyperliquid: `VITE_QUICKNODE_HYPERLIQUID_WS_URL`
5. For Telegram: `VITE_TELEGRAM_BOT_TOKEN`

```bash
npm install
npm run dev
```

## Scripts


| Script                       | Description                                          |
| ---------------------------- | ---------------------------------------------------- |
| `npm run dev`                | Start Vite dev server (Telegram API proxied locally) |
| `npm run dev:full`           | Vercel dev (full serverless API)                     |
| `npm run build`              | TypeScript + Vite build                              |
| `npm run setup:privy-quorum` | Register key quorum for server signer                |


## Screenshots

See the `[screenshots/](./screenshots/)` directory.

## License

MIT — see [LICENSE](./LICENSE).