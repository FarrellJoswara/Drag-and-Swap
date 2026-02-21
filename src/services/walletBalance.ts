/**
 * Wallet balance: native (ETH) or ERC20 via public RPC.
 * Used by the Get wallet balance block; wallet address can be injected from RunContext when empty.
 */

const DEFAULT_RPC: Record<number, string> = {
  1: 'https://eth.llamarpc.com',
  8453: 'https://mainnet.base.org',
  42161: 'https://arb1.arbitrum.io/rpc',
  10: 'https://mainnet.optimism.io',
}

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const data = (await res.json()) as { result?: unknown; error?: { message?: string } }
  if (data.error) throw new Error(data.error.message ?? 'RPC error')
  return data.result
}

/** Pad address to 32 bytes for ABI encoding (without 0x prefix, 64 hex chars). */
function padAddress(addr: string): string {
  const a = addr.startsWith('0x') ? addr.slice(2) : addr
  return a.padStart(64, '0').toLowerCase()
}

/** ERC20 balanceOf(address) selector + padded address. */
function balanceOfCalldata(address: string): string {
  return '0x70a08231' + padAddress(address)
}

/**
 * Fetch native or ERC20 balance. Inputs: wallet (address), token (optional, contract address for ERC20), chainId (default 1), rpcUrl (optional).
 * Outputs: balance (wei or raw units string), balanceFormatted (for native: ether string; for ERC20 optional).
 */
export async function getWalletBalance(inputs: Record<string, string>): Promise<Record<string, string>> {
  const wallet = (inputs.wallet ?? '').trim()
  const token = (inputs.token ?? '').trim()
  const chainId = Math.max(1, parseInt(String(inputs.chainId ?? '1'), 10) || 1)
  const rpcUrl = (inputs.rpcUrl ?? '').trim() || (DEFAULT_RPC[chainId] ?? DEFAULT_RPC[1])

  if (!wallet) {
    return { balance: '0', balanceFormatted: '0' }
  }

  if (!token) {
    const raw = (await rpc(rpcUrl, 'eth_getBalance', [wallet, 'latest'])) as string
    const wei = typeof raw === 'string' ? BigInt(raw) : BigInt(0)
    const ether = Number(wei) / 1e18
    return {
      balance: wei.toString(),
      balanceFormatted: ether.toFixed(6),
    }
  }

  const data = balanceOfCalldata(wallet)
  const raw = (await rpc(rpcUrl, 'eth_call', [{ to: token, data }, 'latest'])) as string
  const balance = typeof raw === 'string' && raw.startsWith('0x') ? BigInt(raw).toString() : '0'
  return { balance, balanceFormatted: balance }
}
