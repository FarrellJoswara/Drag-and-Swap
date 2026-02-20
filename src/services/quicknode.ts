const QUICKNODE_RPC =
  (import.meta.env.VITE_QUICKNODE_RPC_URL as string | undefined) ?? ''

async function rpc(method: string, params: unknown[] = []) {
  if (!QUICKNODE_RPC) throw new Error('VITE_QUICKNODE_RPC_URL is not set in .env.local')

  const res = await fetch(QUICKNODE_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })

  const json = await res.json()
  if (json.error) throw new Error(json.error.message)
  return json.result
}

export async function getEthBalance(address: string): Promise<string> {
  const hex: string = await rpc('eth_getBalance', [address, 'latest'])
  const wei = BigInt(hex)
  return (Number(wei) / 1e18).toFixed(6)
}

export async function getGasPrice(): Promise<string> {
  const hex: string = await rpc('eth_gasPrice')
  const wei = BigInt(hex)
  return (Number(wei) / 1e9).toFixed(2)
}

export async function getTransactionCount(address: string): Promise<string> {
  const hex: string = await rpc('eth_getTransactionCount', [address, 'latest'])
  return String(parseInt(hex, 16))
}

// ─── Block-specific functions (stub: console.log + return outputs) ───

export async function watchWallet(inputs: Record<string, string>): Promise<{ txHash: string; value: string; from: string; to: string }> {
  console.log('watchWallet')
  return { txHash: '', value: '', from: inputs.walletAddress ?? '', to: '' }
}

export async function ethBalance(_inputs: Record<string, string>): Promise<{ balance: string; balanceUsd: string }> {
  console.log('ethBalance')
  return { balance: '', balanceUsd: '' }
}

export async function txHistory(_inputs: Record<string, string>): Promise<{ transactions: string; count: string }> {
  console.log('txHistory')
  return { transactions: '[]', count: '' }
}

export async function gasGuard(_inputs: Record<string, string>): Promise<{ currentGas: string; passed: string }> {
  console.log('gasGuard')
  return { currentGas: '', passed: '' }
}
