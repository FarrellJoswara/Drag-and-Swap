import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Eye, Wallet } from 'lucide-react'
import { useState } from 'react'
import NodeShell from '../ui/NodeShell'

export type WhaleWatcherData = {
  walletAddress?: string
}

export default function WhaleWatcherNode({ data, selected }: NodeProps) {
  const nodeData = data as WhaleWatcherData
  const [address, setAddress] = useState(nodeData.walletAddress ?? '')

  return (
    <NodeShell
      selected={selected}
      label="Whale Watcher"
      icon={<Eye size={14} className="text-violet-400" />}
      category="trigger"
      badge="TRIGGER"
      badgeColor="violet"
    >
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
          Wallet Address
        </label>
        <div className="relative flex items-center">
          <Wallet size={12} className="absolute left-2.5 text-slate-500" />
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            className="nodrag w-full bg-slate-900 border border-slate-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all font-mono"
          />
        </div>
        <p className="text-[10px] text-slate-600">Fires when this wallet transacts {'>'} $50k</p>
      </div>
      <Handle type="source" position={Position.Right} />
    </NodeShell>
  )
}
