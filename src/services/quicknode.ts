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
