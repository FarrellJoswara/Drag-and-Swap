import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Bell, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import NodeShell from '../ui/NodeShell'

export type PriceAlertData = {
  token?: string
  amount?: string
  condition?: string
}

const TOKENS = ['ETH', 'USDC', 'WBTC', 'ARB', 'OP']
const CONDITIONS = ['above', 'below', 'crosses']

export default function PriceAlertNode({ data, selected }: NodeProps) {
  const nodeData = data as PriceAlertData
  const [token, setToken] = useState(nodeData.token ?? 'ETH')
  const [amount, setAmount] = useState(nodeData.amount ?? '')
  const [condition, setCondition] = useState(nodeData.condition ?? 'above')

  return (
    <NodeShell
      selected={selected}
      label="Price Alert"
      icon={<Bell size={14} className="text-amber-400" />}
      category="trigger"
      badge="TRIGGER"
      badgeColor="amber"
    >
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Token</label>
            <div className="relative">
              <select
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="nodrag w-full appearance-none bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all cursor-pointer"
              >
                {TOKENS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">When</label>
            <div className="relative">
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="nodrag w-full appearance-none bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all cursor-pointer"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Price (USD)</label>
          <div className="relative flex items-center">
            <span className="absolute left-2.5 text-slate-500 text-xs">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="3,500"
              className="nodrag w-full bg-slate-900 border border-slate-700 rounded-md pl-6 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all"
            />
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </NodeShell>
  )
}
