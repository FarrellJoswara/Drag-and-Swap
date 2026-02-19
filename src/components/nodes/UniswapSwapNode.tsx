import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ArrowLeftRight, ChevronDown, Zap } from 'lucide-react'
import { useState } from 'react'
import NodeShell from '../ui/NodeShell'

export type UniswapSwapData = {
  fromToken?: string
  toToken?: string
  slippage?: string
}

const TOKENS = ['ETH', 'USDC', 'USDT', 'WBTC', 'ARB', 'OP', 'DAI', 'LINK']

export default function UniswapSwapNode({ data, selected }: NodeProps) {
  const nodeData = data as UniswapSwapData
  const [fromToken, setFromToken] = useState(nodeData.fromToken ?? 'ETH')
  const [toToken, setToToken] = useState(nodeData.toToken ?? 'USDC')
  const [slippage, setSlippage] = useState(nodeData.slippage ?? '0.5')

  const handleFlip = () => {
    const temp = fromToken
    setFromToken(toToken)
    setToToken(temp)
  }

  return (
    <NodeShell
      selected={selected}
      label="Uniswap Swap"
      icon={<Zap size={14} className="text-emerald-400" />}
      category="action"
      badge="ACTION"
      badgeColor="emerald"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-1.5">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">From</label>
            <div className="relative">
              <select
                value={fromToken}
                onChange={(e) => setFromToken(e.target.value)}
                className="nodrag w-full appearance-none bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all cursor-pointer"
              >
                {TOKENS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>

          <button
            onClick={handleFlip}
            className="nodrag mb-0.5 p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-slate-400 hover:text-emerald-400 transition-all flex-shrink-0"
            title="Flip tokens"
          >
            <ArrowLeftRight size={11} />
          </button>

          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">To</label>
            <div className="relative">
              <select
                value={toToken}
                onChange={(e) => setToToken(e.target.value)}
                className="nodrag w-full appearance-none bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all cursor-pointer"
              >
                {TOKENS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Max Slippage</label>
          <div className="relative flex items-center">
            <input
              type="number"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              step="0.1"
              min="0.1"
              max="50"
              className="nodrag w-full bg-slate-900 border border-slate-700 rounded-md pl-3 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
            />
            <span className="absolute right-2.5 text-slate-500 text-xs">%</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 pt-0.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-slate-500">Routes via Uniswap V3</span>
        </div>
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </NodeShell>
  )
}
